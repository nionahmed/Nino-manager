import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import { ActivityLog, ActivityCategory } from '../../models/task.model';

interface DateGroup {
  date: string;
  label: string;
  entries: ActivityLog[];
  unproductiveMin: number;
  entertainmentMin: number;
}

@Component({
  selector: 'app-activity-log',
  imports: [FormsModule, CommonModule],
  templateUrl: './activity-log.html',
  styleUrl: './activity-log.scss',
})
export class ActivityLogComponent {
  private readonly storage = inject(StorageService);

  // Quick-Add form state
  readonly name = signal('');
  readonly category = signal<ActivityCategory>('unproductive');
  readonly selectedPreset = signal<number | null>(30);
  readonly customDuration = signal<number | null>(null);
  readonly useCustomDuration = signal(false);
  readonly timestamp = signal(this.nowLocalISO());
  readonly showTimePicker = signal(false);
  readonly confirmDeleteId = signal<string | null>(null);

  // Duration presets
  readonly presets = [
    { label: '15m', value: 15 },
    { label: '30m', value: 30 },
    { label: '1h', value: 60 },
    { label: '2h', value: 120 },
    { label: '3h', value: 180 },
  ];

  // Computed: effective duration
  readonly duration = computed(() => {
    if (this.useCustomDuration()) {
      return this.customDuration() ?? 0;
    }
    return this.selectedPreset() ?? 0;
  });

  // Computed: today's date string
  readonly today = computed(() => this.storage.today());

  // Computed: start of this week (Monday)
  readonly weekStart = computed(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0
    const mon = new Date(now);
    mon.setDate(mon.getDate() - diff);
    return this.storage.formatDate(mon);
  });

  // Computed: today summary
  readonly todayStats = computed(() => {
    const activities = this.storage.activities();
    const todayStr = this.today();
    const todayActivities = activities.filter(a => a.date === todayStr);
    return {
      unproductive: todayActivities
        .filter(a => a.category === 'unproductive')
        .reduce((sum, a) => sum + a.duration, 0),
      entertainment: todayActivities
        .filter(a => a.category === 'entertainment')
        .reduce((sum, a) => sum + a.duration, 0),
    };
  });

  // Computed: this week summary
  readonly weekStats = computed(() => {
    const activities = this.storage.activities();
    const start = this.weekStart();
    const end = this.today();
    const weekActivities = activities.filter(a => a.date >= start && a.date <= end);
    return {
      unproductive: weekActivities
        .filter(a => a.category === 'unproductive')
        .reduce((sum, a) => sum + a.duration, 0),
      entertainment: weekActivities
        .filter(a => a.category === 'entertainment')
        .reduce((sum, a) => sum + a.duration, 0),
    };
  });

  // Computed: grouped history (newest first)
  readonly groupedHistory = computed<DateGroup[]>(() => {
    const activities = [...this.storage.activities()].sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp)
    );

    const groups = new Map<string, ActivityLog[]>();
    for (const a of activities) {
      const existing = groups.get(a.date) ?? [];
      existing.push(a);
      groups.set(a.date, existing);
    }

    const todayStr = this.today();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = this.storage.formatDate(yesterdayDate);

    const result: DateGroup[] = [];
    // Sort dates newest first
    const sortedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));

    for (const date of sortedDates) {
      const entries = groups.get(date)!;
      let label: string;
      if (date === todayStr) {
        label = 'Today';
      } else if (date === yesterdayStr) {
        label = 'Yesterday';
      } else {
        const d = new Date(date + 'T00:00:00');
        label = d.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      }

      result.push({
        date,
        label,
        entries,
        unproductiveMin: entries
          .filter(e => e.category === 'unproductive')
          .reduce((s, e) => s + e.duration, 0),
        entertainmentMin: entries
          .filter(e => e.category === 'entertainment')
          .reduce((s, e) => s + e.duration, 0),
      });
    }

    return result;
  });

  // Computed: has any activities
  readonly hasActivities = computed(() => this.storage.activities().length > 0);

  // Computed: readable timestamp display
  readonly timestampDisplay = computed(() => {
    const ts = this.timestamp();
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  });

  // Computed: form validity
  readonly canAdd = computed(() => {
    return this.name().trim().length > 0 && this.duration() > 0;
  });

  // Helpers
  formatDuration(mins: number): string {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  formatTime(isoStr: string): string {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  nowLocalISO(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  // Actions
  selectCategory(cat: ActivityCategory): void {
    this.category.set(cat);
  }

  selectPreset(value: number): void {
    this.useCustomDuration.set(false);
    this.selectedPreset.set(value);
  }

  enableCustomDuration(): void {
    this.useCustomDuration.set(true);
    this.selectedPreset.set(null);
    this.customDuration.set(null);
  }

  toggleTimePicker(): void {
    this.showTimePicker.set(!this.showTimePicker());
  }

  onTimestampChange(value: string): void {
    this.timestamp.set(value);
  }

  onCustomDurationChange(value: string): void {
    const num = parseInt(value, 10);
    this.customDuration.set(isNaN(num) || num <= 0 ? null : num);
  }

  addActivity(): void {
    if (!this.canAdd()) return;

    const tsValue = this.timestamp();
    const isoString = new Date(tsValue).toISOString();
    const dateStr = tsValue.slice(0, 10); // YYYY-MM-DD

    this.storage.addActivity({
      name: this.name().trim(),
      category: this.category(),
      duration: this.duration(),
      timestamp: isoString,
      date: dateStr,
    });

    // Reset form
    this.name.set('');
    this.selectedPreset.set(30);
    this.useCustomDuration.set(false);
    this.customDuration.set(null);
    this.timestamp.set(this.nowLocalISO());
    this.showTimePicker.set(false);
  }

  requestDelete(id: string): void {
    this.confirmDeleteId.set(id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  confirmDelete(id: string): void {
    this.storage.deleteActivity(id);
    this.confirmDeleteId.set(null);
  }

  trackByEntryId(_index: number, entry: ActivityLog): string {
    return entry.id;
  }
}
