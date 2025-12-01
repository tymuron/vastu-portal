import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LibraryItem, LibraryCategory } from '../../lib/types';
import { Plus, Trash2, FileText, Save, X, Link as LinkIcon, Upload } from 'lucide-react';

export default function ManageLibrary() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Drag & Drop State
    const [isDragging, setIsDragging] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);

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

    function handleEdit(item: LibraryItem) {
        setFormData({
            title: item.title,
            category: item.category,
            file_url: item.file_url,
            description: item.description
        });
        setEditingId(item.id);
        setIsEditing(true);
    }

    function handleAddNew() {
        setFormData({
            title: '',
            category: 'checklist',
            file_url: '',
            description: ''
        });
        setEditingId(null);
        setIsEditing(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.title || !formData.file_url) return;

        try {
            let error;
            if (editingId) {
                // Update existing
                const { error: updateError } = await supabase
                    .from('library_items')
                    .update(formData)
                    .eq('id', editingId);
                error = updateError;
            } else {
                // Insert new
                const { error: insertError } = await supabase
                    .from('library_items')
                    .insert([formData]);
                error = insertError;
            }

            if (error) throw error;

            alert(editingId ? 'Материал успешно обновлен!' : 'Материал успешно добавлен!');
            setIsEditing(false);
            setEditingId(null);
            setFormData({
                title: '',
                category: 'checklist',
                file_url: '',
                description: ''
            });
            fetchLibrary();
        } catch (error: any) {
            console.error('Error saving item:', error);
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

    // Drag & Drop Handlers
    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        const newUploadingFiles = files.map(f => f.name);
        setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

        let successCount = 0;

        for (const file of files) {
            try {
                // 1. Upload File
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('library_files')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('library_files')
                    .getPublicUrl(filePath);

                // 2. Create Library Item
                // Remove extension for title
                const title = file.name.replace(/\.[^/.]+$/, "");

                const { error: dbError } = await supabase
                    .from('library_items')
                    .insert([{
                        title: title,
                        category: 'checklist', // Default category
                        file_url: publicUrl,
                        description: 'Загружено перетаскиванием'
                    }]);

                if (dbError) throw dbError;
                successCount++;

            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);
                alert(`Ошибка при загрузке ${file.name}`);
            } finally {
                setUploadingFiles(prev => prev.filter(name => name !== file.name));
            }
        }

        if (successCount > 0) {
            fetchLibrary();
        }
    };

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
                    onClick={handleAddNew}
                    className="flex items-center px-4 py-2 bg-[#422326] text-white rounded-lg hover:bg-[#2b1618] transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Добавить Материал
                </button>
            </div>

            {/* Drag & Drop Zone */}
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`mb-8 border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${isDragging
                        ? 'border-[#422326] bg-[#422326]/5 scale-[1.02]'
                        : 'border-gray-300 hover:border-[#422326] hover:bg-gray-50'
                    }`}
            >
                <div className="flex flex-col items-center justify-center pointer-events-none">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${isDragging ? 'bg-[#422326] text-white' : 'bg-gray-100 text-gray-400'
                        }`}>
                        <Upload className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">
                        {isDragging ? 'Отпустите файлы для загрузки' : 'Перетащите файлы сюда'}
                    </h3>
                    <p className="text-sm text-gray-500 max-w-sm">
                        Загрузите сразу несколько файлов. Они автоматически добавятся в библиотеку как "Чек-листы".
                    </p>
                </div>
            </div>

            {/* Upload Progress */}
            {uploadingFiles.length > 0 && (
                <div className="mb-8 bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-blue-800 mb-2 flex items-center">
                        <div className="animate-spin mr-2 h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                        Загрузка файлов ({uploadingFiles.length})...
                    </h4>
                    <ul className="space-y-1">
                        {uploadingFiles.map((name, idx) => (
                            <li key={idx} className="text-xs text-blue-600 truncate">{name}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Add Form Modal/Panel */}
            {isEditing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F4F2ED]">
                            <h2 className="text-xl font-bold text-[#422326]">
                                {editingId ? 'Редактировать Материал' : 'Новый Материал'}
                            </h2>
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">Файл Материала *</label>

                                {/* Toggle Upload Type */}
                                <div className="flex gap-4 mb-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="uploadType"
                                            checked={!formData.file_url?.startsWith('http')}
                                            onChange={() => setFormData({ ...formData, file_url: '' })}
                                            className="text-[#422326] focus:ring-[#422326]"
                                        />
                                        <span className="text-sm">Загрузить файл</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="uploadType"
                                            checked={formData.file_url?.startsWith('http') || false}
                                            onChange={() => setFormData({ ...formData, file_url: 'https://' })}
                                            className="text-[#422326] focus:ring-[#422326]"
                                        />
                                        <span className="text-sm">Внешняя ссылка</span>
                                    </label>
                                </div>

                                {formData.file_url?.startsWith('http') ? (
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
                                ) : (
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#422326] transition-colors relative">
                                        <input
                                            type="file"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                try {
                                                    setLoading(true);
                                                    const fileExt = file.name.split('.').pop();
                                                    const fileName = `${Math.random()}.${fileExt}`;
                                                    const filePath = `${fileName}`;

                                                    const { error: uploadError } = await supabase.storage
                                                        .from('library_files')
                                                        .upload(filePath, file);

                                                    if (uploadError) throw uploadError;

                                                    const { data: { publicUrl } } = supabase.storage
                                                        .from('library_files')
                                                        .getPublicUrl(filePath);

                                                    setFormData({ ...formData, file_url: publicUrl });
                                                } catch (error) {
                                                    console.error('Error uploading file:', error);
                                                    alert('Ошибка при загрузке файла');
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
                                                {formData.file_url ? (
                                                    <span className="text-green-600 font-medium">Файл загружен!</span>
                                                ) : (
                                                    <span>Нажмите для выбора файла</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400">PDF, DOCX, XLSX до 10MB</p>
                                        </div>
                                    </div>
                                )}
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
                                    {editingId ? 'Сохранить Изменения' : 'Сохранить'}
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
                    <>
                        {/* Desktop Table */}
                        <table className="w-full hidden md:table">
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
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-blue-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg"
                                                    title="Редактировать"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
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
                            {items.map((item) => (
                                <div key={item.id} className="p-4 flex items-center justify-between">
                                    <div className="flex-1 pr-4">
                                        <div className="flex items-center mb-1">
                                            <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-medium uppercase tracking-wide text-gray-500 mr-2">
                                                {categories.find(c => c.id === item.category)?.label}
                                            </span>
                                        </div>
                                        <div className="font-medium text-gray-900 leading-tight">{item.title}</div>
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => handleEdit(item)}
                                            className="text-blue-400 hover:text-blue-600 p-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(item.id)}
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
