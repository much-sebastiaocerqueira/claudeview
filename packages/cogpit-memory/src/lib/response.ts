/** Parse a duration string like "5d", "12h", "30m" to milliseconds. */
export function parseMaxAge(raw: string): number {
  const match = raw.match(/^(\d+)([dhm])$/)
  if (!match) return 5 * 24 * 60 * 60 * 1000
  const value = parseInt(match[1], 10)
  const unit = match[2]
  switch (unit) {
    case "d": return value * 24 * 60 * 60 * 1000
    case "h": return value * 60 * 60 * 1000
    case "m": return value * 60 * 1000
    default: return 5 * 24 * 60 * 60 * 1000
  }
}
