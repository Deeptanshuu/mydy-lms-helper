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
