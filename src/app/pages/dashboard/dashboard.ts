import {
  Component,
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { StorageService } from '../../services/storage.service';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  TaskCategory,
} from '../../models/task.model';

Chart.register(...registerables);

interface HeatmapCell {
  date: string;
  day: number;
  pct: number;
  label: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  private readonly storage = inject(StorageService);

  // Canvas refs (Simplified signal queries)
  readonly donutCanvas = viewChild<ElementRef<HTMLCanvasElement>>('donutCanvas');
  readonly barCanvas = viewChild<ElementRef<HTMLCanvasElement>>('barCanvas');
  readonly pieCanvas = viewChild<ElementRef<HTMLCanvasElement>>('pieCanvas');

  // Charts
  private donutChart: Chart | null = null;
  private barChart: Chart | null = null;
  private pieChart: Chart | null = null;

  // Dates
  readonly today = this.storage.today();
  readonly weekDates = this.computeLastSevenDays();
  readonly monthDates = this.computeMonthDates();

  // Animated counters
  readonly animatedScore = signal(0);
  readonly animatedStreak = signal(0);
  readonly animatedProductivity = signal(0);

  // Tooltip
  readonly tooltipVisible = signal(false);
  readonly tooltipText = signal('');
  readonly tooltipX = signal(0);
  readonly tooltipY = signal(0);

  // Computed data
  readonly todayCompletion = computed(() => {
    // Access signals to track reactivity
    this.storage.instances();
    return this.storage.getCompletionForDate(this.today);
  });

  readonly weeklyData = computed(() => {
    this.storage.instances();
    const start = this.weekDates[0];
    const end = this.weekDates[6];
    this.storage.generateInstancesForDateRange(start, end);
    return this.storage.getCompletionForDateRange(start, end);
  });

  readonly streak = computed(() => {
    this.storage.instances();
    return this.storage.getStreak();
  });

  readonly timeBreakdown = computed(() => {
    this.storage.instances();
    this.storage.activities();
    const start = this.weekDates[0];
    const end = this.weekDates[6];
    return this.storage.getTimeBreakdown(start, end);
  });

  // Added this so you don't use Object.keys() in dashboard.html
  readonly hasBreakdown = computed(() => {
    return Object.keys(this.timeBreakdown() || {}).length > 0;
  });

  readonly productiveHours = computed(() => {
    this.storage.instances();
    return this.storage.getProductiveHours(this.today);
  });

  readonly productivityPct = computed(() => {
    return Math.min(100, Math.round((this.productiveHours() / 18) * 100));
  });

  readonly bestWorstDay = computed(() => {
    const data = this.weeklyData();
    if (data.length === 0) return { best: null, worst: null };

    let best = data[0];
    let worst = data[0];
    for (const d of data) {
      if (d.pct > best.pct) best = d;
      if (d.pct < worst.pct) worst = d;
    }
    return {
      best: { ...best, dayName: this.getDayName(best.date) },
      worst: { ...worst, dayName: this.getDayName(worst.date) },
    };
  });

  readonly heatmapCells = computed<HeatmapCell[]>(() => {
    this.storage.instances();
    const cells: HeatmapCell[] = [];
    for (const dateStr of this.monthDates) {
      const d = new Date(dateStr + 'T00:00:00');
      cells.push({
        date: dateStr,
        day: d.getDate(),
        pct: this.storage.getCompletionForDate(dateStr),
        label: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      });
    }
    return cells;
  });

  readonly unproductiveMinutes = computed(() => {
    this.storage.activities();
    const start = this.weekDates[0];
    const end = this.weekDates[6];
    const activities = this.storage.getActivitiesForDateRange(start, end);
    return activities
      .filter((a) => a.category === 'unproductive')
      .reduce((sum, a) => sum + a.duration, 0);
  });

  readonly entertainmentMinutes = computed(() => {
    this.storage.activities();
    const start = this.weekDates[0];
    const end = this.weekDates[6];
    const activities = this.storage.getActivitiesForDateRange(start, end);
    return activities
      .filter((a) => a.category === 'entertainment')
      .reduce((sum, a) => sum + a.duration, 0);
  });

  readonly scoreColor = computed(() => {
    const pct = this.todayCompletion();
    if (pct >= 80) return '#00b894';
    if (pct >= 50) return '#fdcb6e';
    return '#e17055';
  });

  readonly currentMonthName = computed(() => {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  constructor() {
    afterNextRender(() => {
      // Generate instances for the date ranges we need
      const monthStart = this.monthDates[0];
      const monthEnd = this.monthDates[this.monthDates.length - 1];
      this.storage.generateInstancesForDateRange(this.weekDates[0], this.weekDates[6]);
      this.storage.generateInstancesForDateRange(monthStart, monthEnd);

      // Set Chart.js theme defaults
      Chart.defaults.color = '#8a8a9a';
      Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';

      this.createDonutChart();
      this.createBarChart();
      this.createPieChart();
      this.animateCounters();
    });
  }

  // ===========================
  // DATE HELPERS
  // ===========================
  private computeLastSevenDays(): string[] {
    const dates: string[] = [];
    const d = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(d);
      day.setDate(d.getDate() - i);
      dates.push(this.storage.formatDate(day));
    }
    return dates;
  }

  private computeMonthDates(): string[] {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(this.storage.formatDate(new Date(year, month, day)));
    }
    return dates;
  }

