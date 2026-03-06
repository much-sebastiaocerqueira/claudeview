import { useState, useRef, useEffect, useLayoutEffect, forwardRef } from "react"
import { useNearViewport } from "@/hooks/useNearViewport"
import { ChevronDown, ChevronRight, Code2, GitCompareArrows } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { EditDiffView } from "../timeline/EditDiffView"
import { cn } from "@/lib/utils"
import { OpIndicator, SubAgentIndicator } from "./file-change-indicators"
import { openInEditor } from "./open-in-editor"
import type { GroupedFile, IndividualEdit } from "./useFileChangesData"
import type { DiffMode } from "."

const EXT_COLORS: Record<string, string> = {
  tsx: "text-blue-400",
  jsx: "text-blue-400",
  ts: "text-yellow-400",
  js: "text-yellow-400",
  css: "text-purple-400",
  scss: "text-purple-400",
  json: "text-amber-400",
  yaml: "text-amber-400",
  md: "text-blue-300",
  py: "text-green-400",
  rs: "text-orange-500",
  go: "text-cyan-400",
  html: "text-orange-400",
}

const CHANGE_BAR_BLOCKS = 5

function ChangeBar({ add, del }: { add: number; del: number }) {
  const total = add + del
  if (total === 0) return null
  const addBlocks = Math.round((add / total) * CHANGE_BAR_BLOCKS)
  const delBlocks = CHANGE_BAR_BLOCKS - addBlocks
  return (
    <span className="flex items-center gap-[1px] shrink-0">
      {Array.from({ length: addBlocks }, (_, i) => (
        <span key={`a${i}`} className="inline-block w-[5px] h-[5px] rounded-[1px] bg-green-500/70" />
      ))}
      {Array.from({ length: delBlocks }, (_, i) => (
        <span key={`d${i}`} className="inline-block w-[5px] h-[5px] rounded-[1px] bg-red-400/70" />
      ))}
    </span>
  )
}

interface GroupedFileCardProps {
  file: GroupedFile
  defaultOpen: boolean
  isHighlighted?: boolean
  diffMode: DiffMode
}

export const GroupedFileCard = forwardRef<HTMLDivElement, GroupedFileCardProps>(
  function GroupedFileCard({ file, defaultOpen, isHighlighted, diffMode }, forwardedRef) {
    const { ref: nearRef, isNear } = useNearViewport()
    const [open, setOpen] = useState(defaultOpen)
    const prevDefaultRef = useRef(defaultOpen)

    useEffect(() => {
      if (prevDefaultRef.current !== defaultOpen) {
        prevDefaultRef.current = defaultOpen
        setOpen(defaultOpen)
      }
    }, [defaultOpen])

    const ext = file.filePath.split(".").pop()?.toLowerCase() ?? ""
    const extColor = EXT_COLORS[ext] ?? "text-muted-foreground"

    const oldString = file.netRemoved.join("\n")
    const newString = file.netAdded.join("\n")
    const hasNetDiff = Boolean(oldString || newString)
    const hasPerEditDiff = file.edits.some((e) => Boolean(e.oldString || e.newString))
    const hasDiff = diffMode === "per-edit" ? hasPerEditDiff : hasNetDiff

    const showDiff = open && isNear && hasDiff
    const diffRef = useRef<HTMLDivElement>(null)
    const lastDiffHeightRef = useRef(0)

    useLayoutEffect(() => {
      if (showDiff && diffRef.current) {
        lastDiffHeightRef.current = diffRef.current.offsetHeight
      }
    }, [showDiff, diffMode])

    const turnLabel = file.turnRange[0] === file.turnRange[1]
      ? `T${file.turnRange[0] + 1}`
      : `T${file.turnRange[0] + 1}–T${file.turnRange[1] + 1}`

    const setRef = (el: HTMLDivElement | null) => {
      ;(nearRef as React.MutableRefObject<HTMLDivElement | null>).current = el
      if (typeof forwardedRef === "function") forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    }

    return (
      <div
        ref={setRef}
        data-file-path={file.filePath}
        className={cn(
          "rounded-md border elevation-2 depth-low transition-colors",
          isHighlighted
            ? "border-blue-500/40 ring-1 ring-blue-500/20"
            : "border-border",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center w-full bg-elevation-2 rounded-t-md hover:bg-elevation-3 transition-colors group">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 flex-1 min-w-0 px-2.5 py-1.5"
          >
            {open ? (
              <ChevronDown className="size-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="size-3 text-muted-foreground shrink-0" />
            )}
            <span className={cn("text-[10px] font-mono font-bold shrink-0", extColor)}>
              {ext}
            </span>
            <OpIndicator hasEdit={file.opTypes.includes("Edit")} hasWrite={file.opTypes.includes("Write")} />
            {file.subAgentId && <SubAgentIndicator agentId={file.subAgentId} />}
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              {file.shortPath}
            </span>
            <span className="text-[10px] text-muted-foreground/50 shrink-0">
              {turnLabel}
            </span>
            {file.editCount > 1 && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-3.5 font-mono shrink-0 border-border/50 text-muted-foreground/60"
              >
                {file.editCount}x
              </Badge>
            )}
          </button>
          <div className="flex items-center gap-1.5 pr-2 shrink-0">
            {file.addCount > 0 && (
              <span className="text-[10px] font-mono tabular-nums text-green-500/80">+{file.addCount}</span>
            )}
            {file.delCount > 0 && (
              <span className="text-[10px] font-mono tabular-nums text-red-400/80">-{file.delCount}</span>
            )}
            <ChangeBar add={file.addCount} del={file.delCount} />
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openInEditor(file.filePath, "file")}
                    className="p-1 text-muted-foreground hover:text-blue-400 transition-colors"
                    aria-label="Open file in editor"
                  >
                    <Code2 className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Open in editor</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openInEditor(file.filePath, "diff")}
                    className="p-1 text-muted-foreground hover:text-amber-400 transition-colors"
                    aria-label="View git diff"
                  >
                    <GitCompareArrows className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>View git diff</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        <DiffContent
          showDiff={showDiff}
          open={open}
          hasDiff={hasDiff}
          diffRef={diffRef}
          lastDiffHeight={lastDiffHeightRef.current}
          oldString={oldString}
          newString={newString}
          filePath={file.filePath}
          diffMode={diffMode}
          edits={file.edits}
        />
      </div>
    )
  }
)

