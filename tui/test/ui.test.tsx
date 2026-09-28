import { describe, expect, test } from "bun:test"
import { App } from "../src/ui/App"
import { context, fakeServices, plain, renderWith } from "./helpers"
import { demoStore } from "../src/demo"

const ACCENT = [255, 101, 0]
const ACCENT_SOFT = [57, 34, 20]
const rgb = (c: { buffer: Record<string, number> }) => [c.buffer[0], c.buffer[1], c.buffer[2]]

describe("main screen", () => {
  test("top bar, needs-you strip, both panes and the footer", async () => {
    const t = await renderWith(() => <App />)
    const f = plain(t.frame())
    expect(f).toContain("CSE-2023-A · Semester 5")
    expect(f).toContain("student@dypatil.edu")
    expect(f).toContain("synced 2 min ago")
    expect(f).toContain("NEEDS YOU")
    expect(f).toContain("Assignment 3: Trees  due tomorrow, not submitted")
    expect(f).toContain("Engineering Maths III")
    expect(f).toContain("need 47")
    expect(f).toContain("44 of 50, can miss 8 more")
    expect(f).toContain("Announcements")
    expect(f).toContain("PREVIOUS SEMESTERS")
    expect(f).toContain("Yoga")
    expect(f).toContain("space mark")
    expect(t.ctx.services.calls).toContain("loadTab 812 files")
  })

  test("the needs-you strip drops what doesn't fit instead of cutting it off", async () => {
    const wide = (await renderWith(() => <App />, { width: 160 })).frame()
    expect(wide).toContain("Lab 9: Subnetting  due in 2 days, not submitted")
    const f = (await renderWith(() => <App />, { width: 90 })).frame()
    const strip = f.split("\n").find((l) => l.includes("NEEDS YOU"))!
    expect(strip).toContain("Assignment 3: Trees  due tomorrow, not submitted")
    expect(strip).not.toContain("due in 2 days")
  })

  test("the selected course row gets an accent bar on an accent tint", async () => {
    const t = await renderWith(() => <App />)
    const line = t.captureSpans().lines.find((l) => l.spans.some((s) => s.text.startsWith("Data Structures and Al") && s.text.includes("…")))!
    const nameSpan = line.spans.find((s) => s.text.startsWith("Data Structures and Al") && s.text.includes("…"))!
    expect(rgb(nameSpan.bg as never)).toEqual(ACCENT_SOFT)
    const bar = line.spans.find((s) => s.text.includes("▌"))!
    expect(rgb(bar.fg as never)).toEqual(ACCENT)
  })

  test("without a Nerd Font every course name starts in the same column", async () => {
    const t = await renderWith(() => <App />, { ctx: context({ nerd: false }) })
    const lines = t.frame().split("\n")
    const cols = ["Software Engineering", "Computer Networks", "Data Structures and", "Engineering Maths III"].map((name) => {
      const line = lines.find((l) => l.includes("□") && l.includes(name))!
      return line.indexOf(name)
    })
    expect(new Set(cols).size).toBe(1)
    expect(t.frame()).not.toMatch(/[\u{F0000}-\u{FFFFF}]/u)
  })

  test("a course without attendance says so instead of showing NaN", async () => {
    const store = demoStore()
    store.actions.togglePrevious()
    store.actions.select("640")
    const t = await renderWith(() => <App />, { ctx: context({ store }) })
    expect(t.frame()).toContain("No attendance record for this course")
    expect(t.frame()).not.toContain("NaN")
  })

  test("offline notice replaces the strip", async () => {
    const store = demoStore()
    store.actions.setSync({ status: "offline", message: "Can't reach mydy.dypatil.edu" })
    const t = await renderWith(() => <App />, { ctx: context({ store }) })
    expect(t.frame()).toContain("Can't reach mydy.dypatil.edu. Check your connection, then press r to retry.")
    expect(t.frame()).toContain("offline, from 2 min ago")
  })
})

describe("course tabs", () => {
  test("assignments: most urgent first, then done", async () => {
    const store = demoStore()
    store.actions.setTab("assignments")
    const f = (await renderWith(() => <App />, { ctx: context({ store }) })).frame()
    expect(f).toContain("tomorrow, 23:59")
    expect(f).toContain("not submitted")
    expect(f).toContain("9.00 / 10.00")
    expect(f.indexOf("Assignment 3: Trees  ")).toBeLessThan(f.indexOf("Lab 5: Hashing"))
    expect(f.indexOf("Lab 5: Hashing")).toBeLessThan(f.indexOf("DONE"))
  })
  test("grades with a pinned total", async () => {
    const store = demoStore()
    store.actions.setTab("grades")
    const f = (await renderWith(() => <App />, { ctx: context({ store }) })).frame()
    expect(f).toContain("18 / 25")
    expect(f).toContain("not graded yet")
    expect(f).toContain("Course total")
    expect(f).toContain("51 / 70")
  })
  test("announcements with the reading pane open", async () => {
    const store = demoStore()
    store.actions.setTab("announcements")
    store.actions.setReading({ title: "Mid-sem syllabus uploaded", url: "u", author: "Prof. R. Sharma", dateText: "Mon, 28 Sep 2026", content: "Units 1 to 3 are in scope." })
    const f = (await renderWith(() => <App />, { ctx: context({ store }) })).frame()
    expect(f).toContain("Lab moved to Thursday this week")
    expect(f).toContain("Units 1 to 3 are in scope.")
  })
  test("an error loading a tab is shown in place", async () => {
    const store = demoStore()
    store.actions.setTab("grades")
    store.actions.setCourseData("812", "grades", undefined as never)
    store.actions.setError("812", "grades", "Can't reach MyDy. Press r to retry.")
    const f = (await renderWith(() => <App />, { ctx: context({ store }) })).frame()
    expect(f).toContain("Can't reach MyDy. Press r to retry.")
  })
})

