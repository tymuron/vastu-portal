import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LiveStream } from '../../lib/types';
import { Plus, Trash2, Video, Save, X } from 'lucide-react';

export default function ManageStreams() {
    const [streams, setStreams] = useState<LiveStream[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<LiveStream>>({
        title: '',
        date: new Date().toISOString().split('T')[0],
        videoUrl: '',
        description: '',
        topics: '',
        bestQuestions: ''
    });

    useEffect(() => {
        fetchStreams();
    }, []);

    async function fetchStreams() {
        try {
            const { data, error } = await supabase
                .from('live_streams')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            setStreams(data || []);
        } catch (error) {
            console.error('Error fetching streams:', error);
            alert('Ошибка при загрузке эфиров');
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.title || !formData.date) return;

        try {
            const { error } = await supabase
                .from('live_streams')
                .insert([formData]);

            if (error) throw error;

            alert('Эфир успешно добавлен!');
            setIsEditing(false);
            setFormData({
                title: '',
                date: new Date().toISOString().split('T')[0],
                videoUrl: '',
                description: '',
                topics: '',
                bestQuestions: ''
            });
            fetchStreams();
        } catch (error: any) {
            console.error('Error adding stream:', error);
            alert(`Ошибка при сохранении: ${error.message || 'Неизвестная ошибка'}`);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Вы уверены, что хотите удалить этот эфир?')) return;

        try {
            const { error } = await supabase
                .from('live_streams')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchStreams();
        } catch (error) {
            console.error('Error deleting stream:', error);
            alert('Ошибка при удалении');
        }
    }

    if (loading) return <div className="p-8">Загрузка...</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-serif text-[#422326]">Управление Эфирами</h1>
                <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center px-4 py-2 bg-[#422326] text-white rounded-lg hover:bg-[#2b1618] transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Добавить Эфир
                </button>
            </div>

            {/* Add Form Modal/Panel */}
            {isEditing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F4F2ED]">
                            <h2 className="text-xl font-bold text-[#422326]">Новый Эфир</h2>
                            <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-red-500">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Название Эфира *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                        placeholder="Например: Эфир 1. Введение"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Дата Проведения *</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ссылка на Видео (YouTube) *</label>
                                <div className="relative">
                                    <Video className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                                    <input
                                        type="url"
                                        value={formData.videoUrl}
                                        onChange={e => setFormData({ ...formData, videoUrl: e.target.value })}
                                        className="w-full pl-10 rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                        placeholder="https://youtube.com/..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                                <textarea
                                    rows={3}
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                    placeholder="О чем был этот эфир?"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Темы (списком)</label>
                                    <textarea
                                        rows={4}
                                        value={formData.topics}
                                        onChange={e => setFormData({ ...formData, topics: e.target.value })}
                                        className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                        placeholder="1. Тема один&#10;2. Тема два"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Лучшие вопросы</label>
                                    <textarea
                                        rows={4}
                                        value={formData.bestQuestions}
                                        onChange={e => setFormData({ ...formData, bestQuestions: e.target.value })}
                                        className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                        placeholder="Вопрос 1?&#10;Вопрос 2?"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-[#422326] text-white rounded-lg hover:bg-[#2b1618] transition-colors flex items-center"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    Сохранить Эфир
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                {streams.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        Пока нет добавленных эфиров. Нажмите "Добавить Эфир", чтобы создать первый.
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB]">
                            {streams.map((stream) => (
                                <tr key={stream.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(stream.date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                        {stream.title}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <button
                                            onClick={() => handleDelete(stream.id)}
                                            className="text-red-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg"
                                            title="Удалить"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
