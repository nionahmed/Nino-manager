import { Component, signal, computed, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs';
import { TaskEditorComponent } from './components/task-editor/task-editor';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, TaskEditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly title = signal('Nino Manager');
  protected readonly isDark = signal(true);
  protected readonly showNav = computed(() => this.auth.isAuthenticated());
  protected readonly currentRoute = signal('');
  protected readonly showTaskEditor = signal(false);

  readonly navItems = [
    { path: '/calendar', icon: 'calendar_today', label: 'Calendar' },
    { path: '/tasks', icon: 'checklist', label: 'Tasks' },
    { path: '', icon: 'add_circle', label: 'Add', isAdd: true },
    { path: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { path: '/log', icon: 'history', label: 'Log' },
  ];

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Load theme preference
      const saved = localStorage.getItem('nino_theme');
      if (saved) {
        this.isDark.set(saved === 'dark');
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.isDark.set(prefersDark);
      }
      this.applyTheme();

      // Watch system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('nino_theme')) {
          this.isDark.set(e.matches);
          this.applyTheme();
        }
      });
    }

    // Track current route
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentRoute.set(e.urlAfterRedirects);
      });
  }

  toggleTheme(): void {
    this.isDark.set(!this.isDark());
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('nino_theme', this.isDark() ? 'dark' : 'light');
    }
    this.applyTheme();
  }

  private applyTheme(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.setAttribute('data-theme', this.isDark() ? 'dark' : 'light');
    }
  }

  openTaskEditor(): void {
    this.showTaskEditor.set(true);
  }

  closeTaskEditor(): void {
    this.showTaskEditor.set(false);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  onNavClick(item: { path: string; isAdd?: boolean }): void {
    if (item.isAdd) {
      this.openTaskEditor();
    }
  }
}
