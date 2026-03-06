import { Cpu, GitBranch, Gauge } from "lucide-react"
import { MODEL_OPTIONS, EFFORT_OPTIONS, DEFAULT_EFFORT } from "@/lib/utils"
import { OptionGrid } from "@/components/OptionGrid"

interface SessionSetupPanelProps {
  permissionsPanel?: React.ReactNode
  selectedModel?: string
  onModelChange?: (model: string) => void
  selectedEffort?: string
  onEffortChange?: (effort: string) => void
  worktreeEnabled?: boolean
  onWorktreeEnabledChange?: (enabled: boolean) => void
  worktreeName?: string
  onWorktreeNameChange?: (name: string) => void
}

export function SessionSetupPanel({
  permissionsPanel,
  selectedModel,
  onModelChange,
  selectedEffort,
  onEffortChange,
  worktreeEnabled,
  onWorktreeEnabledChange,
  worktreeName,
  onWorktreeNameChange,
}: SessionSetupPanelProps) {
  return (
    <aside className="shrink-0 w-[300px] border-l border-border bg-elevation-0 overflow-y-auto h-full panel-enter-right">
      <div className="flex flex-col gap-6 p-3">
        {/* Permissions */}
        {permissionsPanel && (
          <div className="rounded-lg p-3">
            {permissionsPanel}
          </div>
        )}

        {/* Model Selector */}
        {onModelChange && (
          <div className="rounded-lg p-3">
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span className="h-3.5 w-0.5 rounded-full bg-blue-500/40" />
                <Cpu className="size-3" />
                Model
              </h3>
              <OptionGrid
                options={MODEL_OPTIONS}
                selected={selectedModel || ""}
                onChange={onModelChange}
                accentColor="blue"
              />
            </section>
          </div>
        )}

        {/* Effort Selector */}
        {onEffortChange && (
          <div className="rounded-lg p-3">
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span className="h-3.5 w-0.5 rounded-full bg-orange-500/40" />
                <Gauge className="size-3" />
                Thinking Effort
              </h3>
              <OptionGrid
                options={EFFORT_OPTIONS}
                selected={selectedEffort || DEFAULT_EFFORT}
                onChange={onEffortChange}
                columns={3}
                accentColor="orange"
              />
            </section>
          </div>
        )}

        {/* Worktree */}
        {onWorktreeEnabledChange && (
          <div className="rounded-lg p-3">
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span className="h-3.5 w-0.5 rounded-full bg-emerald-500/40" />
                <GitBranch className="size-3" />
                Worktree
              </h3>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={worktreeEnabled}
                  onChange={(e) => onWorktreeEnabledChange(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-xs text-foreground">Isolate in worktree</span>
              </label>
              {worktreeEnabled && (
                <input
                  type="text"
                  value={worktreeName}
                  onChange={(e) => onWorktreeNameChange?.(e.target.value)}
                  placeholder="Auto-generated from message"
                  className="mt-2 w-full rounded-md border border-border bg-elevation-1 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                />
              )}
            </section>
          </div>
        )}
      </div>
    </aside>
  )
}
