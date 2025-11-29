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
                // If no keys, fallback to mock
                if (!import.meta.env.VITE_SUPABASE_URL) {
                    console.log('Using Mock Data (No Supabase Keys)');
                    setWeeks(MOCK_COURSE.weeks);
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabase
                    .from('weeks')
                    .select(`
            *,
            days (*),
            materials (*)
          `)
                    .order('order_index', { ascending: true });

                if (error) throw error;

                if (data) {
                    // Transform data
                    const transformedWeeks: Week[] = data.map((w) => ({
                        id: w.id,
                        title: w.title,
                        description: w.description,
                        isLocked: w.is_locked,
                        availableFrom: w.available_from,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        days: w.days.sort((a: any, b: any) => a.order_index - b.order_index).map((d: any) => ({
                            id: d.id,
                            title: d.title,
                            description: d.description,
                            videoUrl: d.video_url,
                            materials: [] // Fetched separately if needed, or we can fetch all materials and filter
                        })),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        weekMaterials: w.materials.filter((m: any) => m.week_id === w.id && !m.day_id).map((m: any) => ({
                            id: m.id,
                            title: m.title,
                            type: m.type,
                            url: m.url
                        }))
                    }));
                    setWeeks(transformedWeeks);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to fetch weeks');
                // Fallback to mock for demo purposes if DB fails (e.g. empty DB)
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

    useEffect(() => {
        async function fetchDay() {
            if (!weekId || !dayId) return;

            if (!import.meta.env.VITE_SUPABASE_URL) {
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

                if (dayData) {
                    setDay({
                        id: dayData.id,
                        title: dayData.title,
                        description: dayData.description,
                        videoUrl: dayData.video_url,
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
                // Fallback
                const w = MOCK_COURSE.weeks.find(w => w.id === weekId);
                const d = w?.days.find(d => d.id === dayId);
                setDay(d || null);
            } finally {
                setLoading(false);
            }
        }

        fetchDay();
    }, [weekId, dayId]);

    return { day, loading };
}
