// Saving a course file from the ↓ buttons.
//
// Computers and Android: the tap goes straight to the file. Supabase Storage
// files get ?download=<name>, which makes Storage answer "save as <name>"
// (Content-Disposition: attachment); anything else opens in a new tab, like
// the eye button. (The buttons used to fetch the file into a blob and click a
// link after two awaits — by then a browser no longer counts the tap.)
//
// iPhone and iPad: that doesn't save anything. Safari shows a PDF or a
// presentation instead of saving it, and the home-screen app has no downloads
// at all. Saving goes through the share sheet's «Сохранить в Файлы», so the
// file is fetched and handed to the share sheet (shareFile below).
//
// No imports: test/download.test.mjs loads this file straight into Node.

const STORAGE_PUBLIC = '/storage/v1/object/public/';

export function isStorageFile(fileUrl: string): boolean {
    try {
        return new URL(fileUrl).pathname.includes(STORAGE_PUBLIC);
    } catch {
        return false;
    }
}

function cleanTitle(title: string): string {
    return title
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .split('')
        .filter((c) => c.charCodeAt(0) >= 32)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

// The name a saved file gets: the title, with the file's own extension.
export function savedFileName(fileUrl: string, title: string): string {
    let path = '';
    try {
        path = new URL(fileUrl).pathname;
    } catch {
        // not a URL: the title alone
    }
    const ext = path.match(/\.([a-z0-9]{1,5})$/i)?.[1];
    const base = cleanTitle(title) || decodeURIComponent(path.split('/').pop() || '') || 'file';
    return ext && !base.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${base}.${ext}` : base;
}

// -> the address that makes Supabase Storage send the file as an attachment
//    named after the title, or null for a file that lives anywhere else.
export function storageDownloadUrl(fileUrl: string, title: string): string | null {
    if (!isStorageFile(fileUrl)) return null;
    const url = new URL(fileUrl);
    // Spaces as %20, not URLSearchParams' "+", which not every parser reads as a space.
    const rest = new URLSearchParams(url.search);
    rest.delete('download');
    url.search = `${rest.toString() ? `${rest}&` : ''}download=${encodeURIComponent(savedFileName(fileUrl, title))}`;
    return url.toString();
}

function follow(href: string, newTab: boolean): void {
    const a = document.createElement('a');
    a.href = href;
    a.rel = 'noopener';
    if (newTab) a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// Computers and Android. Call it straight from the click handler, with no
// await before it. In a browser tab the attachment saves without leaving the
// page; in an installed app the file opens in a new tab.
export function saveFile(fileUrl: string, title: string): void {
    const download = storageDownloadUrl(fileUrl, title);
    const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
    follow(download ?? fileUrl, !download || standalone);
}

// Opens the file the way the eye button does.
export function openFile(fileUrl: string): void {
    follow(fileUrl, true);
}

// True on an iPhone or iPad that can hand a file to the share sheet. iPadOS
// says "Macintosh" in its user agent; a touch screen tells it from a Mac.
export function sharesFiles(nav: Navigator): boolean {
    const ua = nav.userAgent || '';
    const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
    return apple && typeof nav.share === 'function' && typeof nav.canShare === 'function';
}

// What the save sheet shows while a file goes to the share sheet:
//   preparing — fetching the file («Готовлю файл…»)
//   sharing   — the share sheet is open (hint: «Сохранить в Файлы»)
//   ready     — iOS wants one more tap: share() must be called from it
//   failed    — the file can't be fetched or shared: open it instead
//   done      — saved, or the student closed the share sheet
export type SaveState =
    | { step: 'preparing' }
    | { step: 'sharing' }
    | { step: 'ready'; share: () => void }
    | { step: 'failed'; open: () => void }
    | { step: 'done' };

export async function shareFile(
    fileUrl: string,
    title: string,
    { nav, fetchFile, onState }: { nav: Navigator; fetchFile: (url: string) => Promise<Response>; onState: (s: SaveState) => void },
): Promise<void> {
    const failed = () => onState({ step: 'failed', open: () => openFile(fileUrl) });
    onState({ step: 'preparing' });

    let file: File;
    try {
        const r = await fetchFile(fileUrl);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const type = blob.type || r.headers.get('content-type') || 'application/octet-stream';
        file = new File([blob], savedFileName(fileUrl, title), { type });
    } catch {
        failed();
        return;
    }
    if (!nav.canShare({ files: [file] })) {
        failed();
        return;
    }

    // share() needs the tap: WebKit carries it through a fetch the tap started
    // for about 10 seconds, then refuses (NotAllowedError). A slower file gets
    // a «Сохранить файл» button, whose own tap calls share() straight away.
    // Just try: navigator.userActivation expires after 5 s, sooner than that.
    const refused = (err: unknown): void => {
        const name = (err as { name?: string } | null)?.name;
        if (name === 'AbortError') onState({ step: 'done' }); // closed the share sheet
        else if (name === 'NotAllowedError') onState({ step: 'ready', share });
        else failed();
    };
    const share = (): void => {
        onState({ step: 'sharing' });
        let shared: Promise<void>;
        try {
            shared = nav.share({ files: [file], title });
        } catch (err) {
            refused(err);
            return;
        }
        shared.then(() => onState({ step: 'done' }), refused);
    };
    share();
}
