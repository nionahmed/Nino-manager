export type TaskCategory = 'work' | 'exercise' | 'personal' | 'entertainment' | 'study' | 'other';
export type RepeatType = 'none' | 'daily' | 'weekly' | 'custom';
export type TaskStatus = 'pending' | 'done' | 'missed' | 'not-required';
export type ActivityCategory = 'unproductive' | 'entertainment';

export interface Task {
  id: string;
  name: string;
  category: TaskCategory;
  startTime: string;       // HH:mm
  duration: number;        // minutes
  repeat: RepeatType;
  customDays?: number[];   // 0=Sun, 1=Mon, ..., 6=Sat
  color: string;
  notes?: string;
  createdAt: string;       // ISO string
  archived?: boolean;
}

export interface TaskInstance {
  id: string;
  taskId: string;
  date: string;            // YYYY-MM-DD
  status: TaskStatus;
  completedAt?: string;    // ISO string
}

export interface ActivityLog {
  id: string;
  name: string;
  category: ActivityCategory;
  duration: number;        // minutes
  timestamp: string;       // ISO string
  date: string;            // YYYY-MM-DD
}

export interface DailyNote {
  date: string;            // YYYY-MM-DD
  note: string;
}

export interface PomodoroSession {
  id: string;
  taskId?: string;
  startedAt: string;
  duration: number;        // minutes
  type: 'work' | 'break';
  completed: boolean;
}

export const CATEGORY_COLORS: Record<TaskCategory, string> = {
  work: '#6c5ce7',
  exercise: '#00b894',
  personal: '#fdcb6e',
  entertainment: '#e17055',
  study: '#00cec9',
  other: '#a29bfe',
};

export const CATEGORY_ICONS: Record<TaskCategory, string> = {
  work: 'work',
  exercise: 'fitness_center',
  personal: 'person',
  entertainment: 'sports_esports',
  study: 'menu_book',
  other: 'category',
};

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  work: 'Work',
  exercise: 'Exercise',
  personal: 'Personal',
  entertainment: 'Entertainment',
  study: 'Study',
  other: 'Other',
};

export const DEFAULT_TASK_COLORS = [
  '#6c5ce7', '#00b894', '#fdcb6e', '#e17055',
  '#00cec9', '#a29bfe', '#fd79a8', '#55a3e7',
  '#e056a0', '#74b9ff',
];
