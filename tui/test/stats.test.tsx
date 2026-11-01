import { describe, expect, test } from "bun:test"
import { buildResults } from "@mydy/core/logic"
import { lineChart, yRange } from "../src/chart"
import { DEMO_NOW, demoStore } from "../src/demo"
import { RESULTS_ROW } from "../src/state"
import { creditsByGrade, gradeTier, progression, semesterBreakdown } from "../src/stats"
import { footerKeys } from "../src/ui/Chrome"
import { handleKey, type KeyLike } from "../src/ui/keys"
import { Results as ResultsPane } from "../src/ui/Results"
import { context, renderWith } from "./helpers"

const R = buildResults("DY23MTCO012", [
  { exam: { code: "A-2023-1", name: "Dec 2023" }, rows: [{ subject: "Maths", FCREDITS: "4", remarks: "A" }, { subject: "Lab", FCREDITS: "1", remarks: "O" }, { subject: "EVS", FCREDITS: "0", remarks: "PP" }] },
  { exam: { code: "B-2024-1", name: "May 2024" }, rows: [{ subject: "DBMS", FCREDITS: "4", remarks: "B" }, { subject: "OS", FCREDITS: "3", remarks: "F" }, { subject: "Lab 2", FCREDITS: "1", remarks: "B" }] },
])
const key = (name: string, shift = false): KeyLike => ({ name, sequence: name.length === 1 ? name : "", ctrl: false, shift })

describe("statistics", () => {
  test("progression: each semester's SGPA and the CGPA up to it", () => {
    expect(progression(R)).toEqual([
      { term: 1, sgpa: 9.2, cgpa: 9.2 },
      { term: 2, sgpa: 5, cgpa: R.cgpa },
    ])
  })

  test("credits by grade, best first; ungraded and zero-credit subjects left out", () => {
    const d = creditsByGrade(R)
    expect(d.total).toBe(13)
    expect(d.grades.map((g) => [g.grade, g.credits])).toEqual([["O", 1], ["A", 4], ["B", 5], ["F", 3]])
    expect(d.grades.reduce((n, g) => n + g.frac, 0)).toBeCloseTo(1)
  })

  test("breakdown: change on the previous semester and grade counts, best first", () => {
    const rows = semesterBreakdown(R)
    expect(rows.map((r) => [r.term, r.sgpa, r.delta, r.cgpa])).toEqual([[1, 9.2, null, 9.2], [2, 5, -4.2, R.cgpa]])
    expect(rows[0]!.grades).toEqual([["O", 1], ["A", 1], ["PP", 1]])
    expect(rows[1]!.grades).toEqual([["B", 2], ["F", 1]])
  })

  test("grade tiers", () => {
    expect([10, 9, 8, 7, 6, 4, 0].map(gradeTier)).toEqual(["top", "top", "good", "good", "fair", "fair", "fail"])
  })
})

describe("line chart", () => {
  test("the y range pads to half points and stays inside 0..10", () => {
    expect(yRange([8.88, 6.65, 9.65])).toEqual([6, 10])
    expect(yRange([8.2])).toEqual([7.5, 8.5])
    expect(yRange([0.1])).toEqual([0, 1])
    expect(yRange([])).toEqual([0, 10])
  })

  const chart = (braille: boolean) =>
    lineChart({ dots: [9.2, 5, 8], line: [9.2, 7, 7.6], labels: ["S1", "S2", "S3"], width: 40, height: 12, braille })
  const text = (rows: ReturnType<typeof chart>) => rows.map((r) => r.map((c) => c.text).join(""))

  test("every row is exactly the width; axis, then the labels under the points", () => {
    const rows = text(chart(true))
    expect(rows).toHaveLength(12)
    for (const r of rows) expect([...r].length).toBe(40)
    expect(rows[10]!.trim()).toMatch(/^└─+$/)
    expect(rows[11]!.trim().split(/\s+/)).toEqual(["S1", "S2", "S3"])
  })

  test("one dot per semester, a braille line, and y labels on the axis", () => {
    const cells = chart(true).flat()
    expect(cells.filter((c) => c.role === "dot")).toHaveLength(3)
    expect(cells.some((c) => c.role === "line" && /[⠁-⣿]/.test(c.text))).toBe(true)
    // The y range is 4.5..9.5; ten rows only have room for whole-point labels, top to bottom.
    const rows = text(chart(true))
    expect(rows.flatMap((r) => (/^\s*([\d.]+)┤/.exec(r)?.[1] ?? []) as string[])).toEqual(["9", "8", "7", "6", "5"])
    const dotRows = chart(true).flatMap((r, i) => (r.some((c) => c.role === "dot") ? [i] : []))
    expect(dotRows[0]!).toBeLessThan(dotRows[dotRows.length - 1]!)
  })

  test("without braille the line is drawn in middle dots", () => {
    const cells = chart(false).flat()
    expect(cells.some((c) => c.role === "line" && c.text === "·")).toBe(true)
    expect(cells.every((c) => !/[⠀-⣿]/.test(c.text))).toBe(true)
  })

  test("a single semester draws one centred dot", () => {
    const rows = lineChart({ dots: [8], line: [8], labels: ["S1"], width: 30, height: 8, braille: true })
    expect(rows.flat().filter((c) => c.role === "dot")).toHaveLength(1)
    expect(rows[7]!.map((c) => c.text).join("").trim()).toBe("S1")
  })
})

describe("the Statistics view", () => {
  function setup() {
    const store = demoStore()
    store.actions.select(RESULTS_ROW)
    store.actions.applyResults(R, [], DEMO_NOW.getTime(), [])
    const ctx = context({ store })
    return { ctx, s: store.state, press: (...ks: KeyLike[]) => ks.forEach((k) => handleKey(k, ctx)) }
  }

  test("tab cycles Grades → Statistics → Revaluation, shift+tab goes back", () => {
    const t = setup()
    t.press(key("return"), key("tab"))
    expect(t.s.results.view).toBe("statistics")
    expect(footerKeys(t.s).map(([k]) => k)).toEqual(["tab", "r", "o", "esc", "?", "q"])
    t.press(key("tab"))
    expect(t.s.results.view).toBe("revaluation")
    t.press(key("tab", true), key("tab", true))
    expect(t.s.results.view).toBe("grades")
  })

  test("draws the chart, the credits by grade and the breakdown, and follows what-if grades", async () => {
    const t = setup()
    t.press(key("return"), key("s"), key("j"), key("j"), key("j"), key("j"), key("l"), key("l"), key("l"), key("escape"), key("tab"))
    expect(t.s.results.view).toBe("statistics")
    const r = await renderWith(() => <ResultsPane width={110} height={40} />, { ctx: t.ctx, height: 40 })
    const frame = r.frame()
    for (const text of ["GRADE PROGRESSION", "SGPA", "CGPA", "CREDITS BY GRADE", "13 cr", "SEMESTER BREAKDOWN", "Sem 1", "Sem 2", "what-if: 1 grade changed"]) expect(frame).toContain(text)
    // OS went F → D (three steps up on the older scheme: P, E, D): no F left in the distribution.
    expect(frame).not.toMatch(/\n\s+F\s+━/)
    expect(frame).toContain("─")
  })
})
