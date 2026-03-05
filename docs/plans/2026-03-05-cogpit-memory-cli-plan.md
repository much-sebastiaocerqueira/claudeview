# cogpit-memory CLI + Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build cogpit-memory as a standalone CLI + library package at `packages/cogpit-memory/` that provides FTS5-powered session search, session context browsing (L1/L2/L3), and session discovery — all outputting JSON to stdout.

**Architecture:** CLI entry parses args and dispatches to command handlers that return plain objects, serialized to JSON. Library entry re-exports SearchIndex, parser, and command handlers for cogpit to import. Shared FTS5 database at `~/.claude/cogpit-memory/search-index.db`. Sync script copies parser/types from `src/lib/` into the package.

**Tech Stack:** Bun, better-sqlite3 (FTS5 trigram), TypeScript

---

### Task 1: Package Scaffolding + Sync Script

**Files:**
- Create: `packages/cogpit-memory/package.json`
- Create: `packages/cogpit-memory/tsconfig.json`
- Create: `scripts/sync-cogpit-memory.ts`
- Modify: `package.json` (add sync script)

**Step 1: Create package directory structure**

```bash
mkdir -p packages/cogpit-memory/src/{lib,commands,skill,__tests__/commands}
```

**Step 2: Write package.json**

Write `packages/cogpit-memory/package.json`:
```json
{
  "name": "cogpit-memory",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "cogpit-memory": "./src/cli.ts"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "bun test"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "bun-types": "latest"
  }
}
```

**Step 3: Write tsconfig.json**

Write `packages/cogpit-memory/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 4: Write sync script**

Write `scripts/sync-cogpit-memory.ts`:
```typescript
#!/usr/bin/env bun
/**
 * Sync shared modules from src/lib/ to packages/cogpit-memory/src/lib/.
 * cogpit (agent-window) is the source of truth for these files.
 */
import { copyFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const SRC = join(ROOT, "src/lib")
const DEST = join(ROOT, "packages/cogpit-memory/src/lib")

const FILES = [
  "parser.ts",
  "turnBuilder.ts",
  "types.ts",
  "sessionStats.ts",
  "sessionStatus.ts",
  "token-costs.ts",
  "pricingTiers.ts",
  "costAnalytics.ts",
]

mkdirSync(DEST, { recursive: true })

for (const file of FILES) {
  copyFileSync(join(SRC, file), join(DEST, file))
  console.log(`  synced ${file}`)
}

console.log(`\nSynced ${FILES.length} files to packages/cogpit-memory/src/lib/`)
```

**Step 5: Add sync script to root package.json**

Add to root `package.json` scripts:
```json
"sync-cogpit-memory": "bun scripts/sync-cogpit-memory.ts"
```

**Step 6: Install deps and run sync**

```bash
cd packages/cogpit-memory && bun install
cd ../..
bun run sync-cogpit-memory
```

Verify: `ls packages/cogpit-memory/src/lib/parser.ts packages/cogpit-memory/src/lib/types.ts`

**Step 7: Commit**

```bash
git add packages/cogpit-memory/package.json packages/cogpit-memory/tsconfig.json packages/cogpit-memory/bun.lockb scripts/sync-cogpit-memory.ts package.json packages/cogpit-memory/src/lib/
git commit -m "feat(cogpit-memory): scaffold package, sync script, and synced parser/types"
```

---

### Task 2: Core Library Files

**Files:**
- Create: `packages/cogpit-memory/src/lib/dirs.ts`
- Create: `packages/cogpit-memory/src/lib/helpers.ts`
- Create: `packages/cogpit-memory/src/lib/response.ts`
- Create: `packages/cogpit-memory/src/lib/metadata.ts`

Port these from `.worktrees/session-context-server/packages/cogpit-memory/src/lib/`. They're small utility modules all commands depend on.

**Step 1: Write dirs.ts**

Write `packages/cogpit-memory/src/lib/dirs.ts`:
```typescript
import { join } from "node:path"
import { homedir } from "node:os"

export const dirs = {
  PROJECTS_DIR: join(homedir(), ".claude", "projects"),
  TEAMS_DIR: join(homedir(), ".claude", "teams"),
  TASKS_DIR: join(homedir(), ".claude", "tasks"),
}

/** Default database path for the FTS5 search index. */
export const DEFAULT_DB_PATH = join(homedir(), ".claude", "cogpit-memory", "search-index.db")
```

**Step 2: Port helpers.ts**

Copy from `.worktrees/session-context-server/packages/cogpit-memory/src/lib/helpers.ts`. Keep all three functions exactly: `findJsonlPath`, `matchSubagentToMember`, `projectDirToReadableName`.

**Step 3: Write response.ts**

Write `packages/cogpit-memory/src/lib/response.ts` — only `parseMaxAge` (no HTTP Response helpers for CLI):
```typescript
/** Parse a duration string like "5d", "12h", "30m" to milliseconds. */
export function parseMaxAge(raw: string): number {
  const match = raw.match(/^(\d+)([dhm])$/)
  if (!match) return 5 * 24 * 60 * 60 * 1000
  const value = parseInt(match[1], 10)
  const unit = match[2]
  switch (unit) {
    case "d": return value * 24 * 60 * 60 * 1000
    case "h": return value * 60 * 60 * 1000
    case "m": return value * 60 * 1000
    default: return 5 * 24 * 60 * 60 * 1000
  }
}
```

**Step 4: Port metadata.ts**

Copy from `.worktrees/session-context-server/packages/cogpit-memory/src/lib/metadata.ts`. This provides `getSessionMeta()` and `getSessionStatus()` used by the sessions command. The file reads JSONL headers and tails for status derivation.

**Step 5: Commit**

```bash
git add packages/cogpit-memory/src/lib/dirs.ts packages/cogpit-memory/src/lib/helpers.ts packages/cogpit-memory/src/lib/response.ts packages/cogpit-memory/src/lib/metadata.ts
git commit -m "feat(cogpit-memory): add core lib files (dirs, helpers, response, metadata)"
```

---

### Task 3: SearchIndex Class

**Files:**
- Create: `packages/cogpit-memory/src/lib/search-index.ts`
- Test: `packages/cogpit-memory/src/__tests__/search-index.test.ts`

Port SearchIndex from `server/search-index.ts`. Key adaptation: use `better-sqlite3` instead of `bun:sqlite` (so it works with both Bun and Node.js when published to npm).

**Step 1: Write failing test**

Write `packages/cogpit-memory/src/__tests__/search-index.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { SearchIndex } from "../lib/search-index"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("SearchIndex", () => {
  let dbPath: string
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cogpit-memory-test-"))
    dbPath = join(tmpDir, "test.db")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("creates database and schema", () => {
    const index = new SearchIndex(dbPath)
    const stats = index.getStats()
    expect(stats.indexedFiles).toBe(0)
    expect(stats.totalRows).toBe(0)
    index.close()
  })

  it("indexes a JSONL file and finds content via search", () => {
    const index = new SearchIndex(dbPath)
    const projectDir = join(tmpDir, "projects", "-test-project")
    mkdirSync(projectDir, { recursive: true })
    const sessionFile = join(projectDir, "test-session.jsonl")

    const lines = [
      JSON.stringify({ type: "user", message: { role: "user", content: "find authentication bugs" } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "I found an authentication issue" }], model: "claude-opus-4-6", id: "msg1", stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } } }),
    ]
    writeFileSync(sessionFile, lines.join("\n"))
    index.indexFile(sessionFile)

    expect(index.getStats().indexedFiles).toBe(1)
    const hits = index.search("authentication")
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].sessionId).toBe("test-session")
    index.close()
  })

  it("returns structured stats", () => {
    const index = new SearchIndex(dbPath)
    const stats = index.getStats()
    expect(stats).toHaveProperty("dbPath")
    expect(stats).toHaveProperty("dbSizeBytes")
    expect(stats).toHaveProperty("indexedFiles")
    expect(stats).toHaveProperty("totalRows")
    expect(stats).toHaveProperty("watcherRunning")
    index.close()
  })

  it("builds full index from projects directory", () => {
    const projectDir = join(tmpDir, "projects", "-test-proj")
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, "s1.jsonl"), JSON.stringify({ type: "user", message: { role: "user", content: "keyword alpha" } }))
    writeFileSync(join(projectDir, "s2.jsonl"), JSON.stringify({ type: "user", message: { role: "user", content: "keyword beta" } }))

    const index = new SearchIndex(dbPath)
    index.buildFull(join(tmpDir, "projects"))
    expect(index.getStats().indexedFiles).toBe(2)
    expect(index.search("keyword").length).toBe(2)
    index.close()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd packages/cogpit-memory && bun test
```
Expected: FAIL — search-index module doesn't exist

**Step 3: Port SearchIndex class**

Port from `server/search-index.ts` to `packages/cogpit-memory/src/lib/search-index.ts`. Key changes:

1. Replace `import Database from "bun:sqlite"` with `import Database from "better-sqlite3"`
2. Adjust API differences between bun:sqlite and better-sqlite3:
   - `db.query(sql).get()` → `db.prepare(sql).get()`
   - `db.query(sql).all()` → `db.prepare(sql).all()`
   - `db.run(sql)` → `db.exec(sql)` for DDL, `db.prepare(sql).run()` for DML
   - Transaction API: `db.transaction(() => { ... })` works in both but bind syntax differs
3. Import `parseSession`, `getUserMessageText` from local `./parser`
4. Import types from local `./types`
5. Keep all methods: `indexFile`, `search`, `countMatches`, `buildFull`, `updateStale`, `rebuild`, `startWatching`, `stopWatching`, `getStats`, `close`

**Step 4: Run tests, verify pass**

```bash
cd packages/cogpit-memory && bun test
```
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cogpit-memory/src/lib/search-index.ts packages/cogpit-memory/src/__tests__/search-index.test.ts
git commit -m "feat(cogpit-memory): port SearchIndex with better-sqlite3 and FTS5 trigram"
```

---

### Task 4: Sessions Command

**Files:**
- Create: `packages/cogpit-memory/src/commands/sessions.ts`
- Test: `packages/cogpit-memory/src/__tests__/commands/sessions.test.ts`

