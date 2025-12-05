import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { User, Camera, Save, Lock, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../../lib/utils';

export default function Profile() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Form State
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Cropper State
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [isCropping, setIsCropping] = useState(false);

    useEffect(() => {
        if (user) {
            setFullName(user.user_metadata?.full_name || '');
            // Add cache busting to ensure image updates immediately
            const url = user.user_metadata?.avatar_url;
            setAvatarUrl(url ? `${url}?t=${new Date().getTime()}` : null);
        }
    }, [user]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const updates: any = {
                data: { full_name: fullName }
            };

            const { error } = await supabase.auth.updateUser(updates);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Профиль успешно обновлен!' });
        } catch (error: any) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: error.message || 'Ошибка при обновлении профиля' });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: 'Пароли не совпадают' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const { error } = await supabase.auth.updateUser({ password: password });

            if (error) throw error;

            setMessage({ type: 'success', text: 'Пароль успешно изменен!' });
            setPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error('Error updating password:', error);
            setMessage({ type: 'error', text: error.message || 'Ошибка при смене пароля' });
        } finally {
            setLoading(false);
        }
    };

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setImageSrc(reader.result as string);
                setIsCropping(true);
            });
            reader.readAsDataURL(file);
        }
    };

    const onCropComplete = useCallback((_: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const showCroppedImage = async () => {
        if (!imageSrc || !croppedAreaPixels) return;

        try {
            setLoading(true);
            const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);

            if (!croppedImageBlob) throw new Error('Could not crop image');

            // Upload to Supabase
            const fileName = `${user?.id}-${Math.random()}.jpg`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, croppedImageBlob);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // Update local state immediately with cache busting
            setAvatarUrl(`${publicUrl}?t=${new Date().getTime()}`);

            // Save to profile
            await supabase.auth.updateUser({
                data: { avatar_url: publicUrl }
            });

            setMessage({ type: 'success', text: 'Аватар обновлен!' });
            setIsCropping(false);
            setImageSrc(null);
        } catch (e) {
            console.error(e);
            setMessage({ type: 'error', text: 'Ошибка при сохранении аватара' });
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-[#422326]" /></div>;

    return (
        <div className="max-w-2xl mx-auto space-y-8 animate-fade-in relative">
            <div>
                <h1 className="text-3xl font-serif text-[#422326] mb-2">Личный Кабинет</h1>
                <p className="text-gray-600">Управление личными данными и настройками аккаунта.</p>
            </div>

            {message && (
                <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message.text}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                <div className="p-6 md:p-8 space-y-8">

                    {/* Avatar Section */}
                    <div className="flex flex-col items-center justify-center">
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-100 border-4 border-white shadow-lg">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                        <User className="w-16 h-16" />
                                    </div>
                                )}
                            </div>
                            <label className="absolute bottom-0 right-0 p-2 bg-[#422326] text-white rounded-full cursor-pointer hover:bg-[#2b1618] transition-colors shadow-md">
                                <Camera className="w-5 h-5" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={onFileChange}
                                    disabled={loading}
                                />
                            </label>
                        </div>
                        <p className="mt-4 text-sm text-gray-500">Нажмите на иконку камеры, чтобы изменить фото</p>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Personal Info Form */}
                    <form onSubmit={handleUpdateProfile} className="space-y-6">
                        <h2 className="text-xl font-serif text-[#422326]">Личные Данные</h2>

                        <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email (Логин)</label>
                                <input
                                    type="email"
                                    disabled
                                    value={user?.email || ''}
                                    className="w-full rounded-lg border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ФИО</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                    placeholder="Иванова Анна Ивановна"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-6 py-2 bg-[#422326] text-white rounded-lg hover:bg-[#2b1618] transition-colors flex items-center disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Сохранить Данные
                            </button>
                        </div>
                    </form>

                    <hr className="border-gray-100" />

                    {/* Password Change Form */}
                    <form onSubmit={handlePasswordChange} className="space-y-6">
                        <h2 className="text-xl font-serif text-[#422326] flex items-center gap-2">
                            <Lock className="w-5 h-5" />
                            Смена Пароля
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Новый Пароль</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                    placeholder="••••••••"
                                    minLength={6}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Подтвердите Пароль</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full rounded-lg border-gray-300 focus:ring-[#422326] focus:border-[#422326]"
                                    placeholder="••••••••"
                                    minLength={6}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={loading || !password}
                                className="px-6 py-2 border border-[#422326] text-[#422326] rounded-lg hover:bg-gray-50 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Обновить Пароль
                            </button>
                        </div>
                    </form>

                </div>
            </div>

            {/* Cropper Modal */}
            {isCropping && imageSrc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-serif text-lg text-[#422326]">Редактирование фото</h3>
                            <button onClick={() => setIsCropping(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="relative h-80 bg-gray-900">
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                                cropShape="round"
                                showGrid={false}
                            />
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="flex items-center gap-4">
                                <ZoomOut size={20} className="text-gray-400" />
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    aria-labelledby="Zoom"
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#422326]"
                                />
                                <ZoomIn size={20} className="text-gray-400" />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsCropping(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Отмена
                                </button>
                                <button
                                    onClick={showCroppedImage}
                                    disabled={loading}
                                    className="flex-1 px-4 py-2 bg-[#422326] text-white rounded-lg hover:bg-[#2b1618] transition-colors flex items-center justify-center"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Сохранить'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
