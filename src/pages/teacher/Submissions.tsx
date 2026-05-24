import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, FileText, Search, Paperclip, Send, Check, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i;
const isImageFile = (name: string | null | undefined) =>
    !!name && IMAGE_EXT.test(name);

interface Row {
    id: string;
    user_id: string;
    content: string;
    file_url: string | null;
    file_name: string | null;
    submitted_at: string;
    updated_at: string;
    teacher_feedback: string | null;
    teacher_feedback_at: string | null;
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

function FeedbackEditor({ row, onSaved }: {
    row: Row;
    onSaved: (id: string, feedback: string, savedAt: string) => void;
}) {
    const [draft, setDraft] = useState(row.teacher_feedback || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasUnsaved = (draft.trim() || '') !== (row.teacher_feedback || '').trim();

    const save = async () => {
        const trimmed = draft.trim();
        setSaving(true);
        setError(null);
        try {
            const nowIso = new Date().toISOString();
            const { error: updErr } = await supabase
                .from('homework_submissions')
                .update({ teacher_feedback: trimmed, teacher_feedback_at: nowIso })
                .eq('id', row.id);
            if (updErr) throw updErr;
            onSaved(row.id, trimmed, nowIso);
        } catch (err: any) {
            console.error('feedback save error:', err);
            setError(err?.message || 'Не удалось сохранить ответ.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
            <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-[10px] uppercase tracking-widest text-vastu-gold/80">Ваш ответ ученику</div>
                {row.teacher_feedback_at && !hasUnsaved && (
                    <span className="text-xs text-vastu-text-light inline-flex items-center gap-1">
                        <Check size={12} className="text-green-600" />
                        Отправлено · {formatWhen(row.teacher_feedback_at)}
                    </span>
                )}
            </div>
            <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Напишите комментарий или ответ ученику…"
                rows={3}
                disabled={saving}
                className="w-full px-3 py-2 text-sm text-vastu-dark bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-vastu-gold focus:border-vastu-gold resize-y min-h-[64px]"
            />
            {error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">{error}</div>
            )}
            <button
                type="button"
                onClick={save}
                disabled={saving || !hasUnsaved}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-vastu-dark text-vastu-light text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{row.teacher_feedback ? 'Сохранить ответ' : 'Отправить ответ'}</span>
            </button>
        </div>
    );
}

export default function Submissions() {
    const [rows, setRows] = useState<Row[]>([]);
    const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
    const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
    const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set());
    const toggleImage = (id: string) => setExpandedImages((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
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
                        teacher_feedback, teacher_feedback_at,
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
                                        {r.file_url && (() => {
                                            const isImg = isImageFile(r.file_name);
                                            const isOpen = expandedImages.has(r.id);
                                            return (
                                                <div className="rounded-lg bg-vastu-light border border-vastu-gold/30 overflow-hidden">
                                                    <div className="flex items-center gap-2 p-2">
                                                        <Paperclip size={14} className="text-vastu-gold shrink-0" />
                                                        <div className="flex-1 min-w-0 text-sm text-vastu-dark truncate">
                                                            {r.file_name || 'файл'}
                                                        </div>
                                                        {isImg && signed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleImage(r.id)}
                                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-vastu-gold hover:text-vastu-dark hover:bg-vastu-gold/10 rounded transition-colors"
                                                                title={isOpen ? 'Скрыть' : 'Показать'}
                                                            >
                                                                {isOpen ? <EyeOff size={13} /> : <Eye size={13} />}
                                                                <span>{isOpen ? 'Скрыть' : 'Показать'}</span>
                                                            </button>
                                                        )}
                                                        {signed ? (
                                                            <a href={signed} target="_blank" rel="noreferrer"
                                                               className="p-1 text-vastu-gold hover:text-vastu-dark" title="Открыть в новой вкладке / скачать">
                                                                <Download size={14} />
                                                            </a>
                                                        ) : (
                                                            <FileText size={14} className="text-gray-300" />
                                                        )}
                                                    </div>
                                                    {isImg && isOpen && signed && (
                                                        <a href={signed} target="_blank" rel="noreferrer"
                                                           className="block border-t border-vastu-gold/20 bg-black/5">
                                                            <img
                                                                src={signed}
                                                                alt={r.file_name || ''}
                                                                loading="lazy"
                                                                className="block w-full max-h-[600px] object-contain"
                                                            />
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        <FeedbackEditor
                                            row={r}
                                            onSaved={(id, feedback, savedAt) => {
                                                setRows((prev) => prev.map((x) =>
                                                    x.id === id
                                                        ? { ...x, teacher_feedback: feedback, teacher_feedback_at: savedAt }
                                                        : x
                                                ));
                                            }}
                                        />
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
