# Aura Backend

Cloudflare Worker running Hono + chanfana (OpenAPI). Deployed at `https://aura-backend.poppets-grungy03.workers.dev`.

## Base URL

```
Production: https://aura-backend.poppets-grungy03.workers.dev
Local dev:  http://localhost:8787  (via `npx wrangler dev`)
```

OpenAPI docs are served at `/` (the root).

## Auth Flow

GitHub OAuth with signed session cookies. The flow gives you the user's GitHub profile, generates an API key, and stores credentials in Convex.

### Scopes granted

`repo` `read:user` `user:email`

### Endpoints

#### 1. Start OAuth — `GET /api/auth/github`

Redirects the user to GitHub's authorization page.

```
GET /api/auth/github
```

**Optional query params:**
- `redirect_to` — URL to redirect to after OAuth (encoded in the `state` param)
- `redirect=false` — return the URL as JSON instead of redirecting

Response (with `redirect=false`):
```json
{
  "authorization_url": "https://github.com/login/oauth/authorize?client_id=...&scope=repo+read%3Auser+user%3Aemail&state=...",
  "state": "a-uuid"
}
```

#### 2. OAuth Callback — `GET /api/auth/callback/github`

GitHub redirects here after the user authorizes. This endpoint:

1. Exchanges the `code` for a GitHub access token (and refresh token if available)
2. Fetches the user's GitHub profile (`/user`) and repositories (`/user/repos`)
3. Stores the user in Convex via `users:upsert` (access token, refresh token, API key)
4. Generates an API key for new users (format: `aura_<32hex>`)
5. Sets a signed `aura_session` cookie
6. Redirects to `redirect_to` (from state param) or returns JSON

#### 3. Get Session — `GET /api/auth/session`

Returns the current user's session from the signed cookie. No access token is exposed.

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

#### 4. Logout — `POST /api/auth/logout`

Clears the session cookie.

### Using the session from a frontend

All requests must include `credentials: "include"` so the browser sends the cookie cross-origin.

```ts
const res = await fetch("https://aura-backend.poppets-grungy03.workers.dev/api/auth/session", {
  credentials: "include",
});
const { authenticated, session } = await res.json();
```

### Cookie details

| Property   | Value                                      |
|------------|--------------------------------------------|
| Name       | `aura_session`                             |
| Format     | `base64(json_payload).hmac_sha256_hex`     |
| Signed     | Yes — HMAC-SHA256 with `COOKIE_SECRET`     |
| HttpOnly   | `true`                                     |
| Secure     | `true`                                     |
| SameSite   | `None` (allows cross-origin)               |
| Max-Age    | 30 days                                    |
| Path       | `/`                                        |

## Repositories API

Repositories are fetched live from the GitHub API using the user's stored access token. Only repos the user explicitly enables are stored in the Convex database.

### Endpoints

#### List All Repos — `GET /api/repositories`

Fetches the user's repos from GitHub API. Supports search.

**Query params:**
- `q` — optional search filter (case-insensitive, matches name, full_name, or description)

**Response:** Array of repos with an `enabled` boolean indicating whether the repo is enabled in Aura.

```json
[
  {
    "id": 67890,
    "full_name": "octocat/hello-world",
    "name": "hello-world",
    "owner": "octocat",
    "private": false,
    "html_url": "https://github.com/octocat/hello-world",
    "default_branch": "main",
    "description": "My first repository on GitHub!",
    "language": "JavaScript",
    "updated_at": "2026-02-28T12:00:00Z",
    "enabled": true
  }
]
```

#### List Enabled Repos — `GET /api/repositories/enabled`

Returns only repos the user has enabled (status "added" or "synced"), stored in Convex.

#### Enable a Repo — `POST /api/repositories/:githubRepoId/enable`

Enables a repo for Aura tracking. The repo is stored in Convex.

**Body:**
```json
{
  "full_name": "octocat/hello-world",
  "name": "hello-world",
  "owner": "octocat",
  "private": false,
  "html_url": "https://github.com/octocat/hello-world",
  "default_branch": "main"
}
```

#### Disable a Repo — `POST /api/repositories/:githubRepoId/disable`

Removes the repo from Convex entirely.

## Webhooks API

### PR Notification — `POST /api/webhooks/pr`

Called by GitHub Actions when a pull request is opened or updated. Authenticated via API key.

**Headers:**
```
Authorization: Bearer <AURA_API_KEY>
Content-Type: application/json
```

**Body:**
```json
{
  "repository_id": 67890,
  "branch": "feature/my-feature",
  "pr_number": 42,
  "commit_sha": "abc123def456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "PR webhook received",
  "user": "octocat",
  "repository_id": 67890,
  "branch": "feature/my-feature"
}
```

**Authentication:** The API key is generated for each user on first OAuth login. It's stored in the Convex `users` table. Format: `aura_<32hex>`.

### Setting Up the GitHub CI Workflow

To receive PR notifications, users add a GitHub Actions workflow to their repository:

