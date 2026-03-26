import { describe, it, expect } from "vitest"
import { renderHook } from "@testing-library/react"
import { useBackgroundProcesses } from "@/hooks/useBackgroundAgentSummary"
import type { ParsedSession, Turn, ToolCall, TurnContentBlock, SubAgentMessage } from "@/lib/types"

// ── Helpers ─────────────────────────────────────────────────────────────

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: "toolu_001",
    name: "Bash",
    input: {},
    result: null,
    isError: false,
    timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: "turn-1",
    userMessage: null,
    contentBlocks: [],
    thinking: [],
    assistantText: [],
    toolCalls: [],
    subAgentActivity: [],
    timestamp: "2026-01-01T00:00:00Z",
    durationMs: null,
    tokenUsage: null,
    model: null,
    ...overrides,
  }
}

function makeSession(turns: Turn[]): ParsedSession {
  return {
    sessionId: "test-session",
    version: "1.0",
    gitBranch: "main",
    cwd: "/project",
    slug: "test",
    model: "claude-opus-4-6-20250115",
    turns,
    stats: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCostUSD: 0,
      toolCallCounts: {},
      errorCount: 0,
      totalDurationMs: 0,
      turnCount: turns.length,
    },
    rawMessages: [],
  }
}

function makeSubAgentMessage(overrides: Partial<SubAgentMessage> = {}): SubAgentMessage {
  return {
    agentId: "agent-001",
    agentName: null,
    subagentType: null,
    type: "assistant",
    content: null,
    toolCalls: [],
    thinking: [],
    text: [],
    timestamp: "2026-01-01T00:00:00Z",
    tokenUsage: null,
    model: null,
    isBackground: true,
    ...overrides,
  }
}

function getProcesses(session: ParsedSession | null) {
  const { result } = renderHook(() => useBackgroundProcesses(session))
  return result.current
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("useBackgroundProcesses", () => {
  it("returns empty array for null session", () => {
    expect(getProcesses(null)).toEqual([])
  })

  it("returns empty array when no background processes exist", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({ name: "Bash", input: { command: "ls" } }),
        ],
      }),
    ])
    expect(getProcesses(session)).toEqual([])
  })

  it("detects Agent tool call with run_in_background", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({
            id: "toolu_agent",
            name: "Agent",
            input: {
              run_in_background: true,
              subagent_type: "explorer",
              description: "Find files",
            },
          }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs).toHaveLength(1)
    expect(procs[0].kind).toBe("agent")
    expect(procs[0].label).toBe("explorer")
    expect(procs[0].description).toBe("Find files")
    expect(procs[0].status).toBe("running")
  })

  it("detects Bash tool call with run_in_background", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({
            id: "toolu_bash",
            name: "Bash",
            input: {
              run_in_background: true,
              command: "npm run build",
              description: "Build project",
            },
          }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs).toHaveLength(1)
    expect(procs[0].kind).toBe("bash")
    expect(procs[0].label).toBe("Build project")
    expect(procs[0].description).toBe("npm run build")
    expect(procs[0].status).toBe("running")
  })

  it("marks completed when result exists", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({
            name: "Agent",
            input: { run_in_background: true, subagent_type: "test" },
            result: "Done",
          }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs[0].status).toBe("completed")
  })

  it("marks error when isError is true", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({
            name: "Bash",
            input: { run_in_background: true, command: "fail" },
            result: "Error occurred",
            isError: true,
          }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs[0].status).toBe("error")
  })

  it("extracts output path from Bash result", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({
            name: "Bash",
            input: { run_in_background: true, command: "long-task" },
            result: "Output is being written to: /tmp/output.txt\nStarted.",
          }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs[0].outputPath).toBe("/tmp/output.txt")
  })

  it("returns null outputPath when no path in result", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({
            name: "Bash",
            input: { run_in_background: true, command: "task" },
            result: "Running in background",
          }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs[0].outputPath).toBeNull()
  })

  it("returns processes in reverse order (latest first)", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({ id: "first", name: "Agent", input: { run_in_background: true, subagent_type: "a" } }),
          makeToolCall({ id: "second", name: "Agent", input: { run_in_background: true, subagent_type: "b" } }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs).toHaveLength(2)
    expect(procs[0].id).toBe("second")
    expect(procs[1].id).toBe("first")
  })

  it("enriches agent with duration from background_agent block", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({
            id: "toolu_agent",
            name: "Agent",
            input: { run_in_background: true, subagent_type: "explorer" },
            result: "Done",
          }),
        ],
        contentBlocks: [
          {
            kind: "background_agent",
            messages: [
              makeSubAgentMessage({
                agentId: "agent-001",
                durationMs: 5000,
                toolUseCount: 3,
              }),
            ],
          } as TurnContentBlock,
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs[0].durationMs).toBe(5000)
    expect(procs[0].toolUseCount).toBe(3)
  })

  it("ignores non-background tool calls", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({ name: "Agent", input: { subagent_type: "a" } }),
          makeToolCall({ name: "Bash", input: { command: "ls" } }),
          makeToolCall({ name: "Agent", input: { run_in_background: true, subagent_type: "bg" } }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs).toHaveLength(1)
    expect(procs[0].label).toBe("bg")
  })

  it("uses command as label when no description for Bash", () => {
    const session = makeSession([
      makeTurn({
        toolCalls: [
          makeToolCall({
            name: "Bash",
            input: { run_in_background: true, command: "npm run very-long-command-that-exceeds-sixty-characters-and-should-be-truncated" },
          }),
        ],
      }),
    ])
    const procs = getProcesses(session)
    expect(procs[0].label.length).toBeLessThanOrEqual(60)
  })
})
