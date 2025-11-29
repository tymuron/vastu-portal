import { Course, User } from './types';

export const MOCK_USER_STUDENT: User = {
    id: 's1',
    name: 'Анна Студент',
    email: 'student@example.com',
    role: 'student',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150'
};

export const MOCK_USER_TEACHER: User = {
    id: 't1',
    name: 'Анна Ромео',
    email: 'teacher@example.com',
    role: 'teacher',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=150&h=150'
};

export const MOCK_COURSE: Course = {
    id: 'c1',
    title: 'Васту-Дизайн: Основы и Практика',
    weeks: [
        {
            id: 'w1',
            title: 'Неделя 1. Введение в Васту',
            description: 'Погружение в философию и базовые принципы организации пространства.',
            isLocked: false,
            weekMaterials: [
                { id: 'm1', title: 'Глоссарий терминов Васту', type: 'pdf', url: '#' },
                { id: 'm2', title: 'Список литературы', type: 'doc', url: '#' }
            ],
            days: [
                {
                    id: 'd1',
                    title: 'День 1. Что такое Васту?',
                    description: 'История возникновения и основные законы.',
                    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', // Placeholder
                    materials: [
                        { id: 'dm1', title: 'Презентация урока', type: 'pptx', url: '#' },
                        { id: 'dm2', title: 'Чек-лист анализа дома', type: 'pdf', url: '#' }
                    ]
                },
                {
                    id: 'd2',
                    title: 'День 2. Стороны света',
                    description: 'Как определить ориентацию квартиры.',
                    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                    materials: [
                        { id: 'dm3', title: 'Схема секторов', type: 'pdf', url: '#' }
                    ]
                }
            ]
        },
        {
            id: 'w2',
            title: 'Неделя 2. Зонирование',
            description: 'Распределение функциональных зон согласно энергиям.',
            isLocked: true,
            availableFrom: '2025-12-01',
            weekMaterials: [],
            days: [
                {
                    id: 'd3',
                    title: 'День 1. Входная группа',
                    description: 'Важность главного входа.',
                    materials: []
                }
            ]
        }
    ]
};
