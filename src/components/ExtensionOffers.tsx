import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ExtensionOffer {
    offer_id: string;
    months: number | null;
    label: string;
    price_rub: number | null;
}

interface ExtensionItem {
    course_slug: string;
    course_title: string;
    expires_at: string;
    expired: boolean;
    offers: ExtensionOffer[];
}

const RU_MONTHS_GENITIVE = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatDateRuLong(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getUTCDate()} ${RU_MONTHS_GENITIVE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatPriceRub(priceRub: number): string {
    return String(Math.round(priceRub)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
}

export default function ExtensionOffers({ className = '' }: { className?: string }) {
    const { session, user } = useAuth();
    const accessToken = session?.access_token ?? null;
    const userEmail = user?.email ?? '';
    const [items, setItems] = useState<ExtensionItem[]>([]);

    useEffect(() => {
        if (!accessToken) {
            setItems([]);
            return;
        }
        let cancelled = false;
        fetch('/api/student/extensions', {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
            .then((resp) => (resp.ok ? resp.json() : null))
            .then((data) => {
                if (cancelled) return;
                if (Array.isArray(data?.items)) {
                    setItems(data.items);
                } else {
                    setItems([]);
                }
            })
            .catch(() => {
                if (!cancelled) setItems([]);
            });

        return () => {
            cancelled = true;
        };
    }, [accessToken]);

    if (items.length === 0) return null;

    return (
        <div className={`space-y-4 ${className}`.trim()}>
            {items.map((item) => {
                const dateStr = formatDateRuLong(item.expires_at);
                const heading = item.expired
                    ? `Доступ к курсу «${item.course_title}» закончился ${dateStr}`
                    : `Доступ к курсу «${item.course_title}» заканчивается ${dateStr}`;
                const subtitle = item.expired
                    ? 'Продлите доступ, чтобы снова смотреть уроки и материалы курса.'
                    : 'Продлите заранее — дни не сгорят, срок прибавится к текущему.';

                return (
                    <div
                        key={item.course_slug}
                        className="bg-white rounded-2xl border border-vastu-gold/50 p-6 shadow-sm text-left"
                    >
                        <div className="flex items-start gap-3 mb-2">
                            <div className="w-9 h-9 rounded-xl bg-vastu-light flex items-center justify-center text-vastu-gold shrink-0 mt-0.5">
                                <Clock size={18} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="font-serif text-xl md:text-2xl text-vastu-dark leading-snug break-words">
                                    {heading}
                                </h2>
                                <p className="text-vastu-text-light text-sm leading-relaxed mt-1">
                                    {subtitle}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                            {item.offers.map((offer) => {
                                const params = new URLSearchParams();
                                if (userEmail) params.set('email', userEmail);
                                params.set('extend', '1');
                                const href = `/buy/${encodeURIComponent(offer.offer_id)}?${params.toString()}`;
                                const label =
                                    offer.price_rub != null
                                        ? `${offer.label} — ${formatPriceRub(offer.price_rub)} ₽`
                                        : offer.label;
                                return (
                                    <a
                                        key={offer.offer_id}
                                        href={href}
                                        className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-vastu-dark text-vastu-light font-serif text-base hover:opacity-90 transition-opacity"
                                    >
                                        {label}
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
