import type { UseFn } from "../helpers"
import { sendJson, readFile } from "../helpers"
import { execFile } from "node:child_process"
import { dirname, basename } from "node:path"

const FILE_SIZE_LIMIT = 2 * 1024 * 1024 // 2MB

function gitShow(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", dirname(filePath), "show", `HEAD:./${basename(filePath)}`],
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout)
      },
    )
  })
}

export function registerGitFileDiffRoutes(use: UseFn) {
  // GET /api/git-file-diff?path=<absolute-file-path>
  // Returns { head: string, working: string } for rendering a diff in the UI.
  use("/api/git-file-diff", async (req, res, next) => {
    if (req.method !== "GET") return next()

    const url = new URL(req.url || "/", "http://localhost")
    const filePath = url.searchParams.get("path")

    if (!filePath) {
      return sendJson(res, 400, { error: "path query parameter required" })
    }

    try {
      // HEAD version — empty string for new/untracked files
      let head: string
      try {
        head = await gitShow(filePath)
      } catch {
        head = ""
      }

      let working: string
      try {
        const content = await readFile(filePath, "utf-8")
        working = String(content)
      } catch {
        // File deleted from working tree — show as all removals
        working = ""
      }

      if (head.length > FILE_SIZE_LIMIT || working.length > FILE_SIZE_LIMIT) {
        return sendJson(res, 422, { error: "File too large for diff view" })
      }

      sendJson(res, 200, { head, working })
    } catch (err) {
      sendJson(res, 500, { error: String(err) })
    }
  })
}
