import type { AttendanceSubject, Course } from "./types"

const STOP_WORDS = new Set(["and", "of", "the", "for", "in", "to", "with"])

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b[a-z]{2,5}[-\s]?\d{2,5}[a-z]?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w))
    .join(" ")
}

function overlap(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean))
  const B = new Set(b.split(" ").filter(Boolean))
  if (!A.size || !B.size) return 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared++
  return shared / Math.min(A.size, B.size)
}

export interface AttendanceMatch {
  byCourse: Map<string, AttendanceSubject>
  unmatched: AttendanceSubject[]
}

/** Attaches attendance subjects to courses. `courses` should be newest first so a new course wins over an old namesake. */
export function matchAttendance(courses: Course[], subjects: AttendanceSubject[]): AttendanceMatch {
  const byCourse = new Map<string, AttendanceSubject>()
  const unmatched: AttendanceSubject[] = []
  const names = courses.map((c) => ({ id: c.id, n: normaliseName(c.name) }))

  for (const s of subjects) {
    const sn = normaliseName(s.subject)
    const free = names.filter((x) => x.n && !byCourse.has(x.id))
    let hit = sn ? free.find((x) => x.n === sn) : undefined
    hit ??= sn ? free.find((x) => x.n.startsWith(sn) || sn.startsWith(x.n)) : undefined
    if (!hit && sn) {
      let best = 0
      for (const x of free) {
        const score = overlap(x.n, sn)
        if (score >= 0.6 && score > best) {
          best = score
          hit = x
        }
      }
    }
    if (hit) byCourse.set(hit.id, s)
    else unmatched.push(s)
  }
  return { byCourse, unmatched }
}

export function currentSemester(courses: Course[], byCourse: Map<string, AttendanceSubject>, fallback = 8): string[] {
  const matched = courses.filter((c) => byCourse.has(c.id)).map((c) => c.id)
  return matched.length ? matched : courses.slice(0, fallback).map((c) => c.id)
}
