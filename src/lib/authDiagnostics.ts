/**
 * Why a login won't stick on *this particular machine*.
 *
 * Every cause below produces the same user-visible symptom — "it let me in for
 * a second and threw me back to the login page" — so the app has to tell them
 * apart itself. Otherwise every report is unactionable and the student is left
 * retrying the same thing in a fourth browser.
 *
 * Two machine-level causes account for nearly all of these reports:
 *
 *  1. Blocked site data. Handled in ./browserStorage — we fall back to another
 *     tier and report which one we ended up on.
 *
 *  2. A wrong system clock. This one is invisible to the user and worth
 *     spelling out. Supabase access tokens live one hour. supabase-js decides
 *     whether a token is expired by comparing the server-issued `expires_at`
 *     against the *local* clock (GoTrueClient: `expires_at * 1000 - Date.now()
 *     < EXPIRY_MARGIN_MS`). If the machine's clock runs more than an hour
 *     fast, every token it receives is already "expired" on arrival: the
 *     client refreshes, gets another token that is also already expired,
 *     refreshes again, and once the refresh-token rotation trips it drops the
 *     session and emits SIGNED_OUT. The user sees an instant logout. The phone
 *     and any auto-synced machine are unaffected, which is exactly why "it
 *     works on my phone" is such a common half of the report.
 */

import { getStorageTier, isStorageEphemeral, type StorageTier } from './browserStorage';

/** Above this the clock is worth mentioning to the user. */
export const SKEW_WARN_MS = 2 * 60 * 1000;

/**
 * Above this the clock *is* the bug: tokens are stale before they arrive.
 * Below the 1h token lifetime, with headroom for the 90s expiry margin.
 */
export const SKEW_FATAL_MS = 50 * 60 * 1000;

let skewMs: number | null = null;
let skewProbe: Promise<number | null> | null = null;

/**
 * Local clock minus server clock, in ms. Positive = this machine runs fast.
 *
 * Measured against our own origin (same-origin, so the `Date` response header
 * is readable) and corrected for round-trip latency. `Date` has one-second
 * granularity, so anything under a few seconds is noise — which is fine, since
 * only multi-minute skew matters here.
 */
export function measureClockSkew(): Promise<number | null> {
    if (skewProbe) return skewProbe;

    skewProbe = (async () => {
        try {
            const sentAt = Date.now();
            const res = await fetch(`/health?t=${sentAt}`, { cache: 'no-store' });
            const receivedAt = Date.now();

            const serverDate = res.headers.get('date');
            if (!serverDate) return null;

            const serverMs = Date.parse(serverDate);
            if (Number.isNaN(serverMs)) return null;

            // Midpoint of the request removes most of the round-trip bias.
            skewMs = (sentAt + receivedAt) / 2 - serverMs;
            return skewMs;
        } catch {
            // Offline, or the request was blocked. Nothing to report.
            return null;
        }
    })();

    return skewProbe;
}

/** Last measured skew, or null if we haven't measured (or couldn't). */
export function getClockSkewMs(): number | null {
    return skewMs;
}

/**
 * Server time as best we know it. Use instead of Date.now() when comparing
 * against timestamps that came from the server, so a wrong local clock can't
 * make valid data look expired.
 */
export function serverNow(): number {
    return Date.now() - (skewMs ?? 0);
}

export interface AuthEnvironment {
    storageTier: StorageTier;
    /** Session cannot outlive the tab (or, for 'memory', the next render). */
    storageEphemeral: boolean;
    clockSkewMs: number | null;
    cookiesEnabled: boolean;
    online: boolean;
}

export async function inspectAuthEnvironment(): Promise<AuthEnvironment> {
    const clockSkewMs = await measureClockSkew();
    return {
        storageTier: getStorageTier(),
        storageEphemeral: isStorageEphemeral(),
        clockSkewMs,
        cookiesEnabled: typeof navigator !== 'undefined' ? navigator.cookieEnabled : true,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
}

function formatDuration(ms: number): string {
    const totalMinutes = Math.round(Math.abs(ms) / 60000);
    if (totalMinutes < 60) return `${totalMinutes} мин`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

/**
 * A plain-Russian explanation of what's wrong with this machine, or null when
 * nothing is. Ordered by how likely each cause is to be *the* reason the
 * session won't stick.
 */
export function describeEnvironment(env: AuthEnvironment): string | null {
    if (env.clockSkewMs !== null && Math.abs(env.clockSkewMs) >= SKEW_FATAL_MS) {
        const direction = env.clockSkewMs > 0 ? 'спешат' : 'отстают';
        return `Часы на этом компьютере ${direction} на ${formatDuration(env.clockSkewMs)} относительно сервера. ` +
            `Из-за этого вход сбрасывается сразу после входа. Откройте Параметры → Время и язык → Дата и время, ` +
            `включите «Установить время автоматически» и нажмите «Синхронизировать сейчас», затем перезагрузите страницу.`;
    }

    if (env.storageTier === 'memory') {
        return `Браузер на этом компьютере не сохраняет данные сайта, поэтому вход не удерживается. ` +
            `Обычно это антивирус или расширение приватности. Разрешите файлы cookie и данные сайта для этого адреса ` +
            `(или добавьте его в исключения антивируса) и попробуйте снова.`;
    }

    if (env.storageTier === 'cookie' || env.storageTier === 'sessionStorage') {
        return `Браузер частично блокирует хранение данных сайта. Вход будет работать, но может сбрасываться ` +
            `после закрытия браузера. Разрешите файлы cookie и данные сайта для этого адреса, чтобы вход запомнился.`;
    }

    if (env.clockSkewMs !== null && Math.abs(env.clockSkewMs) >= SKEW_WARN_MS) {
        const direction = env.clockSkewMs > 0 ? 'спешат' : 'отстают';
        return `Часы на этом компьютере ${direction} на ${formatDuration(env.clockSkewMs)}. ` +
            `Это может сбрасывать вход — включите автоматическую установку времени в настройках Windows.`;
    }

    if (!env.cookiesEnabled) {
        return `В браузере отключены файлы cookie — вход не сможет сохраниться. Включите их для этого адреса.`;
    }

    return null;
}

/**
 * One-line technical summary. Shown under the error so a student can screenshot
 * it and send it over, instead of us guessing from "it doesn't work".
 */
export function supportSummary(env: AuthEnvironment): string {
    const skew = env.clockSkewMs === null ? 'n/a' : `${Math.round(env.clockSkewMs / 1000)}s`;
    return `storage=${env.storageTier} skew=${skew} cookies=${env.cookiesEnabled ? 'on' : 'off'} online=${env.online ? 'yes' : 'no'}`;
}
