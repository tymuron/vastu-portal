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
// Only .js imports with explicit extensions: test/door.test.mjs loads this file
// straight into Node, and lessonNotify.js shares the same plain .js module.

export {
    databaseUrl,
    doorFileLink,
    doorHtmlLinks,
    doorSrcLink,
    doorTextLinks,
    onDoor,
} from './siteLinks.js';
