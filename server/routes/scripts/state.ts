import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import type { ManagedProcess } from "./process-manager"

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProcessState {
  processes: ManagedProcess[]
  lastUpdated: string
}

// ── Path ─────────────────────────────────────────────────────────────────────

const STATE_PATH = join(homedir(), ".claude", "agent-window", "process-state.json")

// ── Save / Load ──────────────────────────────────────────────────────────────

export function saveState(processes: ManagedProcess[]): void {
  try {
    const state: ProcessState = {
      processes: processes.map((p) => ({
        ...p,
        // Strip runtime-only fields
        pid: undefined,
      })),
      lastUpdated: new Date().toISOString(),
    }
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8")
  } catch {
    // best-effort persistence
  }
}

export function loadState(): ProcessState | null {
  try {
    const raw = readFileSync(STATE_PATH, "utf-8")
    const state: ProcessState = JSON.parse(raw)
    if (!Array.isArray(state.processes)) return null

    // On load: mark everything as stopped
    state.processes = state.processes.map((p) => ({
      ...p,
      status: "stopped" as const,
      pid: undefined,
    }))

    return state
  } catch {
    return null
  }
}
