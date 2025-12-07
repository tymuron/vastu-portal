import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Week, Day } from '../lib/types';
import { MOCK_COURSE } from '../lib/data';

export function useWeeks() {
    const [weeks, setWeeks] = useState<Week[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchWeeks() {
            try {
                // If no keys or placeholder, fallback to mock
                if (!import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL.includes('placeholder')) {
                    setWeeks(MOCK_COURSE.weeks);
                    setLoading(false);
                    return;
                }

                // Fetch Weeks
                const { data, error } = await supabase
                    .from('weeks')
                    .select(`
            *,
            days (*),
            materials (*)
          `)
                    .order('order_index', { ascending: true });

                if (error) throw error;

                // Fetch User Progress
                const { data: progressData } = await supabase
                    .from('user_progress')
                    .select('day_id');

                const completedDayIds = new Set(progressData?.map((p: any) => p.day_id));

                if (data) {
                    // Transform data
                    const transformedWeeks: Week[] = data.map((w) => ({
                        id: w.id,
                        title: w.title,
                        description: w.description,
                        isLocked: w.is_locked || (w.available_from ? new Date(w.available_from) > new Date() : false),
                        availableFrom: w.available_from,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        days: w.days.sort((a: any, b: any) => a.order_index - b.order_index).map((d: any) => ({
                            id: d.id,
                            title: d.title,
                            description: d.description,
                            videoUrl: d.video_url,
                            rutubeUrl: d.rutube_url,
                            date: d.date,
                            isCompleted: completedDayIds.has(d.id),
                            homeworkDescription: d.homework_description,
                            materials: []
                        })),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        weekMaterials: w.materials.filter((m: any) => m.week_id === w.id && !m.day_id).map((m: any) => ({
                            id: m.id,
                            title: m.title,
                            type: m.type,
                            url: m.url,
                            isHomework: m.is_homework
                        }))
                    }));
                    setWeeks(transformedWeeks);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to fetch weeks');
                setWeeks(MOCK_COURSE.weeks);
            } finally {
                setLoading(false);
            }
        }

        fetchWeeks();
    }, []);

    return { weeks, loading, error };
}

export function useDay(weekId: string | undefined, dayId: string | undefined) {
    const [day, setDay] = useState<Day | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchDay = async () => {
        if (!weekId || !dayId) return;

        if (!import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL.includes('placeholder')) {
            const w = MOCK_COURSE.weeks.find(w => w.id === weekId);
            const d = w?.days.find(d => d.id === dayId);
            setDay(d || null);
            setLoading(false);
            return;
        }

        try {
            const { data: dayData, error: dayError } = await supabase
                .from('days')
                .select('*')
                .eq('id', dayId)
                .single();

            if (dayError) throw dayError;

            const { data: matData, error: matError } = await supabase
                .from('materials')
                .select('*')
                .eq('day_id', dayId);

            if (matError) throw matError;

            // Check completion
            const { data: progressData } = await supabase
                .from('user_progress')
                .select('id')
                .eq('day_id', dayId)
                .single();

            const isCompleted = !!progressData;

            if (dayData) {
                setDay({
                    id: dayData.id,
                    title: dayData.title,
                    description: dayData.description,
                    videoUrl: dayData.video_url,
                    rutubeUrl: dayData.rutube_url,
                    date: dayData.date,
                    isCompleted,
                    homeworkDescription: dayData.homework_description,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    materials: (matData || []).map((m: any) => ({
                        id: m.id,
                        title: m.title,
                        type: m.type,
                        url: m.url
                    }))
                });
            }
        } catch (err) {
            console.error(err);
            const w = MOCK_COURSE.weeks.find(w => w.id === weekId);
            const d = w?.days.find(d => d.id === dayId);
            setDay(d || null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDay();
    }, [weekId, dayId]);

    const toggleComplete = async (completed: boolean) => {
        if (!dayId) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            if (completed) {
                await supabase.from('user_progress').upsert({ user_id: user.id, day_id: dayId });
            } else {
                await supabase.from('user_progress').delete().match({ user_id: user.id, day_id: dayId });
            }
            fetchDay(); // Refresh state
        } catch (error) {
            console.error('Error toggling complete:', error);
        }
    };

    return { day, loading, toggleComplete };
}
