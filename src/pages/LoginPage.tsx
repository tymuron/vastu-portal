import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { UserRole } from '../lib/types';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
    const navigate = useNavigate();
    const [role, setRole] = useState<UserRole>('student');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            if (!import.meta.env.VITE_SUPABASE_URL) {
                // Mock fallback
                if (role === 'student') navigate('/student');
                else navigate('/teacher');
                return;
            }

            const { data: { user }, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            if (user) {
                // Fetch real role
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profileError) {
                    console.error('Error fetching profile:', profileError);
                }

                const realRole = profile?.role || 'student';

                if (realRole === 'teacher') {
                    navigate('/teacher');
                } else {
                    navigate('/student');
                }
            }

        } catch (err: any) {
            setError(err.message || 'Ошибка входа');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-vastu-dark relative overflow-hidden">
            {/* Background decorative elements */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-vastu-gold blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-vastu-gold blur-[100px]" />
            </div>

            <div className="w-full max-w-md p-8 bg-vastu-light/5 backdrop-blur-sm border border-vastu-gold/20 rounded-2xl shadow-2xl relative z-10">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-serif text-vastu-gold mb-2">ANNA ROMEO</h1>
                    <p className="text-vastu-light/60 font-light tracking-widest text-sm uppercase">Васту & Дизайн Портал</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="flex gap-4 p-1 bg-black/20 rounded-lg mb-6">
                        <button
                            type="button"
                            onClick={() => setRole('student')}
                            className={cn(
                                "flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300",
                                role === 'student'
                                    ? "bg-vastu-gold text-vastu-dark shadow-lg"
                                    : "text-vastu-light/50 hover:text-vastu-light"
                            )}
                        >
                            Студент
                        </button>
                        <button
                            type="button"
                            onClick={() => setRole('teacher')}
                            className={cn(
                                "flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300",
                                role === 'teacher'
                                    ? "bg-vastu-gold text-vastu-dark shadow-lg"
                                    : "text-vastu-light/50 hover:text-vastu-light"
                            )}
                        >
                            Преподаватель
                        </button>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all"
                                placeholder="name@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Пароль</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20"
                    >
                        Войти
                    </button>
                </form>
            </div>
        </div>
    );
}
