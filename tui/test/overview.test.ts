import { describe, expect, test } from "bun:test"
import type { Assignment } from "@mydy/core/logic"
import { DEMO_NOW, demoStore } from "../src/demo"
import {
  announcementWhen, attendanceRows, deadlineSoon, deadlineWhen, detailItems, greeting, latestAnnouncements, longDate,
  overviewCaption, overviewStats, pctLabel, syncCaption, upcomingDeadlines,
} from "../src/derive"
import { OVERVIEW_ROW } from "../src/state"
import { App } from "../src/ui/App"
import { handleKey, type KeyLike } from "../src/ui/keys"
import { Overview, overviewPlan } from "../src/ui/Overview"
import { context, fakeServices, renderWith } from "./helpers"

const at = (days: number, h = 23, m = 59) => new Date(2026, 8, 29 + days, h, m)
const asg = (name: string, due: Date | null, submitted = false): Assignment => ({
  name, url: `https://x/assign/${name}`, dueText: null, due, submitted, grade: null, submissionStatus: null, gradingStatus: null, timeRemaining: null,
})
const key = (name: string, extra: Partial<KeyLike> = {}): KeyLike => ({ name, sequence: name.length === 1 ? name : "", ctrl: false, shift: false, ...extra })

/** The demo semester with the Overview selected. */
function overview() {
  const store = demoStore()
  store.actions.select(OVERVIEW_ROW)
  return store
}

describe("header helpers", () => {
  test("the greeting follows the hour", () => {
    expect(greeting(new Date(2026, 8, 29, 6))).toBe("Good morning")
    expect(greeting(new Date(2026, 8, 29, 11, 59))).toBe("Good morning")
    expect(greeting(new Date(2026, 8, 29, 12))).toBe("Good afternoon")
    expect(greeting(new Date(2026, 8, 29, 17))).toBe("Good evening")
    expect(greeting(new Date(2026, 8, 29, 2))).toBe("Good evening")
  })
  test("longDate spells out the weekday and month", () => {
    expect(longDate(DEMO_NOW)).toBe("Tuesday 29 September")
    expect(longDate(new Date(2027, 0, 1))).toBe("Friday 1 January")
  })
  test("the caption keeps the true facts and skips the unknown ones", () => {
    const store = overview()
    expect(overviewCaption(store.state, DEMO_NOW)).toEqual(["Tuesday 29 September", "4 courses", "synced 2 min ago"])
    store.actions.setSync({ lastSynced: null })
    expect(overviewCaption(store.state, DEMO_NOW)).toEqual(["Tuesday 29 September", "4 courses"])
    expect(overviewCaption(demoStore().state, DEMO_NOW)).toHaveLength(3)
  })
  test("syncCaption reports offline and syncing states", () => {
    const store = overview()
    store.actions.setSync({ status: "offline" })
    expect(syncCaption(store.state, DEMO_NOW)).toBe("offline, from 2 min ago")
    store.actions.setSync({ status: "syncing" })
    expect(syncCaption(store.state, DEMO_NOW)).toBe("syncing…")
    store.actions.setSync({ status: "error" })
    expect(syncCaption(store.state, DEMO_NOW)).toBe("last sync failed")
  })
  test("pctLabel never rounds a below-threshold course up onto the requirement", () => {
    expect(pctLabel(74.6, true, 0.75)).toBe("74%")
    expect(pctLabel(74.6, false, 0.75)).toBe("75%")
    expect(pctLabel(46.34, true, 0.75)).toBe("46%")
    expect(pctLabel(100, false, 0.75)).toBe("100%")
  })
})

describe("attendanceRows", () => {
  test("lowest attendance first, only current courses with a record", () => {
    const rows = attendanceRows(overview().state, 0.75)
    expect(rows.map((r) => r.name)).toEqual(["Engineering Maths III", "Computer Networks", "Data Structures and Algorithms", "Software Engineering"])
    expect(rows.map((r) => r.below)).toEqual([true, true, false, false])
    expect(rows[0]).toMatchObject({ present: 19, total: 41, status: "low", mustAttend: 47 })
    expect(rows[3]).toMatchObject({ status: "ok", canMiss: 10 })
  })
})

