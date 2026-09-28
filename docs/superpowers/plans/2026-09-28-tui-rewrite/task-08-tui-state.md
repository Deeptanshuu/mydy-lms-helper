### Task 8: TUI state, derived view data, sync orchestrator, downloader

Read the global rules in `docs/superpowers/plans/2026-09-28-tui-rewrite.md` first. Tasks 1, 2 and 7 must be done. Runs in parallel with Task 6. Import core values from `@mydy/core/logic` (not `@mydy/core`, which Task 6 is still writing).

**Files:**
- Create: `tui/src/state.ts`, `tui/src/derive.ts`, `tui/src/sync.ts`, `tui/src/download.ts`
- Test: `tui/test/state.test.ts`, `tui/test/sync.test.ts`, `tui/test/download.test.ts`

**Interfaces:**
- Consumes: `@mydy/core/logic` (`matchAttendance`, `currentSemester`, `attendanceMath`, `needsYou`, `calendarDayDiff`, `clockTime`, `shortDate`, errors, types); `Snapshot`, `SnapshotCourse` from `tui/src/cache.ts`; `Credentials` from `tui/src/credentials.ts`.
- Produces:
  - `state.ts`: `type TabName = "files" | "assignments" | "grades" | "announcements"`, `TABS`, `type CourseDataKey = "content" | "assignments" | "grades" | "announcements"`, `interface CourseEntry`, `interface DownloadView`, `interface Toast`, `interface SyncState`, `interface AppState`, `PREVIOUS_ROW = "group:previous"`, `type Row`, `listRows(s): Row[]`, `selectableKeys(s): string[]`, `createAppStore(): AppStore` with `{ state, actions }`, `type AppStore`
  - `derive.ts`: `DOWNLOADABLE`, `courseMath(e, threshold)`, `dueSoonCount(e, now)`, `needsYouFor(s, now, threshold)`, `fileKindOf(activity): FileKind`, `type FileRow`, `fileRows(e)`, `assignmentGroups(e)`, `dueLabel(a, now)`, `assignmentStatus(a)`, `interface DetailItem { url: string; announcement?: AnnouncementSummary }`, `detailItems(s)`
  - `sync.ts`: `interface SyncClient`, `createSync(deps): Sync` with `run()`, `loadTab(id, tab)`, `openAnnouncement(summary)`, `withSession(fn)`, `markSignedIn()`, `reset()`
  - `download.ts`: `interface DownloadClient`, `type DownloadEvent`, `interface DownloadSummary`, `safeName(name)`, `downloadCourses(courses, { client, dir, signal?, onEvent? }): Promise<DownloadSummary>`

`AppState.actions` (all synchronous):
`setPhase(p)`, `setSignIn(error: string | null, busy: boolean)`, `setUser(u)`, `applyCourses(courses)`, `applyAttendance(att)`, `setCourseData(id, key, value)`, `setLoading(id, key, on)`, `setError(id, key, message | null)`, `setSync(partial)`, `select(key)`, `moveSelection(delta)`, `ensureSelection()`, `setTab(tab)`, `cycleTab(1 | -1)`, `setFocus("list" | "detail")`, `moveDetail(delta, count)`, `toggleMark(id)`, `clearMarks()`, `setFilter(q)`, `setFiltering(on)`, `togglePrevious()`, `setOverlay("help" | null)`, `setToast(toast | null)`, `setDownload(partial | null)`, `setReading(announcement | null)`, `snapshot(): Snapshot`, `hydrate(snapshot)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tui/test/state.test.ts
import { describe, expect, test } from "bun:test"
import type { Attendance, Course } from "@mydy/core/logic"
import { createAppStore, listRows, PREVIOUS_ROW, selectableKeys } from "../src/state"

const course = (id: string, name: string): Course => ({ id, name, url: `https://x/course/view.php?id=${id}` })
const COURSES = [course("820", "Software Engineering"), course("815", "Computer Networks"), course("812", "Data Structures and Algorithms"), course("640", "Network Security"), course("530", "Data Structures Lab")]
const ATT: Attendance = {
  batch: "CSE-2023-A",
  semester: "Semester 5",
  subjects: [
    { subject: "Software Engineering", total: 43, present: 40, absent: 3, percentage: 93 },
    { subject: "Computer Networks", total: 46, present: 33, absent: 13, percentage: 71.7 },
    { subject: "Data Structures", total: 50, present: 44, absent: 6, percentage: 88 },
    { subject: "Yoga", total: 12, present: 12, absent: 0, percentage: 100 },
  ],
}
function loaded() {
  const s = createAppStore()
  s.actions.applyCourses(COURSES)
  s.actions.applyAttendance(ATT)
  return s
}

