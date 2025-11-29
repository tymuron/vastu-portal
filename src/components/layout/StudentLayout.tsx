import { Outlet, Link, useLocation } from 'react-router-dom';
import { LogOut, User as UserIcon, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';

const { user } = useAuth();
const displayName = user?.user_metadata?.full_name || user?.email || 'Студент';
const initials = displayName.charAt(0).toUpperCase();

return (
    <div className="min-h-screen bg-vastu-light flex flex-col">
        {/* Header */}
        <header className="bg-vastu-dark text-vastu-light sticky top-0 z-50 shadow-md">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link to="/student" className="flex items-center gap-3 group">
                    <div className="w-8 h-8 bg-vastu-gold rounded-full flex items-center justify-center text-vastu-dark font-serif font-bold text-lg group-hover:scale-110 transition-transform">
                        {initials}
                    </div>
                    <span className="font-serif text-xl tracking-wide text-vastu-gold uppercase">{displayName}</span>
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8">
                    <Link
                        to="/student"
                        className={cn(
                            "text-sm uppercase tracking-widest hover:text-vastu-gold transition-colors",
                            location.pathname === '/student' ? "text-vastu-gold" : "text-vastu-light/80"
                        )}
                    >
                        Мой Курс
                    </Link>
                    <div className="flex items-center gap-4 pl-8 border-l border-white/10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                <UserIcon size={16} />
                            </div>
                            <span className="text-sm font-light">{displayName}</span>
                        </div>
                        <Link to="/login" className="text-vastu-light/50 hover:text-white transition-colors">
                            <LogOut size={18} />
                        </Link>
                    </div>
                </nav>

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden text-vastu-gold"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>
        </header>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
            <div className="md:hidden bg-vastu-dark border-t border-white/10 absolute top-16 left-0 w-full z-40 p-4 shadow-xl">
                <nav className="flex flex-col gap-4">
                    <Link
                        to="/student"
                        className="text-vastu-gold py-2 border-b border-white/5"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        Мой Курс
                    </Link>
                    <div className="flex items-center justify-between py-2 text-vastu-light/80">
                        <span>{displayName}</span>
                        <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
                            <LogOut size={18} />
                        </Link>
                    </div>
                </nav>
            </div>
        )}

        {/* Main Content */}
        <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
            <Outlet />
        </main>

        {/* Footer */}
        <footer className="bg-[#EAE6DE] py-8 text-center text-vastu-text/40 text-sm">
            <p>© 2025 Anna Romeo Design. Все права защищены.</p>
        </footer>
    </div>
);
}
