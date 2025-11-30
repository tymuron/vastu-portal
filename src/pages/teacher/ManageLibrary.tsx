import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LibraryItem, LibraryCategory } from '../../lib/types';
import { Plus, Trash2, FileText, Save, X, Link as LinkIcon } from 'lucide-react';

export default function ManageLibrary() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<LibraryItem>>({
        title: '',
        category: 'checklist',
        file_url: '',
        description: ''
    });

    useEffect(() => {
        fetchLibrary();
    }, []);

    async function fetchLibrary() {
        try {
            const { data, error } = await supabase
                .from('library_items')
                .select('*')
                .order('title');

            if (error) throw error;
            setItems(data || []);
        } catch (error) {
            console.error('Error fetching library:', error);
            alert('Ошибка при загрузке библиотеки');
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.title || !formData.file_url) return;

        try {
            const { error } = await supabase
                .from('library_items')
                .insert([formData]);

            if (error) throw error;

            alert('Материал успешно добавлен!');
            setIsEditing(false);
            setFormData({
                title: '',
                category: 'checklist',
                file_url: '',
                description: ''
            });
            fetchLibrary();
        } catch (error: any) {
            console.error('Error adding item:', error);
            alert(`Ошибка при сохранении: ${error.message || 'Неизвестная ошибка'}`);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Вы уверены, что хотите удалить этот материал?')) return;

        try {
            const { error } = await supabase
                .from('library_items')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchLibrary();
        } catch (error) {
            console.error('Error deleting item:', error);
            alert('Ошибка при удалении');
        }
    }

    const categories: { id: LibraryCategory; label: string }[] = [
        { id: 'checklist', label: 'Чек-лист' },
        { id: 'table', label: 'Таблица' },
        { id: 'guide', label: 'Гайд' },
        { id: 'pdf', label: 'PDF Урока' },
    ];

    if (loading) return <div className="p-8">Загрузка...</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-serif text-[#422326]">Управление Библиотекой</h1>
                <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center px-4 py-2 bg-[#422326] text-white rounded-lg hover:bg-[#2b1618] transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Добавить Материал
                </button>
            </div>

            {/* Add Form Modal/Panel */}
            {isEditing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F4F2ED]">
                            <h2 className="text-xl font-bold text-[#422326]">Новый Материал</h2>
                            <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-red-500">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                    placeholder="Например: Чек-лист спальни"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Категория *</label>
                                <select
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value as LibraryCategory })}
                                    className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                >
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ссылка на файл (PDF/Google Drive) *</label>
                                <div className="relative">
                                    <LinkIcon className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                                    <input
                                        type="url"
                                        required
                                        value={formData.file_url}
                                        onChange={e => setFormData({ ...formData, file_url: e.target.value })}
                                        className="w-full pl-10 rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Описание (опционально)</label>
                                <textarea
                                    rows={3}
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                    placeholder="Краткое описание..."
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
                                    Сохранить
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                {items.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        Пока нет материалов. Нажмите "Добавить Материал".
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Категория</th>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB]">
                            {items.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                        <div className="flex items-center">
                                            <FileText className="w-4 h-4 mr-2 text-gray-400" />
                                            {item.title}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium uppercase tracking-wide">
                                            {categories.find(c => c.id === item.category)?.label}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <button
                                            onClick={() => handleDelete(item.id)}
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
