import {
  Component,
  ElementRef,
  computed,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { SearchService } from '../../core/search.service';
import type { SearchHit } from '../../core/models';

/**
 * Inline search: an input living in the navbar, with results in a dropdown
 * panel anchored beneath it. No modal — typing searches directly, Escape
 * clears, Ctrl+K focuses it from anywhere.
 */
@Component({
  selector: 'app-search-box',
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class SearchBox {
  protected readonly search = inject(SearchService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  /** Highlighted result. Resets to the top whenever the result set changes. */
  protected readonly activeIndex = linkedSignal<readonly SearchHit[], number>({
    source: this.search.results,
    computation: () => 0,
  });

  protected readonly panelOpen = computed(
    () => this.search.isOpen() && this.search.query().trim().length > 0,
  );

  protected readonly shortcutHint = computed(() =>
    typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform)
      ? '⌘K'
      : 'Ctrl K',
  );

  protected onFocus(): void {
    this.search.open(); // also warms the index
  }

  protected onInput(value: string): void {
    this.search.query.set(value);
    if (!this.search.isOpen()) this.search.open();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.search.isOpen.set(false);
    }
  }

  protected onGlobalKeydown(event: KeyboardEvent): void {
    const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    if (isShortcut || (event.key === '/' && !isTypingTarget(event.target))) {
      event.preventDefault();
      this.field().nativeElement.focus();
      this.field().nativeElement.select();
      this.search.open();
    }
  }

  protected onFieldKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.search.close();
        this.field().nativeElement.blur();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Enter': {
        const hit = this.search.results()[this.activeIndex()];
        if (hit) {
          event.preventDefault();
          this.go(hit);
        }
        break;
      }
      default:
        break;
    }
  }

  protected go(hit: SearchHit): void {
    this.search.close();
    this.field().nativeElement.blur();
    void this.router.navigate(['/' + hit.slug], { fragment: hit.anchor || undefined });
  }

  private move(delta: number): void {
    const total = this.search.results().length;
    if (total === 0) return;
    this.activeIndex.set((this.activeIndex() + delta + total) % total);
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
