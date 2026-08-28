/**
 * Session storage that actually survives on locked-down machines.
 *
 * Why this exists: students keep reporting "I log in, it lets me in for a
 * second, then throws me back to the login page" — always on one specific
 * laptop, in *every* browser on it (Edge, Chrome, Opera), while the same
 * account works fine on their phone. "All browsers on one machine" is never a
 * browser bug: it's the machine. The usual culprits are a security suite
 * (HP Wolf, Kaspersky, Norton, corporate policy) or a "clear site data on
 * exit" setting that makes localStorage writes silently disappear.
 *
 * Supabase keeps the session in localStorage. If localStorage silently drops
 * writes, the session is gone by the next render — which is exactly the
 * "kicked out one second after login" symptom.
 *
 * Two things matter here:
 *
 * 1. A write-only probe is not enough. Blockers rarely throw — they accept
 *    setItem() and hand back nothing on getItem(). So every tier is verified
 *    by writing a value AND reading it back.
 * 2. There has to be somewhere else to go. We degrade
 *    localStorage -> sessionStorage -> cookie -> memory instead of failing,
 *    so the session survives as long as the machine allows.
 */

export type StorageTier = 'localStorage' | 'sessionStorage' | 'cookie' | 'memory';

const PROBE_KEY = '__vastu_storage_probe__';

/**
 * Write, read back, delete. The read-back is the whole point: a storage that
 * accepts writes and returns null is worse than one that throws, because it
 * looks like it works.
 */
function isUsable(factory: () => Storage | null): boolean {
    try {
        const store = factory();
        if (!store) return false;
        const value = `probe-${Date.now()}`;
        store.setItem(PROBE_KEY, value);
        const readBack = store.getItem(PROBE_KEY);
        store.removeItem(PROBE_KEY);
        return readBack === value;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ cookies */

// Chrome/Firefox cap a single cookie at ~4096 bytes including name and
// attributes. A Supabase session (JWT + refresh token + user object) routinely
// exceeds that, so values are split across `<key>.0`, `<key>.1`, ... the same
// way @supabase/ssr does it.
const COOKIE_CHUNK_SIZE = 3000;
const MAX_COOKIE_CHUNKS = 12;

function cookieAttributes(): string {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    // One year: the refresh token outlives the access token by a lot, and a
    // session cookie would defeat the point of surviving a browser restart.
    return `; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

function readRawCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const prefix = `${encodeURIComponent(name)}=`;
    for (const part of document.cookie.split('; ')) {
        if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
    }
    return null;
}

function writeRawCookie(name: string, value: string): void {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}${cookieAttributes()}`;
}

function deleteRawCookie(name: string): void {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

const cookieStorage: Storage = {
    getItem(key: string): string | null {
        const single = readRawCookie(key);
        if (single !== null) return single;

        // Chunked form. Stop at the first gap so a half-written value never
        // reads back as a truncated (and therefore corrupt) session.
        let out = '';
        for (let i = 0; i < MAX_COOKIE_CHUNKS; i++) {
            const chunk = readRawCookie(`${key}.${i}`);
            if (chunk === null) break;
            out += chunk;
        }
        return out.length ? out : null;
    },
    setItem(key: string, value: string): void {
        this.removeItem(key);
        if (value.length <= COOKIE_CHUNK_SIZE) {
            writeRawCookie(key, value);
            return;
        }
        for (let i = 0; i * COOKIE_CHUNK_SIZE < value.length; i++) {
            if (i >= MAX_COOKIE_CHUNKS) break;
            writeRawCookie(`${key}.${i}`, value.slice(i * COOKIE_CHUNK_SIZE, (i + 1) * COOKIE_CHUNK_SIZE));
        }
    },
    removeItem(key: string): void {
        deleteRawCookie(key);
        for (let i = 0; i < MAX_COOKIE_CHUNKS; i++) deleteRawCookie(`${key}.${i}`);
    },
    clear(): void { /* not used by Supabase */ },
    key(): string | null { return null; },
    get length(): number { return 0; },
} as Storage;

/* ------------------------------------------------------------------- memory */

function createMemoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        setItem: (k: string, v: string) => { map.set(k, v); },
        removeItem: (k: string) => { map.delete(k); },
        clear: () => { map.clear(); },
        key: (i: number) => Array.from(map.keys())[i] ?? null,
        get length() { return map.size; },
    } as Storage;
}

/* ------------------------------------------------------------------ picking */

let resolved: { tier: StorageTier; storage: Storage } | null = null;

function resolveStorage(): { tier: StorageTier; storage: Storage } {
    if (resolved) return resolved;

    if (isUsable(() => window.localStorage)) {
        resolved = { tier: 'localStorage', storage: window.localStorage };
    } else if (isUsable(() => window.sessionStorage)) {
        // Survives navigation and reloads within the tab, but not a restart.
        // Good enough to stop the mid-session bounce back to /login.
        resolved = { tier: 'sessionStorage', storage: window.sessionStorage };
    } else if (isUsable(() => cookieStorage)) {
        resolved = { tier: 'cookie', storage: cookieStorage };
    } else {
        // Nothing persists. The app still works for as long as the tab lives;
        // AuthContext surfaces this so the user gets an explanation instead of
        // an unexplained bounce.
        resolved = { tier: 'memory', storage: createMemoryStorage() };
    }

    if (resolved.tier !== 'localStorage') {
        console.warn(`[auth] localStorage unavailable — session stored in ${resolved.tier}`);
    }
    return resolved;
}

/** Which tier we actually landed on. Used by the login-page diagnostics. */
export function getStorageTier(): StorageTier {
    return resolveStorage().tier;
}

/** True when the session cannot outlive the current tab. */
export function isStorageEphemeral(): boolean {
    const tier = getStorageTier();
    return tier === 'memory' || tier === 'sessionStorage';
}

/**
 * The adapter handed to createClient(). Resolution is lazy so a browser that
 * throws merely on *touching* window.localStorage can't break module load.
 */
export const resilientAuthStorage = {
    getItem: (key: string) => resolveStorage().storage.getItem(key),
    setItem: (key: string, value: string) => resolveStorage().storage.setItem(key, value),
    removeItem: (key: string) => resolveStorage().storage.removeItem(key),
};

/** localStorage-or-nothing helpers for non-critical prefs (active course id). */
export const safeLocalStorage = {
    getItem(key: string): string | null {
        try { return resolveStorage().storage.getItem(key); } catch { return null; }
    },
    setItem(key: string, value: string): void {
        try { resolveStorage().storage.setItem(key, value); } catch { /* ignore */ }
    },
    removeItem(key: string): void {
        try { resolveStorage().storage.removeItem(key); } catch { /* ignore */ }
    },
};
