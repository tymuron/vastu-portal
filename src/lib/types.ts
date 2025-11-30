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
    videoUrl?: string; // Main lesson video
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
    videoUrl?: string;
    audioUrl?: string;
    description?: string;
    topics?: string;
    bestQuestions?: string;
}

export interface StreamComment {
    id: string;
    streamId: string;
    userId: string;
    userName?: string; // Joined from profile
    userAvatar?: string; // Joined from profile
    content: string;
    createdAt: string;
}

export type LibraryCategory = 'checklist' | 'table' | 'guide' | 'pdf';

export interface LibraryItem {
    id: string;
    title: string;
    category: LibraryCategory;
    fileUrl: string;
    description?: string;
}
