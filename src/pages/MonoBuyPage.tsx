import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

// /buy/mono/<plan> — the course in installments through monobank
// «Покупка Частинами» (server: mono.js). The buyer approves the agreement in
// the monobank app; this page waits for that and says what happened.
// The service name and the legal block below are monobank's requirements
// (knowledge-base/chast/marketing), not copy to rewrite. The page is in
// Ukrainian: every buyer here is a monobank client in Ukraine.

type Plan = { title: string; uah: number; parts: number[] };
type Stage = 'form' | 'waiting' | 'done' | 'failed';

const POLL_MS = 4000;
const GIVE_UP_MS = 20 * 60 * 1000; // monobank cancels an unapproved order after 15 min

function uah(n: number) {
    return `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(n)} ₴`;
}

// 3 платежі, 5 платежів
function payments(n: number) {
    const tail = n % 100;
    return n % 10 >= 2 && n % 10 <= 4 && (tail < 12 || tail > 14) ? `${n} платежі` : `${n} платежів`;
}

// Verbatim from monobank's product page — must be published wherever the
// service is offered. Ukrainian on purpose: it is the bank's legal text.
function MonoLegal() {
    return (
        <div className="mt-8 pt-5 border-t border-vastu-gold/15 text-[11px] leading-relaxed text-vastu-light/45 space-y-1.5" lang="uk">
            <p className="text-vastu-light/60">Покупка частинами monobank | Universal Bank</p>
            <p>
                Надавач послуг: АТ «УНІВЕРСАЛ БАНК» ліцензія НБУ №92 від 20.01.1994, номер у держреєстрі банків № 226.
            </p>
            <p>
                Мінімальна сума розстрочки: 2 грн. Максимальна сума розстрочки: 400 000 грн. Реальна річна процентна
                ставка: 0,000001%. Доступний строк, платежів: 3 — 25. Порядок погашення: щомісячні платежі рівними
                частинами. Перший платіж у момент оформлення покупки.
            </p>
            <p>
                Інформація про істотні характеристики продукту та попередження розміщені на сайті продукту{' '}
                <a href="https://chast.monobank.ua" target="_blank" rel="noopener noreferrer" className="underline hover:text-vastu-gold">
                    chast.monobank.ua
                </a>
            </p>
        </div>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-vastu-dark relative overflow-hidden px-4 py-10">
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
                <MonoLegal />
            </div>
        </div>
    );
}