Port from `.worktrees/session-context-server/packages/cogpit-memory/src/routes/sessions-list.ts`. Convert HTTP handlers to plain functions returning objects.

**Step 1: Write failing test**

Write `packages/cogpit-memory/src/__tests__/commands/sessions.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { listSessions, currentSession } from "../../commands/sessions"

describe("sessions command", () => {
  it("listSessions returns an array", async () => {
    const result = await listSessions({ limit: 5, maxAge: "1d" })
    expect(Array.isArray(result)).toBe(true)
  })

  it("each session has expected shape", async () => {
    const result = await listSessions({ limit: 1, maxAge: "30d" })
    if (result.length > 0) {
      const session = result[0]
      expect(session).toHaveProperty("sessionId")
      expect(session).toHaveProperty("mtime")
    }
  })

  it("currentSession returns null for nonexistent path", async () => {
    const result = await currentSession("/nonexistent/path/xyz12345")
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify failure**

```bash
cd packages/cogpit-memory && bun test
```
Expected: FAIL — sessions module doesn't exist

**Step 3: Implement sessions command**

Write `packages/cogpit-memory/src/commands/sessions.ts`. Port logic from the worktree's `sessions-list.ts`:

```typescript
import { readdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { dirs } from "../lib/dirs"
import { parseMaxAge } from "../lib/response"
import { getSessionMeta } from "../lib/metadata"
import { projectDirToReadableName } from "../lib/helpers"

export interface SessionSummary {
  sessionId: string
  cwd: string | null
  model: string | null
  firstMessage: string | null
  lastMessage: string | null
  turnCount: number
  status: string
  mtime: string
}

export interface SessionsOptions {
  cwd?: string
  limit?: number
  maxAge?: string
}

export async function listSessions(opts: SessionsOptions = {}): Promise<SessionSummary[]> {
  const limit = Math.min(opts.limit ?? 20, 100)
  const maxAgeMs = parseMaxAge(opts.maxAge ?? "7d")
  const cutoff = Date.now() - maxAgeMs

  // Discover all JSONL files across project directories
  const sessions: Array<SessionSummary & { mtimeMs: number }> = []

  try {
    const projectEntries = await readdir(dirs.PROJECTS_DIR, { withFileTypes: true })
    for (const entry of projectEntries) {
      if (!entry.isDirectory() || entry.name === "memory") continue
      const projectDir = join(dirs.PROJECTS_DIR, entry.name)
      const { path: projectPath } = projectDirToReadableName(entry.name)

      // If cwd filter provided, check if this project matches
      if (opts.cwd && projectPath !== opts.cwd) continue

      try {
        const files = await readdir(projectDir)
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue
          const filePath = join(projectDir, file)
          try {
            const s = await stat(filePath)
            if (s.mtimeMs < cutoff) continue

            const meta = await getSessionMeta(filePath)
            sessions.push({
              sessionId: basename(file, ".jsonl"),
              cwd: meta?.cwd ?? projectPath,
              model: meta?.model ?? null,
              firstMessage: meta?.firstMessage ?? null,
              lastMessage: meta?.lastMessage ?? null,
              turnCount: meta?.turnCount ?? 0,
              status: meta?.status ?? "unknown",
              mtime: new Date(s.mtimeMs).toISOString(),
              mtimeMs: s.mtimeMs,
            })
          } catch { continue }
        }
      } catch { continue }
    }
  } catch { /* PROJECTS_DIR doesn't exist */ }

  // Sort by mtime descending, apply limit
  sessions.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return sessions.slice(0, limit).map(({ mtimeMs, ...rest }) => rest)
}

export async function currentSession(cwd: string): Promise<SessionSummary | null> {
  // Derive project directory name from CWD
  const dirName = cwd.replace(/[/.]/g, "-")
  const projectDir = join(dirs.PROJECTS_DIR, dirName)

  try {
    const files = await readdir(projectDir)
    const jsonlFiles = files.filter(f => f.endsWith(".jsonl"))
    if (jsonlFiles.length === 0) return null

    // Find most recently modified
    let newest: { file: string; mtimeMs: number } | null = null
    for (const file of jsonlFiles) {
      const s = await stat(join(projectDir, file))
      if (!newest || s.mtimeMs > newest.mtimeMs) {
        newest = { file, mtimeMs: s.mtimeMs }
      }
    }
    if (!newest) return null

    const filePath = join(projectDir, newest.file)
    const meta = await getSessionMeta(filePath)
    return {
      sessionId: basename(newest.file, ".jsonl"),
      cwd: meta?.cwd ?? cwd,
      model: meta?.model ?? null,
      firstMessage: meta?.firstMessage ?? null,
      lastMessage: meta?.lastMessage ?? null,
      turnCount: meta?.turnCount ?? 0,
      status: meta?.status ?? "unknown",
      mtime: new Date(newest.mtimeMs).toISOString(),
    }
  } catch {
    return null
  }
}
```

**Step 4: Run tests, verify pass**

```bash
cd packages/cogpit-memory && bun test
```

**Step 5: Commit**

```bash
git add packages/cogpit-memory/src/commands/sessions.ts packages/cogpit-memory/src/__tests__/commands/sessions.test.ts
git commit -m "feat(cogpit-memory): add sessions list/current commands"
```

---

### Task 5: Context Command (L1/L2/L3)

**Files:**
- Create: `packages/cogpit-memory/src/commands/context.ts`
- Test: `packages/cogpit-memory/src/__tests__/commands/context.test.ts`

Port from `.worktrees/session-context-server/packages/cogpit-memory/src/routes/session-context.ts`. Convert HTTP handlers to plain functions.

**Step 1: Write failing test**

Write `packages/cogpit-memory/src/__tests__/commands/context.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { getSessionOverview, getTurnDetail, getAgentOverview, getAgentTurnDetail } from "../../commands/context"

