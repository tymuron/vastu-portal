import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Search, Mail, User } from 'lucide-react';

interface StudentProfile {
    id: string;
    email: string;
    full_name: string | null;
    created_at: string;
}

export default function Students() {
    const [students, setStudents] = useState<StudentProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStudents() {
            try {
                // Fetch profiles where role is student
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('role', 'student')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setStudents(data || []);
            } catch (error) {
                console.error('Error fetching students:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchStudents();
    }, []);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-vastu-gold" size={40} /></div>;

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-serif text-vastu-dark mb-2">Студенты</h1>
                    <p className="text-gray-500">Управление списком студентов ({students.length})</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Поиск..."
                        className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-vastu-gold/50 w-64"
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left py-4 px-6 text-sm font-medium text-gray-500">Студент</th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-gray-500">Email</th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-gray-500">Дата регистрации</th>
                            <th className="text-right py-4 px-6 text-sm font-medium text-gray-500">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {students.length > 0 ? (
                            students.map((student) => (
                                <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-vastu-light flex items-center justify-center text-vastu-gold">
                                                <User size={20} />
                                            </div>
                                            <span className="font-medium text-vastu-dark">{student.full_name || 'Без имени'}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <Mail size={14} className="text-gray-400" />
                                            {student.email}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-gray-500 text-sm">
                                        {new Date(student.created_at).toLocaleDateString('ru-RU')}
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        <button className="text-sm text-vastu-gold hover:text-vastu-dark font-medium">
                                            Профиль
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="py-12 text-center text-gray-500">
                                    Студенты не найдены
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
