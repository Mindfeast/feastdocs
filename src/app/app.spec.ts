import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { SearchService } from './core/search.service';
import { routes } from './app.routes';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient()],
    }).compileComponents();
  });

  it('renders the navbar, sidebar and a skip link', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-navbar')).toBeTruthy();
    expect(host.querySelector('app-sidebar')).toBeTruthy();
    expect(host.querySelector('.fd-skip-link')?.textContent).toContain('Skip to content');
  });

  it('focuses the inline search on Ctrl+K', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const search = TestBed.inject(SearchService);
    const input = fixture.nativeElement.querySelector('.fd-search__input') as HTMLInputElement;

    expect(input).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(search.isOpen()).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('ignores the `/` shortcut while the reader is typing in a field', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const search = TestBed.inject(SearchService);

    const field = document.createElement('input');
    document.body.appendChild(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(search.isOpen()).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    expect(search.isOpen()).toBe(true);

    field.remove();
  });
});
