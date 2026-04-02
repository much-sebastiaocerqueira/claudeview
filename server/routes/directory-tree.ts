import type { UseFn } from "../helpers"
import { sendJson } from "../helpers"
import { readdir, stat } from "node:fs/promises"
import { execFile } from "node:child_process"
import { join, relative } from "node:path"

const MAX_ENTRIES = 5000
const ALWAYS_HIDDEN = new Set([".git", ".DS_Store", "Thumbs.db"])

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

async function getGitRoot(dirPath: string): Promise<string | null> {
  try {
    const root = await execGit(["rev-parse", "--show-toplevel"], dirPath)
    return root.trim()
  } catch {
    return null
  }
}

async function getGitStatus(gitRoot: string): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>()
  try {
    const output = await execGit(["status", "--porcelain"], gitRoot)
    for (const line of output.split("\n")) {
      if (!line || line.length < 4) continue
      // Format: XY filename  (X=index, Y=worktree)
      const x = line[0]
      const y = line[1]
      const filePath = line.slice(3).trim()
      // Prefer worktree status, fall back to index status
      const status = y !== " " ? y : x
      statusMap.set(filePath, status)
    }
  } catch {
    // git status failed, return empty map
  }
  return statusMap
}

async function getGitIgnored(
  gitRoot: string,
  names: string[],
  dirPath: string,
): Promise<Set<string>> {
  if (names.length === 0) return new Set()
  try {
    const relativePaths = names.map((n) => relative(gitRoot, join(dirPath, n)))
    const output = await new Promise<string>((resolve) => {
      const child = execFile(
        "git",
        ["check-ignore", "--stdin"],
        { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 },
        (_err, stdout) => {
          // check-ignore exits with 1 when no paths are ignored — that's normal.
          // Always resolve with whatever stdout we got (may be empty).
          resolve(stdout || "")
        },
      )
      child.stdin?.write(relativePaths.join("\n"))
      child.stdin?.end()
    })
    const ignored = new Set<string>()
    for (const line of output.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // The output is relative paths; extract the basename
      const parts = trimmed.split("/")
      ignored.add(parts[parts.length - 1])
    }
    return ignored
  } catch {
    return new Set()
  }
}

export function registerDirectoryTreeRoutes(use: UseFn) {
  use("/api/directory-tree", async (req, res, next) => {
    if (req.method !== "GET") return next()

    const url = new URL(req.url || "", "http://localhost")
    const dirPath = url.searchParams.get("path")

    if (!dirPath) {
      return sendJson(res, 400, { error: "path query parameter required" })
    }

    if (!dirPath.startsWith("/")) {
      return sendJson(res, 400, { error: "path must be absolute" })
    }

    // Validate the path exists and is a directory
    try {
      const info = await stat(dirPath)
      if (!info.isDirectory()) {
        return sendJson(res, 400, { error: "path is not a directory" })
      }
    } catch {
      return sendJson(res, 404, { error: "Directory not found" })
    }

    try {
      const dirents = await readdir(dirPath, { withFileTypes: true })

      // Filter out always-hidden entries
      let filtered = dirents.filter((d) => !ALWAYS_HIDDEN.has(d.name))

      // Git integration
      const gitRoot = await getGitRoot(dirPath)
      let statusMap = new Map<string, string>()
      let ignoredSet = new Set<string>()

      if (gitRoot) {
        const [status, ignored] = await Promise.all([
          getGitStatus(gitRoot),
          getGitIgnored(
            gitRoot,
            filtered.map((d) => d.name),
            dirPath,
          ),
        ])
        statusMap = status
        ignoredSet = ignored

        // Filter out gitignored entries
        filtered = filtered.filter((d) => !ignoredSet.has(d.name))
      }

      // Sort: dirs first, then files, both alphabetical (case-insensitive)
      const dirs = filtered
        .filter((d) => d.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      const files = filtered
        .filter((d) => d.isFile() || d.isSymbolicLink())
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

      const sorted = [...dirs, ...files]
      const truncated = sorted.length > MAX_ENTRIES

      const entries = sorted.slice(0, MAX_ENTRIES).map((d) => {
        const entryPath = join(dirPath, d.name)
        const type = d.isDirectory() ? "dir" : "file"

        // Resolve git status for this entry
        let gitStatus: string | null = null
        if (gitRoot) {
          const relPath = relative(gitRoot, entryPath)
          gitStatus = statusMap.get(relPath) || null
        }

        return {
          name: d.name,
          path: entryPath,
          type,
          gitStatus,
        }
      })

      sendJson(res, 200, {
        entries,
        gitRoot,
        truncated,
      })
    } catch (err) {
      sendJson(res, 500, { error: String(err) })
    }
  })
}
