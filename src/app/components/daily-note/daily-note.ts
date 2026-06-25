import { Component, inject, signal, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';

@Component({
  selector: 'app-daily-note',
  imports: [FormsModule],
  templateUrl: './daily-note.html',
  styleUrl: './daily-note.scss',
})
export class DailyNoteComponent {
  private readonly storage = inject(StorageService);

  readonly date = input<string>(this.storage.today());
  readonly isEditing = signal(false);
  readonly noteText = signal('');

  get currentNote(): string {
    return this.storage.getNote(this.date());
  }

  startEdit(): void {
    this.noteText.set(this.currentNote);
    this.isEditing.set(true);
  }

  saveNote(): void {
    this.storage.setNote(this.date(), this.noteText());
    this.isEditing.set(false);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.saveNote();
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }
}