describe("upcomingDeadlines", () => {
  test("soonest first, unsubmitted only, a week back to two weeks ahead", () => {
    const d = upcomingDeadlines(overview().state, DEMO_NOW)
    expect(d.map((x) => x.name)).toEqual(["Assignment 3: Trees", "Lab 9: Subnetting", "Lab 5: Hashing", "Case study: Library system"])
    expect(d.map((x) => x.urgency)).toEqual(["soon", "soon", "later", "later"])
    expect(d.map((x) => x.days)).toEqual([1, 2, 7, 10])
    expect(d[0]).toMatchObject({ courseId: "812", courseName: "Data Structures and Algorithms" })
  })
  test("overdue rows come first; submitted and undated ones are left out; the window is bounded", () => {
    const store = overview()
    store.actions.setCourseData("811", "assignments", [
      asg("Late by a day", at(-1)),
      asg("Late by ten days", at(-10)),
      asg("Done and dusted", at(0), true),
      asg("No date", null),
      asg("Far away", at(15)),
      asg("Due within hours", new Date(2026, 8, 29, 18, 0)),
    ])
    const d = upcomingDeadlines(store.state, DEMO_NOW)
    expect(d.map((x) => x.name).slice(0, 2)).toEqual(["Late by a day", "Due within hours"])
    expect(d.map((x) => x.name)).not.toContain("Late by ten days")
    expect(d.map((x) => x.name)).not.toContain("Done and dusted")
    expect(d.map((x) => x.name)).not.toContain("No date")
    expect(d.map((x) => x.name)).not.toContain("Far away")
    expect(d.slice(0, 2).map((x) => x.urgency)).toEqual(["overdue", "urgent"])
  })
  test("courseIndex is the row on the course's Assignments tab", () => {
    const d = upcomingDeadlines(overview().state, DEMO_NOW)
    // 812 sorts pending by due date: Assignment 3, Lab 5, then the two submitted ones
    expect(d.find((x) => x.name === "Lab 5: Hashing")!.courseIndex).toBe(1)
    expect(d.find((x) => x.name === "Assignment 3: Trees")!.courseIndex).toBe(0)
  })
  test("courses outside the current semester are ignored", () => {
    const store = overview()
    store.actions.setCourseData("640", "assignments", [asg("Old course task", at(1))])
    expect(upcomingDeadlines(store.state, DEMO_NOW).map((x) => x.name)).not.toContain("Old course task")
  })
  test("labels read as an agenda", () => {
    const d = upcomingDeadlines(overview().state, DEMO_NOW)
    expect(deadlineWhen(d[0]!)).toEqual({ label: "Tomorrow", detail: "by 23:59" })
    expect(deadlineWhen(d[1]!)).toEqual({ label: "Thu 1 Oct", detail: "in 2 days" })
    expect(deadlineSoon(d[0]!)).toBe("tomorrow")
    expect(deadlineSoon(d[1]!)).toBe("in 2 days")
    const store = overview()
    for (const id of ["820", "815", "812"]) store.actions.setCourseData(id, "assignments", [])
    store.actions.setCourseData("811", "assignments", [asg("A", at(0)), asg("B", at(-1)), asg("C", at(-3)), asg("D", new Date(2026, 8, 29, 9, 0))])
    const rows = upcomingDeadlines(store.state, DEMO_NOW)
    expect(rows.map((x) => deadlineWhen(x))).toEqual([
      { label: "Overdue", detail: "3 days ago" },
      { label: "Overdue", detail: "yesterday" },
      { label: "Overdue", detail: "at 09:00" },
      { label: "Today", detail: "by 23:59" },
    ])
    expect(rows.map(deadlineSoon)).toEqual(["overdue", "overdue", "overdue", "today"])
  })
})

