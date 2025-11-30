import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LibraryItem, LibraryCategory } from '../../lib/types';
import { Download, ExternalLink, CheckSquare, Table, BookOpen, FileText } from 'lucide-react';

export default function Library() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<LibraryCategory>('checklist');

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

    if (loading) return <div className="p-8 text-center">Загрузка библиотеки...</div>;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-serif text-[#422326] mb-2">Библиотека Материалов</h1>
                <p className="text-gray-600">Полезные чек-листы, таблицы и гайды для обучения.</p>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-1">
                {categories.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`px-6 py-3 rounded-t-lg font-medium transition-all flex items-center gap-2 ${activeCategory === cat.id
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
                            <a
                                href={item.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-gray-400 hover:text-[#422326] transition-colors"
                                title="Открыть"
                            >
                                <ExternalLink className="w-5 h-5" />
                            </a>
                        </div>

                        <h3 className="font-serif text-lg text-[#422326] mb-2 leading-tight">
                            {item.title}
                        </h3>

                        {item.description && (
                            <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                                {item.description}
                            </p>
                        )}

                        <a
                            href={item.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-sm font-medium text-[#CABC90] hover:text-[#422326] transition-colors"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Скачать материал
                        </a>
                    </div>
                ))}
            </div>

            {filteredItems.length === 0 && (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-gray-500">В этой категории пока нет материалов.</p>
                </div>
            )}
        </div>
    );
}
