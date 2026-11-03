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

// Course files are stored as full links, written by whichever address the
// teacher was on. Whatever is stored, show the visitor the one they can reach.
export function doorFileLink(url: string, configured: string, hostname: string): string {
    const target = databaseUrl(configured, hostname);
    for (const origin of [configured, DOOR_DATABASE]) {
        if (origin && url?.startsWith(`${origin}/`)) return target + url.slice(origin.length);
    }
    return url;
}
