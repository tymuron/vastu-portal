import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RESIGN_AFTER_MS, signCourseFile, signCourseFiles } from '../lib/courseFiles';

const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;

// Links for the lesson files listed on a page. Every course file gets a
// signed link (the bucket is private), and the links are signed again while
// the page stays open: a phone left on a lesson for hours must not hand out
// a dead link. linkFor(url) is the href to use: undefined while signing,
// null if Storage refused (access ended, or the file is gone).
export function useCourseFileLinks(urls: string[]) {
    const [links, setLinks] = useState<Map<string, string | null>>(() => new Map());
    const signedAt = useRef(0);
    const lastRequest = useRef(0);
    const wanted = urls.join('\n');

    const refresh = useCallback(async () => {
        const list = wanted ? wanted.split('\n') : [];
        if (!list.length) return;
        // A slow answer for the previous page must not overwrite this one's.
        const request = ++lastRequest.current;
        try {
            const next = await signCourseFiles(supabase, list, SUPABASE_URL);
            if (request !== lastRequest.current) return;
            signedAt.current = Date.now();
            setLinks(next);
        } catch (err) {
            console.error('Could not sign lesson file links:', err);
        }
    }, [wanted]);

    useEffect(() => {
        signedAt.current = 0;
        refresh();
        const refreshIfOld = () => {
            if (document.visibilityState === 'visible' && Date.now() - signedAt.current > RESIGN_AFTER_MS) refresh();
        };
        const timer = window.setInterval(refreshIfOld, 60 * 1000);
        document.addEventListener('visibilitychange', refreshIfOld);
        window.addEventListener('focus', refreshIfOld);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', refreshIfOld);
            window.removeEventListener('focus', refreshIfOld);
        };
    }, [refresh]);

    return useCallback((url: string) => (links.has(url) ? links.get(url) : undefined), [links]);
}

// A fresh link for a file fetched right now (the download button), or null.
export function freshCourseFileLink(url: string) {
    return signCourseFile(supabase, url, SUPABASE_URL);
}
