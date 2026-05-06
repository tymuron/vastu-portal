import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

export default function UpdatePasswordPage() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(true);
    const [hasSession, setHasSession] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let resolved = false;

        const finish = (ok: boolean) => {
            if (cancelled || resolved) return;
            resolved = true;
            setHasSession(ok);
            setVerifying(false);
        };

        async function establishSession() {
            // Establish a session from whatever Supabase put in the URL.
            // We try every known shape so the same page works for invite,
            // password recovery, and OAuth-style callbacks, in any browser
            // (including in-app browsers like Gmail, where Supabase's
            // automatic detectSessionInUrl can be unreliable because of
            // strict storage/cookie rules).

            try {
                const url = new URL(window.location.href);
                const queryParams = url.searchParams;

                // Supabase may also pack tokens into a fragment (#...).
                const hashParams = new URLSearchParams(
                    window.location.hash.startsWith('#')
                        ? window.location.hash.slice(1)
                        : ''
                );

                // 1) PKCE flow: ?code=... -> exchange for a session
                const code = queryParams.get('code');
                if (code) {
                    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
                    if (!error && data?.session) {
                        // Strip ?code= from the URL so a refresh doesn't re-run the exchange
                        url.searchParams.delete('code');
                        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
                        return finish(true);
                    }
                    if (error) console.warn('exchangeCodeForSession:', error.message);
                }

                // 2) Token-hash flow (also known as "verify OTP"):
                //    /update-password?token_hash=...&type=invite
                const tokenHash = queryParams.get('token_hash') || hashParams.get('token_hash');
                const otpType = (queryParams.get('type') || hashParams.get('type')) as
                    | 'invite' | 'recovery' | 'magiclink' | 'signup' | 'email_change' | null;
                if (tokenHash && otpType) {
                    const { data, error } = await supabase.auth.verifyOtp({
                        type: otpType as any,
                        token_hash: tokenHash,
                    });
                    if (!error && data?.session) {
                        url.searchParams.delete('token_hash');
                        url.searchParams.delete('type');
                        window.history.replaceState({}, '', url.pathname + url.search);
                        return finish(true);
                    }
                    if (error) console.warn('verifyOtp:', error.message);
                }

                // 3) Implicit flow: #access_token=...&refresh_token=...
                const accessToken = hashParams.get('access_token');
                const refreshToken = hashParams.get('refresh_token');
                if (accessToken && refreshToken) {
                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                    if (!error && data?.session) {
                        // Clean the hash off the URL
                        window.history.replaceState({}, '', url.pathname + url.search);
                        return finish(true);
                    }
                    if (error) console.warn('setSession:', error.message);
                }

                // 4) Fallback: maybe a session is already in storage (the
                //    user reopened the tab or clicked back in to change
                //    their password while still logged in).
                const { data: { session } } = await supabase.auth.getSession();
                if (session) return finish(true);

                // 5) Last resort: wait briefly for Supabase's own auto-detect
                //    in case the SDK is parsing things on its own.
                window.setTimeout(async () => {
                    if (resolved || cancelled) return;
                    const { data: { session: late } } = await supabase.auth.getSession();
                    finish(!!late);
                }, 1500);
            } catch (err) {
                console.error('establishSession error:', err);
                finish(false);
            }
        }

        establishSession();

        // Pick up any auth event that fires while we're working
        // (e.g. SDK auto-detect that beats us to it).
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (resolved || cancelled) return;
            if (session && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION')) {
                finish(true);
            }
        });

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
        };
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.updateUser({ password: password });
            if (error) throw error;

            navigate('/welcome');
        } catch (err: any) {
            setError(err.message || 'Ошибка обновления пароля. Возможно, ссылка устарела.');
        } finally {
            setLoading(false);
        }
    };

    if (verifying) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-vastu-dark">
                <Loader2 className="animate-spin text-vastu-gold" size={40} />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-vastu-dark relative overflow-hidden">
            {/* Background decorative elements */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-vastu-gold blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-vastu-gold blur-[100px]" />
            </div>

            <div className="w-full max-w-md p-8 bg-vastu-light/5 backdrop-blur-sm border border-vastu-gold/20 rounded-2xl shadow-2xl relative z-10">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-serif text-vastu-gold mb-2">
                        {hasSession ? 'Новый пароль' : 'Ссылка недействительна'}
                    </h1>
                    <p className="text-vastu-light/60 font-light tracking-widest text-sm uppercase">
                        {hasSession ? 'Придумайте новый пароль' : 'Запросите новую ссылку'}
                    </p>
                </div>

                {!hasSession ? (
                    <div className="text-center space-y-4">
                        <p className="text-vastu-light/80 text-sm leading-relaxed">
                            Похоже, ссылка устарела или уже была использована. Попробуйте войти, либо запросите новую ссылку через «Забыли пароль».
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transition-all"
                        >
                            На страницу входа
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleUpdate} className="space-y-6">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Новый пароль</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Обновление...' : 'Сохранить пароль'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