describe("overviewStats", () => {
  test("attendance is summed over the current courses", () => {
    const a = overviewStats(overview().state, DEMO_NOW, 0.75).attendance!
    expect(a).toMatchObject({ present: 136, total: 180, tracked: 4, above: 2, below: 2, status: "ok" })
    expect(a.percentage).toBeCloseTo(75.6, 1)
    expect(a.worst?.name).toBe("Engineering Maths III")
  })
  test("no attendance yet means null, not zero", () => {
    const store = overview()
    store.actions.applyAttendance({ batch: "", semester: "", subjects: [] })
    expect(overviewStats(store.state, DEMO_NOW, 0.75).attendance).toBeNull()
  })
  test("due this week counts the first week only, and names the soonest", () => {
    const due = overviewStats(overview().state, DEMO_NOW, 0.75).due
    expect(due.count).toBe(2)
    expect(due.next?.name).toBe("Assignment 3: Trees")
    expect(due).toMatchObject({ overdue: 0, urgent: 0, status: "warn", pending: 0 })
  })
  test("overdue or due within a day is low; nothing due is ok", () => {
    const store = overview()
    store.actions.setCourseData("811", "assignments", [asg("Tonight", new Date(2026, 8, 29, 20, 0))])
    expect(overviewStats(store.state, DEMO_NOW, 0.75).due).toMatchObject({ count: 3, urgent: 1, status: "low" })
    for (const id of ["820", "815", "812", "811"]) store.actions.setCourseData(id, "assignments", [])
    expect(overviewStats(store.state, DEMO_NOW, 0.75).due).toMatchObject({ count: 0, next: null, status: "ok" })
  })
  test("courses whose assignments haven't loaded are counted as pending, not as all clear", () => {
    const store = demoStore()
    store.actions.applyCourses([{ id: "9", name: "Late Loader", url: "x" }, ...Object.values(store.state.courses).map((e) => e.course)])
    store.actions.applyAttendance(store.state.attendance!)
    const due = overviewStats(store.state, DEMO_NOW, 0.75).due
    expect(due.pending).toBe(store.state.currentIds.filter((id) => store.state.courses[id]!.assignments === undefined).length)
  })
  test("grades average only the course totals that are loaded and parse", () => {
    const g = overviewStats(overview().state, DEMO_NOW, 0.75).grades
    expect(g.average).toBeCloseTo(51 / 70, 5)
    expect(g).toMatchObject({ graded: 1, loaded: 4, courses: 4 })
    const store = overview()
    store.actions.setCourseData("820", "grades", { courseName: "x", items: [], total: { name: "Course total", grade: "8.00", range: "0–10", percentage: null, feedback: null } })
    const two = overviewStats(store.state, DEMO_NOW, 0.75).grades
    expect(two.graded).toBe(2)
    expect(two.average).toBeCloseTo((51 / 70 + 0.8) / 2, 5)
  })
  test("no course totals gives a null average", () => {
    const store = overview()
    store.actions.setCourseData("812", "grades", { courseName: "x", items: [], total: null })
    expect(overviewStats(store.state, DEMO_NOW, 0.75).grades).toMatchObject({ average: null, graded: 0 })
  })
})

describe("latestAnnouncements", () => {
  test("newest first across courses, limited", () => {
    const list = latestAnnouncements(overview().state, 3)
    expect(list.map((a) => a.title)).toEqual(["Mid-sem syllabus uploaded", "Lab moved to Thursday this week", "Timetable for the mid-semester exams"])
    expect(list[0]).toMatchObject({ courseId: "812", index: 0 })
  })
  test("undated posts go last; the label is relative when the date parses", () => {
    const store = overview()
    store.actions.setCourseData("811", "announcements", [{ title: "Undated", url: "u", author: null, dateText: "soon" }])
    const all = latestAnnouncements(store.state, 20)
    expect(all[all.length - 1]!.title).toBe("Undated")
    expect(announcementWhen(all[0]!, DEMO_NOW)).toBe("Yesterday")
    expect(announcementWhen(all[1]!, DEMO_NOW)).toBe("Sun 27 Sep")
    expect(announcementWhen(all[all.length - 1]!, DEMO_NOW)).toBe("soon")
  })
})

