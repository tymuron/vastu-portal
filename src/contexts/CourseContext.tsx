import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Course } from '../lib/types';
import { MOCK_COURSE } from '../lib/data';
import { useAuth } from './AuthContext';

interface CourseContextType {
    courses: Course[];
    activeCourseId: string | null;
    setActiveCourseId: (id: string | null) => void;
    loading: boolean;
    error: string | null;
}

const STORAGE_KEY = 'vastu.activeCourseId';

const CourseContext = createContext<CourseContextType>({
    courses: [],
    activeCourseId: null,
    setActiveCourseId: () => { },
    loading: true,
    error: null,
});

export const useCourseContext = () => useContext(CourseContext);

interface RawCourseRow {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    is_active: boolean;
    order_index: number;
}

interface EntitlementRow {
    course_id: string;
    courses: RawCourseRow | RawCourseRow[] | null;
}

const mapCourse = (row: RawCourseRow): Course => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? undefined,
    isActive: row.is_active,
    orderIndex: row.order_index,
});

export function CourseProvider({ children }: { children: React.ReactNode }) {
    const { user, role, loading: authLoading } = useAuth();
    const [courses, setCourses] = useState<Course[]>([]);
    const [activeCourseId, setActiveCourseIdState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const setActiveCourseId = useCallback((id: string | null) => {
        setActiveCourseIdState(id);
        try {
            if (id) {
                localStorage.setItem(STORAGE_KEY, id);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch {
            // ignore storage errors
        }
    }, []);

    useEffect(() => {
        if (authLoading) return;

        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            try {
                // Mock fallback for dev mode
                const isPlaceholder = !import.meta.env.VITE_SUPABASE_URL ||
                    import.meta.env.VITE_SUPABASE_URL.includes('placeholder');

                if (isPlaceholder) {
                    const mockCourse: Course = {
                        id: MOCK_COURSE.id,
                        slug: MOCK_COURSE.slug,
                        title: MOCK_COURSE.title,
                        description: MOCK_COURSE.description,
                        isActive: MOCK_COURSE.isActive,
                        orderIndex: MOCK_COURSE.orderIndex,
                    };
                    if (!cancelled) {
                        setCourses([mockCourse]);
                        const stored = readStoredId();
                        const next = stored && stored === mockCourse.id ? stored : mockCourse.id;
                        setActiveCourseIdState(next);
                        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
                        setLoading(false);
                    }
                    return;
                }

                if (!user) {
                    if (!cancelled) {
                        setCourses([]);
                        setActiveCourseIdState(null);
                        setLoading(false);
                    }
                    return;
                }

                let list: Course[] = [];

                if (role === 'teacher') {
                    const { data, error: qErr } = await supabase
                        .from('courses')
                        .select('id, slug, title, description, is_active, order_index')
                        .eq('is_active', true)
                        .order('order_index', { ascending: true });

                    if (qErr) throw qErr;
                    list = (data ?? []).map(mapCourse);
                } else {
                    const { data, error: qErr } = await supabase
                        .from('user_entitlements')
                        .select('course_id, courses(id, slug, title, description, is_active, order_index)')
                        .eq('user_id', user.id);

                    if (qErr) throw qErr;

                    const rows = (data ?? []) as unknown as EntitlementRow[];
                    const mapped: Course[] = [];
                    for (const row of rows) {
                        const c = Array.isArray(row.courses) ? row.courses[0] : row.courses;
                        if (c && c.is_active) {
                            mapped.push(mapCourse(c));
                        }
                    }
                    mapped.sort((a, b) => a.orderIndex - b.orderIndex);
                    list = mapped;
                }

                if (cancelled) return;

                setCourses(list);

                const stored = readStoredId();
                const storedStillValid = stored && list.some((c) => c.id === stored);
                let next: string | null;
                if (storedStillValid) {
                    next = stored;
                } else if (list.length > 0) {
                    next = list[0].id;
                } else {
                    next = null;
                }
                setActiveCourseIdState(next);
                try {
                    if (next) localStorage.setItem(STORAGE_KEY, next);
                    else localStorage.removeItem(STORAGE_KEY);
                } catch {
                    // ignore
                }
            } catch (err) {
                console.error('Failed to load courses:', err);
                if (!cancelled) {
                    setError('Не удалось загрузить курсы.');
                    setCourses([]);
                    setActiveCourseIdState(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [user, role, authLoading]);

    return (
        <CourseContext.Provider
            value={{ courses, activeCourseId, setActiveCourseId, loading, error }}
        >
            {children}
        </CourseContext.Provider>
    );
}

function readStoredId(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}
