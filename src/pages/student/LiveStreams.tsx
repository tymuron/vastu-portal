import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LiveStream } from '../../lib/types';
import { Calendar, Clock, Video, Youtube } from 'lucide-react';
import { cn, getVideoEmbedUrl } from '../../lib/utils';

// Helper component for dual video player
const VideoPlayer = ({ youtubeUrl, rutubeUrl, title }: { youtubeUrl?: string, rutubeUrl?: string, title: string }) => {
    const [activeSource, setActiveSource] = useState<'youtube' | 'rutube'>(youtubeUrl ? 'youtube' : 'rutube');

    // If only one source exists, force that source
    useEffect(() => {
        if (youtubeUrl && !rutubeUrl) setActiveSource('youtube');
        if (!youtubeUrl && rutubeUrl) setActiveSource('rutube');
    }, [youtubeUrl, rutubeUrl]);

    const currentUrl = activeSource === 'youtube' ? youtubeUrl : rutubeUrl;

    return (
        <div className="space-y-4">
            {/* Source Switcher */}
            {(youtubeUrl && rutubeUrl) && (
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
                    <button
                        onClick={() => setActiveSource('youtube')}
                        className={cn(
                            "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                            activeSource === 'youtube'
                                ? "bg-white text-red-600 shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <Youtube size={16} />
                        YouTube
                    </button>
                    <button
                        onClick={() => setActiveSource('rutube')}
                        className={cn(
                            "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                            activeSource === 'rutube'
                                ? "bg-white text-[#00A551] shadow-sm" // Rutube green color
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <Video size={16} />
                        Rutube
                    </button>
                </div>
            )}

            {/* Player */}
            <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg relative group">
                {currentUrl ? (
                    <iframe
                        src={getVideoEmbedUrl(currentUrl)}
                        className="w-full h-full"
                        title={title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/50">
                        <Video size={48} />
                        <span className="ml-2">Видео недоступно</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default function LiveStreams() {
    const [streams, setStreams] = useState<LiveStream[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState<string>('all');

    useEffect(() => {
        fetchStreams();
    }, []);

    const fetchStreams = async () => {
        try {
            const { data, error } = await supabase
                .from('live_streams')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            setStreams(data || []);
        } catch (error) {
            console.error('Error fetching streams:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Загрузка трансляций...</div>;

    const upcomingStreams = streams.filter(s => new Date(s.date) > new Date());
    const pastStreams = streams.filter(s => new Date(s.date) <= new Date());

    const filteredPastStreams = pastStreams.filter(stream => {
        if (selectedMonth === 'all') return true;
        const date = new Date(stream.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
        return monthKey === selectedMonth;
    });

    return (
        <div className="space-y-12 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-serif text-3xl text-[#422326] mb-2">Прямые Эфиры</h1>
            </div>

            {/* Upcoming Stream (Featured) */}
            {upcomingStreams.length > 0 && (
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#F4F2ED] rounded-full -translate-y-1/2 translate-x-1/2 opacity-50" />

                    <div className="relative z-10 grid md:grid-cols-2 gap-8 items-center">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-red-600 text-sm font-medium mb-4">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                Скоро в эфире
                            </div>
                            <h2 className="font-serif text-2xl text-[#422326] mb-4">
                                {upcomingStreams[0].title}
                            </h2>
                            <p className="text-gray-600 mb-6">
                                {upcomingStreams[0].description}
                            </p>

                            <div className="flex flex-wrap gap-4 mb-8">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Calendar className="w-5 h-5" />
                                    <span>{new Date(upcomingStreams[0].date).toLocaleDateString('ru-RU')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Clock className="w-5 h-5" />
                                    <span>{new Date(upcomingStreams[0].date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            </div>

                            <button className="px-6 py-3 bg-[#422326] text-white rounded-xl hover:bg-[#2b1618] transition-colors flex items-center gap-2">
                                <Video className="w-5 h-5" />
                                Перейти к трансляции
                            </button>
                        </div>

                        <div className="rounded-xl overflow-hidden shadow-lg">
                            <VideoPlayer
                                youtubeUrl={upcomingStreams[0].video_url}
                                rutubeUrl={upcomingStreams[0].rutube_url}
                                title={upcomingStreams[0].title}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Past Streams Grid */}
            <div>
                <div className="flex items-center justify-end mb-6">

                    {/* Month Filter */}
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-vastu-dark focus:outline-none focus:border-vastu-gold"
                    >
                        <option value="all">Все месяцы</option>
                        {Array.from(new Set(streams.map(s => {
                            const date = new Date(s.date);
                            return `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
                        }))).sort().reverse().map(monthKey => {
                            const [year, monthIndex] = monthKey.split('-');
                            const date = new Date(parseInt(year), parseInt(monthIndex));
                            const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
                            return (
                                <option key={monthKey} value={monthKey}>
                                    {label.charAt(0).toUpperCase() + label.slice(1)}
                                </option>
                            );
                        })}
                    </select>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPastStreams.length > 0 ? (
                        filteredPastStreams.map((stream) => (
                            <div key={stream.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-all">
                                <VideoPlayer
                                    youtubeUrl={stream.video_url}
                                    rutubeUrl={stream.rutube_url}
                                    title={stream.title}
                                />

                                <div className="p-6">
                                    <div className="text-sm text-gray-500 mb-2">
                                        {new Date(stream.date).toLocaleDateString('ru-RU')}
                                    </div>
                                    <h4 className="font-serif text-lg text-[#422326] mb-2">{stream.title}</h4>
                                    <p className="text-sm text-gray-500 line-clamp-2">
                                        {stream.description}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full py-10 text-center text-gray-400 italic">
                            Нет эфиров за этот период
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