function DiffContent({
  showDiff,
  open,
  hasDiff,
  diffRef,
  lastDiffHeight,
  oldString,
  newString,
  filePath,
  diffMode,
  edits,
}: {
  showDiff: boolean
  open: boolean
  hasDiff: boolean
  diffRef: React.RefObject<HTMLDivElement | null>
  lastDiffHeight: number
  oldString: string
  newString: string
  filePath: string
  diffMode: DiffMode
  edits: IndividualEdit[]
}): React.ReactElement | null {
  if (showDiff) {
    return (
      <div ref={diffRef} className="overflow-hidden rounded-b-md">
        {diffMode === "per-edit" ? (
          <PerEditDiffs edits={edits} filePath={filePath} />
        ) : (
          <EditDiffView
            oldString={oldString}
            newString={newString}
            filePath={filePath}
            compact={false}
          />
        )}
      </div>
    )
  }
  if (open && lastDiffHeight > 0) {
    return <div style={{ height: lastDiffHeight }} />
  }
  if (open && !hasDiff) {
    return (
      <div className="px-3 py-2 text-[10px] text-muted-foreground/50 italic">
        {diffMode === "per-edit" ? "No edits" : "No net changes (all edits cancelled out)"}
      </div>
    )
  }
  return null
}

function PerEditDiffs({ edits, filePath }: { edits: IndividualEdit[]; filePath: string }) {
  const total = edits.length
  return (
    <div className="divide-y divide-border/30">
      {edits.map((edit, i) => {
        const hasContent = Boolean(edit.oldString || edit.newString)
        if (!hasContent) return null
        return (
          <div key={i}>
            {total > 1 && (
              <div className="flex items-center gap-2 px-2.5 py-1 bg-elevation-1/50">
                <span className="text-[9px] font-mono text-muted-foreground/60">
                  {edit.toolName} {i + 1}/{total}
                </span>
                <span className="text-[9px] text-muted-foreground/40">
                  T{edit.turnIndex + 1}
                </span>
                {edit.agentId && (
                  <span className="text-[9px] font-bold text-indigo-400/60">S</span>
                )}
              </div>
            )}
            <EditDiffView
              oldString={edit.oldString}
              newString={edit.newString}
              filePath={filePath}
              compact={false}
            />
          </div>
        )
      })}
    </div>
  )
}
