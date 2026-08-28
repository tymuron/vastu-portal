import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { UserRole } from '../lib/types';
import { supabase } from '../lib/supabase';
import { LogOut, ArrowRight, User, Eye, EyeOff, AlertTriangle } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { getStorageTier } from '../lib/browserStorage';
import {
    inspectAuthEnvironment,
    describeEnvironment,
    supportSummary,
    type AuthEnvironment,
} from '../lib/authDiagnostics';

// Turn Supabase's raw English auth errors into a clear Russian message so a
// non-technical user (and we, when they report it) can tell *which* failure
// happened — a wrong password reads very differently from a blocked network.
function authErrorToRu(err: any): string {
    const msg = (err?.message || '').toLowerCase();
    const status = err?.status;
    // Network / transport failure: antivirus HTTPS scan, VPN, ad-blocker, ISP
    // block, or plain offline. Surfaces as "Failed to fetch" / AuthRetryableFetchError.
    if (err?.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|fetch|network/.test(msg)) {
        return 'Не удаётся связаться с сервером. Проверьте интернет, отключите VPN / блокировщик рекламы / антивирус (защита HTTPS-соединений) или попробуйте другую сеть.';
    }
    if (/invalid login credentials/.test(msg)) {
        return 'Неверный email или пароль. Проверьте раскладку клавиатуры (должна быть EN), Caps Lock и регистр букв.';
    }
    if (/email not confirmed/.test(msg)) {
        return 'Email не подтверждён. Откройте письмо от портала и перейдите по ссылке подтверждения.';
    }
    if (status === 429 || /rate limit|for security purposes/.test(msg)) {
        return 'Слишком много попыток входа. Подождите минуту и попробуйте снова.';
    }
    return err?.message || 'Ошибка входа';
}

export default function LoginPage() {
    const navigate = useNavigate();
    const { user, role: authRole, signOut, authIssue } = useAuth();
    const [role, setRole] = useState<UserRole>('student');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [environment, setEnvironment] = useState<AuthEnvironment | null>(null);

    // Check the machine, not the account. Every "I can't log in on my laptop but
    // it works on my phone" report so far has been a machine-level problem —
    // blocked site data or a wrong system clock — and the user has no way to
    // guess that. Probe on mount so the answer is on screen before they retry
    // in a fourth browser.
    useEffect(() => {
        let cancelled = false;
        inspectAuthEnvironment()
            .then((env) => { if (!cancelled) setEnvironment(env); })
            .catch(() => { /* diagnostics are best-effort */ });
        return () => { cancelled = true; };
    }, []);

    const environmentProblem = environment ? describeEnvironment(environment) : null;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // If nothing on this machine can hold the session — a security suite or
        // a privacy setting that drops site data — login "succeeds" and then
        // bounces straight back here. Say so instead of letting them loop.
        // sessionStorage / cookie fallbacks are good enough to continue, so only
        // the memory-only tier is a hard stop.
        if (getStorageTier() === 'memory') {
            setError('Браузер блокирует сохранение входа, поэтому вход не удержится. Отключите приватный режим или разрешите файлы cookie и данные сайта для этого адреса, затем повторите.');
            return;
        }

        setSubmitting(true);
        try {
            if (!import.meta.env.VITE_SUPABASE_URL) {
                // Mock fallback
                if (role === 'student') navigate('/welcome');
                else navigate('/teacher');
                return;
            }

            const { data: { user }, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
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
                    navigate('/welcome');
                }
            }

        } catch (err: any) {
            // Log the discriminating details so a future bug report is diagnosable.
            console.error('[login] signIn failed', { name: err?.name, status: err?.status, message: err?.message }, err);
            setError(authErrorToRu(err));
        } finally {
            setSubmitting(false);
        }
    };

    // If already logged in, show Welcome Back screen
    if (user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-vastu-dark relative overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-vastu-gold blur-[100px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-vastu-gold blur-[100px]" />
                </div>

                <div className="w-full max-w-md p-8 bg-vastu-light/5 backdrop-blur-sm border border-vastu-gold/20 rounded-2xl shadow-2xl relative z-10 text-center">
                    <div className="w-20 h-20 bg-vastu-gold rounded-full flex items-center justify-center mx-auto mb-6 text-vastu-dark">
                        <User size={40} />
                    </div>

                    <h2 className="text-2xl font-serif text-vastu-gold mb-2">С возвращением!</h2>
                    <p className="text-vastu-light/70 mb-8">
                        Вы уже вошли как<br />
                        <span className="text-white font-medium">{user.email}</span>
                    </p>

                    <div className="space-y-4">
                        <button
                            onClick={() => authRole === 'teacher' ? navigate('/teacher') : navigate('/welcome')}
                            className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20 flex items-center justify-center gap-2"
                        >
                            Продолжить
                            <ArrowRight size={20} />
                        </button>

                        <button
                            onClick={() => signOut()}
                            className="w-full bg-transparent border border-vastu-gold/30 text-vastu-light font-medium py-3 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                        >
                            <LogOut size={18} />
                            Выйти из аккаунта
                        </button>
                    </div>
                </div>
            </div>
        );
    }

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

                    {authIssue === 'session-lost' && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg text-amber-100 text-sm leading-relaxed">
                            <div className="flex items-start gap-2">
                                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-300" />
                                <div>
                                    <div className="font-medium mb-1">Вход сбросился</div>
                                    <p className="text-amber-100/80">
                                        {environmentProblem ??
                                            'Этот браузер не удержал вход. Разрешите файлы cookie и данные сайта для этого адреса и проверьте, что дата и время на компьютере выставлены автоматически.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {authIssue !== 'session-lost' && environmentProblem && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg text-amber-100 text-sm leading-relaxed">
                            <div className="flex items-start gap-2">
                                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-300" />
                                <p className="text-amber-100/80">{environmentProblem}</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                            {error}
                            {environment && (
                                <div className="mt-2 font-mono text-[10px] text-red-200/50 break-all">
                                    {supportSummary(environment)}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                className="w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all"
                                placeholder="name@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Пароль</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    className="w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 pr-12 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-vastu-light/50 hover:text-vastu-gold transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <div className="flex justify-end mt-1">
                                <Link to="/forgot-password" className="text-xs text-vastu-gold/70 hover:text-vastu-gold transition-colors">
                                    Забыли пароль?
                                </Link>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {submitting ? 'Вход…' : 'Войти'}
                    </button>
                </form>
            </div>
        </div>
    );
}
