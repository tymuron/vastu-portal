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

const TEXT_SITE_RE = /(https?:\/\/|\/\/)?([a-z0-9-]+\.onrender\.com|(?:[a-z0-9-]+\.)?annaromeovastu\.com)/gi;

// Rewrites Anna's site addresses inside visible text (plain text from the DB and
// text between HTML tags). Preserves whether a scheme was written: bare hostnames
// stay bare (no https:// added), https?:// becomes https://, // stays //.
export function doorTextLinks(text, hostname) {
    if (!text) return text;
    const door = onDoor(hostname);
    return text.replace(TEXT_SITE_RE, (whole, scheme, rawHost, offset, str) => {
        const entry = ANNA_SITES_BY_HOST.get(rawHost.toLowerCase());
        if (!entry) return whole;

        const prev = offset > 0 ? str[offset - 1] : '';
        if (prev === ':') {
            if (offset >= 2 && /[a-z0-9+.-]/i.test(str[offset - 2])) return whole;
        } else if (scheme) {
            if (/[a-z0-9_.@/-]/i.test(prev)) return whole;
        } else if (/[a-z0-9_.@/=-]/i.test(prev)) {
            return whole;
        }

        const after = str.slice(offset + whole.length);
        if (/^[a-z0-9_-]|^\.[a-z0-9-]|^@|^:[0-9a-z/@]/i.test(after)) return whole;

        const targetHost = door ? entry.door : entry.public;
        const targetScheme = !scheme ? '' : scheme === '//' ? '//' : 'https://';
        return `${targetScheme}${targetHost}`;
    });
}

const HTML_TOKEN_RE = /<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</gi;
const HTML_ATTR_RE = /\b(href|src)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;

// Rewrites href, src and visible text inside rich-text HTML descriptions.
export function doorHtmlLinks(html, configured, hostname) {
    if (!html) return html;
    let rawTag = null;
    return html.replace(HTML_TOKEN_RE, (whole, closing, tagName, attrs, textNode) => {
        if (whole.startsWith('<!--')) return whole;
        if (tagName !== undefined) {
            const lower = tagName.toLowerCase();
            if (lower === 'script' || lower === 'style') {
                if (closing === '/') rawTag = null;
                else if (!/\/\s*$/.test(attrs)) rawTag = lower;
            }
            if (closing === '/') return whole;
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
            return nextAttrs === attrs ? whole : `<${closing}${tagName}${nextAttrs}>`;
        }
        if (textNode !== undefined) {
            return rawTag ? textNode : doorTextLinks(textNode, hostname);
        }
        return whole;
    });
}
