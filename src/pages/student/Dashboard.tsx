import { Link } from 'react-router-dom';
import { Lock, PlayCircle, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { useWeeks } from '../../hooks/useCourse';
import { cn } from '../../lib/utils';

export default function StudentDashboard() {
    const { weeks, loading } = useWeeks();
    const title = "Васту-Дизайн: Основы и Практика"; // Could also be fetched

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-vastu-gold" size={40} /></div>;
    }

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="mb-12 text-center">
                <h1 className="text-4xl md:text-5xl font-serif text-vastu-dark mb-4">{title}</h1>
                <div className="h-1 w-24 bg-vastu-gold mx-auto rounded-full" />
            </div>

            <div className="space-y-6">
                {weeks.map((week, index) => (
                    <div
                        key={week.id}
                        className={cn(
                            "group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-transparent",
                            week.isLocked ? "opacity-75 grayscale-[0.5]" : "hover:border-vastu-gold/30"
                        )}
                    >
                        {/* Week Status Strip */}
                        <div className={cn(
                            "absolute left-0 top-0 bottom-0 w-1.5",
                            week.isLocked ? "bg-gray-300" : "bg-vastu-gold"
                        )} />

                        <div className="p-6 md:p-8 pl-8 md:pl-10">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                <div>
                                    <span className="text-xs font-bold tracking-widest text-vastu-gold uppercase mb-1 block">
                                        Неделя {index + 1}
                                    </span>
                                    <h2 className="text-2xl font-serif text-vastu-dark group-hover:text-vastu-dark/80 transition-colors">
                                        {week.title}
                                    </h2>
                                </div>
                                {week.isLocked && week.availableFrom && (
                                    <div className="flex items-center gap-2 text-vastu-text-light text-sm bg-gray-100 px-3 py-1 rounded-full self-start md:self-auto">
                                        <Lock size={14} />
                                        <span>Откроется {new Date(week.availableFrom).toLocaleDateString('ru-RU')}</span>
                                    </div>
                                )}
                            </div>

                            <p className="text-vastu-text-light mb-6 font-light leading-relaxed">
                                {week.description}
                            </p>

                            {/* Days Preview */}
                            {!week.isLocked && (
                                <div className="space-y-3 mb-6">
                                    {week.days.map((day) => (
                                        <div key={day.id} className="flex items-center gap-3 text-sm text-vastu-text/80 pl-4 border-l border-gray-100">
                                            <PlayCircle size={16} className="text-vastu-gold shrink-0" />
                                            <span className="truncate">{day.title}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                                <div className="flex gap-4 text-sm text-vastu-text-light">
                                    <span className="flex items-center gap-1.5">
                                        <PlayCircle size={16} />
                                        {week.days.length} уроков
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <FileText size={16} />
                                        {week.weekMaterials.length + week.days.reduce((acc, d) => acc + d.materials.length, 0)} материалов
                                    </span>
                                </div>

                                {!week.isLocked ? (
                                    <Link
                                        to={`/student/week/${week.id}`}
                                        className="flex items-center gap-2 text-vastu-dark font-medium hover:text-vastu-gold transition-colors"
                                    >
                                        Открыть
                                        <ChevronRight size={18} />
                                    </Link>
                                ) : (
                                    <button disabled className="text-gray-400 cursor-not-allowed">
                                        Недоступно
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
