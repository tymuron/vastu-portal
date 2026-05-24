import { useEffect, useState } from 'react';
import { Paperclip, Send, Check, Loader2, X, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Submission {
    id: string;
    content: string;
    file_url: string | null;
    file_name: string | null;
    submitted_at: string;
    updated_at: string;
    teacher_feedback: string | null;
    teacher_feedback_at: string | null;
}

const formatWhen = (iso: string) => {
    try {
        const d = new Date(iso);
        return d.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return ''; }
};

export default function HomeworkSubmission({ dayId }: { dayId: string }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [existing, setExisting] = useState<Submission | null>(null);
    const [content, setContent] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [signedUrl, setSignedUrl] = useState<string | null>(null);

    // Load existing submission (if any) for this user + day.
    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!user) { setLoading(false); return; }
            setLoading(true);
            const { data, error } = await supabase
                .from('homework_submissions')
                .select('id, content, file_url, file_name, submitted_at, updated_at, teacher_feedback, teacher_feedback_at')
                .eq('user_id', user.id)
                .eq('day_id', dayId)
                .maybeSingle();
            if (cancelled) return;
            if (error) console.error('homework load error:', error.message);
            if (data) {
                setExisting(data as Submission);
                setContent(data.content || '');
                setSavedAt(data.updated_at);
                if (data.file_url) {
                    const { data: signed } = await supabase
                        .storage.from('homework_files')
                        .createSignedUrl(data.file_url, 3600);
                    if (!cancelled) setSignedUrl(signed?.signedUrl || null);
                }
            }
            setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, [user, dayId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const trimmed = content.trim();
        if (!trimmed && !file && !existing?.file_url) {
            setError('Напишите ответ или прикрепите файл.');
            return;
        }
        setSaving(true);
        setError(null);

        try {
            let filePath: string | null = existing?.file_url ?? null;
            let fileName: string | null = existing?.file_name ?? null;

            // Upload new file if selected. Supabase Storage object keys must
            // be ASCII-safe (no Cyrillic, no em dashes, no spaces) — so we
            // generate a UUID-based key and preserve the original filename in
            // the file_name DB column for display.
            if (file) {
                const extMatch = file.name.match(/\.[A-Za-z0-9]+$/);
                const ext = extMatch ? extMatch[0].toLowerCase() : '';
                const safeId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                const path = `${user.id}/${dayId}/${safeId}${ext}`;
                const { error: upErr } = await supabase
                    .storage.from('homework_files')
                    .upload(path, file, { upsert: false, contentType: file.type || undefined });
                if (upErr) throw upErr;

                // Best-effort cleanup of the previous file (different key, so
                // upsert wouldn't have replaced it) so storage doesn't bloat.
                if (existing?.file_url && existing.file_url !== path) {
                    try {
                        await supabase.storage.from('homework_files').remove([existing.file_url]);
                    } catch (e) {
                        console.warn('homework: failed to remove previous file', e);
                    }
                }
                filePath = path;
                fileName = file.name;
            }

            const nowIso = new Date().toISOString();
            if (existing) {
                const { error: updErr } = await supabase
                    .from('homework_submissions')
                    .update({
                        content: trimmed,
                        file_url: filePath,
                        file_name: fileName,
                        updated_at: nowIso
                    })
                    .eq('id', existing.id);
                if (updErr) throw updErr;
            } else {
                const { data, error: insErr } = await supabase
                    .from('homework_submissions')
                    .insert({
                        user_id: user.id,
                        day_id: dayId,
                        content: trimmed,
                        file_url: filePath,
                        file_name: fileName
                    })
                    .select('id, content, file_url, file_name, submitted_at, updated_at, teacher_feedback, teacher_feedback_at')
                    .single();
                if (insErr) throw insErr;
                if (data) setExisting(data as Submission);
            }

            setSavedAt(nowIso);
            setFile(null);
            // Refresh signed URL if file was set
            if (filePath) {
                const { data: signed } = await supabase
                    .storage.from('homework_files')
                    .createSignedUrl(filePath, 3600);
                setSignedUrl(signed?.signedUrl || null);
            } else {
                setSignedUrl(null);
            }
        } catch (err: any) {
            console.error('homework save error:', err);
            setError(err?.message || 'Не удалось сохранить. Попробуйте ещё раз.');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveFile = async () => {
        if (!existing?.file_url) { setFile(null); return; }
        if (!window.confirm('Удалить прикреплённый файл?')) return;
        setSaving(true);
        try {
            await supabase.storage.from('homework_files').remove([existing.file_url]);
            const { error: updErr } = await supabase
                .from('homework_submissions')
                .update({ file_url: null, file_name: null, updated_at: new Date().toISOString() })
                .eq('id', existing.id);
            if (updErr) throw updErr;
            setExisting({ ...existing, file_url: null, file_name: null });
            setSignedUrl(null);
        } catch (err: any) {
            setError(err?.message || 'Не удалось удалить файл.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="mt-6 pt-6 border-t border-gray-100 flex items-center gap-2 text-vastu-text-light text-sm">
                <Loader2 size={16} className="animate-spin" />
                Загрузка…
            </div>
        );
    }

    return (
        <>
        <form onSubmit={handleSave} className="mt-6 pt-6 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ваш ответ</h4>
                {savedAt && (
                    <span className="text-xs text-vastu-text-light inline-flex items-center gap-1">
                        <Check size={12} className="text-green-600" />
                        Сохранено · {formatWhen(savedAt)}
                    </span>
                )}
            </div>

            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Напишите ваш ответ или комментарий к домашке…"
                rows={6}
                disabled={saving}
                className="w-full px-3 py-2 text-sm text-vastu-dark bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-vastu-gold focus:border-vastu-gold resize-y min-h-[120px]"
            />

            {/* Existing file */}
            {existing?.file_url && existing?.file_name && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-vastu-light border border-vastu-gold/30">
                    <Paperclip size={14} className="text-vastu-gold shrink-0" />
                    <div className="flex-1 min-w-0 text-sm text-vastu-dark truncate">{existing.file_name}</div>
                    {signedUrl && (
                        <a href={signedUrl} target="_blank" rel="noreferrer"
                           className="p-1 text-vastu-gold hover:text-vastu-dark" title="Открыть">
                            <Download size={14} />
                        </a>
                    )}
                    <button type="button" onClick={handleRemoveFile} disabled={saving}
                            className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50" title="Удалить">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* New file picker */}
            <div className="flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-2 px-3 py-2 text-sm text-vastu-gold border border-vastu-gold/40 rounded-lg cursor-pointer hover:bg-vastu-gold/10 transition-colors">
                    <Paperclip size={14} />
                    <span>{file ? 'Заменить файл' : (existing?.file_url ? 'Заменить файл' : 'Прикрепить файл')}</span>
                    <input
                        type="file"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        accept="image/*,application/pdf,.doc,.docx"
                    />
                </label>
                {file && (
                    <span className="text-xs text-vastu-text-light inline-flex items-center gap-1 min-w-0">
                        <span className="truncate max-w-[180px]">{file.name}</span>
                        <button type="button" onClick={() => setFile(null)}
                                className="text-gray-400 hover:text-red-600 ml-1" title="Отменить">
                            <X size={12} />
                        </button>
                    </span>
                )}
            </div>

            {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-vastu-dark text-vastu-light text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{existing ? 'Сохранить изменения' : 'Отправить'}</span>
            </button>
        </form>

        {/* Teacher reply — shown to the student when Anna has written feedback. */}
        {existing?.teacher_feedback && existing.teacher_feedback.trim() && (
            <div className="mt-4 p-4 rounded-xl bg-vastu-light border border-vastu-gold/40">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-[10px] uppercase tracking-widest text-vastu-gold/80">
                        Ответ Анны
                    </div>
                    {existing.teacher_feedback_at && (
                        <span className="text-xs text-vastu-text-light">
                            {formatWhen(existing.teacher_feedback_at)}
                        </span>
                    )}
                </div>
                <div className="text-sm text-vastu-dark whitespace-pre-wrap break-words">
                    {existing.teacher_feedback}
                </div>
            </div>
        )}
        </>
    );
}
