import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, ChevronDown, ChevronRight, FileText, Video, X, Save, Loader2 } from 'lucide-react';
import FileUploader from '../../components/FileUploader';

interface Material {
    id: string;
    title: string;
    type: 'video' | 'pdf' | 'doc' | 'link' | 'zip';
    url: string;
    week_id?: string;
    day_id?: string;
}

interface Day {
    id: string;
    title: string;
    order_index: number;
    description?: string;
    video_url?: string;
    rutube_url?: string;
    date?: string;
    materials?: Material[];
}

interface Week {
    id: string;
    title: string;
    description: string;
    order_index: number;
    available_from?: string;
    days: Day[];
    materials?: Material[];
}

// --- Sub-components ---

const DayEditor = ({ day, onDelete, onUpdate }: { day: Day, onDelete: () => void, onUpdate: () => void }) => {
    const [localDay, setLocalDay] = useState(day);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Update local state when prop changes (e.g. after a refresh)
    useEffect(() => {
        setLocalDay(day);
        setIsDirty(false);
    }, [day]);

    const handleChange = (field: keyof Day, value: any) => {
        setLocalDay(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('days')
                .update({
                    title: localDay.title,
                    description: localDay.description,
                    video_url: localDay.video_url,
                    rutube_url: localDay.rutube_url,
                    date: localDay.date
                })
                .eq('id', day.id);

            if (error) throw error;
            setIsDirty(false);
            onUpdate(); // Refresh parent
        } catch (error) {
            console.error('Error saving day:', error);
            alert('Ошибка при сохранении урока');
        } finally {
            setSaving(false);
        }
    };

    const handleAddMaterial = async (url: string, type: string, name: string) => {
        const { error } = await supabase.from('materials').insert([{
            title: name,
            type,
            url,
            day_id: day.id
        }]);
        if (!error) onUpdate();
    };

    const handleDeleteMaterial = async (id: string) => {
        if (!window.confirm('Удалить материал?')) return;
        const { error } = await supabase.from('materials').delete().eq('id', id);
        if (!error) onUpdate();
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm transition-all hover:border-vastu-gold/50 hover:shadow-md">
            <div className="flex justify-between items-start mb-6">
                <div className="flex-1 mr-4 space-y-4">
                    {/* Day Title */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Название урока</label>
                        <input
                            type="text"
                            value={localDay.title}
                            onChange={(e) => handleChange('title', e.target.value)}
                            className="text-lg font-medium text-vastu-dark bg-transparent border-b border-gray-200 hover:border-vastu-gold focus:border-vastu-gold focus:outline-none w-full transition-colors py-1"
                        />
                    </div>

                    {/* Day Description */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Описание</label>
                        <textarea
                            placeholder="Краткое описание урока..."
                            value={localDay.description || ''}
                            onChange={(e) => handleChange('description', e.target.value)}
                            className="w-full text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold focus:outline-none resize-y min-h-[80px]"
                        />
                    </div>

                    {/* Video URL */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Основное Видео (YouTube)</label>
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-vastu-gold focus-within:ring-1 focus-within:ring-vastu-gold mb-2">
                            <Video size={16} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="Ссылка на YouTube..."
                                value={localDay.video_url || ''}
                                onChange={(e) => handleChange('video_url', e.target.value)}
                                className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none"
                            />
                        </div>

                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Rutube Видео (Опционально)</label>
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-vastu-gold focus-within:ring-1 focus-within:ring-vastu-gold">
                            <Video size={16} className="text-[#00A551]" />
                            <input
                                type="text"
                                placeholder="Ссылка на Rutube..."
                                value={localDay.rutube_url || ''}
                                onChange={(e) => handleChange('rutube_url', e.target.value)}
                                className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Day Date */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Дата урока (Календарь)</label>
                        <input
                            type="date"
                            value={localDay.date ? new Date(localDay.date).toISOString().split('T')[0] : ''}
                            onChange={(e) => {
                                const date = e.target.value ? new Date(e.target.value).toISOString() : null;
                                handleChange('date', date);
                            }}
                            className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold focus:outline-none"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className={`p-2 rounded-lg transition-colors flex items-center justify-center ${isDirty ? 'bg-vastu-gold text-white hover:bg-vastu-gold/90' : 'bg-gray-100 text-gray-400'}`}
                        title="Сохранить изменения"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    </button>
                    <button onClick={onDelete} className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors" title="Удалить урок">
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* Day Materials */}
            <div className="mt-6 pt-6 border-t border-gray-100">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Материалы урока (Файлы)</h5>
                <div className="space-y-3 mb-4">
                    {day.materials?.map(m => (
                        <div key={m.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200 text-sm hover:border-vastu-gold/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-md ${m.type === 'video' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {m.type === 'video' ? <Video size={16} /> : <FileText size={16} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <input
                                        defaultValue={m.title}
                                        className="font-medium text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-vastu-gold focus:outline-none px-1 w-full"
                                        onBlur={(e) => {
                                            if (e.target.value !== m.title) {
                                                supabase.from('materials').update({ title: e.target.value }).eq('id', m.id).then(() => onUpdate());
                                            }
                                        }}
                                    />
                                    <a href={m.url} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-vastu-gold truncate block mt-0.5">
                                        {m.url}
                                    </a>
                                </div>
                            </div>
                            <button onClick={() => handleDeleteMaterial(m.id)} className="text-gray-400 hover:text-red-500 p-1"><X size={16} /></button>
                        </div>
                    ))}
                </div>

                <FileUploader
                    folder={`days/${day.id}`}
                    onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name)}
                />
                <button
                    onClick={() => {
                        const url = window.prompt('Введите ссылку (URL):');
                        if (!url) return;
                        const name = window.prompt('Название ссылки:', 'Дополнительный материал');
                        if (!name) return;
                        handleAddMaterial(url, 'link', name);
                    }}
                    className="w-full mt-2 py-3 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-gray-500 hover:text-vastu-dark hover:border-vastu-gold hover:bg-vastu-gold/5 transition-all font-medium text-sm"
                >
                    <Plus size={16} /> Добавить ссылку на сайт
                </button>
            </div>
        </div>
    );
};

const WeekEditor = ({ week, onDelete, onUpdate, onAddDay }: { week: Week, onDelete: () => void, onUpdate: () => void, onAddDay: () => void }) => {
    const [expanded, setExpanded] = useState(false);
    const [localWeek, setLocalWeek] = useState(week);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        setLocalWeek(week);
        setIsDirty(false);
    }, [week]);

    const handleChange = (field: keyof Week, value: any) => {
        setLocalWeek(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('weeks')
                .update({
                    title: localWeek.title,
                    available_from: localWeek.available_from
                })
                .eq('id', week.id);

            if (error) throw error;
            setIsDirty(false);
            onUpdate();
        } catch (error) {
            console.error('Error saving week:', error);
            alert('Ошибка при сохранении недели');
        } finally {
            setSaving(false);
        }
    };

    const handleAddMaterial = async (url: string, type: string, name: string) => {
        const { error } = await supabase.from('materials').insert([{
            title: name,
            type,
            url,
            week_id: week.id
        }]);
        if (!error) onUpdate();
    };

    const handleDeleteMaterial = async (id: string) => {
        if (!window.confirm('Удалить материал?')) return;
        const { error } = await supabase.from('materials').delete().eq('id', id);
        if (!error) onUpdate();
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* Week Header */}
            <div className="p-4 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                    <button onClick={() => setExpanded(!expanded)} className="p-1 -ml-1">
                        {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>
                    <div className="flex items-center justify-between flex-1">
                        <input
                            value={localWeek.title}
                            onChange={(e) => handleChange('title', e.target.value)}
                            className="text-xl font-bold text-[#422326] bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#422326] focus:outline-none px-1 py-0.5 w-full mr-4"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddDay();
                            }}
                            className="flex items-center text-sm text-[#422326] hover:text-[#2b1618] whitespace-nowrap mr-4"
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            Урок
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        className="text-sm border rounded px-2 py-1 bg-white"
                        value={localWeek.available_from ? new Date(localWeek.available_from).toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                            const date = e.target.value ? new Date(e.target.value).toISOString() : null;
                            handleChange('available_from', date);
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />

                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className={`p-2 rounded-lg transition-colors flex items-center justify-center ${isDirty ? 'bg-vastu-gold text-white hover:bg-vastu-gold/90' : 'bg-gray-100 text-gray-400'}`}
                        title="Сохранить изменения"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    </button>

                    <button onClick={onDelete} className="p-2 text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
            </div>

            {/* Week Content */}
            {expanded && (
                <div className="p-4 space-y-6">
                    {/* Week Materials Section */}
                    <div className="bg-vastu-gold/10 p-4 rounded-lg border border-vastu-gold/20">
                        <h4 className="text-sm font-bold text-vastu-dark mb-3 uppercase tracking-wider">Материалы недели (Общие)</h4>
                        <div className="space-y-2 mb-3">
                            {week.materials?.map(m => (
                                <div key={m.id} className="flex items-center justify-between bg-white p-2 rounded border border-gray-100 text-sm">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {m.type === 'video' ? <Video size={14} className="text-blue-500" /> : <FileText size={14} className="text-orange-500" />}
                                        <input
                                            defaultValue={m.title}
                                            className="truncate bg-transparent border-b border-transparent hover:border-gray-300 focus:border-vastu-gold focus:outline-none px-1 w-full"
                                            onBlur={(e) => {
                                                if (e.target.value !== m.title) {
                                                    supabase.from('materials').update({ title: e.target.value }).eq('id', m.id).then(() => onUpdate());
                                                }
                                            }}
                                        />
                                    </div>
                                    <button onClick={() => handleDeleteMaterial(m.id)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                                </div>
                            ))}
                        </div>
                        <FileUploader
                            folder={`weeks/${week.id}`}
                            onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name)}
                        />
                        <button
                            onClick={() => {
                                const url = window.prompt('Введите ссылку (URL):');
                                if (!url) return;
                                const name = window.prompt('Название ссылки:', 'Дополнительный материал');
                                if (!name) return;
                                handleAddMaterial(url, 'link', name);
                            }}
                            className="w-full mt-2 py-3 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-gray-500 hover:text-vastu-dark hover:border-vastu-gold hover:bg-vastu-gold/5 transition-all font-medium text-sm"
                        >
                            <Plus size={16} /> Добавить ссылку на сайт
                        </button>
                    </div>

                    {/* Days List Section */}
                    <div className="mt-8">
                        <h4 className="text-sm font-bold text-vastu-dark mb-4 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-vastu-dark"></span>
                            Программа недели (Уроки)
                        </h4>

                        <div className="space-y-4 pl-4 border-l-2 border-gray-100">
                            {week.days.length === 0 && (
                                <div className="text-sm text-gray-400 italic mb-4">
                                    В этой неделе пока нет уроков. Добавьте первый урок ниже.
                                </div>
                            )}

                            {week.days.map((day) => (
                                <DayEditor
                                    key={day.id}
                                    day={day}
                                    onDelete={() => {
                                        if (window.confirm('Удалить урок?')) {
                                            supabase.from('days').delete().eq('id', day.id).then(() => onUpdate());
                                        }
                                    }}
                                    onUpdate={onUpdate}
                                />
                            ))}

                            <button
                                onClick={onAddDay}
                                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-gray-500 hover:text-vastu-dark hover:border-vastu-gold hover:bg-vastu-gold/5 transition-all font-medium"
                            >
                                <Plus size={20} />
                                Добавить новый урок
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function CourseEditor() {
    const [weeks, setWeeks] = useState<Week[]>([]);
    const [loading, setLoading] = useState(true);

    async function fetchWeeks() {
        try {
            const { data, error } = await supabase
                .from('weeks')
                .select(`
                    *,
                    days (
                        *,
                        materials (*)
                    ),
                    materials (*)
                `)
                .order('order_index', { ascending: true });

            if (error) throw error;

            if (data) {
                const sortedWeeks: Week[] = data.map((week: any) => ({
                    id: week.id,
                    title: week.title,
                    description: week.description,
                    order_index: week.order_index,
                    available_from: week.available_from,
                    days: week.days.sort((a: any, b: any) => a.order_index - b.order_index).map((day: any) => ({
                        id: day.id,
                        title: day.title,
                        description: day.description,
                        video_url: day.video_url,
                        rutube_url: day.rutube_url,
                        date: day.date,
                        order_index: day.order_index,
                        materials: day.materials || []
                    })),
                    materials: week.materials || []
                }));
                setWeeks(sortedWeeks);
            }
        } catch (error) {
            console.error('Error fetching weeks:', error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchWeeks();
    }, []);

    const handleAddWeek = async () => {
        const title = window.prompt('Название недели:');
        if (!title) return;
        const { error } = await supabase.from('weeks').insert([{ title, order_index: weeks.length + 1 }]);
        if (!error) fetchWeeks();
    };

    const handleDeleteWeek = async (id: string) => {
        if (!window.confirm('Удалить неделю?')) return;
        const { error } = await supabase.from('weeks').delete().eq('id', id);
        if (!error) fetchWeeks();
    };

    const handleAddDay = async (weekId: string) => {
        const title = window.prompt('Название урока:');
        if (!title) return;
        const { error } = await supabase.from('days').insert([{ week_id: weekId, title, order_index: 99 }]);
        if (error) {
            alert('Ошибка при создании урока: ' + error.message);
            console.error(error);
        } else {
            fetchWeeks();
        }
    };

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-serif text-vastu-dark">Редактор Курса</h1>
                <button onClick={handleAddWeek} className="flex items-center gap-2 bg-vastu-dark text-white px-4 py-2 rounded-lg hover:bg-vastu-dark/90">
                    <Plus size={18} /> Добавить неделю
                </button>
            </div>

            <div className="space-y-4">
                {weeks.map((week) => (
                    <WeekEditor
                        key={week.id}
                        week={week}
                        onDelete={() => handleDeleteWeek(week.id)}
                        onUpdate={fetchWeeks}
                        onAddDay={() => handleAddDay(week.id)}
                    />
                ))}
            </div>
        </div>
    );
}
