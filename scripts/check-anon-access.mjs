#!/usr/bin/env node
// ---------------------------------------------------------------------------
// What can anyone do with only the public anon key (it ships in the JS
// bundle)? Writes nothing:
//   - reads ask for zero rows and an exact count;
//   - inserts send title = null, so they stop either at RLS (42501: blocked)
//     or at the NOT NULL constraint (23502: RLS let anon in);
//   - the upload probe only asks Storage to sign an upload URL, which tests
//     the insert permission inside a rolled-back transaction.
// Prints codes and counts only, never row data or file names.
//
//   node scripts/check-anon-access.mjs
//
// URL and anon key come from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in
// the environment, else from .env.example (the production project).
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = fs.readFileSync(path.join(repo, '.env.example'), 'utf8');
const fromExample = (k) => example.match(new RegExp(`^${k}=(\\S+)`, 'm'))?.[1];
const URL_ = process.env.VITE_SUPABASE_URL || fromExample('VITE_SUPABASE_URL');
const ANON = process.env.VITE_SUPABASE_ANON_KEY || fromExample('VITE_SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };

async function call(method, url, body, extra = {}) {
    const r = await fetch(url, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, range: r.headers.get('content-range') };
}

let open = 0;
const line = (what, ok, detail) => {
    if (!ok) open += 1;
    console.log(`${ok ? 'ok      ' : 'OPEN    '} ${what.padEnd(40)} ${detail}`);
};

console.log(`project ${URL_}\n`);
for (const t of ['purchases', 'lava_invoices', 'profiles', 'user_entitlements', 'courses', 'course_offers',
    'weeks', 'days', 'materials', 'live_streams', 'library_items', 'homework_submissions']) {
    const r = await call('GET', `${URL_}/rest/v1/${t}?select=*&limit=0`, undefined, { Prefer: 'count=exact' });
    const n = Number((r.range || '').split('/')[1]);
    line(`read ${t}`, r.status >= 400 || n === 0, `HTTP ${r.status}, rows visible: ${Number.isNaN(n) ? '-' : n}`);
}
// A NOT NULL column per table, sent as null.
const NOT_NULL = {
    weeks: 'title', days: 'title', materials: 'title', live_streams: 'title', library_items: 'title',
    courses: 'slug', course_offers: 'lava_offer_id', user_entitlements: 'user_id',
};
for (const [t, col] of Object.entries(NOT_NULL)) {
    const r = await call('POST', `${URL_}/rest/v1/${t}`, { [col]: null }, { Prefer: 'return=minimal' });
    const code = r.json?.code;
    if (code === '42501') line(`insert ${t}`, true, `HTTP ${r.status} 42501 (RLS blocked)`);
    else if (code === '23502' || code === '23514') line(`insert ${t}`, false, `HTTP ${r.status} ${code} (passed RLS, stopped by a constraint)`);
    else line(`insert ${t}`, false, `HTTP ${r.status} ${code || ''} (inconclusive: ${String(r.json?.message || '').slice(0, 60)})`);
}
for (const b of ['course-content', 'library_files', 'stream_audio', 'homework_files']) {
    const r = await call('POST', `${URL_}/storage/v1/object/list/${b}`, { prefix: '', limit: 5, offset: 0 });
    const n = Array.isArray(r.json) ? r.json.length : 0;
    line(`list bucket ${b}`, n === 0, `HTTP ${r.status}, entries visible: ${n}`);
}
const s = await call('POST', `${URL_}/storage/v1/object/upload/sign/course-content/_anon-probe/${Date.now()}.txt`, {});
line('upload to course-content', !s.json?.url, `HTTP ${s.status} ${s.json?.url ? '(anon may upload)' : '(refused)'}`);

console.log(`\n${open ? `${open} open` : 'nothing open'} to the anon key`);
process.exit(open ? 1 : 0);
