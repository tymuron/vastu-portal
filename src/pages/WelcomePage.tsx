import { useNavigate } from 'react-router-dom';

export default function WelcomePage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-vastu-light text-vastu-text">
            {/* HERO — burgundy editorial */}
            <section className="relative overflow-hidden bg-vastu-dark text-vastu-light">
                {/* Watermark */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-10 right-12 select-none font-serif italic text-vastu-light/[0.04]"
                    style={{
                        fontSize: 'clamp(140px, 18vw, 260px)',
                        letterSpacing: '-0.04em',
                        lineHeight: 1,
                    }}
                >
                    vastu
                </div>

                {/* Top brand strip */}
                <div className="flex items-center justify-between border-b border-vastu-light/10 px-8 py-6 sm:px-12 lg:px-16">
                    <div className="font-serif italic text-xl text-vastu-light sm:text-2xl">
                        Anna Romeo
                    </div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-vastu-gold">
                        Личный кабинет
                    </div>
                </div>

                {/* Hero title */}
                <div className="relative px-8 py-24 sm:px-12 sm:py-28 lg:px-16 lg:py-32">
                    <div className="grid items-end gap-12 lg:grid-cols-[1fr_auto] lg:gap-20">
                        <div>
                            <div className="mb-8 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-vastu-gold">
                                <span className="block h-px w-8 bg-vastu-gold/70" />
                                <span>С возвращением</span>
                            </div>
                            <h1
                                className="font-serif font-light text-vastu-light"
                                style={{
                                    fontSize: 'clamp(64px, 11vw, 168px)',
                                    lineHeight: 0.95,
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                Добро
                                <br />
                                <span
                                    className="font-serif italic text-vastu-gold"
                                    style={{ display: 'inline-block', paddingLeft: '0.1em' }}
                                >
                                    пожаловать
                                </span>
                            </h1>
                        </div>

                        <div className="max-w-sm border-l border-vastu-light/15 pl-8 pb-4">
                            <p className="font-serif text-lg font-light leading-relaxed text-vastu-light/85 sm:text-xl">
                                Ваше пространство{' '}
                                <span className="font-serif italic text-vastu-gold">открыто</span>.
                            </p>
                            <div className="mt-7 flex flex-wrap gap-3">
                                <button
                                    onClick={() => navigate('/student')}
                                    className="bg-vastu-gold px-6 py-3 font-serif text-base font-medium text-vastu-dark transition-colors hover:bg-[#D4C6A0]"
                                >
                                    К урокам
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Anna intro — cream-warm */}
            <section
                className="px-8 py-24 sm:px-12 sm:py-28 lg:px-16 lg:py-32"
                style={{ background: '#ECE7DC' }}
            >
                <div className="mx-auto grid max-w-5xl gap-16 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-20">
                    <div className="flex h-32 w-32 items-center justify-center rounded-full bg-vastu-dark font-serif text-5xl italic text-vastu-gold sm:h-40 sm:w-40">
                        A
                    </div>
                    <div>
                        <div className="mb-6 text-[11px] font-medium uppercase tracking-[0.18em] text-vastu-dark">
                            <span className="mr-1">—</span> Сообщение от Анны
                        </div>
                        <p
                            className="font-serif italic font-normal leading-snug text-vastu-text"
                            style={{
                                fontSize: 'clamp(24px, 3vw, 36px)',
                                letterSpacing: '-0.005em',
                            }}
                        >
                            «Рада приветствовать вас здесь. Желаю вам глубокого погружения
                            и пользы от каждого урока.»
                        </p>
                        <div className="mt-8 font-serif text-lg text-vastu-text">
                            Anna Romeo
                            <span className="ml-3 text-[10px] font-medium uppercase tracking-[0.16em] text-vastu-text-light">
                                · Куратор курса
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="bg-vastu-dark px-8 py-24 text-center text-vastu-light sm:px-12 sm:py-28 lg:px-16">
                <div className="mb-8 flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-vastu-gold">
                    <span className="block h-px w-8 bg-vastu-gold/70" />
                    <span>Начнём</span>
                    <span className="block h-px w-8 bg-vastu-gold/70" />
                </div>
                <h2
                    className="mx-auto max-w-3xl font-serif font-light text-vastu-light"
                    style={{
                        fontSize: 'clamp(40px, 6vw, 84px)',
                        lineHeight: 1.05,
                        letterSpacing: '-0.015em',
                    }}
                >
                    Ваш кабинет{' '}
                    <span className="font-serif italic text-vastu-gold">ждёт</span>
                </h2>
                <button
                    onClick={() => navigate('/student')}
                    className="mt-12 bg-vastu-gold px-10 py-4 font-serif text-lg font-medium text-vastu-dark transition-colors hover:bg-[#D4C6A0]"
                >
                    Войти в кабинет
                </button>
            </section>

            {/* Footer */}
            <footer className="flex flex-wrap items-center justify-between gap-6 border-t border-vastu-light/10 bg-[#361A1D] px-8 py-10 text-vastu-light sm:px-12 lg:px-16">
                <div className="font-serif italic text-2xl">
                    Anna Romeo <span className="text-vastu-gold">·</span> Vastu
                </div>
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-vastu-light/70">
                    Личный кабинет
                </div>
            </footer>
        </div>
    );
}
