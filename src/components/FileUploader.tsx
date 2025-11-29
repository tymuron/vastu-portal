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
            let type = 'doc';
            if (['mp4', 'mov', 'avi'].includes(fileExt?.toLowerCase() || '')) type = 'video';
            else if (['pdf'].includes(fileExt?.toLowerCase() || '')) type = 'pdf';
            else if (['zip', 'rar'].includes(fileExt?.toLowerCase() || '')) type = 'zip';
            else if (['jpg', 'png', 'jpeg'].includes(fileExt?.toLowerCase() || '')) type = 'image';

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
                id="file-upload"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
            />
            <label
                htmlFor="file-upload"
                className="flex items-center gap-2 px-4 py-2 bg-vastu-light/10 hover:bg-vastu-light/20 border border-vastu-gold/30 rounded-lg cursor-pointer transition-colors text-sm text-vastu-dark"
            >
                {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                {uploading ? 'Загрузка...' : 'Загрузить файл'}
            </label>
        </div>
    );
}
