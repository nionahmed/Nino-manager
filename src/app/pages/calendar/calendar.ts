import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import { Task, TaskInstance, TaskStatus } from '../../models/task.model';

type CalendarView = 'day' | '3day' | 'week' | 'month';

interface PositionedTask {
  instance: TaskInstance;
  task: Task;
  top: number;
  height: number;
  leftPct?: number;
  widthPct?: number;
}

interface MonthDay {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: { task: Task; instance: TaskInstance }[];
  note: string;
}

@Component({
  selector: 'app-calendar',
  imports: [CommonModule],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class CalendarComponent implements OnInit, OnDestroy {
  private readonly storage = inject(StorageService);
  private readonly platformId = inject(PLATFORM_ID);

  // State
  readonly currentView = signal<CalendarView>('day');
  readonly selectedDate = signal<Date>(new Date());
  readonly currentTimeTop = signal<number>(0);
  readonly animationDirection = signal<'left' | 'right' | 'none'>('none');

  // Touch tracking
  private touchStartX = 0;
  private touchStartY = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // Constants
  readonly hours = Array.from({ length: 24 }, (_, i) => i); // 12AM to 11PM
  readonly dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly views: { key: CalendarView; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: '3day', label: '3-Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  // Computed
  readonly headerText = computed(() => {
    const d = this.selectedDate();
    const view = this.currentView();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthsShort = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    if (view === 'day') {
      return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }
    if (view === '3day') {
      const end = new Date(d);
      end.setDate(end.getDate() + 2);
      if (d.getMonth() === end.getMonth()) {
        return `${monthsShort[d.getMonth()]} ${d.getDate()} - ${end.getDate()}, ${d.getFullYear()}`;
      }
      return `${monthsShort[d.getMonth()]} ${d.getDate()} - ${monthsShort[end.getMonth()]} ${end.getDate()}, ${d.getFullYear()}`;
    }
    if (view === 'week') {
      const start = this.getWeekStart(d);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      if (start.getMonth() === end.getMonth()) {
        return `${monthsShort[start.getMonth()]} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${monthsShort[start.getMonth()]} ${start.getDate()} - ${monthsShort[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    }
    // month
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  });

  readonly todayStr = computed(() => this.storage.today());

  readonly dayColumnDates = computed(() => {
    const view = this.currentView();
    const d = this.selectedDate();
    if (view === 'day') {
      return [new Date(d)];
    }
    if (view === '3day') {
      return [0, 1, 2].map(offset => {
        const nd = new Date(d);
        nd.setDate(nd.getDate() + offset);
        return nd;
      });
    }
    // week
    const start = this.getWeekStart(d);
    return Array.from({ length: 7 }, (_, i) => {
      const nd = new Date(start);
      nd.setDate(nd.getDate() + i);
      return nd;
    });
  });

  readonly positionedTasksByColumn = computed(() => {
    const cols = this.dayColumnDates();
    const view = this.currentView();
    const hourHeight = view === 'week' ? 30 : 60;

    // Trigger reactivity on instances signal
    this.storage.instances();

    return cols.map(date => {
      const dateStr = this.storage.formatDate(date);
      const instances = this.storage.getInstancesForDate(dateStr);
      const positioned: PositionedTask[] = [];

      for (const inst of instances) {
        const task = this.storage.getTask(inst.taskId);
        if (!task) continue;

        const [h, m] = task.startTime.split(':').map(Number);
        const startMinutes = h * 60 + m;
        const top = (startMinutes / 60) * hourHeight;
        const height = Math.max((task.duration / 60) * hourHeight, hourHeight * 0.35);

        positioned.push({ instance: inst, task, top, height });
      }

      // Group overlapping tasks
      positioned.sort((a, b) => a.top - b.top || b.height - a.height);

      const clusters: PositionedTask[][] = [];
      let currentCluster: PositionedTask[] = [];
      let clusterEnd = 0;

      for (const p of positioned) {
        if (currentCluster.length === 0) {
          currentCluster.push(p);
          clusterEnd = p.top + p.height;
        } else {
          // If task overlaps with the current cluster
          if (p.top < clusterEnd) {
            currentCluster.push(p);
            clusterEnd = Math.max(clusterEnd, p.top + p.height);
          } else {
            clusters.push(currentCluster);
            currentCluster = [p];
            clusterEnd = p.top + p.height;
          }
        }
      }
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }

      // Assign left and width within clusters
      for (const cluster of clusters) {
        const columns: PositionedTask[][] = [];
        
        for (const p of cluster) {
          let placed = false;
          for (const col of columns) {
            const last = col[col.length - 1];
            if (last.top + last.height <= p.top) {
              col.push(p);
              placed = true;
              break;
            }
          }
          if (!placed) {
            columns.push([p]);
          }
        }
        
        const numCols = columns.length;
        for (let colIdx = 0; colIdx < numCols; colIdx++) {
          for (const p of columns[colIdx]) {
            p.leftPct = (colIdx / numCols) * 100;
            p.widthPct = (1 / numCols) * 100;
          }
        }
      }

      return positioned;
    });
  });

  readonly monthDays = computed<MonthDay[]>(() => {
    const d = this.selectedDate();
    const year = d.getFullYear();
    const month = d.getMonth();
    const today = this.todayStr();

    // Trigger reactivity
    this.storage.instances();

    // First day of month
    const firstDay = new Date(year, month, 1);
    // Day of week (Mon=0)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    // Last day of month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Need to fill the grid: start from prev month days
    const days: MonthDay[] = [];

    // Previous month fill
    for (let i = startDow - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      const dateStr = this.storage.formatDate(date);
      days.push({
        date,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === today,
        tasks: this.getTasksForDate(dateStr),
        note: this.storage.getNote(dateStr),
      });
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const dateStr = this.storage.formatDate(date);
      days.push({
        date,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === today,
        tasks: this.getTasksForDate(dateStr),
        note: this.storage.getNote(dateStr),
      });
    }

    // Next month fill to complete 6 rows
    const totalCells = Math.ceil(days.length / 7) * 7;
    const remaining = totalCells - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      const dateStr = this.storage.formatDate(date);
      days.push({
        date,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === today,
        tasks: this.getTasksForDate(dateStr),
        note: this.storage.getNote(dateStr),
      });
    }

    return days;
  });

  ngOnInit(): void {
    this.updateCurrentTimeLine();
    this.generateInstances();

    if (isPlatformBrowser(this.platformId)) {
      this.timerInterval = setInterval(() => {
        this.updateCurrentTimeLine();
      }, 60000);
    }
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  // ============================
  // Navigation
  // ============================
  setView(view: CalendarView): void {
    this.currentView.set(view);
    this.generateInstances();
  }

  goToToday(): void {
    this.selectedDate.set(new Date());
    this.generateInstances();
  }

  navigate(dir: number): void {
    this.animationDirection.set(dir > 0 ? 'left' : 'right');
    const d = new Date(this.selectedDate());
    const view = this.currentView();

    if (view === 'day') {
      d.setDate(d.getDate() + dir);
    } else if (view === '3day') {
      d.setDate(d.getDate() + dir * 3);
    } else if (view === 'week') {
      d.setDate(d.getDate() + dir * 7);
    } else {
      d.setMonth(d.getMonth() + dir);
    }

    this.selectedDate.set(d);
    this.generateInstances();

    // Reset animation
    setTimeout(() => this.animationDirection.set('none'), 350);
  }

  goToDate(date: Date): void {
    this.selectedDate.set(new Date(date));
    this.currentView.set('day');
    this.generateInstances();
  }

  // ============================
  // Task Interaction
  // ============================
  cycleStatus(instance: TaskInstance, event: Event): void {
    event.stopPropagation();
    const statusCycle: TaskStatus[] = ['pending', 'done', 'missed'];
    const idx = statusCycle.indexOf(instance.status);
    const nextStatus = statusCycle[(idx + 1) % statusCycle.length];
    this.storage.updateInstanceStatus(instance.id, nextStatus);
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'done': return 'check_circle';
      case 'missed': return 'cancel';
      case 'not-required': return 'remove_circle';
      default: return 'radio_button_unchecked';
    }
  }

  // ============================
  // Touch Handling
  // ============================
  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    const deltaX = event.changedTouches[0].clientX - this.touchStartX;
    const deltaY = event.changedTouches[0].clientY - this.touchStartY;

    // Only trigger if horizontal swipe is dominant and large enough
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        this.navigate(1); // swipe left -> next
      } else {
        this.navigate(-1); // swipe right -> prev
      }
    }
  }

  // ============================
  // Helpers
  // ============================
  formatHour(hour: number): string {
    if (hour === 0 || hour === 24) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  }

  formatDateShort(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }

  getDayName(date: Date): string {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  }

  isToday(date: Date): boolean {
    return this.storage.formatDate(date) === this.storage.today();
  }

  trackByHour(_: number, hour: number): number {
    return hour;
  }

  trackByInstance(_: number, item: PositionedTask): string {
    return item.instance.id;
  }

  trackByDay(_: number, day: MonthDay): string {
    return day.dateStr;
  }

  trackByColIndex(index: number): number {
    return index;
  }

  private getWeekStart(d: Date): Date {
    const date = new Date(d);
    let day = date.getDay() - 1; // Mon=0
    if (day < 0) day = 6;
    date.setDate(date.getDate() - day);
    return date;
  }

  private updateCurrentTimeLine(): void {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    this.currentTimeTop.set((minutes / 60) * 60);
  }

  private getTasksForDate(dateStr: string): { task: Task; instance: TaskInstance }[] {
    const instances = this.storage.getInstancesForDate(dateStr);
    const result: { task: Task; instance: TaskInstance }[] = [];
    for (const inst of instances) {
      const task = this.storage.getTask(inst.taskId);
      if (task) {
        result.push({ task, instance: inst });
      }
    }
    return result;
  }

  private generateInstances(): void {
    const view = this.currentView();
    const d = this.selectedDate();
    let start: Date;
    let end: Date;

    if (view === 'day') {
      start = new Date(d);
      end = new Date(d);
    } else if (view === '3day') {
      start = new Date(d);
      end = new Date(d);
      end.setDate(end.getDate() + 2);
    } else if (view === 'week') {
      start = this.getWeekStart(d);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
    } else {
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }

    this.storage.generateInstancesForDateRange(
      this.storage.formatDate(start),
      this.storage.formatDate(end),
    );
  }
}