describe("narrow terminal", () => {
  test("80 columns: one pane at a time, long names truncated with an ellipsis", async () => {
    const store = demoStore()
    store.actions.applyCourses([
      { id: "820", name: "Software Engineering and Project Management with a Very Long Title", url: "u" },
      ...["815", "812", "811", "640", "530"].map((id) => ({ ...store.state.courses[id]!.course })),
    ])
    const t = await renderWith(() => <App />, { ctx: context({ store }), width: 80, height: 30 })
    const f = t.frame()
    expect(f).toContain("…")
    expect(f).not.toContain("44 of 50")
    expect(f.split("\n").every((l) => [...l].length <= 80)).toBe(true)
    store.actions.setFocus("detail")
    await t.renderOnce()
    expect(t.frame()).toContain("44 of 50, can miss 8 more")
  })
})

describe("overlays", () => {
  test("help", async () => {
    const store = demoStore()
    store.actions.setOverlay("help")
    const f = (await renderWith(() => <App />, { ctx: context({ store }) })).frame()
    expect(f).toContain("Keys")
    expect(f).toContain("mark course for download")
  })
  test("download drawer", async () => {
    const store = demoStore()
    store.actions.setDownload({ active: true, visible: true, courses: 2, total: 23, done: 14, bytes: 13_002_342, current: "Engineering Maths III / Unit 2.pdf", skipped: 3, folder: "/d" })
    const f = (await renderWith(() => <App />, { ctx: context({ store }) })).frame()
    expect(f).toContain("Downloading 2 courses")
    expect(f).toContain("14 of 23 files, 12.4 MB")
    expect(f).toContain("skipped 3 already saved")
    expect(plain(f)).toContain("x cancel")
  })
  test("signed-out toast", async () => {
    const store = demoStore()
    store.actions.setToast({ title: "Signed out of MyDy", detail: "Your password may have changed.", action: "signin" })
    const f = (await renderWith(() => <App />, { ctx: context({ store }) })).frame()
    expect(f).toContain("Signed out of MyDy")
    expect(plain(f)).toContain("enter sign in again")
  })
})

describe("sign in", () => {
  test("typing email and password, then enter", async () => {
    const store = demoStore()
    store.actions.setUser(null)
    store.actions.setPhase("signin")
    const services = fakeServices()
    const t = await renderWith(() => <App />, { ctx: context({ store, services }) })
    expect(t.frame()).toContain("Sign in with your MyDy account")
    await t.mockInput.typeText("me@dypatil.edu")
    t.mockInput.pressTab()
    await t.mockInput.typeText("s3cret")
    await t.renderOnce()
    expect(t.frame()).toContain("••••••")
    expect(t.frame()).not.toContain("s3cret")
    t.mockInput.pressEnter()
    await t.renderOnce()
    expect(services.calls).toContain("signIn me@dypatil.edu s3cret true")
  })
  test("shows the sign-in error", async () => {
    const store = demoStore()
    store.actions.setPhase("signin")
    store.actions.setSignIn("Wrong email or password.", false)
    const f = (await renderWith(() => <App />, { ctx: context({ store }) })).frame()
    expect(f).toContain("Wrong email or password.")
  })
})

describe("review fixes", () => {
  test("/ opens the filter without typing a slash into it", async () => {
    const t = await renderWith(() => <App />)
    t.mockInput.pressKey("/")
    await t.renderOnce()
    await t.mockInput.typeText("data")
    await t.renderOnce()
    expect(t.ctx.store.state.filter).toBe("data")
    expect(t.frame()).toContain("Data Structures and")
  })
  test("footer keeps help and quit on an 80-column terminal", async () => {
    const f = plain((await renderWith(() => <App />, { width: 80, height: 24 })).frame())
    expect(f).toContain("? help")
    expect(f).toContain("q quit")
  })
  test("a long post scrolls with j and k", async () => {
    const store = demoStore()
    store.actions.setTab("announcements")
    store.actions.setFocus("detail")
    const long = Array.from({ length: 40 }, (_, i) => `Paragraph line ${i + 1}`).join("\n")
    store.actions.setReading({ title: "Long", url: "u", author: null, dateText: null, content: long })
    const t = await renderWith(() => <App />, { ctx: context({ store }), width: 80, height: 24 })
    expect(t.frame()).not.toContain("Paragraph line 20")
    for (let i = 0; i < 45; i++) t.mockInput.pressKey("j")
    await t.renderOnce()
    expect(t.frame()).toContain("Paragraph line 40")
  })
  test("pasting into the password field works", async () => {
    const store = demoStore()
    store.actions.setPhase("signin")
    const services = fakeServices()
    const t = await renderWith(() => <App />, { ctx: context({ store, services }) })
    await t.renderOnce()
    await (t.mockInput as unknown as { pasteBracketedText(s: string): Promise<void> }).pasteBracketedText("s3cret")
    t.mockInput.pressEnter()
    await t.renderOnce()
    expect(services.calls).toContain("signIn student@dypatil.edu s3cret true")
  })
})
