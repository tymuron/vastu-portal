import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LibraryItem, LibraryCategory } from '../../lib/types';
import { Download, CheckSquare, BookOpen, FileText, Eye, X, Maximize2, Minimize2 } from 'lucide-react';
import { cn, downloadFile } from '../../lib/utils';

export default function Library() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [previewFile, setPreviewFile] = useState<LibraryItem | null>(null);
    const [isZoomed, setIsZoomed] = useState(true);

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

            if (data) {
                setItems(data);
            }
        } catch (error) {
            console.error('Error fetching library:', error);
        } finally {
            setLoading(false);
        }
    }

    const filteredItems = items.filter(item =>
        item.category === 'checklist' || item.category === 'guide'
    );

    const getIcon = (category: LibraryCategory) => {
        switch (category) {
            case 'checklist': return <CheckSquare className="w-6 h-6" />;
            case 'guide': return <BookOpen className="w-6 h-6" />;
            default: return <FileText className="w-6 h-6" />;
        }
    };

    const handleDownload = async (e: React.MouseEvent, item: LibraryItem) => {
        e.stopPropagation();
        await downloadFile(item.file_url, item.title);
    };

    const handleOpenInNewTab = (e: React.MouseEvent, url: string) => {
        e.stopPropagation();
        window.open(url, '_blank');
    };

    if (loading) return <div className="p-8 text-center">Загрузка библиотеки...</div>;

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-serif text-[#422326] mb-2">Библиотека Материалов</h1>
                <p className="text-gray-600">Полезные чек-листы и гайды для обучения.</p>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map((item) => {
                    const isPdf = item.file_url.toLowerCase().endsWith('.pdf');
                    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(item.file_url);
                    const isPreviewable = isPdf || isImage;

                    return (
                        <div
                            key={item.id}
                            onClick={() => isPreviewable && setPreviewFile(item)}
                            className={cn(
                                "bg-white rounded-xl p-6 shadow-sm border border-[#E5E7EB] transition-all group relative",
                                isPreviewable ? "cursor-pointer hover:shadow-md hover:border-[#422326]/30" : ""
                            )}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-lg bg-[#F4F2ED] flex items-center justify-center text-[#422326] group-hover:bg-[#422326] group-hover:text-white transition-colors">
                                    {getIcon(item.category)}
                                </div>
                                <button
                                    onClick={(e) => handleOpenInNewTab(e, item.file_url)}
                                    className="p-2 text-gray-400 hover:text-[#422326] hover:bg-gray-100 rounded-full transition-colors"
                                    title="Открыть в новой вкладке"
                                >
                                    <Eye className="w-5 h-5" />
                                </button>
                            </div>

                            <h3 className="font-serif text-lg text-[#422326] mb-2 leading-tight group-hover:text-[#422326] transition-colors">
                                {item.title}
                            </h3>

                            {item.description && (
                                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                                    {item.description}
                                </p>
                            )}

                            <div className="flex items-center text-xs text-gray-400 mt-auto pt-2">
                                <span className="uppercase tracking-wider font-medium">{item.category === 'checklist' ? 'Чек-лист' : 'Гайд'}</span>
                                {isPreviewable && <span className="mx-2">•</span>}
                                {isPreviewable && <span>Нажмите для просмотра</span>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredItems.length === 0 && (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-gray-500">В библиотеке пока нет материалов.</p>
                </div>
            )}

            {/* Preview Modal */}
            {previewFile && (
                <div className="fixed inset-0 bg-black/90 z-50 md:flex md:items-center md:justify-center md:p-8 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full h-full md:rounded-xl md:w-[90vw] md:h-[85vh] md:max-w-6xl flex flex-col overflow-hidden shadow-2xl relative">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-[#F4F2ED] shrink-0 z-10">
                            <h3 className="font-serif text-lg text-[#422326] truncate pr-4 max-w-[60%] md:max-w-none">{previewFile.title}</h3>
                            <div className="flex items-center gap-2">
                                {!previewFile.file_url.toLowerCase().endsWith('.pdf') && (
                                    <button
                                        onClick={() => setIsZoomed(!isZoomed)}
                                        className="p-2 text-gray-600 hover:text-[#422326] hover:bg-white rounded-lg transition-colors hidden md:flex items-center gap-2"
                                        title={isZoomed ? "Уменьшить" : "Увеличить"}
                                    >
                                        {isZoomed ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                                        <span className="text-sm font-medium">{isZoomed ? "Уменьшить" : "Увеличить"}</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => window.open(previewFile.file_url, '_blank')}
                                    className="p-2 text-gray-600 hover:text-[#422326] hover:bg-white rounded-lg transition-colors"
                                    title="Открыть в новой вкладке"
                                >
                                    <Eye className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={(e) => handleDownload(e, previewFile)}
                                    className="p-2 text-gray-600 hover:text-[#422326] hover:bg-white rounded-lg transition-colors"
                                    title="Скачать"
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => {
                                        setPreviewFile(null);
                                        setIsZoomed(true);
                                    }}
                                    className="p-2 text-gray-600 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 bg-gray-100 overflow-hidden relative flex flex-col">
                            {previewFile.file_url.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    src={previewFile.file_url}
                                    className="w-full h-full"
                                    title={previewFile.title}
                                />
                            ) : (
                                <div className={cn(
                                    "flex-1 overflow-auto",
                                    isZoomed ? "block" : "flex items-center justify-center p-4"
                                )}>
                                    <img
                                        src={previewFile.file_url}
                                        alt={previewFile.title}
                                        className={cn(
                                            "shadow-lg transition-all duration-300",
                                            isZoomed ? "w-full h-auto min-h-full object-contain" : "max-w-full max-h-full object-contain"
                                        )}
                                        onClick={() => setIsZoomed(!isZoomed)}
                                        style={{ cursor: isZoomed ? 'zoom-out' : 'zoom-in' }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Mobile Zoom FAB */}
                        {!previewFile.file_url.toLowerCase().endsWith('.pdf') && (
                            <button
                                onClick={() => setIsZoomed(!isZoomed)}
                                className="md:hidden absolute bottom-6 right-6 w-12 h-12 bg-[#422326] text-white rounded-full shadow-lg flex items-center justify-center z-20 hover:bg-[#2b1618] transition-colors"
                            >
                                {isZoomed ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
