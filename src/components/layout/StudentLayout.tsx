import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, Menu, X, Loader2, BookOpen, Video, Library, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useWeeks } from '../../hooks/useCourse';

export default function StudentLayout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCourseExpanded, setIsCourseExpanded] = useState(true);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, signOut, loading: authLoading } = useAuth();
    const { weeks, loading: weeksLoading } = useWeeks();
    const displayName = user?.user_metadata?.full_name || user?.email || 'Студент';

    // Extract weekId from query params if on dashboard
    const searchParams = new URLSearchParams(location.search);
    const activeWeekId = searchParams.get('week');

    if (authLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-vastu-gold" size={40} /></div>;

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    const NavItem = ({ to, icon: Icon, label, isActive, onClick }: { to: string; icon: any; label: string; isActive: boolean; onClick?: () => void }) => (
        <Link
            to={to}
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
                isActive
                    ? "bg-vastu-gold/10 text-vastu-dark font-medium"
                    : "text-vastu-light/70 hover:bg-white/5 hover:text-vastu-light"
            )}
        >
            <Icon size={20} className={cn("transition-colors", isActive ? "text-vastu-gold" : "text-vastu-light/50 group-hover:text-vastu-gold")} />
            <span>{label}</span>
        </Link>
    );

    return (
        <div className="min-h-screen bg-vastu-light flex">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-72 bg-vastu-dark text-vastu-light flex-col fixed h-full z-50 shadow-xl overflow-y-auto custom-scrollbar">
                <div className="p-6 border-b border-white/10">
                    <Link to="/student" className="flex items-center gap-3 group">
                        <div className="w-10 h-10 bg-vastu-gold rounded-full flex items-center justify-center text-vastu-dark font-serif font-bold text-xl group-hover:scale-110 transition-transform">
                            V
                        </div>
                        <div className="flex flex-col">
                            <span className="font-serif text-lg tracking-wide text-vastu-gold leading-none">ВАСТУ-ДИЗАЙН</span>

                        </div>
                    </Link>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {/* My Course Section */}
                    <div>
                        <button
                            onClick={() => setIsCourseExpanded(!isCourseExpanded)}
                            className="w-full flex items-center justify-between px-4 py-3 text-vastu-light/70 hover:text-vastu-light transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <BookOpen size={20} className="text-vastu-light/50" />
                                <span className="font-medium">Мой Курс</span>
                            </div>
                            {isCourseExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>

                        {isCourseExpanded && (
                            <div className="mt-1 ml-4 space-y-1 pl-4 border-l border-white/10">
                                {weeksLoading ? (
                                    <div className="px-4 py-2 text-xs text-white/30">Загрузка...</div>
                                ) : (
                                    weeks.map((week) => {
                                        const isWeekActive = (activeWeekId === week.id && location.pathname === '/student') ||
                                            location.pathname.includes(`/week/${week.id}`);
                                        return (
                                            <button
                                                key={week.id}
                                                onClick={() => {
                                                    if (!week.isLocked) {
                                                        navigate(`/student?week=${week.id}`);
                                                    }
                                                }}
                                                disabled={week.isLocked}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-all text-left group",
                                                    isWeekActive
                                                        ? "bg-white/10 text-vastu-gold"
                                                        : week.isLocked
                                                            ? "text-white/30 cursor-not-allowed"
                                                            : "text-vastu-light/60 hover:text-vastu-light hover:bg-white/5"
                                                )}
                                            >
                                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors mt-1.5",
                                                        isWeekActive ? "bg-vastu-gold" : "bg-white/20"
                                                    )} />
                                                    <span className="whitespace-normal leading-tight break-words">{week.title}</span>
                                                </div>
                                                {week.isLocked && <Lock size={12} className="opacity-50" />}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>

                    <NavItem
                        to="/student/streams"
                        icon={Video}
                        label="Эфиры"
                        isActive={location.pathname.includes('/streams')}
                    />

                    <NavItem
                        to="/student/library"
                        icon={Library}
                        label="Библиотека"
                        isActive={location.pathname.includes('/library')}
                    />
                </nav>

                <div className="p-4 border-t border-white/10">
                    <Link to="/student/profile" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group mb-2">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-vastu-light group-hover:text-vastu-gold transition-colors">
                            <UserIcon size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-vastu-light truncate">{displayName}</div>
                            <div className="text-xs text-white/40">Студент</div>
                        </div>
                    </Link>
                    <button
                        onClick={() => signOut()}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-vastu-light/50 hover:text-white transition-colors"
                    >
                        <LogOut size={16} />
                        <span>Выйти из аккаунта</span>
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="md:hidden bg-vastu-dark text-vastu-light fixed top-0 w-full z-50 shadow-md h-16 flex items-center justify-between px-4">
                <Link to="/student" className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-vastu-gold rounded-full flex items-center justify-center text-vastu-dark font-serif font-bold text-lg">
                        V
                    </div>
                    <span className="font-serif text-lg text-vastu-gold">ВАСТУ-ДИЗАЙН</span>
                </Link>
                <button
                    className="text-vastu-gold"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </header>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
                    <div className="bg-vastu-dark w-64 h-full shadow-2xl p-4 pt-20" onClick={e => e.stopPropagation()}>
                        <nav className="space-y-2">
                            {/* Mobile Weeks */}
                            <div className="mb-4">
                                <div className="text-xs uppercase tracking-widest text-white/40 mb-2 px-4">Мой Курс</div>
                                {weeks.map((week) => (
                                    <button
                                        key={week.id}
                                        onClick={() => {
                                            if (!week.isLocked) {
                                                navigate(`/student?week=${week.id}`);
                                                setIsMobileMenuOpen(false);
                                            }
                                        }}
                                        disabled={week.isLocked}
                                        className={cn(
                                            "w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm transition-all text-left",
                                            activeWeekId === week.id && location.pathname === '/student'
                                                ? "bg-white/10 text-vastu-gold"
                                                : week.isLocked
                                                    ? "text-white/30 cursor-not-allowed"
                                                    : "text-vastu-light/70"
                                        )}
                                    >
                                        <span className="whitespace-normal leading-tight">{week.title}</span>
                                        {week.isLocked && <Lock size={12} />}
                                    </button>
                                ))}
                            </div>

                            <div className="border-t border-white/10 pt-4">
                                <NavItem
                                    to="/student/streams"
                                    icon={Video}
                                    label="Эфиры"
                                    isActive={location.pathname.includes('/streams')}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                />
                                <NavItem
                                    to="/student/library"
                                    icon={Library}
                                    label="Библиотека"
                                    isActive={location.pathname.includes('/library')}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                />
                            </div>
                        </nav>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 md:ml-72 min-h-screen pt-16 md:pt-0">
                <div className="container mx-auto px-4 py-8 md:p-12 max-w-5xl">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
