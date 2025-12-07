import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, ChevronDown, ChevronRight, FileText, Video, X, Save, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import FileUploader from '../../components/FileUploader';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface Material {
    id: string;
    title: string;
    type: 'video' | 'pdf' | 'doc' | 'link' | 'zip';
    url: string;
    week_id?: string;
    day_id?: string;
    is_homework?: boolean;
}

interface Day {
    id: string;
    title: string;
    order_index: number;
    description?: string;
    homework_description?: string;
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

const DayEditor = ({ day, onDelete, onUpdate, onMoveUp, onMoveDown, isFirst, isLast }: {
    day: Day,
    onDelete: () => void,
    onUpdate: () => void,
    onMoveUp: () => void,
    onMoveDown: () => void,
    isFirst: boolean,
    isLast: boolean
}) => {
    const [localDay, setLocalDay] = useState(day);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

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
                    homework_description: localDay.homework_description,
                    video_url: localDay.video_url,
                    rutube_url: localDay.rutube_url,
                    date: localDay.date
                })
                .eq('id', day.id);

            if (error) throw error;
            setIsDirty(false);
            onUpdate();
        } catch (error) {
            console.error('Error saving day:', error);
            alert('Ошибка при сохранении урока');
        } finally {
            setSaving(false);
        }
    };

    const handleAddMaterial = async (url: string, type: string, name: string, isHomework = false) => {
        const { error } = await supabase.from('materials').insert([{
            title: name,
            type,
            url,
            day_id: day.id,
            is_homework: isHomework
        }]);
        if (!error) onUpdate();
    };

    const handleDeleteMaterial = async (id: string) => {
        if (!window.confirm('Удалить материал?')) return;
        const { error } = await supabase.from('materials').delete().eq('id', id);
        if (!error) onUpdate();
    };

    const lessonMaterials = day.materials?.filter(m => !m.is_homework) || [];
    const homeworkMaterials = day.materials?.filter(m => m.is_homework) || [];

    const modules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link', 'clean']
        ],
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm transition-all hover:border-vastu-gold/50 hover:shadow-md">
            <div className="flex justify-between items-start mb-6">
                <div className="flex-1 mr-4 space-y-6">
                    {/* Header: Title and Reorder */}
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Название урока</label>
                            <input
                                type="text"
                                value={localDay.title}
                                onChange={(e) => handleChange('title', e.target.value)}
                                className="text-lg font-medium text-vastu-dark bg-transparent border-b border-gray-200 hover:border-vastu-gold focus:border-vastu-gold focus:outline-none w-full transition-colors py-1"
                            />
                        </div>
                        <div className="flex bg-gray-50 rounded-lg p-1">
                            <button onClick={onMoveUp} disabled={isFirst} className="p-1.5 text-gray-400 hover:text-vastu-dark disabled:opacity-30">
                                <ArrowUp size={16} />
                            </button>
                            <button onClick={onMoveDown} disabled={isLast} className="p-1.5 text-gray-400 hover:text-vastu-dark disabled:opacity-30">
                                <ArrowDown size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Day Description (Rich Text) */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Описание урока</label>
                        <ReactQuill
                            theme="snow"
                            value={localDay.description || ''}
                            onChange={(value) => handleChange('description', value)}
                            modules={modules}
                            className="bg-white rounded-lg"
                        />
                    </div>

                    {/* Videos */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">YouTube</label>
                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                <Video size={16} className="text-gray-400" />
                                <input
                                    type="text"
                                    value={localDay.video_url || ''}
                                    onChange={(e) => handleChange('video_url', e.target.value)}
                                    className="flex-1 text-sm bg-transparent focus:outline-none"
                                    placeholder="YouTube URL"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Rutube</label>
                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                <Video size={16} className="text-[#00A551]" />
                                <input
                                    type="text"
                                    value={localDay.rutube_url || ''}
                                    onChange={(e) => handleChange('rutube_url', e.target.value)}
                                    className="flex-1 text-sm bg-transparent focus:outline-none"
                                    placeholder="Rutube URL"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Homework Section */}
                    <div className="border-t border-gray-100 pt-6">
                        <label className="block text-xs font-bold text-vastu-gold uppercase tracking-wider mb-4 flex items-center gap-2">
                            <FileText size={16} /> Домашнее Задание
                        </label>

                        <div className="space-y-4">
                            <ReactQuill
                                theme="snow"
                                value={localDay.homework_description || ''}
                                onChange={(value) => handleChange('homework_description', value)}
                                modules={modules}
                                placeholder="Опишите домашнее задание..."
                                className="bg-white rounded-lg"
                            />

                            {/* Homework Materials */}
                            <div>
                                <div className="space-y-2 mb-3">
                                    {homeworkMaterials.map(m => (
                                        <div key={m.id} className="flex items-center justify-between bg-orange-50 p-2 rounded border border-orange-100 text-sm">
                                            <span className="truncate flex-1 font-medium text-orange-800">{m.title}</span>
                                            <button onClick={() => handleDeleteMaterial(m.id)} className="text-orange-400 hover:text-red-500"><X size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <FileUploader
                                        folder={`homework/${day.id}`}
                                        onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name, true)}
                                        label="Прикрепить файл"
                                        compact
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Actions */}
                <div className="flex flex-col gap-2 sticky top-4">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className={`p-2 rounded-lg transition-colors ${isDirty ? 'bg-vastu-gold text-white shadow-lg scale-105' : 'bg-gray-100 text-gray-400'}`}
                        title="Сохранить"
                    >
                        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    </button>
                    <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50" title="Удалить урок">
                        <Trash2 size={20} />
                    </button>
                </div>
            </div>

            {/* Lesson Materials (Non-Homework) */}
            <div className="mt-4 pt-4 border-t border-gray-100">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Материалы к уроку</h5>
                <div className="space-y-2 mb-3">
                    {lessonMaterials.map(m => (
                        <div key={m.id} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-200 text-sm">
                            <span className="truncate flex-1">{m.title}</span>
                            <button onClick={() => handleDeleteMaterial(m.id)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <FileUploader
                        folder={`days/${day.id}`}
                        onUploadComplete={(url, type, name) => handleAddMaterial(url, type, name, false)}
                        compact
                    />
                    <button
                        onClick={() => {
                            const url = window.prompt('URL:');
                            if (url) handleAddMaterial(url, 'link', window.prompt('Название:', 'Ссылка') || 'Ссылка', false);
                        }}
                        className="px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-vastu-gold hover:text-vastu-gold"
                    >
                        + Ссылка
                    </button>
                </div>
            </div>
        </div>
    );
};

const WeekEditor = ({ week, onDelete, onUpdate, onAddDay, onMoveUp, onMoveDown, isFirst, isLast }: {
    week: Week,
    onDelete: () => void,
    onUpdate: () => void,
    onAddDay: () => void,
    onMoveUp: () => void,
    onMoveDown: () => void,
    isFirst: boolean,
    isLast: boolean
}) => {
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
                    <button onClick={onMoveUp} disabled={isFirst} className="p-2 text-gray-400 hover:text-vastu-dark disabled:opacity-30 disabled:hover:text-gray-400">
                        ↑
                    </button>
                    <button onClick={onMoveDown} disabled={isLast} className="p-2 text-gray-400 hover:text-vastu-dark disabled:opacity-30 disabled:hover:text-gray-400">
                        ↓
                    </button>
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

                            {week.days
                                .sort((a, b) => a.order_index - b.order_index)
                                .map((day, index) => (
                                    <DayEditor
                                        key={day.id}
                                        day={day}
                                        onDelete={() => {
                                            if (window.confirm('Удалить урок?')) {
                                                supabase.from('days').delete().eq('id', day.id).then(() => onUpdate());
                                            }
                                        }}
                                        onUpdate={onUpdate}
                                        isFirst={index === 0}
                                        isLast={index === week.days.length - 1}
                                        onMoveUp={async () => {
                                            if (index > 0) {
                                                const days = week.days.sort((a, b) => a.order_index - b.order_index);
                                                const prevDay = days[index - 1];
                                                const currentDay = days[index];

                                                await supabase.from('days').update({ order_index: prevDay.order_index }).eq('id', currentDay.id);
                                                await supabase.from('days').update({ order_index: currentDay.order_index }).eq('id', prevDay.id);
                                                onUpdate();
                                            }
                                        }}
                                        onMoveDown={async () => {
                                            if (index < week.days.length - 1) {
                                                const days = week.days.sort((a, b) => a.order_index - b.order_index);
                                                const nextDay = days[index + 1];
                                                const currentDay = days[index];

                                                await supabase.from('days').update({ order_index: nextDay.order_index }).eq('id', currentDay.id);
                                                await supabase.from('days').update({ order_index: currentDay.order_index }).eq('id', nextDay.id);
                                                onUpdate();
                                            }
                                        }}
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
                        homework_description: day.homework_description,
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
                {weeks.map((week, index) => (
                    <WeekEditor
                        key={week.id}
                        week={week}
                        onDelete={() => handleDeleteWeek(week.id)}
                        onUpdate={fetchWeeks}
                        onAddDay={() => handleAddDay(week.id)}
                        onMoveUp={async () => {
                            if (index > 0) {
                                const prevWeek = weeks[index - 1];
                                const currentWeek = weeks[index];

                                // Swap order_index
                                const { error: error1 } = await supabase.from('weeks').update({ order_index: prevWeek.order_index }).eq('id', currentWeek.id);
                                const { error: error2 } = await supabase.from('weeks').update({ order_index: currentWeek.order_index }).eq('id', prevWeek.id);

                                if (error1 || error2) {
                                    alert('Ошибка при перемещении');
                                    console.error(error1, error2);
                                }
                                fetchWeeks();
                            }
                        }}
                        onMoveDown={async () => {
                            if (index < weeks.length - 1) {
                                const nextWeek = weeks[index + 1];
                                const currentWeek = weeks[index];

                                // Swap order_index
                                const { error: error1 } = await supabase.from('weeks').update({ order_index: nextWeek.order_index }).eq('id', currentWeek.id);
                                const { error: error2 } = await supabase.from('weeks').update({ order_index: currentWeek.order_index }).eq('id', nextWeek.id);

                                if (error1 || error2) {
                                    alert('Ошибка при перемещении');
                                    console.error(error1, error2);
                                }
                                fetchWeeks();
                            }
                        }}
                        isFirst={index === 0}
                        isLast={index === weeks.length - 1}
                    />
                ))}
            </div>
        </div>
    );
}
