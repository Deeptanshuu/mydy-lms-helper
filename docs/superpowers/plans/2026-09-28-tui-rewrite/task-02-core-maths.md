### Task 2: Core maths: attendance, dates, needs-you, attendance matching

Read the global rules in `docs/superpowers/plans/2026-09-28-tui-rewrite.md` first. Task 1 must be done.

**Files:**
- Create: `core/src/attendance.ts`, `core/src/dates.ts`, `core/src/needs-you.ts`, `core/src/match.ts`, `core/src/logic.ts`
- Test: `core/test/attendance.test.ts`, `core/test/dates.test.ts`, `core/test/needs-you.test.ts`, `core/test/match.test.ts`

**Interfaces:**
- Consumes: `core/src/types.ts`, `core/src/errors.ts` (Task 1).
- Produces (imported by the TUI through `@mydy/core/logic`):
  - `attendanceMath(present: number, total: number, threshold = 0.75): AttendanceMath` where `AttendanceMath = { percentage: number | null; status: "ok" | "warn" | "low"; canMiss: number; mustAttend: number }`
  - `parseMoodleDate(text: string | null | undefined): Date | null`, `calendarDayDiff(target: Date, from: Date): number`, `shortDate(d: Date): string` ("Mon 12 Oct"), `clockTime(d: Date): string` ("23:59"), `relativeDue(due: Date, now: Date): string`
  - `needsYou(inputs: NeedsYouInput[], now: Date, threshold = 0.75, windowDays = 7): NeedsYouItem[]` with `NeedsYouInput = { courseId; courseName; attendance: { present; total } | null; assignments: Assignment[] }` and `NeedsYouItem = { kind: "attendance" | "deadline"; courseId; title; detail; severity: "warn" | "low" }`
  - `normaliseName(name: string): string`, `matchAttendance(courses: Course[], subjects: AttendanceSubject[]): { byCourse: Map<string, AttendanceSubject>; unmatched: AttendanceSubject[] }`, `currentSemester(courses: Course[], byCourse: Map<string, AttendanceSubject>, fallback = 8): string[]`
  - `core/src/logic.ts` re-exports `types`, `errors`, `attendance`, `dates`, `needs-you`, `match`.

Calendar facts used in tests: 28 September 2026 is a Monday.

- [ ] **Step 1: Write the failing tests**

```ts
// core/test/attendance.test.ts
import { describe, expect, test } from "bun:test"
import { attendanceMath } from "../src/attendance"

describe("attendanceMath", () => {
  test("above the threshold: how many more can be missed", () => {
    expect(attendanceMath(44, 50)).toEqual({ percentage: 88, status: "ok", canMiss: 8, mustAttend: 0 })
    expect(attendanceMath(39, 48)).toMatchObject({ status: "ok", canMiss: 4 })
  })
  test("exactly at the threshold can miss none", () => {
    expect(attendanceMath(30, 40)).toMatchObject({ status: "ok", canMiss: 0, mustAttend: 0 })
  })
  test("below: how many in a row to attend", () => {
    expect(attendanceMath(33, 46)).toMatchObject({ status: "warn", canMiss: 0, mustAttend: 6 })
    expect(attendanceMath(19, 41)).toMatchObject({ status: "low", mustAttend: 47 })
  })
  test("no classes held yet is not an error", () => {
    expect(attendanceMath(0, 0)).toEqual({ percentage: null, status: "ok", canMiss: 0, mustAttend: 0 })
  })
  test("custom threshold", () => {
    expect(attendanceMath(16, 20, 0.8)).toMatchObject({ status: "ok", canMiss: 0 })
    expect(attendanceMath(15, 20, 0.8)).toMatchObject({ status: "warn", mustAttend: 5 })
  })
})
```

