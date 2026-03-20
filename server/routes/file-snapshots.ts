import type { UseFn } from "../helpers"
import { findJsonlPath, readFile, sendJson, homedir, join } from "../helpers"

export interface FileSnapshotInfo {
  earliestBackup: string | null
  latestBackup: string | null
  earliestVersion: number
  latestVersion: number
}

export interface ParsedSnapshots {
  snapshots: Map<string, FileSnapshotInfo>
  cwd: string
}

/**
 * Parse JSONL content and extract file-history-snapshot entries.
 * Returns a map of filePath → { earliestBackup, latestBackup, earliestVersion, latestVersion }
 * and the session cwd (needed to resolve absolute↔relative path mismatches).
 */
export function parseFileSnapshots(jsonlContent: string): ParsedSnapshots {
  const result = new Map<string, FileSnapshotInfo>()
  let cwd = ""
  if (!jsonlContent) return { snapshots: result, cwd }

  const lines = jsonlContent.split("\n").filter(Boolean)

  for (const line of lines) {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }

    // Extract cwd from assistant messages or system records
    if (!cwd && typeof obj.cwd === "string") cwd = obj.cwd

    if (obj.type !== "file-history-snapshot") continue

    const snapshot = obj.snapshot as Record<string, unknown> | undefined
    if (!snapshot) continue

    const backups = snapshot.trackedFileBackups as Record<string, { backupFileName: string | null; version: number }> | undefined
    if (!backups) continue

    for (const [filePath, info] of Object.entries(backups)) {
      const existing = result.get(filePath)
      if (!existing) {
        result.set(filePath, {
          earliestBackup: info.backupFileName,
          latestBackup: info.backupFileName,
          earliestVersion: info.version,
          latestVersion: info.version,
        })
      } else {
        if (info.version < existing.earliestVersion) {
          existing.earliestVersion = info.version
          existing.earliestBackup = info.backupFileName
        }
        if (info.version > existing.latestVersion) {
          existing.latestVersion = info.version
          existing.latestBackup = info.backupFileName
        }
      }
    }
  }

  return { snapshots: result, cwd }
}

/**
 * Look up a file in the snapshots map, trying both the exact path
 * and a relative version (absolute path with cwd prefix stripped).
 * Claude Code tool calls use absolute paths, but trackedFileBackups
 * uses relative paths from the session cwd.
 */
function findSnapshot(snapshots: Map<string, FileSnapshotInfo>, filePath: string, cwd: string): FileSnapshotInfo | undefined {
  // Try exact match first
  const exact = snapshots.get(filePath)
  if (exact) return exact

  // Try stripping cwd prefix to get relative path
  if (cwd && filePath.startsWith(cwd)) {
    const relative = filePath.slice(cwd.length).replace(/^\//, "")
    const rel = snapshots.get(relative)
    if (rel) return rel
  }

  // Try prepending cwd to see if the lookup path is relative
  if (cwd && !filePath.startsWith("/")) {
    const absolute = cwd.endsWith("/") ? cwd + filePath : cwd + "/" + filePath
    const abs = snapshots.get(absolute)
    if (abs) return abs
  }

  return undefined
}

const FILE_SIZE_LIMIT = 2 * 1024 * 1024 // 2MB

export function registerFileSnapshotRoutes(use: UseFn) {
  use("/api/file-snapshots/", async (req, res, next) => {
    if (req.method !== "GET") return next()

    const url = new URL(req.url || "/", "http://localhost")
    const parts = url.pathname.split("/").filter(Boolean)

    if (parts.length === 0) return next()

    const sessionId = decodeURIComponent(parts[0])

    try {
      const jsonlPath = await findJsonlPath(sessionId)
      if (!jsonlPath) return sendJson(res, 404, { error: "Session not found" })

      const jsonlContent = await readFile(jsonlPath, "utf-8")
      const { snapshots, cwd } = parseFileSnapshots(jsonlContent as string)

      // GET /api/file-snapshots/:sessionId — list all tracked files
      if (parts.length === 1) {
        const files = Array.from(snapshots.entries()).map(([filePath, info]) => ({
          filePath,
          versions: [info.earliestVersion, info.latestVersion],
          hasBackups: info.earliestBackup !== null || info.latestBackup !== null,
        }))
        return sendJson(res, 200, { files })
      }

      // GET /api/file-snapshots/:sessionId/:filePath
      const filePath = decodeURIComponent(parts.slice(1).join("/"))
      const info = findSnapshot(snapshots, filePath, cwd)

      if (!info) return sendJson(res, 200, null)

      const fileHistoryDir = join(homedir(), ".claude", "file-history", sessionId)

      let before: string | null = null
      let after: string | null = null

      if (info.earliestBackup) {
        try {
          const content = await readFile(join(fileHistoryDir, info.earliestBackup), "utf-8")
          const str = String(content)
          if (str.length <= FILE_SIZE_LIMIT) before = str
        } catch {
          // backup file missing or unreadable
        }
      }

      if (info.latestBackup) {
        try {
          const content = await readFile(join(fileHistoryDir, info.latestBackup), "utf-8")
          const str = String(content)
          if (str.length <= FILE_SIZE_LIMIT) after = str
        } catch {
          // backup file missing or unreadable
        }
      }

      sendJson(res, 200, {
        before,
        after,
        versions: [info.earliestVersion, info.latestVersion],
      })
    } catch (err) {
      sendJson(res, 500, { error: String(err) })
    }
  })
}