describe("context command", () => {
  it("returns error for nonexistent session", async () => {
    const result = await getSessionOverview("nonexistent-session-id-99999")
    expect(result).toHaveProperty("error")
  })

  it("getTurnDetail returns error for nonexistent session", async () => {
    const result = await getTurnDetail("nonexistent-session-id-99999", 0)
    expect(result).toHaveProperty("error")
  })

  it("getAgentOverview returns error for nonexistent session", async () => {
    const result = await getAgentOverview("nonexistent-session-id-99999", "fake-agent")
    expect(result).toHaveProperty("error")
  })

  it("getAgentTurnDetail returns error for nonexistent session", async () => {
    const result = await getAgentTurnDetail("nonexistent-session-id-99999", "fake-agent", 0)
    expect(result).toHaveProperty("error")
  })
})
```

**Step 2: Run test to verify failure**

**Step 3: Implement context command**

Write `packages/cogpit-memory/src/commands/context.ts`. Port all helper functions from the worktree's `session-context.ts`:

- `extractUserMessageText`, `truncateResult`, `mapSubAgentSummary`, `mapSubAgentDetail`
- `mapSessionToOverview`, `mapTurnToSummary`, `mapTurnToDetail`, `mapContentBlock`
- `findSubagentFile`, `findTeamContext`, `findParentToolCallId`, `findAgentMetadata`

Key change: functions return `{ error: string }` objects instead of HTTP Response objects.

```typescript
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { findJsonlPath, matchSubagentToMember } from "../lib/helpers"
import { dirs } from "../lib/dirs"
import { parseSession } from "../lib/parser"
import type { ParsedSession, Turn, UserContent, ThinkingBlock, SubAgentMessage, TurnContentBlock } from "../lib/types"

const RESULT_TRUNCATE_LIMIT = 10_000
const L1_RESPONSE_LIMIT = 150_000

// ... all helper functions from session-context.ts (unchanged) ...

export async function getSessionOverview(sessionId: string): Promise<object> {
  const jsonlPath = await findJsonlPath(sessionId)
  if (!jsonlPath) return { error: "Session not found" }
  const content = await readFile(jsonlPath, "utf-8")
  const session = parseSession(content)
  return mapSessionToOverview(session)
}

export async function getTurnDetail(sessionId: string, turnIndex: number): Promise<object> {
  const jsonlPath = await findJsonlPath(sessionId)
  if (!jsonlPath) return { error: "Session not found" }
  const content = await readFile(jsonlPath, "utf-8")
  const session = parseSession(content)
  if (turnIndex < 0 || turnIndex >= session.turns.length) return { error: "Turn not found" }
  return mapTurnToDetail(session, turnIndex)
}

export async function getAgentOverview(sessionId: string, agentId: string): Promise<object> {
  const jsonlPath = await findJsonlPath(sessionId)
  if (!jsonlPath) return { error: "Session not found" }
  const content = await readFile(jsonlPath, "utf-8")
  const session = parseSession(content)

  const subagentFile = await findSubagentFile(jsonlPath, agentId)
  if (!subagentFile) return { error: "Agent not found" }

  const subagentContent = await readFile(subagentFile.filePath, "utf-8")
  const subagentSession = parseSession(subagentContent)
  const metadata = findAgentMetadata(session, agentId)
  const parentToolCallId = findParentToolCallId(session, agentId)
  const teamContext = await findTeamContext(sessionId, subagentFile.fileName)

  return {
    sessionId, agentId,
    name: metadata.name, type: metadata.type,
    parentToolCallId, isBackground: metadata.isBackground,
    teamContext,
    overview: mapSessionToOverview(subagentSession),
  }
}

