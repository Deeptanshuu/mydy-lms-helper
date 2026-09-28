import { describe, expect, test } from "bun:test"
import { parseAttendance } from "../src/parse/attendance"
import { parseAssignmentLinks, parseCourseContent, parseForumLink } from "../src/parse/course"
import { parseCourses } from "../src/parse/courses"
import { hasLoginError, looksSignedIn, parseLoginForm } from "../src/parse/login"
import { parse } from "./dom"
import { ATTENDANCE_HTML } from "./fixtures/attendance"
import { DASHBOARD_HTML, HOME_HTML, LOGIN_FAILED_HTML, LOGIN_FORM_HTML } from "./fixtures/auth"
import { COURSE_HTML, COURSE_NO_SECTIONS_HTML } from "./fixtures/course"

const BASE = "https://mydy.dypatil.edu"
const COURSE_URL = `${BASE}/rait/course/view.php?id=812`

describe("login", () => {
  test("reads the sign-in form's hidden fields and resolves a relative action", () => {
    const url = `${BASE}/rait/login/index.php?uname=student%40dypatil.edu&wantsurl=`
    expect(parseLoginForm(parse(LOGIN_FORM_HTML), url)).toEqual({
      action: `${BASE}/rait/login/index.php`,
      fields: { logintoken: "tok123", username: "student@dypatil.edu" },
    })
  })
  test("no password field means no sign-in form", () => {
    expect(parseLoginForm(parse(DASHBOARD_HTML), `${BASE}/rait/my/`)).toBeNull()
  })
  test("error and success detection", () => {
    expect(hasLoginError(LOGIN_FAILED_HTML)).toBe(true)
    expect(hasLoginError(LOGIN_FORM_HTML)).toBe(false)
    expect(looksSignedIn(DASHBOARD_HTML, `${BASE}/rait/my/`)).toBe(true)
    expect(looksSignedIn(HOME_HTML, `${BASE}/`)).toBe(false)
  })
})

describe("parseCourses", () => {
  test("unique courses, newest first, junk links dropped", () => {
    expect(parseCourses(parse(DASHBOARD_HTML), `${BASE}/rait/my/`)).toEqual([
      { id: "815", name: "Computer Networks", url: `${BASE}/rait/course/view.php?id=815` },
      { id: "812", name: "Data Structures and Algorithms", url: `${BASE}/rait/course/view.php?id=812` },
      { id: "811", name: "Engineering Maths III", url: `${BASE}/rait/course/view.php?id=811` },
      { id: "640", name: "Network Security", url: `${BASE}/rait/course/view.php?id=640` },
    ])
  })
})

describe("parseAttendance", () => {
  test("batch, semester and numeric rows only", () => {
    const a = parseAttendance(parse(ATTENDANCE_HTML))
    expect(a.batch).toBe("CSE-2023-A")
    expect(a.semester).toBe("Semester 5")
    expect(a.subjects).toEqual([
      { subject: "Data Structures", total: 50, present: 44, absent: 6, percentage: 88 },
      { subject: "Computer Networks", total: 46, present: 33, absent: 13, percentage: 71.74 },
      { subject: "Engineering Maths", total: 41, present: 19, absent: 22, percentage: 46.34 },
      { subject: "Yoga", total: 12, present: 12, absent: 0, percentage: 100 },
    ])
  })
})

describe("course page", () => {
  test("sections with typed activities", () => {
    const sections = parseCourseContent(parse(COURSE_HTML), COURSE_URL)
    expect(sections.map((s) => [s.number, s.name, s.activities.length])).toEqual([
      [0, "General", 1],
      [1, "Unit 1: Arrays and Linked Lists", 5],
    ])
    expect(sections[1]!.activities[0]).toEqual({
      name: "Lecture 1 - Arrays",
      type: "resource",
      url: `${BASE}/rait/mod/resource/view.php?id=9101`,
    })
    expect(sections[1]!.activities.map((a) => a.type)).toEqual(["resource", "flexpaper", "presentation", "assign", "assign"])
  })
  test("pages without sections become one 'All activities' section", () => {
    const sections = parseCourseContent(parse(COURSE_NO_SECTIONS_HTML), `${BASE}/rait/course/view.php?id=1`)
    expect(sections).toHaveLength(1)
    expect(sections[0]!.name).toBe("All activities")
    expect(sections[0]!.activities.map((a) => a.name)).toEqual(["Syllabus", "Class forum"])
  })
  test("assignment links", () => {
    expect(parseAssignmentLinks(parse(COURSE_HTML), COURSE_URL)).toEqual([
      { name: "Assignment 3: Trees", url: `${BASE}/rait/mod/assign/view.php?id=9201` },
      { name: "Assignment 2: Stacks", url: `${BASE}/rait/mod/assign/view.php?id=9202` },
    ])
  })
  test("announcements forum: named one first, else the first forum", () => {
    expect(parseForumLink(parse(COURSE_HTML), COURSE_URL)).toBe(`${BASE}/rait/mod/forum/view.php?id=9001`)
    expect(parseForumLink(parse(COURSE_NO_SECTIONS_HTML), COURSE_URL)).toBe(`${BASE}/rait/mod/forum/view.php?id=2`)
    expect(parseForumLink(parse("<html><body></body></html>"), COURSE_URL)).toBeNull()
  })
})

describe("review fixes", () => {
  test("a malformed link is skipped instead of throwing", () => {
    const html = `<html><body><ul><li id="section-1" class="section"><h3 class="sectionname">U1</h3><ul>
      <li class="activity label modtype_label"><p>Ref: <a href="http:// www.geeksforgeeks.org/arrays">GfG</a></p></li>
      <li class="activity resource modtype_resource"><a href="/rait/mod/resource/view.php?id=1"><span class="instancename">Notes</span></a></li>
    </ul></li></ul></body></html>`
    const sections = parseCourseContent(parse(html), COURSE_URL)
    expect(sections[0]!.activities.map((a) => a.name)).toEqual(["Notes"])
  })
  test("course names lose terminal control characters", () => {
    const courses = parseCourses(parse(`<html><body><a href="/rait/course/view.php?id=5">Maths&#27;]0;owned&#7;&#27;[2J</a></body></html>`), `${BASE}/rait/my/`)
    expect(courses[0]!.name).toBe("Maths]0;owned[2J")
  })
  test("only the first attendance table is read", () => {
    const a = parseAttendance(parse(ATTENDANCE_HTML + `<table class="generaltable"><tr><td>September</td><td>20</td><td>18</td><td>2</td><td>90</td></tr></table>`))
    expect(a.subjects.map((s) => s.subject)).not.toContain("September")
  })
})