```ts
// core/test/dates.test.ts
import { describe, expect, test } from "bun:test"
import { calendarDayDiff, clockTime, parseMoodleDate, relativeDue, shortDate } from "../src/dates"

const now = new Date(2026, 8, 29, 10, 0) // Tue 29 Sep 2026, 10:00

describe("parseMoodleDate", () => {
  test("full Moodle format", () => {
    expect(parseMoodleDate("Wednesday, 30 September 2026, 11:59 PM")).toEqual(new Date(2026, 8, 30, 23, 59))
    expect(parseMoodleDate("Monday, 5 October 2026, 12:05 AM")).toEqual(new Date(2026, 9, 5, 0, 5))
  })
  test("date without a time means end of day", () => {
    expect(parseMoodleDate("12 Sep 2026")).toEqual(new Date(2026, 8, 12, 23, 59))
  })
  test("unparseable input", () => {
    expect(parseMoodleDate("not a date")).toBeNull()
    expect(parseMoodleDate(null)).toBeNull()
  })
})

describe("formatting", () => {
  test("calendarDayDiff counts calendar days, not 24h blocks", () => {
    expect(calendarDayDiff(new Date(2026, 8, 30, 1), new Date(2026, 8, 29, 23))).toBe(1)
  })
  test("shortDate and clockTime", () => {
    expect(shortDate(new Date(2026, 9, 12))).toBe("Mon 12 Oct")
    expect(clockTime(new Date(2026, 8, 30, 9, 5))).toBe("09:05")
  })
  test("relativeDue", () => {
    expect(relativeDue(new Date(2026, 8, 29, 23, 59), now)).toBe("due today")
    expect(relativeDue(new Date(2026, 8, 30, 23, 59), now)).toBe("due tomorrow")
    expect(relativeDue(new Date(2026, 9, 2, 12, 0), now)).toBe("due in 3 days")
    expect(relativeDue(new Date(2026, 9, 12, 23, 59), now)).toBe("due Mon 12 Oct")
    expect(relativeDue(new Date(2026, 8, 29, 8, 0), now)).toBe("was due today")
    expect(relativeDue(new Date(2026, 8, 27, 23, 59), now)).toBe("overdue by 2 days")
  })
})
```

```ts
// core/test/needs-you.test.ts
import { expect, test } from "bun:test"
import { needsYou } from "../src/needs-you"
import type { Assignment } from "../src/types"

const now = new Date(2026, 8, 29, 10, 0)
const asg = (name: string, due: Date | null, submitted: boolean): Assignment => ({
  name, url: `https://x/${name}`, dueText: null, due, submissionStatus: null, gradingStatus: null,
  grade: null, timeRemaining: null, submitted,
})

test("deadlines first (soonest first), then attendance (lowest first)", () => {
  const items = needsYou(
    [
      { courseId: "812", courseName: "Data Structures", attendance: { present: 44, total: 50 },
        assignments: [asg("Assignment 3: Trees", new Date(2026, 8, 30, 23, 59), false), asg("Assignment 2", new Date(2026, 8, 30), true)] },
      { courseId: "815", courseName: "Computer Networks", attendance: { present: 33, total: 46 },
        assignments: [asg("Lab 9", new Date(2026, 9, 12, 23, 59), false)] },
      { courseId: "811", courseName: "Engineering Maths", attendance: { present: 19, total: 41 }, assignments: [] },
      { courseId: "700", courseName: "No record", attendance: null, assignments: [asg("No due date", null, false)] },
    ],
    now,
  )
  expect(items).toEqual([
    { kind: "deadline", courseId: "812", title: "Assignment 3: Trees", detail: "due tomorrow, not submitted", severity: "warn" },
    { kind: "attendance", courseId: "811", title: "Engineering Maths 46%", detail: "attend the next 47 to reach 75%", severity: "low" },
    { kind: "attendance", courseId: "815", title: "Computer Networks 72%", detail: "attend the next 6 to reach 75%", severity: "warn" },
  ])
})