export async function getAgentTurnDetail(sessionId: string, agentId: string, turnIndex: number): Promise<object> {
  const jsonlPath = await findJsonlPath(sessionId)
  if (!jsonlPath) return { error: "Session not found" }
  const content = await readFile(jsonlPath, "utf-8")

  const subagentFile = await findSubagentFile(jsonlPath, agentId)
  if (!subagentFile) return { error: "Agent not found" }

  const subagentContent = await readFile(subagentFile.filePath, "utf-8")
  const subagentSession = parseSession(subagentContent)
  if (turnIndex < 0 || turnIndex >= subagentSession.turns.length) return { error: "Turn not found" }

  return mapTurnToDetail(subagentSession, turnIndex)
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add packages/cogpit-memory/src/commands/context.ts packages/cogpit-memory/src/__tests__/commands/context.test.ts
git commit -m "feat(cogpit-memory): add context L1/L2/L3 commands"
```

---

### Task 6: Search Command

**Files:**
- Create: `packages/cogpit-memory/src/commands/search.ts`
- Test: `packages/cogpit-memory/src/__tests__/commands/search.test.ts`

Dual-path: FTS5 fast path when SearchIndex DB exists, raw-scan fallback otherwise. Port raw-scan from worktree's `session-search.ts`, FTS5 path from `server/routes/session-search.ts`.

**Step 1: Write failing test**

Write `packages/cogpit-memory/src/__tests__/commands/search.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { searchSessions } from "../../commands/search"

describe("search command", () => {
  it("returns expected response shape", async () => {
    const result = await searchSessions("nonexistent-query-xyz99", {})
    expect(result).toHaveProperty("query")
    expect(result).toHaveProperty("totalHits")
    expect(result).toHaveProperty("returnedHits")
    expect(result).toHaveProperty("results")
    expect(Array.isArray(result.results)).toBe(true)
  })

  it("rejects query shorter than 2 chars", async () => {
    const result = await searchSessions("x", {})
    expect(result).toHaveProperty("error")
  })

  it("respects limit parameter", async () => {
    const result = await searchSessions("the", { limit: 3, maxAge: "30d" })
    if (!("error" in result)) {
      expect(result.returnedHits).toBeLessThanOrEqual(3)
    }
  })
})
```

**Step 2: Run test to verify failure**

**Step 3: Implement search command**

Write `packages/cogpit-memory/src/commands/search.ts`:

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { readFile, readdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { SearchIndex } from "../lib/search-index"
import { DEFAULT_DB_PATH, dirs } from "../lib/dirs"
import { parseMaxAge } from "../lib/response"
import { parseSession, getUserMessageText } from "../lib/parser"
import type { ParsedSession, Turn, SubAgentMessage } from "../lib/types"

export interface SearchOptions {
  sessionId?: string
  maxAge?: string
  limit?: number
  caseSensitive?: boolean
  depth?: number
}

export interface SearchResponse {
  query: string
  totalHits: number
  returnedHits: number
  sessionsSearched: number
  results: Array<{
    sessionId: string
    hits: Array<{
      location: string
      snippet: string
      matchCount: number
      toolName?: string
      agentName?: string
    }>
  }>
}

export async function searchSessions(
  query: string,
  opts: SearchOptions,
  searchIndex?: SearchIndex | null,
): Promise<SearchResponse | { error: string }> {
  if (!query || query.length < 2) {
    return { error: "Query must be at least 2 characters" }
  }

  const limit = Math.min(Math.max(1, opts.limit ?? 20), 200)
  const caseSensitive = opts.caseSensitive ?? false
  const maxAgeMs = parseMaxAge(opts.maxAge ?? "5d")
  const depth = Math.min(Math.max(1, opts.depth ?? 4), 4)

  // Try FTS5 fast path
  let index = searchIndex ?? null
  let ownedIndex = false
  if (!index && existsSync(DEFAULT_DB_PATH)) {
    try {
      index = new SearchIndex(DEFAULT_DB_PATH)
      ownedIndex = true
    } catch { /* DB corrupt or locked */ }
  }

  if (index) {
    try {
      const hits = index.search(query, {
        limit,
        sessionId: opts.sessionId,
        maxAgeMs,
        caseSensitive,
      })

      // Group by sessionId
      const grouped = new Map<string, typeof hits>()
      for (const hit of hits) {
        const arr = grouped.get(hit.sessionId) ?? []
        arr.push(hit)
        grouped.set(hit.sessionId, arr)
      }

      const results = [...grouped.entries()].map(([sessionId, sessionHits]) => ({
        sessionId,
        hits: sessionHits.map(h => ({
          location: h.location,
          snippet: h.snippet,
          matchCount: h.matchCount,
        })),
      }))

      const totalHits = hits.length >= limit
        ? index.countMatches(query, { sessionId: opts.sessionId, maxAgeMs, caseSensitive })
        : hits.length

      if (ownedIndex) index.close()

      return {
        query,
        totalHits,
        returnedHits: hits.length,
        sessionsSearched: grouped.size,
        results,
      }
    } catch {
      if (ownedIndex) index.close()
      // Fall through to raw scan
    }
  }

  // Fallback: raw-scan (port from worktree session-search.ts)
  // 3-phase: discover → pre-filter → structured walk
  return rawScanSearch(query, opts.sessionId ?? null, maxAgeMs, limit, caseSensitive, depth)
}

// ... rawScanSearch implementation ported from worktree ...
// discoverSessions, preFilterFile, walkSession, walkSubagents, generateSnippet, countMatches
```

The raw-scan fallback is ported from the worktree's `session-search.ts`, stripping the HTTP/URL concerns.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add packages/cogpit-memory/src/commands/search.ts packages/cogpit-memory/src/__tests__/commands/search.test.ts
git commit -m "feat(cogpit-memory): add search command with FTS5 fast path + raw-scan fallback"
```

---

### Task 7: Index Command

**Files:**
- Create: `packages/cogpit-memory/src/commands/index-cmd.ts`
- Test: `packages/cogpit-memory/src/__tests__/commands/index-cmd.test.ts`

**Step 1: Write failing test**

Write `packages/cogpit-memory/src/__tests__/commands/index-cmd.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { indexStats } from "../../commands/index-cmd"

describe("index command", () => {
  it("returns error when DB does not exist", async () => {
    const result = await indexStats("/nonexistent/db/path.db")
    expect(result).toHaveProperty("error")
  })
})
```

**Step 2: Run test to verify failure**

**Step 3: Implement index command**

Write `packages/cogpit-memory/src/commands/index-cmd.ts`:
```typescript
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { SearchIndex, type IndexStats } from "../lib/search-index"
import { DEFAULT_DB_PATH, dirs } from "../lib/dirs"

export async function indexStats(dbPath?: string): Promise<IndexStats | { error: string }> {
  const path = dbPath ?? DEFAULT_DB_PATH
  if (!existsSync(path)) {
    return { error: `Database not found at ${path}. Run 'cogpit-memory index rebuild' to create it.` }
  }
  const index = new SearchIndex(path)
  const stats = index.getStats()
  index.close()
  return stats
}

export async function indexRebuild(dbPath?: string): Promise<{ status: string; stats: IndexStats }> {
  const path = dbPath ?? DEFAULT_DB_PATH
  mkdirSync(dirname(path), { recursive: true })
  const index = new SearchIndex(path)
  index.buildFull(dirs.PROJECTS_DIR)
  const stats = index.getStats()
  index.close()
  return { status: "rebuilt", stats }
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add packages/cogpit-memory/src/commands/index-cmd.ts packages/cogpit-memory/src/__tests__/commands/index-cmd.test.ts
git commit -m "feat(cogpit-memory): add index stats/rebuild commands"
```

---

### Task 8: CLI Entry Point

**Files:**
- Create: `packages/cogpit-memory/src/cli.ts`
- Test: `packages/cogpit-memory/src/__tests__/cli.test.ts`

**Step 1: Write failing test**

Write `packages/cogpit-memory/src/__tests__/cli.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { parseArgs } from "../cli"

describe("CLI arg parsing", () => {
  it("parses search command", () => {
    const cmd = parseArgs(["search", "authentication"])
    expect(cmd.command).toBe("search")
    expect(cmd.args.query).toBe("authentication")
  })

  it("parses search with options", () => {
    const cmd = parseArgs(["search", "auth", "--session", "abc", "--max-age", "7d", "--limit", "50"])
    expect(cmd.command).toBe("search")
    expect(cmd.args.query).toBe("auth")
    expect(cmd.args.session).toBe("abc")
    expect(cmd.args.maxAge).toBe("7d")
    expect(cmd.args.limit).toBe(50)
  })

  it("parses context command", () => {
    const cmd = parseArgs(["context", "abc-123"])
    expect(cmd.command).toBe("context")
    expect(cmd.args.sessionId).toBe("abc-123")
  })

  it("parses context with --turn", () => {
    const cmd = parseArgs(["context", "abc-123", "--turn", "5"])
    expect(cmd.args.turnIndex).toBe(5)
  })

  it("parses context with --agent", () => {
    const cmd = parseArgs(["context", "abc-123", "--agent", "a7f3"])
    expect(cmd.args.agentId).toBe("a7f3")
  })

  it("parses context with --agent and --turn", () => {
    const cmd = parseArgs(["context", "abc-123", "--agent", "a7f3", "--turn", "2"])
    expect(cmd.args.agentId).toBe("a7f3")
    expect(cmd.args.turnIndex).toBe(2)
  })

  it("parses sessions command", () => {
    const cmd = parseArgs(["sessions"])
    expect(cmd.command).toBe("sessions")
  })

  it("parses sessions --current --cwd", () => {
    const cmd = parseArgs(["sessions", "--current", "--cwd", "/path/to/project"])
    expect(cmd.args.current).toBe(true)
    expect(cmd.args.cwd).toBe("/path/to/project")
  })

  it("parses sessions with --limit and --max-age", () => {
    const cmd = parseArgs(["sessions", "--limit", "50", "--max-age", "30d"])
    expect(cmd.args.limit).toBe(50)
    expect(cmd.args.maxAge).toBe("30d")
  })

  it("parses index stats", () => {
    const cmd = parseArgs(["index", "stats"])
    expect(cmd.command).toBe("index")
    expect(cmd.args.subcommand).toBe("stats")
  })

  it("parses index rebuild", () => {
    const cmd = parseArgs(["index", "rebuild"])
    expect(cmd.command).toBe("index")
    expect(cmd.args.subcommand).toBe("rebuild")
  })

  it("parses search --case-sensitive", () => {
    const cmd = parseArgs(["search", "auth", "--case-sensitive"])
    expect(cmd.args.caseSensitive).toBe(true)
  })
})
```

**Step 2: Run test to verify failure**

**Step 3: Implement CLI entry**

Write `packages/cogpit-memory/src/cli.ts`:
```typescript
#!/usr/bin/env bun
/**
 * cogpit-memory CLI — query Claude Code session history.
 *
 * Usage:
 *   cogpit-memory search <query> [options]
 *   cogpit-memory context <sessionId> [--turn N] [--agent ID]
 *   cogpit-memory sessions [--cwd path] [--current] [--limit N] [--max-age 7d]
 *   cogpit-memory index stats|rebuild
 */

import { searchSessions } from "./commands/search"
import { getSessionOverview, getTurnDetail, getAgentOverview, getAgentTurnDetail } from "./commands/context"
import { listSessions, currentSession } from "./commands/sessions"
import { indexStats, indexRebuild } from "./commands/index-cmd"

export interface CLICommand {
  command: string
  args: Record<string, any>
}

export function parseArgs(argv: string[]): CLICommand {
  const command = argv[0]
  const args: Record<string, any> = {}

  switch (command) {
    case "search": {
      args.query = argv[1]
      for (let i = 2; i < argv.length; i++) {
        switch (argv[i]) {
          case "--session": args.session = argv[++i]; break
          case "--max-age": args.maxAge = argv[++i]; break
          case "--limit": args.limit = parseInt(argv[++i], 10); break
          case "--case-sensitive": args.caseSensitive = true; break
        }
      }
      break
    }
    case "context": {
      args.sessionId = argv[1]
      for (let i = 2; i < argv.length; i++) {
        switch (argv[i]) {
          case "--turn": args.turnIndex = parseInt(argv[++i], 10); break
          case "--agent": args.agentId = argv[++i]; break
        }
      }
      break
    }
    case "sessions": {
      for (let i = 1; i < argv.length; i++) {
        switch (argv[i]) {
          case "--cwd": args.cwd = argv[++i]; break
          case "--limit": args.limit = parseInt(argv[++i], 10); break
          case "--max-age": args.maxAge = argv[++i]; break
          case "--current": args.current = true; break
        }
      }
      break
    }
    case "index": {
      args.subcommand = argv[1] ?? "stats"
      break
    }
  }

  return { command, args }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage()
    process.exit(0)
  }

  const cmd = parseArgs(argv)
  let result: unknown

  switch (cmd.command) {
    case "search":
      if (!cmd.args.query) {
        console.error(JSON.stringify({ error: "Usage: cogpit-memory search <query>" }))
        process.exit(1)
      }
      result = await searchSessions(cmd.args.query, {
        sessionId: cmd.args.session,
        maxAge: cmd.args.maxAge,
        limit: cmd.args.limit,
        caseSensitive: cmd.args.caseSensitive,
      })
      break

    case "context":
      if (!cmd.args.sessionId) {
        console.error(JSON.stringify({ error: "Usage: cogpit-memory context <sessionId>" }))
        process.exit(1)
      }
      if (cmd.args.agentId && cmd.args.turnIndex !== undefined) {
        result = await getAgentTurnDetail(cmd.args.sessionId, cmd.args.agentId, cmd.args.turnIndex)
      } else if (cmd.args.agentId) {
        result = await getAgentOverview(cmd.args.sessionId, cmd.args.agentId)
      } else if (cmd.args.turnIndex !== undefined) {
        result = await getTurnDetail(cmd.args.sessionId, cmd.args.turnIndex)
      } else {
        result = await getSessionOverview(cmd.args.sessionId)
      }
      break

    case "sessions":
      if (cmd.args.current) {
        result = await currentSession(cmd.args.cwd ?? process.cwd())
      } else {
        result = await listSessions({
          cwd: cmd.args.cwd,
          limit: cmd.args.limit,
          maxAge: cmd.args.maxAge,
        })
      }
      break

    case "index":
      if (cmd.args.subcommand === "rebuild") {
        result = await indexRebuild()
      } else {
        result = await indexStats()
      }
      break

    default:
      console.error(JSON.stringify({ error: `Unknown command: ${cmd.command}` }))
      printUsage()
      process.exit(1)
  }

  console.log(JSON.stringify(result, null, 2))
}

function printUsage() {
  console.log(`cogpit-memory - query Claude Code session history

Commands:
  search <query> [options]    Search across sessions
    --session <id>            Scope to single session
    --max-age <5d>            Time window (default: 5d)
    --limit <20>              Max hits (default: 20)
    --case-sensitive          Case sensitive matching

  context <sessionId>         Session overview (L1)
    --turn <N>                Turn detail (L2)
    --agent <id>              Sub-agent overview (L3)

  sessions [options]          List sessions
    --cwd <path>              Filter by working directory
    --limit <20>              Max results (default: 20)
    --max-age <7d>            Time window (default: 7d)
    --current                 Most recent session for --cwd

  index stats                 Show index stats
  index rebuild               Rebuild full index
`)
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }))
  process.exit(1)
})
```

**Step 4: Run tests, verify pass**

```bash
cd packages/cogpit-memory && bun test
```

**Step 5: Manual smoke test**

```bash
cd packages/cogpit-memory
bun src/cli.ts sessions --limit 3
bun src/cli.ts search "parseSession" --max-age 7d
bun src/cli.ts index stats
```

**Step 6: Commit**

```bash
git add packages/cogpit-memory/src/cli.ts packages/cogpit-memory/src/__tests__/cli.test.ts
git commit -m "feat(cogpit-memory): add CLI entry with arg parsing and command dispatch"
```

---

### Task 9: Library Entry Point

**Files:**
- Create: `packages/cogpit-memory/src/index.ts`

**Step 1: Write library entry**

Write `packages/cogpit-memory/src/index.ts`:
```typescript
/**
 * cogpit-memory library — exports for cogpit integration.
 *
 * Usage from cogpit:
 *   import { SearchIndex } from "../packages/cogpit-memory"
 *   const index = new SearchIndex("~/.claude/cogpit-memory/search-index.db")
 *   index.startWatching(dirs.PROJECTS_DIR)
 */

