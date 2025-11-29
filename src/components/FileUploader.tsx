import React, { useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface FileUploaderProps {
    onUploadComplete: (url: string, type: string, name: string) => void;
    folder?: string;
}

export default function FileUploader({ onUploadComplete, folder = 'general' }: FileUploaderProps) {
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `${folder}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('course-content')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('course-content')
                .getPublicUrl(filePath);

            // Determine type
            // Determine type based on DB constraints: 'video', 'pdf', 'pptx', 'doc', 'link', 'zip'
            let type = 'doc';
            const ext = fileExt?.toLowerCase() || '';

            if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) type = 'video';
            else if (['pdf'].includes(ext)) type = 'pdf';
            else if (['zip', 'rar', '7z'].includes(ext)) type = 'zip';
            else if (['pptx', 'ppt'].includes(ext)) type = 'pptx';
            else if (['doc', 'docx'].includes(ext)) type = 'doc';
            // Map images and others to 'doc' to satisfy DB constraint for now
            else if (['jpg', 'png', 'jpeg', 'webp'].includes(ext)) type = 'doc';

            onUploadComplete(publicUrl, type, file.name);

        } catch (error: any) {
            alert('Error uploading file: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="relative">
            <input
                type="file"
                id={`file-upload-${folder}`}
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
            />
            <label
                htmlFor={`file-upload-${folder}`} // Unique ID
                className="flex flex-col items-center justify-center gap-3 px-6 py-8 bg-gray-50 hover:bg-vastu-gold/5 border-2 border-dashed border-gray-300 hover:border-vastu-gold/50 rounded-xl cursor-pointer transition-all group w-full"
            >
                <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                    {uploading ? <Loader2 className="animate-spin text-vastu-gold" size={24} /> : <Upload className="text-vastu-gold" size={24} />}
                </div>
                <div className="text-center">
                    <span className="font-medium text-vastu-dark block mb-1">
                        {uploading ? 'Загрузка...' : 'Нажмите для загрузки файла'}
                    </span>
                    <span className="text-xs text-gray-400">
                        PDF, Video, Images, Zip (Max 50MB)
                    </span>
                </div>
            </label>
        </div>
    );
}
