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

/** A single edit/write operation with its before/after strings. */
export interface IndividualEdit {
  oldString: string
  newString: string
  toolName: "Edit" | "Write"
  turnIndex: number
  agentId?: string
}

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
  /** Last sub-agent ID that modified this file (for navigation). */
  subAgentId: string | null
  /** Individual edits in order, for per-edit diff view. */
  edits: IndividualEdit[]
}

/** Extract the file path from an Edit or Write tool call. */
function getToolCallFilePath(tc: ToolCall): string {
  return String(tc.input.file_path ?? tc.input.path ?? "")
}

/** Convert a tool call into an EditOp for net diff computation. */
function toEditOp(tc: ToolCall): EditOp {
  const isEdit = tc.name === "Edit"
  return {
    oldString: isEdit ? String(tc.input.old_string ?? "") : "",
    newString: isEdit
      ? String(tc.input.new_string ?? "")
      : String(tc.input.content ?? ""),
    isWrite: !isEdit,
  }
}

export function buildGroupedFiles(
  changes: FileChange[],
  scope: "all" | number,
): GroupedFile[] {
  const byFile = new Map<string, FileChange[]>()
  for (const fc of changes) {
    if (scope !== "all" && fc.turnIndex !== scope) continue
    const fp = getToolCallFilePath(fc.toolCall)
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
    const ops = fcs.map((fc) => toEditOp(fc.toolCall))
    const net = computeNetDiff(ops)
    const turns = fcs.map((fc) => fc.turnIndex)

    const opTypes = [...new Set(fcs.map((fc) => fc.toolCall.name as "Edit" | "Write"))]
    const subAgentFc = fcs.findLast((fc) => !!fc.agentId)

    const edits: IndividualEdit[] = fcs.map((fc, i) => {
      const op = ops[i]
      return {
        oldString: op.oldString,
        newString: op.newString,
        toolName: fc.toolCall.name as "Edit" | "Write",
        turnIndex: fc.turnIndex,
        agentId: fc.agentId,
      }
    })

    result.push({
      filePath,
      shortPath: filePath.split("/").slice(-3).join("/"),
      editCount: fcs.length,
      turnRange: [Math.min(...turns), Math.max(...turns)],
      opTypes,
      netAdded: net.added,
      netRemoved: net.removed,
      addCount: net.addCount,
      delCount: net.delCount,
      subAgentId: subAgentFc?.agentId ?? null,
      edits,
    })
  }

  result.sort((a, b) => a.turnRange[1] - b.turnRange[1] || a.turnRange[0] - b.turnRange[0] || a.filePath.localeCompare(b.filePath))
  return result
}
