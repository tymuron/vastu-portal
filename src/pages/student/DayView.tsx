import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, FileText, Video, File, ChevronRight, ChevronLeft, Loader2, Youtube } from 'lucide-react';
import { useWeeks, useDay } from '../../hooks/useCourse';
import { getVideoEmbedUrl, cn } from '../../lib/utils';

// Helper component for dual video player (reused logic)
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

export default function DayView() {
    const { weekId, dayId } = useParams();

    // We need weeks to find prev/next day
    const { weeks } = useWeeks();
    const { day, loading } = useDay(weekId, dayId);

    const week = weeks.find(w => w.id === weekId);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-vastu-gold" size={40} /></div>;
    if (!week || !day) return <div>Урок не найден</div>;

    const dayIndex = week.days.findIndex(d => d.id === dayId);
    const prevDay = week.days[dayIndex - 1];
    const nextDay = week.days[dayIndex + 1];

    const getIconForType = (type: string) => {
        switch (type) {
            case 'video': return <Video size={18} />;
            case 'pdf': return <FileText size={18} />;
            default: return <File size={18} />;
        }
    };

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-sm text-vastu-text-light mb-6">
                <Link to="/student" className="hover:text-vastu-gold">Курс</Link>
                <ChevronRight size={14} />
                <Link to={`/student/week/${week.id}`} className="hover:text-vastu-gold">{week.title}</Link>
                <ChevronRight size={14} />
                <span className="text-vastu-dark font-medium truncate">{day.title}</span>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Main Content (Video + Info) */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Video Player */}
                    <VideoPlayer
                        youtubeUrl={day.videoUrl}
                        rutubeUrl={day.rutubeUrl}
                        title={day.title}
                    />

                    <div>
                        <h1 className="text-3xl font-serif text-vastu-dark mb-4">{day.title}</h1>
                        <p className="text-vastu-text-light leading-relaxed text-base font-light">
                            {day.description}
                        </p>
                    </div>
                </div>

                {/* Sidebar (Materials & Navigation) */}
                <div className="space-y-6">
                    {/* Navigation Card */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-serif text-lg mb-4 text-vastu-dark">Навигация</h3>
                        <div className="space-y-3">
                            {prevDay && (
                                <Link
                                    to={`/student/week/${week.id}/day/${prevDay.id}`}
                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-vastu-light/50 transition-colors text-sm group"
                                >
                                    <ChevronLeft size={16} className="text-vastu-gold" />
                                    <div className="text-left">
                                        <div className="text-xs text-vastu-text-light">Предыдущий урок</div>
                                        <div className="font-medium text-vastu-dark group-hover:text-vastu-gold transition-colors line-clamp-1">{prevDay.title}</div>
                                    </div>
                                </Link>
                            )}
                            {nextDay ? (
                                <Link
                                    to={`/student/week/${week.id}/day/${nextDay.id}`}
                                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-vastu-dark text-vastu-light hover:bg-vastu-dark/90 transition-colors text-sm"
                                >
                                    <div className="text-left">
                                        <div className="text-xs text-white/50">Следующий урок</div>
                                        <div className="font-medium line-clamp-1">{nextDay.title}</div>
                                    </div>
                                    <ChevronRight size={16} className="text-vastu-gold" />
                                </Link>
                            ) : (
                                <div className="space-y-3">
                                    <div className="p-3 text-center text-sm text-vastu-text-light bg-gray-50 rounded-lg">
                                        Это последний урок недели
                                    </div>

                                    {/* Next Week Button */}
                                    {weeks[weeks.findIndex(w => w.id === week.id) + 1] ? (
                                        (() => {
                                            const nextWeek = weeks[weeks.findIndex(w => w.id === week.id) + 1];
                                            return (
                                                <Link
                                                    to={nextWeek.isLocked ? '#' : `/student?week=${nextWeek.id}`}
                                                    className={`flex items-center justify-between gap-3 p-3 rounded-lg text-sm w-full transition-colors ${nextWeek.isLocked
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                        : 'bg-vastu-gold text-vastu-dark hover:bg-vastu-gold/90'
                                                        }`}
                                                    onClick={(e) => nextWeek.isLocked && e.preventDefault()}
                                                >
                                                    <div className="text-left">
                                                        <div className={`text-xs ${nextWeek.isLocked ? 'text-gray-400' : 'text-vastu-dark/70'}`}>Следующая неделя</div>
                                                        <div className="font-medium line-clamp-1">{nextWeek.title}</div>
                                                    </div>
                                                    <ChevronRight size={16} />
                                                </Link>
                                            );
                                        })()
                                    ) : (
                                        <Link
                                            to="/student"
                                            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-vastu-gold/30 text-vastu-dark hover:bg-vastu-gold/10 transition-colors text-sm"
                                        >
                                            <div className="text-left">
                                                <div className="text-xs text-vastu-text-light">Курс завершен</div>
                                                <div className="font-medium">Вернуться к программе</div>
                                            </div>
                                            <ChevronRight size={16} className="text-vastu-gold" />
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Materials Card */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-serif text-lg text-vastu-dark">Материалы урока</h3>
                            <span className="text-xs bg-vastu-light px-2 py-1 rounded-full text-vastu-text-light">
                                {day.materials.length} файлов
                            </span>
                        </div>

                        <div className="space-y-3">
                            {day.materials.length > 0 ? (
                                day.materials.map((material) => (
                                    <a
                                        key={material.id}
                                        href={material.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-vastu-gold/50 hover:bg-vastu-light/30 transition-all group"
                                    >
                                        <div className="w-8 h-8 rounded bg-vastu-light flex items-center justify-center text-vastu-text-light group-hover:text-vastu-gold transition-colors">
                                            {getIconForType(material.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-vastu-dark truncate">{material.title}</div>
                                            <div className="text-xs text-vastu-text-light uppercase">{material.type}</div>
                                        </div>
                                        <Download size={16} className="text-gray-300 group-hover:text-vastu-gold transition-colors" />
                                    </a>
                                ))
                            ) : (
                                <div className="text-sm text-vastu-text-light italic">
                                    Нет материалов для этого урока
                                </div>
                            )}
                        </div>

                        {day.materials.length > 1 && (
                            <button
                                onClick={() => alert('Функция "Скачать всё архивом" будет доступна позже. Пожалуйста, скачивайте файлы по одному.')}
                                className="w-full mt-4 py-2 text-sm text-vastu-gold hover:text-vastu-dark border border-vastu-gold/30 hover:border-vastu-dark rounded-lg transition-all"
                            >
                                Скачать всё (ZIP)
                            </button>
                        )}
                    </div>

                    {/* Homework Card */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-serif text-lg text-vastu-dark mb-4 flex items-center gap-2">
                            <FileText size={20} className="text-vastu-gold" />
                            Домашнее задание
                        </h3>
                        <p className="text-sm text-vastu-text-light mb-4">
                            Выполните задание к этому уроку, чтобы закрепить материал.
                        </p>
                        <button
                            className="w-full py-2 bg-vastu-light text-vastu-dark hover:bg-vastu-gold hover:text-white rounded-lg transition-colors text-sm font-medium"
                            onClick={() => alert('Раздел домашних заданий находится в разработке.')}
                        >
                            Перейти к заданию
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
