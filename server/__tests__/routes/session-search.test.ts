// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../helpers", () => ({
  findJsonlPath: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  join: (...parts: string[]) => parts.join("/"),
  dirs: { PROJECTS_DIR: "/mock/projects" },
}))

vi.mock("../../../src/lib/parser", () => ({
  parseSession: vi.fn(),
}))

import { findJsonlPath, readFile, readdir, stat } from "../../helpers"
import { parseSession } from "../../../src/lib/parser"
import { registerSessionSearchRoutes } from "../../routes/session-search"
import type { UseFn, Middleware } from "../../helpers"
import type { ParsedSession, Turn, TokenUsage } from "../../../src/lib/types"

const mockedFindJsonlPath = vi.mocked(findJsonlPath)
const mockedReadFile = vi.mocked(readFile)
const mockedReaddir = vi.mocked(readdir)
const mockedStat = vi.mocked(stat)
const mockedParseSession = vi.mocked(parseSession)

// ── Test helpers ─────────────────────────────────────────────────────────────

function createMockReqRes(method: string, url: string) {
  let statusCode = 200
  const headers: Record<string, string> = {}
  let body = ""

  const req = {
    method,
    url,
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
  }

  const res = {
    get statusCode() { return statusCode },
    set statusCode(v: number) { statusCode = v },
    setHeader: vi.fn((k: string, v: string) => { headers[k] = v }),
    end: vi.fn((data?: string) => { body = data || "" }),
    _getData: () => body,
    _getStatus: () => statusCode,
    _getHeaders: () => headers,
  }

  const next = vi.fn()
  return { req, res, next }
}

function makeTokenUsage(input = 1000, output = 500): TokenUsage {
  return { input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
}

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: "turn-1",
    userMessage: "Hello world",
    contentBlocks: [],
    thinking: [],
    assistantText: ["I can help with that."],
    toolCalls: [],
    subAgentActivity: [],
    timestamp: "2026-03-02T10:00:00Z",
    durationMs: 5000,
    tokenUsage: makeTokenUsage(),
    model: "claude-opus-4-6",
    ...overrides,
  }
}

