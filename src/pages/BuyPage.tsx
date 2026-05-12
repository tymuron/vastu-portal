import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function BuyPage() {
    const { offerId } = useParams<{ offerId: string }>();
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const offerIsValid = !!offerId && UUID_RE.test(offerId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!offerIsValid) return;
        setError(null);
        setSubmitting(true);

        try {
            const resp = await fetch('/api/lava/invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), offerId, currency: 'RUB' })
            });
            const data = await resp.json().catch(() => ({}));

            if (!resp.ok || !data?.paymentUrl) {
                setSubmitting(false);
                setError(
                    resp.status === 404
                        ? 'Этот оффер не найден на стороне Lava. Свяжитесь с автором.'
                        : data?.error || 'Не удалось создать счёт. Попробуйте ещё раз.'
                );
                return;
            }

            window.location.href = data.paymentUrl;
        } catch (err) {
            setSubmitting(false);
            setError('Не удалось связаться с сервером. Проверьте интернет.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-vastu-dark relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-vastu-gold blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-vastu-gold blur-[100px]" />
            </div>

            <div className="w-full max-w-md p-8 bg-vastu-light/5 backdrop-blur-sm border border-vastu-gold/20 rounded-2xl shadow-2xl relative z-10">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-serif text-vastu-gold mb-2">ANNA ROMEO</h1>
                    <p className="text-vastu-light/60 font-light tracking-widest text-sm uppercase">Васту & Дизайн Портал</p>
                </div>

                {!offerIsValid ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                        Неверная ссылка на оплату. Проверьте URL или свяжитесь с автором.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <p className="text-vastu-light/80 text-center text-sm leading-relaxed">
                            Введите email, на который придёт доступ к курсу.
                            После оплаты вы получите письмо с приглашением в личный кабинет.
                        </p>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all"
                                placeholder="name@example.com"
                                disabled={submitting}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || !email}
                            className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                            {submitting ? 'Создаём счёт…' : 'Перейти к оплате'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
