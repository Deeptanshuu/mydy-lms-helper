import type { Assignment, GradeItem } from "@mydy/core/logic"
import { createAppStore, type AppStore } from "./state"

/** Fixed "now" for demo data: Tue 29 Sep 2026, 10:00. */
export const DEMO_NOW = new Date(2026, 8, 29, 10, 0)

const url = (path: string) => `https://mydy.dypatil.edu/rait/${path}`
const course = (id: string, name: string) => ({ id, name, url: url(`course/view.php?id=${id}`) })
const assignment = (name: string, due: Date, submitted: boolean, grade: string | null): Assignment => ({
  name, url: url(`mod/assign/view.php?id=${name.length}`), dueText: null, due, submitted, grade,
  submissionStatus: submitted ? "Submitted for grading" : "No attempt", gradingStatus: grade ? "Graded" : "Not graded", timeRemaining: null,
})
const item = (name: string, grade: string, range: string): GradeItem => ({ name, grade, range, percentage: null, feedback: null })

/** Full text of the demo announcements, keyed by title. */
export const DEMO_POSTS: Record<string, string> = {
  "Mid-sem syllabus uploaded": "Units 1 to 3 are in scope for the mid-semester exam.\n\nThe question bank is in Files, under Unit 3.",
  "Lab moved to Thursday this week": "This week's lab moves to Thursday, 2 to 4 pm, because of the department seminar.",
  "Assignment 3 deadline extended": "Assignment 3 is now due on Wednesday 30 September at 11:59 pm.",
  "Timetable for the mid-semester exams": "The mid-semester exam timetable is on the notice board and in the exam cell's folder.",
}

/** Realistic sample data for tests, the README screenshots and the website demo. */
export function demoStore(): AppStore {
  const store = createAppStore()
  const { actions } = store
  actions.applyCourses([
    course("820", "Software Engineering"),
    course("815", "Computer Networks"),
    course("812", "Data Structures and Algorithms"),
    course("811", "Engineering Maths III"),
    course("640", "Network Security"),
    course("530", "Data Structures Lab"),
  ])
  actions.applyAttendance({
    batch: "CSE-2023-A",
    semester: "Semester 5",
    subjects: [
      { subject: "Software Engineering", total: 43, present: 40, absent: 3, percentage: 93.02 },
      { subject: "Computer Networks", total: 46, present: 33, absent: 13, percentage: 71.74 },
      { subject: "Data Structures", total: 50, present: 44, absent: 6, percentage: 88 },
      { subject: "Engineering Maths", total: 41, present: 19, absent: 22, percentage: 46.34 },
      { subject: "Yoga", total: 12, present: 12, absent: 0, percentage: 100 },
    ],
  })
  actions.setCourseData("812", "content", [
    { number: 1, name: "Unit 1: Arrays and Linked Lists", activities: [
      { name: "Lecture 1 - Arrays", type: "resource", url: url("mod/resource/view.php?id=9101") },
      { name: "Linked Lists", type: "presentation", url: url("mod/presentation/view.php?id=9103") },
      { name: "Assignment 3: Trees", type: "assign", url: url("mod/assign/view.php?id=9201") },
    ] },
    { number: 2, name: "Unit 2: Stacks and Queues", activities: [
      { name: "Stack applications", type: "flexpaper", url: url("mod/flexpaper/view.php?id=9104") },
      { name: "Queue lab manual.docx", type: "resource", url: url("mod/resource/view.php?id=9105") },
    ] },
  ])
  actions.setCourseData("812", "assignments", [
    assignment("Assignment 3: Trees", new Date(2026, 8, 30, 23, 59), false, null),
    assignment("Lab 5: Hashing", new Date(2026, 9, 6, 23, 59), false, null),
    assignment("Assignment 2: Stacks", new Date(2026, 8, 12, 23, 59), true, "9.00 / 10.00"),
    assignment("Assignment 1: Arrays", new Date(2026, 7, 29, 23, 59), true, null),
  ])
  actions.setCourseData("812", "grades", {
    courseName: "Data Structures and Algorithms",
    items: [
      item("Assignment 1: Arrays", "10.00", "0–10"),
      item("Assignment 2: Stacks", "9.00", "0–10"),
      item("Unit test 1", "14.00", "0–25"),
      item("Mid-semester exam", "18.00", "0–25"),
      item("Assignment 3: Trees", "-", "0–10"),
    ],
    total: item("Course total", "51.00", "0–70"),
  })
  actions.setCourseData("812", "announcements", [
    { title: "Mid-sem syllabus uploaded", url: url("mod/forum/discuss.php?d=501"), author: "Prof. R. Sharma", dateText: "Mon, 28 Sep 2026" },
    { title: "Lab moved to Thursday this week", url: url("mod/forum/discuss.php?d=498"), author: "Prof. R. Sharma", dateText: "Sun, 27 Sep 2026" },
    { title: "Assignment 3 deadline extended", url: url("mod/forum/discuss.php?d=490"), author: "Prof. R. Sharma", dateText: "Tue, 22 Sep 2026" },
  ])
  const files = (id: string, unit: string, names: Array<[string, string]>) => [
    { number: 1, name: unit, activities: names.map(([name, type], i) => ({ name, type, url: url(`mod/${type}/view.php?id=${id}${i}`) })) },
  ]
  actions.setCourseData("820", "content", files("820", "Unit 1: Software Process Models", [["Waterfall and Agile", "presentation"], ["SRS template.docx", "resource"]]))
  actions.setCourseData("815", "content", files("815", "Unit 1: The OSI Model", [["OSI layers", "flexpaper"], ["Subnetting practice sheet", "resource"]]))
  actions.setCourseData("811", "content", files("811", "Unit 1: Laplace Transforms", [["Laplace transforms notes", "flexpaper"], ["Tutorial 1", "resource"]]))
  actions.setCourseData("820", "assignments", [assignment("Case study: Library system", new Date(2026, 9, 9, 23, 59), false, null)])
  actions.setCourseData("815", "assignments", [assignment("Lab 9: Subnetting", new Date(2026, 9, 1, 23, 59), false, null)])
  actions.setCourseData("811", "assignments", [])
  for (const id of ["820", "815", "811"]) {
    actions.setCourseData(id, "grades", { courseName: store.state.courses[id]!.course.name, items: [item("Unit test 1", id === "811" ? "9.00" : "21.00", "0–25")], total: null })
    actions.setCourseData(id, "announcements", [
      { title: "Timetable for the mid-semester exams", url: url(`mod/forum/discuss.php?d=${id}1`), author: "Exam cell", dateText: "Fri, 25 Sep 2026" },
    ])
  }
  actions.setUser("student@dypatil.edu")
  actions.setSync({ status: "idle", message: null, lastSynced: DEMO_NOW.getTime() - 2 * 60_000 })
  actions.setPhase("main")
  actions.select("812")
  return store
}