describe("grouping", () => {
  test("courses with attendance are current; the rest are previous; unmatched kept", () => {
    const { state } = loaded()
    expect(state.currentIds).toEqual(["820", "815", "812"])
    expect(state.previousIds).toEqual(["640", "530"])
    expect(state.unmatched.map((u) => u.subject)).toEqual(["Yoga"])
    expect(state.courses["812"]?.attendance?.present).toBe(44)
    expect(state.selectedId).toBe("820")
  })
  test("before attendance arrives, the newest 8 are current", () => {
    const s = createAppStore()
    s.actions.applyCourses(COURSES)
    expect(s.state.currentIds).toEqual(["820", "815", "812", "640", "530"])
  })
})

describe("rows and selection", () => {
  test("previous semesters collapse into one selectable row", () => {
    const s = loaded()
    expect(listRows(s.state).map((r) => r.kind)).toEqual(["course", "course", "course", "group", "heading", "subject"])
    expect(selectableKeys(s.state)).toEqual(["820", "815", "812", PREVIOUS_ROW])
    s.actions.togglePrevious()
    expect(selectableKeys(s.state)).toEqual(["820", "815", "812", PREVIOUS_ROW, "640", "530"])
  })
  test("filter matches across semesters and hides the group toggle", () => {
    const s = loaded()
    s.actions.setFilter("data")
    expect(selectableKeys(s.state)).toEqual(["812", "530"])
    expect(s.state.selectedId).toBe("812")
  })
  test("moveSelection clamps and resets the detail cursor", () => {
    const s = loaded()
    s.actions.moveDetail(3, 10)
    s.actions.moveSelection(1)
    expect(s.state.selectedId).toBe("815")
    expect(s.state.detailIndex).toBe(0)
    s.actions.moveSelection(10)
    expect(s.state.selectedId).toBe(PREVIOUS_ROW)
    s.actions.moveSelection(-10)
    expect(s.state.selectedId).toBe("820")
  })
  test("marks, tabs", () => {
    const s = loaded()
    s.actions.toggleMark("812")
    s.actions.toggleMark("815")
    s.actions.toggleMark("812")
    expect(s.state.marked).toEqual(["815"])
    s.actions.cycleTab(-1)
    expect(s.state.tab).toBe("announcements")
    s.actions.cycleTab(1)
    expect(s.state.tab).toBe("files")
  })
  test("setDownload merges into the current download", () => {
    const s = loaded()
    s.actions.setDownload({ active: true, visible: true, courses: 2, folder: "/d" })
    s.actions.setDownload({ total: 5 })
    expect(s.state.download).toMatchObject({ active: true, courses: 2, total: 5, done: 0, folder: "/d" })
    s.actions.setDownload(null)
    expect(s.state.download).toBeNull()
  })
})

