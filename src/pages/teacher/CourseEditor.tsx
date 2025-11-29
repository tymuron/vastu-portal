```javascript
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Edit2, ChevronDown, ChevronRight, Save, Upload, FileText, Video, X } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import FileUploader from '../../components/FileUploader';

// ... interfaces ...
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
    materials?: Material[];
}

interface Week {
    id: string;
    title: string;
    description: string;
    order_index: number;
    available_from?: string;
    days: Day[];
    materials?: Material[]; // Week-level materials
}

export default function CourseEditor() {
    const [weeks, setWeeks] = useState<Week[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});

    // ... fetchWeeks ...
    async function fetchWeeks() {
        try {
            const { data, error } = await supabase
                .from('weeks')
                .select(`
    *,
    days(
                        *,
        materials(*)
    ),
    materials(*)
        `)
                .order('order_index', { ascending: true });

            if (error) throw error;

            if (data) {
                // Sort days and materials
                const sortedWeeks: Week[] = data.map((week: any) => ({
                    id: week.id,
                    title: week.title,
                    description: week.description,
                    order_index: week.order_index,
                    days: week.days.sort((a: any, b: any) => a.order_index - b.order_index).map((day: any) => ({
                        id: day.id,
                        title: day.title,
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

    // ... Add/Delete Week/Day handlers (keep existing) ...
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


    // --- MATERIAL HANDLERS ---

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
                                        folder={`weeks / ${ week.id } `}
                                        onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name, week.id, undefined)} 
                                    />
                                </div>

                                {/* Days List */}
                                <div className="space-y-4 pl-4 border-l-2 border-gray-100">
                                    {week.days.map((day) => (
                                        <div key={day.id} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                            <div className="flex justify-between items-start mb-4">
                                                <h4 className="font-medium text-vastu-dark">{day.title}</h4>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleDeleteDay(day.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                                                </div>
                                            </div>

                                            {/* Day Materials */}
                                            <div className="space-y-2">
                                                {day.materials?.map(m => (
                                                    <div key={m.id} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 text-sm">
                                                        <div className="flex items-center gap-2">
                                                            {m.type === 'video' ? <Video size={14} className="text-blue-500" /> : <FileText size={14} className="text-orange-500" />}
                                                            <a href={m.url} target="_blank" rel="noreferrer" className="hover:underline text-blue-600">{m.title}</a>
                                                        </div>
                                                        <button onClick={() => handleDeleteMaterial(m.id)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                                                    </div>
                                                ))}
                                                
                                                <div className="mt-2">
                                                    <FileUploader 
                                                        folder={`days / ${ day.id } `}
                                                        onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name, undefined, day.id)} 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => {
                                                const newTitle = window.prompt('Новое название урока:', day.title);
                                                if (newTitle) {
                                                    supabase.from('days').update({ title: newTitle }).eq('id', day.id).then(() => fetchWeeks());
                                                }
                                            }}
                                            className="text-xs text-vastu-gold hover:underline"
                                        >
                                            Редактировать
                                        </button>
                                        <div className="w-px h-3 bg-gray-300" />
                                        <button
                                            onClick={() => handleDeleteDay(day.id)}
                                            className="text-xs text-red-400 hover:underline"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={() => handleAddDay(week.id)}
                                className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-vastu-gold/50 hover:text-vastu-gold transition-all flex items-center justify-center gap-2 text-sm font-medium mt-2"
                            >
                                <Plus size={16} />
                                Добавить урок
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
