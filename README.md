# Aura

Autonomous build loop for Claude Code. Give it a hackathon idea, it builds the product iteratively.

## Usage

1. **Edit `idea.md`** with your hackathon idea
2. **Run the loop:**
   ```bash
   ./aura-loop.sh
   ```

## How it works

```
idea.md → Claude Code → builds → NEXT_STEPS.md → Claude Code → builds more → ...
```

- Reads your idea from `idea.md`
- Runs Claude Code with autonomous build instructions
- Claude writes progress to `NEXT_STEPS.md`
- Loop uses that to inform next iteration
- Continues until complete or max iterations (default: 10)

## Configuration

```bash
MAX_ITERATIONS=20 ./aura-loop.sh  # More iterations
```

## Files

- `idea.md` - Your hackathon idea (edit this)
- `aura-loop.sh` - The loop script
- `NEXT_STEPS.md` - Auto-generated progress tracker
- `aura-log.md` - Full build log