test("snapshot and hydrate round trip", () => {
  const s = loaded()
  s.actions.setUser("student@dypatil.edu")
  s.actions.setCourseData("812", "assignments", [{ name: "A3", url: "u", dueText: null, due: new Date(2026, 8, 30), submissionStatus: null, gradingStatus: null, grade: null, timeRemaining: null, submitted: false }])
  const snap = s.actions.snapshot()
  const t = createAppStore()
  t.actions.hydrate(snap)
  expect(t.state.currentIds).toEqual(["820", "815", "812"])
  expect(t.state.courses["812"]?.assignments?.[0]?.due).toEqual(new Date(2026, 8, 30))
  expect(t.state.sync.lastSynced).toBe(snap.savedAt)
  expect(t.state.user).toBe("student@dypatil.edu")
})
```

```ts
// tui/test/sync.test.ts
import { describe, expect, test } from "bun:test"
import { LoginFailedError, NetworkError, SessionExpiredError, type Attendance, type Course } from "@mydy/core/logic"
import type { Snapshot } from "../src/cache"
import { createAppStore } from "../src/state"
import { createSync, type SyncClient } from "../src/sync"

const COURSES: Course[] = [
  { id: "815", name: "Computer Networks", url: "u815" },
  { id: "812", name: "Data Structures and Algorithms", url: "u812" },
  { id: "640", name: "Network Security", url: "u640" },
]
const ATT: Attendance = { batch: null, semester: "Semester 5", subjects: [
  { subject: "Computer Networks", total: 46, present: 33, absent: 13, percentage: 72 },
  { subject: "Data Structures", total: 50, present: 44, absent: 6, percentage: 88 },
] }

function fakeClient(overrides: Partial<SyncClient> = {}) {
  const calls: string[] = []
  const client: SyncClient = {
    login: async (u) => (calls.push(`login ${u}`), { maskedUser: "st****du" }),
    courses: async () => (calls.push("courses"), COURSES),
    attendance: async () => (calls.push("attendance"), ATT),
    courseContent: async (id) => (calls.push(`content ${id}`), []),
    assignments: async (id) => (calls.push(`assignments ${id}`), []),
    grades: async (id) => (calls.push(`grades ${id}`), { courseName: "x", items: [], total: null }),
    announcements: async (id) => (calls.push(`announcements ${id}`), [{ title: "T", url: "d1", author: null, dateText: null }]),
    announcement: async (s) => (calls.push(`announcement ${s.url}`), { ...s, content: "Body" }),
    clearCache: () => calls.push("clearCache"),
    ...overrides,
  }
  return { client, calls }
}

function setup(overrides: Partial<SyncClient> = {}) {
  const store = createAppStore()
  const { client, calls } = fakeClient(overrides)
  const saved: Snapshot[] = []
  const sync = createSync({ client, store, credentials: () => ({ username: "student@dypatil.edu", password: "pw" }), save: async (s) => void saved.push(s), now: () => 1_000 })
  return { store, sync, calls, saved }
}

describe("run", () => {
  test("signs in, then courses, attendance, and deadlines for the current semester only", async () => {
    const { store, sync, calls, saved } = setup()
    await sync.run()
    expect(calls).toEqual(["clearCache", "login student@dypatil.edu", "courses", "attendance", "content 815", "assignments 815", "content 812", "assignments 812"])
    expect(store.state.sync).toEqual({ status: "idle", message: null, lastSynced: 1_000 })
    expect(saved).toHaveLength(1)
  })
  test("overlapping calls share one run", async () => {
    const { sync, calls } = setup()
    await Promise.all([sync.run(), sync.run()])
    expect(calls.filter((c) => c === "courses")).toHaveLength(1)
  })
  test("an expired session signs in again once and carries on", async () => {
    let first = true
    const { store, sync, calls } = setup({
      courses: async () => {
        if (first) {
          first = false
          throw new SessionExpiredError("signed out")
        }
        return COURSES
      },
    })
    sync.markSignedIn()
    await sync.run()
    expect(calls.filter((c) => c.startsWith("login"))).toHaveLength(1)
    expect(store.state.currentIds).toEqual(["815", "812"])
  })
  test("offline", async () => {
    const { store, sync } = setup({ courses: async () => { throw new NetworkError("Can't reach mydy.dypatil.edu: refused") } })
    await sync.run()
    expect(store.state.sync.status).toBe("offline")
    expect(store.state.sync.message).toContain("Can't reach")
  })
  test("a rejected password shows the signed-out toast", async () => {
    const { store, sync } = setup({ login: async () => { throw new LoginFailedError("Wrong email or password.") } })
    await sync.run()
    expect(store.state.toast).toEqual({ title: "Signed out of MyDy", detail: "Your password may have changed.", action: "signin" })
  })
})

