# cogpit-memory CLI + Library Design

## Overview

cogpit-memory is a standalone CLI tool and library for querying Claude Code session history. It provides full-text search (FTS5), session context browsing (L1/L2/L3), and session discovery — all via CLI commands that output JSON.

It lives inside the cogpit repo at `packages/cogpit-memory/` but is designed to work independently when pushed to its own repo.

## Architecture

**CLI + Library hybrid:**
- CLI entry (`cli.ts`): parses args, calls command handlers, prints JSON to stdout
- Library entry (`index.ts`): exports SearchIndex, parser, command handlers for cogpit to import
- No HTTP server — cogpit's existing server handles that

**Inside cogpit:** imported as a library. Cogpit's server runs the file watcher to keep the FTS5 index fresh.

**Standalone:** `bunx cogpit-memory <command>`. Opens the FTS5 DB, runs query, prints JSON, exits.

## Package Structure

```
packages/cogpit-memory/
  package.json            # name: "cogpit-memory", bin: "./src/cli.ts"
  tsconfig.json
  src/
    cli.ts                # CLI entry (#!/usr/bin/env bun)
    index.ts              # Library exports
    lib/
      search-index.ts     # SearchIndex class (better-sqlite3, FTS5 trigram)
      parser.ts           # JSONL parser (synced from cogpit via script)
      turnBuilder.ts      # Turn builder (synced)
      types.ts            # Type definitions (synced)
      sessionStats.ts     # Session stats (synced)
      sessionStatus.ts    # Session status (synced)
      token-costs.ts      # Token costs (synced)
      pricingTiers.ts     # Pricing tiers (synced)
      dirs.ts             # ~/.claude paths
      helpers.ts          # findJsonlPath, project name helpers
      metadata.ts         # Session metadata extraction
      response.ts         # parseMaxAge helper
      costAnalytics.ts    # Cost analytics
    commands/
      search.ts           # search command — returns SearchResponse object
      context.ts          # context L1/L2/L3 — returns session/turn/agent objects
      sessions.ts         # sessions list/current — returns session summaries
      index-cmd.ts        # index stats/rebuild — returns IndexStats
    skill/
      SKILL.md            # Claude Code skill (CLI-based instructions)
scripts/
  sync-cogpit-memory.ts   # Copies parser/types from src/lib/ to packages/cogpit-memory/src/lib/
```

## CLI Commands

```
cogpit-memory search <query> [options]
  --session <id>       Scope to single session
  --max-age <5d>       Time window (default: 5d)
  --limit <20>         Max hits (default: 20)
  --case-sensitive     Case sensitive matching

cogpit-memory context <sessionId>                          # L1 overview
cogpit-memory context <sessionId> --turn <N>               # L2 turn detail
cogpit-memory context <sessionId> --agent <agentId>        # L3 sub-agent
cogpit-memory context <sessionId> --agent <id> --turn <N>  # L3+L2

cogpit-memory sessions [options]
  --cwd <path>         Filter by working directory
  --limit <20>         Max results (default: 20)
  --max-age <7d>       Time window (default: 7d)
  --current            Show most recent session for --cwd

cogpit-memory index stats                                  # Show index stats
cogpit-memory index rebuild                                # Rebuild full index
```

All commands output JSON to stdout. Same response shapes as the existing HTTP API.

## FTS5 Search Index

- Database: `~/.claude/cogpit-memory/search-index.db`
- Engine: better-sqlite3 with FTS5 virtual table + trigram tokenizer
- Schema: same as cogpit's SearchIndex (indexed_files + search_content tables)
- Shared DB: both cogpit (watcher) and standalone CLI use the same file
- Fallback: if DB doesn't exist, search falls back to raw-scan

## Code Sharing

cogpit-memory keeps its own copies of parsing modules. A sync script in the cogpit repo copies from `src/lib/` to `packages/cogpit-memory/src/lib/`:

```
bun run sync-cogpit-memory
```

Files synced: parser.ts, turnBuilder.ts, types.ts, sessionStats.ts, sessionStatus.ts, token-costs.ts, pricingTiers.ts.

cogpit is the source of truth for these files.

## Cogpit Integration

```typescript
// cogpit imports from the package
import { SearchIndex } from "../packages/cogpit-memory"

const index = new SearchIndex("~/.claude/cogpit-memory/search-index.db")
index.startWatching(dirs.PROJECTS_DIR)
```

The watcher runs inside cogpit's server process. The CLI benefits from the same fresh index.

## Skill File

CLI-based skill — no server management needed:

```bash
# Search
bunx cogpit-memory search "authentication"

# Browse
bunx cogpit-memory context <sessionId>
bunx cogpit-memory context <sessionId> --turn 3

# Discover
bunx cogpit-memory sessions --current --cwd .
```
