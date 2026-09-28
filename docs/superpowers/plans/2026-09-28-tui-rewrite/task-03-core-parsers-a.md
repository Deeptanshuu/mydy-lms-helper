### Task 3: Core parsers A: login form, dashboard courses, attendance, course page

Read the global rules in `docs/superpowers/plans/2026-09-28-tui-rewrite.md` first. Task 1 must be done. Runs in parallel with Tasks 2, 4, 5, 7, 12: touch only the files listed here.

These are ports of the Python logic in `tui/client.py` (`login`, `list_courses`, `get_attendance`, `get_course_content`, `get_assignments` link collection, `get_announcements` forum lookup). The fixtures are synthetic pages that reproduce the structure those selectors expect; they contain no real personal data. Task 6's fake server serves the same fixtures, so keep the exported names exactly.

**Files:**
- Create: `core/src/parse/login.ts`, `core/src/parse/courses.ts`, `core/src/parse/attendance.ts`, `core/src/parse/course.ts`
- Create fixtures: `core/test/fixtures/auth.ts`, `core/test/fixtures/attendance.ts`, `core/test/fixtures/course.ts`
- Test: `core/test/parse-a.test.ts`

**Interfaces:**
- Consumes: `text`, `abs`, `activityName` from `core/src/html.ts`; types from `core/src/types.ts`; `parse(html)` from `core/test/dom.ts`.
- Produces:
  - `parseLoginForm(doc: Document, pageUrl: string): { action: string; fields: Record<string, string> } | null`
  - `hasLoginError(html: string): boolean`, `looksSignedIn(html: string, url: string): boolean`
  - `parseCourses(doc: Document, pageUrl: string): Course[]` (newest id first)
  - `parseAttendance(doc: Document): Attendance`
  - `parseCourseContent(doc: Document, pageUrl: string): Section[]`
  - `parseAssignmentLinks(doc: Document, pageUrl: string): Array<{ name: string; url: string }>`
  - `parseForumLink(doc: Document, pageUrl: string): string | null`
  - Fixture exports: `HOME_HTML`, `LOGIN_FORM_HTML`, `LOGIN_FAILED_HTML`, `DASHBOARD_HTML`, `ATTENDANCE_HTML`, `COURSE_HTML`, `COURSE_NO_SECTIONS_HTML`

- [ ] **Step 1: Fixtures**

```ts
// core/test/fixtures/auth.ts
export const HOME_HTML = `<!doctype html><html><head><title>MyDy</title></head><body>
<form action="/index.php" method="post">
  <input type="text" name="username">
  <input type="hidden" name="wantsurl" value="">
  <button type="submit" name="next" value="Next">Next</button>
</form>
</body></html>`

export const LOGIN_FORM_HTML = `<!doctype html><html><head><title>MyDy: Log in to the site</title></head><body>
<form class="search" action="/rait/course/search.php"><input type="hidden" name="sesskey" value="zzz"></form>
<form id="login" action="index.php" method="post">
  <input type="hidden" name="logintoken" value="tok123">
  <input type="hidden" name="username" value="student@dypatil.edu">
  <input type="password" name="password" id="password" value="">
  <button type="submit" id="loginbtn">Log in</button>
</form>
</body></html>`

export const LOGIN_FAILED_HTML = LOGIN_FORM_HTML.replace(
  '<form id="login"',
  '<div class="alert alert-danger" role="alert">Invalid login, please try again</div>\n<form id="login"',
)

export const DASHBOARD_HTML = `<!doctype html><html><head><title>Dashboard</title></head><body>
<a href="/rait/login/logout.php?sesskey=zzz">Log out</a>
<div class="block block_navigation"><ul>
  <li><a href="https://mydy.dypatil.edu/rait/course/view.php?id=812">Data Structures and Algorithms</a></li>
  <li><a href="/rait/course/view.php?id=815">Computer Networks</a></li>
  <li><a href="/rait/course/view.php?id=811">Engineering Maths III</a></li>
  <li><a href="/rait/course/view.php?id=640">Network Security</a></li>
  <li><a href="/rait/course/view.php?id=815">Computer Networks</a></li>
  <li><a href="/rait/course/view.php?id=9">OK</a></li>
</ul></div>
</body></html>`
```

```ts
// core/test/fixtures/attendance.ts
export const ATTENDANCE_HTML = `<div class="academic-status">
  <div style="float:left;">CSE-2023-A</div>
  <div style="float:right;">Semester 5</div>
</div>
<table class="generaltable">
  <tr><th>Subject</th><th>Total</th><th>Present</th><th>Absent</th><th>Percentage</th></tr>
  <tr><td>Data Structures</td><td>50</td><td>44</td><td>6</td><td>88.00</td></tr>
  <tr><td>Computer Networks</td><td>46</td><td>33</td><td>13</td><td>71.74</td></tr>
  <tr><td>Engineering Maths</td><td>41</td><td>19</td><td>22</td><td>46.34</td></tr>
  <tr><td>Library Hour</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
  <tr><td>Yoga</td><td>12</td><td>12</td><td>0</td><td>100</td></tr>
