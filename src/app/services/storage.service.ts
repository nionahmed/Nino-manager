import { Injectable, signal, PLATFORM_ID, inject, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  writeBatch,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase.config';
import { AuthService } from './auth.service';
import {
  Task,
  TaskInstance,
  ActivityLog,
  DailyNote,
  TaskStatus,
} from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly authService = inject(AuthService);
  private readonly zone = inject(NgZone);

  readonly tasks = signal<Task[]>([]);
  readonly instances = signal<TaskInstance[]>([]);
  readonly activities = signal<ActivityLog[]>([]);
  readonly notes = signal<DailyNote[]>([]);

  private unsubscribers: Unsubscribe[] = [];

  constructor() {
    if (!this.isBrowser) return;

    // Wait for auth state, then subscribe to Firestore
    // Use an effect-like pattern: watch the auth user signal
    const checkAuth = setInterval(() => {
      const uid = this.authService.getUid();
      if (uid) {
        clearInterval(checkAuth);
        this.subscribeToFirestore(uid);
      }
      // Also handle logout
      if (!this.authService.isLoading() && !uid) {
        this.clearData();
      }
    }, 200);
  }

  private subscribeToFirestore(uid: string): void {
    // Unsubscribe from any previous listeners
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    const userDoc = `users/${uid}`;

    // Tasks listener
    const tasksUnsub = onSnapshot(
      collection(db, `${userDoc}/tasks`),
      (snapshot) => {
        this.zone.run(() => {
          const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task));
          this.tasks.set(items);
        });
      }
    );
    this.unsubscribers.push(tasksUnsub);

    // Instances listener
    const instancesUnsub = onSnapshot(
      collection(db, `${userDoc}/instances`),
      (snapshot) => {
        this.zone.run(() => {
          const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TaskInstance));
          this.instances.set(items);
        });
      }
    );
    this.unsubscribers.push(instancesUnsub);

    // Activities listener
    const activitiesUnsub = onSnapshot(
      collection(db, `${userDoc}/activities`),
      (snapshot) => {
        this.zone.run(() => {
          const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
          this.activities.set(items);
        });
      }
    );
    this.unsubscribers.push(activitiesUnsub);

    // Notes listener
    const notesUnsub = onSnapshot(
      collection(db, `${userDoc}/notes`),
      (snapshot) => {
        this.zone.run(() => {
          const items = snapshot.docs.map(d => ({ ...d.data(), date: d.id } as DailyNote));
          this.notes.set(items);
        });
      }
    );
    this.unsubscribers.push(notesUnsub);

    // Generate today's instances after a short delay for data to load
    setTimeout(() => this.zone.run(() => this.generateInstancesForToday()), 1500);
  }

  private clearData(): void {
    this.tasks.set([]);
    this.instances.set([]);
    this.activities.set([]);
    this.notes.set([]);
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }

  private getUserPath(): string | null {
    const uid = this.authService.getUid();
    return uid ? `users/${uid}` : null;
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
  async addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task | null> {
    const path = this.getUserPath();
    if (!path) return null;

    const newTask: any = {
      ...task,
      createdAt: new Date().toISOString(),
    };

    const docRef = await addDoc(collection(db, `${path}/tasks`), newTask);
    const created = { ...newTask, id: docRef.id } as Task;

    // Generate instance for the task's start date
    const genStart = created.startDate <= this.today() ? this.today() : created.startDate;
    await this.generateInstancesForDateRangeAsync(genStart, genStart);

    return created;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    const path = this.getUserPath();
    if (!path) return;

    const { id: _, ...data } = updates as any;
    await updateDoc(doc(db, `${path}/tasks`, id), data);

    // Clean up invalid pending instances
    const task = this.getTask(id);
    if (task) {
      const updatedTask = { ...task, ...updates };
      const invalidInstances = this.instances().filter(i => {
        if (i.taskId !== id) return false;
        if (i.status !== 'pending') return false;
        return !this.taskShouldOccurOnDate(updatedTask, i.date);
      });
      for (const inst of invalidInstances) {
        await deleteDoc(doc(db, `${path}/instances`, inst.id));
      }
    }
  }

  async deleteTask(id: string): Promise<void> {
    const path = this.getUserPath();
    if (!path) return;

    await deleteDoc(doc(db, `${path}/tasks`, id));

    // Delete related instances
    const relatedInstances = this.instances().filter(i => i.taskId === id);
    const batch = writeBatch(db);
    for (const inst of relatedInstances) {
      batch.delete(doc(db, `${path}/instances`, inst.id));
    }
    if (relatedInstances.length > 0) {
      await batch.commit();
    }
  }

  getTask(id: string): Task | undefined {
    return this.tasks().find((t) => t.id === id);
  }

  // ============================
  // TASK INSTANCES
  // ============================
  taskShouldOccurOnDate(task: Task, dateStr: string): boolean {
    if (task.archived) return false;
    const taskStartDate = task.startDate || this.formatDate(new Date(task.createdAt));
    if (dateStr < taskStartDate) return false;
    const dayOfWeek = this.getDayOfWeek(dateStr);
    switch (task.repeat) {
      case 'daily':
        return true;
      case 'weekly': {
        const startDow = this.getDayOfWeek(taskStartDate);
        return dayOfWeek === startDow;
      }
      case 'custom':
        return task.customDays?.includes(dayOfWeek) ?? false;
      case 'none':
        return dateStr === taskStartDate;
      default:
        return false;
    }
  }

  getNextOccurrence(task: Task): string | null {
    if (task.archived) return null;
    let d = new Date();
    const todayStr = this.formatDate(d);

    const taskStartDate = task.startDate || this.formatDate(new Date(task.createdAt));
    let checkDateStr = todayStr > taskStartDate ? todayStr : taskStartDate;

    for (let i = 0; i < 365; i++) {
      if (this.taskShouldOccurOnDate(task, checkDateStr)) {
        const inst = this.instances().find(inst => inst.taskId === task.id && inst.date === checkDateStr);
        if (!inst || inst.status === 'pending') {
          return checkDateStr;
        }
      }
      d = new Date(checkDateStr + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      checkDateStr = this.formatDate(d);
    }
    return null;
  }

  getVirtualInstance(taskId: string, dateStr: string): TaskInstance | null {
    const inst = this.instances().find(i => i.taskId === taskId && i.date === dateStr);
    if (inst) return inst;

    const task = this.getTask(taskId);
    if (!task) return null;

    return {
      id: `virtual_${taskId}_${dateStr}`,
      taskId,
      date: dateStr,
      status: 'pending'
    };
  }

  generateInstancesForToday(): void {
    this.generateInstancesForDateRangeAsync(this.today(), this.today());
  }

  generateInstancesForDateRange(startDate: string, endDate: string): void {
    this.generateInstancesForDateRangeAsync(startDate, endDate);
  }

  private async generateInstancesForDateRangeAsync(startDate: string, endDate: string): Promise<void> {
    const path = this.getUserPath();
    if (!path) return;

    const existingInstances = this.instances();
    const tasks = this.tasks();
    const batch = writeBatch(db);
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
          const newDocRef = doc(collection(db, `${path}/instances`));
          batch.set(newDocRef, {
            taskId: task.id,
            date: dateStr,
            status: 'pending',
          });
          changed = true;
        }
      }
    }

    if (changed) {
      await batch.commit();
    }
  }

  getInstancesForDate(date: string): TaskInstance[] {
    return this.instances().filter((i) => i.date === date);
  }

  getInstancesForDateRange(start: string, end: string): TaskInstance[] {
    return this.instances().filter((i) => i.date >= start && i.date <= end);
  }

  async updateInstanceStatus(instanceId: string, status: TaskStatus): Promise<void> {
    const path = this.getUserPath();
    if (!path) return;

    if (instanceId.startsWith('virtual_')) {
      const parts = instanceId.split('_');
      const taskId = parts[1];
      const dateStr = parts.slice(2).join('_');

      await addDoc(collection(db, `${path}/instances`), {
        taskId,
        date: dateStr,
        status,
        completedAt: status === 'done' ? new Date().toISOString() : null,
      });
      return;
    }

    await updateDoc(doc(db, `${path}/instances`, instanceId), {
      status,
      completedAt: status === 'done' ? new Date().toISOString() : null,
    });
  }

  // ============================
  // ACTIVITY LOG
  // ============================
  async addActivity(activity: Omit<ActivityLog, 'id'>): Promise<ActivityLog | null> {
    const path = this.getUserPath();
    if (!path) return null;

    const docRef = await addDoc(collection(db, `${path}/activities`), activity);
    return { ...activity, id: docRef.id } as ActivityLog;
  }

  async deleteActivity(id: string): Promise<void> {
    const path = this.getUserPath();
    if (!path) return;
    await deleteDoc(doc(db, `${path}/activities`, id));
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
  async setNote(date: string, note: string): Promise<void> {
    const path = this.getUserPath();
    if (!path) return;

    if (note.trim()) {
      await setDoc(doc(db, `${path}/notes`, date), { note: note.trim() });
    } else {
      await deleteDoc(doc(db, `${path}/notes`, date));
    }
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

  async importData(jsonStr: string): Promise<boolean> {
    const path = this.getUserPath();
    if (!path) return false;

    try {
      const data = JSON.parse(jsonStr);
      const batch = writeBatch(db);

      if (data.tasks) {
        for (const task of data.tasks) {
          const { id, ...taskData } = task;
          const ref = doc(collection(db, `${path}/tasks`));
          batch.set(ref, taskData);
        }
      }
      if (data.instances) {
        for (const inst of data.instances) {
          const { id, ...instData } = inst;
          const ref = doc(collection(db, `${path}/instances`));
          batch.set(ref, instData);
        }
      }
      if (data.activities) {
        for (const act of data.activities) {
          const { id, ...actData } = act;
          const ref = doc(collection(db, `${path}/activities`));
          batch.set(ref, actData);
        }
      }
      if (data.notes) {
        for (const note of data.notes) {
          const ref = doc(db, `${path}/notes`, note.date);
          batch.set(ref, { note: note.note });
        }
      }

      await batch.commit();
      return true;
    } catch {
      return false;
    }
  }
}
