import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PlayCircle, ChevronRight, FileText, Loader2, Play } from 'lucide-react';
import { useEffect } from 'react';
import { useWeeks } from '../../hooks/useCourse';

// Helper to strip HTML
const stripHtml = (html: string) => {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
};

export default function StudentDashboard() {
    const { weeks, loading } = useWeeks();
    const location = useLocation();
    const navigate = useNavigate();

    // Get week from URL
    const searchParams = new URLSearchParams(location.search);
    const activeWeekId = searchParams.get('week');

    useEffect(() => {
        if (!loading && weeks.length > 0) {
            // If no week selected or invalid week, redirect to first unlocked week
            const isValidWeek = weeks.some(w => w.id === activeWeekId);

            if (!activeWeekId || !isValidWeek) {
                const firstUnlocked = weeks.find(w => !w.isLocked);
                const targetWeekId = firstUnlocked?.id || weeks[0].id;
                navigate(`/student?week=${targetWeekId}`, { replace: true });
            }
        }
    }, [weeks, loading, activeWeekId, navigate]);

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-vastu-gold" size={40} /></div>;
    }

    const activeWeek = weeks.find(w => w.id === activeWeekId);

    if (!activeWeek) return null;

    return (
        <div className="animate-fade-in">
            {/* Active Week Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px]">
                <div className="bg-vastu-dark p-8 md:p-12 text-vastu-light relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-vastu-gold opacity-10 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3" />

                    <div className="relative z-10">
                        {/* Removed auto-generated Week label to avoid mismatched numbering */}
                        <h2 className="text-3xl md:text-5xl font-serif mb-6">{activeWeek.title}</h2>
                        <p className="text-vastu-light/70 max-w-2xl font-light leading-relaxed text-lg">
                            {stripHtml(activeWeek.description || '')}
                        </p>
                    </div>
                </div>

                <div className="p-6 md:p-8">
                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Lessons List */}
                        <div className="md:col-span-2 space-y-4">
                            <h3 className="font-serif text-xl text-vastu-dark mb-4 flex items-center gap-2">
                                <PlayCircle className="text-vastu-gold" />
                                Уроки
                            </h3>
                            <div className="space-y-3">
                                {activeWeek.days.map((day) => (
                                    <Link
                                        key={day.id}
                                        to={`/student/week/${activeWeek.id}/day/${day.id}`}
                                        className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-vastu-gold/50 hover:bg-vastu-light/30 transition-all group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-vastu-light flex items-center justify-center text-vastu-gold group-hover:bg-vastu-gold group-hover:text-vastu-dark transition-colors shrink-0">
                                                <Play size={14} fill="currentColor" />
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-vastu-dark group-hover:text-vastu-gold transition-colors">
                                                    {day.title}
                                                </h4>
                                                <p className="text-xs text-vastu-text-light line-clamp-2 mt-0.5">
                                                    {stripHtml(day.description || '')}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-gray-300 group-hover:text-vastu-gold transition-colors" />
                                    </Link>
                                ))}
                            </div>
                        </div>

                        {/* Materials Sidebar */}
                        <div className="space-y-6">
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