</table>`
```

```ts
// core/test/fixtures/course.ts
export const COURSE_HTML = `<!doctype html><html><head><title>Course: Data Structures and Algorithms</title></head><body>
<div id="region-main"><div class="course-content"><ul class="topics">
  <li id="section-0" class="section main"><h3 class="sectionname">General</h3><ul class="section img-text">
    <li class="activity forum modtype_forum"><a href="/rait/mod/forum/view.php?id=9001"><span class="instancename">Announcements<span class="accesshide"> Forum</span></span></a></li>
  </ul></li>
  <li id="section-1" class="section main"><h3 class="sectionname">Unit 1: Arrays and Linked Lists</h3><ul class="section img-text">
    <li class="activity resource modtype_resource"><a href="/rait/mod/resource/view.php?id=9101"><span class="instancename">Lecture 1 - Arrays<span class="accesshide"> File</span></span></a></li>
    <li class="activity flexpaper modtype_flexpaper"><a href="/rait/mod/flexpaper/view.php?id=9102"><span class="instancename">Linked Lists notes</span></a></li>
    <li class="activity presentation modtype_presentation"><a href="/rait/mod/presentation/view.php?id=9103"><span class="instancename">Trees slides</span></a></li>
    <li class="activity assign modtype_assign"><a href="/rait/mod/assign/view.php?id=9201"><span class="instancename">Assignment 3: Trees<span class="accesshide"> Assignment</span></span></a></li>
    <li class="activity assign modtype_assign"><a href="/rait/mod/assign/view.php?id=9202"><span class="instancename">Assignment 2: Stacks</span></a></li>
  </ul></li>
</ul></div></div>
</body></html>`

export const COURSE_NO_SECTIONS_HTML = `<!doctype html><html><head><title>Course: Web Technologies</title></head><body>
<div id="region-main"><ul>
  <li class="activity resource modtype_resource"><a href="/rait/mod/resource/view.php?id=1"><span class="instancename">Syllabus</span></a></li>
  <li class="activity forum modtype_forum"><a href="/rait/mod/forum/view.php?id=2"><span class="instancename">Class forum</span></a></li>
</ul></div>
</body></html>`
```

- [ ] **Step 2: Write the failing test `core/test/parse-a.test.ts`**

```ts
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
```

- [ ] **Step 2b: Run to see it fail**

Run: `bun test --cwd core parse-a`
Expected: FAIL, modules not found.

- [ ] **Step 3: `core/src/parse/login.ts`**

```ts
import { abs } from "../html"

export interface LoginForm {
  action: string
  fields: Record<string, string>
}

/** The Moodle sign-in form: its hidden fields and absolute action URL. Null when the page has no password field. */
export function parseLoginForm(doc: Document, pageUrl: string): LoginForm | null {
  const password = doc.querySelector('input[name="password"]')
  if (!password) return null
  const form = password.closest("form") ?? doc.querySelector("form")
  const scope: ParentNode = form ?? doc
  const fields: Record<string, string> = {}
  scope.querySelectorAll('input[type="hidden"]').forEach((input) => {
    const name = input.getAttribute("name")
    if (name) fields[name] = input.getAttribute("value") ?? ""
  })
  const action = form?.getAttribute("action")
  return { action: abs(action || "/rait/login/index.php", pageUrl), fields }
}

export function hasLoginError(html: string): boolean {
  return /invalid login|login failed|incorrect/i.test(html)
}

export function looksSignedIn(html: string, url: string): boolean {
  return /dashboard|logout|profile/i.test(html) || (url.includes("/rait") && !url.includes("login"))
}
```

- [ ] **Step 4: `core/src/parse/courses.ts`**

```ts
import { abs, text } from "../html"
import type { Course } from "../types"

const COURSE_LINK = 'a[href*="/course/view.php?id="]'

/** Courses linked from the dashboard, unique by id, newest (highest id) first. */
export function parseCourses(doc: Document, pageUrl: string): Course[] {
  const seen = new Set<string>()
  const out: Course[] = []
  const collect = (root: ParentNode) => {
    root.querySelectorAll(COURSE_LINK).forEach((a) => {
      const href = a.getAttribute("href") ?? ""
      const id = /[?&]id=(\d+)/.exec(href)?.[1]
      const name = text(a)
      if (!id || seen.has(id) || name.length <= 2) return
      seen.add(id)
      out.push({ id, name, url: abs(href, pageUrl) })
    })
  }

  const previous = Array.from(doc.querySelectorAll("div[id]")).find((d) => /stu_previousclasses/.test(d.getAttribute("id") ?? ""))
  if (previous) collect(previous)
  doc.querySelectorAll("div[class]").forEach((d) => {
    if (/block.*(navigation|tree|university)/.test(d.getAttribute("class") ?? "")) collect(d)
  })
  if (!out.length) collect(doc)
  return out.sort((a, b) => Number(b.id) - Number(a.id))
}
```

