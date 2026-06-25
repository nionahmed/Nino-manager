import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';

export interface Nudge {
  taskId: string;
  taskName: string;
  consecutiveMisses: number;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NudgeService {
  private readonly storage = inject(StorageService);

  getNudges(): Nudge[] {
    const nudges: Nudge[] = [];
    const tasks = this.storage.tasks();

    for (const task of tasks) {
      if (task.repeat === 'none' || task.archived) continue;
      const misses = this.storage.getConsecutiveMisses(task.id);
      if (misses >= 3) {
        nudges.push({
          taskId: task.id,
          taskName: task.name,
          consecutiveMisses: misses,
          message: `"${task.name}" has been missed ${misses} times in a row. Consider adjusting the schedule or removing it.`,
        });
      }
    }

    return nudges;
  }

  hasNudge(taskId: string): boolean {
    const misses = this.storage.getConsecutiveMisses(taskId);
    return misses >= 3;
  }
}
