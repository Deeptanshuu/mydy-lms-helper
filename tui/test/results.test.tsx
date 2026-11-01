import { describe, expect, test } from "bun:test"
import { buildResults, courseKey, NetworkError, PortalLoginError, type Results } from "@mydy/core/logic"
import type { Snapshot } from "../src/cache"
import type { PortalCredentials } from "../src/credentials"
import { DEMO_NOW, demoStore } from "../src/demo"
import { detailItems, gradeTone, resultsCaption, sgpaChange, simSubjects, simulated, stepGrade } from "../src/derive"
import { createResults, RESULTS_FRESH_MS, type ResultsClient } from "../src/results"
import { createAppStore, RESULTS_ROW } from "../src/state"
import { footerKeys } from "../src/ui/Chrome"
import { handleKey, type KeyLike } from "../src/ui/keys"
import { Results as ResultsPane } from "../src/ui/Results"
import { context, fakeServices, renderWith } from "./helpers"

const RESULTS: Results = buildResults("DY23MTCO012", [
  { exam: { code: "A-2023-1", name: "Dec 2023" }, rows: [{ subject: "Engineering Maths", FCREDITS: "4", remarks: "A" }, { subject: "Physics Lab", FCREDITS: "1", remarks: "O" }] },
  { exam: { code: "B-2024-1", name: "May 2024" }, rows: [{ subject: "Data Structures", FCREDITS: "4", remarks: "B" }, { subject: "Signals", FCREDITS: "3", remarks: "F" }] },
])
const WINDOWS = [{ code: "B-2024-1", exam: "May 2024", examDate: "", resultDate: "", open: true, window: "till 5 Nov" }]
const APPS = [{ appNo: "RV2611", applied: "02-11-2026", amount: "500", paid: "02-11-2026", paymentType: "Online", status: "Applied",
  items: [{ code: "CS301", subject: "Signals", exam: "May 2024", examDate: "", kind: "Revaluation", processed: false }] }]
const key = (name: string): KeyLike => ({ name, sequence: name.length === 1 ? name : "", ctrl: false, shift: false })

function loader(opts: { creds?: PortalCredentials | null; client?: Partial<ResultsClient>; now?: number } = {}) {
  const store = createAppStore()
  const calls: string[] = []
  const saved: Snapshot[] = []
  let creds = opts.creds === undefined ? { regno: "9876543210", password: "pw" } : opts.creds
  let now = opts.now ?? 1_000_000
  const client: ResultsClient = {
    login: async (r, p) => {
      calls.push(`login ${r}`)
      if (p !== "pw") throw new PortalLoginError("Invalid credentials")
      return "DY23MTCO012"
    },
    results: async () => (calls.push("results"), RESULTS),
    revaluationWindows: async () => (calls.push("windows"), WINDOWS),
    revaluationApplications: async () => (calls.push("applications"), APPS),
    ...opts.client,
  }
  const results = createResults({
    client,
    store,
    credentials: () => creds,
    setCredentials: (c) => {
      creds = c
    },
    remember: async (c) => (calls.push(`remember ${c.regno}`), null),
    forget: async () => void calls.push("forget"),
    save: async (s) => void saved.push(s),
    now: () => now,
  })
  return { store, s: store.state, results, calls, saved, creds: () => creds, tick: (ms: number) => (now += ms) }
}

