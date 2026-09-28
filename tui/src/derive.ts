import {
  attendanceMath,
  calendarDayDiff,
  clockTime,
  needsYou,
  parseMoodleDate,
  shortDate,
  type Activity,
  type AnnouncementSummary,
  type Assignment,
  type AttendanceMath,
  type AttendanceStatus,
  type NeedsYouItem,
} from "@mydy/core/logic"
import { formatAge, parseScore } from "./format"
import type { FileKind } from "./icons"
import { OVERVIEW_ROW, type AppState, type CourseEntry } from "./state"

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
  /** Overview deadline rows: the course they belong to and their row in its Assignments tab. */
  courseId?: string
  courseIndex?: number
}

/** The selectable rows of the current tab, in display order. `now` only matters on the Overview (its deadlines). */
export function detailItems(s: AppState, now: Date = new Date()): DetailItem[] {
  if (s.selectedId === OVERVIEW_ROW) return upcomingDeadlines(s, now).map((d) => ({ url: d.url, courseId: d.courseId, courseIndex: d.courseIndex }))
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

// ── Overview ───────────────────────────────────────────────────────────────────────────────────
// The semester at a glance. Everything here is pure: the view passes `now` and the threshold in.

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "Good morning" until noon, "Good afternoon" until 5 pm, "Good evening" after. */
export function greeting(now: Date): string {
  const h = now.getHours()
  return h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : "Good evening"
}

/** "Tuesday 29 September". */
export function longDate(d: Date): string {
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`
}

/** "synced 2 min ago", "offline, from 3 hours ago", ... or null when there is nothing true to say. */
export function syncCaption(s: AppState, now: Date): string | null {
  const age = s.sync.lastSynced ? formatAge(Math.max(0, now.getTime() - s.sync.lastSynced)) : null
  switch (s.sync.status) {
    case "syncing":
      return "syncing…"
    case "offline":
      return age ? `offline, from ${age}` : "offline"
    case "error":
      return "last sync failed"
    default:
      return age ? `synced ${age}` : null
  }
}

/** The facts under the Overview title, skipping any that are unknown. */
export function overviewCaption(s: AppState, now: Date): string[] {
  const n = s.currentIds.length
  return [longDate(now), n ? `${n} course${n === 1 ? "" : "s"}` : "", syncCaption(s, now) ?? ""].filter(Boolean)
}

/** "74%": rounded, but never rounded up onto the threshold while `below` it. */
export function pctLabel(percentage: number, below: boolean, threshold: number): string {
  const rounded = Math.round(percentage)
  return `${below ? Math.min(rounded, Math.ceil(threshold * 100 - 1e-9) - 1) : rounded}%`
}

const currentEntries = (s: AppState): CourseEntry[] => s.currentIds.map((id) => s.courses[id]).filter((e): e is CourseEntry => !!e)

export interface CourseAttendance {
  id: string
  name: string
  present: number
  total: number
  ratio: number
  /** One decimal, from attendanceMath. */
  percentage: number
  status: AttendanceStatus
  below: boolean
  canMiss: number
  mustAttend: number
}

/** Attendance per current course that has a record, lowest first (ties keep semester order). */
export function attendanceRows(s: AppState, threshold: number): CourseAttendance[] {
  const rows: CourseAttendance[] = []
  for (const e of currentEntries(s)) {
    const a = e.attendance
    const m = courseMath(e, threshold)
    if (!a || !m || m.percentage === null) continue
    rows.push({
      id: e.course.id, name: e.course.name, present: a.present, total: a.total, ratio: a.present / a.total,
      percentage: m.percentage, status: m.status, below: m.status !== "ok", canMiss: m.canMiss, mustAttend: m.mustAttend,
    })
  }
  return rows.sort((x, y) => x.ratio - y.ratio)
}

export type Urgency = "overdue" | "urgent" | "soon" | "later"

export interface Deadline {
  courseId: string
  courseName: string
  name: string
  url: string
  due: Date
  /** Calendar days from today: 0 today, 1 tomorrow, negative overdue. */
  days: number
  /** overdue: past; urgent: within 24 h; soon: within a week; later: further out. */
  urgency: Urgency
  /** Row of this assignment in the course's Assignments tab (pending first, by due date). */
  courseIndex: number
}

/**
 * Unsubmitted assignments across the current courses: overdue by up to a week, and due up to
 * `horizonDays` ahead, soonest first. The first week matches the "needs you" strip.
 */
export function upcomingDeadlines(s: AppState, now: Date, horizonDays = 14): Deadline[] {
  const t = now.getTime()
  const out: Deadline[] = []
  for (const e of currentEntries(s)) {
    const { pending, done } = assignmentGroups(e)
    const all = [...pending, ...done]
    for (const a of pending) {
      if (!a.due) continue
      const at = a.due.getTime()
      if (at < t - 7 * DAY || at > t + horizonDays * DAY) continue
      out.push({
        courseId: e.course.id, courseName: e.course.name, name: a.name, url: a.url, due: a.due,
        days: calendarDayDiff(a.due, now),
        urgency: at < t ? "overdue" : at - t <= DAY ? "urgent" : at - t <= 7 * DAY ? "soon" : "later",
        courseIndex: all.indexOf(a),
      })
    }
  }
  return out.sort((x, y) => x.due.getTime() - y.due.getTime())
}

/** How a deadline reads in an agenda: a bold label and the detail under it ("Tomorrow" / "by 23:59"). */
export function deadlineWhen(d: Deadline): { label: string; detail: string } {
  if (d.urgency === "overdue") return { label: "Overdue", detail: d.days === 0 ? `at ${clockTime(d.due)}` : d.days === -1 ? "yesterday" : `${-d.days} days ago` }
  if (d.days === 0) return { label: "Today", detail: `by ${clockTime(d.due)}` }
  if (d.days === 1) return { label: "Tomorrow", detail: `by ${clockTime(d.due)}` }
  return { label: shortDate(d.due), detail: `in ${d.days} days` }
}

/** Lowercase, for captions: "overdue", "today", "tomorrow", "in 3 days". */
export function deadlineSoon(d: Deadline): string {
  return d.urgency === "overdue" ? "overdue" : d.days === 0 ? "today" : d.days === 1 ? "tomorrow" : `in ${d.days} days`
}

export interface OverviewStats {
  courses: number
  /** Null until some current course has an attendance record. */
  attendance: {
    present: number
    total: number
    ratio: number
    percentage: number
    status: AttendanceStatus
    tracked: number
    above: number
    below: number
    /** The lowest course below the threshold. */
    worst: CourseAttendance | null
  } | null
  /** Due within a week, or overdue by less than one. `pending` counts courses whose assignments haven't loaded. */
  due: { count: number; overdue: number; urgent: number; next: Deadline | null; status: "ok" | "warn" | "low"; pending: number }
  /** `average` is a 0..1 ratio over the courses whose total is loaded and parseable. */
  grades: { average: number | null; graded: number; loaded: number; courses: number }
}

export function overviewStats(s: AppState, now: Date, threshold: number): OverviewStats {
  const rows = attendanceRows(s, threshold)
  const present = rows.reduce((n, r) => n + r.present, 0)
  const total = rows.reduce((n, r) => n + r.total, 0)
  const m = total > 0 ? attendanceMath(present, total, threshold) : null
  const below = rows.filter((r) => r.below)

  const week = upcomingDeadlines(s, now).filter((d) => d.urgency !== "later")
  const overdue = week.filter((d) => d.urgency === "overdue").length
  const urgent = week.filter((d) => d.urgency === "urgent").length

  const entries = currentEntries(s)
  const ratios = entries.flatMap((e) => {
    const t = e.grades?.total
    const score = t ? parseScore(t.grade, t.range) : null
    return score ? [Math.max(0, score.value / score.max)] : []
  })

  return {
    courses: entries.length,
    attendance: m && m.percentage !== null
      ? { present, total, ratio: present / total, percentage: m.percentage, status: m.status, tracked: rows.length, above: rows.length - below.length, below: below.length, worst: below[0] ?? null }
      : null,
    due: {
      count: week.length, overdue, urgent, next: week[0] ?? null, status: !week.length ? "ok" : overdue || urgent ? "low" : "warn",
      pending: entries.filter((e) => e.assignments === undefined).length,
    },
    grades: {
      average: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
      graded: ratios.length,
      loaded: entries.filter((e) => e.grades !== undefined).length,
      courses: entries.length,
    },
  }
}

export interface LatestAnnouncement {
  courseId: string
  courseName: string
  title: string
  url: string
  author: string | null
  dateText: string | null
  date: Date | null
  /** Row of this post in the course's Announcements tab. */
  index: number
}

/** Announcements loaded for the current courses, newest first (undated ones last, in load order). */
export function latestAnnouncements(s: AppState, limit = 5): LatestAnnouncement[] {
  const all = currentEntries(s).flatMap((e) =>
    (e.announcements ?? []).map((a, index): LatestAnnouncement => ({
      courseId: e.course.id, courseName: e.course.name, title: a.title, url: a.url, author: a.author, dateText: a.dateText, date: parseMoodleDate(a.dateText), index,
    })),
  )
  const at = (a: LatestAnnouncement) => a.date?.getTime() ?? Number.NEGATIVE_INFINITY
  return all.sort((x, y) => at(y) - at(x)).slice(0, limit)
}

/** "Today", "Yesterday", or "Sun 27 Sep"; the raw text when the date can't be read. */
export function announcementWhen(a: LatestAnnouncement, now: Date): string {
  if (!a.date) return a.dateText ?? ""
  const d = calendarDayDiff(a.date, now)
  return d === 0 ? "Today" : d === -1 ? "Yesterday" : shortDate(a.date)
}
