import {
  attendanceMath,
  calendarDayDiff,
  clockTime,
  needsYou,
  shortDate,
  type Activity,
  type AnnouncementSummary,
  type Assignment,
  type AttendanceMath,
  type NeedsYouItem,
} from "@mydy/core/logic"
import type { FileKind } from "./icons"
import type { AppState, CourseEntry } from "./state"

export const DOWNLOADABLE = new Set(["resource", "flexpaper", "presentation", "casestudy", "dyquestion"])
const DAY = 86_400_000

export function courseMath(e: CourseEntry, threshold: number): AttendanceMath | null {
  return e.attendance && e.attendance.total > 0 ? attendanceMath(e.attendance.present, e.attendance.total, threshold) : null
}

/** Unsubmitted assignments due within a week (or overdue by less than a week). */
export function dueSoonCount(e: CourseEntry, now: Date): number {
  const t = now.getTime()
  return (e.assignments ?? []).filter((a) => !a.submitted && a.due && Math.abs(a.due.getTime() - t) <= 7 * DAY).length
}

export function needsYouFor(s: AppState, now: Date, threshold: number): NeedsYouItem[] {
  const inputs = s.currentIds
    .map((id) => s.courses[id])
    .filter((e): e is CourseEntry => !!e)
    .map((e) => ({ courseId: e.course.id, courseName: e.course.name, attendance: e.attendance, assignments: e.assignments ?? [] }))
  return needsYou(inputs, now, threshold)
}

export function fileKindOf(a: Activity): FileKind {
  const ext = /\.([a-z0-9]+)$/i.exec(a.name)?.[1]?.toLowerCase()
  if (ext === "pdf") return "pdf"
  if (ext === "ppt" || ext === "pptx") return "ppt"
  if (ext === "doc" || ext === "docx") return "doc"
  if (a.type === "flexpaper") return "pdf"
  if (a.type === "presentation") return "ppt"
  return "file"
}

export type FileRow = { kind: "section"; name: string } | { kind: "file"; activity: Activity; index: number }

/** Sections that have downloadable activities, each followed by those activities. */
export function fileRows(e: CourseEntry): FileRow[] {
  const rows: FileRow[] = []
  let index = 0
  for (const section of e.content ?? []) {
    const files = section.activities.filter((a) => DOWNLOADABLE.has(a.type))
    if (!files.length) continue
    rows.push({ kind: "section", name: section.name })
    for (const activity of files) rows.push({ kind: "file", activity, index: index++ })
  }
  return rows
}

export function assignmentGroups(e: CourseEntry): { pending: Assignment[]; done: Assignment[] } {
  const all = e.assignments ?? []
  const due = (a: Assignment) => a.due?.getTime() ?? Number.POSITIVE_INFINITY
  return {
    pending: all.filter((a) => !a.submitted).sort((a, b) => due(a) - due(b)),
    done: all.filter((a) => a.submitted).sort((a, b) => (b.due?.getTime() ?? 0) - (a.due?.getTime() ?? 0)),
  }
}

export function dueLabel(a: Assignment, now: Date): string {
  if (!a.due) return a.dueText ?? "no due date"
  const d = calendarDayDiff(a.due, now)
  if (d === 0) return `today, ${clockTime(a.due)}`
  if (d === 1) return `tomorrow, ${clockTime(a.due)}`
  if (d === -1) return "yesterday"
  return shortDate(a.due)
}

export function assignmentStatus(a: Assignment): { text: string; tone: "ok" | "low" | "muted" } {
  if (!a.submitted) return { text: "not submitted", tone: "low" }
  if (a.grade && a.grade !== "-") return { text: a.grade, tone: "ok" }
  return { text: "submitted", tone: "muted" }
}

export interface DetailItem {
  url: string
  announcement?: AnnouncementSummary
}

/** The selectable rows of the current tab, in display order. */
export function detailItems(s: AppState): DetailItem[] {
  const e = s.selectedId ? s.courses[s.selectedId] : undefined
  if (!e) return []
  switch (s.tab) {
    case "files":
      return fileRows(e).flatMap((r) => (r.kind === "file" ? [{ url: r.activity.url }] : []))
    case "assignments": {
      const g = assignmentGroups(e)
      return [...g.pending, ...g.done].map((a) => ({ url: a.url }))
    }
    case "grades": {
      const report = e.course.url.replace("/course/view.php", "/grade/report/user/index.php")
      return (e.grades?.items ?? []).map(() => ({ url: report }))
    }
    case "announcements":
      return (e.announcements ?? []).map((a) => ({ url: a.url, announcement: a }))
  }
}
