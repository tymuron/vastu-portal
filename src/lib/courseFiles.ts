// Lesson files live in the course-content bucket, which is private: a file
// opens only through a short-lived signed link, and Storage signs one only
// for a teacher or for a student whose access to that file's course is
// current (supabase/migrations/20261028_private_course_files_1_policy.sql).
//
// materials.url keeps the file's public-URL form (what the editor's uploader
// and scripts/import-lesson.mjs store) as its address, and the object key is
// read back out of it. Links that aren't course files, like a Google Drive
// link or a file in another bucket, are used as they are.
//
// No React and no app imports, so test/course-files.test.mjs runs this in
// Node against the fake Supabase.

import type { SupabaseClient } from '@supabase/supabase-js';

type StorageClient = Pick<SupabaseClient, 'storage'>;

export const COURSE_FILES_BUCKET = 'course-content';
// A signed link works this long…
export const SIGNED_LINK_TTL_S = 2 * 60 * 60;
// …and a page asks for new ones once its links are this old.
export const RESIGN_AFTER_MS = 30 * 60 * 1000;

const FILE_URL = /^(https?:\/\/[^/]+)\/storage\/v1\/object\/(?:public|sign|authenticated)\/course-content\/([^?#]+)/;

// The object key of a course-content file URL, or null for any other link.
// With supabaseUrl given, only links into that project count.
export function courseFileKey(url: string | null | undefined, supabaseUrl?: string): string | null {
    const m = url ? url.match(FILE_URL) : null;
    if (!m) return null;
    if (supabaseUrl && m[1] !== supabaseUrl.replace(/\/+$/, '')) return null;
    try {
        return decodeURIComponent(m[2]);
    } catch {
        return null;
    }
}

// Signed links for every course file among `urls`, in one request. Other
// links map to themselves; a file Storage won't sign maps to null.
export async function signCourseFiles(
    client: StorageClient,
    urls: string[],
    supabaseUrl?: string,
    ttlSeconds = SIGNED_LINK_TTL_S
): Promise<Map<string, string | null>> {
    const links = new Map<string, string | null>();
    const urlsByKey = new Map<string, string[]>();
    for (const url of urls) {
        const key = courseFileKey(url, supabaseUrl);
        if (key) urlsByKey.set(key, [...(urlsByKey.get(key) || []), url]);
        else links.set(url, url);
    }
    if (!urlsByKey.size) return links;

    const { data, error } = await client.storage
        .from(COURSE_FILES_BUCKET)
        .createSignedUrls([...urlsByKey.keys()], ttlSeconds);
    if (error) throw error;
    for (const item of data || []) {
        for (const url of (item.path && urlsByKey.get(item.path)) || []) {
            links.set(url, item.error ? null : item.signedUrl || null);
        }
    }
    for (const sameKey of urlsByKey.values()) {
        for (const url of sameKey) if (!links.has(url)) links.set(url, null);
    }
    return links;
}

// One fresh link for a file that is fetched or opened right away; null when
// Storage won't sign it.
export async function signCourseFile(
    client: StorageClient,
    url: string,
    supabaseUrl?: string,
    ttlSeconds = 60
): Promise<string | null> {
    const key = courseFileKey(url, supabaseUrl);
    if (!key) return url;
    const { data, error } = await client.storage.from(COURSE_FILES_BUCKET).createSignedUrl(key, ttlSeconds);
    return error || !data?.signedUrl ? null : data.signedUrl;
}
