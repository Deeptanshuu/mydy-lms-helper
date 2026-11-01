// The Statistics view of the Results pane, the same three as the GPA calculator's Statistics tab:
// grade progression (SGPA per semester and the CGPA so far), credits by grade, and a semester breakdown.
import { gradeLetters, weightedGpa, type Results } from "@mydy/core/logic"

export interface ProgressionPoint {
  term: number
  sgpa: number | null
  /** CGPA over this semester and every one before it. */
  cgpa: number | null
}

export function progression(r: Results): ProgressionPoint[] {
  return r.semesters.map((sem, i) => ({
    term: sem.term,
    sgpa: sem.sgpa,
    cgpa: weightedGpa(r.semesters.slice(0, i + 1).flatMap((x) => x.courses)),
  }))
}

export interface GradeShare {
  grade: string
  points: number
  credits: number
  /** Share of all graded credits, 0..1. */
  frac: number
}

/** Credits earned at each grade, best grade first. Ungraded subjects and zero-credit ones are left out. */
export function creditsByGrade(r: Results): { total: number; grades: GradeShare[] } {
  const by = new Map<string, { points: number; credits: number }>()
  for (const c of r.semesters.flatMap((x) => x.courses)) {
    if (c.points === null || !(c.credits > 0)) continue
    const grade = c.grade.trim().toUpperCase()
    const e = by.get(grade) ?? { points: c.points, credits: 0 }
    e.credits += c.credits
    by.set(grade, e)
  }
  const order = gradeLetters(r.scheme)
  const total = [...by.values()].reduce((n, e) => n + e.credits, 0)
  const grades = [...by.entries()]
    .map(([grade, e]) => ({ grade, points: e.points, credits: e.credits, frac: total ? e.credits / total : 0 }))
    .sort((a, b) => b.points - a.points || order.indexOf(a.grade) - order.indexOf(b.grade))
  return { total, grades }
}

export interface BreakdownRow {
  term: number
  credits: number
  sgpa: number | null
  /** SGPA change from the previous graded semester; null for the first. */
  delta: number | null
  cgpa: number | null
  /** [grade, how many], best grade first. */
  grades: Array<[string, number]>
}

export function semesterBreakdown(r: Results): BreakdownRow[] {
  const order = gradeLetters(r.scheme)
  const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length)
  let prev: number | null = null
  return progression(r).map((p, i) => {
    const sem = r.semesters[i]!
    const counts = new Map<string, number>()
    for (const c of sem.courses) {
      const g = c.grade.trim().toUpperCase()
      if (g) counts.set(g, (counts.get(g) ?? 0) + 1)
    }
    const delta = p.sgpa !== null && prev !== null ? Math.round((p.sgpa - prev) * 100) / 100 : null
    if (p.sgpa !== null) prev = p.sgpa
    return {
      term: p.term,
      credits: sem.credits,
      sgpa: p.sgpa,
      delta,
      cgpa: p.cgpa,
      grades: [...counts.entries()].sort(([a], [b]) => rank(a) - rank(b)),
    }
  })
}

/** How a grade is coloured in the charts, by its points. */
export function gradeTier(points: number): "top" | "good" | "fair" | "fail" {
  return points >= 9 ? "top" : points >= 7 ? "good" : points > 0 ? "fair" : "fail"
}