test("due within a day (or overdue) is low severity", () => {
  const items = needsYou(
    [{ courseId: "1", courseName: "C", attendance: null,
       assignments: [asg("Today", new Date(2026, 8, 29, 23, 59), false), asg("Late", new Date(2026, 8, 27, 12, 0), false)] }],
    now,
  )
  expect(items.map((i) => [i.title, i.detail, i.severity])).toEqual([
    ["Late", "overdue by 2 days, not submitted", "low"],
    ["Today", "due today, not submitted", "low"],
  ])
})
```

```ts
// core/test/match.test.ts
import { describe, expect, test } from "bun:test"
import { currentSemester, matchAttendance, normaliseName } from "../src/match"
import type { AttendanceSubject, Course } from "../src/types"

const course = (id: string, name: string): Course => ({ id, name, url: `https://x/course/view.php?id=${id}` })
const subject = (s: string): AttendanceSubject => ({ subject: s, total: 10, present: 8, absent: 2, percentage: 80 })

// Newest first, as parseCourses returns them.
const courses = [
  course("815", "Computer Networks"),
  course("812", "Data Structures and Algorithms"),
  course("811", "Engineering Maths III"),
  course("640", "Network Security"),
  course("530", "Data Structures Lab"),
]

describe("normaliseName", () => {
  test("drops course codes, punctuation and filler words", () => {
    expect(normaliseName("CSC301 - Data Structures & Algorithms")).toBe("data structures algorithms")
    expect(normaliseName("Theory of Computation (Elective)")).toBe("theory computation")
  })
})

describe("matchAttendance", () => {
  test("exact, then prefix (newest course wins), unmatched kept", () => {
    const r = matchAttendance(courses, [subject("Data Structures"), subject("Computer Networks"), subject("Engineering Maths"), subject("Yoga")])
    expect(Object.fromEntries([...r.byCourse].map(([id, s]) => [id, s.subject]))).toEqual({
      "812": "Data Structures", "815": "Computer Networks", "811": "Engineering Maths",
    })
    expect(r.unmatched.map((s) => s.subject)).toEqual(["Yoga"])
  })
  test("token overlap for reordered names", () => {
    const r = matchAttendance([course("9", "Computation Theory")], [subject("Theory of Computation")])
    expect(r.byCourse.get("9")?.subject).toBe("Theory of Computation")
  })
  test("each course is used once", () => {
    const r = matchAttendance([course("1", "Maths")], [subject("Maths"), subject("Maths")])
    expect(r.byCourse.size).toBe(1)
    expect(r.unmatched).toHaveLength(1)
  })
})

