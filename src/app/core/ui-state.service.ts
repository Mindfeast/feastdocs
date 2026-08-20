import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

const COLLAPSE_KEY = 'feastdocs:sidebar-hidden';
const EDITOR_SEEN_KEY = 'feastdocs:editor-seen';
const MOBILE_QUERY = '(max-width: 996px)';

/** Small pieces of chrome state that more than one component needs to read. */
@Injectable({ providedIn: 'root' })
export class UiStateService {
  private readonly document = inject(DOCUMENT);

  /** Mobile drawer: slides over the content, closed on navigation. */
  readonly sidebarOpen = signal(false);

  /** Desktop: the docked sidebar can be collapsed to give content full width. */
  readonly sidebarCollapsed = signal(this.readCollapsed());

  /**
   * Whether this reader has opened the content manager before. Until they
   * have, the navbar invites them in with a "Try it now" label; afterwards it
   * goes back to a plain icon, so the nudge teaches newcomers without
   * pestering people who already use it.
   */
  readonly editorVisited = signal(this.readEditorVisited());

  markEditorVisited(): void {
    if (this.editorVisited()) return;
    this.editorVisited.set(true);
    try {
      this.document.defaultView?.localStorage.setItem(EDITOR_SEEN_KEY, 'true');
    } catch {
      // Without storage the hint simply reappears next visit.
    }
  }

  /**
   * What the hamburger does depends on the viewport: open the drawer on
   * mobile, collapse/expand the docked sidebar on desktop.
   */
  toggleSidebar(): void {
    const isMobile = this.document.defaultView?.matchMedia(MOBILE_QUERY).matches ?? false;
    if (isMobile) {
      this.sidebarOpen.update((open) => !open);
      return;
    }
    this.sidebarCollapsed.update((collapsed) => {
      const next = !collapsed;
      try {
        this.document.defaultView?.localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // Not persisting the preference is not worth failing over.
      }
      return next;
    });
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  private readCollapsed(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private readEditorVisited(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(EDITOR_SEEN_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
