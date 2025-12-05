import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function getVideoEmbedUrl(url: string): string {
    if (!url) return '';

    // Rutube
    // https://rutube.ru/video/c87.../
    if (url.includes('rutube.ru/video/')) {
        const id = url.split('rutube.ru/video/')[1]?.split('/')[0];
        if (id) return `https://rutube.ru/play/embed/${id}`;
    }

    // YouTube
    // Handle iframe code paste
    if (url.includes('<iframe')) {
        const srcMatch = url.match(/src="([^"]+)"/);
        return srcMatch ? srcMatch[1] : '';
    }

    // Handle standard watch URLs (youtube.com/watch?v=ID)
    if (url.includes('watch?v=')) {
        return url.replace('watch?v=', 'embed/');
    }

    // Handle short URLs (youtu.be/ID)
    if (url.includes('youtu.be/')) {
        const id = url.split('youtu.be/')[1]?.split('?')[0];
        return `https://www.youtube.com/embed/${id}`;
    }

    // Handle existing embed URLs
    if (url.includes('/embed/')) {
        return url;
    }

    return url;
}
