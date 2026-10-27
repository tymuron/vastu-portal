import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_CURRENCIES = ['EUR', 'RUB', 'USD'] as const;
type Currency = (typeof ALLOWED_CURRENCIES)[number];
const CURRENCY_SIGN: Record<Currency, string> = { RUB: '₽', EUR: '€', USD: '$' };

type OfferInfo = { title: string; prices: Partial<Record<Currency, number>> };

// Rubles: СБП or a card. Card-only checkouts were declined a lot on the
// masterclass day (14 of 16 failed or abandoned), so СБП is offered first.
type Method = 'sbp' | 'card';
const METHODS: { key: Method; label: string }[] = [
    { key: 'sbp', label: 'СБП' },
    { key: 'card', label: 'Картой' },
];

// The Ukrainian landing (/ua/) sends buyers here with ?lang=uk: the same
// checkout in Ukrainian, card only (€ / $) — rubles don't apply there.
type Lang = 'ru' | 'uk';
const TEXT = {
    ru: {
        thanksTitle: 'Спасибо! Оплата прошла',
        thanks1: 'В течение нескольких минут на вашу почту придёт письмо от Anna Romeo со ссылкой в личный кабинет, в Telegram-канал и чат курса.',
        thanks2: 'Не видите письма через 10 минут — загляните в «Спам» и «Промоакции» или запросите ссылку ещё раз.',
        sendLink: 'Прислать ссылку для входа',
        badLink: 'Неверная ссылка на оплату. Проверьте URL или свяжитесь с автором.',
        intro: 'Введите email, на который придёт доступ к курсу. Сразу после оплаты на эту почту придёт письмо со ссылкой в личный кабинет и в Telegram-чат курса.',
        failed: 'Оплата не прошла. Чаще всего банк отклоняет карту — попробуйте через СБП или другой картой.',
        notFound: 'Этот оффер не найден на стороне Lava. Свяжитесь с автором.',
        invoiceFailed: 'Не удалось создать счёт. Попробуйте ещё раз.',
        offline: 'Не удалось связаться с сервером. Проверьте интернет.',
        currency: 'Валюта',
        method: 'Способ оплаты',
        sbpHint: 'Через приложение вашего банка — по QR-коду или ссылке',
        creating: 'Создаём счёт…',
        pay: 'Перейти к оплате',
    },
    uk: {
        thanksTitle: 'Дякуємо! Оплата пройшла',
        thanks1: 'Протягом кількох хвилин на вашу пошту прийде лист від Anna Romeo з посиланням в особистий кабінет, у Telegram-канал і чат курсу.',
        thanks2: 'Не бачите листа за 10 хвилин — зазирніть у «Спам» і «Промоакції» або запросіть посилання ще раз.',
        sendLink: 'Надіслати посилання для входу',
        badLink: 'Неправильне посилання на оплату. Перевірте URL або зв’яжіться з авторкою.',
        intro: 'Введіть email, на який прийде доступ до курсу. Одразу після оплати на цю пошту прийде лист із посиланням в особистий кабінет і в Telegram-чат курсу. Навчання проходить російською мовою.',
        failed: 'Оплата не пройшла. Найчастіше банк відхиляє картку — спробуйте іншу картку.',
        notFound: 'Цей тариф не знайдено на боці Lava. Зв’яжіться з авторкою.',
        invoiceFailed: 'Не вдалося створити рахунок. Спробуйте ще раз.',
        offline: 'Не вдалося зв’язатися із сервером. Перевірте інтернет.',
        currency: 'Валюта',
        method: 'Спосіб оплати',
        sbpHint: '',
        creating: 'Створюємо рахунок…',
        pay: 'Перейти до оплати',
    },
} as const;
// lava's product titles are Russian; on the Ukrainian checkout show these.
const UK_TITLES: Record<string, string> = {
    '4d14d633-0578-4ce8-8ad6-2d85bc3e0c49': 'Курс «Васту-дизайн» від Anna Romeo · тариф «Основний»',
    'd6a1aacb-974b-411c-8cee-3d353a44c852': 'Курс «Васту-дизайн» від Anna Romeo · тариф «Наставництво»',
    'ded0ec37-2888-4336-8e2d-38c49bab7df6': 'Курс «Васту-дизайн» від Anna Romeo · тариф «Основний» (ціна для учасниць майстер-класу)',
};

function useLang(): Lang {
    const [searchParams] = useSearchParams();
    const lang: Lang = searchParams.get('lang') === 'uk' ? 'uk' : 'ru';
    useEffect(() => {
        if (lang !== 'uk') return;
        const prev = document.documentElement.lang;
        document.documentElement.lang = 'uk';
        return () => { document.documentElement.lang = prev; };
    }, [lang]);
    return lang;
}

