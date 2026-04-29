import { useNavigate } from 'react-router-dom';
import { Loader2, BookOpen, ChevronRight } from 'lucide-react';
import { useCourseContext } from '../../contexts/CourseContext';

export default function CoursePicker() {
    const navigate = useNavigate();
    const { courses, activeCourseId, setActiveCourseId, loading, error } = useCourseContext();

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-vastu-gold" size={40} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-2xl mx-auto text-center py-20">
                <p className="text-red-600">{error}</p>
            </div>
        );
    }

    const handlePick = (courseId: string) => {
        setActiveCourseId(courseId);
        navigate('/student');
    };

    // Strip HTML helper
    const stripHtml = (html: string) => {
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    };

    return (
        <div className="animate-fade-in max-w-5xl">
            <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-serif text-vastu-dark mb-3">Выберите курс</h1>
                <p className="text-vastu-text-light">
                    У вас открыт доступ к нескольким курсам. Выберите тот, с которым хотите работать.
                </p>
            </div>

            {courses.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                    <BookOpen size={40} className="mx-auto text-vastu-gold mb-4" />
                    <p className="text-vastu-dark font-medium mb-2">Нет доступных курсов</p>
                    <p className="text-vastu-text-light text-sm">
                        У вас пока нет доступа к курсам. После оплаты вы получите письмо с доступом.
                    </p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 gap-6">
                    {courses.map((course) => {
                        const isActive = course.id === activeCourseId;
                        return (
                            <button
                                key={course.id}
                                onClick={() => handlePick(course.id)}
                                className={
                                    "group text-left bg-white rounded-2xl border-2 p-6 md:p-8 transition-all hover:shadow-md " +
                                    (isActive
                                        ? "border-vastu-gold shadow-sm"
                                        : "border-gray-100 hover:border-vastu-gold/50")
                                }
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-vastu-light flex items-center justify-center text-vastu-gold group-hover:bg-vastu-gold group-hover:text-vastu-dark transition-colors">
                                        <BookOpen size={22} />
                                    </div>
                                    <ChevronRight
                                        size={20}
                                        className="text-gray-300 group-hover:text-vastu-gold transition-colors"
                                    />
                                </div>
                                <h2 className="font-serif text-xl md:text-2xl text-vastu-dark mb-2 group-hover:text-vastu-gold transition-colors">
                                    {course.title}
                                </h2>
                                {course.description && (
                                    <p className="text-vastu-text-light text-sm leading-relaxed line-clamp-3">
                                        {stripHtml(course.description)}
                                    </p>
                                )}
                                {isActive && (
                                    <div className="mt-4 inline-flex items-center text-xs uppercase tracking-wider text-vastu-gold">
                                        Активный курс
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
