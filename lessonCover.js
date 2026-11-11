// ---------------------------------------------------------------------------
// The picture on a new-lesson Telegram post (lessonNotify.js).
//
//   renderPdfCover  — page 1 of the lesson's presentation, ~1280 px wide. For
//                     Anna's decks that is the branded title slide with the
//                     lesson's theme and an interior photo (Tymur, 11 Nov 2026:
//                     «Картинку с темой урока»).
//   renderBrandCard — for a lesson without a PDF: her burgundy and gold, the
//                     lesson title in Cormorant, the week in Vela Sans.
//
// pdf.js and Skia (@napi-rs/canvas, which ships its own binary, so Render
// needs no system libraries) are loaded on first use and only here. If either
// is missing or fails, the caller posts text instead: a picture must never
// stop an announcement, or the server.
// ---------------------------------------------------------------------------

import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'fonts');

// Lesson decks are tens of MB at most; anything bigger isn't a deck.
export const MAX_PDF_BYTES = 80 * 1024 * 1024;
const BURGUNDY = '#422326';
const GOLD = '#CABC90';

let libs = null;
function loadLibs() {
    if (!libs) {
        libs = (async () => {
            const canvas = await import('@napi-rs/canvas');
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            return { canvas, pdfjs, pkg: path.dirname(require.resolve('pdfjs-dist/package.json')) };
        })();
        libs.catch(() => { libs = null; });
    }
    return libs;
}

// Telegram refuses a photo whose sides add up to more than 10000 px or whose
// ratio is over 20.
function checkSize(width, height) {
    if (!(width > 0 && height > 0) || width + height > 10000 || Math.max(width / height, height / width) > 20) {
        throw new Error(`page size ${width}×${height} can't be a Telegram photo`);
    }
}

// -> { jpeg: Buffer, width, height }
export async function renderPdfCover(bytes, { width = 1280, quality = 85 } = {}) {
    if (!bytes?.length) throw new Error('empty PDF');
    if (bytes.length > MAX_PDF_BYTES) throw new Error(`PDF too large (${bytes.length} bytes)`);
    const { canvas, pdfjs, pkg } = await loadLibs();
    const task = pdfjs.getDocument({
        // A copy: pdf.js takes ownership of the array it is given.
        data: new Uint8Array(bytes),
        standardFontDataUrl: `${path.join(pkg, 'standard_fonts')}${path.sep}`,
        cMapUrl: `${path.join(pkg, 'cmaps')}${path.sep}`,
        cMapPacked: true,
        isEvalSupported: false,
        verbosity: 0,
    });
    const doc = await task.promise;
    try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / base.width });
        const w = Math.round(viewport.width);
        const h = Math.round(viewport.height);
        checkSize(w, h);
        const c = canvas.createCanvas(w, h);
        const ctx = c.getContext('2d');
        // A PDF page is white unless it paints itself.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        await page.render({ canvasContext: ctx, viewport }).promise;
        return { jpeg: await c.encode('jpeg', quality), width: w, height: h };
    } finally {
        await task.destroy();
    }
}

let fontsReady = false;
function registerFonts(GlobalFonts) {
    if (fontsReady) return;
    GlobalFonts.registerFromPath(path.join(FONTS, 'Cormorant-Italic.otf'), 'Cormorant Italic');
    GlobalFonts.registerFromPath(path.join(FONTS, 'VelaSans-Regular.ttf'), 'Vela Sans');
    fontsReady = true;
}

// Words into lines no wider than maxWidth. A one- or two-letter word («и»,
// «в», «на») goes with the word after it, never alone at a line's end.
function wrap(ctx, text, maxWidth) {
    const words = [];
    let glue = '';
    for (const w of String(text).split(/\s+/).filter(Boolean)) {
        if (/^\p{L}{1,2}$/u.test(w)) {
            glue += `${w} `;
            continue;
        }
        words.push(glue + w);
        glue = '';
    }
    if (glue) words.push(glue.trim());
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function spaced(ctx, text, x, y, spacing) {
    // Letter-spaced small caps, centred on x (canvas letterSpacing isn't everywhere).
    const chars = [...text];
    const total = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
    let cx = x - total / 2;
    for (const ch of chars) {
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + spacing;
    }
}

// -> { jpeg: Buffer, width, height }
export async function renderBrandCard({ title, week = '', course = 'Васту-дизайн', width = 1280, height = 720, quality = 88 }) {
    const { canvas } = await loadLibs();
    registerFonts(canvas.GlobalFonts);
    const c = canvas.createCanvas(width, height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = BURGUNDY;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(202,188,144,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, width - 72, height - 72);

    ctx.fillStyle = GOLD;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '22px "Vela Sans"';
    spaced(ctx, `${course} · новый урок`.toUpperCase(), width / 2, 122, 5);

    // The title: as large as fits in three lines.
    const maxWidth = width - 220;
    let size = 84;
    let lines;
    for (; size >= 40; size -= 4) {
        ctx.font = `${size}px "Cormorant Italic"`;
        lines = wrap(ctx, title, maxWidth);
        if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxWidth)) break;
    }
    const lineHeight = Math.round(size * 1.15);
    const top = height / 2 - ((lines.length - 1) * lineHeight) / 2 + size * 0.3;
    ctx.textAlign = 'center';
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, width / 2, top + i * lineHeight));

    ctx.fillRect(width / 2 - 40, height - 178, 80, 1.5);
    if (week) {
        ctx.textAlign = 'left';
        ctx.font = '20px "Vela Sans"';
        spaced(ctx, week.toUpperCase(), width / 2, height - 132, 4);
    }
    ctx.textAlign = 'center';
    ctx.font = '34px "Cormorant Italic"';
    ctx.fillText('Anna Romeo', width / 2, height - 76);
    return { jpeg: await c.encode('jpeg', quality), width, height };
}