describe("currentSemester", () => {
  test("courses with attendance, in course order", () => {
    const r = matchAttendance(courses, [subject("Engineering Maths"), subject("Computer Networks")])
    expect(currentSemester(courses, r.byCourse)).toEqual(["815", "811"])
  })
  test("falls back to the newest N when nothing matched", () => {
    expect(currentSemester(courses, new Map(), 2)).toEqual(["815", "812"])
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `bun test --cwd core attendance dates needs-you match`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `core/src/attendance.ts`**

```ts
export type AttendanceStatus = "ok" | "warn" | "low"

export interface AttendanceMath {
  /** One decimal place, e.g. 71.7; null when no classes have been held. */
  percentage: number | null
  status: AttendanceStatus
  /** Classes that can still be missed while staying at or above the threshold. */
  canMiss: number
  /** Consecutive classes to attend to get back to the threshold. */
  mustAttend: number
}

const EPS = 1e-9

export function attendanceMath(present: number, total: number, threshold = 0.75): AttendanceMath {
  if (total <= 0) return { percentage: null, status: "ok", canMiss: 0, mustAttend: 0 }
  const ratio = present / total
  const percentage = Math.round(ratio * 1000) / 10
  if (ratio + EPS >= threshold) {
    return { percentage, status: "ok", canMiss: Math.max(0, Math.floor(present / threshold - total + EPS)), mustAttend: 0 }
  }
  return {
    percentage,
    status: ratio >= 0.5 ? "warn" : "low",
    canMiss: 0,
    mustAttend: Math.ceil((threshold * total - present) / (1 - threshold) - EPS),
  }
}
```

- [ ] **Step 4: Implement `core/src/dates.ts`**

```ts
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DATE_RE = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?)?/

/** Parses Moodle dates like "Wednesday, 30 September 2026, 11:59 PM" in local time. */
export function parseMoodleDate(text: string | null | undefined): Date | null {
  if (!text) return null
  const m = DATE_RE.exec(text)
  if (!m) return null
  const month = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase())
  if (month < 0) return null
  let hour = m[4] ? Number(m[4]) : 23
  const minute = m[5] ? Number(m[5]) : 59
  const half = m[6]?.toUpperCase()
  if (half === "PM" && hour < 12) hour += 12
  if (half === "AM" && hour === 12) hour = 0
  return new Date(Number(m[3]), month, Number(m[1]), hour, minute)
}

/** Whole calendar days from `from` to `target` (positive = future). */
export function calendarDayDiff(target: Date, from: Date): number {
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((a - b) / 86_400_000)
}

export function shortDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

export function clockTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function relativeDue(due: Date, now: Date): string {
  const days = calendarDayDiff(due, now)
  if (due.getTime() < now.getTime()) {
    if (days === 0) return "was due today"
    const late = -days
    return `overdue by ${late} day${late === 1 ? "" : "s"}`
  }
  if (days === 0) return "due today"
  if (days === 1) return "due tomorrow"
  if (days < 7) return `due in ${days} days`
  return `due ${shortDate(due)}`
}
```

- [ ] **Step 5: Implement `core/src/needs-you.ts`**

```ts
import { attendanceMath } from "./attendance"
import { relativeDue } from "./dates"
import type { Assignment } from "./types"

export interface NeedsYouInput {
  courseId: string
  courseName: string
  attendance: { present: number; total: number } | null
  assignments: Assignment[]
}

export interface NeedsYouItem {
  kind: "attendance" | "deadline"
  courseId: string
  title: string
  detail: string
  severity: "warn" | "low"
}

const DAY = 86_400_000

export function needsYou(inputs: NeedsYouInput[], now: Date, threshold = 0.75, windowDays = 7): NeedsYouItem[] {
  const deadlines: Array<{ at: number; item: NeedsYouItem }> = []
  const attendance: Array<{ pct: number; item: NeedsYouItem }> = []
  const t = now.getTime()

  for (const c of inputs) {
    for (const a of c.assignments) {
      if (a.submitted || !a.due) continue
      const at = a.due.getTime()
      if (at > t + windowDays * DAY || at < t - windowDays * DAY) continue
      deadlines.push({
        at,
        item: {
          kind: "deadline",
          courseId: c.courseId,
          title: a.name,
          detail: `${relativeDue(a.due, now)}, not submitted`,
          severity: at - t <= DAY ? "low" : "warn",
        },
      })
    }
    if (c.attendance && c.attendance.total > 0) {
      const m = attendanceMath(c.attendance.present, c.attendance.total, threshold)
      if (m.status !== "ok" && m.percentage !== null) {
        attendance.push({
          pct: m.percentage,
          item: {
            kind: "attendance",
            courseId: c.courseId,
            title: `${c.courseName} ${Math.round(m.percentage)}%`,
            detail: `attend the next ${m.mustAttend} to reach ${Math.round(threshold * 100)}%`,
            severity: m.status === "low" ? "low" : "warn",
          },
        })
      }
    }
  }

  deadlines.sort((a, b) => a.at - b.at)
  attendance.sort((a, b) => a.pct - b.pct)
  return [...deadlines.map((d) => d.item), ...attendance.map((a) => a.item)]
}
```

- [ ] **Step 6: Implement `core/src/match.ts`**

```ts
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
```

- [ ] **Step 7: `core/src/logic.ts`**

```ts
export * from "./types"
export * from "./errors"
export * from "./attendance"
export * from "./dates"
export * from "./needs-you"
export * from "./match"
```

- [ ] **Step 8: Run the tests**

Run: `bun test --cwd core`
Expected: all pass (html + the four new files).
