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
  test("tabs loading at once before a session exists share one sign-in", async () => {
    const { store, sync, calls } = setup()
    store.actions.applyCourses(COURSES)
    await Promise.all([sync.loadTab("815", "grades"), sync.loadTab("812", "grades"), sync.loadTab("815", "announcements")])
    expect(calls.filter((c) => c.startsWith("login"))).toHaveLength(1)
    expect(calls).toContain("grades 812")
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
    store.actions.setTab("announcements")
    await sync.openAnnouncement({ title: "T", url: "d1", author: null, dateText: null })
    expect(store.state.reading?.content).toBe("Body")
  })
  test("a post that arrives after the user moved on is not shown", async () => {
    const { store, sync } = setup()
    await sync.run()
    store.actions.setTab("announcements")
    const pending = sync.openAnnouncement({ title: "T", url: "d1", author: null, dateText: null })
    store.actions.moveSelection(1)
    await pending
    expect(store.state.reading).toBeNull()
  })
})
