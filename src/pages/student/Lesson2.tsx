import { ArrowDown, Check, X } from "lucide-react";
import vastuMapImage from "../../assets/vastu-map.jpg"; // Placeholder for the first uploaded image

const Lesson2 = () => {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Navigation */}
            <nav className="fixed w-full z-50 bg-background/80 backdrop-blur-sm border-b border-primary/10">
                <div className="container mx-auto px-4 md:px-8 py-3 md:py-4 flex justify-between items-center">
                    <div className="text-sm md:text-lg font-serif text-primary tracking-[0.2em] md:tracking-[0.3em] font-light">ANNA ROMEO</div>
                    <div className="text-[10px] md:text-xs uppercase tracking-[0.15em] md:tracking-[0.3em] text-muted-foreground font-light">Васту & Дизайн</div>
                </div>
            </nav>

            {/* Hero */}
            <header className="min-h-screen flex items-center justify-center pt-16 md:pt-20 py-12">
                <div className="container mx-auto px-4 md:px-8 text-center">
                    <div className="inline-block mb-6 md:mb-8 px-4 md:px-6 py-2 border border-primary/20 rounded-full">
                        <span className="text-primary text-[10px] md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] font-light">Урок 2 •</span>
                    </div>

                    <h1 className="text-3xl sm:text-5xl md:text-7xl font-serif text-primary mb-6 md:mb-8 font-light tracking-wide leading-tight">
                        КАК ПРОСТРАНСТВО
                        <br />
                        <span className="text-2xl sm:text-4xl md:text-6xl">ВЛИЯЕТ НА ЧЕЛОВЕКА</span>
                    </h1>

                    <div className="max-w-3xl mx-auto space-y-2 text-base md:text-lg text-foreground/70 font-light mb-8 md:mb-12">
                        <p>Физический, Эмоциональный и Энергетический Уровни</p>
                        <p>Дом как Зеркало Человека</p>
                    </div>

                    <ArrowDown className="mx-auto text-primary/40 animate-bounce" size={24} strokeWidth={1} />
                </div>
            </header>

            {/* Slide Separator */}
            <div className="w-full py-8">
                <div className="container mx-auto px-8">
                    <div className="h-px bg-primary/30 relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-6">
                            <span className="text-primary/40 text-xs tracking-widest">СЛАЙД 1</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="container mx-auto px-4 md:px-8 max-w-7xl">

                {/* Slide 1: Вступление */}
                <section className="min-h-screen flex flex-col justify-center py-12 md:py-0">
                    <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
                        <div className="h-px w-10 md:w-16 bg-primary/30"></div>
                        <span className="text-primary text-[10px] md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] font-light">Вступление</span>
                    </div>

                    <h2 className="text-2xl sm:text-4xl md:text-5xl font-serif mb-6 md:mb-8 font-light">Основа видения</h2>

                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="space-y-4 text-sm md:text-base text-foreground/80 font-light leading-relaxed">
                            <p>Сегодня мы продолжаем формировать основу, через которую вы будете видеть пространство.</p>
                            <p>После того как вы узнали, как устроена энергия мира и дома, сейчас мы разберём:</p>

                            <ul className="space-y-2 text-foreground/70 mt-4">
                                <li className="flex items-start gap-3">
                                    <span className="text-primary mt-1">✦</span>
                                    <span>Что именно пространство делает с человеком</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-primary mt-1">✦</span>
                                    <span>Как оно влияет на тело, эмоции и внутреннюю энергию</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-primary mt-1">✦</span>
                                    <span>Почему разные комнаты ощущаются по-разному</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-primary mt-1">✦</span>
                                    <span>И почему дом всегда показывает правду о человеке</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Slide Separator */}
                <div className="w-full py-12">
                    <div className="h-px bg-primary/30 relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-6">
                            <span className="text-primary/40 text-xs tracking-widest">СЛАЙД 2</span>
                        </div>
                    </div>
                </div>

                {/* Slide 2: Дом — Зеркало */}
                <section className="min-h-screen flex flex-col justify-center py-12 md:py-0">
                    <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
                        <div className="h-px w-10 md:w-16 bg-primary/30"></div>
                        <span className="text-primary text-[10px] md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] font-light">Фундаментальная истина</span>
                    </div>

                    <div className="max-w-4xl mx-auto space-y-6">
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-light leading-tight text-center">Дом — Зеркало Человека</h2>

                        <div className="p-6 md:p-8 border-l-2 border-primary bg-primary/5 my-8">
                            <p className="text-lg md:text-2xl font-serif text-primary italic text-center">
                                «Пространство влияет на нас каждый день. Ваш дом отражает ваши состояния.»
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h3 className="text-primary font-serif text-lg mb-2">Дом отражает:</h3>
                                <ul className="space-y-2 text-sm md:text-base text-foreground/70 font-light">
                                    <li className="border-b border-primary/10 pb-2">Привычки</li>
                                    <li className="border-b border-primary/10 pb-2">Эмоциональный фон</li>
                                    <li className="border-b border-primary/10 pb-2">Сценарии</li>
                                    <li className="border-b border-primary/10 pb-2">Зоны силы и избегания</li>
                                    <li className="border-b border-primary/10 pb-2">Внутренний порядок или хаос</li>
                                    <li className="text-primary italic pt-2">То, что человек ОЧЕНЬ старается не замечать</li>
                                </ul>
                            </div>

                            <div className="flex flex-col justify-center space-y-4 text-sm md:text-base text-foreground/80 font-light">
                                <p className="flex items-center gap-2"><Check size={16} className="text-primary" /> Дом никогда не бывает “случайным”.</p>
                                <p className="flex items-center gap-2"><Check size={16} className="text-primary" /> Дом — это всегда отражение того, что происходит внутри человека.</p>
                                <p className="flex items-center gap-2"><Check size={16} className="text-primary" /> То, с чем человек живёт во внешнем, показывает его внутренние процессы.</p>
                            </div>
                        </div>

                        <p className="text-center text-foreground/60 text-sm mt-8">
                            Поэтому работа с пространством всегда ведёт к изменению жизни.
                        </p>
                    </div>
                </section>

                {/* Slide Separator */}
                <div className="w-full py-12">
                    <div className="h-px bg-primary/30 relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-6">
                            <span className="text-primary/40 text-xs tracking-widest">СЛАЙД 3</span>
                        </div>
                    </div>
                </div>

                {/* Slide 3: Level 1 - Physical */}
                <section className="min-h-screen flex flex-col justify-center py-12">
                    <div className="text-center mb-6 md:mb-8">
                        <span className="text-primary/10 text-5xl md:text-7xl font-serif font-light block leading-none mb-3 md:mb-4">1</span>
                        <h2 className="text-2xl md:text-4xl font-serif font-light">Уровень 1 — Физический</h2>
                        <p className="text-primary text-[10px] md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] font-light">"Нулевой уровень"</p>
                    </div>

                    <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8 items-center">
                        <div className="p-6 border border-primary/20 rounded-xl bg-primary/5">
                            <p className="text-lg font-serif text-primary italic mb-4">
                                «Кресло удобное или неудобное — это физический уровень.»
                            </p>
                            <p className="text-sm text-foreground/70">
                                «Это значит, что вы что-то поставили… вам стало удобно.»
                            </p>
                        </div>

                        <div className="space-y-4 text-sm md:text-base text-foreground/70 font-light">
                            <p>Это уровень, который ощущается телом:</p>
                            <ul className="grid grid-cols-2 gap-2 text-xs md:text-sm">
                                <li>• свет</li>
                                <li>• воздух</li>
                                <li>• температура</li>
                                <li>• мебель</li>
                                <li>• запахи</li>
                                <li>• шум</li>
                            </ul>
                            <div className="pt-4 border-t border-primary/10">
                                <p>Если холодно — холодно. Если темно — темно.</p>
                                <p className="text-primary mt-2">Никакой мистики — чистая физиология.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Slide Separator */}
                <div className="w-full py-12">
                    <div className="h-px bg-primary/30 relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-6">
                            <span className="text-primary/40 text-xs tracking-widest">СЛАЙД 4</span>
                        </div>
                    </div>
                </div>

                {/* Slide 4: Level 2 - Emotional */}
                <section className="min-h-screen flex flex-col justify-center py-12">
                    <div className="text-center mb-6 md:mb-8">
                        <span className="text-primary/10 text-5xl md:text-7xl font-serif font-light block leading-none mb-3 md:mb-4">2</span>
                        <h2 className="text-2xl md:text-4xl font-serif font-light">Уровень 2 — Эмоциональный</h2>
                    </div>

                    <div className="max-w-4xl mx-auto">
                        <div className="grid md:grid-cols-2 gap-8 mb-8">
                            <div className="p-6 border-l-4 border-primary/30 bg-background">
                                <p className="text-base font-serif italic text-foreground/80">«Когда результат зависит от настроения.»</p>
                            </div>
                            <div className="p-6 border-l-4 border-primary/30 bg-background">
                                <p className="text-base font-serif italic text-foreground/80">«Когда светит солнце — появляется радость.»</p>
                            </div>
                        </div>

                        <div className="space-y-6 text-center max-w-2xl mx-auto">
                            <p className="text-sm md:text-base text-foreground/70 font-light">
                                Это неконтролируемая реакция эмоционального центра человека на энергетику зоны.
                            </p>

                            <div className="grid grid-cols-2 gap-4 text-xs md:text-sm text-foreground/60">
                                <div className="p-4 bg-primary/5 rounded-lg">Появляется раздражение</div>
                                <div className="p-4 bg-primary/5 rounded-lg">Возникает спокойствие</div>
                                <div className="p-4 bg-primary/5 rounded-lg">Хочется уйти</div>
                                <div className="p-4 bg-primary/5 rounded-lg">Хочется задержаться</div>
                            </div>

                            <p className="text-primary font-serif italic">
                                Этот уровень показывает, какие эмоции усиливает дом.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Slide Separator */}
                <div className="w-full py-12">
                    <div className="h-px bg-primary/30 relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-6">
                            <span className="text-primary/40 text-xs tracking-widest">СЛАЙД 5</span>
                        </div>
                    </div>
                </div>

                {/* Slide 5: Level 3 - Energy */}
                <section className="min-h-screen flex flex-col justify-center py-12">
                    <div className="text-center mb-6 md:mb-8">
                        <span className="text-primary/10 text-5xl md:text-7xl font-serif font-light block leading-none mb-3 md:mb-4">3</span>
                        <h2 className="text-2xl md:text-4xl font-serif font-light">Уровень 3 — Энергетический</h2>
                        <p className="text-primary text-[10px] md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] font-light">Глубинный уровень</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 items-center max-w-5xl mx-auto">
                        <div className="order-2 md:order-1">
                            <img src={vastuMapImage} alt="Карта Первоэлементов" className="rounded-xl shadow-2xl w-full max-w-[300px] md:max-w-md mx-auto opacity-90 hover:opacity-100 transition-opacity duration-700" />
                            <p className="text-center text-[10px] uppercase tracking-widest text-muted-foreground mt-4">Карта Первоэлементов</p>
                        </div>

                        <div className="space-y-6 order-1 md:order-2">
                            <div className="p-6 border border-primary/20 rounded-xl bg-primary/5">
                                <p className="text-lg font-serif text-primary italic mb-2">
                                    «Пространство живое. Оно реагирует. Это энергетический обмен.»
                                </p>
                            </div>

                            <div className="space-y-4 text-sm md:text-base text-foreground/70 font-light">
                                <p>Это то, что человек чувствует до мысли, до эмоции — прямым восприятием энергии.</p>

                                <div className="grid grid-cols-2 gap-3 text-xs md:text-sm">
                                    <p>• Тяжесть (Земля)</p>
                                    <p>• Пустота (Эфир)</p>
                                    <p>• Суета (Воздух)</p>
                                    <p>• Жар (Огонь)</p>
                                    <p>• Давление</p>
                                    <p>• Поток</p>
                                </div>

                                <div className="pt-4 border-t border-primary/10">
                                    <p className="text-primary">На этом уровне:</p>
                                    <ul className="list-disc pl-4 space-y-1 mt-2 text-xs md:text-sm">
                                        <li>работает карта Васту</li>
                                        <li>действуют планеты</li>
                                        <li>проявляются стороны света</li>
                                        <li>формируется поток праны</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Slide Separator */}
                <div className="w-full py-12">
                    <div className="h-px bg-primary/30 relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-6">
                            <span className="text-primary/40 text-xs tracking-widest">СЛАЙД 6</span>
                        </div>
                    </div>
                </div>

                {/* Slide 6: Why Important */}
                <section className="min-h-screen flex flex-col justify-center py-12">
                    <div className="text-center mb-8 md:mb-12">
                        <h2 className="text-2xl md:text-4xl font-serif font-light mb-4">Почему важно различать уровни?</h2>
                        <p className="text-foreground/60 font-light max-w-2xl mx-auto">
                            Потому что, если их путать — можно начать "лечить" не то, что болит.
                        </p>
                    </div>

                    <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6 md:gap-8">
                        <div className="space-y-4">
                            <div className="flex gap-4 p-4 border border-destructive/10 rounded-lg bg-destructive/5">
                                <X className="text-destructive shrink-0" size={20} />
                                <div className="text-sm font-light">
                                    <p>Можно перепутать своё настроение с энергетикой комнаты</p>
                                    <p className="text-xs text-muted-foreground mt-1">(эмоциональный ≠ энергетический)</p>
                                </div>
                            </div>
                            <div className="flex gap-4 p-4 border border-destructive/10 rounded-lg bg-destructive/5">
                                <X className="text-destructive shrink-0" size={20} />
                                <div className="text-sm font-light">
                                    <p>Можно думать, что “сектор плохой”, хотя просто бардак</p>
                                    <p className="text-xs text-muted-foreground mt-1">(физический ≠ энергетический)</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-4 p-4 border border-destructive/10 rounded-lg bg-destructive/5">
                                <X className="text-destructive shrink-0" size={20} />
                                <div className="text-sm font-light">
                                    <p>Можно пытаться менять мебель там, где нужно менять поток энергии</p>
                                    <p className="text-xs text-muted-foreground mt-1">(физический ≠ Васту)</p>
                                </div>
                            </div>
                            <div className="flex gap-4 p-4 border border-destructive/10 rounded-lg bg-destructive/5">
                                <X className="text-destructive shrink-0" size={20} />
                                <div className="text-sm font-light">
                                    <p>Можно думать, что “отношения плохие”, а на самом деле спальня стоит в разрушительной зоне</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Slide Separator */}
                <div className="w-full py-12">
                    <div className="h-px bg-primary/30 relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-6">
                            <span className="text-primary/40 text-xs tracking-widest">СЛАЙД 7</span>
                        </div>
                    </div>
                </div>

                {/* Slide 7: Formula */}
                <section className="min-h-screen flex flex-col justify-center py-12 text-center">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-2xl md:text-4xl font-serif font-light mb-12">Простая формула для понимания</h2>

                        <div className="grid md:grid-cols-3 gap-8">
                            <div className="p-8 border border-primary/20 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors">
                                <div className="text-primary text-xs uppercase tracking-[0.2em] mb-4">Физика</div>
                                <p className="font-serif text-xl md:text-2xl">“Что здесь стоит”</p>
                            </div>

                            <div className="p-8 border border-primary/20 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors">
                                <div className="text-primary text-xs uppercase tracking-[0.2em] mb-4">Эмоции</div>
                                <p className="font-serif text-xl md:text-2xl">“Как я здесь себя чувствую”</p>
                            </div>

                            <div className="p-8 border border-primary/20 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors">
                                <div className="text-primary text-xs uppercase tracking-[0.2em] mb-4">Энергия</div>
                                <p className="font-serif text-xl md:text-2xl">“Почему я себя так чувствую”</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Final spacing */}
                <div className="h-20"></div>
            </main>

            {/* Footer */}
            <footer className="border-t border-primary/10 py-12 text-center">
                <p className="text-sm text-foreground/40 font-light tracking-wide">© 2025 Anna Romeo Design</p>
            </footer>
        </div>
    );
};

export default Lesson2;
