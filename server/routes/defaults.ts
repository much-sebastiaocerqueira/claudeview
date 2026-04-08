import { execFile } from "node:child_process"
import type { NextHandleFunction } from "connect"

type Use = (path: string, handler: NextHandleFunction) => void

/** Claude Code's default effort when no --effort flag is passed. */
const CLAUDE_DEFAULT_EFFORT = "medium"

interface Defaults {
  model: string | null
  effort: string
}

let cachedDefaults: Defaults | null = null

function queryClaudeModel(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("claude", ["model"], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }
      // Output looks like: Claude Opus 4.6 (`claude-opus-4-6[1m]`)
      // Extract the model ID from backticks
      const match = stdout.match(/`([^`]+)`/)
      if (match) {
        // Strip context suffixes like [1m]
        resolve(match[1].replace(/\[[\w]+\]$/, ""))
      } else {
        resolve(null)
      }
    })
  })
}

export function registerDefaultsRoutes(use: Use) {
  // GET /api/defaults — return Claude Code's actual default model and effort
  use("/api/defaults", async (_req, res, next) => {
    if (_req.method !== "GET") return next()

    try {
      if (!cachedDefaults) {
        const model = await queryClaudeModel()
        cachedDefaults = { model, effort: CLAUDE_DEFAULT_EFFORT }
      }
      res.statusCode = 200
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify(cachedDefaults))
    } catch {
      res.statusCode = 500
      res.end(JSON.stringify({ error: "Failed to query defaults" }))
    }
  })
}
