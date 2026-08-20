import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { SITE } from '../generated/site-config';
import type { ThemeMode } from './models';

const STORAGE_KEY = 'feastdocs:theme';
const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

/**
 * Owns the light/dark decision. `mode` is what the reader chose, `resolved` is
 * what is actually painted — they differ only while the mode is 'system'.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly systemPrefersDark = signal(false);

  readonly mode = signal<ThemeMode>(this.readStoredMode());
  readonly resolved = computed<'light' | 'dark'>(() => {
    const mode = this.mode();
    if (mode === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return mode;
  });

  constructor() {
    const media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (media) {
      this.systemPrefersDark.set(media.matches);
      media.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));
    }

    const root = this.document.documentElement;
    root.style.setProperty('--fd-accent-light', SITE.theme.accent);
    root.style.setProperty('--fd-accent-dark', SITE.theme.accentDark);

    effect(() => {
      root.dataset['theme'] = this.resolved();
      root.style.colorScheme = this.resolved();
    });
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Private browsing or a blocked storage partition — the choice just
      // won't survive a reload, which is not worth failing over.
    }
  }

  /**
   * Flips between light and dark from whatever is currently painted. A click
   * always produces a visible change — a three-state cycle through 'system'
   * reads as a broken button whenever system already matches the next mode.
   */
  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  private readStoredMode(): ThemeMode {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      if (stored && (MODES as readonly string[]).includes(stored)) return stored as ThemeMode;
    } catch {
      // Fall through to the configured default.
    }
    return SITE.theme.defaultMode;
  }
}
