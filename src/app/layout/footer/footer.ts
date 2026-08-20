import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content.service';

/**
 * Site footer: the configured text and links, plus a link to the source
 * repository when one is configured — the place readers look for "where does
 * this come from, can I have it too".
 */
@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  private readonly content = inject(ContentService);
  protected readonly site = this.content.site;

  /** Derived from github.repo, so a repo link needs no extra configuration. */
  protected readonly repoUrl =
    this.site.github.repo === null ? null : `https://github.com/${this.site.github.repo}`;

  protected readonly year = new Date().getFullYear();
}
