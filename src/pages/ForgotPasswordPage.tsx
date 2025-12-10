import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/update-password`,
            });

            if (error) throw error;

            setMessage('Ссылка для сброса пароля отправлена на ваш Email. Пожалуйста, проверьте почту.');
        } catch (err: any) {
            setError(err.message || 'Ошибка отправки ссылки');
        } finally {
            setLoading(false);
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
                    <h1 className="text-3xl font-serif text-vastu-gold mb-2">Восстановление</h1>
                    <p className="text-vastu-light/60 font-light tracking-widest text-sm uppercase">пароля от аккаунта</p>
                </div>

                <form onSubmit={handleReset} className="space-y-6">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                            {error}
                        </div>
                    )}
                    {message && (
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-200 text-sm text-center">
                            {message}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all"
                            placeholder="name@example.com"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Отправка...' : 'Отправить ссылку'}
                    </button>

                    <div className="text-center">
                        <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-vastu-gold/70 hover:text-vastu-gold transition-colors">
                            <ArrowLeft size={16} />
                            Вернуться ко входу
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
