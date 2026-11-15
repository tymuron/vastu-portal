// Shared rewriting of Anna's site links and course file links, used both by the
// browser bundle (src/lib/door.ts) and the Node server (lessonNotify.js).

export const DOOR_DATABASE = 'https://sb.annaromeovastu.com';

export function onDoor(hostname) {
    return String(hostname || '').endsWith('-ru.annaromeovastu.com');
}

export function databaseUrl(configured, hostname) {
    return onDoor(hostname) ? DOOR_DATABASE : configured;
}

// Anna's six own sites on Render (see repo anna-front, README "Addresses").
// Visitors on the Moscow door (*-ru.annaromeovastu.com) get the Moscow -ru
// addresses directly, avoiding Cloudflare on mobile-internet whitelist days;
// everyone else gets the public annaromeovastu.com addresses.
// The platform itself (vastu-portal-app.onrender.com / lk.annaromeovastu.com)
// is intentionally not in this table.
const ANNA_SITE_ENTRIES = [
    { render: 'annaromeo-vastu-karta.onrender.com', public: 'karta.annaromeovastu.com', door: 'karta-ru.annaromeovastu.com' },
    { render: 'annaromeo-vastu-course.onrender.com', public: 'kurs.annaromeovastu.com', door: 'kurs-ru.annaromeovastu.com' },
    { render: 'annaromeo-venus.onrender.com', public: 'venus.annaromeovastu.com', door: 'venus-ru.annaromeovastu.com' },
    { render: 'annaromeo-vastu-color-test.onrender.com', public: 'test.annaromeovastu.com', door: 'test-ru.annaromeovastu.com' },
    { render: 'vastu-business-landing.onrender.com', public: 'biz.annaromeovastu.com', door: 'biz-ru.annaromeovastu.com' },
    { render: 'annaromeo-vastu.onrender.com', public: 'annaromeovastu.com', door: 'www-ru.annaromeovastu.com' },
];

const ANNA_SITES_BY_HOST = new Map();
for (const site of ANNA_SITE_ENTRIES) {
    ANNA_SITES_BY_HOST.set(site.render, site);
    ANNA_SITES_BY_HOST.set(site.public, site);
}
ANNA_SITES_BY_HOST.set('www.annaromeovastu.com', {
    public: 'www.annaromeovastu.com',
    door: 'www-ru.annaromeovastu.com',
});

// Course 1's presentations live on lovable.app, which Russian home internet can't
// reach either (3 of 20 connections, 3 Nov 2026). The Moscow server has a door for
// each of these, so a new one goes in anna-front's Caddyfile as well.
const LESSON_SITES = new Set([
    'urokodin', 'urokdva', 'uroktri', 'urok4', 'urok4-1', 'urok4-2', 'urok4-3', 'urok4-4',
    'urok5', 'urok6', 'urok7-8', 'sever', 'artvastu', 'vastukarta', 'vhody',
]);

