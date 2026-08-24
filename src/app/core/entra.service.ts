import { Injectable, computed, signal } from '@angular/core';
import {
  BrowserAuthError,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
} from '@azure/msal-browser';
import { SITE } from '../generated/site-config';

/**
 * Microsoft Entra ID sign-in, for editing an Azure DevOps-hosted site from the
 * browser.
 *
 * Two scopes, requested at different times. Signing in asks only for identity;
 * the Azure DevOps scope is acquired when something is about to be published, so
 * a reader who never edits is never asked to consent to repository access.
 *
 * The token belongs to the person at the keyboard, and it is their token that
 * writes — so a commit carries their name and the site holds no shared
 * credential. Nothing here is secret: a public client has no secret to keep,
 * which is why both configuration values are safe to commit.
 *
 * No backend is involved. Azure DevOps answers a CORS preflight with
 * `Access-Control-Allow-Origin: *` and permits the `authorization` header, so the
 * page calls the REST API directly.
 */
@Injectable({ providedIn: 'root' })
export class EntraService {
  private readonly config = SITE.entra;

  /** Sign-in is offered only once an app registration exists for this origin. */
  readonly isConfigured = this.config.clientId !== null && this.config.tenantId !== null;

  private readonly account = signal<AccountInfo | null>(null);
  private client: PublicClientApplication | null = null;
  private initialising: Promise<void> | null = null;

  readonly signedIn = computed(() => this.account() !== null);
  readonly displayName = computed(() => this.account()?.name ?? this.account()?.username ?? null);
  readonly email = computed(() => this.account()?.username ?? null);

  /** Identity only. The Azure DevOps scope is asked for when it is needed. */
  private readonly loginScopes = ['openid', 'profile', 'email'];

  private msalConfig(): Configuration {
    return {
      auth: {
        clientId: this.config.clientId!,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
        // The editor route, not the bare origin, and for a structural reason:
        // MSAL only processes a redirect where it is initialised, and it is
        // initialised by the editor — which is lazy, so that MSAL stays out of
        // every reader's initial bundle. Returning to `/` would land on a page
        // that never calls handleRedirectPromise, leaving the sign-in half-done
        // with a code stranded in the URL. Register this exact path in Entra.
        redirectUri: `${window.location.origin}/_editor`,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    };
  }

  /**
   * MSAL has to be initialised before anything else, and exactly once — a second
   * `initialize()` throws. It also has to handle the redirect response, which is
   * how an account arrives after coming back from the sign-in page.
   */
  async ready(): Promise<boolean> {
    if (!this.isConfigured) return false;
    this.initialising ??= (async () => {
      const client = new PublicClientApplication(this.msalConfig());
      await client.initialize();
      const redirect = await client.handleRedirectPromise();
      this.client = client;
      const account = redirect?.account ?? client.getAllAccounts()[0] ?? null;
      if (account) {
        client.setActiveAccount(account);
        this.account.set(account);
      }
    })();
    await this.initialising;
    return true;
  }

  async signIn(): Promise<void> {
    if (!(await this.ready()) || !this.client) return;
    // Redirect rather than popup: popups are blocked often enough that the
    // failure looks like the button not working.
    await this.client.loginRedirect({ scopes: this.loginScopes });
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    const account = this.account();
    this.account.set(null);
    await this.client.logoutRedirect({ account: account ?? undefined });
  }

  /**
   * An access token for the Azure DevOps resource, for calls that write.
   *
   * Silent first; a consent or MFA prompt is the one case that legitimately needs
   * the user back, and `InteractionRequiredAuthError` is how MSAL says so.
   */
  async devOpsToken(): Promise<string | null> {
    if (!(await this.ready()) || !this.client) return null;
    const scope = this.config.devOpsScope;
    if (!scope) return null;
    const account = this.account();
    if (!account) return null;

    try {
      const result = await this.client.acquireTokenSilent({ scopes: [scope], account });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError || error instanceof BrowserAuthError) {
        await this.client.acquireTokenRedirect({ scopes: [scope], account });
        return null;
      }
      throw error;
    }
  }
}
