import { useState, useEffect, useCallback, useRef } from "react"
import { authFetch } from "@/lib/auth"
import type { ProcessEntry } from "@/hooks/useProcessPanel"

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
  source: string
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useScriptRunner(
  onProcessStarted?: (entry: ProcessEntry) => void,
  onProcessesUpdated?: (processes: ManagedProcess[]) => void,
) {
  const [runningProcesses, setRunningProcesses] = useState<Map<string, ManagedProcess>>(new Map())
  const onProcessesUpdatedRef = useRef(onProcessesUpdated)
  onProcessesUpdatedRef.current = onProcessesUpdated

  // Poll for process status updates
  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await authFetch("/api/scripts/processes")
        if (cancelled) return
        if (res.ok) {
          const processes: ManagedProcess[] = await res.json()
          const map = new Map<string, ManagedProcess>()
          for (const p of processes) map.set(p.id, p)
          setRunningProcesses(map)
          onProcessesUpdatedRef.current?.(processes)
        }
      } catch {
        // ignore
      }
    }

    poll()
    const interval = setInterval(poll, 5_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const runScript = useCallback(async (
    scriptName: string,
    packageDir: string,
    source: string,
  ) => {
    try {
      const res = await authFetch("/api/scripts/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptName, packageDir, source }),
      })
      if (res.ok) {
        const entry: ManagedProcess = await res.json()
        setRunningProcesses((prev) => {
          const next = new Map(prev)
          next.set(entry.id, entry)
          return next
        })
        // Notify the process panel
        onProcessStarted?.({
          id: entry.id,
          name: entry.name,
          type: "script",
          status: "running",
          source: entry.source,
        })
        return entry
      }
    } catch {
      // ignore
    }
    return null
  }, [onProcessStarted])

  const stopScript = useCallback(async (processId: string) => {
    try {
      await authFetch("/api/scripts/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId }),
      })
      setRunningProcesses((prev) => {
        const entry = prev.get(processId)
        if (!entry) return prev
        const next = new Map(prev)
        next.set(processId, { ...entry, status: "stopped" })
        return next
      })
    } catch {
      // ignore
    }
  }, [])

  return { runningProcesses, runScript, stopScript }
}
