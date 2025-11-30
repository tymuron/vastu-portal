import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LiveStream, StreamComment } from '../../lib/types';
import { Download, MessageCircle, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function LiveStreams() {
    const { user } = useAuth();
    const [streams, setStreams] = useState<LiveStream[]>([]);
    const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null);
    const [comments, setComments] = useState<StreamComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);

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
                    profiles:user_id (full_name, avatar_url)
                `)
                .eq('stream_id', streamId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            // Map profile data to comment
            const formattedComments = data.map((c: any) => ({
                ...c,
                userName: c.profiles?.full_name || 'Unknown User',
                userAvatar: c.profiles?.avatar_url
            }));

            setComments(formattedComments);
        } catch (error) {
            console.error('Error fetching comments:', error);
        }
    }

    async function handlePostComment(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedStream || !user || !newComment.trim()) return;

        try {
            const { error } = await supabase
                .from('stream_comments')
                .insert({
                    stream_id: selectedStream.id,
                    user_id: user.id,
                    content: newComment
                });

            if (error) throw error;
            setNewComment('');
            fetchComments(selectedStream.id);
        } catch (error) {
            console.error('Error posting comment:', error);
        }
    }

    if (loading) return <div className="p-8 text-center">Loading streams...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Stream List */}
                <div className="lg:col-span-1 space-y-4">
                    <h2 className="text-2xl font-serif text-[#422326] mb-4">Записи Эфиров</h2>
                    <div className="space-y-2">
                        {streams.map((stream) => (
                            <button
                                key={stream.id}
                                onClick={() => setSelectedStream(stream)}
                                className={`w-full text-left p-4 rounded-xl transition-all ${selectedStream?.id === stream.id
                                    ? 'bg-[#422326] text-white shadow-lg'
                                    : 'bg-white hover:bg-[#F4F2ED] text-gray-800 border border-[#E5E7EB]'
                                    }`}
                            >
                                <div className="font-medium mb-1">{stream.title}</div>
                                <div className={`text-sm flex items-center ${selectedStream?.id === stream.id ? 'text-gray-300' : 'text-gray-500'
                                    }`}>
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {new Date(stream.date).toLocaleDateString()}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right: Player & Details */}
                <div className="lg:col-span-2">
                    {selectedStream ? (
                        <div className="space-y-6">
                            {/* Video Player */}
                            <div className="bg-black aspect-video rounded-xl overflow-hidden shadow-2xl relative group">
                                {selectedStream.videoUrl ? (
                                    <iframe
                                        src={selectedStream.videoUrl.replace('watch?v=', 'embed/')}
                                        className="w-full h-full"
                                        allowFullScreen
                                        title={selectedStream.title}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                                        No video URL provided
                                    </div>
                                )}
                            </div>

                            {/* Info & Actions */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-[#E5E7EB]">
                                <div className="flex justify-between items-start mb-4">
                                    <h1 className="text-2xl font-serif text-[#422326]">{selectedStream.title}</h1>
                                    {selectedStream.audioUrl && (
                                        <a
                                            href={selectedStream.audioUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center px-4 py-2 bg-[#F4F2ED] text-[#422326] rounded-lg hover:bg-[#E5E7EB] transition-colors font-medium text-sm"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Скачать аудио
                                        </a>
                                    )}
                                </div>
                                <p className="text-gray-600 mb-6">{selectedStream.description}</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-[#F9FAFB] p-4 rounded-lg">
                                        <h3 className="font-medium text-gray-900 mb-2">Темы разборов:</h3>
                                        <pre className="whitespace-pre-wrap font-sans text-sm text-gray-600">
                                            {selectedStream.topics || 'Нет тем'}
                                        </pre>
                                    </div>
                                    <div className="bg-[#FFFBEB] p-4 rounded-lg border border-[#FCD34D]">
                                        <h3 className="font-medium text-[#92400E] mb-2">Лучшие вопросы недели:</h3>
                                        <p className="text-sm text-[#92400E] italic">
                                            {selectedStream.bestQuestions || 'Нет вопросов'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Comments */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-[#E5E7EB]">
                                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                                    <MessageCircle className="w-5 h-5 mr-2" />
                                    Комментарии
                                </h3>

                                <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                                    {comments.length === 0 ? (
                                        <p className="text-gray-500 text-center py-4">Нет комментариев. Будьте первым!</p>
                                    ) : (
                                        comments.map((comment) => (
                                            <div key={comment.id} className="flex space-x-3">
                                                <div className="w-8 h-8 rounded-full bg-[#CABC90] flex items-center justify-center text-white font-bold text-xs">
                                                    {comment.userName?.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 bg-[#F9FAFB] p-3 rounded-lg">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-medium text-sm text-gray-900">{comment.userName}</span>
                                                        <span className="text-xs text-gray-500">
                                                            {new Date(comment.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-700">{comment.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <form onSubmit={handlePostComment} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Написать комментарий..."
                                        className="flex-1 rounded-lg border-gray-300 focus:border-[#422326] focus:ring-[#422326]"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newComment.trim()}
                                        className="px-4 py-2 bg-[#422326] text-white rounded-lg hover:bg-[#2b1618] disabled:opacity-50 transition-colors"
                                    >
                                        Отправить
                                    </button>
                                </form>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white p-12 rounded-xl shadow-sm border border-[#E5E7EB] text-center text-gray-500">
                            Выберите эфир из списка слева
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