describe("detailItems on the Overview", () => {
  test("are the deadline rows, each pointing at its course", () => {
    const items = detailItems(overview().state, DEMO_NOW)
    expect(items).toHaveLength(4)
    expect(items[0]).toMatchObject({ courseId: "812", courseIndex: 0 })
    expect(items[1]).toMatchObject({ courseId: "815" })
    expect(items[1]!.url).toContain("mod/assign/view.php")
  })
  test("course tabs are unchanged", () => {
    const store = demoStore()
    expect(detailItems(store.state).length).toBeGreaterThan(0)
    expect(detailItems(store.state).every((i) => i.courseId === undefined)).toBe(true)
  })
})

describe("overviewPlan", () => {
  const plan = (width: number, height: number, extra: Partial<Parameters<typeof overviewPlan>[0]> = {}) =>
    overviewPlan({ width, height, courses: 4, deadlines: 4, announcements: 5, ...extra })

  test("primary size: three roomy tiles, two columns, two-line rows, no announcements", () => {
    const p = plan(70, 23)
    expect(p).toMatchObject({ tiles: 3, compact: false, showTiles: true, sideBySide: true })
    expect(p.att).toMatchObject({ visible: 4, per: 1, gap: 1 })
    expect(p.due).toMatchObject({ visible: 4, per: 2, gap: 0 })
    expect(p.news).toBe(0)
  })
  test("wide: breathing room between rows and blocks, announcements", () => {
    const p = plan(112, 40)
    expect(p).toMatchObject({ tiles: 3, compact: false })
    expect(p.att.gap).toBe(1)
    expect(p.due.gap).toBe(1)
    expect(p.tilesGap).toBe(2)
    expect(p.news).toBe(5)
  })
  test("short: compact tiles, one-line rows, no announcements", () => {
    const p = plan(70, 18)
    expect(p).toMatchObject({ compact: true, showTiles: true, news: 0 })
    expect(p.att.per).toBe(1)
    expect(p.due.per).toBe(1)
  })
  test("when tiles would starve the sections, the figures become a one-line ribbon", () => {
    expect(plan(50, 21)).toMatchObject({ showTiles: false, ribbon: true, sideBySide: false })
    expect(plan(50, 21).att.visible).toBe(4)
    expect(plan(70, 12)).toMatchObject({ showTiles: false, ribbon: true })
    expect(plan(70, 8)).toMatchObject({ showTiles: false, ribbon: false })
  })
  test("too many rows for the height collapse into '+N more'", () => {
    const p = plan(70, 18, { courses: 8, deadlines: 12 })
    expect(p.att.more).toBe(true)
    expect(p.att.visible).toBeLessThan(8)
    expect(p.due.more).toBe(true)
  })
  test("a narrow pane stacks the sections and uses fewer tiles", () => {
    expect(plan(50, 30)).toMatchObject({ tiles: 2, sideBySide: false })
    expect(plan(60, 30).tiles).toBe(3)
    expect(plan(82, 30).tiles).toBe(3)
  })
  test("never plans more rows than the height allows", () => {
    for (const width of [40, 56, 64, 70, 82, 112, 140]) {
      for (let height = 12; height <= 46; height++) {
        for (const [courses, deadlines, announcements] of [[0, 0, 0], [4, 4, 5], [8, 12, 5], [1, 1, 0]] as const) {
          const p = overviewPlan({ width, height, courses, deadlines, announcements })
          const tiles = p.showTiles ? (p.compact ? 6 : 8) + p.tilesGap : p.ribbon ? 1 + p.tilesGap : 0
          const list = p.sideBySide ? Math.max(p.att.used, p.due.used, 1) : Math.max(p.att.used, 1) + Math.max(p.due.used, 1) + 1
          const news = p.news ? p.newsGap + 1 + p.headGap + p.news : 0
          expect(4 + tiles + 1 + p.headGap + list + news).toBeLessThanOrEqual(height)
        }
      }
    }
  })
})

