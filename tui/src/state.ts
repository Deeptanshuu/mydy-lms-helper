import { createStore, produce, reconcile, unwrap } from "solid-js/store"
import {
  currentSemester,
  matchAttendance,
  type Announcement,
  type AnnouncementSummary,
  type Assignment,
  type Attendance,
  type AttendanceSubject,
  type Course,
  type GradeReport,
  type Section,
} from "@mydy/core/logic"
import type { Snapshot } from "./cache"

export type TabName = "files" | "assignments" | "grades" | "announcements"
export const TABS: TabName[] = ["files", "assignments", "grades", "announcements"]
export type CourseDataKey = "content" | "assignments" | "grades" | "announcements"
export const PREVIOUS_ROW = "group:previous"

export interface CourseEntry {
  course: Course
  attendance: AttendanceSubject | null
  content?: Section[]
  assignments?: Assignment[]
  grades?: GradeReport
  announcements?: AnnouncementSummary[]
  loading: Partial<Record<CourseDataKey, boolean>>
  errors: Partial<Record<CourseDataKey, string>>
}

export interface DownloadView {
  active: boolean
  visible: boolean
  courses: number
  total: number
  done: number
  bytes: number
  skipped: number
  failed: number
  current: string | null
  folder: string
  message: string | null
}

export interface Toast {
  title: string
  detail: string
  action: "signin" | null
}

export interface SyncState {
  status: "idle" | "syncing" | "offline" | "error"
  message: string | null
  lastSynced: number | null
}

export interface AppState {
  phase: "starting" | "signin" | "main"
  signInError: string | null
  signingIn: boolean
  user: string | null
  attendance: Attendance | null
  courses: Record<string, CourseEntry>
  /** All course ids, newest first. */
  order: string[]
  currentIds: string[]
  previousIds: string[]
  unmatched: AttendanceSubject[]
  sync: SyncState
  /** A course id, PREVIOUS_ROW, or null. */
  selectedId: string | null
  tab: TabName
  focus: "list" | "detail"
  detailIndex: number
  marked: string[]
  filter: string
  filtering: boolean
  showPrevious: boolean
  overlay: "help" | null
  toast: Toast | null
  download: DownloadView | null
  reading: Announcement | null
  /** First visible line of the open announcement, and how far it can scroll (set by the view). */
  readingScroll: number
  readingMax: number
}

export type Row =
  | { kind: "course"; id: string }
  | { kind: "group"; key: typeof PREVIOUS_ROW; label: string; open: boolean; count: number }
  | { kind: "heading"; label: string }
  | { kind: "subject"; subject: AttendanceSubject }

export function listRows(s: AppState): Row[] {
  const q = s.filter.trim().toLowerCase()
  if (q) {
    const hit = (id: string) => s.courses[id]?.course.name.toLowerCase().includes(q) ?? false
    const current = s.currentIds.filter(hit)
    const previous = s.previousIds.filter(hit)
    const rows: Row[] = current.map((id) => ({ kind: "course", id }))
    if (previous.length) {
      rows.push({ kind: "heading", label: "Previous semesters" })
      rows.push(...previous.map((id): Row => ({ kind: "course", id })))
    }
    return rows
  }
  const rows: Row[] = s.currentIds.map((id) => ({ kind: "course", id }))
  if (s.previousIds.length) {
    rows.push({ kind: "group", key: PREVIOUS_ROW, label: "Previous semesters", open: s.showPrevious, count: s.previousIds.length })
    if (s.showPrevious) rows.push(...s.previousIds.map((id): Row => ({ kind: "course", id })))
  }
  if (s.unmatched.length) {
    rows.push({ kind: "heading", label: "Other attendance" })
    rows.push(...s.unmatched.map((subject): Row => ({ kind: "subject", subject })))
  }
  return rows
}

export function selectableKeys(s: AppState): string[] {
  return listRows(s).flatMap((r) => (r.kind === "course" ? [r.id] : r.kind === "group" ? [r.key] : []))
}

const emptyDownload = (): DownloadView => ({
  active: false, visible: false, courses: 0, total: 0, done: 0, bytes: 0, skipped: 0, failed: 0, current: null, folder: "", message: null,
})

function initialState(): AppState {
  return {
    phase: "starting", signInError: null, signingIn: false, user: null, attendance: null,
    courses: {}, order: [], currentIds: [], previousIds: [], unmatched: [],
    sync: { status: "idle", message: null, lastSynced: null },
    selectedId: null, tab: "files", focus: "list", detailIndex: 0, marked: [],
    filter: "", filtering: false, showPrevious: false, overlay: null, toast: null, download: null, reading: null, readingScroll: 0, readingMax: 0,
  }
}

function regroup(s: AppState): void {
  const courses = s.order.map((id) => s.courses[id]!.course)
  for (const id of s.order) s.courses[id]!.attendance = null
  if (!s.attendance) {
    s.currentIds = s.order.slice(0, 8)
    s.previousIds = s.order.slice(8)
    s.unmatched = []
    return
  }
  const { byCourse, unmatched } = matchAttendance(courses, s.attendance.subjects)
  for (const [id, subject] of byCourse) s.courses[id]!.attendance = subject
  s.currentIds = currentSemester(courses, byCourse)
  s.previousIds = s.order.filter((id) => !s.currentIds.includes(id))
  s.unmatched = unmatched
}

