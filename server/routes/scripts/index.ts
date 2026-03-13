import { stat } from "node:fs/promises"
import { resolve } from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { UseFn } from "../../helpers"
import { discoverScripts } from "./discovery"
import { processManager } from "./process-manager"

/** Validate that a path is an existing directory and resolve to absolute. */
async function validateDir(dir: string): Promise<string | null> {
  try {
    const resolved = resolve(dir)
    const info = await stat(resolved)
    return info.isDirectory() ? resolved : null
  } catch {
    return null
  }
}

/** Collect the full request body, parse as JSON, and call the handler. */
function readJsonBody(
  req: IncomingMessage,
  res: ServerResponse,
  handler: (body: Record<string, unknown>) => void,
): void {
  let raw = ""
  req.on("data", (chunk: string) => { raw += chunk })
  req.on("end", () => {
    try {
      handler(JSON.parse(raw))
    } catch {
      res.statusCode = 400
      res.end(JSON.stringify({ error: "Invalid JSON body" }))
    }
  })
}

/** Send a JSON response. */
function jsonResponse(res: ServerResponse, data: unknown, statusCode = 200): void {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(data))
}

export function registerScriptRoutes(use: UseFn) {
  // GET /api/scripts?dir=<projectDir> — discover scripts from package.json files
  use("/api/scripts", (req, res, next) => {
    if (req.method !== "GET") return next()

    const url = new URL(req.url || "/", "http://localhost")

    // Distinguish from sub-routes
    if (url.pathname !== "/api/scripts") return next()

    const dir = url.searchParams.get("dir")
    if (!dir) {
      return jsonResponse(res, { error: "dir query param required" }, 400)
    }

    validateDir(dir).then((resolved) => {
      if (!resolved) {
        return jsonResponse(res, { error: "Invalid directory" }, 400)
      }
      return discoverScripts(resolved)
        .then((scripts) => jsonResponse(res, scripts))
        .catch((err) => jsonResponse(res, { error: err.message }, 500))
    })
  })

  // POST /api/scripts/run — start a script
  use("/api/scripts/run", (req, res, next) => {
    if (req.method !== "POST") return next()

    readJsonBody(req, res, (body) => {
      const { scriptName, packageDir, source } = body as {
        scriptName?: string
        packageDir?: string
        source?: string
      }
      if (!scriptName || !packageDir) {
        return jsonResponse(res, { error: "scriptName and packageDir required" }, 400)
      }

      // Validate scriptName: only allow alphanumeric, hyphens, colons, and underscores
      if (!/^[\w:.-]+$/.test(scriptName)) {
        return jsonResponse(res, { error: "Invalid script name" }, 400)
      }

      validateDir(packageDir).then((resolved) => {
        if (!resolved) {
          return jsonResponse(res, { error: "Invalid directory" }, 400)
        }

        const entry = processManager.spawn({
          name: scriptName,
          scriptName,
          cwd: resolved,
          source: source || "root/",
        })

        jsonResponse(res, entry)
      })
    })
  })

  // POST /api/scripts/stop — stop a running script
  use("/api/scripts/stop", (req, res, next) => {
    if (req.method !== "POST") return next()

    readJsonBody(req, res, (body) => {
      const { processId } = body as { processId?: string }
      if (!processId) {
        return jsonResponse(res, { error: "processId required" }, 400)
      }

      jsonResponse(res, { success: processManager.stop(processId) })
    })
  })

  // POST /api/scripts/remove — remove a process from the registry
  use("/api/scripts/remove", (req, res, next) => {
    if (req.method !== "POST") return next()

    readJsonBody(req, res, (body) => {
      const { processId } = body as { processId?: string }
      if (!processId) {
        return jsonResponse(res, { error: "processId required" }, 400)
      }

      jsonResponse(res, { success: processManager.remove(processId) })
    })
  })

  // GET /api/scripts/processes — list all managed processes
  use("/api/scripts/processes", (req, res, next) => {
    if (req.method !== "GET") return next()
    jsonResponse(res, processManager.getAll())
  })

  // GET /api/scripts/output?id=<processId> — SSE stream for process output
  use("/api/scripts/output", (req, res, next) => {
    if (req.method !== "GET") return next()

    const url = new URL(req.url || "/", "http://localhost")
    const processId = url.searchParams.get("id")
    if (!processId) {
      return jsonResponse(res, { error: "id query param required" }, 400)
    }

    // Set up SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })

    // Send existing buffer as initial output
    const existing = processManager.getOutput(processId)
    if (existing) {
      res.write(`data: ${JSON.stringify({ type: "output", text: existing })}\n\n`)
    }

    // Subscribe for live updates
    processManager.subscribe(processId, res)

    req.on("close", () => {
      processManager.unsubscribe(processId, res)
    })
  })
}

// Re-export for cleanup registration
export { processManager } from "./process-manager"
