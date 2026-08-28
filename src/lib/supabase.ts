import { createClient } from '@supabase/supabase-js';
import { resilientAuthStorage } from './browserStorage';

// These environment variables will be needed
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase Environment Variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder',
    {
        auth: {
            // Defaults, spelled out because the whole login flow depends on them.
            persistSession: true,
            autoRefreshToken: true,
            // UpdatePasswordPage parses invite / recovery links itself, but this
            // has to stay on for the plain magic-link shape to work.
            detectSessionInUrl: true,
            // Not localStorage directly: on machines where a security suite or a
            // privacy setting silently drops localStorage writes, the session
            // vanishes between the login POST and the next render, and the user
            // gets bounced back to /login a second after logging in. This adapter
            // verifies the store with a write/read-back and degrades to
            // sessionStorage -> cookie -> memory rather than losing the session.
            // See ./browserStorage.
            storage: resilientAuthStorage,
        },
    }
);
