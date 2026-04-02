import { useState, useCallback, useRef, useMemo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { RefreshCw, ChevronsDownUp, FolderTree, GitCommitHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSessionContext } from "@/contexts/SessionContext"
import { useFileTree } from "@/hooks/useFileTree"
import { useFileChangesData } from "@/components/FileChangesPanel/useFileChangesData"
import { DiffViewModal } from "@/components/diff/DiffViewModal"
import { authFetch } from "@/lib/auth"
import { FileTreeRow } from "./FileTreeRow"
import type { FileTreeNode } from "@/hooks/useFileTree"
import type { GroupedFile } from "@/components/FileChangesPanel/useFileChangesData"
import type { ParsedSession } from "@/lib/types"

type ViewMode = "all" | "modified"

/** Build a flat tree of only session-modified files, grouped by directory */
function buildModifiedNodes(
  rootPath: string,
  sessionFiles: GroupedFile[],
): FileTreeNode[] {
  if (sessionFiles.length === 0) return []

  // Build a nested dir structure from file paths
  interface DirEntry {
    dirs: Map<string, DirEntry>
    files: GroupedFile[]
  }

  const root: DirEntry = { dirs: new Map(), files: [] }

  for (const sf of sessionFiles) {
    // Get path relative to project root
    const rel = sf.filePath.startsWith(rootPath + "/")
      ? sf.filePath.slice(rootPath.length + 1)
      : sf.filePath
    const parts = rel.split("/")
    let current = root
    // Walk to the parent directory
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current.dirs.has(parts[i])) {
        current.dirs.set(parts[i], { dirs: new Map(), files: [] })
      }
      current = current.dirs.get(parts[i])!
    }
    current.files.push(sf)
  }

  // Flatten into nodes, collapsing single-child dirs (e.g. src/components -> src/components)
  const nodes: FileTreeNode[] = []

  function walk(entry: DirEntry, depth: number, pathPrefix: string) {
    // Sort dirs alphabetically, then files alphabetically
    const sortedDirs = [...entry.dirs.entries()].sort(([a], [b]) => a.localeCompare(b))
    const sortedFiles = [...entry.files].sort((a, b) => {
      const aName = a.filePath.split("/").pop() || ""
      const bName = b.filePath.split("/").pop() || ""
      return aName.localeCompare(bName)
    })

    for (const [dirName, dirEntry] of sortedDirs) {
      const dirPath = pathPrefix ? `${pathPrefix}/${dirName}` : dirName
      const fullPath = `${rootPath}/${dirPath}`
      nodes.push({
        id: fullPath,
        name: dirName,
        path: fullPath,
        type: "dir",
        depth,
        isExpanded: true,
        isLoading: false,
        gitStatus: null,
        sessionEdits: 0,
        sessionAddCount: 0,
        sessionDelCount: 0,
        hasSessionDescendant: true,
      })
      walk(dirEntry, depth + 1, dirPath)
    }

    for (const sf of sortedFiles) {
      const fileName = sf.filePath.split("/").pop() || sf.filePath
      nodes.push({
        id: sf.filePath,
        name: fileName,
        path: sf.filePath,
        type: "file",
        depth,
        isExpanded: false,
        isLoading: false,
        gitStatus: sf.gitStatus,
        sessionEdits: sf.editCount,
        sessionAddCount: sf.addCount,
        sessionDelCount: sf.delCount,
        hasSessionDescendant: false,
      })
    }
  }

  walk(root, 0, "")
  return nodes
}

function FilesTreeContent({ session }: { session: ParsedSession }) {
  const { groupedByFile } = useFileChangesData(session)
  const [viewMode, setViewMode] = useState<ViewMode>("all")

  const { flatNodes, toggleExpand, collapseAll, refresh, isLoading, error } =
    useFileTree(session.cwd, groupedByFile)

  const modifiedNodes = useMemo(
    () => buildModifiedNodes(session.cwd, groupedByFile),
    [session.cwd, groupedByFile],
  )

  const displayNodes = viewMode === "all" ? flatNodes : modifiedNodes

  // Diff modal state
  const [diffState, setDiffState] = useState<{
    filePath: string
    oldContent: string
    newContent: string
  } | null>(null)

  const handleFileClick = useCallback(async (node: FileTreeNode) => {
    try {
      const res = await authFetch(
        `/api/git-file-diff?path=${encodeURIComponent(node.path)}`,
      )
      if (!res.ok) return
      const data = await res.json()
      setDiffState({
        filePath: node.path,
        oldContent: data.head,
        newContent: data.working,
      })
    } catch {
      // Silently fail -- file may be binary or too large
    }
  }, [])

  // In modified mode, toggleExpand is a no-op (all dirs are pre-expanded)
  const handleToggle = viewMode === "all" ? toggleExpand : () => {}

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: displayNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 20,
  })

  if (viewMode === "all" && isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (viewMode === "all" && error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
        <span>Failed to load files</span>
        <button
          onClick={refresh}
          className="text-xs text-blue-500 hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border/50">
        <div className="flex items-center rounded bg-accent/30 p-0.5">
          <button
            onClick={() => setViewMode("all")}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              viewMode === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="All files"
          >
            <FolderTree className="size-3" />
            All
          </button>
          <button
            onClick={() => setViewMode("modified")}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              viewMode === "modified"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Modified files only"
          >
            <GitCommitHorizontal className="size-3" />
            Modified
            {groupedByFile.length > 0 && (
              <span className="text-[9px] text-blue-500">{groupedByFile.length}</span>
            )}
          </button>
        </div>
        <div className="flex-1" />
        {viewMode === "all" && (
          <>
            <button
              onClick={refresh}
              className="p-1 rounded hover:bg-accent/50 text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              onClick={collapseAll}
              className="p-1 rounded hover:bg-accent/50 text-muted-foreground"
              title="Collapse All"
            >
              <ChevronsDownUp className="size-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Empty modified state */}
      {viewMode === "modified" && modifiedNodes.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          No files modified in this session
        </div>
      )}

      {/* Virtualized tree */}
      {displayNodes.length > 0 && (
        <div ref={parentRef} className="flex-1 overflow-auto min-h-0">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const node = displayNodes[virtualRow.index]
              return (
                <div
                  key={node.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <FileTreeRow
                    node={node}
                    onToggle={handleToggle}
                    onFileClick={handleFileClick}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Diff modal */}
      {diffState && (
        <DiffViewModal
          oldContent={diffState.oldContent}
          newContent={diffState.newContent}
          filePath={diffState.filePath}
          onClose={() => setDiffState(null)}
        />
      )}
    </div>
  )
}

export function FilesTab() {
  const { session } = useSessionContext()

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Open a session to browse project files
      </div>
    )
  }

  return <FilesTreeContent session={session} />
}
