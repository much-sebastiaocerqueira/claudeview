/** Count actually changed lines via LCS diff (matches EditDiffView logic exactly) */
export function diffLineCount(oldStr: string, newStr: string): { add: number; del: number } {
  if (!oldStr && !newStr) return { add: 0, del: 0 }
  const oldLines = oldStr ? oldStr.split("\n") : []
  const newLines = newStr ? newStr.split("\n") : []
  if (oldLines.length === 0) return { add: newLines.length, del: 0 }
  if (newLines.length === 0) return { add: 0, del: oldLines.length }

  const m = oldLines.length
  const n = newLines.length

  // Trim common prefix/suffix to shrink LCS matrix
  let prefix = 0
  while (prefix < m && prefix < n && oldLines[prefix] === newLines[prefix]) prefix++
  let suffix = 0
  while (
    suffix < m - prefix &&
    suffix < n - prefix &&
    oldLines[m - 1 - suffix] === newLines[n - 1 - suffix]
  ) suffix++

  const om = m - prefix - suffix
  const on = n - prefix - suffix
  if (om === 0) return { add: on, del: 0 }
  if (on === 0) return { add: 0, del: om }

  // LCS on the trimmed middle only
  const dp: number[][] = Array.from({ length: om + 1 }, () => Array(on + 1).fill(0))
  for (let i = 1; i <= om; i++) {
    for (let j = 1; j <= on; j++) {
      dp[i][j] =
        oldLines[prefix + i - 1] === newLines[prefix + j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Count added/removed by backtracking
  let add = 0
  let del = 0
  let i = om
  let j = on
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[prefix + i - 1] === newLines[prefix + j - 1]) {
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      add++; j--
    } else {
      del++; i--
    }
  }

  return { add, del }
}

// ── Net diff across multiple edits ─────────────────────────────────────────

export interface EditOp {
  oldString: string
  newString: string
  /** If true, this replaces the entire file (Write tool). */
  isWrite: boolean
}

export interface NetDiffResult {
  /** Lines that were net-removed (present in original, absent in final). */
  removed: string[]
  /** Lines that were net-added (absent in original, present in final). */
  added: string[]
  addCount: number
  delCount: number
}

/**
 * Compute the net diff for a single file across multiple sequential edit operations.
 *
 * Uses multiset-based line tracking: if a line was added by one edit and removed
 * by a later edit, they cancel out and neither appears in the result.
 *
 * Write operations reset tracking (they replace the entire file).
 */
export function computeNetDiff(ops: EditOp[]): NetDiffResult {
  const netAdded = new Map<string, number>()
  const netRemoved = new Map<string, number>()

  function addToMultiset(set: Map<string, number>, line: string): void {
    set.set(line, (set.get(line) ?? 0) + 1)
  }
  function removeFromMultiset(set: Map<string, number>, line: string): boolean {
    const count = set.get(line) ?? 0
    if (count <= 0) return false
    if (count === 1) set.delete(line)
    else set.set(line, count - 1)
    return true
  }

  for (const op of ops) {
    if (op.isWrite) {
      // Write replaces entire file — reset all tracking
      netAdded.clear()
      netRemoved.clear()
      // All lines of the new content are "added"
      const lines = op.newString ? op.newString.split("\n") : []
      for (const line of lines) {
        addToMultiset(netAdded, line)
      }
      continue
    }

    // Edit: process removals (old_string lines)
    const oldLines = op.oldString ? op.oldString.split("\n") : []
    for (const line of oldLines) {
      // If this line was previously added, they cancel out
      if (!removeFromMultiset(netAdded, line)) {
        addToMultiset(netRemoved, line)
      }
    }

    // Edit: process additions (new_string lines)
    const newLines = op.newString ? op.newString.split("\n") : []
    for (const line of newLines) {
      // If this line was previously removed, they cancel out
      if (!removeFromMultiset(netRemoved, line)) {
        addToMultiset(netAdded, line)
      }
    }
  }

  function flattenMultiset(set: Map<string, number>): string[] {
    const lines: string[] = []
    for (const [line, count] of set) {
      for (let i = 0; i < count; i++) lines.push(line)
    }
    return lines
  }

  const removed = flattenMultiset(netRemoved)
  const added = flattenMultiset(netAdded)

  return { removed, added, addCount: added.length, delCount: removed.length }
}
