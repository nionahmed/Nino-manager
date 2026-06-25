import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  password = signal('');
  showPassword = signal(false);
  errorMessage = signal('');
  isLoading = signal(false);
  shakeError = signal(false);

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/calendar']);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  onPasswordInput(value: string): void {
    this.password.set(value);
    if (this.errorMessage()) {
      this.errorMessage.set('');
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.login();
    }
  }

  async login(): Promise<void> {
    const pw = this.password().trim();
    if (!pw) {
      this.triggerError('Please enter a password');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const success = await this.auth.login(pw);
      if (success) {
        this.router.navigate(['/calendar']);
      } else {
        this.triggerError('Incorrect password. Try again.');
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
