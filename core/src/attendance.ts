export type AttendanceStatus = "ok" | "warn" | "low"

export interface AttendanceMath {
  /** One decimal place, e.g. 71.7; null when no classes have been held. */
  percentage: number | null
  status: AttendanceStatus
  /** Classes that can still be missed while staying at or above the threshold. */
  canMiss: number
  /** Consecutive classes to attend to get back to the threshold. */
  mustAttend: number
}

const EPS = 1e-9

export function attendanceMath(present: number, total: number, threshold = 0.75): AttendanceMath {
  if (total <= 0) return { percentage: null, status: "ok", canMiss: 0, mustAttend: 0 }
  const ratio = present / total
  const percentage = Math.round(ratio * 1000) / 10
  if (ratio + EPS >= threshold) {
    return { percentage, status: "ok", canMiss: Math.max(0, Math.floor(present / threshold - total + EPS)), mustAttend: 0 }
  }
  return {
    percentage,
    status: ratio >= 0.5 ? "warn" : "low",
    canMiss: 0,
    mustAttend: Math.ceil((threshold * total - present) / (1 - threshold) - EPS),
  }
}
