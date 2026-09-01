// Pure relative-time formatter. No date library.
//
// delta = floor((now - timestamp) / 1000) in whole seconds, clamped >= 0 so
// future timestamps produce "just now". Intervals are half-open with floor
// division:
//   delta < 60           -> "just now"
//   60    <= delta < 3600 -> "{n}m ago"  (n = floor(delta / 60))
//   3600  <= delta < 86400 -> "{n}h ago" (n = floor(delta / 3600))
//   86400 <= delta < 604800 -> "{n}d ago" (n = floor(delta / 86400))
//   delta >= 604800      -> "{n}w ago"    (n = floor(delta / 604800))

const MINUTE = 60
const HOUR = 3600
const DAY = 86400
const WEEK = 604800

export function formatRelativeTime(timestamp: number, now: number): string {
  const delta = Math.max(0, Math.floor((now - timestamp) / 1000))

  if (delta < MINUTE) {
    return 'just now'
  }
  if (delta < HOUR) {
    return `${Math.floor(delta / MINUTE)}m ago`
  }
  if (delta < DAY) {
    return `${Math.floor(delta / HOUR)}h ago`
  }
  if (delta < WEEK) {
    return `${Math.floor(delta / DAY)}d ago`
  }
  return `${Math.floor(delta / WEEK)}w ago`
}
