import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, Share, MoreVertical, ArrowRight } from 'lucide-react';

// True when the page is running as an installed home-screen app
// (iOS Safari pins the CURRENT url and ignores manifest start_url, so an
// install done on this page would otherwise re-open these instructions
// forever — detect that and bounce straight into the platform).
function isInstalledApp(): boolean {
    try {
        return (
            (window.navigator as any).standalone === true ||
            window.matchMedia('(display-mode: standalone)').matches
        );
    } catch {
        return false;
    }
}

const Step = ({ n, title, text }: { n: number; title: string; text: string }) => (
    <div className="flex gap-4 bg-[#ECE7DC] rounded-xl p-5">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-vastu-dark text-vastu-gold flex items-center justify-center font-serif text-sm">
            {n}
        </div>
        <div>
            <div className="font-serif text-lg text-vastu-dark mb-1">{title}</div>
            <div className="text-vastu-text-light text-sm leading-relaxed">{text}</div>
        </div>
    </div>
);

export default function InstallApp() {
    const navigate = useNavigate();

    // If opened as the installed app (iOS pins this very page), never show
    // the instructions — go straight into the platform.
    useEffect(() => {
        if (isInstalledApp()) {
            navigate('/login', { replace: true });
        }
    }, [navigate]);

    // Don't flash the instructions while the installed-app redirect runs.
    if (isInstalledApp()) return null;

    return (
        <div className="min-h-screen bg-vastu-light">
            <div className="max-w-2xl mx-auto px-5 py-8">
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => navigate('/login')}
                        className="flex items-center gap-2 text-vastu-text-light hover:text-vastu-dark transition-colors"
                    >
                        <ArrowLeft size={18} />
                        <span>Назад</span>
                    </button>
                    <button
                        onClick={() => navigate('/login')}
                        className="flex items-center gap-2 bg-vastu-dark text-vastu-light text-sm px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                    >
                        <span>Войти на платформу</span>
                        <ArrowRight size={16} />
                    </button>
                </div>

                <div className="bg-vastu-dark rounded-2xl p-8 mb-10">
                    <div className="flex items-center gap-3 mb-3">
                        <Smartphone size={28} className="text-vastu-gold" />
                        <h1 className="font-serif text-3xl text-vastu-light">Установить приложение</h1>
                    </div>
                    <p className="text-vastu-light/80 leading-relaxed">
                        Добавьте платформу как приложение на главный экран телефона —
                        и заходите в один тап, без писем и ссылок.
                    </p>
                </div>

                <div className="mb-12">
                    <div className="flex items-center gap-2 mb-5">
                        <Share size={22} className="text-vastu-gold" />
                        <h2 className="font-serif text-2xl text-vastu-dark">iPhone (Safari)</h2>
                    </div>
                    <div className="space-y-3">
                        <Step n={1} title="Откройте эту страницу в Safari"
                            text="Убедитесь, что вы используете браузер Safari (не Chrome и не другой)." />
                        <Step n={2} title="Нажмите на значок «Поделиться»"
                            text="Квадрат со стрелкой вверх — внизу по центру экрана." />
                        <Step n={3} title="Выберите «На экран „Домой“»"
                            text="Прокрутите список вниз, пока не найдёте этот пункт." />
                        <Step n={4} title="Нажмите «Добавить»"
                            text="Приложение появится на главном экране! 🎉" />
                    </div>
                </div>

                <div>
                    <div className="flex items-center gap-2 mb-5">
                        <MoreVertical size={22} className="text-vastu-gold" />
                        <h2 className="font-serif text-2xl text-vastu-dark">Android (Chrome)</h2>
                    </div>
                    <div className="space-y-3">
                        <Step n={1} title="Откройте эту страницу в Chrome"
                            text="Используйте браузер Google Chrome." />
                        <Step n={2} title="Нажмите на три точки (⋮)"
                            text="Вверху справа в браузере." />
                        <Step n={3} title="Выберите «Добавить на главный экран»"
                            text="Может также называться «Установить приложение»." />
                        <Step n={4} title="Подтвердите «Добавить»"
                            text="Готово! Приложение теперь на главном экране. 🎉" />
                    </div>
                </div>

                <div className="mt-12 text-center">
                    <p className="text-vastu-text-light text-sm mb-5">
                        После установки просто открывайте иконку на экране телефона —
                        вход по вашей почте и паролю сохранится.
                    </p>
                    <button
                        onClick={() => navigate('/login')}
                        className="inline-flex items-center gap-2 bg-vastu-dark text-vastu-light px-7 py-3.5 rounded-lg hover:opacity-90 transition-opacity font-serif"
                    >
                        <span>Войти на платформу</span>
                        <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
