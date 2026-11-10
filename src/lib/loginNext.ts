// Where a student goes after signing in. A link into the course (the
// new-lesson email's «Открыть урок») sends a signed-out student to
// /login?next=…, and after the password they land on that lesson instead of
// the welcome page. Only the student area is accepted, so the parameter can't
// send anyone to another site.
//
// No imports: test/loginNext.test.mjs loads this file straight into Node.

export function safeNext(raw: string | null | undefined): string | null {
    if (typeof raw !== 'string' || raw.length > 512) return null;
    if (!/^\/student(?:[/?#]|$)/.test(raw)) return null;
    // No backslashes, spaces or `//`: browsers read those as another host.
    if (/[\\\s]|\/\//.test(raw)) return null;
    return raw;
}

// The login address for someone signed out at pathname+search. The course
// home needs no return trip: the welcome page leads there anyway.
export function loginPathFor(pathname: string, search: string): string {
    const here = `${pathname}${search || ''}`;
    if (pathname === '/student' || pathname === '/student/' || !safeNext(here)) return '/login';
    return `/login?next=${encodeURIComponent(here)}`;
}