describe("tabs and posts", () => {
  test("loadTab fetches once and caches", async () => {
    const { store, sync, calls } = setup()
    await sync.run()
    await sync.loadTab("812", "grades")
    await sync.loadTab("812", "grades")
    expect(calls.filter((c) => c === "grades 812")).toHaveLength(1)
    expect(store.state.courses["812"]?.grades?.courseName).toBe("x")
  })
  test("a failed tab load records a readable error", async () => {
    const { store, sync } = setup({ grades: async () => { throw new NetworkError("down") } })
    await sync.run()
    await sync.loadTab("812", "grades")
    expect(store.state.courses["812"]?.errors.grades).toBe("Can't reach MyDy. Press r to retry.")
    expect(store.state.courses["812"]?.loading.grades).toBe(false)
  })
  test("openAnnouncement fills the reading pane", async () => {
    const { store, sync } = setup()
    await sync.run()
    await sync.openAnnouncement({ title: "T", url: "d1", author: null, dateText: null })
    expect(store.state.reading?.content).toBe("Body")
  })
})
```

```ts
// tui/test/download.test.ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Course, FileRef, Section } from "@mydy/core/logic"
import { downloadCourses, safeName, type DownloadClient, type DownloadEvent } from "../src/download"

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "mydy-dl-")) })
afterEach(() => rm(dir, { recursive: true, force: true }))

const COURSE: Course = { id: "812", name: "Data Structures: Sem 5", url: "u" }
const SECTIONS: Section[] = [{ number: 1, name: "Unit 1", activities: [
  { name: "Lecture 1", type: "resource", url: "act-a" },
  { name: "Notes", type: "flexpaper", url: "act-b" },
  { name: "Assignment", type: "assign", url: "act-c" },
] }]
const pdf = (body: string) => new Response(body, { headers: { "content-type": "application/pdf", "content-length": String(body.length) } })

function client(files: Record<string, () => Response>, refs: Record<string, FileRef[]>): DownloadClient {
  return {
    courseContent: async () => SECTIONS,
    resolveFiles: async (url) => refs[url] ?? [],
    download: async (url) => files[url]!(),
  }
}
const REFS: Record<string, FileRef[]> = {
  "act-a": [{ url: "f-a", filename: "Lecture 1.pdf", source: "direct" }],
  "act-b": [{ url: "missing", filename: "x.pdf", source: "direct" }, { url: "f-b", filename: "Notes.pdf", source: "flexpaper" }],
}
const folder = () => join(dir, "Data Structures_ Sem 5")

test("saves downloadable activities into a folder per course, trying each candidate", async () => {
  const events: DownloadEvent[] = []
  const summary = await downloadCourses([COURSE], {
    client: client({ "f-a": () => pdf("AAAA"), missing: () => new Response("no", { status: 404 }), "f-b": () => pdf("BB") }, REFS),
    dir,
    onEvent: (e) => events.push(e),
  })
  expect(summary).toEqual({ saved: 2, skipped: 0, failed: 0, bytes: 6, cancelled: false })
  expect(await readFile(join(folder(), "Lecture 1.pdf"), "utf8")).toBe("AAAA")
  expect(await readFile(join(folder(), "Notes.pdf"), "utf8")).toBe("BB")
  expect(events[0]).toEqual({ type: "planned", total: 2 })
})