describe("loading results", () => {
  test("without a login the pane asks for one, and nothing is fetched", async () => {
    const t = loader({ creds: null })
    await t.results.load()
    expect(t.s.results.status).toBe("signin")
    expect(t.calls).toEqual([])
  })

  test("signs in, fetches results and windows, saves them", async () => {
    const t = loader()
    await t.results.load()
    expect(t.calls).toEqual(["login 9876543210", "results", "windows", "applications"])
    expect(t.s.results.applications).toEqual(APPS)
    expect(t.s.results.status).toBe("idle")
    expect(t.s.results.data?.cgpa).toBe(RESULTS.cgpa)
    expect(t.s.results.revaluation).toEqual(WINDOWS)
    expect(t.saved.at(-1)?.results?.data.usn).toBe("DY23MTCO012")
  })

  test("fresh results aren't fetched again; r (force) or age does", async () => {
    const t = loader()
    await t.results.load()
    await t.results.load()
    expect(t.calls.filter((c) => c === "results")).toHaveLength(1)
    await t.results.load(true)
    expect(t.calls.filter((c) => c === "results")).toHaveLength(2)
    t.tick(RESULTS_FRESH_MS + 1)
    await t.results.load()
    expect(t.calls.filter((c) => c === "results")).toHaveLength(3)
  })

  test("a rejected saved login shows the form with the portal's message, and isn't retried on its own", async () => {
    const t = loader({ creds: { regno: "1", password: "old" } })
    await t.results.load()
    expect(t.s.results.status).toBe("signin")
    expect(t.s.results.message).toBe("Invalid credentials")
    await t.results.load()
    expect(t.calls).toEqual(["login 1"])
  })

  test("offline keeps the last results and says so", async () => {
    let online = true
    const t = loader({
      client: {
        login: async () => {
          if (!online) throw new NetworkError("down")
          return "DY23MTCO012"
        },
      },
    })
    await t.results.load()
    online = false
    await t.results.load(true)
    expect(t.s.results.status).toBe("offline")
    expect(t.s.results.message).toMatch(/Can't reach UniClaIRE/)
    expect(t.s.results.data?.usn).toBe("DY23MTCO012")
  })

  test("results without revaluation windows still count", async () => {
    const t = loader({ client: { revaluationWindows: () => Promise.reject(new Error("500")) } })
    await t.results.load()
    expect(t.s.results.status).toBe("idle")
    expect(t.s.results.revaluation).toBeNull()
  })
})

describe("signing in and out", () => {
  test("a working login closes the form and is remembered when asked", async () => {
    const t = loader({ creds: null })
    t.store.actions.setResults({ status: "signin", editing: true })
    await t.results.signIn(" 9876543210 ", "pw", true)
    expect(t.s.results.editing).toBe(false)
    expect(t.s.results.signingIn).toBe(false)
    expect(t.s.results.data).not.toBeNull()
    expect(t.creds()).toEqual({ regno: "9876543210", password: "pw" })
    expect(t.calls).toContain("remember 9876543210")
  })

  test("a wrong one keeps the form up and isn't kept", async () => {
    const t = loader({ creds: null })
    t.store.actions.setResults({ status: "signin", editing: true })
    await t.results.signIn("9876543210", "nope", true)
    expect(t.s.results).toMatchObject({ status: "signin", editing: true, message: "Invalid credentials", signingIn: false })
    expect(t.creds()).toBeNull()
    expect(t.calls).not.toContain("remember 9876543210")
  })

  test("signing out forgets the login and the results", async () => {
    const t = loader()
    await t.results.load()
    t.store.actions.setSimGrade(courseKey(2, 1), "C")
    await t.results.signOut()
    expect(t.s.results.sim).toEqual({})
    expect(t.creds()).toBeNull()
    expect(t.calls).toContain("forget")
    expect(t.s.results.data).toBeNull()
    expect(t.s.results.status).toBe("signin")
    expect(t.saved.at(-1)?.results).toBeUndefined()
  })

  test("results survive a snapshot round trip", () => {
    const a = demoStore()
    a.actions.applyResults(RESULTS, WINDOWS, 42)
    const b = createAppStore()
    b.actions.hydrate(a.actions.snapshot())
    expect(b.state.results.data).toEqual(RESULTS)
    expect(b.state.results.fetchedAt).toBe(42)
  })
})

describe("helpers", () => {
  test("the SGPA change compares the last two graded semesters", () => {
    expect(sgpaChange(RESULTS.semesters)).toBe(`−${(RESULTS.semesters[0]!.sgpa! - RESULTS.semesters[1]!.sgpa!).toFixed(2)} on semester 1`)
    expect(sgpaChange(RESULTS.semesters.slice(0, 1))).toBeNull()
  })
  test("grade tones", () => {
    expect([gradeTone(10), gradeTone(8), gradeTone(0), gradeTone(null)]).toEqual(["ok", "text", "low", "muted"])
  })
  test("caption", () => {
    const store = demoStore()
    store.actions.applyResults(RESULTS, null, DEMO_NOW.getTime() - 2 * 3600_000)
    expect(resultsCaption(store.state, DEMO_NOW)).toEqual(["DY23MTCO012", "2 semesters", "12 credits", "fetched 2 hours ago"])
  })
})

describe("the pane", () => {
  function setup(results: Results | null) {
    const store = demoStore()
    store.actions.select(RESULTS_ROW)
    if (results) store.actions.applyResults(results, WINDOWS, DEMO_NOW.getTime())
    else store.actions.setResults({ status: "signin" })
    const services = fakeServices()
    const ctx = context({ store, services })
    return { ctx, s: store.state, services, press: (...ks: string[]) => ks.forEach((k) => handleKey(key(k), ctx)) }
  }

  test("shows CGPA, semesters and the selected semester's grades", async () => {
    const t = setup(RESULTS)
    const r = await renderWith(() => <ResultsPane width={110} height={34} />, { ctx: t.ctx })
    const frame = r.frame()
    expect(t.services.calls).toContain("loadResults false")
    for (const text of ["RESULTS · UNICLAIRE", "CGPA", "Latest SGPA", "Open", "Semester 1", "Semester 2", "Engineering Maths", "4 cr"]) expect(frame).toContain(text)
    t.press("return", "j")
    await r.renderOnce()
    expect(r.frame()).toContain("Signals")
    expect(r.frame()).not.toContain("Engineering Maths")
  })

  test("without a login: the form, which enter focuses and esc leaves", async () => {
    const t = setup(null)
    const r = await renderWith(() => <ResultsPane width={100} height={34} />, { ctx: t.ctx })
    expect(r.frame()).toContain("REGISTRATION NUMBER")
    expect(r.frame()).toContain("Press enter to sign in.")
    t.press("return")
    expect(t.s.focus).toBe("detail")
    expect(t.s.results.editing).toBe(true)
    expect(footerKeys(t.s).map(([k]) => k)).toEqual(["tab", "enter", "esc"])
    // While typing, letters aren't shortcuts.
    t.press("q", "r", "x")
    expect(t.services.calls.filter((c) => !c.startsWith("loadResults false"))).toEqual([])
    t.press("escape")
    expect(t.s.results.editing).toBe(false)
    expect(t.s.focus).toBe("list")
  })

  test("r refetches from UniClaIRE, x signs out, j/k pick a semester", () => {
    const t = setup(RESULTS)
    t.press("r")
    expect(t.services.calls).toEqual(["loadResults true"])
    t.press("return")
    expect(detailItems(t.s)).toHaveLength(2)
    t.press("j", "j")
    expect(t.s.detailIndex).toBe(1)
    t.press("x")
    expect(t.services.calls).toContain("portalSignOut")
  })
})

describe("what-if simulator", () => {
  function setup() {
    const store = demoStore()
    store.actions.select(RESULTS_ROW)
    store.actions.applyResults(RESULTS, WINDOWS, DEMO_NOW.getTime(), APPS)
    const services = fakeServices()
    const ctx = context({ store, services })
    return { ctx, s: store.state, press: (...ks: string[]) => ks.forEach((k) => handleKey(key(k), ctx)) }
  }

  test("grades step through the scheme and stop at the ends", () => {
    expect(stepGrade("B", "legacy", 1)).toBe("A")
    expect(stepGrade("B", "legacy", -1)).toBe("C")
    expect(stepGrade("O", "new", 1)).toBe("O")
    expect(stepGrade("F", "new", -1)).toBe("F")
    expect(stepGrade("PP", "new", 1)).toBe("P")
  })

  test("s opens it on the shown semester; → and ← change the grade; esc keeps the changes", () => {
    const t = setup()
    t.press("return", "j") // semester 2
    t.press("s")
    expect(t.s.results.simulating).toBe(true)
    expect(simSubjects(t.s)[t.s.detailIndex]).toMatchObject({ semester: 1, index: 0 }) // Data Structures
    t.press("j") // Signals: F
    t.press("right", "right") // the older scheme: F, then P, then E
    expect(t.s.results.sim).toEqual({ [courseKey(2, 1)]: "E" })
    const sim = simulated(t.s)!
    expect(sim.semesters[1]!.sgpa! > RESULTS.semesters[1]!.sgpa!).toBe(true)
    expect(sim.cgpa! > RESULTS.cgpa!).toBe(true)
    // Back to the real grade: no override left.
    t.press("left", "left")
    expect(t.s.results.sim).toEqual({})
    t.press("l", "escape")
    expect(t.s.results.simulating).toBe(false)
    expect(t.s.focus).toBe("detail")
    expect(t.s.detailIndex).toBe(1)
    expect(Object.keys(t.s.results.sim)).toHaveLength(1)
    t.press("c")
    expect(t.s.results.sim).toEqual({})
  })

  test("u undoes one subject; j walks into the next semester", () => {
    const t = setup()
    t.press("return", "s", "l", "j", "h") // Maths A → O, Physics Lab O → A
    expect(Object.keys(t.s.results.sim)).toHaveLength(2)
    t.press("u")
    expect(Object.keys(t.s.results.sim)).toEqual([courseKey(1, 0)])
    t.press("j")
    expect(simSubjects(t.s)[t.s.detailIndex]).toMatchObject({ semester: 1, index: 0 })
  })

  test("what-if grades survive a snapshot round trip", () => {
    const t = setup()
    t.press("return", "s", "l")
    const b = createAppStore()
    b.actions.hydrate(t.ctx.store.actions.snapshot())
    expect(b.state.results.sim).toEqual({ [courseKey(1, 0)]: "O" })
    expect(b.state.results.applications).toEqual(APPS)
  })

  test("the pane shows the change and the simulated CGPA", async () => {
    const t = setup()
    t.press("return", "j", "s", "j", "l", "l")
    const r = await renderWith(() => <ResultsPane width={120} height={36} />, { ctx: t.ctx })
    const frame = r.frame()
    expect(frame).toContain("F → E")
    expect(frame).toContain("CGPA · what-if")
    expect(frame).toContain(`was ${RESULTS.cgpa!.toFixed(2)}`)
    expect(footerKeys(t.s).map(([k]) => k)).toEqual(["↑↓", "←→", "u", "c", "esc", "?", "q"])
  })
})

describe("revaluation view", () => {
  test("tab switches to the applications, with each subject's progress", async () => {
    const store = demoStore()
    store.actions.select(RESULTS_ROW)
    store.actions.applyResults(RESULTS, WINDOWS, DEMO_NOW.getTime(), APPS)
    const ctx = context({ store })
    handleKey(key("return"), ctx)
    handleKey(key("tab"), ctx)
    expect(store.state.results.view).toBe("statistics")
    handleKey(key("tab"), ctx)
    expect(store.state.results.view).toBe("revaluation")
    expect(detailItems(store.state)).toHaveLength(1)
    const r = await renderWith(() => <ResultsPane width={120} height={36} />, { ctx })
    for (const text of ["APPLICATIONS", "RV2611", "1 pending", "Signals", "Revaluation", "pending", "Rs 500"]) expect(r.frame()).toContain(text)
    // s is only the simulator in the Grades view.
    handleKey(key("s"), ctx)
    expect(store.state.results.simulating).toBe(false)
    handleKey(key("tab"), ctx)
    expect(store.state.results.view).toBe("grades")
  })

  test("applications that couldn't be fetched say so", async () => {
    const store = demoStore()
    store.actions.select(RESULTS_ROW)
    store.actions.applyResults(RESULTS, WINDOWS, DEMO_NOW.getTime(), null)
    store.actions.cycleResultsView(-1)
    const r = await renderWith(() => <ResultsPane width={120} height={36} />, { ctx: context({ store }) })
    expect(r.frame()).toContain("Couldn't load your revaluation applications.")
  })
})