describe("keyboard on the Overview", () => {
  function setup() {
    const services = fakeServices()
    const store = overview()
    const ctx = context({ store, services })
    const press = (...keys: KeyLike[]) => keys.forEach((k) => handleKey(k, ctx))
    return { ctx, s: store.state, services, press }
  }

  test("enter, → and l on the Overview row move focus to the deadlines", () => {
    for (const k of ["return", "right", "l"]) {
      const { s, press } = setup()
      expect(s.focus).toBe("list")
      press(key(k))
      expect(s.focus).toBe("detail")
      expect(s.selectedId).toBe(OVERVIEW_ROW)
    }
  })
  test("j and k move the deadline cursor and stop at the ends", () => {
    const { s, press } = setup()
    press(key("return"), key("j"), key("j"))
    expect(s.detailIndex).toBe(2)
    press(key("j"), key("j"), key("j"))
    expect(s.detailIndex).toBe(3)
    press(key("k"))
    expect(s.detailIndex).toBe(2)
    press(key("up"), key("up"), key("up"))
    expect(s.detailIndex).toBe(0)
  })
  test("enter jumps to that assignment on its course's Assignments tab", () => {
    const { s, press } = setup()
    press(key("return"), key("j"), key("return"))
    expect(s.selectedId).toBe("815")
    expect(s.tab).toBe("assignments")
    expect(s.focus).toBe("detail")
    expect(s.detailIndex).toBe(0)
    press(key("escape"), key("k"), key("k"), key("k"), key("k"))
    // back on the list: the Overview row is above the courses
    expect(s.selectedId).toBe(OVERVIEW_ROW)
  })
  test("enter on a later row lands on the right assignment row of a course with several", () => {
    const { s, press } = setup()
    press(key("return"), key("j"), key("j"), key("return"))
    expect(s.selectedId).toBe("812")
    expect(s.detailIndex).toBe(1)
  })
  test("o opens the assignment in the browser", () => {
    const { services, press } = setup()
    press(key("return"), key("j"), key("o"))
    expect(services.calls).toContain("open https://mydy.dypatil.edu/rait/mod/assign/view.php?id=17")
  })
  test("esc returns to the list", () => {
    const { s, press } = setup()
    press(key("return"), key("escape"))
    expect(s.focus).toBe("list")
  })
})

/** Cell position of the first occurrence of `text` below the line containing `after`. */
function find(frame: string, text: string, after = ""): { x: number; y: number } {
  const lines = frame.split("\n")
  const from = after ? lines.findIndex((l) => l.includes(after)) : 0
  const y = lines.findIndex((l, i) => i >= from && l.includes(text))
  if (y < 0) throw new Error(`"${text}" not on screen`)
  return { x: [...lines[y]!.slice(0, lines[y]!.indexOf(text))].length, y }
}

