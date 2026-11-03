// The Russian door. Since about 31 Oct 2026 most Russian home internet times out
// on Render, so lk.annaromeovastu.com is a server in Moscow that passes traffic
// through to Render and Supabase (repo anna-front). Supabase sits behind
// Cloudflare, and Russian providers cut Cloudflare traffic after the first 16 KB,
// so a visitor on the door reaches the database and the course files through the
// door as well. A visitor on the old onrender.com address sees no change.
//
// No imports: test/door.test.mjs loads this file straight into Node.

const DOOR_DATABASE = 'https://sb.annaromeovastu.com';

export function onDoor(hostname: string): boolean {
    return hostname.endsWith('.annaromeovastu.com');
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
    const lesson = onDoor(hostname) ? url?.match(/^https:\/\/([a-z0-9-]+)\.lovable\.app([/?#].*)?$/) : null;
    if (lesson && LESSON_SITES.has(lesson[1])) return `https://${lesson[1]}-ru.annaromeovastu.com${lesson[2] || ''}`;
    const target = databaseUrl(configured, hostname);
    for (const origin of [configured, DOOR_DATABASE]) {
        if (origin && url?.startsWith(`${origin}/`)) return target + url.slice(origin.length);
    }
    return url;
}
