// Which course a student lands in. One course: that one. Several: the course
// they picked last — kept across reloads, because iOS restarts a home-screen
// app it pushed to the background and the student would otherwise be sent
// back to the picker every time they switch apps. The picker comes back when
// a course was added since the pick (so a newly bought course can't go
// unnoticed) and after signing out.
//
// No imports: test/activeCourse.test.mjs loads this file straight into Node.

export const COURSE_PICK_KEY = 'vastu.coursePick';

export interface CoursePick {
    userId: string;
    courseId: string;
    // Every course the student could open when they picked.
    courseIds: string[];
}

export function chooseActiveCourse(userId: string, courseIds: string[], pick: CoursePick | null): string | null {
    if (courseIds.length === 1) return courseIds[0];
    if (!pick || pick.userId !== userId) return null;
    if (!courseIds.includes(pick.courseId)) return null;
    if (courseIds.some((id) => !pick.courseIds.includes(id))) return null;
    return pick.courseId;
}

export function parseCoursePick(raw: string | null): CoursePick | null {
    if (!raw) return null;
    try {
        const p = JSON.parse(raw);
        if (typeof p?.userId !== 'string' || typeof p?.courseId !== 'string' || !Array.isArray(p?.courseIds)) return null;
        return { userId: p.userId, courseId: p.courseId, courseIds: p.courseIds.filter((id: unknown) => typeof id === 'string') };
    } catch {
        return null;
    }
}
