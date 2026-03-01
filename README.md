# Aura

Claude Code plugin that auto-generates video demos of your web app changes.

## What it does

```
You code → /record-demo → Aura analyzes diff → Opens browser →
Interacts with changes → Screenshots/video → Ready for PR
```

## Monorepo Structure

```
aura/
├── apps/
│   └── web/              # Sample Next.js app for testing
├── packages/
│   ├── plugin/           # Claude Code plugin
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── skills/
│   │   │   └── record-demo/
│   │   │       └── SKILL.md
│   │   └── .mcp.json
│   ├── ui/               # Shared UI components
│   └── ...
├── plan.md               # Full architecture
├── prd.json              # Current phase tasks
└── ralph.sh              # Autonomous build loop
```

## Quick Start

```bash
# Install dependencies
npm install

# Run the demo app
npm run dev

# Load the plugin in Claude Code
claude --plugin-dir ./packages/plugin
```

## Environment Setup

Three separate `.env` files are needed. Each package has a `.env.example` with all required keys.

### 1. `packages/demo-recorder/.env`
The main secrets file — used by the recorder and the demo-notebook.
```bash
cp packages/demo-recorder/.env.example packages/demo-recorder/.env
# Fill in: BROWSER_USE_API_KEY, OPENAI_API_KEY, NEXT_PUBLIC_CONVEX_URL, CONVEX_DEPLOY_KEY
```

### 2. `packages/demo-notebook/.env`
Loaded directly by the Jupyter notebook via `python-dotenv`.
```bash
cp packages/demo-notebook/.env.example packages/demo-notebook/.env
# Fill in: BROWSER_USE_API_KEY, OPENAI_API_KEY
# Or just symlink to the recorder .env:
# ln -s ../demo-recorder/.env packages/demo-notebook/.env
```

### 3. `apps/web/.env.local`
Required for the Next.js dashboard to connect to Convex. Next.js loads this automatically.
```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in: NEXT_PUBLIC_CONVEX_URL (same value as in demo-recorder/.env)
# Or run `npx convex dev` once — it sets this automatically.
```

> **Note:** `.env` and `.env.local` are gitignored. Never commit real secrets. Only `.env.example` files are tracked.

## Usage

After making changes to a web app:
```
/record-demo
```

Aura will:
1. Analyze your git diff
2. Start your dev server
3. Navigate to affected routes
4. Interact with changed components
5. Save screenshots to `./demos/[timestamp]/`

## Development

```bash
npm run dev      # Start all apps
npm run build    # Build all packages
npm run lint     # Lint everything
```

## Roadmap

- [x] Phase 1: Local Playwright MVP
- [ ] Phase 2: Browser-use support
- [ ] Phase 3: Cloud upload (shareable links)
- [ ] Phase 4: UI element caching

See [plan.md](./plan.md) for full architecture.
