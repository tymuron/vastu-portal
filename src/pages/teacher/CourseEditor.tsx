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
        if (!error) fetchWeeks();
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
            alert('Ошибка сохранения материала');
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
                            <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => toggleWeek(week.id)}>
                                {expandedWeeks[week.id] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                <div>
                                    <h3 className="font-serif text-lg font-medium">{week.title}</h3>
                                    {week.available_from && (
                                        <p className="text-xs text-gray-500">
                                            Доступно с: {new Date(week.available_from).toLocaleDateString()}
                                        </p>
                                    )}
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
                                                    <span className="truncate">{m.title}</span>
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

                                {/* Days List */}
                                <div className="space-y-4 pl-4 border-l-2 border-gray-100">
                                    {week.days.map((day) => (
                                        <div key={day.id} className="bg-gray-50 p-6 rounded-xl border border-gray-100 transition-all hover:border-vastu-gold/30 hover:shadow-sm">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="flex-1 mr-4">
                                                    <input
                                                        type="text"
                                                        defaultValue={day.title}
                                                        className="text-lg font-medium text-vastu-dark bg-transparent border-b border-transparent hover:border-gray-300 focus:border-vastu-gold focus:outline-none w-full transition-colors mb-2"
                                                        onBlur={(e) => {
                                                            if (e.target.value !== day.title) {
                                                                supabase.from('days').update({ title: e.target.value }).eq('id', day.id).then(() => fetchWeeks());
                                                            }
                                                        }}
                                                    />
                                                    <div className="space-y-3">
                                                        <textarea
                                                            placeholder="Описание урока..."
                                                            defaultValue={day.description || ''}
                                                            className="w-full text-sm text-gray-600 bg-white border border-gray-200 rounded-lg p-3 focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold focus:outline-none resize-y min-h-[80px]"
                                                            onBlur={(e) => {
                                                                supabase.from('days').update({ description: e.target.value }).eq('id', day.id).then(() => fetchWeeks());
                                                            }}
                                                        />
                                                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 focus-within:border-vastu-gold focus-within:ring-1 focus-within:ring-vastu-gold">
                                                            <Video size={16} className="text-gray-400" />
                                                            <input
                                                                type="text"
                                                                placeholder="Ссылка на основное видео (Vimeo/YouTube)"
                                                                defaultValue={day.video_url || ''}
                                                                className="flex-1 text-sm text-gray-700 focus:outline-none"
                                                                onBlur={(e) => {
                                                                    supabase.from('days').update({ video_url: e.target.value }).eq('id', day.id).then(() => fetchWeeks());
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteDay(day.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"><Trash2 size={18} /></button>
                                            </div>

                                            {/* Day Materials */}
                                            <div className="space-y-3">
                                                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Дополнительные материалы</h5>
                                                {day.materials?.map(m => (
                                                    <div key={m.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 text-sm hover:border-vastu-gold/30 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-md ${m.type === 'video' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'}`}>
                                                                {m.type === 'video' ? <Video size={16} /> : <FileText size={16} />}
                                                            </div>
                                                            <a href={m.url} target="_blank" rel="noreferrer" className="font-medium text-gray-700 hover:text-vastu-gold transition-colors">{m.title}</a>
                                                        </div>
                                                        <button onClick={() => handleDeleteMaterial(m.id)} className="text-gray-400 hover:text-red-500 p-1"><X size={16} /></button>
                                                    </div>
                                                ))}

                                                <div className="mt-4">
                                                    <FileUploader
                                                        folder={`days/${day.id}`}
                                                        onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name, undefined, day.id)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <button onClick={() => handleAddDay(week.id)} className="flex items-center gap-2 text-sm text-vastu-dark/60 hover:text-vastu-dark mt-2">
                                        <Plus size={16} /> Добавить урок
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
