import { memo } from "react"
import { ChevronRight, Folder, FolderOpen, File } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileTreeNode } from "@/hooks/useFileTree"

const GIT_STATUS_COLORS: Record<string, string> = {
  M: "text-amber-500",
  A: "text-green-500",
  D: "text-red-500",
  "?": "text-muted-foreground",
}

interface FileTreeRowProps {
  node: FileTreeNode
  onToggle: (path: string) => void
  onFileClick: (node: FileTreeNode) => void
}

export const FileTreeRow = memo(function FileTreeRow({
  node,
  onToggle,
  onFileClick,
}: FileTreeRowProps) {
  const isDir = node.type === "dir"
  const hasSession = node.sessionEdits > 0
  const paddingLeft = node.depth * 16 + 4

  function handleClick() {
    if (isDir) {
      onToggle(node.path)
    } else {
      onFileClick(node)
    }
  }

  return (
    <button
      className={cn(
        "flex w-full items-center gap-1 py-0.5 pr-2 text-left text-xs hover:bg-accent/50 rounded-sm",
        hasSession && "bg-blue-500/5",
        node.hasSessionDescendant && isDir && "bg-blue-500/5",
      )}
      style={{ paddingLeft }}
      onClick={handleClick}
      title={node.path}
    >
      {/* Chevron for directories */}
      {isDir ? (
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            node.isExpanded && "rotate-90",
          )}
        />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}

      {/* Icon */}
      {isDir ? (
        node.isExpanded ? (
          <FolderOpen className="size-3.5 shrink-0 text-blue-400" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-blue-400" />
        )
      ) : (
        <File className="size-3.5 shrink-0 text-muted-foreground" />
      )}

      {/* Name */}
      <span className="truncate flex-1">{node.name}</span>

      {/* Session overlay indicators */}
      {hasSession && (
        <span className="flex items-center gap-1 shrink-0 text-[10px]">
          <span className="size-1.5 rounded-full bg-blue-500" />
          <span className="text-green-500">+{node.sessionAddCount}</span>
          <span className="text-red-500">-{node.sessionDelCount}</span>
        </span>
      )}

      {/* Directory session descendant indicator */}
      {!hasSession && node.hasSessionDescendant && isDir && (
        <span className="size-1.5 rounded-full bg-blue-500/60 shrink-0" />
      )}

      {/* Git status badge */}
      {node.gitStatus && (
        <span
          className={cn(
            "shrink-0 text-[10px] font-semibold",
            GIT_STATUS_COLORS[node.gitStatus] || "text-muted-foreground",
          )}
        >
          {node.gitStatus}
        </span>
      )}
    </button>
  )
})
