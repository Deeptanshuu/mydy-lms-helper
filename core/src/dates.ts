const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DATE_RE = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?)?/

/** Parses Moodle dates like "Wednesday, 30 September 2026, 11:59 PM" in local time. */
export function parseMoodleDate(text: string | null | undefined): Date | null {
  if (!text) return null
  const m = DATE_RE.exec(text)
  if (!m) return null
  const month = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase())
  if (month < 0) return null
  let hour = m[4] ? Number(m[4]) : 23
  const minute = m[5] ? Number(m[5]) : 59
  const half = m[6]?.toUpperCase()
  if (half === "PM" && hour < 12) hour += 12
  if (half === "AM" && hour === 12) hour = 0
  return new Date(Number(m[3]), month, Number(m[1]), hour, minute)
}

/** Whole calendar days from `from` to `target` (positive = future). */
export function calendarDayDiff(target: Date, from: Date): number {
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((a - b) / 86_400_000)
}

export function shortDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

export function clockTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function relativeDue(due: Date, now: Date): string {
  const days = calendarDayDiff(due, now)
  if (due.getTime() < now.getTime()) {
    if (days === 0) return "was due today"
    const late = -days
    return `overdue by ${late} day${late === 1 ? "" : "s"}`
  }
  if (days === 0) return "due today"
  if (days === 1) return "due tomorrow"
  if (days < 7) return `due in ${days} days`
  return `due ${shortDate(due)}`
}