- [ ] **Step 5: `core/src/parse/attendance.ts`**

```ts
import { text } from "../html"
import type { Attendance, AttendanceSubject } from "../types"

const whole = (s: string): number | null => (/^\d+$/.test(s) ? Number(s) : null)

export function parseAttendance(doc: Document): Attendance {
  let batch: string | null = null
  let semester: string | null = null
  doc.querySelectorAll("div[style]").forEach((d) => {
    if (!/float/.test(d.getAttribute("style") ?? "")) return
    const t = text(d)
    if (/^[A-Z]+-\d+-/.test(t)) batch = t
    else if (t.includes("Semester")) semester = t
  })

  const subjects: AttendanceSubject[] = []
  doc.querySelectorAll("table.generaltable tr").forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td")).map((c) => text(c))
    if (cells.length < 5) return
    const total = whole(cells[1]!)
    const present = whole(cells[2]!)
    if (total === null || present === null) return
    const absent = whole(cells[3]!)
    const pct = Number.parseFloat(cells[4]!)
    subjects.push({
      subject: cells[0]!,
      total,
      present,
      absent: absent ?? total - present,
      percentage: Number.isFinite(pct) ? pct : null,
    })
  })
  return { batch, semester, subjects }
}
```

- [ ] **Step 6: `core/src/parse/course.ts`**

```ts
import { abs, activityName, text } from "../html"
import type { Activity, Section } from "../types"

function activitiesIn(root: ParentNode, pageUrl: string): Activity[] {
  const out: Activity[] = []
  root.querySelectorAll("li.activity").forEach((li) => {
    const link = li.querySelector("a[href]")
    if (!link) return
    const type = /modtype_(\w+)/.exec(li.getAttribute("class") ?? "")?.[1] ?? "unknown"
    out.push({ name: activityName(li), type, url: abs(link.getAttribute("href")!, pageUrl) })
  })
  return out
}

export function parseCourseContent(doc: Document, pageUrl: string): Section[] {
  let elements = Array.from(doc.querySelectorAll("li.section"))
  if (!elements.length) elements = Array.from(doc.querySelectorAll("div.section"))

  const sections = elements.map((sec): Section => {
    const num = /section-(\d+)/.exec(sec.getAttribute("id") ?? "")?.[1]
    const nameEl = sec.querySelector(".sectionname") ?? sec.querySelector("h3, h4")
    return {
      number: num !== undefined ? Number(num) : null,
      name: text(nameEl) || `Section ${num ?? ""}`.trim(),
      activities: activitiesIn(sec, pageUrl),
    }
  })
  if (sections.length) return sections

  const all = activitiesIn(doc, pageUrl)
  return all.length ? [{ number: 0, name: "All activities", activities: all }] : []
}

export function parseAssignmentLinks(doc: Document, pageUrl: string): Array<{ name: string; url: string }> {
  const area: ParentNode = doc.querySelector("div.course-content") ?? doc.querySelector("#region-main") ?? doc
  const out: Array<{ name: string; url: string }> = []
  const seen = new Set<string>()

  area.querySelectorAll('li[class*="modtype_assign"]').forEach((li) => {
    const link = li.querySelector('a[href*="/mod/assign/view.php"]')
    if (!link) return
    const url = abs(link.getAttribute("href")!, pageUrl)
    if (seen.has(url)) return
    seen.add(url)
    out.push({ name: activityName(li), url })
  })
  if (!out.length) {
    area.querySelectorAll('a[href*="/mod/assign/view.php?id="]').forEach((link) => {
      const url = abs(link.getAttribute("href")!, pageUrl)
      if (seen.has(url)) return
      seen.add(url)
      out.push({ name: text(link), url })
    })
  }
  return out
}

/** The announcements forum: a forum activity named "...announcement...", else the first forum link. */
export function parseForumLink(doc: Document, pageUrl: string): string | null {
  for (const li of Array.from(doc.querySelectorAll('li[class*="modtype_forum"]'))) {
    const link = li.querySelector("a[href]")
    if (link && text(link).toLowerCase().includes("announcement")) return abs(link.getAttribute("href")!, pageUrl)
  }
  const first = doc.querySelector('a[href*="/mod/forum/view.php?id="]')
  return first ? abs(first.getAttribute("href")!, pageUrl) : null
}
```

- [ ] **Step 7: Run the tests**

Run: `bun test --cwd core parse-a`
Expected: all pass. If linkedom handles a selector differently from browsers, fix the parser (keep standard DOM APIs only), not the expectation.
