import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FileSaveSheet from '../components/FileSaveSheet';
import { SaveState, isStorageFile, saveFile, shareFile, sharesFiles } from '../lib/download';

// The ↓ buttons' save. On an iPhone or iPad the file goes to the share sheet,
// where «Сохранить в Файлы» is, and FileSaveSheet says what is happening:
// «Готовлю файл…» while it loads, a «Сохранить файл» button when iOS wants one
// more tap, «Открыть файл» when it can't be fetched. Everyone else gets the
// browser's own download (lib/download.ts).
export function useFileSave() {
    const [state, setState] = useState<SaveState | null>(null);
    const [title, setTitle] = useState('');
    const run = useRef<AbortController | null>(null);

    useEffect(() => () => run.current?.abort(), []);

    const close = useCallback(() => {
        run.current?.abort();
        run.current = null;
        setState(null);
    }, []);

    const save = useCallback((fileUrl: string, fileTitle: string) => {
        if (!sharesFiles(navigator) || !isStorageFile(fileUrl)) {
            saveFile(fileUrl, fileTitle);
            return;
        }
        run.current?.abort();
        const controller = new AbortController();
        run.current = controller;
        setTitle(fileTitle);
        void shareFile(fileUrl, fileTitle, {
            nav: navigator,
            fetchFile: (url) => fetch(url, { signal: controller.signal }),
            onState: (s) => {
                if (!controller.signal.aborted) setState(s.step === 'done' ? null : s);
            },
        });
    }, []);

    // Into <body>: the pages animate in with a transform, and inside a
    // transformed element `position: fixed` covers that element instead of the
    // screen (the sheet ended up below the fold).
    const sheet = state && state.step !== 'done'
        ? createPortal(<FileSaveSheet state={state} title={title} onClose={close} />, document.body)
        : null;
    return { save, sheet };
}
