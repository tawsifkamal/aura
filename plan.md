# Aura - Full Plan

## Vision
Claude Code skill that auto-generates video demos of web app changes. User runs `/record-demo`, Aura analyzes git diff, launches browser, interacts with changed features, records video.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         USER'S MACHINE                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Claude Code                                                   │
│       │                                                        │
│       ▼                                                        │
│  /record-demo skill                                            │
│       │                                                        │
│       ├── 1. Analyze git diff                                  │
│       │       └── Identify changed components/routes           │
│       │                                                        │
│       ├── 2. Start dev server                                  │
│       │       └── npm run dev (background)                     │
│       │                                                        │
│       ├── 3. Browser agent (PLUGGABLE)                         │
│       │       ├── Option A: Playwright MCP (local, free)       │
│       │       └── Option B: Browser-use (cloud, AI-native)     │
│       │                                                        │
│       ├── 4. AI decides what to interact with                  │
│       │       └── Based on diff, click buttons/fill forms      │
│       │                                                        │
│       ├── 5. Record video/screenshots                          │
│       │       └── Save to ./demos/[timestamp]/                 │
│       │                                                        │
│       └── 6. Generate summary                                  │
│               └── demos/[timestamp]/summary.md                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Phases

### Phase 1: MVP (Local, Playwright) ← START HERE
- Skill file that prompts Claude
- Uses Playwright MCP (user must have it configured)
- Saves videos/screenshots locally to `./demos/`
- No auth needed, no cloud

### Phase 2: Browser-use Support
- Detect if user has browser-use configured
- Support browser-use MCP alongside Playwright
- User auths into their own browser-use account
- Config in `.aura.json` or env vars:
  ```json
  {
    "browser": "browser-use",  // or "playwright"
    "browserUseApiKey": "${BROWSER_USE_API_KEY}"
  }
  ```

### Phase 3: Cloud Upload (Optional)
- Upload videos to cloud storage
- Options:
  - User's own S3 (they provide creds)
  - Cloudflare R2 (we host, free tier)
  - GitHub release assets
- Return shareable URL

### Phase 4: UI Element Caching
- Cache interactive element graph per project
- Skip full page scan on repeat runs
- Faster execution for same app

---

## Browser Agent Options

### Playwright MCP
- **Pros**: Free, local, no auth, fast
- **Cons**: User must configure MCP
- **How**: Already exists, just reference in skill

### Browser-use
- **Pros**: AI-native, handles complex flows, cloud option
- **Cons**: Requires API key, costs money
- **Auth**: User signs up at browser-use.com, gets API key, sets env var
- **MCP**: Need to check if browser-use has MCP or wrap their Python SDK

### Auth Strategy for Browser-use
```
1. User signs up at browser-use.com
2. Gets API key
3. Sets BROWSER_USE_API_KEY env var
4. Aura skill detects env var, uses browser-use
5. Falls back to Playwright if no key
```

---

## File Structure (Final)

```
aura/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── record-demo/
│       └── SKILL.md
├── .mcp.json                    # Declares browser dependencies
├── .aura.json.example           # Config template
├── README.md
└── plan.md                      # This file
```

---

## Open Questions

1. **Browser-use MCP**: Does it exist? Or need to wrap Python SDK?
2. **Video format**: MP4? WebM? GIF for quick previews?
3. **Multi-page apps**: How to detect all affected routes?
4. **Auth flows**: How to handle login-required pages?
5. **CI/CD integration**: Run in GitHub Actions?

---

## MVP Scope (Phase 1)

Build ONLY:
- [x] Plugin structure
- [ ] Skill file with prompts
- [ ] Git diff analysis logic
- [ ] Dev server start/stop
- [ ] Playwright navigation + screenshot
- [ ] Basic summary generation

NOT building yet:
- Browser-use support
- Cloud upload
- Element caching
- CI integration
