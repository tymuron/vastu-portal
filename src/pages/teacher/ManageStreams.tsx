import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LiveStream } from '../../lib/types';
import { Plus, Trash2, Video, Save, X } from 'lucide-react';

export default function ManageStreams() {
    const [streams, setStreams] = useState<LiveStream[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<LiveStream>>({
        title: '',
        date: new Date().toISOString().split('T')[0],
        video_url: '',
        description: '',
        audio_url: ''
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
        } catch (error: any) {
            console.error('Error fetching streams:', error);
            alert('Ошибка при загрузке эфиров');
        } finally {
            setLoading(false);
        }
    }

    function handleEdit(stream: LiveStream) {
        setFormData({
            title: stream.title,
            date: new Date(stream.date).toISOString().split('T')[0],
            video_url: stream.video_url,
            description: stream.description,
            audio_url: stream.audio_url
        });
        setEditingId(stream.id);
        setIsEditing(true);
    }

    function handleAddNew() {
        setFormData({
            title: '',
            date: new Date().toISOString().split('T')[0],
            video_url: '',
            description: '',
            audio_url: ''
        });
        setEditingId(null);
        setIsEditing(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.title || !formData.date) return;

        try {
            let error;
            if (editingId) {
                // Update existing
                const { error: updateError } = await supabase
                    .from('live_streams')
                    .update(formData)
                    .eq('id', editingId);
                error = updateError;
            } else {
                // Insert new
                const { error: insertError } = await supabase
                    .from('live_streams')
                    .insert([formData]);
                error = insertError;
            }

            if (error) throw error;

            alert(editingId ? 'Эфир успешно обновлен!' : 'Эфир успешно добавлен!');
            setIsEditing(false);
            setEditingId(null);
            setFormData({
                title: '',
                date: new Date().toISOString().split('T')[0],
                video_url: '',
                description: '',
                audio_url: ''
            });
            fetchStreams();
        } catch (error: any) {
            console.error('Error saving stream:', error);
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
                    onClick={handleAddNew}
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
                            <h2 className="text-xl font-bold text-[#422326]">
                                {editingId ? 'Редактировать Эфир' : 'Новый Эфир'}
                            </h2>
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Ссылка на YouTube *
                                </label>
                                <div className="relative">
                                    <Video className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="url"
                                        required
                                        value={formData.video_url}
                                        onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#422326] focus:border-transparent outline-none transition-all"
                                        placeholder="https://youtube.com/..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Ссылка на Rutube (опционально)
                                </label>
                                <div className="relative">
                                    <Video className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="url"
                                        value={formData.rutube_url || ''}
                                        onChange={(e) => setFormData({ ...formData, rutube_url: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#422326] focus:border-transparent outline-none transition-all"
                                        placeholder="https://rutube.ru/..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Аудиозапись (для скачивания)</label>

                                <div className="flex gap-4 mb-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="audioUploadType"
                                            checked={!formData.audio_url?.startsWith('http')}
                                            onChange={() => setFormData({ ...formData, audio_url: '' })}
                                            className="text-[#422326] focus:ring-[#422326]"
                                        />
                                        <span className="text-sm">Загрузить файл</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="audioUploadType"
                                            checked={formData.audio_url?.startsWith('http') || false}
                                            onChange={() => setFormData({ ...formData, audio_url: 'https://' })}
                                            className="text-[#422326] focus:ring-[#422326]"
                                        />
                                        <span className="text-sm">Внешняя ссылка</span>
                                    </label>
                                </div>

                                {formData.audio_url?.startsWith('http') ? (
                                    <input
                                        type="url"
                                        value={formData.audio_url}
                                        onChange={e => setFormData({ ...formData, audio_url: e.target.value })}
                                        className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                        placeholder="https://..."
                                    />
                                ) : (
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#422326] transition-colors relative">
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                try {
                                                    setLoading(true);
                                                    const fileExt = file.name.split('.').pop();
                                                    const fileName = `${Math.random()}.${fileExt}`;
                                                    const filePath = `${fileName}`;

                                                    const { error: uploadError } = await supabase.storage
                                                        .from('stream_audio')
                                                        .upload(filePath, file);

                                                    if (uploadError) throw uploadError;

                                                    const { data: { publicUrl } } = supabase.storage
                                                        .from('stream_audio')
                                                        .getPublicUrl(filePath);

                                                    setFormData({ ...formData, audio_url: publicUrl });
                                                } catch (error) {
                                                    console.error('Error uploading audio:', error);
                                                    alert('Ошибка при загрузке аудио');
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <div className="space-y-2 pointer-events-none">
                                            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                                                <Plus className="w-6 h-6" />
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                {formData.audio_url ? (
                                                    <span className="text-green-600 font-medium">Аудио загружено!</span>
                                                ) : (
                                                    <span>Нажмите для выбора аудио</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400">MP3, M4A до 50MB</p>
                                        </div>
                                    </div>
                                )}
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
                                    {editingId ? 'Сохранить Изменения' : 'Сохранить Эфир'}
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
                    <>
                        {/* Desktop Table */}
                        <table className="w-full hidden md:table">
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
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleEdit(stream)}
                                                    className="text-blue-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg"
                                                    title="Редактировать"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(stream.id)}
                                                    className="text-red-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg"
                                                    title="Удалить"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Mobile Cards */}
                        <div className="md:hidden divide-y divide-[#E5E7EB]">
                            {streams.map((stream) => (
                                <div key={stream.id} className="p-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">{new Date(stream.date).toLocaleDateString()}</div>
                                        <div className="font-medium text-gray-900">{stream.title}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEdit(stream)}
                                            className="text-blue-400 hover:text-blue-600 p-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(stream.id)}
                                            className="text-red-400 hover:text-red-600 p-2"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Mobile FAB */}
            <button
                onClick={handleAddNew}
                className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-[#422326] text-white rounded-full shadow-xl flex items-center justify-center z-40 hover:scale-110 transition-transform"
            >
                <Plus className="w-8 h-8" />
            </button>
        </div>
    );
}