const URL_HOST_RE = /^(?:https?:\/\/|\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)([/?#].*)?$/i;

function matchAnnaSite(url) {
    const m = typeof url === 'string' ? URL_HOST_RE.exec(url) : null;
    const entry = m && ANNA_SITES_BY_HOST.get(m[1].toLowerCase());
    return entry ? { entry, rest: m[2] || '' } : null;
}

function rewriteStorageLink(url, configured, hostname) {
    if (configured) {
        const target = databaseUrl(configured, hostname);
        for (const origin of [configured, DOOR_DATABASE]) {
            if (origin && url?.startsWith(`${origin}/`)) return target + url.slice(origin.length);
        }
    }
    return url;
}

// Course files and Anna's sites for navigation (href, window.open, file save).
// Handles links with https://, http://, //host, or bare host/path.
export function doorFileLink(url, configured, hostname) {
    if (!url) return url;
    const site = matchAnnaSite(url);
    if (site) {
        const host = onDoor(hostname) ? site.entry.door : site.entry.public;
        return `https://${host}${site.rest}`;
    }

    const lesson = url.match(/^https:\/\/([a-z0-9-]+)\.lovable\.app([/?#].*)?$/);
    if (lesson && LESSON_SITES.has(lesson[1])) {
        if (onDoor(hostname)) return `https://${lesson[1]}-ru.annaromeovastu.com${lesson[2] || ''}`;
        if (hostname === 'lk.annaromeovastu.com') return `https://${lesson[1]}.annaromeovastu.com${lesson[2] || ''}`;
    }
    return rewriteStorageLink(url, configured, hostname);
}

// Embedded media and frames (src on <img>, <iframe>, <video>, <audio>, <source>):
// Anna's public router address answers with a chooser HTML page rather than an
// image, so src links to Anna's sites are rewritten ONLY for visitors on the
// Moscow door (to -ru, where Caddy supplies the router bypass cookie); everyone
// else gets the original src unchanged. Storage links have no chooser page.
export function doorSrcLink(url, configured, hostname) {
    if (!url) return url;
    const site = matchAnnaSite(url);
    if (site) {
        return onDoor(hostname) ? `https://${site.entry.door}${site.rest}` : url;
    }

    const lesson = url.match(/^https:\/\/([a-z0-9-]+)\.lovable\.app([/?#].*)?$/);
    if (lesson && LESSON_SITES.has(lesson[1])) {
        if (onDoor(hostname)) return `https://${lesson[1]}-ru.annaromeovastu.com${lesson[2] || ''}`;
        return url;
    }
    return rewriteStorageLink(url, configured, hostname);
}

const URL_CHUNK_RE = /[a-z0-9._~:/?#@!$&+=,;%-]+/gi;
const CHUNK_HOST_RE = /^(https?:\/\/|\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?=$|[/?#]|[.,;:!?]+$)/i;
const CYRILLIC_LETTER_RE = /[а-яё]/i;
const HTML_ENTITY_RE = /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi;
const SINGLE_URL_CHAR_RE = /^[a-z0-9._~:/?#@!$&+=,;%-]$/i;
const NAMED_URL_ENTITIES = {
    amp: '&',
    apos: "'",
    colon: ':',
    commat: '@',
    equals: '=',
    gt: '>',
    lt: '<',
    num: '#',
    period: '.',
    quest: '?',
    quot: '"',
    sol: '/',
};

function maskHtmlEntities(text) {
    if (!text.includes('&')) return text;
    return text.replace(HTML_ENTITY_RE, (whole, dec, hex, named) => {
        let ch = '';
        if (dec !== undefined) {
            const code = Number(dec);
            if (code > 0 && code <= 0x10ffff) ch = String.fromCodePoint(code);
        } else if (hex !== undefined) {
            const code = parseInt(hex, 16);
            if (code > 0 && code <= 0x10ffff) ch = String.fromCodePoint(code);
        } else if (named !== undefined) {
            ch = NAMED_URL_ENTITIES[named.toLowerCase()] || ' ';
        }
        const fill = ch.length === 1 && SINGLE_URL_CHAR_RE.test(ch) ? ch : ' ';
        return fill.repeat(whole.length);
    });
}

function findTextHostEdits(scanText, door) {
    const edits = [];
    URL_CHUNK_RE.lastIndex = 0;
    let chunkMatch;
    while ((chunkMatch = URL_CHUNK_RE.exec(scanText)) !== null) {
        const chunk = chunkMatch[0];
        const chunkStart = chunkMatch.index;
        if (chunkStart > 0 && CYRILLIC_LETTER_RE.test(scanText[chunkStart - 1])) continue;

        const hostMatch = CHUNK_HOST_RE.exec(chunk);
        if (!hostMatch) continue;

        const scheme = hostMatch[1] || '';
        const rawHost = hostMatch[2];
        const lowerHost = rawHost.toLowerCase();
        const entry = ANNA_SITES_BY_HOST.get(lowerHost);
        if (!entry) continue;

        const afterHost = chunk[scheme.length + rawHost.length];
        const chunkEnd = chunkStart + chunk.length;
        if (
            afterHost !== '/' &&
            afterHost !== '?' &&
            afterHost !== '#' &&
            chunkEnd < scanText.length &&
            CYRILLIC_LETTER_RE.test(scanText[chunkEnd])
        ) {
            continue;
        }

        const targetHost = door ? entry.door : entry.public;
        if (lowerHost === targetHost) continue;

        const hostStart = chunkStart + scheme.length;
        edits.push({ start: hostStart, end: hostStart + rawHost.length, text: targetHost });
    }
    return edits;
}

// Rewrites Anna's site addresses inside visible text (plain text from the DB and
// text inside HTML blocks). Leaves the text untouched when the target host is
// already written (preserving case and scheme), and replaces only the hostname
// when the address actually changes.
export function doorTextLinks(text, hostname) {
    if (!text) return text;
    const edits = findTextHostEdits(text, onDoor(hostname));
    if (!edits.length) return text;
    const parts = [];
    let pos = 0;
    for (const ed of edits) {
        if (ed.start > pos) parts.push(text.slice(pos, ed.start));
        parts.push(ed.text);
        pos = ed.end;
    }
    if (pos < text.length) parts.push(text.slice(pos));
    return parts.join('');
}

const INLINE_TAGS = new Set(['a', 'strong', 'em', 'u', 's', 'span', 'b', 'i']);
const HTML_TOKEN_RE = /<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9]*)\b((?:[^<>"'=]|=\s*(?:"[^"]*"|'[^']*')|=)*)>|<[^\s<>][^<>]*>|([^<]+)|</gi;
const HTML_FALLBACK_TAG_RE = /^<\/?([a-z][a-z0-9]*)\b/i;
const HTML_ATTR_RE = /\b(href|src)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;

// Rewrites href, src and visible text inside rich-text HTML descriptions.
// Inline formatting tags are treated as transparent so hostnames and neighbours
// split across tag boundaries are matched on the concatenated block text.
export function doorHtmlLinks(html, configured, hostname) {
    if (!html) return html;
    const door = onDoor(hostname);
    const result = [];
    let blockTokens = [];
    let blockTextParts = [];
    let blockLen = 0;
    let rawTag = null;

    const flushBlock = () => {
        if (!blockTokens.length) return;
        if (!blockLen) {
            for (const tok of blockTokens) result.push(tok.raw);
            blockTokens = [];
            return;
        }
        const blockText = blockTextParts.length === 1 ? blockTextParts[0] : blockTextParts.join('');
        const edits = findTextHostEdits(maskHtmlEntities(blockText), door);
        if (!edits.length) {
            for (const tok of blockTokens) result.push(tok.raw);
        } else {
            let ei = 0;
            for (const tok of blockTokens) {
                if (tok.type !== 'text') {
                    result.push(tok.raw);
                    continue;
                }
                while (ei < edits.length && edits[ei].end <= tok.start) ei += 1;
                if (ei >= edits.length || edits[ei].start >= tok.end) {
                    result.push(tok.raw);
                    continue;
                }
                let out = '';
                let pos = tok.start;
                while (ei < edits.length && edits[ei].start < tok.end) {
                    const ed = edits[ei];
                    if (ed.start > pos) out += tok.raw.slice(pos - tok.start, ed.start - tok.start);
                    if (ed.start >= tok.start) out += ed.text;
                    if (ed.end <= tok.end) {
                        pos = ed.end;
                        ei += 1;
                    } else {
                        pos = tok.end;
                        break;
                    }
                }
                if (pos < tok.end) out += tok.raw.slice(pos - tok.start);
                result.push(out);
            }
        }
        blockTokens = [];
        blockTextParts = [];
        blockLen = 0;
    };

    HTML_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = HTML_TOKEN_RE.exec(html)) !== null) {
        const [whole, closing, tagName, attrs, textNode] = m;
        if (whole.startsWith('<!--')) {
            if (rawTag) result.push(whole);
            else blockTokens.push({ type: 'raw', raw: whole });
            continue;
        }
        if (tagName !== undefined) {
            const lower = tagName.toLowerCase();
            if (rawTag) {
                if (closing === '/' && lower === rawTag) rawTag = null;
                result.push(whole);
                continue;
            }
            let rewrittenTag = whole;
            if (closing !== '/') {
                const nextAttrs = attrs.replace(HTML_ATTR_RE, (attrWhole, attr, eq, dq, sq, bare, attrOffset, attrStr) => {
                    if (attrOffset > 0 && /[a-z0-9_:-]/i.test(attrStr[attrOffset - 1])) return attrWhole;
                    const raw = dq ?? sq ?? bare ?? '';
                    const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : '';
                    const trimmed = raw.trim();
                    const rewritten = attr.toLowerCase() === 'src'
                        ? doorSrcLink(trimmed, configured, hostname)
                        : doorFileLink(trimmed, configured, hostname);
                    return rewritten === trimmed ? attrWhole : `${attr}${eq}${quote}${rewritten}${quote}`;
                });
                if (nextAttrs !== attrs) rewrittenTag = `<${closing}${tagName}${nextAttrs}>`;
            }
            if (lower === 'script' || lower === 'style') {
                flushBlock();
                if (closing !== '/' && !/\/\s*$/.test(attrs)) rawTag = lower;
                result.push(rewrittenTag);
            } else if (INLINE_TAGS.has(lower)) {
                blockTokens.push({ type: 'raw', raw: rewrittenTag });
            } else {
                flushBlock();
                result.push(rewrittenTag);
            }
            continue;
        }
        if (textNode === undefined && whole.length > 1) {
            // Fallback for tags the attribute grammar could not parse (e.g. unquoted apostrophe):
            // never treat <...> as visible text; return the tag unchanged.
            const fallbackName = HTML_FALLBACK_TAG_RE.exec(whole)?.[1]?.toLowerCase();
            if (rawTag) {
                if (whole.startsWith('</') && fallbackName === rawTag) rawTag = null;
                result.push(whole);
            } else if (fallbackName && INLINE_TAGS.has(fallbackName)) {
                blockTokens.push({ type: 'raw', raw: whole });
            } else {
                flushBlock();
                result.push(whole);
            }
            continue;
        }
        if (rawTag) {
            result.push(whole);
        } else {
            const start = blockLen;
            blockLen += whole.length;
            blockTextParts.push(whole);
            blockTokens.push({ type: 'text', raw: whole, start, end: blockLen });
        }
    }
    flushBlock();
    return result.join('');
}
