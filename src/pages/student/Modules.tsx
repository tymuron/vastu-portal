import { useNavigate } from 'react-router-dom';
import { Loader2, BookOpen, Lock, ChevronRight, Clock } from 'lucide-react';
import { useWeeks } from '../../hooks/useCourse';
import { useCourseContext } from '../../contexts/CourseContext';

const stripHtml = (html: string) => {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
};

const formatAvailableFrom = (iso?: string) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('ru-RU', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
    } catch { return ''; }
};

export default function Modules() {
    const navigate = useNavigate();
    const { activeCourseId } = useCourseContext();
    const { weeks, loading } = useWeeks();

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-vastu-gold" size={32} />
            </div>
        );
    }

    if (weeks.length === 0) {
        return (
            <div className="max-w-2xl">
                <h1 className="font-serif text-3xl text-vastu-dark mb-3">Модули</h1>
                <p className="text-vastu-text-light">В этом курсе пока нет модулей.</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl">
            <div className="mb-8">
                <h1 className="font-serif text-3xl md:text-4xl text-vastu-dark mb-2">Модули курса</h1>
                <p className="text-vastu-text-light">Выберите любой модуль, чтобы перейти к его урокам.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 md:gap-6">
                {weeks.map((week) => {
                    const desc = stripHtml(week.description || '');
                    const lessonCount = week.days?.length || 0;
                    const locked = week.isLocked;
                    return (
                        <button
                            key={week.id}
                            type="button"
                            disabled={locked}
                            onClick={() => !locked && navigate(`/student?week=${week.id}`)}
                            className={
                                'group text-left bg-white rounded-2xl border-2 p-5 md:p-6 transition-all min-w-0 ' +
                                (locked
                                    ? 'border-gray-100 opacity-70 cursor-not-allowed'
                                    : (activeCourseId
                                        ? 'border-gray-100 hover:border-vastu-gold/50 hover:shadow-md'
                                        : 'border-gray-100'))
                            }
                        >
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className={
                                    'w-11 h-11 rounded-xl flex items-center justify-center transition-colors shrink-0 ' +
                                    (locked
                                        ? 'bg-gray-100 text-gray-400'
                                        : 'bg-vastu-light text-vastu-gold group-hover:bg-vastu-gold group-hover:text-vastu-dark')
                                }>
                                    {locked ? <Lock size={20} /> : <BookOpen size={20} />}
                                </div>
                                {!locked && (
                                    <ChevronRight size={18} className="text-gray-300 group-hover:text-vastu-gold transition-colors shrink-0 mt-2" />
                                )}
                            </div>
                            <h2 className={
                                'font-serif text-lg md:text-xl mb-2 break-words ' +
                                (locked ? 'text-vastu-text-light' : 'text-vastu-dark group-hover:text-vastu-gold transition-colors')
                            }>
                                {week.title}
                            </h2>
                            {desc && (
                                <p className="text-vastu-text-light text-sm leading-relaxed line-clamp-3 break-words">
                                    {desc}
                                </p>
                            )}
                            <div className="mt-4 flex items-center gap-3 text-xs text-vastu-text-light">
                                <span className="inline-flex items-center gap-1">
                                    <BookOpen size={12} />
                                    {lessonCount} {lessonCount === 1 ? 'урок' : (lessonCount >= 2 && lessonCount <= 4 ? 'урока' : 'уроков')}
                                </span>
                                {locked && week.availableFrom && (
                                    <span className="inline-flex items-center gap-1 text-vastu-gold/80">
                                        <Clock size={12} />
                                        Откроется {formatAvailableFrom(week.availableFrom)}
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
