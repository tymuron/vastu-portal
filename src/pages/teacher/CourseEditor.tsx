import { useState } from 'react';
import { Plus, Edit2, Trash2, GripVertical, Video } from 'lucide-react';
import { MOCK_COURSE } from '../../lib/data';

export default function CourseEditor() {
    // In a real app, this would be state from a store
    const [weeks] = useState(MOCK_COURSE.weeks);

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-serif text-vastu-dark mb-2">Структура курса</h1>
                    <p className="text-gray-500">Управление неделями и уроками</p>
                </div>
                <button
                    onClick={() => alert('Функция добавления недель будет доступна в следующей версии')}
                    className="bg-vastu-dark text-vastu-gold px-4 py-2 rounded-lg font-medium hover:bg-vastu-dark/90 transition-colors flex items-center gap-2"
                >
                    <Plus size={18} />
                    Добавить неделю
                </button>
            </div>

            <div className="space-y-6">
                {weeks.map((week) => (
                    <div key={week.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Week Header */}
                        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button className="text-gray-400 hover:text-gray-600 cursor-move">
                                    <GripVertical size={20} />
                                </button>
                                <div>
                                    <h3 className="font-medium text-lg text-vastu-dark">{week.title}</h3>
                                    <p className="text-sm text-gray-500">{week.days.length} уроков • {week.isLocked ? 'Скрыта' : 'Опубликована'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => alert('Редактирование недели')}
                                    className="p-2 text-gray-500 hover:text-vastu-dark hover:bg-white rounded-lg transition-colors"
                                >
                                    <Edit2 size={18} />
                                </button>
                                <button
                                    onClick={() => alert('Удаление недели')}
                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Days List */}
                        <div className="p-4 space-y-2">
                            {week.days.map((day) => (
                                <div key={day.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-vastu-gold/30 bg-white group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-vastu-light flex items-center justify-center text-vastu-gold">
                                            <Video size={16} />
                                        </div>
                                        <span className="font-medium text-gray-700">{day.title}</span>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="text-xs text-vastu-gold hover:underline">Редактировать</button>
                                        <div className="w-px h-3 bg-gray-300" />
                                        <button className="text-xs text-red-400 hover:underline">Удалить</button>
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={() => alert('Добавление урока')}
                                className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-vastu-gold/50 hover:text-vastu-gold transition-all flex items-center justify-center gap-2 text-sm font-medium mt-2"
                            >
                                <Plus size={16} />
                                Добавить урок
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
