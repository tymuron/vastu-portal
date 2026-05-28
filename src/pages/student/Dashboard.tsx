import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PlayCircle, ChevronRight, FileText, Loader2, Play, BookOpen, AlertCircle, Lock, LayoutGrid } from 'lucide-react';
import { useEffect } from 'react';
import { useWeeks } from '../../hooks/useCourse';
import { useCourseContext } from '../../contexts/CourseContext';

// Helper to strip HTML
const stripHtml = (html: string) => {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
};

const pluralizeDays = (n: number): string => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
    return 'дней';
};

export default function StudentDashboard() {
    const { weeks, loading } = useWeeks();
    const location = useLocation();
    const navigate = useNavigate();
    const { activeCourseExpiresAt, expiresInDays } = useCourseContext();

    const isExpired = activeCourseExpiresAt
        ? new Date(activeCourseExpiresAt).getTime() <= Date.now()
        : false;
    const showWarning = expiresInDays !== null && expiresInDays <= 7 && expiresInDays >= 0;

    // Get week from URL
    const searchParams = new URLSearchParams(location.search);
    const activeWeekId = searchParams.get('week');

    useEffect(() => {
        if (!loading && weeks.length > 0) {
            // No week / invalid week → bounce to the modules picker so the
            // student consciously chooses a module instead of always landing
            // in the first one. Asked for by Anna 2026-05.
            const isValidWeek = weeks.some(w => w.id === activeWeekId);
            if (!activeWeekId || !isValidWeek) {
                navigate('/student/modules', { replace: true });
            }
        }
    }, [weeks, loading, activeWeekId, navigate]);

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-vastu-gold" size={40} /></div>;
    }

    if (isExpired) {
        return (
            <div className="animate-fade-in max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl border border-gray-100 p-10 md:p-14 text-center">
                    <Lock size={32} className="mx-auto text-vastu-text-light mb-4" />
                    <h2 className="font-serif text-2xl text-vastu-dark mb-3">Доступ к курсу истёк</h2>
                    <p className="text-vastu-text-light leading-relaxed">
                        Срок вашего доступа к этому курсу закончился. Ваш прогресс сохранён — если вы продлите доступ, всё восстановится.
                    </p>
                </div>
            </div>
        );
    }

    if (weeks.length === 0) {
        return (
            <div className="animate-fade-in max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl border border-gray-100 p-10 md:p-14 text-center">
                    <div className="w-14 h-14 rounded-full bg-vastu-light flex items-center justify-center text-vastu-gold mx-auto mb-5">
                        <BookOpen size={26} />
                    </div>
                    <h2 className="font-serif text-2xl text-vastu-dark mb-3">Скоро здесь появятся материалы</h2>
                    <p className="text-vastu-text-light leading-relaxed">
                        В этом курсе пока нет материалов. Загляните позже — мы готовим для вас уроки.
                    </p>
                </div>
            </div>
        );
    }

    const activeWeek = weeks.find(w => w.id === activeWeekId);
    const currentIdx = weeks.findIndex(w => w.id === activeWeekId);
    const nextWeek = currentIdx >= 0 ? weeks[currentIdx + 1] : null;

    if (!activeWeek) return null;

    return (
        <div className="animate-fade-in">
            {showWarning && activeCourseExpiresAt && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 mb-6 flex items-center gap-3">
                    <AlertCircle size={20} />
                    <div>
                        <div className="font-medium">
                            Ваш доступ заканчивается через {expiresInDays} {pluralizeDays(expiresInDays!)}
                        </div>
                        <div className="text-sm text-red-700/80">
                            После {new Date(activeCourseExpiresAt).toLocaleDateString('ru-RU')} вы не сможете открывать материалы. Ваш прогресс сохранится.
                        </div>
                    </div>
                </div>
            )}

            {/* Active Week Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px]">
                <div className="bg-vastu-dark p-8 md:p-12 text-vastu-light relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-vastu-gold opacity-10 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3" />

                    <div className="relative z-10">
                        {/* Removed auto-generated Week label to avoid mismatched numbering */}
                        <button
                            type="button"
                            onClick={() => navigate('/student/modules')}
                            className="inline-flex items-center gap-1.5 mb-3 text-[10px] uppercase tracking-widest text-vastu-gold/90 hover:text-vastu-gold transition-colors"
                        >
                            <LayoutGrid size={12} />
                            <span>Все модули</span>
                        </button>
                        <h2 className="text-3xl md:text-5xl font-serif mb-6 break-words">{activeWeek.title}</h2>
                        <p className="text-vastu-light/70 max-w-2xl font-light leading-relaxed text-lg">
                            {stripHtml(activeWeek.description || '')}
                        </p>
                    </div>
                </div>

                <div className="p-6 md:p-8">
                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Lessons List */}
                        <div className="md:col-span-2 space-y-4 min-w-0">
                            <h3 className="font-serif text-xl text-vastu-dark mb-4 flex items-center gap-2">
                                <PlayCircle className="text-vastu-gold" />
                                Уроки
                            </h3>
                            <div className="space-y-3">
                                {activeWeek.days.map((day) => (
                                    <Link
                                        key={day.id}
                                        to={`/student/week/${activeWeek.id}/day/${day.id}`}
                                        className="flex items-center justify-between gap-3 p-4 rounded-xl border border-gray-100 hover:border-vastu-gold/50 hover:bg-vastu-light/30 transition-all group"
                                    >
                                        <div className="flex items-center gap-4 min-w-0 flex-1">
                                            <div className="w-8 h-8 rounded-full bg-vastu-light flex items-center justify-center text-vastu-gold group-hover:bg-vastu-gold group-hover:text-vastu-dark transition-colors shrink-0">
                                                <Play size={14} fill="currentColor" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-medium text-vastu-dark group-hover:text-vastu-gold transition-colors line-clamp-2 break-words">
                                                    {day.title}
                                                </h4>
                                                <p className="text-xs text-vastu-text-light line-clamp-2 mt-0.5 break-words">
                                                    {stripHtml(day.description || '')}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-gray-300 group-hover:text-vastu-gold transition-colors shrink-0" />
                                    </Link>
                                ))}
                            </div>

                            {/* Next module CTA — Anna asked for this; without it
                                students finish a module's lessons and have no
                                obvious way forward (sidebar switcher is too subtle). */}
                            {nextWeek && (
                                nextWeek.isLocked ? (
                                    <div className="mt-2 flex items-center justify-between gap-3 p-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-vastu-text-light">
                                        <div className="min-w-0">
                                            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">Следующий модуль</div>
                                            <div className="font-medium break-words">{nextWeek.title}</div>
                                        </div>
                                        <Lock size={16} className="text-gray-300 shrink-0" />
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => navigate(`/student?week=${nextWeek.id}`)}
                                        className="mt-2 w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-vastu-dark text-vastu-light hover:opacity-90 transition-opacity group"
                                    >
                                        <div className="min-w-0 text-left">
                                            <div className="text-[10px] uppercase tracking-widest text-vastu-gold/80 mb-0.5">Перейти к следующему модулю</div>
                                            <div className="font-serif text-lg break-words">{nextWeek.title}</div>
                                        </div>
                                        <ChevronRight size={20} className="text-vastu-gold shrink-0 group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                )
                            )}
                        </div>

                        {/* Materials Sidebar */}
                        <div className="space-y-6 min-w-0">
                            <div>
                                <h3 className="font-serif text-xl text-vastu-dark mb-4 flex items-center gap-2">
                                    <FileText className="text-vastu-gold" />
                                    Материалы
                                </h3>
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                                    {activeWeek.weekMaterials && activeWeek.weekMaterials.length > 0 ? (
                                        activeWeek.weekMaterials.map((material) => (
                                            <a
                                                key={material.id}
                                                href={material.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-start gap-3 p-2 rounded-lg hover:bg-white transition-colors group"
                                            >
                                                <FileText size={16} className="text-vastu-text-light mt-0.5 group-hover:text-vastu-gold" />
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-vastu-dark truncate group-hover:text-vastu-gold transition-colors">
                                                        {material.title}
                                                    </div>
                                                    <div className="text-[10px] text-vastu-text-light uppercase">
                                                        {material.type}
                                                    </div>
                                                </div>
                                            </a>
                                        ))
                                    ) : (
                                        <div className="text-sm text-vastu-text-light italic text-center py-4">
                                            Нет общих материалов
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Progres widget removed */}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
