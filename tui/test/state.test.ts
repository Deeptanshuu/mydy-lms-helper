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
