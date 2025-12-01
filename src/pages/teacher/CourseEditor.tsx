import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, ChevronDown, ChevronRight, FileText, Video, X } from 'lucide-react';
import { Loader2 } from 'lucide-react';
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

export default function CourseEditor() {
    const [weeks, setWeeks] = useState<Week[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});

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

    const toggleWeek = (id: string) => {
        setExpandedWeeks(prev => ({ ...prev, [id]: !prev[id] }));
    };

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

    const handleDeleteDay = async (id: string) => {
        if (!window.confirm('Удалить урок?')) return;
        const { error } = await supabase.from('days').delete().eq('id', id);
        if (!error) fetchWeeks();
    };

    const handleAddMaterial = async (url: string, type: string, name: string, weekId?: string, dayId?: string) => {
        const { error } = await supabase.from('materials').insert([{
            title: name,
            type,
            url,
            week_id: weekId,
            day_id: dayId
        }]);

        if (error) {
            alert('Ошибка сохранения материала: ' + error.message);
            console.error(error);
        } else {
            fetchWeeks();
        }
    };

    const handleDeleteMaterial = async (id: string) => {
        if (!window.confirm('Удалить материал?')) return;
        const { error } = await supabase.from('materials').delete().eq('id', id);
        if (!error) fetchWeeks();
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
                    <div key={week.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        {/* Week Header */}
                        <div className="p-4 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                                <button onClick={() => toggleWeek(week.id)} className="p-1 -ml-1">
                                    {expandedWeeks[week.id] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                </button>
                                <div className="flex items-center justify-between flex-1">
                                    <input
                                        defaultValue={week.title}
                                        className="text-xl font-bold text-[#422326] bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#422326] focus:outline-none px-1 py-0.5 w-full mr-4"
                                        onBlur={(e) => {
                                            if (e.target.value !== week.title) {
                                                supabase
                                                    .from('weeks')
                                                    .update({ title: e.target.value })
                                                    .eq('id', week.id)
                                                    .then(() => fetchWeeks());
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()} // Prevent toggling week when editing title
                                    />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent toggling week when adding day
                                            handleAddDay(week.id);
                                        }}
                                        className="flex items-center text-sm text-[#422326] hover:text-[#2b1618] whitespace-nowrap"
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
                                    value={week.available_from ? new Date(week.available_from).toISOString().split('T')[0] : ''}
                                    onChange={async (e) => {
                                        const date = e.target.value ? new Date(e.target.value).toISOString() : null;
                                        const { error } = await supabase.from('weeks').update({ available_from: date }).eq('id', week.id);
                                        if (!error) fetchWeeks();
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <button onClick={() => handleDeleteWeek(week.id)} className="p-2 text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                            </div>
                        </div>

                        {/* Week Content */}
                        {expandedWeeks[week.id] && (
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
                                                                supabase.from('materials').update({ title: e.target.value }).eq('id', m.id).then(() => fetchWeeks());
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
                                        onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name, week.id, undefined)}
                                    />
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
                                            <div key={day.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm transition-all hover:border-vastu-gold/50 hover:shadow-md">
                                                <div className="flex justify-between items-start mb-6">
                                                    <div className="flex-1 mr-4 space-y-4">
                                                        {/* Day Title */}
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Название урока</label>
                                                            <input
                                                                type="text"
                                                                defaultValue={day.title}
                                                                className="text-lg font-medium text-vastu-dark bg-transparent border-b border-gray-200 hover:border-vastu-gold focus:border-vastu-gold focus:outline-none w-full transition-colors py-1"
                                                                onBlur={(e) => {
                                                                    if (e.target.value !== day.title) {
                                                                        supabase.from('days').update({ title: e.target.value }).eq('id', day.id).then(() => fetchWeeks());
                                                                    }
                                                                }}
                                                            />
                                                        </div>

                                                        {/* Day Description */}
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Описание</label>
                                                            <textarea
                                                                placeholder="Краткое описание урока..."
                                                                defaultValue={day.description || ''}
                                                                className="w-full text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold focus:outline-none resize-y min-h-[80px]"
                                                                onBlur={(e) => {
                                                                    supabase.from('days').update({ description: e.target.value }).eq('id', day.id).then(() => fetchWeeks());
                                                                }}
                                                            />
                                                        </div>

                                                        {/* Video URL */}
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Основное Видео</label>
                                                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-vastu-gold focus-within:ring-1 focus-within:ring-vastu-gold">
                                                                <Video size={16} className="text-gray-400" />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Ссылка на видео (Vimeo/YouTube)"
                                                                    defaultValue={day.video_url || ''}
                                                                    className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none"
                                                                    onBlur={(e) => {
                                                                        supabase.from('days').update({ video_url: e.target.value }).eq('id', day.id).then(() => fetchWeeks());
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Day Date */}
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Дата урока (Календарь)</label>
                                                            <input
                                                                type="date"
                                                                defaultValue={day.date ? new Date(day.date).toISOString().split('T')[0] : ''}
                                                                className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold focus:outline-none"
                                                                onChange={(e) => {
                                                                    const date = e.target.value ? new Date(e.target.value).toISOString() : null;
                                                                    supabase.from('days').update({ date }).eq('id', day.id).then(() => fetchWeeks());
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleDeleteDay(day.id)} className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors" title="Удалить урок"><Trash2 size={18} /></button>
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
                                                                                    supabase.from('materials').update({ title: e.target.value }).eq('id', m.id).then(() => fetchWeeks());
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
                                                        onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name, undefined, day.id)}
                                                    />
                                                </div>
                                            </div>
                                        ))}

                                        <button
                                            onClick={() => handleAddDay(week.id)}
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
                ))}
            </div>
        </div>
    );
}
