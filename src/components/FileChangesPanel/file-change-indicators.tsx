/**
 * Shared indicator components used by both GroupedFileCard and TurnChangedFiles.
 */

/** Edit/Write operation label. Accepts either array or boolean interface. */
export function OpIndicator({ hasEdit, hasWrite }: { hasEdit: boolean; hasWrite: boolean }) {
  if (hasEdit && hasWrite) {
    return <span className="text-[9px] font-bold shrink-0 text-amber-400/60">E+W</span>
  }
  if (hasWrite) {
    return <span className="text-[9px] font-bold shrink-0 text-green-400/60">W</span>
  }
  return <span className="text-[9px] font-bold shrink-0 text-amber-400/60">E</span>
}
