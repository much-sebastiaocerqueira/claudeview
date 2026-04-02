import { useReducer, useCallback, useEffect, useMemo, useRef } from "react"
import { authFetch } from "@/lib/auth"
import type { GroupedFile } from "@/components/FileChangesPanel/useFileChangesData"

// ── Types ──────────────────────────────────────────────────────────────

interface DirectoryEntry {
  name: string
  path: string
  type: "file" | "dir"
  gitStatus: string | null
}

interface DirectoryTreeResponse {
  entries: DirectoryEntry[]
  gitRoot: string | null
  truncated: boolean
}

export interface FileTreeNode {
  id: string
  name: string
  path: string
  type: "file" | "dir"
  depth: number
  isExpanded: boolean
  isLoading: boolean
  gitStatus: string | null
  sessionEdits: number
  sessionAddCount: number
  sessionDelCount: number
  hasSessionDescendant: boolean
}

// ── State ──────────────────────────────────────────────────────────────

interface TreeState {
  /** Cached directory contents keyed by absolute dir path */
  cache: Map<string, DirectoryEntry[]>
  /** Set of currently expanded directory paths */
  expanded: Set<string>
  /** Set of directory paths currently being fetched */
  loading: Set<string>
  /** Root-level loading state */
  rootLoading: boolean
  /** Error message */
  error: string | null
}

type TreeAction =
  | { type: "FETCH_START"; path: string }
  | { type: "FETCH_SUCCESS"; path: string; entries: DirectoryEntry[] }
  | { type: "FETCH_ERROR"; path: string; error: string }
  | { type: "TOGGLE_EXPAND"; path: string }
  | { type: "COLLAPSE_ALL" }
  | { type: "RESET" }

function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "FETCH_START": {
      const loading = new Set(state.loading)
      loading.add(action.path)
      return { ...state, loading, rootLoading: state.cache.size === 0, error: null }
    }
    case "FETCH_SUCCESS": {
      const cache = new Map(state.cache)
      cache.set(action.path, action.entries)
      const expanded = new Set(state.expanded)
      expanded.add(action.path)
      const loading = new Set(state.loading)
      loading.delete(action.path)
      return { ...state, cache, expanded, loading, rootLoading: false }
    }
    case "FETCH_ERROR": {
      const loading = new Set(state.loading)
      loading.delete(action.path)
      return { ...state, loading, rootLoading: false, error: action.error }
    }
    case "TOGGLE_EXPAND": {
      const expanded = new Set(state.expanded)
      if (expanded.has(action.path)) {
        expanded.delete(action.path)
      } else {
        expanded.add(action.path)
      }
      return { ...state, expanded }
    }
    case "COLLAPSE_ALL":
      return { ...state, expanded: new Set<string>() }
    case "RESET":
      return initialState()
    default:
      return state
  }
}

