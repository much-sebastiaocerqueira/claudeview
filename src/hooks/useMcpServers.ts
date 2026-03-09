import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { authFetch } from "@/lib/auth"

export interface McpServer {
  name: string
  status: "connected" | "needs_auth" | "error"
}

type McpConfigs = Record<string, Record<string, unknown>>

const STORAGE_PREFIX = "cogpit:mcpSelection:"

/** Extract the set of connected server names from a server list. */
function connectedNameSet(servers: McpServer[]): Set<string> {
  return new Set(servers.filter(s => s.status === "connected").map(s => s.name))
}

function loadSavedSelection(key: string): string[] | null {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

function saveSelection(key: string, selected: string[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(selected))
  } catch { /* ignore */ }
}

/**
 * @param cwd - Project working directory (used to fetch MCP server list)
 * @param dirName - Project dirName (used as fallback storage key for new sessions)
 * @param sessionFileName - Current session fileName (used as per-session storage key)
 */
export function useMcpServers(
  cwd: string | undefined,
  dirName: string | undefined,
  sessionFileName: string | undefined,
) {
  const [servers, setServers] = useState<McpServer[]>([])
  const [configs, setConfigs] = useState<McpConfigs>({})
  const [selectedServers, setSelectedServers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const dirNameRef = useRef(dirName)
  dirNameRef.current = dirName

  // Per-session storage key, falling back to project-level for new sessions
  const storageKey = sessionFileName ?? dirName ?? null
  const storageKeyRef = useRef(storageKey)
  storageKeyRef.current = storageKey

  // When session changes, load that session's saved MCP selection
  useEffect(() => {
    if (!storageKey || servers.length === 0) return
    const saved = loadSavedSelection(storageKey)
    if (saved) {
      const connected = connectedNameSet(servers)
      setSelectedServers(saved.filter(name => connected.has(name)))
    } else if (dirName && storageKey !== dirName) {
      // New session with no saved selection — inherit from project default
      const projectSaved = loadSavedSelection(dirName)
      if (projectSaved) {
        const connected = connectedNameSet(servers)
        setSelectedServers(projectSaved.filter(name => connected.has(name)))
      }
    }
  }, [storageKey, dirName, servers])

  // Fetch servers from backend
  useEffect(() => {
    if (!cwd) return
    setLoading(true)
    setLoaded(false)

    authFetch(`/api/mcp-servers?cwd=${encodeURIComponent(cwd)}`)
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        const fetched: McpServer[] = data.servers ?? []
        const fetchedConfigs: McpConfigs = data.configs ?? {}
        setServers(fetched)
        setConfigs(fetchedConfigs)

        // Initialize selection: use saved prefs or auto-select connected
        const key = storageKeyRef.current
        const saved = key ? loadSavedSelection(key) : null
        const connected = connectedNameSet(fetched)
        if (saved) {
          setSelectedServers(saved.filter(name => connected.has(name)))
        } else {
          setSelectedServers([...connected])
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => {
        setLoading(false)
        setLoaded(true)
      })
  }, [cwd])

  const toggleServer = useCallback((name: string) => {
    setSelectedServers(prev => {
      const next = prev.includes(name)
        ? prev.filter(n => n !== name)
        : [...prev, name]
      if (storageKeyRef.current) saveSelection(storageKeyRef.current, next)
      return next
    })
  }, [])

  const refresh = useCallback(() => {
    if (!cwd) return
    setLoading(true)
    authFetch(`/api/mcp-servers?cwd=${encodeURIComponent(cwd)}&refresh=1`)
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        const fetched: McpServer[] = data.servers ?? []
        const fetchedConfigs: McpConfigs = data.configs ?? {}
        setServers(fetched)
        setConfigs(fetchedConfigs)

        // Reconcile selection: drop servers no longer connected, auto-select newly connected
        const connected = connectedNameSet(fetched)
        setSelectedServers(prev => {
          const kept = prev.filter(name => connected.has(name))
          const newlyConnected = [...connected].filter(name => !prev.includes(name))
          const next = [...kept, ...newlyConnected]
          if (storageKeyRef.current) saveSelection(storageKeyRef.current, next)
          return next
        })
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false))
  }, [cwd])

  // Compute MCP config JSON for --strict-mcp-config --mcp-config
  // null = use default config (all servers), string = only load these servers
  const mcpConfigJson = useMemo(() => {
    if (servers.length === 0) return null

    const connected = connectedNameSet(servers)
    const allSelected = selectedServers.length === connected.size && connected.size > 0
    if (allSelected) return null

    // Build config with only selected servers
    const selectedConfigs: McpConfigs = {}
    for (const name of selectedServers) {
      if (configs[name]) {
        selectedConfigs[name] = configs[name]
      }
    }
    return JSON.stringify({ mcpServers: selectedConfigs })
  }, [selectedServers, configs, servers])

  return {
    servers,
    selectedServers,
    mcpConfigJson,
    loading,
    loaded,
    toggleServer,
    refresh,
  }
}
