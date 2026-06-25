import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-theme-toggle',
  template: `
    <button class="theme-toggle" (click)="toggle.emit()" [attr.aria-label]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
      <span class="toggle-icon material-icons">{{ isDark() ? 'light_mode' : 'dark_mode' }}</span>
    </button>
  `,
  styles: `
    @use '../../styles/variables' as *;

    .theme-toggle {
      @include touch-target;
      border-radius: $radius-full;
      transition: all $transition-fast;
      cursor: pointer;
      background: var(--color-card);
      border: 1px solid var(--color-border);
      color: var(--color-text);

      &:hover {
        background: var(--color-card-hover);
        transform: rotate(30deg);
      }

      &:active {
        transform: scale(0.9);
      }
    }

    .toggle-icon {
      font-size: 20px;
      transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  `,
})
export class ThemeToggleComponent {
  readonly isDark = input<boolean>(true);
  readonly toggle = output<void>();
}
