import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LibraryItem, LibraryCategory } from '../../lib/types';
import { Download, CheckSquare, Table, BookOpen, FileText, Eye, X } from 'lucide-react';

export default function Library() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<LibraryCategory>('checklist');
    const [previewFile, setPreviewFile] = useState<LibraryItem | null>(null);

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
        } finally {
            setLoading(false);
        }
    }

    const categories: { id: LibraryCategory; label: string; icon: any }[] = [
        { id: 'checklist', label: 'Чек-листы', icon: CheckSquare },
        { id: 'table', label: 'Таблицы', icon: Table },
        { id: 'guide', label: 'Гайды', icon: BookOpen },
        { id: 'pdf', label: 'Материалы уроков', icon: FileText },
    ];

    const filteredItems = items.filter(item => item.category === activeCategory);

    const getIcon = (category: LibraryCategory) => {
        switch (category) {
            case 'checklist': return <CheckSquare className="w-6 h-6" />;
            case 'table': return <Table className="w-6 h-6" />;
            case 'guide': return <BookOpen className="w-6 h-6" />;
            case 'pdf': return <FileText className="w-6 h-6" />;
            default: return <FileText className="w-6 h-6" />;
        }
    };

    const handlePreview = (item: LibraryItem) => {
        // Check if file is previewable (PDF or Image)
        const isPdf = item.file_url.toLowerCase().endsWith('.pdf');
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(item.file_url);

        if (isPdf || isImage) {
            setPreviewFile(item);
        } else {
            // Fallback to download/new tab
            window.open(item.file_url, '_blank');
        }
    };

    if (loading) return <div className="p-8 text-center">Загрузка библиотеки...</div>;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-serif text-[#422326] mb-2">Библиотека Материалов</h1>
                <p className="text-gray-600">Полезные чек-листы, таблицы и гайды для обучения.</p>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap gap-2 border-b border-gray-200 no-scrollbar">
                {categories.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`px-6 py-3 rounded-t-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${activeCategory === cat.id
                            ? 'bg-[#422326] text-white shadow-sm'
                            : 'bg-transparent text-gray-500 hover:text-[#422326] hover:bg-[#F4F2ED]'
                            }`}
                    >
                        <cat.icon className={`w-4 h-4 ${activeCategory === cat.id ? 'text-[#CABC90]' : ''}`} />
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map((item) => (
                    <div key={item.id} className="bg-white rounded-xl p-6 shadow-sm border border-[#E5E7EB] hover:shadow-md transition-shadow group">
                        <div className="flex items-start justify-between mb-4">
                            <div className="w-12 h-12 rounded-lg bg-[#F4F2ED] flex items-center justify-center text-[#422326] group-hover:bg-[#422326] group-hover:text-white transition-colors">
                                {getIcon(item.category)}
                            </div>
                            <button
                                onClick={() => handlePreview(item)}
                                className="text-gray-400 hover:text-[#422326] transition-colors"
                                title="Просмотр"
                            >
                                <Eye className="w-5 h-5" />
                            </button>
                        </div>

                        <h3 className="font-serif text-lg text-[#422326] mb-2 leading-tight">
                            {item.title}
                        </h3>

                        {item.description && (
                            <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                                {item.description}
                            </p>
                        )}

                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => handlePreview(item)}
                                className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-[#F4F2ED] text-[#422326] rounded-lg text-sm font-medium hover:bg-[#E5E0D8] transition-colors"
                            >
                                <Eye className="w-4 h-4 mr-2" />
                                Просмотр
                            </button>
                            <a
                                href={item.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center px-4 py-2 border border-[#E5E7EB] text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                title="Скачать"
                            >
                                <Download className="w-4 h-4" />
                            </a>
                        </div>
                    </div>
                ))}
            </div>

            {filteredItems.length === 0 && (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-gray-500">В этой категории пока нет материалов.</p>
                </div>
            )}

            {/* Preview Modal */}
            {previewFile && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 md:p-8">
                    <div className="bg-white rounded-xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-[#F4F2ED]">
                            <h3 className="font-serif text-lg text-[#422326] truncate pr-4">{previewFile.title}</h3>
                            <div className="flex items-center gap-2">
                                <a
                                    href={previewFile.file_url}
                                    download
                                    className="p-2 text-gray-500 hover:text-[#422326] hover:bg-white rounded-lg transition-colors"
                                    title="Скачать"
                                >
                                    <Download className="w-5 h-5" />
                                </a>
                                <button
                                    onClick={() => setPreviewFile(null)}
                                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-gray-100 overflow-hidden relative">
                            {previewFile.file_url.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    src={previewFile.file_url}
                                    className="w-full h-full"
                                    title={previewFile.title}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
                                    <img
                                        src={previewFile.file_url}
                                        alt={previewFile.title}
                                        className="max-w-full max-h-full object-contain shadow-lg"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
