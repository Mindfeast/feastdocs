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

  /**
   * sourceRepo when set, otherwise github.repo — so a repo link needs no extra
   * configuration, but a site can point people at the code to clone when that
   * is a different repository from the one it is built from.
   */
  protected readonly repoUrl = (() => {
    const repo = this.site.sourceRepo ?? this.site.github.repo;
    return repo === null ? null : `https://github.com/${repo}`;
  })();

  protected readonly year = new Date().getFullYear();
}
