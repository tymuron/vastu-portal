import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LibraryItem, LibraryCategory } from '../../lib/types';
import { FileText, Table, BookOpen, CheckSquare, Download, ExternalLink } from 'lucide-react';

export default function Library() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [activeTab, setActiveTab] = useState<LibraryCategory>('checklist');
    const [loading, setLoading] = useState(true);

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

    const tabs: { id: LibraryCategory; label: string; icon: any }[] = [
        { id: 'checklist', label: 'Чек-листы', icon: CheckSquare },
        { id: 'table', label: 'Таблицы', icon: Table },
        { id: 'guide', label: 'Гайды', icon: BookOpen },
        { id: 'pdf', label: 'PDF Уроков', icon: FileText },
    ];

    const filteredItems = items.filter(item => item.category === activeTab);

    if (loading) return <div className="p-8 text-center">Loading library...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-serif text-[#422326] mb-8">Библиотека Знаний</h1>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 pb-1">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center px-6 py-3 rounded-t-lg font-medium transition-all ${isActive
                                    ? 'bg-[#422326] text-white shadow-md translate-y-[1px]'
                                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-[#422326]'
                                }`}
                        >
                            <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-[#CABC90]' : ''}`} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        В этом разделе пока нет материалов.
                    </div>
                ) : (
                    filteredItems.map((item) => (
                        <div key={item.id} className="bg-white p-6 rounded-xl shadow-sm border border-[#E5E7EB] hover:shadow-md transition-shadow group">
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-3 bg-[#F4F2ED] rounded-lg text-[#422326] group-hover:bg-[#422326] group-hover:text-[#CABC90] transition-colors">
                                    {activeTab === 'checklist' && <CheckSquare className="w-6 h-6" />}
                                    {activeTab === 'table' && <Table className="w-6 h-6" />}
                                    {activeTab === 'guide' && <BookOpen className="w-6 h-6" />}
                                    {activeTab === 'pdf' && <FileText className="w-6 h-6" />}
                                </div>
                                <a
                                    href={item.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-gray-400 hover:text-[#422326] transition-colors"
                                    title="Открыть"
                                >
                                    <ExternalLink className="w-5 h-5" />
                                </a>
                            </div>

                            <h3 className="text-lg font-medium text-gray-900 mb-2 group-hover:text-[#422326] transition-colors">
                                {item.title}
                            </h3>

                            {item.description && (
                                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                                    {item.description}
                                </p>
                            )}

                            <a
                                href={item.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full flex items-center justify-center px-4 py-2 border border-[#E5E7EB] rounded-lg text-sm font-medium text-gray-700 hover:bg-[#F9FAFB] hover:border-[#D1D5DB] transition-all"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Скачать / Открыть
                            </a>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
