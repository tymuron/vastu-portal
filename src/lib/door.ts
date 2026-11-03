// The Russian door. Since about 31 Oct 2026 most Russian home internet times out
// on Render, so visitors in Russia reach the platform another way (repo anna-front):
//   lk-ru.annaromeovastu.com  a server in Moscow that passes traffic through to Render
//                             and Supabase. Supabase sits behind Cloudflare, and Russian
//                             providers are reported to cut Cloudflare after 16 KB, so
//                             the database and course files go through Moscow as well.
//   lk.annaromeovastu.com     a Cloudflare Worker that does the same, for visitors whose
//                             connection has just passed a big test page through Cloudflare,
//                             so Supabase is fine to reach directly.
// A visitor on the old onrender.com address sees no change.
//
// No imports: test/door.test.mjs loads this file straight into Node.

const DOOR_DATABASE = 'https://sb.annaromeovastu.com';

export function onDoor(hostname: string): boolean {
    return hostname.endsWith('-ru.annaromeovastu.com');
}

export function databaseUrl(configured: string, hostname: string): string {
    return onDoor(hostname) ? DOOR_DATABASE : configured;
}

// Course 1's presentations live on lovable.app, which Russian home internet can't
// reach either (3 of 20 connections, 3 Nov 2026). The Moscow server has a door for
// each of these, so a new one goes in anna-front's Caddyfile as well.
const LESSON_SITES = new Set([
    'urokodin', 'urokdva', 'uroktri', 'urok4', 'urok4-1', 'urok4-2', 'urok4-3', 'urok4-4',
    'urok5', 'urok6', 'urok7-8', 'sever', 'artvastu', 'vastukarta', 'vhody',
]);

// Course files are stored as full links, written by whichever address the
// teacher was on. Whatever is stored, show the visitor the one they can reach.
export function doorFileLink(url: string, configured: string, hostname: string): string {
    const lesson = url?.match(/^https:\/\/([a-z0-9-]+)\.lovable\.app([/?#].*)?$/);
    if (lesson && LESSON_SITES.has(lesson[1])) {
        if (onDoor(hostname)) return `https://${lesson[1]}-ru.annaromeovastu.com${lesson[2] || ''}`;
        if (hostname === 'lk.annaromeovastu.com') return `https://${lesson[1]}.annaromeovastu.com${lesson[2] || ''}`;
    }
    const target = databaseUrl(configured, hostname);
    for (const origin of [configured, DOOR_DATABASE]) {
        if (origin && url?.startsWith(`${origin}/`)) return target + url.slice(origin.length);
    }
    return url;
}
