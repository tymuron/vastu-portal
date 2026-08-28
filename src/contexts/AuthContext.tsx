import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserRole } from '../lib/types';
import { measureClockSkew } from '../lib/authDiagnostics';

/**
 * Why the user is looking at the login page.
 *  - null          they simply aren't logged in
 *  - 'session-lost' they WERE logged in a moment ago and the session vanished
 *                   underneath them. This is the "it threw me out" report, and
 *                   it needs an explanation rather than a blank login form.
 */
export type AuthIssue = 'session-lost' | null;

/**
 * Nothing may leave the app spinning forever. Both of these guard against a
 * request that never settles — a blocked endpoint (antivirus HTTPS scanning,
 * corporate proxy) returns neither a response nor an error, and the old code
 * left `loading` stuck at true, which renders as an eternal spinner.
 */
const AUTH_INIT_TIMEOUT_MS = 12_000;
const PROFILE_FETCH_TIMEOUT_MS = 10_000;

interface AuthContextType {
    user: User | null;
    session: Session | null;
    role: UserRole | null;
    loading: boolean;
    authIssue: AuthIssue;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    role: null,
    loading: true,
    authIssue: null,
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

function withTimeout<T>(work: PromiseLike<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        Promise.resolve(work).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);
    const [authIssue, setAuthIssue] = useState<AuthIssue>(null);

    // Did we ever hold a real session in this page load? Distinguishes "never
    // logged in" from "was logged in and got dropped".
    const hadSessionRef = useRef(false);
    // The user pressed "Выйти" — a SIGNED_OUT after this is expected, not a bug.
    const deliberateSignOutRef = useRef(false);
    // Guards against an old, slow profile lookup landing after a newer one.
    const profileRequestRef = useRef(0);
    // Which user we already have a role for, so a token refresh every hour
    // doesn't re-query the profile.
    const roleLoadedForRef = useRef<string | null>(null);

    // Release the loading state no matter what. Without this, any auth request
    // that never settles renders as a spinner the user can't get past.
    useEffect(() => {
        if (!loading) return;
        const timer = setTimeout(() => {
            console.warn('[auth] initialisation did not settle in time — showing the app anyway');
            setLoading(false);
        }, AUTH_INIT_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [loading]);

    useEffect(() => {
        // Learn how far this machine's clock is from the server's, once per load.
        // Everything that compares a server timestamp against local time (token
        // expiry, course access expiry) depends on knowing this.
        void measureClockSkew();

        // Check if we are using placeholder Supabase (dev mode without env vars)
        const isPlaceholder = (supabase as any).supabaseUrl?.includes('placeholder') ||
            (supabase as any).supabaseKey === 'placeholder';

        if (isPlaceholder) {
            console.log('Using mock auth for development');
            const mockUser: User = {
                id: 'mock-user-id',
                app_metadata: {},
                user_metadata: {
                    full_name: 'Анна Ромео',
                    avatar_url: null,
                },
                aud: 'authenticated',
                created_at: new Date().toISOString(),
            } as User;

            const mockSession: Session = {
                access_token: 'mock-token',
                refresh_token: 'mock-refresh-token',
                expires_in: 3600,
                token_type: 'bearer',
                user: mockUser,
            };

            setSession(mockSession);
            setUser(mockUser);
            setRole('student');
            setLoading(false);
            return;
        }

        let cancelled = false;

        const loadProfile = async (userId: string) => {
            const requestId = ++profileRequestRef.current;
            try {
                const { data, error } = await withTimeout(
                    supabase.from('profiles').select('*').eq('id', userId).single(),
                    PROFILE_FETCH_TIMEOUT_MS,
                    'profile lookup',
                );

                if (cancelled || requestId !== profileRequestRef.current) return;

                if (error) {
                    console.error('Error fetching role:', error);
                    setRole('student');
                } else {
                    // Role only. The old code also spread the whole profile row
                    // into user.user_metadata by mutating a stale closure — it
                    // never actually ran on a fresh page load, nothing reads
                    // those fields, and doing it properly would overwrite
                    // full_name / avatar_url (which the profile page writes to
                    // auth metadata, not to this row) with stale values.
                    setRole((data?.role as UserRole) || 'student');
                }
            } catch (err) {
                if (cancelled || requestId !== profileRequestRef.current) return;
                console.error('[auth] profile lookup failed', err);
                setRole('student');
            } finally {
                if (!cancelled && requestId === profileRequestRef.current) setLoading(false);
            }
        };

        const applySession = (nextSession: Session | null, event: AuthChangeEvent | 'INITIAL') => {
            if (cancelled) return;

            setSession(nextSession);
            setUser(nextSession?.user ?? null);

            if (nextSession?.user) {
                hadSessionRef.current = true;
                // Any earlier sign-out is history now; don't let a stale flag
                // mask the next genuine session loss.
                deliberateSignOutRef.current = false;
                setAuthIssue(null);

                if (roleLoadedForRef.current === nextSession.user.id) {
                    setLoading(false);
                } else {
                    roleLoadedForRef.current = nextSession.user.id;
                    void loadProfile(nextSession.user.id);
                }
                return;
            }

            setRole(null);
            setLoading(false);
            roleLoadedForRef.current = null;

            // A session that existed and then went away on its own is the bug
            // students describe as "it let me in for a second and threw me out".
            // Supabase drops the session like this when a token refresh comes
            // back with a non-retryable error — which on a healthy account
            // almost always means the machine, not the account: blocked site
            // data, or a system clock far enough off that every freshly issued
            // token already looks expired.
            if (hadSessionRef.current && !deliberateSignOutRef.current) {
                console.warn('[auth] session disappeared without a sign-out', { event });
                setAuthIssue('session-lost');
            }
            hadSessionRef.current = false;
            deliberateSignOutRef.current = false;
        };

        // 1. Check active session
        supabase.auth
            .getSession()
            .then(({ data: { session } }) => applySession(session, 'INITIAL'))
            .catch((err) => {
                // Never swallow this silently: a rejected getSession used to
                // leave `loading` true forever.
                console.error('[auth] getSession failed', err);
                if (!cancelled) setLoading(false);
            });

        // 2. Listen for changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, nextSession) => {
            // Supabase invokes these callbacks while holding its internal auth
            // lock and awaits whatever they return. Running the profile query
            // inline makes signInWithPassword() wait on it and can wedge the
            // auth client. Hopping out of the callback first is the documented
            // requirement.
            setTimeout(() => applySession(nextSession, event), 0);
        });

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        deliberateSignOutRef.current = true;
        try {
            await supabase.auth.signOut();
        } catch (err) {
            // A failed network call must not strand the user in a session they
            // asked to leave — clear locally either way.
            console.error('[auth] signOut failed', err);
        }
        setRole(null);
        setUser(null);
        setSession(null);
        setAuthIssue(null);
        roleLoadedForRef.current = null;
    };

    return (
        <AuthContext.Provider value={{ user, session, role, loading, authIssue, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}
