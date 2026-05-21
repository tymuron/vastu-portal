import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, FileText, Search, Paperclip } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Row {
    id: string;
    user_id: string;
    content: string;
    file_url: string | null;
    file_name: string | null;
    submitted_at: string;
    updated_at: string;
    days: {
        id: string;
        title: string;
        weeks: { id: string; title: string } | null;
    } | null;
}

interface Profile {
    id: string;
    email: string | null;
    full_name: string | null;
}

const formatWhen = (iso: string) => {
    try {
        return new Date(iso).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return ''; }
};

export default function Submissions() {
    const [rows, setRows] = useState<Row[]>([]);
    const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
    const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const { data, error } = await supabase
                    .from('homework_submissions')
                    .select(`
                        id, user_id, content, file_url, file_name, submitted_at, updated_at,
                        days ( id, title, weeks ( id, title ) )
                    `)
                    .order('updated_at', { ascending: false });
                if (error) throw error;
                if (cancelled) return;

                const subs = (data ?? []) as unknown as Row[];
                setRows(subs);

                // Profiles for student names
                const userIds = Array.from(new Set(subs.map(s => s.user_id)));
                if (userIds.length > 0) {
                    const { data: profs } = await supabase
                        .from('profiles')
                        .select('id, email, full_name')
                        .in('id', userIds);
                    if (!cancelled && profs) {
                        setProfiles(new Map(profs.map((p: Profile) => [p.id, p])));
                    }
                }

                // Pre-sign file URLs
                const withFiles = subs.filter(s => s.file_url);
                if (withFiles.length > 0) {
                    const urlMap = new Map<string, string>();
                    await Promise.all(withFiles.map(async (s) => {
                        const { data: signed } = await supabase
                            .storage.from('homework_files')
                            .createSignedUrl(s.file_url!, 3600);
                        if (signed?.signedUrl) urlMap.set(s.id, signed.signedUrl);
                    }));
                    if (!cancelled) setSignedUrls(urlMap);
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error('Submissions load error:', err);
                    setError(err?.message || 'Не удалось загрузить.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, []);

    // Group by week → lesson, filtered by search.
    const grouped = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = !q ? rows : rows.filter((r) => {
            const p = profiles.get(r.user_id);
            return (
                (r.days?.title || '').toLowerCase().includes(q) ||
                (r.days?.weeks?.title || '').toLowerCase().includes(q) ||
                (p?.email || '').toLowerCase().includes(q) ||
                (p?.full_name || '').toLowerCase().includes(q) ||
                (r.content || '').toLowerCase().includes(q)
            );
        });
        // Group by lesson id
        const byLesson = new Map<string, { lessonTitle: string; weekTitle: string; items: Row[] }>();
        for (const r of filtered) {
            const lid = r.days?.id || 'unknown';
            const lessonTitle = r.days?.title || '(удалённый урок)';
            const weekTitle = r.days?.weeks?.title || '';
            if (!byLesson.has(lid)) byLesson.set(lid, { lessonTitle, weekTitle, items: [] });
            byLesson.get(lid)!.items.push(r);
        }
        return Array.from(byLesson.values());
    }, [rows, profiles, search]);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-vastu-gold" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <h1 className="font-serif text-3xl text-vastu-dark">Домашние задания</h1>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск: ученик, урок, текст…"
                        className="pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-vastu-gold focus:border-vastu-gold w-80 max-w-full"
                    />
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {rows.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-vastu-text-light">
                    Пока никто не сдавал домашку.
                </div>
            ) : grouped.length === 0 ? (
                <div className="text-vastu-text-light text-sm">Ничего не найдено по запросу.</div>
            ) : (
                grouped.map((g) => (
                    <section key={g.lessonTitle} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <header className="px-5 py-4 bg-vastu-light/50 border-b border-gray-100">
                            <div className="text-xs uppercase tracking-wider text-vastu-gold/80 mb-0.5">
                                {g.weekTitle}
                            </div>
                            <div className="font-serif text-lg text-vastu-dark break-words">{g.lessonTitle}</div>
                            <div className="text-xs text-vastu-text-light mt-1">
                                {g.items.length} {g.items.length === 1 ? 'ответ' : 'ответов'}
                            </div>
                        </header>
                        <div className="divide-y divide-gray-100">
                            {g.items.map((r) => {
                                const p = profiles.get(r.user_id);
                                const who = p?.full_name || p?.email || r.user_id.slice(0, 8);
                                const signed = signedUrls.get(r.id);
                                return (
                                    <article key={r.id} className="p-5">
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-vastu-dark break-words">{who}</div>
                                                {p?.full_name && p?.email && (
                                                    <div className="text-xs text-vastu-text-light break-words">{p.email}</div>
                                                )}
                                            </div>
                                            <div className="text-xs text-vastu-text-light shrink-0">
                                                {formatWhen(r.updated_at)}
                                            </div>
                                        </div>
                                        {r.content && (
                                            <div className="text-sm text-vastu-text whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-3 mb-2">
                                                {r.content}
                                            </div>
                                        )}
                                        {r.file_url && (
                                            <div className="flex items-center gap-2 p-2 rounded-lg bg-vastu-light border border-vastu-gold/30">
                                                <Paperclip size={14} className="text-vastu-gold shrink-0" />
                                                <div className="flex-1 min-w-0 text-sm text-vastu-dark truncate">
                                                    {r.file_name || 'файл'}
                                                </div>
                                                {signed ? (
                                                    <a href={signed} target="_blank" rel="noreferrer"
                                                       className="p-1 text-vastu-gold hover:text-vastu-dark" title="Открыть">
                                                        <Download size={14} />
                                                    </a>
                                                ) : (
                                                    <FileText size={14} className="text-gray-300" />
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}
        </div>
    );
}
