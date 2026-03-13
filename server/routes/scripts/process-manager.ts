import { spawn, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import type { ServerResponse } from "node:http"
import { saveState, loadState } from "./state"

// ── Types ────────────────────────────────────────────────────────────────────

export interface ManagedProcess {
  id: string
  name: string
  command: string
  cwd: string
  type: "script" | "task" | "terminal"
  status: "running" | "stopped" | "errored"
  pid?: number
  startedAt?: string
  stoppedAt?: string
  source: string // relative dir label
}

interface LiveProcess {
  child: ChildProcess
  entry: ManagedProcess
  buffer: string
  sseClients: Set<ServerResponse>
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_BUFFER = 100_000 // 100KB ring buffer

// ── Process Manager ──────────────────────────────────────────────────────────

class ProcessManager {
  private processes = new Map<string, LiveProcess>()
  private stoppedEntries: ManagedProcess[] = [] // restored from disk

  constructor() {
    // Load previous state on init
    const state = loadState()
    if (state) {
      this.stoppedEntries = state.processes
    }
  }

  spawn(opts: {
    name: string
    scriptName: string
    cwd: string
    source: string
  }): ManagedProcess {
    const id = `proc_${randomUUID().slice(0, 8)}`
    const command = `bun run ${opts.scriptName}`

    const child = spawn("bun", ["run", opts.scriptName], {
      cwd: opts.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    })

    const entry: ManagedProcess = {
      id,
      name: opts.name,
      command,
      cwd: opts.cwd,
      type: "script",
      status: "running",
      pid: child.pid,
      startedAt: new Date().toISOString(),
      source: opts.source,
    }

    const live: LiveProcess = {
      child,
      entry,
      buffer: "",
      sseClients: new Set(),
    }

    this.processes.set(id, live)

    // Remove from stopped entries if restarting same script
    this.stoppedEntries = this.stoppedEntries.filter(
      (e) => !(e.name === opts.name && e.cwd === opts.cwd)
    )

    const appendOutput = (text: string) => {
      live.buffer += text
      if (live.buffer.length > MAX_BUFFER) {
        live.buffer = live.buffer.slice(-MAX_BUFFER)
      }
      this.broadcast(live, { type: "output", text })
    }

    child.stdout?.on("data", (data: Buffer) => appendOutput(data.toString()))
    child.stderr?.on("data", (data: Buffer) => appendOutput(data.toString()))

    child.on("exit", (code) => {
      entry.status = code === 0 ? "stopped" : "errored"
      entry.stoppedAt = new Date().toISOString()
      entry.pid = undefined
      this.broadcast(live, { type: "status", status: entry.status, code })
      this.persistState()
    })

    child.on("error", (err) => {
      entry.status = "errored"
      entry.stoppedAt = new Date().toISOString()
      appendOutput(`\nProcess error: ${err.message}\n`)
      this.persistState()
    })

    this.persistState()
    return entry
  }

  stop(processId: string): boolean {
    const live = this.processes.get(processId)
    if (!live) return false

    if (live.entry.status === "running") {
      try {
        live.child.kill("SIGTERM")
      } catch {
        // already dead
      }
    }

    live.entry.status = "stopped"
    live.entry.stoppedAt = new Date().toISOString()
    live.entry.pid = undefined
    this.persistState()
    return true
  }

  remove(processId: string): boolean {
    const live = this.processes.get(processId)
    if (live) {
      if (live.entry.status === "running") this.stop(processId)
      // Close SSE connections
      for (const client of live.sseClients) {
        try { client.end() } catch { /* ignore */ }
      }
      this.processes.delete(processId)
    }
    // Also remove from stopped entries
    this.stoppedEntries = this.stoppedEntries.filter((e) => e.id !== processId)
    this.persistState()
    return true
  }

  getAll(): ManagedProcess[] {
    const live = [...this.processes.values()].map((l) => l.entry)
    // Include stopped entries from previous sessions that aren't superseded
    const liveKeys = new Set(live.map((e) => `${e.name}:${e.cwd}`))
    const restored = this.stoppedEntries.filter((e) => !liveKeys.has(`${e.name}:${e.cwd}`))
    return [...live, ...restored]
  }

  getOutput(processId: string): string {
    return this.processes.get(processId)?.buffer ?? ""
  }

  subscribe(processId: string, res: ServerResponse): void {
    const live = this.processes.get(processId)
    if (live) {
      live.sseClients.add(res)
    }
  }

  unsubscribe(processId: string, res: ServerResponse): void {
    const live = this.processes.get(processId)
    if (live) {
      live.sseClients.delete(res)
    }
  }

  cleanup(): void {
    for (const [, live] of this.processes) {
      if (live.entry.status === "running") {
        try {
          live.child.kill("SIGTERM")
        } catch { /* ignore */ }
      }
    }
    this.persistState()
  }

  private broadcast(live: LiveProcess, data: Record<string, unknown>): void {
    const message = `data: ${JSON.stringify(data)}\n\n`
    for (const client of live.sseClients) {
      try {
        client.write(message)
      } catch {
        live.sseClients.delete(client)
      }
    }
  }

  private persistTimer: ReturnType<typeof setTimeout> | null = null

  private persistState(): void {
    // Debounce to avoid blocking on rapid status changes
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      saveState(this.getAll())
    }, 500)
  }
}

export const processManager = new ProcessManager()
