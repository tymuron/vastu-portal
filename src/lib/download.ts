// Saving a course file from the ↓ buttons.
//
// The buttons used to fetch the whole file, wrap it in a blob and click a
// temporary link — after two awaits, by which time an iPhone no longer
// counts the tap as the student's own: the save is dropped, and the fallback
// window.open was blocked as a pop-up. The blob URL was also revoked while the
// download was still starting. Now the tap goes straight to the file:
// Supabase Storage files with ?download=<name>, which makes Storage answer
// "save as <name>" (Content-Disposition: attachment); anything else opens in
// a new tab, like the eye button.
//
// No imports: test/download.test.mjs loads this file straight into Node.

const STORAGE_PUBLIC = '/storage/v1/object/public/';

function fileName(title: string): string {
    return title
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .split('')
        .filter((c) => c.charCodeAt(0) >= 32)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

// -> the address that makes Supabase Storage send the file as an attachment
//    named after the title (keeping the file's own extension), or null for a
//    file that lives anywhere else.
export function storageDownloadUrl(fileUrl: string, title: string): string | null {
    let url: URL;
    try {
        url = new URL(fileUrl);
    } catch {
        return null;
    }
    if (!url.pathname.includes(STORAGE_PUBLIC)) return null;
    const ext = url.pathname.match(/\.([a-z0-9]{1,5})$/i)?.[1];
    const base = fileName(title) || decodeURIComponent(url.pathname.split('/').pop() || 'file');
    const name = ext && !base.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${base}.${ext}` : base;
    // Spaces as %20, not URLSearchParams' "+", which not every parser reads as a space.
    const rest = new URLSearchParams(url.search);
    rest.delete('download');
    url.search = `${rest.toString() ? `${rest}&` : ''}download=${encodeURIComponent(name)}`;
    return url.toString();
}

// Call it straight from the click handler, with no await before it.
// In a browser tab the attachment saves without leaving the page. In the
// installed app (home screen) the file opens in a new tab, which iOS shows in
// Safari, where saving works.
export function saveFile(fileUrl: string, title: string): void {
    const download = storageDownloadUrl(fileUrl, title);
    const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const a = document.createElement('a');
    a.href = download ?? fileUrl;
    a.rel = 'noopener';
    if (!download || standalone) a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
}
