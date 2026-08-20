/**
 * Cloudflare Pages Function: GitHub OAuth code-for-token exchange.
 *
 * This is the one step of "Sign in with GitHub" that cannot live in the static
 * bundle — it needs the OAuth app's client secret. Deployed automatically by
 * Cloudflare Pages from this folder; configure two environment secrets on the
 * Pages project (Settings → Variables and secrets, type Secret):
 *
 *   GITHUB_CLIENT_ID       the OAuth app's client id (same value as
 *                          `github.oauthClientId` in feastdocs.config.mjs)
 *   GITHUB_CLIENT_SECRET   the OAuth app's client secret — lives only here
 *
 * The browser POSTs { code } after GitHub redirects back to /_editor; the
 * response is { token }. Same-origin only, nothing is stored server-side.
 */
export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    // Names only, never values — this tells the operator which variable the
    // production deployment actually received, ending the guesswork when the
    // dashboard says "saved" but the wrong project/environment was selected.
    const missing = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'].filter((name) => !env[name]);
    return json(
      { error: `OAuth is not configured — missing on this deployment: ${missing.join(', ')}.` },
      501,
    );
  }

  let code;
  try {
    ({ code } = await request.json());
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }
  if (!code || typeof code !== 'string') {
    return json({ error: 'Missing the OAuth code.' }, 400);
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error || !data.access_token) {
    return json({ error: data.error_description || 'GitHub rejected the exchange.' }, 400);
  }

  return json({ token: data.access_token });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
