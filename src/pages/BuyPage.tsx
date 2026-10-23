import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_CURRENCIES = ['EUR', 'RUB', 'USD'] as const;
type Currency = (typeof ALLOWED_CURRENCIES)[number];
const CURRENCY_SIGN: Record<Currency, string> = { RUB: '₽', EUR: '€', USD: '$' };

type OfferInfo = { title: string; prices: Partial<Record<Currency, number>> };

// 55 000 ₽ · 599,50 € · 671 $ — Russian number style, sign after.
function formatPrice(amount: number, currency: Currency) {
    const cents = amount % 1 !== 0 ? 2 : 0;
    const n = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: cents, maximumFractionDigits: 2 }).format(amount);
    return `${n} ${CURRENCY_SIGN[currency]}`;
}

export default function BuyPage() {
    const { offerId } = useParams<{ offerId: string }>();
    const [searchParams] = useSearchParams();
    const queryCurrency = (searchParams.get('currency') || '').toUpperCase();
    const initialCurrency: Currency = (ALLOWED_CURRENCIES as readonly string[]).includes(queryCurrency)
        ? (queryCurrency as Currency)
        : 'EUR';

    const [email, setEmail] = useState('');
    const [currency, setCurrency] = useState<Currency>(initialCurrency);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // null = loading or catalog unreachable (checkout still works), 'missing' = lava doesn't know this offer.
    const [offer, setOffer] = useState<OfferInfo | 'missing' | null>(null);

    const offerIsValid = !!offerId && UUID_RE.test(offerId) && offer !== 'missing';

    useEffect(() => {
        if (!offerId || !UUID_RE.test(offerId)) return;
        let cancelled = false;
        fetch(`/api/lava/offer/${offerId}`)
            .then((r) => (r.status === 404 ? 'missing' : r.ok ? r.json() : null))
            .then((data) => { if (!cancelled) setOffer(data); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [offerId]);

    const offerInfo = offer && offer !== 'missing' ? offer : null;
    const price = offerInfo?.prices[currency];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!offerIsValid) return;
        setError(null);
        setSubmitting(true);

        try {
            const resp = await fetch('/api/lava/invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), offerId, currency })
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
                        {offerInfo && (
                            <div className="text-center border-y border-vastu-gold/20 py-4">
                                <p className="text-vastu-light font-serif text-lg leading-snug">{offerInfo.title}</p>
                                {price != null && (
                                    <p className="text-vastu-gold font-serif text-2xl mt-2">{formatPrice(price, currency)}</p>
                                )}
                            </div>
                        )}
                        <p className="text-vastu-light/80 text-center text-sm leading-relaxed">
                            Введите email, на который придёт доступ к курсу.
                            Сразу после оплаты на эту почту придёт письмо со ссылкой в личный кабинет и в Telegram-чат курса.
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

                        <div>
                            <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Валюта</label>
                            <div className="flex gap-2 p-1 bg-black/20 rounded-lg">
                                {ALLOWED_CURRENCIES.filter((c) => !offerInfo || offerInfo.prices[c] != null).map((c) => (
                                    <button
                                        type="button"
                                        key={c}
                                        onClick={() => setCurrency(c)}
                                        disabled={submitting}
                                        className={
                                            'flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300 ' +
                                            (currency === c
                                                ? 'bg-vastu-gold text-vastu-dark shadow-lg'
                                                : 'text-vastu-light/50 hover:text-vastu-light')
                                        }
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
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
