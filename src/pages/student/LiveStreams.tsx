import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LiveStream, StreamComment } from '../../lib/types';
import { Download, MessageCircle, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function LiveStreams() {
    const [streams, setStreams] = useState<LiveStream[]>([]);
    const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null);
    const [comments, setComments] = useState<StreamComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        fetchStreams();
    }, []);

    useEffect(() => {
        if (selectedStream) {
            fetchComments(selectedStream.id);
        }
    }, [selectedStream]);

    async function fetchStreams() {
        try {
            const { data, error } = await supabase
                .from('live_streams')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            setStreams(data || []);
            if (data && data.length > 0) {
                setSelectedStream(data[0]);
            }
        } catch (error) {
            console.error('Error fetching streams:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchComments(streamId: string) {
        try {
            const { data, error } = await supabase
                .from('stream_comments')
                .select(`
                    *,
                    user:user_id (
                        email,
                        raw_user_meta_data
                    )
                `)
                .eq('stream_id', streamId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            // Map user data to comment
            const mappedComments = data.map((c: any) => ({
                ...c,
                userName: c.user?.raw_user_meta_data?.full_name || c.user?.email || 'Студент',
                userAvatar: c.user?.raw_user_meta_data?.avatar_url
            }));

            setComments(mappedComments);
        } catch (error) {
            console.error('Error fetching comments:', error);
        }
    }

    async function handleCommentSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedStream || !user || !newComment.trim()) return;

        try {
            const { error } = await supabase
                .from('stream_comments')
                .insert([{
                    stream_id: selectedStream.id,
                    user_id: user.id,
                    content: newComment.trim()
                }]);

            if (error) throw error;

            setNewComment('');
            fetchComments(selectedStream.id);
        } catch (error) {
            console.error('Error posting comment:', error);
            alert('Не удалось отправить комментарий');
        }
    }

    function getEmbedUrl(url: string) {
        if (!url) return '';

        // Handle iframe code paste
        if (url.includes('<iframe')) {
            const srcMatch = url.match(/src="([^"]+)"/);
            return srcMatch ? srcMatch[1] : '';
        }

        // Handle standard watch URLs (youtube.com/watch?v=ID)
        if (url.includes('watch?v=')) {
            return url.replace('watch?v=', 'embed/');
        }

        // Handle short URLs (youtu.be/ID)
        if (url.includes('youtu.be/')) {
            const id = url.split('youtu.be/')[1]?.split('?')[0];
            return `https://www.youtube.com/embed/${id}`;
        }

        // Handle existing embed URLs
        if (url.includes('/embed/')) {
            return url;
        }

        return url;
    }

    if (loading) return <div className="p-8 text-center">Загрузка эфиров...</div>;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-serif text-[#422326] mb-2">Живые Эфиры</h1>
                <p className="text-gray-600">Записи всех прошедших разборов и встреч.</p>
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8">
                {/* Player & Details (Order 1 on Mobile, Order 2 on Desktop) */}
                <div className="lg:col-span-2 lg:order-2 space-y-6">
                    {selectedStream ? (
                        <>
                            {/* Video Player */}
                            <div className="bg-black rounded-xl overflow-hidden aspect-video shadow-2xl">
                                {selectedStream.video_url ? (
                                    <iframe
                                        src={getEmbedUrl(selectedStream.video_url)}
                                        title={selectedStream.title}
                                        className="w-full h-full"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/50">
                                        Видео недоступно
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap gap-4">
                                {selectedStream.audio_url && (
                                    <a
                                        href={selectedStream.audio_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center px-4 py-2 bg-[#F4F2ED] text-[#422326] rounded-lg hover:bg-[#EAE6DE] transition-colors font-medium"
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Скачать Аудио
                                    </a>
                                )}
                                <button className="flex items-center px-4 py-2 bg-[#F4F2ED] text-[#422326] rounded-lg hover:bg-[#EAE6DE] transition-colors font-medium">
                                    <Calendar className="w-4 h-4 mr-2" />
                                    Добавить в календарь
                                </button>
                            </div>

                            {/* Info Tabs */}
                            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="font-serif text-xl text-[#422326] mb-3">Темы Эфира</h3>
                                        <div className="prose prose-sm text-gray-600 whitespace-pre-line">
                                            {selectedStream.topics || 'Темы не указаны'}
                                        </div>
                                    </div>

                                    {selectedStream.best_questions && (
                                        <div className="bg-[#F9FAFB] p-4 rounded-lg border border-[#E5E7EB]">
                                            <h3 className="font-serif text-lg text-[#422326] mb-2 flex items-center">
                                                <MessageCircle className="w-4 h-4 mr-2" />
                                                Лучшие вопросы
                                            </h3>
                                            <div className="text-sm text-gray-600 whitespace-pre-line italic">
                                                {selectedStream.best_questions}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Comments Section */}
                            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
                                <h3 className="font-serif text-xl text-[#422326] mb-6">Обсуждение</h3>

                                {/* Comment Form */}
                                <form onSubmit={handleCommentSubmit} className="mb-8">
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Задайте вопрос или поделитесь мнением..."
                                        className="w-full p-4 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#422326]/20 focus:border-[#422326] transition-all resize-none min-h-[100px]"
                                    />
                                    <div className="mt-2 flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={!newComment.trim()}
                                            className="px-6 py-2 bg-[#422326] text-white rounded-lg hover:bg-[#2b1618] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Отправить
                                        </button>
                                    </div>
                                </form>

                                {/* Comments List */}
                                <div className="space-y-6">
                                    {comments.map((comment) => (
                                        <div key={comment.id} className="flex gap-4">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-[#422326] font-bold">
                                                {comment.userName?.[0] || 'U'}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-gray-900">{comment.userName || 'Пользователь'}</span>
                                                    <span className="text-xs text-gray-500">
                                                        {new Date(comment.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <p className="text-gray-600 text-sm leading-relaxed">
                                                    {comment.content}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    {comments.length === 0 && (
                                        <div className="text-center text-gray-500 py-8">
                                            Пока нет комментариев. Будьте первым!
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200 min-h-[400px]">
                            Выберите эфир из списка
                        </div>
                    )}
                </div>

                {/* List (Order 2 on Mobile, Order 1 on Desktop) */}
                <div className="lg:col-span-1 lg:order-1 space-y-4 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {streams.map((stream) => (
                        <button
                            key={stream.id}
                            onClick={() => {
                                setSelectedStream(stream);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={`w-full text-left p-4 rounded-xl border transition-all ${selectedStream?.id === stream.id
                                    ? 'bg-[#422326] text-white border-[#422326] shadow-lg'
                                    : 'bg-white border-[#E5E7EB] hover:border-[#422326]/30 hover:shadow-md'
                                }`}
                        >
                            <div className={`text-xs font-medium mb-1 ${selectedStream?.id === stream.id ? 'text-white/70' : 'text-gray-500'
                                }`}>
                                {new Date(stream.date).toLocaleDateString()}
                            </div>
                            <h3 className="font-serif text-lg leading-tight mb-2">{stream.title}</h3>
                            <div className={`text-sm line-clamp-2 ${selectedStream?.id === stream.id ? 'text-white/80' : 'text-gray-600'
                                }`}>
                                {stream.description}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
