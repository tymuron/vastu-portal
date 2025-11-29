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
