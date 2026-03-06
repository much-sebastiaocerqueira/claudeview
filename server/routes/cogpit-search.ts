/**
 * /api/cogpit-search — deep session search powered by local cogpit-memory package.
 *
 * Imports `searchSessions` from packages/cogpit-memory and returns results
 * shaped as ActiveSessionInfo[] so the LiveSessions UI can render them directly.
 */

import type { UseFn } from "../helpers"
import { findJsonlPath, getSessionMeta, projectDirToReadableName, sendJson, stat, basename, join } from "../helpers"
import { searchSessions } from "../../packages/cogpit-memory/src/commands/search"

export function registerCogpitSearchRoutes(use: UseFn) {
  use("/api/cogpit-search", async (req, res, next) => {
    if (req.method !== "GET") return next()

    const url = new URL(req.url || "/", "http://localhost")
    const query = url.searchParams.get("q")
    const limitRaw = url.searchParams.get("limit") || "20"
    const maxAge = url.searchParams.get("maxAge") || "30d"

    if (!query || query.length < 2) {
      return sendJson(res, 400, { error: "Query parameter 'q' is required and must be at least 2 characters" })
    }

    const limit = Math.min(Math.max(1, parseInt(limitRaw, 10) || 20), 100)

    try {
      const result = await searchSessions(query, {
        limit,
        maxAge,
        caseSensitive: false,
      })

      if ("error" in result) {
        return sendJson(res, 400, result)
      }

      // Map cogpit-memory results → ActiveSessionInfo[]
      const sessions = await Promise.all(
        result.results.map(async (sr) => {
          // Find the JSONL file to get dirName/fileName
          const jsonlPath = await findJsonlPath(sr.sessionId)
          if (!jsonlPath) return null

          const dirName = basename(join(jsonlPath, ".."))
          const fileName = basename(jsonlPath)

          let meta: Awaited<ReturnType<typeof getSessionMeta>> | null = null
          let fileSize = 0
          let mtimeMs = 0
          try {
            const [m, s] = await Promise.all([getSessionMeta(jsonlPath), stat(jsonlPath)])
            meta = m
            fileSize = s.size
            mtimeMs = s.mtimeMs
          } catch { /* ignore */ }

          const { shortName } = projectDirToReadableName(dirName)

          // Use the first hit's snippet as the matchedMessage
          const firstSnippet = sr.hits[0]?.snippet || ""

          return {
            dirName,
            projectShortName: shortName,
            fileName,
            sessionId: sr.sessionId,
            slug: meta?.slug,
            firstUserMessage: meta?.firstUserMessage,
            lastUserMessage: meta?.lastUserMessage,
            gitBranch: meta?.gitBranch,
            cwd: sr.cwd || meta?.cwd,
            lastModified: mtimeMs ? new Date(mtimeMs).toISOString() : new Date().toISOString(),
            turnCount: meta?.turnCount,
            size: fileSize,
            isActive: mtimeMs ? Date.now() - mtimeMs < 5 * 60 * 1000 : false,
            matchedMessage: firstSnippet,
            hitCount: sr.hits.length,
          }
        })
      )

      const filtered = sessions.filter(Boolean)
      sendJson(res, 200, filtered)
    } catch (err) {
      sendJson(res, 500, { error: String(err) })
    }
  })
}