export default function MonoBuyPage() {
    const { plan: planKey } = useParams<{ plan: string }>();
    // undefined = loading, null = this plan can't be paid in parts
    const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('+380');
    const [parts, setParts] = useState<number | null>(null);
    const [stage, setStage] = useState<Stage>('form');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orderId, setOrderId] = useState<string | null>(null);
    const [isTest, setIsTest] = useState(false);
    const startedAt = useRef(0);

    useEffect(() => {
        const prev = document.documentElement.lang;
        document.documentElement.lang = 'uk';
        return () => { document.documentElement.lang = prev; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/mono/plan/${encodeURIComponent(planKey || '')}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((p: Plan | null) => {
                if (cancelled) return;
                setPlan(p);
                if (p?.parts?.length) setParts(p.parts[p.parts.length - 1]);
            })
            .catch(() => !cancelled && setPlan(null));
        return () => { cancelled = true; };
    }, [planKey]);

    // Waiting for the approval in the app. Each poll also makes the server
    // confirm the order and open access the moment monobank says yes.
    useEffect(() => {
        if (stage !== 'waiting' || !orderId) return;
        let stop = false;
        let timer: ReturnType<typeof setTimeout>;
        const tick = async () => {
            try {
                const r = await fetch(`/api/mono/order/${orderId}`, { cache: 'no-store' });
                const s = await r.json().catch(() => ({}));
                if (stop) return;
                if (s.granted || s.state === 'SUCCESS') { setIsTest(!!s.test); setStage('done'); return; }
                if (s.state === 'FAIL') { setError(s.message || 'monobank не схвалив заявку.'); setStage('failed'); return; }
            } catch { /* network blip: keep waiting */ }
            if (Date.now() - startedAt.current > GIVE_UP_MS) {
                setError('Заявку так і не підтвердили в застосунку. Якщо списання все ж відбулося — доступ прийде на пошту автоматично.');
                setStage('failed');
                return;
            }
            timer = setTimeout(tick, POLL_MS);
        };
        timer = setTimeout(tick, POLL_MS);
        return () => { stop = true; clearTimeout(timer); };
    }, [stage, orderId]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!plan || !parts) return;
        setError(null);
        setSubmitting(true);
        try {
            const r = await fetch('/api/mono/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: planKey, email: email.trim(), phone, parts }),
            });
            const data = await r.json().catch(() => ({}));
            setSubmitting(false);
            if (!r.ok || !data.orderId) {
                setError(data.error || 'Не вдалося створити заявку. Спробуйте ще раз.');
                return;
            }
            startedAt.current = Date.now();
            setOrderId(data.orderId);
            setStage('waiting');
        } catch {
            setSubmitting(false);
            setError('Не вдалося зв’язатися із сервером. Перевірте інтернет.');
        }
    };

    if (plan === undefined) {
        return <Shell><p className="text-center text-vastu-light/60 text-sm">Завантажуємо тариф…</p></Shell>;
    }
    if (plan === null) {
        return (
            <Shell>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                    Цей тариф зараз не можна оформити через «Покупку Частинами». Поверніться на сторінку курсу й оберіть інший спосіб оплати.
                </div>
            </Shell>
        );
    }

    const header = (
        <div className="text-center border-y border-vastu-gold/20 py-4 mb-6">
            <p className="text-vastu-light font-serif text-lg leading-snug">{plan.title}</p>
            <p className="text-vastu-gold font-serif text-2xl mt-2">{uah(plan.uah)}</p>
            {parts && (
                <p className="text-vastu-light/70 text-sm mt-1">
                    {payments(parts)} по {uah(Math.ceil((plan.uah / parts) * 100) / 100)} · без переплат
                </p>
            )}
        </div>
    );

    if (stage === 'waiting') {
        return (
            <Shell>
                {header}
                <div className="text-center space-y-4 text-vastu-light/85 text-sm leading-relaxed">
                    <p className="text-vastu-gold font-serif text-2xl">Підтвердіть у застосунку monobank</p>
                    <p>
                        Ми надіслали заявку на номер <span className="text-vastu-light whitespace-nowrap">{phone}</span>.
                        Відкрийте застосунок monobank — там уже чекає сповіщення про «Покупку Частинами».
                        Підтвердіть його протягом 15 хвилин.
                    </p>
                    <p className="text-vastu-light/60">Не закривайте цю сторінку — вона оновиться сама.</p>
                    <div className="flex justify-center pt-2" aria-hidden="true">
                        <div className="w-8 h-8 border-2 border-vastu-gold/30 border-t-vastu-gold rounded-full animate-spin" />
                    </div>
                </div>
            </Shell>
        );
    }

    if (stage === 'done' && isTest) {
        return (
            <Shell>
                {header}
                <div className="text-center space-y-4 text-vastu-light/85 text-sm leading-relaxed">
                    <p className="text-vastu-gold font-serif text-2xl">Тест пройдено ✓</p>
                    <p>Договір оформлено й підтверджено магазином — інтеграцію перевірено. Доступ до курсу за тестове замовлення не видається.</p>
                    <p className="text-vastu-light/60">Тепер скасуйте цей договір у бізнес-кабінеті monobank.</p>
                </div>
            </Shell>
        );
    }

    if (stage === 'done') {
        return (
            <Shell>
                {header}
                <div className="text-center space-y-4 text-vastu-light/85 text-sm leading-relaxed">
                    <p className="text-vastu-gold font-serif text-2xl">Готово! Доступ відкрито</p>
                    <p>
                        На <span className="text-vastu-light">{email.trim()}</span> уже йде лист від Anna Romeo
                        з посиланням в особистий кабінет, у Telegram-канал і чат курсу.
                    </p>
                    <p className="text-vastu-light/60">
                        Не бачите листа за 10 хвилин — зазирніть у «Спам» і «Промоакції» або запросіть посилання ще раз.
                    </p>
                    <a
                        href="/forgot-password"
                        className="block w-full border border-vastu-gold/40 text-vastu-gold font-serif text-lg py-3 rounded-lg hover:bg-vastu-gold/10 transition-all"
                    >
                        Надіслати посилання для входу
                    </a>
                </div>
            </Shell>
        );
    }

    const toggle = (active: boolean) =>
        'flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300 ' +
        (active ? 'bg-vastu-gold text-vastu-dark shadow-lg' : 'text-vastu-light/50 hover:text-vastu-light');
    const input =
        'w-full bg-vastu-light/10 border border-vastu-gold/30 rounded-lg px-4 py-3 text-vastu-light placeholder-vastu-light/30 focus:outline-none focus:border-vastu-gold focus:ring-1 focus:ring-vastu-gold transition-all';

    return (
        <Shell>
            {header}
            <form onSubmit={submit} className="space-y-6">
                <p className="text-vastu-light/80 text-center text-sm leading-relaxed">
                    «Покупка Частинами monobank» — для клієнтів monobank в Україні. Ціна та сама, що й під час оплати одразу.
                    Перший платіж спишеться, коли ви підтвердите заявку в застосунку, і одразу після цього
                    на пошту прийде доступ до курсу. Навчання проходить російською мовою.
                </p>

                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Email для доступу</label>
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="name@example.com" disabled={submitting} />
                </div>

                <div>
                    <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Телефон у monobank</label>
                    <input type="tel" required inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} placeholder="+380 67 123 45 67" disabled={submitting} />
                    <p className="text-vastu-light/50 text-xs mt-1.5 ml-1">Номер, на який зареєстровано застосунок monobank</p>
                </div>

                {plan.parts.length > 1 && (
                    <div>
                        <label className="block text-xs uppercase tracking-wider text-vastu-gold/80 mb-1.5 ml-1">Кількість платежів</label>
                        <div className="flex gap-2 p-1 bg-black/20 rounded-lg">
                            {plan.parts.map((n) => (
                                <button type="button" key={n} onClick={() => setParts(n)} disabled={submitting} className={toggle(parts === n)}>
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={submitting || !email || !parts}
                    className="w-full bg-vastu-gold text-vastu-dark font-serif text-lg font-medium py-3 rounded-lg hover:bg-[#D4C6A0] transform hover:scale-[1.02] transition-all duration-300 shadow-lg shadow-vastu-gold/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    {submitting ? 'Надсилаємо заявку…' : stage === 'failed' ? 'Спробувати ще раз' : 'Оформити Покупку Частинами'}
                </button>
            </form>
        </Shell>
    );
}
