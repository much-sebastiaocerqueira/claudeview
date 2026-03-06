/**
 * Shared indicator components used by both GroupedFileCard and TurnChangedFiles.
 */

/** Custom event name for navigating to a sub-agent's chat view. */
export const OPEN_SUBAGENT_EVENT = "cogpit:open-subagent"

export function OpIndicator({ hasEdit, hasWrite }: { hasEdit: boolean; hasWrite: boolean }) {
  if (hasEdit && hasWrite) {
    return <span className="text-[9px] font-bold shrink-0 text-amber-400/60">E+W</span>
  }
  if (hasWrite) {
    return <span className="text-[9px] font-bold shrink-0 text-green-400/60">W</span>
  }
  return <span className="text-[9px] font-bold shrink-0 text-amber-400/60">E</span>
}

export function SubAgentIndicator({ agentId }: { agentId: string }) {
  return (
    <span
      className="text-[9px] font-bold shrink-0 text-indigo-400/60 cursor-pointer hover:text-indigo-400 transition-colors"
      title="Open sub-agent view"
      onClick={(e) => {
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent(OPEN_SUBAGENT_EVENT, { detail: { agentId } }))
      }}
    >
      S
    </span>
  )
}
