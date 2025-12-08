import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LibraryItem } from '../../lib/types';
import { Download, FileText, Eye } from 'lucide-react';
import { downloadFile } from '../../lib/utils';

export default function Library() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLibrary();
    }, []);

    const fetchLibrary = async () => {
        try {
            const { data, error } = await supabase
                .from('library_items')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setItems(data || []);
        } catch (error) {
            console.error('Error fetching library:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (e: React.MouseEvent, item: LibraryItem) => {
        e.stopPropagation();
        await downloadFile(item.file_url, item.title);
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-serif text-3xl text-[#422326] mb-2">Библиотека Материалов</h1>
                <p className="text-gray-600">Полезные материалы для вашего обучения</p>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#422326]"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className="group bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-3 bg-[#F4F2ED] rounded-lg text-[#422326]">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => window.open(item.file_url, '_blank')}
                                        className="p-2 text-gray-400 hover:text-[#422326] hover:bg-[#F4F2ED] rounded-lg transition-all duration-300"
                                        title="Открыть"
                                    >
                                        <Eye className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={(e) => handleDownload(e, item)}
                                        className="p-2 text-gray-400 hover:text-[#422326] hover:bg-[#F4F2ED] rounded-lg transition-all duration-300"
                                        title="Скачать"
                                    >
                                        <Download className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="font-serif text-lg text-[#422326] mb-2">
                                {item.title}
                            </h3>
                            <p className="text-sm text-gray-500 mb-4 line-clamp-2 flex-1">
                                {item.description}
                            </p>

                            <div className="pt-4 border-t border-gray-50 flex items-center justify-between text-xs text-gray-400">
                                <span>{new Date(item.created_at).toLocaleDateString('ru-RU')}</span>
                                <span className="uppercase tracking-wider">{item.file_type}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