function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    sessionId: "test-session-123",
    version: "1.0",
    gitBranch: "main",
    cwd: "/projects/myapp",
    slug: "myapp",
    model: "claude-opus-4-6",
    turns: [makeTurn()],
    stats: {
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCostUSD: 0.05,
      toolCallCounts: {},
      errorCount: 0,
      totalDurationMs: 5000,
      turnCount: 1,
    },
    rawMessages: [],
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("registerSessionSearchRoutes", () => {
  let handler: Middleware

  beforeEach(() => {
    vi.resetAllMocks()
    const handlers = new Map<string, Middleware>()
    const use: UseFn = (path, h) => { handlers.set(path, h) }
    registerSessionSearchRoutes(use)
    handler = handlers.get("/api/session-search")!
  })

  // ── Method guard ──────────────────────────────────────────────────────────

  it("calls next for non-GET methods", async () => {
    const { req, res, next } = createMockReqRes("POST", "/?q=test")
    await handler(req as never, res as never, next)
    expect(next).toHaveBeenCalled()
  })

  // ── Parameter validation ──────────────────────────────────────────────────

  describe("parameter validation", () => {
    it("returns 400 when q is missing", async () => {
      const { req, res, next } = createMockReqRes("GET", "/")
      await handler(req as never, res as never, next)
      expect(res._getStatus()).toBe(400)
      expect(JSON.parse(res._getData()).error).toContain("required")
    })

    it("returns 400 when q is too short", async () => {
      const { req, res, next } = createMockReqRes("GET", "/?q=a")
      await handler(req as never, res as never, next)
      expect(res._getStatus()).toBe(400)
      expect(JSON.parse(res._getData()).error).toContain("at least 2 characters")
    })
  })

  // ── Single-session search ─────────────────────────────────────────────────

  describe("single-session search", () => {
    it("returns hits from user messages", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("hello world keyword here" as never) // raw text
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ userMessage: "please search for keyword in the code" })],
      }))
      // No subagents dir
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test-session-123")
      await handler(req as never, res as never, next)

      expect(res._getStatus()).toBe(200)
      const data = JSON.parse(res._getData())
      expect(data.results).toHaveLength(1)
      expect(data.results[0].hits.some((h: any) => h.location === "turn/0/userMessage")).toBe(true)
    })

    it("returns hits from assistant text", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("hello world keyword here" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ assistantText: ["The keyword was found in three places."] })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test-session-123")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.results[0].hits.some((h: any) => h.location === "turn/0/assistantMessage")).toBe(true)
    })

    it("returns hits from tool call inputs with toolName", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({
          userMessage: "no match here",
          assistantText: ["no match"],
          toolCalls: [{ id: "tc1", name: "Read", input: { file_path: "/keyword/file.ts" }, result: "ok", isError: false, timestamp: "" }],
        })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test-session-123")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const hit = data.results[0].hits.find((h: any) => h.location === "turn/0/toolCall/tc1/input")
      expect(hit).toBeDefined()
      expect(hit.toolName).toBe("Read")
    })

    it("returns hits from tool call results", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({
          userMessage: "no match",
          assistantText: ["no match"],
          toolCalls: [{ id: "tc1", name: "Grep", input: {}, result: "found keyword on line 42", isError: false, timestamp: "" }],
        })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test-session-123")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const hit = data.results[0].hits.find((h: any) => h.location === "turn/0/toolCall/tc1/result")
      expect(hit).toBeDefined()
      expect(hit.toolName).toBe("Grep")
    })

    it("returns hits from thinking blocks", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({
          userMessage: "no match",
          assistantText: ["no match"],
          thinking: [{ type: "thinking", thinking: "I should look for keyword in the codebase", signature: "sig" }],
        })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test-session-123")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.results[0].hits.some((h: any) => h.location === "turn/0/thinking")).toBe(true)
    })

    it("returns hits from sub-agent activity with agentName", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({
          userMessage: "no match",
          assistantText: ["no match"],
          subAgentActivity: [{
            agentId: "agent-abc",
            agentName: "researcher",
            subagentType: "Explore",
            type: "assistant",
            content: [],
            toolCalls: [],
            thinking: [],
            text: ["Found keyword in several files"],
            timestamp: "",
            tokenUsage: null,
            model: null,
            isBackground: false,
          }],
        })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test-session-123")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const hit = data.results[0].hits.find((h: any) => h.location === "agent/agent-abc/assistantMessage")
      expect(hit).toBeDefined()
      expect(hit.agentName).toBe("researcher")
    })

    it("returns hits from compaction summaries", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({
          userMessage: "no match",
          assistantText: ["no match"],
          compactionSummary: "Previous context discussed keyword handling",
        })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test-session-123")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.results[0].hits.some((h: any) => h.location === "turn/0/compactionSummary")).toBe(true)
    })

    it("returns empty results when no matches", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("nothing relevant here" as never) // raw text doesn't match
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test-session-123")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.results).toHaveLength(0)
      expect(data.totalHits).toBe(0)
      expect(data.sessionsSearched).toBe(1)
    })
  })

  // ── Cross-session search ──────────────────────────────────────────────────

  describe("cross-session search", () => {
    it("searches across multiple project directories", async () => {
      // Discovery: two project dirs with one session each
      mockedReaddir.mockResolvedValueOnce([
        { name: "project-a", isDirectory: () => true },
        { name: "project-b", isDirectory: () => true },
      ] as never)
      // Project A files
      mockedReaddir.mockResolvedValueOnce(["session-a.jsonl"] as never)
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      // Project B files
      mockedReaddir.mockResolvedValueOnce(["session-b.jsonl"] as never)
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() - 1000 } as never)

      // Raw text match for session A
      mockedReadFile.mockResolvedValueOnce("contains keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        sessionId: "session-a",
        turns: [makeTurn({ userMessage: "keyword match" })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT")) // no subagents for session A

      // Raw text match for session B
      mockedReadFile.mockResolvedValueOnce("also has keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        sessionId: "session-b",
        turns: [makeTurn({ userMessage: "keyword here too" })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT")) // no subagents for session B

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.sessionsSearched).toBe(2)
      expect(data.results).toHaveLength(2)
      // Most recent first
      expect(data.results[0].sessionId).toBe("session-a")
      expect(data.results[1].sessionId).toBe("session-b")
    })

    it("filters by maxAge", async () => {
      const now = Date.now()
      mockedReaddir.mockResolvedValueOnce([
        { name: "project-a", isDirectory: () => true },
      ] as never)
      mockedReaddir.mockResolvedValueOnce(["recent.jsonl", "old.jsonl"] as never)
      // recent file - 1 hour ago
      mockedStat.mockResolvedValueOnce({ mtimeMs: now - 3600_000 } as never)
      // old file - 10 days ago
      mockedStat.mockResolvedValueOnce({ mtimeMs: now - 10 * 24 * 3600_000 } as never)

      // Only the recent file should be searched
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        sessionId: "recent",
        turns: [makeTurn({ userMessage: "keyword" })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&maxAge=5d")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.sessionsSearched).toBe(1) // only the recent one
      expect(data.results[0].sessionId).toBe("recent")
    })
  })

  // ── Pre-filter ────────────────────────────────────────────────────────────

  describe("pre-filter", () => {
    it("skips parsing files that don't contain the query", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      // Raw content does NOT contain "zebra"
      mockedReadFile.mockResolvedValueOnce("no match in this content at all" as never)

      const { req, res, next } = createMockReqRes("GET", "/?q=zebra&sessionId=test")
      await handler(req as never, res as never, next)

      expect(mockedParseSession).not.toHaveBeenCalled()
      const data = JSON.parse(res._getData())
      expect(data.results).toHaveLength(0)
    })
  })

  // ── Snippet generation ────────────────────────────────────────────────────

  describe("snippets", () => {
    it("generates snippet centered on match with ellipsis", async () => {
      const longText = "a".repeat(200) + "KEYWORD" + "b".repeat(200)
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ userMessage: longText, assistantText: ["no match"] })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const hit = data.results[0].hits.find((h: any) => h.location === "turn/0/userMessage")
      expect(hit.snippet).toContain("...")
      expect(hit.snippet.length).toBeLessThanOrEqual(160) // 150 + "..." prefix/suffix
    })

    it("handles match at the beginning of text", async () => {
      const text = "KEYWORD" + "x".repeat(300)
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ userMessage: text, assistantText: ["no match"] })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const hit = data.results[0].hits[0]
      // Should NOT have "..." prefix since match is at start
      expect(hit.snippet.startsWith("...")).toBe(false)
      expect(hit.snippet.endsWith("...")).toBe(true)
    })

    it("handles match at the end of text", async () => {
      const text = "x".repeat(300) + "KEYWORD"
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ userMessage: text, assistantText: ["no match"] })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const hit = data.results[0].hits[0]
      expect(hit.snippet.startsWith("...")).toBe(true)
      expect(hit.snippet.endsWith("...")).toBe(false)
    })
  })

  // ── Case sensitivity ──────────────────────────────────────────────────────

  describe("case sensitivity", () => {
    it("default case-insensitive search matches different cases", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("Authentication here" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ userMessage: "Authentication is broken" })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=authentication&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.totalHits).toBeGreaterThan(0)
    })

    it("caseSensitive=true distinguishes case", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      // Raw text has "Authentication" but NOT "authentication"
      mockedReadFile.mockResolvedValueOnce("Authentication here" as never)

      const { req, res, next } = createMockReqRes("GET", "/?q=authentication&sessionId=test&caseSensitive=true")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      // raw pre-filter should skip since "authentication" (lowercase) not in "Authentication here"
      expect(data.totalHits).toBe(0)
    })
  })

  // ── Limits and counting ───────────────────────────────────────────────────

  describe("limits", () => {
    it("respects limit parameter", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      // Create 10 turns that all match
      const turns = Array.from({ length: 10 }, (_, i) =>
        makeTurn({ userMessage: `keyword in turn ${i}` }),
      )
      mockedParseSession.mockReturnValueOnce(makeSession({ turns }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test&limit=3")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.returnedHits).toBe(3)
      expect(data.totalHits).toBe(10)
      expect(data.results[0].hits).toHaveLength(3)
    })

    it("counts totalHits beyond limit", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      const turns = Array.from({ length: 5 }, () =>
        makeTurn({ userMessage: "keyword" }),
      )
      mockedParseSession.mockReturnValueOnce(makeSession({ turns }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test&limit=2")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.totalHits).toBe(5)
      expect(data.returnedHits).toBe(2)
    })

    it("sessionsSearched counts all files checked", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      // Pre-filter fails — no match
      mockedReadFile.mockResolvedValueOnce("nothing here" as never)

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.sessionsSearched).toBe(1)
      expect(data.results).toHaveLength(0)
    })
  })

  // ── Sub-agent file search ─────────────────────────────────────────────────

  describe("sub-agent file search", () => {
    it("discovers and searches sub-agent JSONL files", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/sessions/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)

      // Raw text match for main session
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ userMessage: "no match", assistantText: ["no match"] })],
      }))

      // Sub-agent directory listing
      mockedReaddir.mockResolvedValueOnce(["agent-abc123.jsonl"] as never)
      // Sub-agent raw text match
      mockedReadFile.mockResolvedValueOnce("sub-agent found keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        sessionId: "sub-session",
        turns: [makeTurn({ userMessage: "sub-agent found keyword here" })],
      }))
      // Sub-sub-agent directory (none)
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(data.totalHits).toBeGreaterThan(0)
      const hit = data.results[0].hits.find((h: any) => h.location.startsWith("agent/abc123/"))
      expect(hit).toBeDefined()
    })

    it("sub-agent hits have correct location format", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/sessions/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ userMessage: "no match", assistantText: ["no match"] })],
      }))

      mockedReaddir.mockResolvedValueOnce(["agent-xyz789.jsonl"] as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [
          makeTurn({ userMessage: "no match", assistantText: ["no match"] }),
          makeTurn({ userMessage: "keyword in second turn" }),
        ],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const hit = data.results[0].hits.find((h: any) => h.location === "agent/xyz789/turn/1/userMessage")
      expect(hit).toBeDefined()
    })
  })

  // ── Location format ───────────────────────────────────────────────────────

  describe("location format", () => {
    it("produces correct location paths for all field types", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({
          userMessage: "keyword",
          assistantText: ["keyword"],
          thinking: [{ type: "thinking", thinking: "keyword", signature: "sig" }],
          toolCalls: [{ id: "tc1", name: "Read", input: { q: "keyword" }, result: "keyword result", isError: false, timestamp: "" }],
        })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const locations = data.results[0].hits.map((h: any) => h.location)
      expect(locations).toContain("turn/0/userMessage")
      expect(locations).toContain("turn/0/assistantMessage")
      expect(locations).toContain("turn/0/thinking")
      expect(locations).toContain("turn/0/toolCall/tc1/input")
      expect(locations).toContain("turn/0/toolCall/tc1/result")
    })
  })

  // ── matchCount ────────────────────────────────────────────────────────────

  describe("matchCount", () => {
    it("counts multiple occurrences in a single field", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce("/mock/session.jsonl")
      mockedStat.mockResolvedValueOnce({ mtimeMs: Date.now() } as never)
      mockedReadFile.mockResolvedValueOnce("keyword" as never)
      mockedParseSession.mockReturnValueOnce(makeSession({
        turns: [makeTurn({ userMessage: "keyword appears keyword again keyword" })],
      }))
      mockedReaddir.mockRejectedValueOnce(new Error("ENOENT"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      const hit = data.results[0].hits.find((h: any) => h.location === "turn/0/userMessage")
      expect(hit.matchCount).toBe(3)
    })
  })

  // ── Error handling ────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns 500 on unexpected errors", async () => {
      mockedFindJsonlPath.mockRejectedValueOnce(new Error("Disk failure"))

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=test")
      await handler(req as never, res as never, next)

      expect(res._getStatus()).toBe(500)
      expect(JSON.parse(res._getData()).error).toContain("Disk failure")
    })

    it("handles session not found gracefully", async () => {
      mockedFindJsonlPath.mockResolvedValueOnce(null)

      const { req, res, next } = createMockReqRes("GET", "/?q=keyword&sessionId=nonexistent")
      await handler(req as never, res as never, next)

      const data = JSON.parse(res._getData())
      expect(res._getStatus()).toBe(200)
      expect(data.results).toHaveLength(0)
      expect(data.sessionsSearched).toBe(0)
    })
  })
})
