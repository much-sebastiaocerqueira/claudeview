import { memo } from "react"
import {
  ChevronRight,
  Eye,
  Check,
  Copy,
  Skull,
  Settings,
  Globe,
  WifiOff,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { LiveIndicator, HeaderIconButton } from "@/components/header-shared"
import { useCopyWithFeedback } from "@/hooks/useCopyWithFeedback"
import { useAppContext } from "@/contexts/AppContext"
import { useSessionContext } from "@/contexts/SessionContext"
import { agentKindFromDirName, getResumeCommand } from "@/lib/sessionSource"
import { getContextUsage, projectName } from "@/lib/format"
import packageJson from "../../package.json"

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tok`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K tok`
  return `${n} tok`
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins < 60) return `${mins}m ${remSecs}s`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs}h ${remMins}m`
}

interface DesktopHeaderProps {
  killing: boolean
  onGoHome: () => void
  onKillAll: () => void
  onOpenSettings: () => void
  showConfig?: boolean
  onToggleConfig?: () => void
}

export const DesktopHeader = memo(function DesktopHeader({
  killing,
  onGoHome,
  onKillAll,
  onOpenSettings,
  showConfig,
  onToggleConfig,
}: DesktopHeaderProps) {
  const { dispatch, config: { networkUrl, networkAccessDisabled } } = useAppContext()
  const { session, sessionSource, isLive } = useSessionContext()
  const [cmdCopied, copyCmd] = useCopyWithFeedback()
  const [urlCopied, copyUrl] = useCopyWithFeedback()

  const dirName = sessionSource?.dirName ?? null
  const projName = session?.cwd ? projectName(session.cwd) : (dirName ?? null)
  const sessionLabel = session?.slug || session?.sessionId?.slice(0, 8) || null

  function handleCopyResumeCmd(): void {
    if (!session) return
    const agentKind = sessionSource?.agentKind ?? agentKindFromDirName(sessionSource?.dirName ?? null)
    copyCmd(getResumeCommand(agentKind, session.sessionId, session.cwd))
  }

  function handleCopyNetworkUrl(): void {
    if (!networkUrl) return
    copyUrl(networkUrl)
  }

  function goToProjectSessions(): void {
    if (!dirName) return
    dispatch({ type: "GO_HOME", isMobile: false })
    dispatch({ type: "SET_DASHBOARD_PROJECT", dirName })
  }

  return (
    <header className="flex h-8 shrink-0 items-center border-b border-border/50 bg-elevation-2 px-2.5 electron-drag">
      <div className="flex items-center gap-1 min-w-0">
        <Tooltip>
          <TooltipTrigger render={<button
              onClick={onGoHome}
              className="shrink-0 transition-opacity hover:opacity-70"
              aria-label="All Projects"
            />}>
              <Eye className="size-4 text-blue-400" />
          </TooltipTrigger>
          <TooltipContent>All Projects</TooltipContent>
        </Tooltip>

        <button
          onClick={onGoHome}
          className="text-[11px] font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors select-none shrink-0"
        >
          ClaudeView
        </button>

        {session && projName ? (
          <>
            <ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
            <button
              onClick={goToProjectSessions}
              className="text-[11px] font-medium text-muted-foreground/60 hover:text-blue-400 transition-colors truncate max-w-[120px]"
              title={`View all sessions in ${projName}`}
            >
              {projName}
            </button>
            {sessionLabel && (
              <>
                <ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
                <Tooltip>
                  <TooltipTrigger render={<button
                      className="text-[11px] font-medium text-foreground/80 truncate max-w-[180px]"
                      onClick={handleCopyResumeCmd}
                    />}>
                      {cmdCopied ? (
                        <span className="flex items-center gap-1 text-green-400">
                          <Check className="size-3" /> Copied
                        </span>
                      ) : (
                        sessionLabel
                      )}
                  </TooltipTrigger>
                  <TooltipContent className="text-xs space-y-1">
                    <div>Click to copy resume command</div>
                    {session.cwd && (
                      <div className="font-mono text-muted-foreground">{session.cwd}</div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            {isLive && <LiveIndicator aria-label="Session is live" />}
          </>
        ) : !session ? (
          <span className="text-[11px] font-medium text-muted-foreground/40 select-none ml-1">
            v{packageJson.version}
          </span>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* Session stats */}
      {session && (() => {
        const ctx = getContextUsage(session.rawMessages)
        // If used > limit, the context limit detection is wrong (model string mismatch) — skip showing
        const ctxPct = ctx && ctx.used <= ctx.limit ? ctx.percentAbsolute : null
        const ctxColor = ctxPct !== null
          ? ctxPct >= 90 ? "text-red-400" : ctxPct >= 70 ? "text-amber-400" : "text-green-400"
          : ""
        return (
        <Tooltip>
          <TooltipTrigger render={<div className="flex items-center gap-2 px-2 py-0.5 text-[10px] font-mono text-muted-foreground/60 tabular-nums cursor-default" />}>
              <span>{session.turns.length} turns</span>
              <span className="text-muted-foreground/30">|</span>
              <span>{formatTokens(session.stats.totalInputTokens + session.stats.totalOutputTokens)}</span>
              {session.stats.totalCostUSD > 0 && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span>${session.stats.totalCostUSD.toFixed(2)}</span>
                </>
              )}
              {ctxPct !== null && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className={ctxColor}>{ctxPct.toFixed(0)}% ctx</span>
                </>
              )}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="p-3 space-y-1.5 min-w-[200px]">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Session Stats</div>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Turns</span><span>{session.turns.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Input tokens</span><span>{session.stats.totalInputTokens.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Output tokens</span><span>{session.stats.totalOutputTokens.toLocaleString()}</span></div>
              {(session.stats.totalCacheReadTokens > 0 || session.stats.totalCacheCreationTokens > 0) && (
                <div className="flex justify-between"><span className="text-muted-foreground">Cache read</span><span>{session.stats.totalCacheReadTokens.toLocaleString()}</span></div>
              )}
              {ctx && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Context used</span>
                  <span className={ctxColor}>{ctx.used.toLocaleString()} / {ctx.limit.toLocaleString()} ({ctxPct!.toFixed(1)}%)</span>
                </div>
              )}
              {session.stats.totalCostUSD > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Cost</span><span>${session.stats.totalCostUSD.toFixed(3)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{formatDurationMs(session.stats.totalDurationMs)}</span></div>
              {session.stats.errorCount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Errors</span><span className="text-red-400">{session.stats.errorCount}</span></div>
              )}
              {session.model && (
                <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span>{session.model}</span></div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
        )
      })()}

      <NetworkStatus
        networkUrl={networkUrl}
        networkAccessDisabled={networkAccessDisabled}
        urlCopied={urlCopied}
        onCopyUrl={handleCopyNetworkUrl}
      />

      <div className="flex items-center gap-0.5 shrink-0">
        {onToggleConfig && (
          <HeaderIconButton
            icon={SlidersHorizontal}
            label={showConfig ? "Close Config Browser" : "Config Browser"}
            onClick={onToggleConfig}
            className={showConfig ? "bg-blue-500/20" : "text-muted-foreground hover:text-foreground"}
            iconClassName={showConfig ? "text-blue-400" : undefined}
          />
        )}
        <HeaderIconButton
          icon={Settings}
          label="Settings"
          onClick={onOpenSettings}
          className="text-muted-foreground hover:text-foreground"
        />
        <HeaderIconButton
          icon={Skull}
          label="Kill all tracked agent processes"
          onClick={onKillAll}
          disabled={killing}
          className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
          iconClassName={killing ? "text-red-400 animate-pulse" : undefined}
        />
      </div>
    </header>
  )
})

// ── NetworkStatus ────────────────────────────────────────────────────────────

interface NetworkStatusProps {
  networkUrl: string | null
  networkAccessDisabled: boolean
  urlCopied: boolean
  onCopyUrl: () => void
}

/** Renders the network URL button or "Network off" indicator. */
function NetworkStatus({ networkUrl, networkAccessDisabled, urlCopied, onCopyUrl }: NetworkStatusProps): React.ReactNode {
  if (networkUrl) {
    return (
      <Tooltip>
        <TooltipTrigger render={<button
            onClick={onCopyUrl}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-elevation-2 transition-colors mr-1"
          />}>
            <Globe className="size-3 text-green-500" />
            {urlCopied ? (
              <span className="text-green-400">Copied!</span>
            ) : (
              networkUrl
            )}
        </TooltipTrigger>
        <TooltipContent>Click to copy connection URL</TooltipContent>
      </Tooltip>
    )
  }

  if (networkAccessDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger render={<div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground mr-1" />}>
            <WifiOff className="size-3" />
            <span>Network off</span>
        </TooltipTrigger>
        <TooltipContent>Network access is disabled</TooltipContent>
      </Tooltip>
    )
  }

  return null
}
