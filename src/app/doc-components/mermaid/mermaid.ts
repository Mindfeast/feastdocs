import {
  Component,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ThemeService } from '../../core/theme.service';

/** One id per diagram on the page; mermaid requires unique ids. */
let counter = 0;

/**
 * Renders a Mermaid diagram:
 *
 *   ```mermaid
 *   graph TD; A-->B;
 *   ```
 *
 * The fenced block is turned into `<fd-mermaid>` by both renderers, so a
 * project migrating from another docs tool keeps its diagrams unchanged.
 *
 * Mermaid is ~500kB and is therefore imported lazily, on the first diagram
 * that appears — a page without one never downloads it. The source stays in
 * the DOM until rendering succeeds, so crawlers and readers without
 * JavaScript still get the diagram's content as text, and a diagram with a
 * syntax error shows its source and the error rather than vanishing.
 */
@Component({
  selector: 'fd-mermaid-internal',
  template: '<ng-content />',
  styleUrl: './mermaid.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocMermaid {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly theme = inject(ThemeService);

  /** Captured before the first render replaces it. */
  private source = '';
  private readonly id = `fd-mermaid-${(counter += 1)}`;
  protected readonly failed = signal(false);

  constructor() {
    afterNextRender(() => {
      this.source = (this.host.querySelector('.fd-mermaid__source')?.textContent ?? '').trim();
      void this.draw();
    });

    // Mermaid bakes colours into the SVG, so a theme switch needs a re-render
    // rather than a restyle.
    effect(() => {
      this.theme.resolved();
      if (this.source) void this.draw();
    });
  }

  /** Mermaid renders into a temporary `d{id}` node on <body>; clear it. */
  private removeStrays(id: string): void {
    for (const candidate of [`d${id}`, id]) {
      const stray = document.getElementById(candidate);
      if (stray && !this.host.contains(stray)) stray.remove();
    }
  }

  private async draw(): Promise<void> {
    const dark = this.theme.resolved() === 'dark';
    const id = `${this.id}-${dark ? 'd' : 'l'}`;

    try {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'default',
        fontFamily: 'inherit',
        // On a parse failure mermaid otherwise appends its own "Syntax error in
        // text" graphic to <body>, outside this component and below the page
        // footer. This component reports the failure in place instead.
        // Undeclared in the shipped types, but honoured by the runtime.
        suppressErrorRendering: true,
      } as Parameters<typeof mermaid.initialize>[0]);

      const { svg } = await mermaid.render(id, this.source);
      this.host.innerHTML = `<div class="fd-mermaid__figure">${svg}</div>`;
      this.failed.set(false);
    } catch (error) {
      // A broken diagram must not take the page with it: keep the source
      // visible and say what mermaid objected to.
      const message = error instanceof Error ? error.message : String(error);
      // Belt and braces: older mermaid builds ignore suppressErrorRendering and
      // leave a detached container behind.
      this.removeStrays(id);
      this.host.innerHTML =
        `<div class="fd-mermaid__error"><p>This diagram could not be rendered.</p>` +
        `<p class="fd-mermaid__reason"></p>` +
        `<pre class="fd-mermaid__source"></pre></div>`;
      const reason = this.host.querySelector('.fd-mermaid__reason');
      const source = this.host.querySelector('.fd-mermaid__source');
      // textContent, never innerHTML: the message can echo the diagram source.
      if (reason) reason.textContent = message;
      if (source) source.textContent = this.source;
      this.failed.set(true);
    }
  }
}
