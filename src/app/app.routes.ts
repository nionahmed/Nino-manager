import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'calendar',
    loadComponent: () => import('./pages/calendar/calendar').then((m) => m.CalendarComponent),
    canActivate: [authGuard],
  },
  {
    path: 'tasks',
    loadComponent: () => import('./pages/task-list/task-list').then((m) => m.TaskListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'log',
    loadComponent: () => import('./pages/activity-log/activity-log').then((m) => m.ActivityLogComponent),
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'calendar',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'calendar',
  },
];
