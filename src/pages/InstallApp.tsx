import { Smartphone, Share, MoreVertical } from 'lucide-react';

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
    return (
        <div className="max-w-2xl">
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
                    <Step n={1} title="Откройте платформу в Safari"
                        text="Убедитесь, что вы используете браузер Safari (не Chrome и не другой)." />
                    <Step n={2} title="Нажмите на значок «Поделиться»"
                        text="Квадрат со стрелкой вверх — внизу по центру экрана." />
                    <Step n={3} title="Выберите «На экран „Домой“»"
                        text="Прокрутите список вниз, пока не найдёте этот пункт." />
                    <Step n={4} title="Нажмите «Добавить»"
                        text="Иконка появится на главном экране — открывайте её как обычное приложение. 🎉" />
                </div>
            </div>

            <div>
                <div className="flex items-center gap-2 mb-5">
                    <MoreVertical size={22} className="text-vastu-gold" />
                    <h2 className="font-serif text-2xl text-vastu-dark">Android (Chrome)</h2>
                </div>
                <div className="space-y-3">
                    <Step n={1} title="Откройте платформу в Chrome"
                        text="Используйте браузер Google Chrome." />
                    <Step n={2} title="Нажмите на три точки (⋮)"
                        text="Вверху справа в браузере." />
                    <Step n={3} title="Выберите «Добавить на главный экран»"
                        text="Может также называться «Установить приложение»." />
                    <Step n={4} title="Подтвердите «Добавить»"
                        text="Готово! Иконка приложения теперь на главном экране. 🎉" />
                </div>
            </div>

            <div className="mt-12 text-vastu-text-light text-sm">
                После установки открывайте иконку на экране телефона —
                вход по вашей почте и паролю сохранится.
            </div>
        </div>
    );
}