test("an existing file of the same size is skipped", async () => {
  await mkdir(folder(), { recursive: true })
  await writeFile(join(folder(), "Lecture 1.pdf"), "AAAA")
  const summary = await downloadCourses([COURSE], { client: client({ "f-a": () => pdf("AAAA"), missing: () => new Response("", { status: 404 }), "f-b": () => pdf("BB") }, REFS), dir })
  expect(summary.skipped).toBe(1)
  expect(summary.saved).toBe(1)
})

test("an HTML page (signed out) is not saved as a file", async () => {
  const html = () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })
  const summary = await downloadCourses([COURSE], { client: client({ "f-a": html, missing: html, "f-b": html }, REFS), dir })
  expect(summary.failed).toBe(2)
  expect(existsSync(join(folder(), "Lecture 1.pdf"))).toBe(false)
})

test("a stream that breaks midway leaves no file and no .part", async () => {
  const broken = () =>
    new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("AA")); c.error(new Error("connection reset")) } }), { headers: { "content-type": "application/pdf" } })
  const summary = await downloadCourses([COURSE], { client: client({ "f-a": broken, missing: broken, "f-b": broken }, REFS), dir })
  expect(summary.failed).toBe(2)
  expect(existsSync(join(folder(), "Lecture 1.pdf"))).toBe(false)
  expect(existsSync(join(folder(), "Lecture 1.pdf.part"))).toBe(false)
})

test("cancelling stops before the next file", async () => {
  const controller = new AbortController()
  const summary = await downloadCourses([COURSE], {
    client: client({ "f-a": () => pdf("AAAA"), missing: () => new Response("", { status: 404 }), "f-b": () => pdf("BB") }, REFS),
    dir,
    signal: controller.signal,
    onEvent: (e) => { if (e.type === "file") controller.abort() },
  })
  expect(summary.saved).toBe(1)
  expect(summary.cancelled).toBe(true)
})

test("safeName", () => {
  expect(safeName('a/b:c?"d')).toBe("a_b_c__d")
  expect(safeName("  ")).toBe("Untitled")
})
```

- [ ] **Step 2: Run to see them fail**

Run: `bun test --cwd tui state sync download`
Expected: FAIL, modules not found.

- [ ] **Step 3: `tui/src/state.ts`**

```ts
import { createStore, produce, unwrap } from "solid-js/store"
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
    filter: "", filtering: false, showPrevious: false, overlay: null, toast: null, download: null, reading: null,
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

    select: (key: string | null) => setState({ selectedId: key, detailIndex: 0, reading: null }),
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
    setTab: (tab: TabName) => setState({ tab, detailIndex: 0, reading: null }),
    cycleTab(dir: 1 | -1) {
      const at = TABS.indexOf(state.tab)
      actions.setTab(TABS[(at + dir + TABS.length) % TABS.length]!)
    },
    setFocus: (focus: AppState["focus"]) => setState("focus", focus),
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
    setReading: (a: Announcement | null) => setState("reading", a),

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
```

- [ ] **Step 4: `tui/src/derive.ts`**

```ts
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
  if (a.grade && a.grade !== "-") return { text: `graded ${a.grade}`, tone: "ok" }
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
    case "grades":
      return []
    case "announcements":
      return (e.announcements ?? []).map((a) => ({ url: a.url, announcement: a }))
  }
}
```

- [ ] **Step 5: `tui/src/sync.ts`**

```ts
import {
  LoginFailedError,
  NetworkError,
  SessionExpiredError,
  type Announcement,
  type AnnouncementSummary,
  type Assignment,
  type Attendance,
  type Course,
  type GradeReport,
  type LoginResult,
  type Section,
} from "@mydy/core/logic"
import type { Snapshot } from "./cache"
import type { Credentials } from "./credentials"
import type { AppStore, CourseDataKey, TabName } from "./state"

export interface SyncClient {
  login(username: string, password: string): Promise<LoginResult>
  courses(): Promise<Course[]>
  attendance(): Promise<Attendance>
  courseContent(id: string): Promise<Section[]>
  assignments(id: string): Promise<Assignment[]>
  grades(id: string): Promise<GradeReport>
  announcements(id: string, limit?: number): Promise<AnnouncementSummary[]>
  announcement(summary: AnnouncementSummary): Promise<Announcement>
  clearCache(): void
}

