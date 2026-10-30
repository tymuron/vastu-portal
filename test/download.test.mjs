// Saving a course file (src/lib/download.ts, loaded straight into Node, which
// strips the types). The browser parts are stood in for by a tiny fake DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { saveFile, shareFile, sharesFiles, storageDownloadUrl } from '../src/lib/download.ts';

const STORAGE = 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/library_files';
const downloadParam = (url) => new URL(url).searchParams.get('download');

test('a Supabase Storage file is saved under its title, with the file\'s own extension', () => {
    const url = storageDownloadUrl(`${STORAGE}/1720000000000-modul-3.pdf`, 'Модуль 3. Урок 3.3');
    assert.equal(downloadParam(url), 'Модуль 3. Урок 3.3.pdf');
    assert.equal(url, `${STORAGE}/1720000000000-modul-3.pdf?download=${encodeURIComponent('Модуль 3. Урок 3.3.pdf')}`, 'spaces as %20');
    assert.equal(downloadParam(storageDownloadUrl(`${STORAGE}/a.pdf?t=1&download=old`, 'Урок')), 'Урок.pdf', 'other parameters stay, an old download= is replaced');
    assert.match(storageDownloadUrl(`${STORAGE}/a.pdf?t=1`, 'Урок'), /\?t=1&download=/);
});

test('a title that already ends in the extension is not doubled; characters a file name can\'t hold are dropped', () => {
    assert.equal(downloadParam(storageDownloadUrl(`${STORAGE}/a.pdf`, 'Конспект.pdf')), 'Конспект.pdf');
    assert.equal(downloadParam(storageDownloadUrl(`${STORAGE}/a.xlsx`, 'Таблица: входы / выходы?')), 'Таблица входы выходы.xlsx');
    assert.equal(downloadParam(storageDownloadUrl(`${STORAGE}/plan-2.pdf`, '   ')), 'plan-2.pdf', 'no title: the stored name');
});

test('files that live anywhere else are not Storage files', () => {
    assert.equal(storageDownloadUrl('https://docs.google.com/spreadsheets/d/abc/edit', 'Таблица'), null);
    assert.equal(storageDownloadUrl('not a url', 'x'), null);
});

function fakeBrowser({ standalone = false } = {}) {
    const clicks = [];
    const anchor = {
        href: '', rel: '', target: '',
        click() { clicks.push({ href: this.href, target: this.target }); },
        remove() {},
    };
    globalThis.window = { matchMedia: (q) => ({ matches: standalone && q === '(display-mode: standalone)' }) };
    globalThis.document = { createElement: () => anchor, body: { appendChild() {} } };
    return clicks;
}

test('the save happens inside the tap itself: no fetch, no await (an iPhone drops a save that comes later)', () => {
    const clicks = fakeBrowser();
    const returned = saveFile(`${STORAGE}/a.pdf`, 'Урок');
    assert.equal(returned, undefined, 'not a promise');
    assert.equal(clicks.length, 1, 'the link was followed before saveFile returned');
    assert.equal(downloadParam(clicks[0].href), 'Урок.pdf');
    assert.equal(clicks[0].target, '', 'a browser tab saves it without leaving the page');
});

test('in the installed app the file opens in a new tab (Safari), and links elsewhere always do', () => {
    const app = fakeBrowser({ standalone: true });
    saveFile(`${STORAGE}/a.pdf`, 'Урок');
    assert.equal(app[0].target, '_blank');

    const tab = fakeBrowser();
    saveFile('https://docs.google.com/spreadsheets/d/abc/edit', 'Таблица');
    assert.deepEqual(tab[0], { href: 'https://docs.google.com/spreadsheets/d/abc/edit', target: '_blank' });
});

// ------------------------------------------------ iPhone / iPad: share sheet

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

