import { useMemo } from "react"
import type { ParsedSession } from "@/lib/types"

export interface BackgroundProcessSummary {
  id: string
  kind: "agent" | "bash"
  label: string
  description: string | null
  status: "running" | "completed" | "error"
  durationMs: number | null
  toolUseCount: number | null
  turnIndex: number
  /** For Bash processes: path to the output file (extracted from tool result) */
  outputPath: string | null
}

/**
 * Extracts all background processes from a session:
 * - Agent/Task tool calls with run_in_background: true
 * - Bash tool calls with run_in_background: true
 *
 * For each, determines whether it's still running (no result) or completed.
 */
export function useBackgroundProcesses(session: ParsedSession | null): BackgroundProcessSummary[] {
  return useMemo(() => {
    if (!session) return []

    const results: BackgroundProcessSummary[] = []

    for (let turnIdx = 0; turnIdx < session.turns.length; turnIdx++) {
      const turn = session.turns[turnIdx]

      for (const tc of turn.toolCalls) {
        const input = tc.input as Record<string, unknown>
        if (input.run_in_background !== true) continue

        if (tc.name === "Agent" || tc.name === "Task") {
          const hasResult = tc.result !== null
          const isError = tc.isError
          results.push({
            id: tc.id,
            kind: "agent",
            label: (input.subagent_type as string) ?? (input.name as string) ?? "Agent",
            description: (input.description as string) ?? (input.prompt as string) ?? null,
            status: isError ? "error" : hasResult ? "completed" : "running",
            durationMs: null,
            toolUseCount: null,
            turnIndex: turnIdx,
            outputPath: null,
          })
        } else if (tc.name === "Bash") {
          const hasResult = tc.result !== null
          const isError = tc.isError
          const command = (input.command as string) ?? ""
          const desc = (input.description as string) ?? null
          // Extract output file path from the tool result
          const outputMatch = (tc.result || "").match(/Output is being written to:\s*(\S+)/)
          results.push({
            id: tc.id,
            kind: "bash",
            label: desc ?? command.slice(0, 60),
            description: desc ? command.slice(0, 80) : null,
            status: isError ? "error" : hasResult ? "completed" : "running",
            durationMs: null,
            toolUseCount: null,
            turnIndex: turnIdx,
            outputPath: outputMatch ? outputMatch[1] : null,
          })
        }
      }

      // Enrich agent entries with duration/toolUseCount from background_agent blocks
      for (const block of turn.contentBlocks) {
        if (block.kind !== "background_agent") continue
        for (const msg of block.messages) {
          const match = results.find(
            (r) => r.kind === "agent" && r.turnIndex === turnIdx && r.status !== "running"
          )
          if (match && msg.durationMs != null) {
            match.durationMs = msg.durationMs
            match.toolUseCount = msg.toolUseCount ?? null
          }
        }
      }
    }

    // Latest-spawned first
    return results.reverse()
  }, [session])
}
