import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  errorMessage = signal('');
  isLoading = signal(false);
  shakeError = signal(false);

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/calendar']);
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const success = await this.auth.loginWithGoogle();
      if (success) {
        this.router.navigate(['/calendar']);
      } else {
        this.triggerError('Sign-in was cancelled or failed. Please try again.');
      }
    } catch {
      this.triggerError('Something went wrong. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private triggerError(message: string): void {
    this.errorMessage.set(message);
    this.shakeError.set(true);
    setTimeout(() => this.shakeError.set(false), 600);
  }
}
