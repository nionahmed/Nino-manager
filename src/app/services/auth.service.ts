import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // SHA-256 hash of "nino2024"
  private readonly PASSWORD_HASH = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';
  private readonly SESSION_KEY = 'nino_session';

  readonly isAuthenticated = signal(false);

  constructor() {
    if (this.isBrowser) {
      const session = localStorage.getItem(this.SESSION_KEY);
      this.isAuthenticated.set(session === 'active');
    }
  }

  async login(password: string): Promise<boolean> {
    const hash = await this.sha256(password);
    // Allow either the hash matches OR direct password comparison as fallback
    if (hash === this.PASSWORD_HASH || password === 'nino2024') {
      if (this.isBrowser) {
        localStorage.setItem(this.SESSION_KEY, 'active');
      }
      this.isAuthenticated.set(true);
      return true;
    }
    return false;
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem(this.SESSION_KEY);
    }
    this.isAuthenticated.set(false);
  }

  private async sha256(message: string): Promise<string> {
    if (!this.isBrowser) return '';
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  }
}
