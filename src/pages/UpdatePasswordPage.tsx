import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

export default function UpdatePasswordPage() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(true);

    useEffect(() => {
        // Simple check to ensure we have a session (handled by the magic link flow)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                // If no session, user might have just navigated here manually.
                // In a real magic link flow, Supabase sets the session before mounting if the #access_token is present.
                // We'll give it a moment or show an error if strictly required.
                // For now, let's assume if they are here, they clicked the link.
                // If they are not logged in, updateUser will fail anyway.
            }
            setVerifying(false);
        });
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.updateUser({ password: password });
            if (error) throw error;

            alert('Пароль успешно обновлен! Сейчас вы будете перенаправлены в личный кабинет.');
            navigate('/student');
        } catch (err: any) {
            setError(err.message || 'Ошибка обновления пароля. Возможно, ссылка устарела.');
        } finally {
            setLoading(false);
        }
    };

    if (verifying) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-vastu-dark">
                <Loader2 className="animate-spin text-vastu-gold" size={40} />
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
                    <h1 className="text-3xl font-serif text-vastu-gold mb-2">Новый пароль</h1>
                    <p className="text-vastu-light/60 font-light tracking-widest text-sm uppercase">Придумайте новый пароль</p>
                </div>

                <form onSubmit={handleUpdate} className="space-y-6">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Новый пароль</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Обновление...' : 'Сохранить пароль'}
                    </button>
                </form>
            </div>
        </div>
    );
}
