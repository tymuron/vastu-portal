import { FileText, Loader2 } from 'lucide-react';
import { SaveState } from '../lib/download';

// What an iPhone or iPad shows while a file goes to the share sheet
// (hooks/useFileSave.tsx). Every step has something to tap or to read, so
// the student is never left with nothing happening.
export default function FileSaveSheet({ state, title, onClose }: { state: Exclude<SaveState, { step: 'done' }>; title: string; onClose: () => void }) {
    const primary = 'w-full py-3 rounded-xl bg-[#422326] text-[#F4F2ED] font-medium';
    return (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Сохранение файла">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-[#F4F2ED] text-[#422326] flex items-center justify-center mx-auto mb-4">
                    {state.step === 'preparing' ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileText className="w-6 h-6" />}
                </div>
                <p className="font-serif text-lg text-[#422326] mb-2 break-words">{title}</p>
                {state.step === 'preparing' && <p className="text-sm text-gray-500">Готовлю файл…</p>}
                {state.step === 'sharing' && (
                    <p className="text-sm text-gray-600">В открывшемся меню выберите «Сохранить в Файлы».</p>
                )}
                {state.step === 'ready' && (
                    <>
                        <p className="text-sm text-gray-600 mb-4">Файл готов. Нажмите кнопку, затем в меню выберите «Сохранить в Файлы».</p>
                        <button onClick={state.share} className={primary}>Сохранить файл</button>
                    </>
                )}
                {state.step === 'failed' && (
                    <>
                        <p className="text-sm text-gray-600 mb-4">Не получилось подготовить файл. Откройте его — сохранить можно оттуда.</p>
                        <button onClick={() => { state.open(); onClose(); }} className={primary}>Открыть файл</button>
                    </>
                )}
                <button onClick={onClose} className="mt-3 text-sm text-gray-500">
                    {state.step === 'failed' ? 'Закрыть' : 'Отмена'}
                </button>
            </div>
        </div>
    );
}
