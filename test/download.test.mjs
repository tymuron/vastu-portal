// Saving a course file (src/lib/download.ts, loaded straight into Node, which
// strips the types). The browser parts are stood in for by a tiny fake DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { saveFile, storageDownloadUrl } from '../src/lib/download.ts';

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