export function createAppStore() {
  const [state, setState] = createStore<AppState>(initialState())

  const actions = {
    setPhase: (phase: AppState["phase"]) => setState("phase", phase),
    setSignIn: (error: string | null, busy: boolean) => setState({ signInError: error, signingIn: busy }),
    setUser: (user: string | null) => setState("user", user),

    applyCourses(courses: Course[]) {
      setState(produce((s) => {
        for (const c of courses) {
          const entry = s.courses[c.id]
          if (entry) entry.course = c
          else s.courses[c.id] = { course: c, attendance: null, loading: {}, errors: {} }
        }
        s.order = courses.map((c) => c.id)
        regroup(s)
      }))
      actions.ensureSelection()
    },
    applyAttendance(attendance: Attendance) {
      setState(produce((s) => {
        s.attendance = attendance
        regroup(s)
      }))
      actions.ensureSelection()
    },
    setCourseData<K extends CourseDataKey>(id: string, key: K, value: CourseEntry[K]) {
      if (!state.courses[id]) return
      setState(produce((s) => {
        const entry = s.courses[id]!
        ;(entry as Record<CourseDataKey, unknown>)[key] = value
        delete entry.errors[key]
      }))
    },
    setLoading: (id: string, key: CourseDataKey, on: boolean) => {
      if (state.courses[id]) setState("courses", id, "loading", key, on)
    },
    setError: (id: string, key: CourseDataKey, message: string | null) => {
      if (state.courses[id]) setState("courses", id, "errors", key, message ?? undefined)
    },
    setSync: (patch: Partial<SyncState>) => setState("sync", patch),

    select: (key: string | null) => setState({ selectedId: key, detailIndex: 0, reading: null, readingScroll: 0 }),
    moveSelection(delta: number) {
      const keys = selectableKeys(state)
      if (!keys.length) return
      const at = keys.indexOf(state.selectedId ?? "")
      const next = at < 0 ? 0 : Math.max(0, Math.min(keys.length - 1, at + delta))
      actions.select(keys[next]!)
    },
    ensureSelection() {
      const keys = selectableKeys(state)
      if (!keys.includes(state.selectedId ?? "")) actions.select(keys[0] ?? null)
    },
    setTab: (tab: TabName) => setState({ tab, detailIndex: 0, reading: null, readingScroll: 0 }),
    cycleTab(dir: 1 | -1) {
      const at = TABS.indexOf(state.tab)
      actions.setTab(TABS[(at + dir + TABS.length) % TABS.length]!)
    },
    setFocus: (focus: AppState["focus"]) => setState("focus", focus),
    setDetail: (index: number) => setState({ focus: "detail", detailIndex: Math.max(0, index) }),
    moveDetail: (delta: number, count: number) =>
      setState("detailIndex", (i) => Math.max(0, Math.min(Math.max(0, count - 1), i + delta))),
    toggleMark: (id: string) => setState("marked", (m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id])),
    clearMarks: () => setState("marked", []),
    setFilter(q: string) {
      setState("filter", q)
      actions.ensureSelection()
    },
    setFiltering: (on: boolean) => setState("filtering", on),
    togglePrevious() {
      setState("showPrevious", (v) => !v)
      actions.ensureSelection()
    },
    setOverlay: (overlay: AppState["overlay"]) => setState("overlay", overlay),
    setToast: (toast: Toast | null) => setState("toast", toast),
    setDownload(patch: Partial<DownloadView> | null) {
      if (patch === null) setState("download", null)
      else if (!state.download) setState("download", { ...emptyDownload(), ...patch })
      else setState("download", patch)
    },
    setReading: (a: Announcement | null) => setState({ reading: a, readingScroll: 0 }),
    setReadingMax: (max: number) => setState({ readingMax: max, readingScroll: Math.min(state.readingScroll, Math.max(0, max)) }),
    scrollReading: (delta: number) => setState("readingScroll", (v) => Math.max(0, Math.min(state.readingMax, v + delta))),

    /** Deep copy of the whole UI state (used by the website demo generator to explore key presses). */
    cloneState: (): AppState => structuredClone(unwrap(state)),
    replaceState: (next: AppState) => setState(reconcile(structuredClone(next))),

    snapshot(): Snapshot {
      const raw = unwrap(state)
      return {
        version: 1,
        user: raw.user ?? "",
        savedAt: raw.sync.lastSynced ?? Date.now(),
        attendance: raw.attendance ? structuredClone(raw.attendance) : null,
        courses: raw.order.map((id) => {
          const { loading: _l, errors: _e, attendance: _a, ...rest } = raw.courses[id]!
          return structuredClone(rest)
        }),
      }
    },
    hydrate(snap: Snapshot) {
      setState(produce((s) => {
        s.user = snap.user || s.user
        s.courses = {}
        for (const c of snap.courses) s.courses[c.course.id] = { ...c, attendance: null, loading: {}, errors: {} }
        s.order = snap.courses.map((c) => c.course.id)
        s.attendance = snap.attendance
        s.sync.lastSynced = snap.savedAt
        regroup(s)
      }))
      actions.ensureSelection()
    },
  }

  return { state, actions }
}

export type AppStore = ReturnType<typeof createAppStore>
