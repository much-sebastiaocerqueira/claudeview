#!/usr/bin/env bun
/**
 * Standalone server entry point for headless environments.
 * Reuses the same createAppServer() that Electron uses,
 * but without any Electron dependencies.
 */
import { join } from "node:path"
import { homedir } from "node:os"
import { mkdirSync } from "node:fs"
import { createAppServer } from "../electron/server"

const host = process.env.COGPIT_HOST || "127.0.0.1"
const port = parseInt(process.env.COGPIT_PORT || "19384", 10)
const dataDir = process.env.COGPIT_DATA_DIR || join(homedir(), ".config", "cogpit")

// Resolve static dir: built Vite output
const staticDir = join(import.meta.dirname, "../dist")

// Ensure data directory exists
mkdirSync(dataDir, { recursive: true })

const { httpServer } = await createAppServer(staticDir, dataDir)

httpServer.listen(port, host, () => {
  console.log(`Cogpit server listening on http://${host}:${port}`)
  console.log(`Data directory: ${dataDir}`)
})

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\nReceived ${signal}, shutting down...`)
    httpServer.close(() => process.exit(0))
  })
}
