import type { ReactNode } from 'react';

// A link to a lesson file, opened in a new tab. `href` comes from
// useCourseFileLinks: undefined while the signed link is on its way (shown,
// not clickable yet), null when the file can't be opened.
export default function CourseFileLink({ href, className, children }: {
    href: string | null | undefined;
    className?: string;
    children: ReactNode;
}) {
    if (!href) {
        return (
            <span className={className} aria-disabled="true" title={href === null ? 'Файл недоступен' : 'Готовим ссылку…'}>
                {children}
            </span>
        );
    }
    return (
        <a href={href} target="_blank" rel="noreferrer" className={className}>
            {children}
        </a>
    );
}
