import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Task,
  TaskInstance,
  ActivityLog,
  DailyNote,
  TaskStatus,
  PomodoroSession,
} from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly KEYS = {
    tasks: 'nino_tasks',
    instances: 'nino_instances',
    activities: 'nino_activities',
    notes: 'nino_notes',
    pomodoros: 'nino_pomodoros',
    settings: 'nino_settings',
  };

  readonly tasks = signal<Task[]>([]);
  readonly instances = signal<TaskInstance[]>([]);
  readonly activities = signal<ActivityLog[]>([]);
  readonly notes = signal<DailyNote[]>([]);

  constructor() {
    if (this.isBrowser) {
      this.loadAll();
      window.addEventListener('storage', (e) => this.onStorageChange(e));
    }
  }

  // ============================
  // HELPERS
  // ============================
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  private get<T>(key: string): T[] {
    if (!this.isBrowser) return [];
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private set(key: string, data: unknown): void {
    if (!this.isBrowser) return;
    localStorage.setItem(key, JSON.stringify(data));
  }

  private loadAll(): void {
    this.tasks.set(this.get<Task>(this.KEYS.tasks));
    this.instances.set(this.get<TaskInstance>(this.KEYS.instances));
    this.activities.set(this.get<ActivityLog>(this.KEYS.activities));
    this.notes.set(this.get<DailyNote>(this.KEYS.notes));
    this.generateInstancesForToday();
  }

  private onStorageChange(e: StorageEvent): void {
    if (e.key && Object.values(this.KEYS).includes(e.key)) {
      this.loadAll();
    }
  }

  // ============================
  // DATE UTILS
  // ============================
  today(): string {
    return this.formatDate(new Date());
  }

  formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  getDayOfWeek(dateStr: string): number {
    return new Date(dateStr + 'T00:00:00').getDay();
  }

  // ============================
  // TASKS CRUD
  // ============================
  addTask(task: Omit<Task, 'id' | 'createdAt'>): Task {
    const newTask: Task = {
      ...task,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
    };
    const all = [...this.tasks(), newTask];
    this.tasks.set(all);
    this.set(this.KEYS.tasks, all);
    this.generateInstancesForDateRange(this.today(), this.today());
    return newTask;
  }

  updateTask(id: string, updates: Partial<Task>): void {
    const all = this.tasks().map((t) => (t.id === id ? { ...t, ...updates } : t));
    this.tasks.set(all);
    this.set(this.KEYS.tasks, all);
  }

  deleteTask(id: string): void {
    const all = this.tasks().filter((t) => t.id !== id);
    this.tasks.set(all);
    this.set(this.KEYS.tasks, all);
    // Also delete related instances
    const instances = this.instances().filter((i) => i.taskId !== id);
    this.instances.set(instances);
    this.set(this.KEYS.instances, instances);
  }

  getTask(id: string): Task | undefined {
    return this.tasks().find((t) => t.id === id);
  }

  // ============================
  // TASK INSTANCES
  // ============================
  taskShouldOccurOnDate(task: Task, dateStr: string): boolean {
    if (task.archived) return false;
    const dayOfWeek = this.getDayOfWeek(dateStr);
    switch (task.repeat) {
      case 'daily':
        return true;
      case 'weekly':
        // Created day of week
        const createdDay = new Date(task.createdAt).getDay();
        return dayOfWeek === createdDay;
      case 'custom':
        return task.customDays?.includes(dayOfWeek) ?? false;
      case 'none':
        // One-time task: occurs on the date it was created
        return this.formatDate(new Date(task.createdAt)) === dateStr;
      default:
        return false;
    }
  }

  generateInstancesForToday(): void {
    this.generateInstancesForDateRange(this.today(), this.today());
  }

  generateInstancesForDateRange(startDate: string, endDate: string): void {
    const existingInstances = [...this.instances()];
    const tasks = this.tasks();
    let changed = false;

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = this.formatDate(d);
      for (const task of tasks) {
        if (!this.taskShouldOccurOnDate(task, dateStr)) continue;
        const exists = existingInstances.some(
          (i) => i.taskId === task.id && i.date === dateStr
        );
        if (!exists) {
          existingInstances.push({
            id: this.generateId(),
            taskId: task.id,
            date: dateStr,
            status: 'pending',
          });
          changed = true;
        }
      }
    }

    if (changed) {
      this.instances.set(existingInstances);
      this.set(this.KEYS.instances, existingInstances);
    }
  }

  getInstancesForDate(date: string): TaskInstance[] {
    return this.instances().filter((i) => i.date === date);
  }

  getInstancesForDateRange(start: string, end: string): TaskInstance[] {
    return this.instances().filter((i) => i.date >= start && i.date <= end);
  }

  updateInstanceStatus(instanceId: string, status: TaskStatus): void {
    const all = this.instances().map((i) =>
      i.id === instanceId
        ? {
            ...i,
            status,
            completedAt: status === 'done' ? new Date().toISOString() : undefined,
          }
        : i
    );
    this.instances.set(all);
    this.set(this.KEYS.instances, all);
  }

  // ============================
  // ACTIVITY LOG
  // ============================
  addActivity(activity: Omit<ActivityLog, 'id'>): ActivityLog {
    const newActivity: ActivityLog = {
      ...activity,
      id: this.generateId(),
    };
    const all = [...this.activities(), newActivity];
    this.activities.set(all);
    this.set(this.KEYS.activities, all);
    return newActivity;
  }

  deleteActivity(id: string): void {
    const all = this.activities().filter((a) => a.id !== id);
    this.activities.set(all);
    this.set(this.KEYS.activities, all);
  }

  getActivitiesForDate(date: string): ActivityLog[] {
    return this.activities().filter((a) => a.date === date);
  }

  getActivitiesForDateRange(start: string, end: string): ActivityLog[] {
    return this.activities().filter((a) => a.date >= start && a.date <= end);
  }

  // ============================
  // DAILY NOTES
  // ============================
  setNote(date: string, note: string): void {
    let all = this.notes().filter((n) => n.date !== date);
    if (note.trim()) {
      all = [...all, { date, note: note.trim() }];
    }
    this.notes.set(all);
    this.set(this.KEYS.notes, all);
  }

  getNote(date: string): string {
    return this.notes().find((n) => n.date === date)?.note ?? '';
  }

  // ============================
  // ANALYTICS HELPERS
  // ============================
  getCompletionForDate(date: string): number {
    const instances = this.getInstancesForDate(date);
    const relevant = instances.filter((i) => i.status !== 'not-required');
    if (relevant.length === 0) return 0;
    const done = relevant.filter((i) => i.status === 'done').length;
    return Math.round((done / relevant.length) * 100);
  }

  getCompletionForDateRange(start: string, end: string): { date: string; pct: number }[] {
    const results: { date: string; pct: number }[] = [];
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dateStr = this.formatDate(d);
      results.push({ date: dateStr, pct: this.getCompletionForDate(dateStr) });
    }
    return results;
  }

  getStreak(): number {
    let streak = 0;
    const d = new Date();
    // Start from yesterday if today isn't complete yet
    d.setDate(d.getDate() - 1);
    while (true) {
      const dateStr = this.formatDate(d);
      const instances = this.getInstancesForDate(dateStr);
      const relevant = instances.filter((i) => i.status !== 'not-required');
      if (relevant.length === 0) break;
      const done = relevant.filter((i) => i.status === 'done').length;
      if ((done / relevant.length) * 100 >= 80) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    // Check today too
    const todayCompletion = this.getCompletionForDate(this.today());
    if (todayCompletion >= 80) streak++;
    return streak;
  }

  getTimeBreakdown(start: string, end: string): Record<string, number> {
    const breakdown: Record<string, number> = {};
    const instances = this.getInstancesForDateRange(start, end).filter(
      (i) => i.status === 'done'
    );
    for (const instance of instances) {
      const task = this.getTask(instance.taskId);
      if (task) {
        const cat = task.category;
        breakdown[cat] = (breakdown[cat] || 0) + task.duration;
      }
    }
    // Add unplanned activities
    const activities = this.getActivitiesForDateRange(start, end);
    for (const a of activities) {
      breakdown[a.category] = (breakdown[a.category] || 0) + a.duration;
    }
    return breakdown;
  }

  getConsecutiveMisses(taskId: string): number {
    const instances = this.instances()
      .filter((i) => i.taskId === taskId)
      .sort((a, b) => b.date.localeCompare(a.date));
    let count = 0;
    for (const inst of instances) {
      if (inst.status === 'missed') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  getProductiveHours(date: string): number {
    const instances = this.getInstancesForDate(date).filter(
      (i) => i.status === 'done'
    );
    let totalMinutes = 0;
    for (const inst of instances) {
      const task = this.getTask(inst.taskId);
      if (task && (task.category === 'work' || task.category === 'study' || task.category === 'exercise')) {
        totalMinutes += task.duration;
      }
    }
    return totalMinutes / 60;
  }

  // ============================
  // DATA BACKUP
  // ============================
  exportData(): string {
    return JSON.stringify({
      tasks: this.tasks(),
      instances: this.instances(),
      activities: this.activities(),
      notes: this.notes(),
      exportedAt: new Date().toISOString(),
    });
  }

  importData(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (data.tasks) {
        this.tasks.set(data.tasks);
        this.set(this.KEYS.tasks, data.tasks);
      }
      if (data.instances) {
        this.instances.set(data.instances);
        this.set(this.KEYS.instances, data.instances);
      }
      if (data.activities) {
        this.activities.set(data.activities);
        this.set(this.KEYS.activities, data.activities);
      }
      if (data.notes) {
        this.notes.set(data.notes);
        this.set(this.KEYS.notes, data.notes);
      }
      return true;
    } catch {
      return false;
    }
  }
}