describe("Overview view", () => {
  const render = (width: number, height: number, nerd = true) =>
    renderWith(() => Overview({ width, height }), { ctx: context({ store: overview(), nerd }), width, height })

  test("header ladder, tiles and both sections at the primary size", async () => {
    const f = (await render(74, 26)).frame()
    expect(f).toContain("OVERVIEW · SEMESTER 5")
    expect(f).toContain("Good morning")
    expect(f).toContain("Tuesday 29 September  ·  4 courses  ·  synced 2 min ago")
    expect(f).toContain("Attendance")
    expect(f).toContain("Due this week")
    expect(f).toContain("Grades")
    expect(f).toContain("2 of 4 above 75%")
    expect(f).toContain("ATTENDANCE BY COURSE")
    expect(f).toContain("UPCOMING DEADLINES")
    expect(f).toContain("Tomorrow · Data Structures")
    expect(f).toContain("46%")
    expect(f).toContain("Assignment 3: Trees")
      })
  test("lowest attendance is listed first", async () => {
    const f = (await render(74, 26)).frame()
    expect(find(f, "Engineering Maths III").y).toBeLessThan(find(f, "Software Engineering").y)
  })
  test("a wide pane adds the fourth tile and the announcements", async () => {
    const f = (await render(116, 44)).frame()
    expect(f).toContain("LATEST ANNOUNCEMENTS")
    expect(f).toContain("Mid-sem syllabus uploaded")
  })
  test("no line is wider than the pane and nothing spills below it", async () => {
    for (const [w, h] of [[74, 26], [76, 20], [54, 24], [116, 44], [86, 24], [70, 14]] as const) {
      const t = await renderWith(() => Overview({ width: w, height: h }), { ctx: context({ store: overview() }), width: w + 6, height: h + 4 })
      const lines = t.frame().split("\n")
      for (const line of lines) expect([...line.slice(w)].join("").trim()).toBe("")
      for (const line of lines.slice(h)) expect(line.trim()).toBe("")
    }
  })
  test("without a Nerd Font it still lines up", async () => {
    const f = (await render(74, 26, false)).frame()
    expect(f).toContain("UPCOMING DEADLINES")
    expect(f).toContain("●")
  })
  test("shows an ok empty state when nothing is due", async () => {
    const store = overview()
    for (const id of ["820", "815", "812", "811"]) store.actions.setCourseData(id, "assignments", [])
    const f = (await renderWith(() => Overview({ width: 74, height: 26 }), { ctx: context({ store }), width: 74, height: 26 })).frame()
    expect(f).toContain("Nothing due this week")
    expect(f).toContain("all clear")
    const wide = (await renderWith(() => Overview({ width: 116, height: 40 }), { ctx: context({ store }), width: 116, height: 40 })).frame()
    expect(wide).toContain("Nothing due in the next 7 days")
  })
  test("once the sync is idle, asks for grades and announcements of every current course, one at a time", async () => {
    const services = fakeServices()
    const store = overview()
    store.actions.setSync({ status: "syncing" })
    await renderWith(() => Overview({ width: 74, height: 26 }), { ctx: context({ store, services }), width: 74, height: 26 })
    expect(services.calls.filter((c) => c.startsWith("loadTab"))).toEqual([])
    store.actions.setSync({ status: "idle" })
    await Bun.sleep(0)
    expect(services.calls).toContain("loadTab 815 grades")
    expect(services.calls).toContain("loadTab 811 announcements")
  })
  test("stays honest while data is loading: no 'all caught up', no 'nothing due'", async () => {
    const store = demoStore()
    store.actions.setCourseData("812", "assignments", undefined as never)
    store.actions.select(OVERVIEW_ROW)
    store.actions.setSync({ status: "syncing" })
    const f = (await renderWith(() => Overview({ width: 74, height: 26 }), { ctx: context({ store }), width: 74, height: 26 })).frame()
    expect(f).not.toContain("all caught up")
    expect(f).not.toContain("Nothing due")
  })
})

describe("Overview mouse", () => {
  async function app() {
    const store = overview()
    const t = await renderWith(() => App(), { ctx: context({ store }), width: 120, height: 34 })
    return t
  }

  test("clicking a deadline selects it; clicking it again jumps to its assignment", async () => {
    const t = await app()
    const at = find(t.frame(), "Lab 9: Subnetting", "UPCOMING DEADLINES")
    await t.mockMouse.click(at.x + 2, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.focus).toBe("detail")
    expect(t.ctx.store.state.detailIndex).toBe(1)
    expect(t.ctx.store.state.selectedId).toBe(OVERVIEW_ROW)
    const again = find(t.frame(), "Lab 9: Subnetting", "UPCOMING DEADLINES")
    await t.mockMouse.click(again.x + 2, again.y)
    await t.renderOnce()
    expect(t.ctx.store.state.selectedId).toBe("815")
    expect(t.ctx.store.state.tab).toBe("assignments")
  })
  test("clicking a course in the attendance list selects that course", async () => {
    const t = await app()
    const at = find(t.frame(), "Engineering Maths III", "ATTENDANCE BY COURSE")
    await t.mockMouse.click(at.x + 2, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.selectedId).toBe("811")
    expect(t.ctx.store.state.focus).toBe("list")
  })
  test("the wheel over the deadlines moves the cursor", async () => {
    const t = await app()
    const at = find(t.frame(), "Lab 9: Subnetting", "UPCOMING DEADLINES")
    await t.mockMouse.scroll(at.x + 2, at.y, "down")
    await t.renderOnce()
    expect(t.ctx.store.state.focus).toBe("detail")
    expect(t.ctx.store.state.detailIndex).toBe(1)
  })
})
