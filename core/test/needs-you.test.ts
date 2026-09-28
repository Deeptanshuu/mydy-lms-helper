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