  getDayName(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }

  getDayAbbr(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }

  formatMinutes(mins: number): string {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // ===========================
  // HEATMAP
  // ===========================
  getHeatmapColor(pct: number): string {
    if (pct === 0) return 'rgba(108, 92, 231, 0.06)';
    if (pct < 25) return 'rgba(108, 92, 231, 0.15)';
    if (pct < 50) return 'rgba(108, 92, 231, 0.3)';
    if (pct < 75) return 'rgba(108, 92, 231, 0.5)';
    if (pct < 100) return 'rgba(108, 92, 231, 0.7)';
    return 'rgba(108, 92, 231, 0.95)';
  }

  // Fixed signature to handle both touch and mouse events
  showTooltip(event: MouseEvent | TouchEvent, cell: HeatmapCell): void {
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in event) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    // You may need to adjust this calculation based on your layout
    this.tooltipX.set(clientX); 
    this.tooltipY.set(clientY - 30);
    this.tooltipText.set(`${cell.label}: ${cell.pct}%`);
    this.tooltipVisible.set(true);
  }

  hideTooltip(): void {
    this.tooltipVisible.set(false);
  }

  // ===========================
  // ANIMATED COUNTERS
  // ===========================
  private animateCounters(): void {
    this.animateValue(this.animatedScore, this.todayCompletion(), 1200);
    this.animateValue(this.animatedStreak, this.streak(), 800);
    this.animateValue(this.animatedProductivity, this.productivityPct(), 1000);
  }

  private animateValue(sig: ReturnType<typeof signal<number>>, target: number, duration: number): void {
    const start = 0;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      sig.set(Math.round(start + (target - start) * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  // ===========================
  // CHART.JS — DONUT
  // ===========================
  private createDonutChart(): void {
    const canvas = this.donutCanvas()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pct = this.todayCompletion();
    const color = this.scoreColor();

    this.donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Remaining'],
        datasets: [{
          data: [pct, 100 - pct],
          backgroundColor: [color, 'rgba(255,255,255,0.05)'],
          borderWidth: 0,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        animation: {
          animateRotate: true,
          duration: 1500,
        },
      },
    });
  }

  // ===========================
  // CHART.JS — BAR
  // ===========================
  private createBarChart(): void {
    const canvas = this.barCanvas()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = this.weeklyData();
    const labels = data.map(d => this.getDayAbbr(d.date));
    const values = data.map(d => d.pct);

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, '#6c5ce7');
    gradient.addColorStop(1, '#00cec9');

    this.barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: gradient,
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.6,
          categoryPercentage: 0.7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: {
              color: 'rgba(255,255,255,0.04)',
            },
            ticks: {
              // Explicitly typed 'val'
              callback: (val: string | number) => val + '%',
              stepSize: 25,
              font: { size: 11 },
            },
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(18,18,42,0.95)',
            titleFont: { size: 12 },
            bodyFont: { size: 13 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              // Explicitly typed 'ctx'
              label: (ctx: any) => `${ctx.parsed.y}% completed`,
            },
          },
        },
        animation: {
          duration: 1200,
          easing: 'easeOutQuart',
        },
      },
    });
  }

  // ===========================
  // CHART.JS — PIE
  // ===========================
  private createPieChart(): void {
    const canvas = this.pieCanvas()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const breakdown = this.timeBreakdown();
    const categories = Object.keys(breakdown);
    const values = Object.values(breakdown);

    if (categories.length === 0) {
      // No data — show placeholder
      return;
    }

    const colors = categories.map(
      cat => (CATEGORY_COLORS as Record<string, string>)[cat] || '#a29bfe'
    );
    const labels = categories.map(
      cat => (CATEGORY_LABELS as Record<string, string>)[cat] || cat
    );

    this.pieChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: 'rgba(10,10,26,0.8)',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 16,
              usePointStyle: true,
              pointStyleWidth: 10,
              font: { size: 11 },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(18,18,42,0.95)',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              // Explicitly typed 'ctx'
              label: (ctx: any) => {
                const mins = ctx.parsed as number;
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return ` ${ctx.label}: ${h > 0 ? h + 'h ' : ''}${m}m`;
              },
            },
          },
        },
        animation: {
          animateRotate: true,
          duration: 1200,
        },
      },
    });
  }

  // Circumference helper for the productivity gauge
  readonly gaugeCircumference = 2 * Math.PI * 54; // r=54
}