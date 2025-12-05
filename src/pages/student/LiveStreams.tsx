import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LiveStream } from '../../lib/types';
import { Download, Calendar } from 'lucide-react';
import { getVideoEmbedUrl } from '../../lib/utils';

export default function LiveStreams() {
    const [streams, setStreams] = useState<LiveStream[]>([]);
    const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null);
    const [loading, setLoading] = useState(true);

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

            if (data) {
                setStreams(data);
                if (data.length > 0) {
                    setSelectedStream(data[0]);
                }
            }
        } catch (error) {
            console.error('Error fetching streams:', error);
        } finally {
            setLoading(false);
        }
    }

    // Group streams by month
    const groupedStreams = streams.reduce((acc, stream) => {
        const date = new Date(stream.date);
        const monthYear = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        const key = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);

        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(stream);
        return acc;
    }, {} as Record<string, LiveStream[]>);

    const months = Object.keys(groupedStreams);
    const [selectedMonth, setSelectedMonth] = useState<string>('');

    useEffect(() => {
        if (months.length > 0 && !selectedMonth) {
            setSelectedMonth(months[0]);
        }
    }, [months, selectedMonth]);

    if (loading) return (
        <div className="space-y-8 animate-pulse">
            <div className="h-20 bg-gray-200 rounded-xl w-1/3"></div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="h-[400px] bg-gray-200 rounded-xl"></div>
                <div className="lg:col-span-3 space-y-6">
                    <div className="aspect-video bg-gray-200 rounded-xl"></div>
                    <div className="h-32 bg-gray-200 rounded-xl"></div>
                </div>
            </div>
        </div>
    );

    const currentMonthStreams = selectedMonth ? groupedStreams[selectedMonth] : [];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-serif text-[#422326] mb-2">Живые Эфиры</h1>
                <p className="text-gray-600">Записи всех прошедших разборов и встреч.</p>
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-4 gap-8">
                {/* Left Sidebar: Month Navigation */}
                <div className="lg:col-span-1 space-y-2">
                    <h3 className="font-serif text-lg text-vastu-dark mb-4 px-2">Архив по месяцам</h3>
                    <div className="space-y-1">
                        {months.map((month) => (
                            <button
                                key={month}
                                onClick={() => {
                                    setSelectedMonth(month);
                                    setSelectedStream(null); // Reset selected stream when changing month
                                }}
                                className={`w-full text-left px-4 py-3 rounded-lg transition-all text-sm font-medium ${selectedMonth === month
                                    ? 'bg-vastu-dark text-vastu-light shadow-md'
                                    : 'text-gray-600 hover:bg-vastu-light/50 hover:text-vastu-dark'
                                    }`}
                            >
                                {month}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content: Player & Stream List */}
                <div className="lg:col-span-3 space-y-8">
                    {/* Video Player (if stream selected) */}
                    {selectedStream && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="mb-4">
                                <button
                                    onClick={() => setSelectedStream(null)}
                                    className="text-sm text-vastu-gold hover:text-vastu-dark mb-2 flex items-center gap-1"
                                >
                                    ← Вернуться к списку
                                </button>
                                <div className="text-sm text-gray-500 mb-1">
                                    {new Date(selectedStream.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </div>
                                <h2 className="text-2xl font-serif text-[#422326]">{selectedStream.title}</h2>
                            </div>

                            <div className="bg-black rounded-xl overflow-hidden aspect-video shadow-2xl">
                                {selectedStream.video_url ? (
                                    <iframe
                                        src={getVideoEmbedUrl(selectedStream.video_url)}
                                        title={selectedStream.title}
                                        className="w-full h-full"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/50">
                                        Видео недоступно
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-4">
                                {selectedStream.audio_url && (
                                    <a
                                        href={selectedStream.audio_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center px-4 py-2 bg-[#F4F2ED] text-[#422326] rounded-lg hover:bg-[#EAE6DE] transition-colors font-medium"
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Скачать Аудио
                                    </a>
                                )}
                            </div>

                            <hr className="border-gray-100" />
                        </div>
                    )}

                    {/* Stream List for Selected Month */}
                    {!selectedStream && (
                        <div>
                            <h2 className="font-serif text-2xl text-vastu-dark mb-6">{selectedMonth}</h2>
                            <div className="space-y-4">
                                {currentMonthStreams && currentMonthStreams.length > 0 ? (
                                    currentMonthStreams.map((stream) => (
                                        <button
                                            key={stream.id}
                                            onClick={() => {
                                                setSelectedStream(stream);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="w-full text-left p-6 rounded-xl bg-white border border-gray-100 hover:border-vastu-gold/50 hover:shadow-md transition-all group"
                                        >
                                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                                                <div className="flex-1">
                                                    <div className="text-xs font-medium text-gray-500 mb-2">
                                                        {new Date(stream.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                    </div>
                                                    <h3 className="font-serif text-xl text-vastu-dark group-hover:text-vastu-gold transition-colors mb-2">
                                                        {stream.title}
                                                    </h3>
                                                    <p className="text-sm text-gray-500 line-clamp-2">
                                                        {stream.description || 'Нет описания'}
                                                    </p>
                                                </div>
                                                <div className="shrink-0">
                                                    <div className="w-10 h-10 rounded-full bg-vastu-light flex items-center justify-center text-vastu-dark group-hover:bg-vastu-gold group-hover:text-white transition-colors">
                                                        <Calendar size={18} />
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                        В этом месяце эфиров не найдено
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
