import { attendanceMath } from "./attendance"
import { relativeDue } from "./dates"
import type { Assignment } from "./types"

export interface NeedsYouInput {
  courseId: string
  courseName: string
  attendance: { present: number; total: number } | null
  assignments: Assignment[]
}

export interface NeedsYouItem {
  kind: "attendance" | "deadline"
  courseId: string
  title: string
  detail: string
  severity: "warn" | "low"
}

const DAY = 86_400_000

export function needsYou(inputs: NeedsYouInput[], now: Date, threshold = 0.75, windowDays = 7): NeedsYouItem[] {
  const deadlines: Array<{ at: number; item: NeedsYouItem }> = []
  const attendance: Array<{ pct: number; item: NeedsYouItem }> = []
  const t = now.getTime()

  for (const c of inputs) {
    for (const a of c.assignments) {
      if (a.submitted || !a.due) continue
      const at = a.due.getTime()
      if (at > t + windowDays * DAY || at < t - windowDays * DAY) continue
      deadlines.push({
        at,
        item: {
          kind: "deadline",
          courseId: c.courseId,
          title: a.name,
          detail: `${relativeDue(a.due, now)}, not submitted`,
          severity: at - t <= DAY ? "low" : "warn",
        },
      })
    }
    if (c.attendance && c.attendance.total > 0) {
      const m = attendanceMath(c.attendance.present, c.attendance.total, threshold)
      if (m.status !== "ok" && m.percentage !== null) {
        attendance.push({
          pct: m.percentage,
          item: {
            kind: "attendance",
            courseId: c.courseId,
            title: `${c.courseName} ${Math.round(m.percentage)}%`,
            detail: `attend the next ${m.mustAttend} to reach ${Math.round(threshold * 100)}%`,
            severity: m.status === "low" ? "low" : "warn",
          },
        })
      }
    }
  }

  deadlines.sort((a, b) => a.at - b.at)
  attendance.sort((a, b) => a.pct - b.pct)
  return [...deadlines.map((d) => d.item), ...attendance.map((a) => a.item)]
}
