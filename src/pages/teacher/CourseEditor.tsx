import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, GripVertical, Video, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Week } from '../../lib/types';

export default function CourseEditor() {
    const [weeks, setWeeks] = useState<Week[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchWeeks();
    }, []);

    async function fetchWeeks() {
        try {
            const { data, error } = await supabase
                .from('weeks')
                .select(`*, days (*), materials (*)`)
                .order('order_index', { ascending: true });

            if (error) throw error;

            if (data) {
                const transformedWeeks: Week[] = data.map((w) => ({
                    id: w.id,
                    title: w.title,
                    description: w.description,
                    isLocked: w.is_locked,
                    availableFrom: w.available_from,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    days: w.days.sort((a: any, b: any) => a.order_index - b.order_index).map((d: any) => ({
                        id: d.id,
                        title: d.title,
                        description: d.description,
                        videoUrl: d.video_url,
                        materials: []
                    })),
                    weekMaterials: []
                }));
                setWeeks(transformedWeeks);
            }
        } catch (error) {
            console.error('Error fetching weeks:', error);
        } finally {
            setLoading(false);
        }
    }

    const handleAddWeek = async () => {
        const title = window.prompt('Введите название новой недели:');
        if (!title) return;

        try {
            const { error } = await supabase.from('weeks').insert([{
                title,
                description: 'Новая неделя',
                order_index: weeks.length + 1
            }]);

            if (error) throw error;
            fetchWeeks();
        } catch (error) {
            alert('Ошибка при создании недели');
            console.error(error);
        }
    };

    const handleDeleteWeek = async (id: string) => {
        if (!window.confirm('Вы уверены, что хотите удалить эту неделю?')) return;

        try {
            const { error } = await supabase.from('weeks').delete().eq('id', id);
            if (error) throw error;
            fetchWeeks();
        } catch (error) {
            alert('Ошибка при удалении');
            console.error(error);
        }
    };

    const handleAddDay = async (weekId: string) => {
        const title = window.prompt('Введите название урока:');
        if (!title) return;

        try {
            const { error } = await supabase.from('days').insert([{
                week_id: weekId,
                title,
                description: 'Описание урока',
                order_index: 0 // Logic to put at end could be added
            }]);

            if (error) throw error;
            fetchWeeks();
        } catch (error) {
            alert('Ошибка при создании урока');
            console.error(error);
        }
    };

    const handleDeleteDay = async (id: string) => {
        if (!window.confirm('Удалить этот урок?')) return;
        try {
            const { error } = await supabase.from('days').delete().eq('id', id);
            if (error) throw error;
            fetchWeeks();
        } catch (error) {
            alert('Ошибка при удалении урока');
            console.error(error);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-vastu-gold" size={40} /></div>;

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-serif text-vastu-dark mb-2">Структура курса</h1>
                    <p className="text-gray-500">Управление неделями и уроками</p>
                </div>
                <button
                    onClick={handleAddWeek}
                    className="bg-vastu-dark text-vastu-gold px-4 py-2 rounded-lg font-medium hover:bg-vastu-dark/90 transition-colors flex items-center gap-2"
                >
                    <Plus size={18} />
                    Добавить неделю
                </button>
            </div>

            <div className="space-y-6">
                {weeks.map((week) => (
                    <div key={week.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Week Header */}
                        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button className="text-gray-400 hover:text-gray-600 cursor-move">
                                    <GripVertical size={20} />
                                </button>
                                <div>
                                    <h3 className="font-medium text-lg text-vastu-dark">{week.title}</h3>
                                    <p className="text-sm text-gray-500">{week.days.length} уроков • {week.isLocked ? 'Скрыта' : 'Опубликована'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        const newTitle = window.prompt('Новое название:', week.title);
                                        if (newTitle) {
                                            supabase.from('weeks').update({ title: newTitle }).eq('id', week.id).then(() => fetchWeeks());
                                        }
                                    }}
                                    className="p-2 text-gray-500 hover:text-vastu-dark hover:bg-white rounded-lg transition-colors"
                                >
                                    <Edit2 size={18} />
                                </button>
                                <button
                                    onClick={() => handleDeleteWeek(week.id)}
                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Days List */}
                        <div className="p-4 space-y-2">
                            {week.days.map((day) => (
                                <div key={day.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-vastu-gold/30 bg-white group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-vastu-light flex items-center justify-center text-vastu-gold">
                                            <Video size={16} />
                                        </div>
                                        <span className="font-medium text-gray-700">{day.title}</span>
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