// Core
export { SearchIndex, type IndexStats, type SearchHit } from "./lib/search-index"
export { parseSession, parseSessionAppend, getUserMessageText, getUserMessageImages } from "./lib/parser"
export { DEFAULT_DB_PATH, dirs } from "./lib/dirs"

// Commands
export { searchSessions, type SearchOptions, type SearchResponse } from "./commands/search"
export { getSessionOverview, getTurnDetail, getAgentOverview, getAgentTurnDetail } from "./commands/context"
export { listSessions, currentSession, type SessionSummary, type SessionsOptions } from "./commands/sessions"
export { indexStats, indexRebuild } from "./commands/index-cmd"

// Types
export type { ParsedSession, Turn, ToolCall, SubAgentMessage, SessionStats } from "./lib/types"
```

**Step 2: Verify import**

```bash
cd packages/cogpit-memory && bun -e "import { SearchIndex } from './src/index'; console.log('OK:', typeof SearchIndex)"
```
Expected: `OK: function`

**Step 3: Commit**

```bash
git add packages/cogpit-memory/src/index.ts
git commit -m "feat(cogpit-memory): add library entry with exports"
```

---

### Task 10: Skill File

**Files:**
- Create: `packages/cogpit-memory/skill/SKILL.md`

**Step 1: Write CLI-based skill**

Write `packages/cogpit-memory/skill/SKILL.md` — adapted from the design doc's CLI commands. Uses `bunx cogpit-memory` instead of curl. Same layer progression (L1 → L2 → L3), same search workflow.

Key sections:
- Search: `bunx cogpit-memory search <query> [options]`
- Context: `bunx cogpit-memory context <sessionId> [--turn N] [--agent ID]`
- Sessions: `bunx cogpit-memory sessions [--cwd path] [--current]`
- Index: `bunx cogpit-memory index stats|rebuild`
- Response shapes (same JSON as HTTP API)
- Quick reference table

**Step 2: Commit**

```bash
git add packages/cogpit-memory/skill/SKILL.md
git commit -m "feat(cogpit-memory): add CLI-based skill file"
```

---

### Task 11: Cogpit Integration

**Files:**
- Modify: `server/routes/session-search.ts` (update SearchIndex import)
- Modify: `server/api-plugin.ts` (update SearchIndex import)
- Modify: `electron/server.ts` (update SearchIndex import)

**Step 1: Update imports to use package**

In files that import from `../search-index`, change to import from `../../packages/cogpit-memory/src`:

```typescript
// Before:
import { SearchIndex } from "../search-index"

