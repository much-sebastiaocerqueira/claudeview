import { cn } from "@/lib/utils"

interface OptionGridProps {
  options: readonly { value: string; label: string }[]
  selected: string
  onChange: (value: string) => void
  /** Number of grid columns (default: 2) */
  columns?: number
  /** Tailwind color name for the active state (e.g. "blue", "orange") */
  accentColor?: "blue" | "orange"
}

const ACCENT_STYLES = {
  blue: "border-blue-500 text-blue-400 bg-blue-500/10",
  orange: "border-orange-500 text-orange-400 bg-orange-500/10",
} as const

// Static mapping to avoid dynamic Tailwind class names
const COLUMN_CLASSES: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
}

/**
 * Renders a grid of selectable option buttons with a consistent style.
 * Used by both SessionSetupPanel and StatsPanel for model/effort selectors.
 */
export function OptionGrid({
  options,
  selected,
  onChange,
  columns = 2,
  accentColor = "blue",
}: OptionGridProps): JSX.Element {
  return (
    <div className={cn("grid gap-1", COLUMN_CLASSES[columns] ?? "grid-cols-2")}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors",
            selected === opt.value
              ? ACCENT_STYLES[accentColor]
              : "border-border text-muted-foreground hover:border-border hover:text-foreground elevation-1"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
