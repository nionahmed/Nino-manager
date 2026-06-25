import { Injectable, signal } from '@angular/core';

/**
 * Lightweight service to communicate "open task editor for editing" from
 * any page to the app-level task editor modal.
 */
@Injectable({ providedIn: 'root' })
export class TaskEditorService {
  readonly isOpen = signal(false);
  readonly editingTaskId = signal<string | undefined>(undefined);

  /** Open editor for a new task */
  openNew(): void {
    this.editingTaskId.set(undefined);
    this.isOpen.set(true);
  }

  /** Open editor to edit an existing task */
  openEdit(taskId: string): void {
    this.editingTaskId.set(taskId);
    this.isOpen.set(true);
  }

  /** Close the editor */
  close(): void {
    this.isOpen.set(false);
    this.editingTaskId.set(undefined);
  }
}
