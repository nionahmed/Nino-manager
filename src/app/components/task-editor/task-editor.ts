import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import {
  Task,
  TaskCategory,
  RepeatType,
  DEFAULT_TASK_COLORS,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  calcDuration,
} from '../../models/task.model';

@Component({
  selector: 'app-task-editor',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './task-editor.html',
  styleUrl: './task-editor.scss',
})
export class TaskEditorComponent implements OnInit {
  private readonly storage = inject(StorageService);

  // Inputs / Outputs
  readonly taskId = input<string | undefined>(undefined);
  readonly close = output<void>();
  readonly saved = output<void>();

  // Form state
  readonly name = signal('');
  readonly category = signal<TaskCategory>('work');
  readonly startTime = signal('09:00');
  readonly endTime = signal('10:00');
  readonly startDate = signal(this.storage.today());
  readonly repeat = signal<RepeatType>('none');
  readonly customDays = signal<number[]>([]);
  readonly color = signal(DEFAULT_TASK_COLORS[0]);
  readonly notes = signal('');
  readonly notesExpanded = signal(false);
  readonly showDeleteConfirm = signal(false);

  // Constants exposed to template
  readonly categories: TaskCategory[] = ['work', 'exercise', 'personal', 'entertainment', 'study', 'prayer', 'other'];
  readonly categoryLabels = CATEGORY_LABELS;
  readonly categoryColors = CATEGORY_COLORS;
  readonly categoryIcons = CATEGORY_ICONS;
  readonly colors = DEFAULT_TASK_COLORS;
  readonly repeatOptions: { value: RepeatType; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'custom', label: 'Custom' },
  ];
  readonly dayLabels = [
    { value: 0, short: 'S', label: 'Sun' },
    { value: 1, short: 'M', label: 'Mon' },
    { value: 2, short: 'T', label: 'Tue' },
    { value: 3, short: 'W', label: 'Wed' },
    { value: 4, short: 'T', label: 'Thu' },
    { value: 5, short: 'F', label: 'Fri' },
    { value: 6, short: 'S', label: 'Sat' },
  ];

  // Computed
  readonly isEditing = computed(() => !!this.taskId());
  readonly computedDuration = computed(() => calcDuration(this.startTime(), this.endTime()));
  readonly durationDisplay = computed(() => {
    const d = this.computedDuration();
    const hours = Math.floor(d / 60);
    const mins = d % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} hr`;
    return `${hours} hr ${mins} min`;
  });
  readonly isValid = computed(() => this.name().trim().length > 0);
  readonly title = computed(() => this.isEditing() ? 'Edit Task' : 'New Task');

  ngOnInit(): void {
    const id = this.taskId();
    if (id) {
      const task = this.storage.getTask(id);
      if (task) {
        this.name.set(task.name);
        this.category.set(task.category);
        this.startTime.set(task.startTime);
        this.endTime.set(task.endTime || this.calcEndFromDuration(task.startTime, task.duration));
        this.startDate.set(task.startDate || this.storage.today());
        this.repeat.set(task.repeat);
        this.customDays.set(task.customDays ?? []);
        this.color.set(task.color);
        this.notes.set(task.notes ?? '');
        if (task.notes) {
          this.notesExpanded.set(true);
        }
      }
    }
  }

  /** Fallback: compute endTime from startTime + duration for legacy tasks */
  private calcEndFromDuration(start: string, durationMins: number): string {
    const [h, m] = start.split(':').map(Number);
    const totalMin = h * 60 + m + durationMins;
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  // Category
  selectCategory(cat: TaskCategory): void {
    this.category.set(cat);
  }

  // Repeat
  setRepeat(type: RepeatType): void {
    this.repeat.set(type);
    if (type !== 'custom') {
      this.customDays.set([]);
    }
  }

  // Custom days toggle
  toggleDay(day: number): void {
    const current = this.customDays();
    if (current.includes(day)) {
      this.customDays.set(current.filter(d => d !== day));
    } else {
      this.customDays.set([...current, day]);
    }
  }

  isDayActive(day: number): boolean {
    return this.customDays().includes(day);
  }

  // Color
  selectColor(c: string): void {
    this.color.set(c);
  }

  // Notes
  toggleNotes(): void {
    this.notesExpanded.update(v => !v);
  }

  // Save
  save(): void {
    if (!this.isValid()) return;

    const duration = this.computedDuration();

    const taskData = {
      name: this.name().trim(),
      category: this.category(),
      startTime: this.startTime(),
      endTime: this.endTime(),
      duration,
      startDate: this.startDate(),
      repeat: this.repeat(),
      customDays: this.repeat() === 'custom' ? this.customDays() : undefined,
      color: this.color(),
      notes: this.notes().trim() || undefined,
    };

    const id = this.taskId();
    if (id) {
      this.storage.updateTask(id, taskData);
    } else {
      this.storage.addTask(taskData as Omit<Task, 'id' | 'createdAt'>);
    }

    this.saved.emit();
    this.close.emit();
  }

  // Duplicate
  duplicate(): void {
    if (!this.isValid()) return;

    const duration = this.computedDuration();

    const taskData: Omit<Task, 'id' | 'createdAt'> = {
      name: this.name().trim() + ' (copy)',
      category: this.category(),
      startTime: this.startTime(),
      endTime: this.endTime(),
      duration,
      startDate: this.startDate(),
      repeat: this.repeat(),
      customDays: this.repeat() === 'custom' ? this.customDays() : undefined,
      color: this.color(),
      notes: this.notes().trim() || undefined,
    };

    this.storage.addTask(taskData);
    this.saved.emit();
    this.close.emit();
  }

  // Delete
  confirmDelete(): void {
    this.showDeleteConfirm.set(true);
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
  }

  deleteTask(): void {
    const id = this.taskId();
    if (id) {
      this.storage.deleteTask(id);
      this.saved.emit();
      this.close.emit();
    }
  }

  // Close
  onOverlayClick(): void {
    this.close.emit();
  }

  onSheetClick(event: Event): void {
    event.stopPropagation();
  }
}
