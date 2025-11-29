import { Outlet, Link, useLocation } from 'react-router-dom';
import { LogOut, Layout, Users, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function TeacherLayout() {
    const location = useLocation();

    const navItems = [
        { path: '/teacher', label: 'Курс', icon: Layout },
        { path: '/teacher/students', label: 'Студенты', icon: Users },
        { path: '/teacher/settings', label: 'Настройки', icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-vastu-dark text-vastu-light flex flex-col fixed h-full z-20">
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-vastu-gold rounded-full flex items-center justify-center text-vastu-dark font-serif font-bold text-lg">
                            A
                        </div>
                        <span className="font-serif text-xl tracking-wide text-vastu-gold">ADMIN</span>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                                location.pathname === item.path
                                    ? "bg-vastu-gold text-vastu-dark"
                                    : "text-vastu-light/70 hover:text-vastu-light hover:bg-white/5"
                            )}
                        >
                            <item.icon size={18} />
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <Link
                        to="/login"
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-vastu-light/70 hover:text-vastu-light hover:bg-white/5 transition-colors"
                    >
                        <LogOut size={18} />
                        Выйти
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                <Outlet />
            </main>
        </div>
    );
}
