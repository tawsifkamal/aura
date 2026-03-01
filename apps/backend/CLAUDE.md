# Aura Backend

Cloudflare Worker running Hono + chanfana (OpenAPI). Deployed at `https://aura-backend.poppets-grungy03.workers.dev`.

## Base URL

```
Production: https://aura-backend.poppets-grungy03.workers.dev
Local dev:  http://localhost:8787  (via `npx wrangler dev`)
```

OpenAPI docs are served at `/` (the root).

## Auth Flow

GitHub OAuth with signed session cookies. The flow gives you the user's GitHub profile and a list of repositories they have access to.

### Scopes granted

`repo` `read:user` `user:email`

### Endpoints

#### 1. Start OAuth — `GET /api/auth/github`

Redirects the user to GitHub's authorization page.

```
GET /api/auth/github
```

The user authorizes the app on GitHub, then GitHub redirects back to the callback URL.

**To get the URL as JSON instead of a redirect** (useful for SPAs):

```
GET /api/auth/github?redirect=false
```

Response:
```json
{
  "authorization_url": "https://github.com/login/oauth/authorize?client_id=...&scope=repo+read%3Auser+user%3Aemail&state=...",
  "state": "a-uuid"
}
```

#### 2. OAuth Callback — `GET /api/auth/callback/github`

GitHub redirects here after the user authorizes. This endpoint:

1. Exchanges the `code` for a GitHub access token
2. Fetches the user's GitHub profile (`/user`) and repositories (`/user/repos`)
3. Calls the `storeCredentials()` placeholder (wire up your storage here)
4. Sets a signed `aura_session` cookie
5. Returns user info and repo list as JSON

**Optional query param:** `redirect_to` — after auth, redirects to this URL instead of returning JSON. Must match an allowed origin.

```
GET /api/auth/callback/github?code=xxx&state=yyy&redirect_to=http://localhost:3000/dashboard
```

JSON response (when no redirect_to):
```json
{
  "success": true,
  "user": {
    "id": 12345,
    "login": "octocat",
    "email": "octocat@github.com",
    "name": "The Octocat",
    "avatar_url": "https://avatars.githubusercontent.com/u/12345"
  },
  "repositories": [
    {
      "id": 67890,
      "full_name": "octocat/hello-world",
      "name": "hello-world",
      "owner": "octocat",
      "private": false,
      "html_url": "https://github.com/octocat/hello-world",
      "default_branch": "main"
    }
  ],
  "scopes": "repo,read:user,user:email"
}
```

#### 3. Get Session — `GET /api/auth/session`

Returns the current user's session from the signed cookie. No access token is exposed.

```
GET /api/auth/session
```

Authenticated response:
```json
{
  "authenticated": true,
  "session": {
    "github_user_id": 12345,
    "github_login": "octocat",
    "name": "The Octocat",
    "email": "octocat@github.com",
    "avatar_url": "https://avatars.githubusercontent.com/u/12345",
    "scopes": "repo,read:user,user:email",
    "connected_at": "2026-03-01T00:01:15.000Z"
  }
}
```

Unauthenticated response:
```json
{
  "authenticated": false,
  "session": null
}
```

#### 4. Logout — `POST /api/auth/logout`

Clears the session cookie.

```
POST /api/auth/logout
```

Response:
```json
{
  "success": true
}
```

### Using the session from a frontend

All requests must include `credentials: "include"` so the browser sends the cookie cross-origin.

```ts
// Check if user is logged in
const res = await fetch("https://aura-backend.poppets-grungy03.workers.dev/api/auth/session", {
  credentials: "include",
});
const { authenticated, session } = await res.json();

// Log out
await fetch("https://aura-backend.poppets-grungy03.workers.dev/api/auth/logout", {
  method: "POST",
  credentials: "include",
});
```

To start the login flow from an SPA, either:
- **Redirect:** `window.location.href = "/api/auth/github"` — user lands on GitHub, then comes back to the callback.
- **Programmatic:** Fetch `/api/auth/github?redirect=false`, get the `authorization_url`, open it in a popup or redirect.

### Cookie details

| Property   | Value                                      |
|------------|--------------------------------------------|
| Name       | `aura_session`                             |
| Format     | `base64(json_payload).hmac_sha256_hex`     |
| Signed     | Yes — HMAC-SHA256 with `COOKIE_SECRET` env var |
| HttpOnly   | `true` (not readable by client JS)         |
| Secure     | `true`                                     |
| SameSite   | `None` (allows cross-origin)               |
| Max-Age    | 30 days                                    |
| Path       | `/`                                        |

The cookie payload contains: `github_user_id`, `github_login`, `name`, `email`, `avatar_url`, `access_token`, `scopes`, `connected_at`. The `/api/auth/session` endpoint strips `access_token` before returning.

### CORS

Credentials-aware CORS is enabled. Allowed origins are defined in `src/types.ts`:

```ts
export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://aura-backend.poppets-grungy03.workers.dev",
];
```

To add a new origin (e.g. a production frontend), add it to this array and redeploy.

## Credential storage placeholder

In `src/endpoints/githubCallback.ts`, the `storeCredentials()` function is a placeholder that logs to console. It receives:

```ts
{
  github_user_id: number;
  github_login: string;
  access_token: string;
  scopes: string;
  repositories: {
    id: number;
    full_name: string;
    name: string;
    owner: string;
    private: boolean;
    html_url: string;
    default_branch: string;
  }[];
  connected_at: string;
}
```

Replace the function body with your actual storage logic (Convex, D1, KV, etc).

## Environment variables

All secrets are stored as Cloudflare Worker secrets (via `wrangler secret put`) and locally in `.dev.vars` / `.env`:

| Variable              | Description                        |
|-----------------------|------------------------------------|
| `GITHUB_CLIENT_ID`    | GitHub OAuth App client ID         |
| `GITHUB_CLIENT_SECRET`| GitHub OAuth App client secret     |
| `GITHUB_REDIRECT_URI` | Callback URL registered with GitHub|
| `COOKIE_SECRET`       | HMAC-SHA256 key for signing cookies|

## Commands

| Command              | Purpose                      |
|----------------------|------------------------------|
| `npx wrangler dev`   | Local development            |
| `npx wrangler deploy`| Deploy to Cloudflare         |
| `npx wrangler tail`  | Tail live production logs    |
| `npx wrangler types` | Regenerate TypeScript types  |
| `npx tsc --noEmit`   | Typecheck                    |

## File structure

```
src/
  index.ts              — Hono app, CORS middleware, route registration
  types.ts              — AppContext type, Env interface, ALLOWED_ORIGINS
  cookie.ts             — signSession() / verifySession() using HMAC-SHA256
  endpoints/
    githubAuth.ts       — GET /api/auth/github (start OAuth)
    githubCallback.ts   — GET /api/auth/callback/github (handle callback)
    sessionInfo.ts      — GET /api/auth/session (read cookie)
    logout.ts           — POST /api/auth/logout (clear cookie)
```

## Gotchas

- Cloudflare Workers do not send a `User-Agent` header by default. GitHub API returns 403 without one. All GitHub fetch calls must include `"User-Agent": "aura-backend"`.
- The cookie uses `SameSite=None; Secure` for cross-origin access. This means it only works over HTTPS (localhost is treated as a secure context by browsers).
- GitHub OAuth codes are single-use and expire in 10 minutes.
