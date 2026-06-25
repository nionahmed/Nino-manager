import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import { NudgeService } from '../../services/nudge.service';
import {
  Task,
  TaskCategory,
  TaskInstance,
  TaskStatus,
  RepeatType,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  REPEAT_LABELS,
} from '../../models/task.model';
import { TaskEditorService } from '../../services/task-editor.service';

type FilterTab = 'today' | 'week' | 'all';

interface EnrichedInstance {
  instance: TaskInstance;
  task: Task;
  nextDate?: string;
}

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-list.html',
  styleUrl: './task-list.scss',
})
export class TaskListComponent {
  private readonly storage = inject(StorageService);
  private readonly nudge = inject(NudgeService);
  private readonly editorService = inject(TaskEditorService);

  readonly activeFilter = signal<FilterTab>('today');

  // ── Constants ──
  readonly CATEGORY_ICONS = CATEGORY_ICONS;
  readonly CATEGORY_LABELS = CATEGORY_LABELS;
  readonly REPEAT_LABELS = REPEAT_LABELS;

  // ── Week range helpers ──
  private readonly weekStart = computed(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return this.storage.formatDate(monday);
  });

  private readonly weekEnd = computed(() => {
    const start = new Date(this.weekStart() + 'T00:00:00');
    const sunday = new Date(start);
    sunday.setDate(start.getDate() + 6);
    return this.storage.formatDate(sunday);
  });

  // ── Enriched: join instances with their parent task ──
  private readonly enrichedInstances = computed<EnrichedInstance[]>(() => {
    const filter = this.activeFilter();
    // Ensure we trigger reactivity on instances signal
    this.storage.instances();

    if (filter === 'today') {
      const raw = this.storage.getInstancesForDate(this.storage.today());
      return raw
        .map((inst) => {
          const task = this.storage.getTask(inst.taskId);
          return task ? { instance: inst, task } : null;
        })
        .filter((e): e is EnrichedInstance => e !== null)
        .sort((a, b) => a.task.startTime.localeCompare(b.task.startTime));
    }

    // For 'week' and 'all', show each task's next occurrence
    const allTasks = this.storage.tasks();
    const items: EnrichedInstance[] = [];
    
    for (const task of allTasks) {
      if (task.archived) continue;
      
      const nextDate = this.storage.getNextOccurrence(task);
      if (!nextDate) continue; // no future occurrences
      
      if (filter === 'week' && nextDate > this.weekEnd()) {
        continue; // strictly after this week
      }
      
      // Get or create the virtual instance for this next date
      const instance = this.storage.getVirtualInstance(task.id, nextDate);
      if (instance) {
        items.push({ instance, task, nextDate });
      }
    }
    
    // Sort according to their date and then by earliest time
    return items.sort((a, b) => {
       const dateDiff = a.nextDate!.localeCompare(b.nextDate!);
       if (dateDiff !== 0) return dateDiff;
       return a.task.startTime.localeCompare(b.task.startTime);
    });
  });

  // ── Time-of-day groups (Only for Today) ──
  readonly morningTasks = computed(() =>
    this.activeFilter() === 'today' ? this.enrichedInstances().filter((e) => e.task.startTime < '12:00') : []
  );

  readonly afternoonTasks = computed(() =>
    this.activeFilter() === 'today' ? this.enrichedInstances().filter(
      (e) => e.task.startTime >= '12:00' && e.task.startTime < '17:00'
    ) : []
  );

  readonly eveningTasks = computed(() =>
    this.activeFilter() === 'today' ? this.enrichedInstances().filter((e) => e.task.startTime >= '17:00') : []
  );

  // ── Date groups (For Week/All) ──
  readonly dateGroups = computed(() => {
    if (this.activeFilter() === 'today') return [];
    
    const groups: { date: string; label: string; tasks: EnrichedInstance[] }[] = [];
    const map = new Map<string, EnrichedInstance[]>();
    
    for (const item of this.enrichedInstances()) {
      const date = item.nextDate!;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(item);
    }
    
    const sortedDates = Array.from(map.keys()).sort();
    for (const d of sortedDates) {
      groups.push({
        date: d,
        label: this.formatDateHeader(d),
        tasks: map.get(d)!
      });
    }
    return groups;
  });

  // ── Progress (only meaningful for today / week) ──
  readonly totalTasks = computed(() => this.enrichedInstances().length);

  readonly completedTasks = computed(
    () => this.enrichedInstances().filter((e) => e.instance.status === 'done').length
  );

  readonly progressPct = computed(() => {
    const total = this.totalTasks();
    return total === 0 ? 0 : Math.round((this.completedTasks() / total) * 100);
  });

  // ── Whether to show repeat badge (only for week/all views) ──
  readonly showRepeatBadge = computed(() => this.activeFilter() !== 'today');

  // ── Empty state ──
  readonly isEmpty = computed(() => this.enrichedInstances().length === 0);

  setFilter(filter: FilterTab): void {
    this.activeFilter.set(filter);
  }

  updateStatus(instanceId: string, status: TaskStatus): void {
    this.storage.updateInstanceStatus(instanceId, status);
  }

  hasNudge(taskId: string): boolean {
    return this.nudge.hasNudge(taskId);
  }

  onEditTask(taskId: string): void {
    this.editorService.openEdit(taskId);
  }

  formatTime(time24: string): string {
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${mStr} ${ampm}`;
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  getRepeatLabel(repeat: RepeatType | any): string {
    return REPEAT_LABELS[repeat as RepeatType];
  }

  getCategoryIcon(category: TaskCategory | any): string {
    return CATEGORY_ICONS[category as TaskCategory];
  }

  getCategoryLabel(category: TaskCategory | any): string {
    return CATEGORY_LABELS[category as TaskCategory];
  }

  getFilterLabel(): string {
    switch (this.activeFilter()) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'all':
        return 'All Tasks';
    }
  }

  formatDateHeader(dateStr: string): string {
    const today = this.storage.today();
    if (dateStr === today) return 'Today';
    
    const tDate = new Date();
    tDate.setDate(tDate.getDate() + 1);
    if (dateStr === this.storage.formatDate(tDate)) return 'Tomorrow';
    
    // Ensure cross-browser date parsing by appending time
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
}
