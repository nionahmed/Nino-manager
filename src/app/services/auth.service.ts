import { Injectable, signal, PLATFORM_ID, inject, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth } from '../firebase.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly zone = inject(NgZone);

  readonly isAuthenticated = signal(false);
  readonly user = signal<User | null>(null);
  readonly isLoading = signal(true);

  constructor() {
    if (this.isBrowser) {
      onAuthStateChanged(auth, (user) => {
        this.zone.run(() => {
          this.user.set(user);
          this.isAuthenticated.set(!!user);
          this.isLoading.set(false);
        });
      });
    } else {
      this.isLoading.set(false);
    }
  }

  async loginWithGoogle(): Promise<boolean> {
    if (!this.isBrowser) return false;
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      return true;
    } catch (error: any) {
      console.error('Google sign-in failed:', error);
      return false;
    }
  }

  async logout(): Promise<void> {
    if (!this.isBrowser) return;
    await signOut(auth);
  }

  /** Get the current user's UID, or null if not logged in */
  getUid(): string | null {
    return this.user()?.uid ?? null;
  }
}