// After:
import { SearchIndex } from "../../packages/cogpit-memory/src"
```

**Step 2: Verify import works**

```bash
bun -e "import { SearchIndex } from './packages/cogpit-memory/src'; console.log('OK')"
```

**Step 3: Run full test suite**

```bash
bun run test
```
All 1186+ existing tests must still pass.

**Step 4: Commit**

```bash
git add server/routes/session-search.ts server/api-plugin.ts electron/server.ts
git commit -m "refactor: import SearchIndex from cogpit-memory package"
```

---

### Task 12: End-to-End Verification

**Step 1: CLI smoke tests**

```bash
cd packages/cogpit-memory

# Sessions
bun src/cli.ts sessions --limit 3
bun src/cli.ts sessions --current --cwd .

# Search (raw-scan fallback)
bun src/cli.ts search "parseSession" --max-age 7d

# Build index then search via FTS5
bun src/cli.ts index rebuild
bun src/cli.ts index stats
bun src/cli.ts search "parseSession" --max-age 7d

# Context (use session ID from sessions output)
bun src/cli.ts context <SESSION_ID>
bun src/cli.ts context <SESSION_ID> --turn 0
```

**Step 2: Verify JSON validity**

```bash
bun src/cli.ts sessions --limit 3 | jq .
bun src/cli.ts search "test" | jq .totalHits
```

**Step 3: Run all tests**

```bash
bun run test                          # Root project tests
cd packages/cogpit-memory && bun test # Package tests
```

**Step 4: Commit**

```bash
git add -A
git commit -m "test(cogpit-memory): end-to-end verification complete"
```