1. Copy `aura-ci.yml` (available at `/public/aura-ci.yml` on the platform) to `.github/workflows/aura-ci.yml` in the target repo
2. Add the user's Aura API key as a repository secret named `AURA_API_KEY`
3. The workflow triggers on `pull_request` events: `opened`, `synchronize`, `reopened`

## Data Endpoints

All data is stored in Convex and accessed via the Convex HTTP API.

### Runs

| Method | Path | Description | Convex Function |
|--------|------|-------------|-----------------|
| GET | `/api/runs` | List runs | `runs:list` |
| GET | `/api/runs/:runId` | Get a run | `runs:get` |
| POST | `/api/runs` | Create a run | `runs:create` |
| PATCH | `/api/runs/:runId/status` | Update run status | `runs:updateStatus` |
| POST | `/api/runs/:runId/video` | Attach video | `runs:attachVideo` |
| POST | `/api/runs/:runId/screenshots` | Attach screenshots | `runs:attachScreenshots` |
| POST | `/api/runs/:runId/annotations` | Update annotations | `runs:updateAnnotations` |

### Edits

| Method | Path | Description | Convex Function |
|--------|------|-------------|-----------------|
| GET | `/api/runs/:runId/edits` | List edit versions | `edits:listVersions` |
| POST | `/api/runs/:runId/edits` | Apply an edit | `edits:applyEdit` |
| POST | `/api/runs/:runId/edits/revert` | Revert edits | `edits:revert` |
| PATCH | `/api/edits/:editId/status` | Update edit status | `edits:updateVersionStatus` |

### Exports

| Method | Path | Description | Convex Function |
|--------|------|-------------|-----------------|
| GET | `/api/runs/:runId/exports` | List exports | `exports:list` |
| POST | `/api/runs/:runId/exports` | Create export | `exports:create` |
| PATCH | `/api/exports/:exportId/progress` | Update progress | `exports:updateProgress` |
| POST | `/api/exports/:exportId/complete` | Complete export | `exports:complete` |
| POST | `/api/exports/:exportId/fail` | Fail export | `exports:fail` |

### Upload

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload-url` | Generate Convex storage upload URL |

## CORS

Credentials-aware CORS is enabled. Allowed origins:

```ts
export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://aura-backend.poppets-grungy03.workers.dev",
];
```

The `Authorization` header is also allowed for webhook API key authentication.

## Environment variables

| Variable              | Description                                |
|-----------------------|--------------------------------------------|
| `GITHUB_CLIENT_ID`    | GitHub OAuth App client ID                 |
| `GITHUB_CLIENT_SECRET`| GitHub OAuth App client secret             |
| `GITHUB_REDIRECT_URI` | Callback URL registered with GitHub        |
| `COOKIE_SECRET`       | HMAC-SHA256 key for signing cookies        |
| `CONVEX_URL`          | Convex deployment URL                      |
| `CONVEX_DEPLOY_KEY`   | Convex deploy key (optional for local dev) |

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
  convex.ts             — ConvexClient class (query/mutation via HTTP API)
  endpoints/
    githubAuth.ts       — GET /api/auth/github (start OAuth)
    githubCallback.ts   — GET /api/auth/callback/github (handle callback, store user in Convex)
    sessionInfo.ts      — GET /api/auth/session (read cookie)
    logout.ts           — POST /api/auth/logout (clear cookie)
    runs.ts             — /api/runs/* CRUD
    edits.ts            — /api/runs/:runId/edits/* CRUD
    exports.ts          — /api/runs/:runId/exports/* CRUD
    repositories.ts     — /api/repositories/* (GitHub API + Convex)
    webhook.ts          — /api/webhooks/pr (CI webhook)
```

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Platform   │────▶│   CF Worker API   │────▶│    Convex    │
│  (Next.js)   │     │   (Hono + CORS)  │     │  (Database)  │
└──────────────┘     └────────┬─────────┘     └──────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │   GitHub API     │
                     │ (repos, OAuth)   │
                     └──────────────────┘
```

- **Platform** calls CF Worker endpoints with `credentials: "include"` for cookie auth
- **CF Worker** proxies data to/from Convex and fetches repos directly from GitHub API
- **GitHub Actions** sends webhook POST to CF Worker with API key auth

## Gotchas

- Cloudflare Workers do not send a `User-Agent` header by default. GitHub API returns 403 without one. All GitHub fetch calls must include `"User-Agent": "aura-backend"`.
- The cookie uses `SameSite=None; Secure` for cross-origin access. Localhost is treated as a secure context by browsers.
- GitHub OAuth codes are single-use and expire in 10 minutes.
- Convex document IDs are NOT UUIDs — they look like `k17cqq8n5ew9p...`. Pass through unchanged.
- Convex HTTP API response format: `{value: ..., status: "success"}` — the ConvexClient unwraps this.
- For local dev, CONVEX_DEPLOY_KEY can be empty — the local Convex dev server has no auth.
- The `repositories` table only stores repos the user has explicitly enabled — not all GitHub repos.
- API keys are stored in plaintext in Convex. Format: `aura_<32hex>`.