export interface SyncDeps {
  client: SyncClient
  store: AppStore
  credentials: () => Credentials | null
  save: (snapshot: Snapshot) => Promise<void>
  now?: () => number
}

const TAB_DATA: Record<TabName, CourseDataKey> = { files: "content", assignments: "assignments", grades: "grades", announcements: "announcements" }
const OFFLINE_TAB_MESSAGE = "Can't reach MyDy. Press r to retry."

export function createSync(deps: SyncDeps) {
  const { client, store } = deps
  const { actions } = store
  let signedIn = false
  let running: Promise<void> | null = null

  async function signIn(): Promise<void> {
    const creds = deps.credentials()
    if (!creds) throw new LoginFailedError("No saved login.")
    actions.setSync({ status: "syncing", message: "signing in" })
    await client.login(creds.username, creds.password)
    signedIn = true
  }

  async function withSession<T>(fn: () => Promise<T>): Promise<T> {
    if (!signedIn) await signIn()
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof SessionExpiredError)) throw e
      signedIn = false
      await signIn()
      return await fn()
    }
  }

  function report(e: unknown): void {
    if (e instanceof NetworkError) {
      actions.setSync({ status: "offline", message: e.message })
    } else if (e instanceof LoginFailedError || e instanceof SessionExpiredError) {
      signedIn = false
      actions.setSync({ status: "idle", message: null })
      actions.setToast({
        title: "Signed out of MyDy",
        detail: /wrong/i.test(e.message) ? "Your password may have changed." : e.message,
        action: "signin",
      })
    } else {
      actions.setSync({ status: "error", message: e instanceof Error ? e.message : String(e) })
    }
  }

  const save = () => deps.save(actions.snapshot()).catch(() => undefined)

  async function runOnce(): Promise<void> {
    client.clearCache()
    actions.setSync({ status: "syncing", message: "loading courses" })
    actions.applyCourses(await withSession(() => client.courses()))
    actions.setSync({ status: "syncing", message: "loading attendance" })
    actions.applyAttendance(await withSession(() => client.attendance()))
    const ids = [...store.state.currentIds]
    for (const [i, id] of ids.entries()) {
      actions.setSync({ status: "syncing", message: `checking deadlines ${i + 1} of ${ids.length}` })
      actions.setCourseData(id, "content", await withSession(() => client.courseContent(id)))
      actions.setCourseData(id, "assignments", await withSession(() => client.assignments(id)))
    }
    actions.setSync({ status: "idle", message: null, lastSynced: (deps.now ?? Date.now)() })
    await save()
  }

  function run(): Promise<void> {
    running ??= runOnce()
      .catch(report)
      .finally(() => {
        running = null
      })
    return running
  }

  function fetchData(id: string, key: CourseDataKey) {
    switch (key) {
      case "content":
        return client.courseContent(id)
      case "assignments":
        return client.assignments(id)
      case "grades":
        return client.grades(id)
      case "announcements":
        return client.announcements(id)
    }
  }

  async function loadTab(id: string, tab: TabName): Promise<void> {
    const key = TAB_DATA[tab]
    const entry = store.state.courses[id]
    if (!entry || entry[key] !== undefined || entry.loading[key]) return
    actions.setLoading(id, key, true)
    try {
      actions.setCourseData(id, key, await withSession(() => fetchData(id, key)))
      await save()
    } catch (e) {
      if (e instanceof LoginFailedError || e instanceof SessionExpiredError) report(e)
      actions.setError(id, key, e instanceof NetworkError ? OFFLINE_TAB_MESSAGE : e instanceof Error ? e.message : String(e))
    } finally {
      actions.setLoading(id, key, false)
    }
  }

  async function openAnnouncement(summary: AnnouncementSummary): Promise<void> {
    try {
      actions.setReading(await withSession(() => client.announcement(summary)))
    } catch (e) {
      actions.setReading({
        ...summary,
        content: e instanceof NetworkError ? OFFLINE_TAB_MESSAGE : `Couldn't load this post: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  return {
    run,
    loadTab,
    openAnnouncement,
    withSession,
    markSignedIn: () => {
      signedIn = true
    },
    reset: () => {
      signedIn = false
    },
  }
}

export type Sync = ReturnType<typeof createSync>
```

- [ ] **Step 6: `tui/src/download.ts`**

```ts
import { mkdir, rename, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import { SessionExpiredError, type Activity, type Course, type FileRef, type Section } from "@mydy/core/logic"
import { DOWNLOADABLE } from "./derive"

export interface DownloadClient {
  courseContent(id: string): Promise<Section[]>
  resolveFiles(activityUrl: string): Promise<FileRef[]>
  download(url: string): Promise<Response>
}

export type FileStatus = "saved" | "skipped" | "failed"

export type DownloadEvent =
  | { type: "planned"; total: number }
  | { type: "file"; course: string; name: string; status: FileStatus; bytes: number }

export interface DownloadSummary {
  saved: number
  skipped: number
  failed: number
  bytes: number
  cancelled: boolean
}

export function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Untitled"
}

export async function downloadCourses(
  courses: Course[],
  opts: { client: DownloadClient; dir: string; signal?: AbortSignal; onEvent?: (e: DownloadEvent) => void },
): Promise<DownloadSummary> {
  const { client, dir, signal, onEvent } = opts
  const jobs: Array<{ course: Course; activity: Activity }> = []
  for (const course of courses) {
    if (signal?.aborted) break
    for (const section of await client.courseContent(course.id)) {
      for (const activity of section.activities) if (DOWNLOADABLE.has(activity.type)) jobs.push({ course, activity })
    }
  }
  onEvent?.({ type: "planned", total: jobs.length })

  const summary: DownloadSummary = { saved: 0, skipped: 0, failed: 0, bytes: 0, cancelled: false }
  for (const { course, activity } of jobs) {
    if (signal?.aborted) break
    const result = await saveActivity(client, activity, join(dir, safeName(course.name)))
    summary[result.status]++
    summary.bytes += result.bytes
    onEvent?.({ type: "file", course: course.name, name: result.name, status: result.status, bytes: result.bytes })
  }
  summary.cancelled = !!signal?.aborted
  return summary
}

async function saveActivity(client: DownloadClient, activity: Activity, folder: string): Promise<{ status: FileStatus; name: string; bytes: number }> {
  let refs: FileRef[]
  try {
    refs = await client.resolveFiles(activity.url)
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e
    return { status: "failed", name: activity.name, bytes: 0 }
  }

  for (const ref of refs) {
    let res: Response
    try {
      res = await client.download(ref.url)
    } catch (e) {
      if (e instanceof SessionExpiredError) throw e
      continue
    }
    // A signed-out redirect lands on an HTML page; never save that as the file.
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) {
      await res.body?.cancel().catch(() => undefined)
      continue
    }

    await mkdir(folder, { recursive: true })
    const name = safeName(ref.filename)
    const target = join(folder, name)
    const size = Number(res.headers.get("content-length") ?? 0)
    const existing = await stat(target).catch(() => null)
    if (existing && size > 0 && existing.size === size) {
      await res.body?.cancel().catch(() => undefined)
      return { status: "skipped", name, bytes: 0 }
    }

    const part = `${target}.part`
    try {
      const bytes = await Bun.write(part, res)
      await rename(part, target)
      return { status: "saved", name, bytes }
    } catch {
      await unlink(part).catch(() => undefined)
    }
  }
  return { status: "failed", name: activity.name, bytes: 0 }
}
```

- [ ] **Step 7: Run the tests**

Run: `bun test --cwd tui`
Expected: all pass (Task 7's tests included).
