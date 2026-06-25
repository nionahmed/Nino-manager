import { Component, signal, computed, inject, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-focus-timer',
  templateUrl: './focus-timer.html',
  styleUrl: './focus-timer.scss',
})
export class FocusTimerComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  readonly isRunning = signal(false);
  readonly isPaused = signal(false);
  readonly isBreak = signal(false);
  readonly isMinimized = signal(false);

  readonly workDuration = signal(25); // minutes
  readonly breakDuration = signal(5);
  readonly remainingSeconds = signal(25 * 60);
  readonly totalSeconds = signal(25 * 60);

  readonly progress = computed(() => {
    const total = this.totalSeconds();
    const remaining = this.remainingSeconds();
    return total > 0 ? ((total - remaining) / total) * 100 : 0;
  });

  readonly displayTime = computed(() => {
    const total = this.remainingSeconds();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  readonly circumference = 2 * Math.PI * 54; // radius = 54

  readonly strokeDashoffset = computed(() => {
    return this.circumference * (1 - this.progress() / 100);
  });

  start(): void {
    if (this.isRunning() && !this.isPaused()) return;

    if (!this.isRunning()) {
      const duration = this.isBreak() ? this.breakDuration() : this.workDuration();
      this.remainingSeconds.set(duration * 60);
      this.totalSeconds.set(duration * 60);
    }

    this.isRunning.set(true);
    this.isPaused.set(false);

    this.intervalId = setInterval(() => {
      const remaining = this.remainingSeconds();
      if (remaining <= 0) {
        this.complete();
        return;
      }
      this.remainingSeconds.set(remaining - 1);
    }, 1000);
  }

  pause(): void {
    this.isPaused.set(true);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset(): void {
    this.isRunning.set(false);
    this.isPaused.set(false);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    const duration = this.isBreak() ? this.breakDuration() : this.workDuration();
    this.remainingSeconds.set(duration * 60);
    this.totalSeconds.set(duration * 60);
  }

  private complete(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning.set(false);
    this.isPaused.set(false);

    // Play notification sound
    if (isPlatformBrowser(this.platformId)) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = this.isBreak() ? 523 : 440;
        osc.type = 'sine';
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        // Audio not available
      }
    }

    // Toggle between work and break
    this.isBreak.set(!this.isBreak());
    const duration = this.isBreak() ? this.breakDuration() : this.workDuration();
    this.remainingSeconds.set(duration * 60);
    this.totalSeconds.set(duration * 60);
  }

  toggleMinimize(): void {
    this.isMinimized.set(!this.isMinimized());
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}