// A navigator whose share() answers with `answers` in turn ('ok' or an error name).
function fakeNav({ ua = IPHONE, touch = 5, canShare = true, answers = ['ok'] } = {}) {
    const shared = [];
    const nav = {
        userAgent: ua,
        maxTouchPoints: touch,
        canShare: () => canShare,
        share: (data) => {
            shared.push(data);
            const answer = answers[shared.length - 1] ?? 'ok';
            return answer === 'ok' ? Promise.resolve() : Promise.reject(Object.assign(new Error(answer), { name: answer }));
        },
    };
    return { nav, shared };
}
const pdf = () => new Response(new Uint8Array([37, 80, 68, 70]), { headers: { 'content-type': 'application/pdf' } });
// Runs shareFile; `next()` resolves with the next state that waits for something.
function run(nav, fetchFile = async () => pdf()) {
    const states = [];
    const waiters = [];
    shareFile(`${STORAGE}/1720000000000-modul-3.pdf`, 'Модуль 3. Урок 3.3', {
        nav,
        fetchFile,
        onState: (s) => {
            states.push(s);
            if (['ready', 'failed', 'done'].includes(s.step)) waiters.shift()?.(s);
        },
    });
    return { states, next: () => new Promise((resolve) => waiters.push(resolve)) };
}
const steps = (states) => states.map((s) => s.step).join(' → ');

test('iPhones and iPads hand files to the share sheet; computers and Android download as before', () => {
    assert.equal(sharesFiles(fakeNav().nav), true);
    assert.equal(sharesFiles(fakeNav({ ua: IPAD, touch: 5 }).nav), true, 'iPadOS calls itself a Mac, but has a touch screen');
    assert.equal(sharesFiles(fakeNav({ ua: IPAD, touch: 0 }).nav), false, 'a Mac');
    assert.equal(sharesFiles(fakeNav({ ua: ANDROID }).nav), false);
    const old = fakeNav().nav;
    delete old.canShare;
    assert.equal(sharesFiles(old), false, 'an iOS without file sharing keeps the old way');
});

test('a quick file goes to the share sheet from the same tap, under its title', async () => {
    const { nav, shared } = fakeNav();
    const r = run(nav);
    assert.equal((await r.next()).step, 'done');
    assert.equal(steps(r.states), 'preparing → sharing → done');
    assert.equal(shared.length, 1);
    assert.equal(shared[0].files[0].name, 'Модуль 3. Урок 3.3.pdf');
    assert.equal(shared[0].files[0].type, 'application/pdf');
    assert.equal(shared[0].title, 'Модуль 3. Урок 3.3');
});

test('a slow file (iOS refuses the late share()): a «Сохранить файл» button, whose own tap opens the share sheet at once', async () => {
    const { nav, shared } = fakeNav({ answers: ['NotAllowedError', 'ok'] });
    const r = run(nav);
    const ready = await r.next();
    assert.equal(ready.step, 'ready');
    assert.equal(shared.length, 1);
    const settled = r.next();
    ready.share();
    assert.equal(shared.length, 2, 'share() ran inside the button\'s tap, before anything was awaited');
    assert.equal((await settled).step, 'done');
    assert.equal(steps(r.states), 'preparing → sharing → ready → sharing → done');
});

test('closing the share sheet without saving is not an error', async () => {
    const r = run(fakeNav({ answers: ['AbortError'] }).nav);
    assert.equal((await r.next()).step, 'done');
});

test('a file that can\'t be fetched or shared: «Открыть файл», which opens it like the eye button', async () => {
    const offline = run(fakeNav().nav, async () => { throw new TypeError('Failed to fetch'); });
    const failed = await offline.next();
    assert.equal(failed.step, 'failed');
    const clicks = fakeBrowser();
    failed.open();
    assert.deepEqual(clicks[0], { href: `${STORAGE}/1720000000000-modul-3.pdf`, target: '_blank' });

    assert.equal((await run(fakeNav().nav, async () => new Response('nope', { status: 404 })).next()).step, 'failed', 'HTTP error');
    assert.equal((await run(fakeNav({ canShare: false }).nav).next()).step, 'failed', 'iOS won\'t share this type');
    assert.equal((await run(fakeNav({ answers: ['DataError'] }).nav).next()).step, 'failed', 'share() refused it');
});