function initialState(): TreeState {
  return {
    cache: new Map(),
    expanded: new Set(),
    loading: new Set(),
    rootLoading: false,
    error: null,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Build a set of all ancestor directory paths for the given file paths */
function buildAncestorDirSet(filePaths: string[]): Set<string> {
  const ancestors = new Set<string>()
  for (const fp of filePaths) {
    const parts = fp.split("/")
    // Build each ancestor: /a, /a/b, /a/b/c, etc. (skip the file itself)
    for (let i = 1; i < parts.length; i++) {
      ancestors.add(parts.slice(0, i).join("/"))
    }
  }
  return ancestors
}

/** Flatten the tree into a depth-first ordered list */
function flattenTree(
  rootPath: string,
  state: TreeState,
  sessionFileMap: Map<string, GroupedFile>,
  sessionAncestorDirs: Set<string>,
): FileTreeNode[] {
  const nodes: FileTreeNode[] = []
  const rootEntries = state.cache.get(rootPath)
  if (!rootEntries) return nodes

  function walk(entries: DirectoryEntry[], depth: number) {
    for (const entry of entries) {
      const isExpanded = state.expanded.has(entry.path)
      const isLoading = state.loading.has(entry.path)
      const sessionFile = sessionFileMap.get(entry.path)

      nodes.push({
        id: entry.path,
        name: entry.name,
        path: entry.path,
        type: entry.type,
        depth,
        isExpanded: entry.type === "dir" ? isExpanded : false,
        isLoading,
        gitStatus: entry.gitStatus,
        sessionEdits: sessionFile?.editCount ?? 0,
        sessionAddCount: sessionFile?.addCount ?? 0,
        sessionDelCount: sessionFile?.delCount ?? 0,
        hasSessionDescendant:
          entry.type === "dir" ? sessionAncestorDirs.has(entry.path) : false,
      })

      if (entry.type === "dir" && isExpanded) {
        const children = state.cache.get(entry.path)
        if (children) {
          walk(children, depth + 1)
        }
      }
    }
  }

  walk(rootEntries, 0)
  return nodes
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useFileTree(
  rootPath: string | null,
  sessionFiles: GroupedFile[],
) {
  const [state, dispatch] = useReducer(treeReducer, undefined, initialState)
  const prevRootPath = useRef<string | null>(null)

  // Build session overlay lookup maps
  const sessionFileMap = useMemo(() => {
    const map = new Map<string, GroupedFile>()
    for (const sf of sessionFiles) {
      map.set(sf.filePath, sf)
    }
    return map
  }, [sessionFiles])

  const sessionAncestorDirs = useMemo(() => {
    return buildAncestorDirSet(sessionFiles.map((sf) => sf.filePath))
  }, [sessionFiles])

  // Fetch a directory listing
  const fetchDirectory = useCallback(
    async (dirPath: string) => {
      dispatch({ type: "FETCH_START", path: dirPath })
      try {
        const res = await authFetch(
          `/api/directory-tree?path=${encodeURIComponent(dirPath)}`,
        )
        if (!res.ok) {
          const body = await res.json()
          dispatch({
            type: "FETCH_ERROR",
            path: dirPath,
            error: body.error || `HTTP ${res.status}`,
          })
          return
        }
        const data: DirectoryTreeResponse = await res.json()
        dispatch({ type: "FETCH_SUCCESS", path: dirPath, entries: data.entries })
      } catch (err) {
        dispatch({
          type: "FETCH_ERROR",
          path: dirPath,
          error: String(err),
        })
      }
    },
    [],
  )

  // Fetch root on mount or when rootPath changes
  useEffect(() => {
    if (rootPath && rootPath !== prevRootPath.current) {
      prevRootPath.current = rootPath
      dispatch({ type: "RESET" })
      fetchDirectory(rootPath)
    } else if (!rootPath) {
      prevRootPath.current = null
      dispatch({ type: "RESET" })
    }
  }, [rootPath, fetchDirectory])

  // Toggle expand/collapse
  const toggleExpand = useCallback(
    (dirPath: string) => {
      if (state.expanded.has(dirPath)) {
        dispatch({ type: "TOGGLE_EXPAND", path: dirPath })
      } else if (state.cache.has(dirPath)) {
        // Already cached, just expand
        dispatch({ type: "TOGGLE_EXPAND", path: dirPath })
      } else {
        // Need to fetch first
        fetchDirectory(dirPath)
      }
    },
    [state.expanded, state.cache, fetchDirectory],
  )

  const collapseAll = useCallback(() => {
    dispatch({ type: "COLLAPSE_ALL" })
  }, [])

  const refresh = useCallback(() => {
    if (rootPath) {
      dispatch({ type: "RESET" })
      fetchDirectory(rootPath)
    }
  }, [rootPath, fetchDirectory])

  // Flatten the tree with session overlay
  const flatNodes = useMemo(() => {
    if (!rootPath) return []
    return flattenTree(rootPath, state, sessionFileMap, sessionAncestorDirs)
  }, [rootPath, state, sessionFileMap, sessionAncestorDirs])

  return {
    flatNodes,
    toggleExpand,
    collapseAll,
    refresh,
    isLoading: state.rootLoading,
    error: state.error,
  }
}