// 55 000 ₽ · 599,50 € · 671 $ — Russian number style, sign after.
function formatPrice(amount: number, currency: Currency) {
    const cents = amount % 1 !== 0 ? 2 : 0;
    const n = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: cents, maximumFractionDigits: 2 }).format(amount);
    return `${n} ${CURRENCY_SIGN[currency]}`;
}

export default function BuyPage() {
    const { offerId } = useParams<{ offerId: string }>();
    // lava sends the buyer back to /buy/thanks after a successful payment.
    return offerId === 'thanks' ? <BuyThanks /> : <BuyForm offerId={offerId} />;
}

function Shell({ children }: { children: React.ReactNode }) {
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
                {children}
            </div>
        </div>
    );
}

function BuyThanks() {
    const t = TEXT[useLang()];
    return (
        <Shell>
            <div className="text-center space-y-4 text-vastu-light/85 text-sm leading-relaxed">
                <p className="text-vastu-gold font-serif text-2xl">{t.thanksTitle}</p>
                <p>{t.thanks1}</p>
                <p className="text-vastu-light/60">{t.thanks2}</p>
                <a
                    href="/forgot-password"
                    className="block w-full border border-vastu-gold/40 text-vastu-gold font-serif text-lg py-3 rounded-lg hover:bg-vastu-gold/10 transition-all"
                >
                    {t.sendLink}
                </a>
            </div>
        </Shell>
    );
}

function BuyForm({ offerId }: { offerId?: string }) {
    const [searchParams] = useSearchParams();
    const lang = useLang();
    const t = TEXT[lang];
    // Ukraine: card in € or $ only.
    const currencies = lang === 'uk' ? ALLOWED_CURRENCIES.filter((c) => c !== 'RUB') : ALLOWED_CURRENCIES;
    const paymentFailed = searchParams.get('failed') === '1';
    const queryCurrency = (searchParams.get('currency') || '').toUpperCase();
    const initialCurrency: Currency = (currencies as readonly string[]).includes(queryCurrency)
        ? (queryCurrency as Currency)
        : 'EUR';

    const [email, setEmail] = useState('');
    const [currency, setCurrency] = useState<Currency>(initialCurrency);
    const [method, setMethod] = useState<Method>('sbp');
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
                body: JSON.stringify({ email: email.trim(), offerId, currency, method, ...(lang === 'uk' ? { lang } : {}) })
            });
            const data = await resp.json().catch(() => ({}));

            if (!resp.ok || !data?.paymentUrl) {
                setSubmitting(false);
                setError(resp.status === 404 ? t.notFound : data?.error || t.invoiceFailed);
                return;
            }

            window.location.href = data.paymentUrl;
        } catch (err) {
            setSubmitting(false);
            setError(t.offline);
        }
    };

    const toggle = (active: boolean) =>
        'flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300 ' +
        (active ? 'bg-vastu-gold text-vastu-dark shadow-lg' : 'text-vastu-light/50 hover:text-vastu-light');

    return (
        <Shell>
            {!offerIsValid ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                    {t.badLink}
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    {offerInfo && (
                        <div className="text-center border-y border-vastu-gold/20 py-4">
                            <p className="text-vastu-light font-serif text-lg leading-snug">{(lang === 'uk' && offerId && UK_TITLES[offerId]) || offerInfo.title}</p>
                            {price != null && (
                                <p className="text-vastu-gold font-serif text-2xl mt-2">{formatPrice(price, currency)}</p>
                            )}
                        </div>
                    )}
                    <p className="text-vastu-light/80 text-center text-sm leading-relaxed">{t.intro}</p>

                    {paymentFailed && !error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                            {t.failed}
                        </div>
                    )}
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
                        <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">{t.currency}</label>
                        <div className="flex gap-2 p-1 bg-black/20 rounded-lg">
                            {currencies.filter((c) => !offerInfo || offerInfo.prices[c] != null).map((c) => (
                                <button type="button" key={c} onClick={() => setCurrency(c)} disabled={submitting} className={toggle(currency === c)}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    {currency === 'RUB' && (
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">{t.method}</label>
                            <div className="flex gap-2 p-1 bg-black/20 rounded-lg">
                                {METHODS.map((m) => (
                                    <button type="button" key={m.key} onClick={() => setMethod(m.key)} disabled={submitting} className={toggle(method === m.key)}>
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                            {method === 'sbp' && (
                                <p className="text-vastu-light/50 text-xs mt-1.5 ml-1">{t.sbpHint}</p>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting || !email}
                        className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {submitting ? t.creating : t.pay}
                    </button>
                </form>
            )}
        </Shell>
    );
}
