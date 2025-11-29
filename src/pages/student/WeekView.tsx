import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, FileText, Download, ChevronRight, Loader2 } from 'lucide-react';
import { useWeeks } from '../../hooks/useCourse';
import { useState } from 'react';
import { cn } from '../../lib/utils';

export default function WeekView() {
    const { weekId } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'days' | 'materials'>('days');
    const { weeks, loading } = useWeeks();

    const week = weeks.find(w => w.id === weekId);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-vastu-gold" size={40} /></div>;
    if (!week) return <div>Неделя не найдена</div>;

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            <button
                onClick={() => navigate('/student')}
                className="flex items-center gap-2 text-vastu-text-light hover:text-vastu-dark mb-6 transition-colors"
            >
                <ArrowLeft size={18} />
                <span>Назад к курсу</span>
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
                <div className="bg-vastu-dark p-8 md:p-10 text-vastu-light relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-vastu-gold opacity-10 rounded-full blur-[80px] translate-x-1/2 -translate-y-1/2" />

                    <h1 className="text-3xl md:text-4xl font-serif mb-4 relative z-10">{week.title}</h1>
                    <p className="text-vastu-light/70 max-w-2xl font-light leading-relaxed relative z-10">
                        {week.description}
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                    <button
                        onClick={() => setActiveTab('days')}
                        className={cn(
                            "px-8 py-4 text-sm font-medium transition-colors relative",
                            activeTab === 'days' ? "text-vastu-dark" : "text-vastu-text-light hover:text-vastu-dark"
                        )}
                    >
                        Программа недели
                        {activeTab === 'days' && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-vastu-gold" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('materials')}
                        className={cn(
                            "px-8 py-4 text-sm font-medium transition-colors relative flex items-center gap-2",
                            activeTab === 'materials' ? "text-vastu-dark" : "text-vastu-text-light hover:text-vastu-dark"
                        )}
                    >
                        Материалы недели
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                            {week.materials?.length || 0}
                        </span>
                        {activeTab === 'materials' && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-vastu-gold" />
                        )}
                    </button>
                </div>

                <div className="p-6 md:p-8 min-h-[400px]">
                    {activeTab === 'days' ? (
                        <div className="space-y-4">
                            {week.days.map((day) => (
                                <Link
                                    key={day.id}
                                    to={`/student/week/${week.id}/day/${day.id}`}
                                    className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-vastu-gold/50 hover:bg-vastu-light/30 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-vastu-light flex items-center justify-center text-vastu-gold group-hover:bg-vastu-gold group-hover:text-vastu-dark transition-colors">
                                            <Play size={18} fill="currentColor" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-lg text-vastu-dark">{day.title}</h3>
                                            <p className="text-sm text-vastu-text-light line-clamp-1">{day.description}</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-300 group-hover:text-vastu-gold transition-colors" />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                            {week.materials && week.materials.length > 0 ? (
                                week.materials.map((material) => (
                                    <div key={material.id} className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                                        <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-vastu-dark shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-vastu-dark truncate">{material.title}</h4>
                                            <p className="text-xs text-vastu-text-light uppercase tracking-wider mb-2">{material.type}</p>
                                            <a
                                                href={material.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sm text-vastu-gold hover:text-vastu-dark font-medium flex items-center gap-1 transition-colors"
                                            >
                                                <Download size={14} />
                                                Скачать
                                            </a>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-2 text-center py-12 text-vastu-text-light">
                                    Нет дополнительных материалов для этой недели.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
