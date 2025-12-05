export type UserRole = 'student' | 'teacher';

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    avatar?: string;
}

export type MaterialType = 'video' | 'pdf' | 'pptx' | 'doc' | 'link' | 'zip';

export interface Material {
    id: string;
    title: string;
    type: MaterialType;
    url: string;
    description?: string;
}

export interface Day {
    id: string;
    title: string;
    description?: string;
    materials: Material[];
    videoUrl?: string; // YouTube
    rutubeUrl?: string; // Rutube
    date?: string; // ISO Date
}

export interface Week {
    id: string;
    title: string;
    description?: string;
    days: Day[];
    weekMaterials: Material[]; // Materials specific to the week
    isLocked: boolean;
    availableFrom?: string; // ISO Date
}

export interface Course {
    id: string;
    title: string;
    weeks: Week[];
}

export interface LiveStream {
    id: string;
    title: string;
    date: string; // ISO Date
    video_url?: string; // YouTube
    rutube_url?: string; // Rutube
    audio_url?: string;
    description?: string;
    created_at?: string;
}

export interface StreamComment {
    id: string;
    stream_id: string;
    user_id: string;
    userName?: string; // Joined from profile
    userAvatar?: string; // Joined from profile
    content: string;
    created_at: string;
}

export type LibraryCategory = 'checklist' | 'guide' | 'template' | 'book';

export interface LibraryItem {
    id: string;
    title: string;
    category: LibraryCategory;
    file_url: string;
    description?: string;
    created_at: string;
    file_type?: string;
}
