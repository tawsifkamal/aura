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
