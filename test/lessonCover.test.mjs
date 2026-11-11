// The picture on a new-lesson Telegram post (lessonCover.js, and how
// lessonNotify.js picks it): real rendering with pdf.js and Skia, on PDFs
// written here, so the test needs no files and no network.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { MAX_PDF_BYTES, renderBrandCard, renderPdfCover } from '../lessonCover.js';
import { makeLessonPicture } from '../lessonNotify.js';

// A one-page PDF painted with one colour (a slide is 960×540 pt, 16:9).
function onePagePdf({ w = 960, h = 540, rgb = [0.259, 0.137, 0.149] } = {}) {
    const content = `${rgb.join(' ')} rg 0 0 ${w} ${h} re f`;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R /Resources << >> >>`,
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((o, i) => {
        const at = pdf.length;
        pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
        return at;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
}

async function pixel(jpeg, x, y) {
    const img = await loadImage(jpeg);
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, rgb: [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)] };
}

const near = (a, b, tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const BURGUNDY = [0x42, 0x23, 0x26];

test("a deck's first page becomes a 1280-px JPEG of what the page shows", async () => {
    const { jpeg, width, height } = await renderPdfCover(onePagePdf());
    assert.deepEqual([width, height], [1280, 720]);
    assert.ok(jpeg.length > 1000 && jpeg[0] === 0xff && jpeg[1] === 0xd8, 'a JPEG');
    const p = await pixel(jpeg, 640, 360);
    assert.deepEqual([p.width, p.height], [1280, 720]);
    assert.ok(near(p.rgb, BURGUNDY), `the page's colour, got ${p.rgb}`);
});

test('a portrait page keeps its shape', async () => {
    const { width, height } = await renderPdfCover(onePagePdf({ w: 595, h: 842 }));
    assert.equal(width, 1280);
    assert.equal(height, Math.round((842 * 1280) / 595));
});

test('an empty, broken or oversized file is refused, so the post falls back', async () => {
    await assert.rejects(renderPdfCover(Buffer.alloc(0)), /empty/);
    await assert.rejects(renderPdfCover(Buffer.from('not a pdf at all')));
    await assert.rejects(renderPdfCover({ length: MAX_PDF_BYTES + 1 }), /too large/);
});

test('the brand card: burgundy, 1280×720, for a lesson without a PDF', async () => {
    const { jpeg, width, height } = await renderBrandCard({ title: 'Урок 3. Сектора и планеты', week: 'НЕДЕЛЯ 1. ФУНДАМЕНТ И ДИАГНОСТИКА' });
    assert.deepEqual([width, height], [1280, 720]);
    const p = await pixel(jpeg, 10, 10);
    assert.ok(near(p.rgb, BURGUNDY), `background ${p.rgb}`);
});

// makeLessonPicture with a stand-in for Supabase Storage.
function storage(files) {
    const asked = [];
    return {
        asked,
        getSupabase: () => ({
            storage: {
                from: (bucket) => ({
                    async download(path) {
                        asked.push(`${bucket}/${path}`);
                        const bytes = files[`${bucket}/${path}`];
                        if (!bytes) return { data: null, error: { message: 'Object not found' } };
                        return { data: new Blob([bytes]), error: null };
                    },
                }),
            },
        }),
    };
}
const quiet = { log() {}, error() {} };
const lesson = (files) => ({ title: 'Урок 1. Основы Васту', weekTitle: 'НЕДЕЛЯ 1', courseTitle: 'Васту-дизайн', courseOrder: 10, weekOrder: 2, dayOrder: 1, files });
const deck = { title: 'Урок 1 — презентация.pdf', type: 'pdf', url: 'https://jjztzunutlcnfnzaclun.supabase.co/storage/v1/object/public/course-content/days/d1/deck.pdf' };

test("the picture is the lesson's presentation cover, downloaded from the platform's storage", async () => {
    const st = storage({ 'course-content/days/d1/deck.pdf': onePagePdf() });
    const pic = await makeLessonPicture({ getSupabase: st.getSupabase, log: quiet })([lesson([deck])]);
    assert.equal(pic.kind, 'cover');
    assert.equal(pic.source, 'Урок 1 — презентация.pdf');
    assert.deepEqual(st.asked, ['course-content/days/d1/deck.pdf']);
    assert.ok(near((await pixel(pic.jpeg, 640, 360)).rgb, BURGUNDY));
});

test('no PDF, a file that is not in storage, or a broken PDF: the brand card instead', async () => {
    const st = storage({ 'course-content/days/d1/deck.pdf': Buffer.from('broken') });
    const picture = makeLessonPicture({ getSupabase: st.getSupabase, log: quiet });
    for (const files of [[], [{ ...deck, url: 'https://drive.example/deck.pdf' }], [{ ...deck, url: deck.url.replace('deck.pdf', 'gone.pdf') }], [deck]]) {
        const pic = await picture([lesson(files)]);
        assert.equal(pic.kind, 'card', JSON.stringify(files));
    }
});

test('if no picture can be made at all, the answer is none (and the post goes as text)', async () => {
    const broken = { renderPdfCover: async () => { throw new Error('x'); }, renderBrandCard: async () => { throw new Error('y'); } };
    const st = storage({ 'course-content/days/d1/deck.pdf': onePagePdf() });
    assert.equal(await makeLessonPicture({ getSupabase: st.getSupabase, log: quiet, covers: broken })([lesson([deck])]), null);
});
