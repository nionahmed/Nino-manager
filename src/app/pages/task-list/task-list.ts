import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import { NudgeService } from '../../services/nudge.service';
import {
  Task,
  TaskInstance,
  TaskStatus,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
} from '../../models/task.model';

type FilterTab = 'today' | 'week' | 'all';

interface EnrichedInstance {
  instance: TaskInstance;
  task: Task;
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

  readonly activeFilter = signal<FilterTab>('today');

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

  // ── Raw instances based on active filter ──
  private readonly rawInstances = computed<TaskInstance[]>(() => {
    const filter = this.activeFilter();
    // Ensure we trigger reactivity on instances signal
    const _all = this.storage.instances();

    if (filter === 'today') {
      return this.storage.getInstancesForDate(this.storage.today());
    } else if (filter === 'week') {
      this.storage.generateInstancesForDateRange(this.weekStart(), this.weekEnd());
      return this.storage.getInstancesForDateRange(this.weekStart(), this.weekEnd());
    } else {
      return _all;
    }
  });

  // ── Enriched: join instances with their parent task ──
  private readonly enrichedInstances = computed<EnrichedInstance[]>(() => {
    return this.rawInstances()
      .map((inst) => {
        const task = this.storage.getTask(inst.taskId);
        return task ? { instance: inst, task } : null;
      })
      .filter((e): e is EnrichedInstance => e !== null)
      .sort((a, b) => a.task.startTime.localeCompare(b.task.startTime));
  });

  // ── Time-of-day groups ──
  readonly morningTasks = computed(() =>
    this.enrichedInstances().filter((e) => e.task.startTime < '12:00')
  );

  readonly afternoonTasks = computed(() =>
    this.enrichedInstances().filter(
      (e) => e.task.startTime >= '12:00' && e.task.startTime < '17:00'
    )
  );

  readonly eveningTasks = computed(() =>
    this.enrichedInstances().filter((e) => e.task.startTime >= '17:00')
  );

  // ── Progress ──
  readonly totalTasks = computed(() => this.enrichedInstances().length);

  readonly completedTasks = computed(
    () => this.enrichedInstances().filter((e) => e.instance.status === 'done').length
  );

  readonly progressPct = computed(() => {
    const total = this.totalTasks();
    return total === 0 ? 0 : Math.round((this.completedTasks() / total) * 100);
  });

  // ── Empty state ──
  readonly isEmpty = computed(() => this.enrichedInstances().length === 0);

  // ── Helpers ──
  readonly CATEGORY_ICONS = CATEGORY_ICONS;
  readonly CATEGORY_LABELS = CATEGORY_LABELS;

  setFilter(filter: FilterTab): void {
    this.activeFilter.set(filter);
  }

  updateStatus(instanceId: string, status: TaskStatus): void {
    this.storage.updateInstanceStatus(instanceId, status);
  }

  hasNudge(taskId: string): boolean {
    return this.nudge.hasNudge(taskId);
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
}
