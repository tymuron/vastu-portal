// ---------------------------------------------------------------------------
// Rate limits for the public endpoints that send something on a stranger's
// word: the "send me my link" email (/api/access/request) and the monobank
// request pushed to a phone (/api/mono/order).
//
// Per sender and per target (address / phone), as before. Totals across
// everyone are only counted, to alert Tymur: they never turn anyone away —
// the audience taps «прислать ссылку» more than once, and orders come in
// waves after a webinar.
// ---------------------------------------------------------------------------

// Who is asking. Render's edge is Cloudflare, which sets CF-Connecting-IP
// itself and overwrites whatever the client sent. X-Forwarded-For is only
// appended to on the way in, so its first entry is whatever the client wrote:
// used only when there is nothing better (local runs, tests).
export function clientIp(req) {
    const cf = String(req.headers['cf-connecting-ip'] || '').trim();
    if (cf) return cf;
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.socket?.remoteAddress || '';
}

// Sliding-window counters. Expired hits age out key by key; the table is never
// wiped wholesale (that used to let a flood of junk keys reset every address's
// counter). If it ever fills up with live keys, hits on new keys go through
// uncounted and onFull is called: refusing them would turn people away.
export function createRateLimiter({ maxKeys = 50000, now = () => Date.now(), onFull = () => {} } = {}) {
    const table = new Map(); // key -> { windowMs, times: ascending ms }

    function live(entry, t) {
        while (entry.times.length && t - entry.times[0] >= entry.windowMs) entry.times.shift();
        return entry.times.length;
    }

    function prune(t) {
        for (const [key, entry] of table) {
            if (!live(entry, t)) table.delete(key);
        }
    }

    function room(t, keys) {
        const fresh = keys.filter((key) => !table.has(key)).length;
        if (table.size + fresh <= maxKeys) return true;
        prune(t);
        if (table.size + fresh <= maxKeys) return true;
        onFull();
        return false;
    }

    function record(key, windowMs, t) {
        const entry = table.get(key) || { windowMs, times: [] };
        live(entry, t);
        entry.times.push(t);
        table.set(key, entry);
        return entry.times.length;
    }

    // rules: [[key, max, windowMs], ...]. Counts one hit on every rule and
    // returns null, or counts nothing and returns the key of the first rule
    // that is full.
    function take(rules) {
        const t = now();
        for (const [key, max] of rules) {
            const entry = table.get(key);
            if (entry && live(entry, t) >= max) return key;
        }
        if (room(t, rules.map(([key]) => key))) {
            for (const [key, , windowMs] of rules) record(key, windowMs, t);
        }
        return null;
    }

    // Counts one hit and returns how many the window now holds. Never refuses:
    // for totals that should alert, not block.
    function count(key, windowMs) {
        const t = now();
        return room(t, [key]) ? record(key, windowMs, t) : 0;
    }

    return { take, count, size: () => table.size };
}
