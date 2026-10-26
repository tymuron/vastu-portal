import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft } from 'lucide-react';

// Why the visitor landed here from an /access link (see fulfilment.js).
const ARRIVAL_NOTICE: Record<string, string> = {
    expired: 'Ссылка из письма устарела. Отправим новую — нажмите кнопку ниже.',
    failed: 'Не получилось открыть ссылку. Отправим новую — нажмите кнопку ниже.',
    invalid: 'Ссылка повреждена. Введите почту, и мы пришлём новую.',
};

export default function ForgotPasswordPage() {
    const [searchParams] = useSearchParams();
    const [email, setEmail] = useState(searchParams.get('email') || '');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const arrival = ['expired', 'failed', 'invalid'].find((k) => searchParams.get(k) === '1');

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            // Our own endpoint sends the link through Resend from
            // hello@annaromeovastu.com (RESEND_FROM), with the course's Telegram links.
            // Supabase's mailer is only the fallback if our server is down.
            let sent = false;
            try {
                const resp = await fetch('/api/access/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.trim() }),
                });
                if (resp.status === 429) {
                    const data = await resp.json().catch(() => ({}));
                    throw new Error(data?.error || 'Слишком много запросов. Подождите 15 минут.');
                }
                sent = resp.ok;
            } catch (err: any) {
                if (err?.message?.startsWith('Слишком')) throw err;
            }

            if (!sent) {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/update-password`,
                });
                if (error) throw error;
            }

            setMessage(
                'Если этот адрес есть на платформе, письмо со ссылкой для входа уже в пути — от Anna Romeo (hello@annaromeovastu.com). ' +
                'Проверьте также «Спам» и «Промоакции». Не пришло за 10 минут — напишите @tymuron в Telegram.'
            );
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
                    {arrival && !message && (
                        <div className="p-3 bg-vastu-gold/10 border border-vastu-gold/30 rounded-lg text-vastu-light/90 text-sm text-center">
                            {ARRIVAL_NOTICE[arrival]}
                        </div>
                    )}
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
                        {loading ? 'Отправка...' : 'Прислать ссылку для входа'}
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
