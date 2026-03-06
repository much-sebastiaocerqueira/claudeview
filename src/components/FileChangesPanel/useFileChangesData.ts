import { useMemo } from "react"
import type { ParsedSession, ToolCall } from "@/lib/types"
import { computeNetDiff, type EditOp } from "@/lib/diffUtils"

export interface FileChange {
  turnIndex: number
  toolCall: ToolCall
  agentId?: string
}

export function useFileChangesData(session: ParsedSession) {
  // Stable cache key: total tool call count across all turns (cheaper than session object identity)
  const turnCount = session.turns.length
  const lastTurnToolCallCount = session.turns.at(-1)?.toolCalls.length ?? 0
  const totalToolCallCount = useMemo(() => {
    let count = 0
    for (const turn of session.turns) {
      count += turn.toolCalls.length
      for (const msg of turn.subAgentActivity) count += msg.toolCalls.length
    }
    return count
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cheap proxy deps to avoid full array comparison
  }, [turnCount, lastTurnToolCallCount])

  const fileChanges = useMemo(() => {
    const changes: FileChange[] = []
    const collectToolCall = (tc: ToolCall, turnIndex: number, agentId?: string) => {
      if (tc.name !== "Edit" && tc.name !== "Write") return
      changes.push({ turnIndex, toolCall: tc, agentId })
    }
    session.turns.forEach((turn, turnIndex) => {
      turn.toolCalls.forEach((tc) => collectToolCall(tc, turnIndex))
      turn.subAgentActivity.forEach((msg) => {
        msg.toolCalls.forEach((tc) => collectToolCall(tc, turnIndex, msg.agentId))
      })
    })
    return changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- totalToolCallCount is an intentional cache-busting key
  }, [totalToolCallCount, session.turns])

  // ── Grouped-by-file view with net diffs ─────────────────────────────────

  const lastTurnIndex = session.turns.length - 1

  /** Group file changes by file path, compute net diff per file. */
  const groupedByFile = useMemo(() => {
    return buildGroupedFiles(fileChanges, "all")
  }, [fileChanges])

  /** Same but filtered to only the last turn. */
  const groupedLastTurn = useMemo(() => {
    return buildGroupedFiles(fileChanges, lastTurnIndex)
  }, [fileChanges, lastTurnIndex])

  return {
    fileChanges,
    groupedByFile,
    groupedLastTurn,
    lastTurnIndex,
  }
}

// ── Grouped file types & builder ──────────────────────────────────────────

export interface GroupedFile {
  filePath: string
  /** Short display path (last 3 segments). */
  shortPath: string
  editCount: number
  turnRange: [number, number]
  /** Which tool types were used: "Edit", "Write", or both. */
  opTypes: ("Edit" | "Write")[]
  netAdded: string[]
  netRemoved: string[]
  addCount: number
  delCount: number
}

export function buildGroupedFiles(
  changes: FileChange[],
  scope: "all" | number,
): GroupedFile[] {
  // Group tool calls by file path (filtered by scope)
  const byFile = new Map<string, FileChange[]>()
  for (const fc of changes) {
    if (scope !== "all" && fc.turnIndex !== scope) continue
    const fp = String(fc.toolCall.input.file_path ?? fc.toolCall.input.path ?? "")
    if (!fp) continue
    let arr = byFile.get(fp)
    if (!arr) {
      arr = []
      byFile.set(fp, arr)
    }
    arr.push(fc)
  }

  const result: GroupedFile[] = []
  for (const [filePath, fcs] of byFile) {
    // Build edit ops in order for net diff
    const ops: EditOp[] = fcs.map((fc) => {
      const isEdit = fc.toolCall.name === "Edit"
      return {
        oldString: isEdit ? String(fc.toolCall.input.old_string ?? "") : "",
        newString: isEdit
          ? String(fc.toolCall.input.new_string ?? "")
          : String(fc.toolCall.input.content ?? ""),
        isWrite: !isEdit,
      }
    })

    const net = computeNetDiff(ops)
    const turns = fcs.map((fc) => fc.turnIndex)
    const minTurn = Math.min(...turns)
    const maxTurn = Math.max(...turns)

    const typeSet = new Set<"Edit" | "Write">()
    for (const fc of fcs) {
      if (fc.toolCall.name === "Edit") typeSet.add("Edit")
      else if (fc.toolCall.name === "Write") typeSet.add("Write")
    }

    result.push({
      filePath,
      shortPath: filePath.split("/").slice(-3).join("/"),
      editCount: fcs.length,
      turnRange: [minTurn, maxTurn],
      opTypes: [...typeSet],
      netAdded: net.added,
      netRemoved: net.removed,
      addCount: net.addCount,
      delCount: net.delCount,
    })
  }

  // Sort by first turn index, then by file path
  result.sort((a, b) => a.turnRange[0] - b.turnRange[0] || a.filePath.localeCompare(b.filePath))
  return result
}
