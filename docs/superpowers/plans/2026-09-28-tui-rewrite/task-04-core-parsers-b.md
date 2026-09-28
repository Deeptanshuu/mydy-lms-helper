### Task 4: Core parsers B: assignment page, grades, discussions, activity files

Read the global rules in `docs/superpowers/plans/2026-09-28-tui-rewrite.md` first. Task 1 must be done. Runs in parallel with Tasks 2, 3, 5, 7, 12: touch only the files listed here.

Ports of `tui/client.py`: assignment status table (`get_assignments`), `get_grades`, discussion list and post (`get_announcements`), and the five download strategies in `_try_download_methods`. Fixtures are synthetic; Task 6's fake server serves them, so keep the exported names.

`parseAssignment` uses `parseMoodleDate` from `core/src/dates.ts` (Task 2, same wave). If Task 2 hasn't landed yet when you start, write your tests first; they will pass once `dates.ts` exists. Do not create `dates.ts` yourself.

**Files:**
- Create: `core/src/parse/assignment.ts`, `core/src/parse/grades.ts`, `core/src/parse/forum.ts`, `core/src/parse/files.ts`
- Create fixtures: `core/test/fixtures/assignment.ts`, `core/test/fixtures/grades.ts`, `core/test/fixtures/forum.ts`, `core/test/fixtures/files.ts`
- Test: `core/test/parse-b.test.ts`

**Interfaces:**
- Consumes: `text`, `abs` from `core/src/html.ts`; `UnexpectedPageError` from `core/src/errors.ts`; `parseMoodleDate` from `core/src/dates.ts`; types from `core/src/types.ts`; `parse` from `core/test/dom.ts`.
- Produces:
  - `isSubmitted(status: string | null): boolean`
  - `parseAssignment(doc: Document, pageUrl: string, fallbackName: string): Assignment`
  - `parseGrades(doc: Document): GradeReport` (throws `UnexpectedPageError` on a Moodle error box)
  - `parseDiscussionList(doc: Document, pageUrl: string, limit = 10): AnnouncementSummary[]`
  - `parseDiscussion(doc: Document, summary: AnnouncementSummary): Announcement`
  - `parseActivityFiles(doc: Document, html: string, pageUrl: string): FileRef[]`, `filenameFromUrl(url: string): string`
  - Fixture exports: `ASSIGNMENT_OPEN_HTML`, `ASSIGNMENT_DONE_HTML`, `GRADES_HTML`, `GRADES_ERROR_HTML`, `FORUM_HTML`, `DISCUSSION_HTML`, `resourcePage(origin)`, `flexpaperPage(origin)`, `presentationPage(origin)`, `PDF_BYTES`

- [ ] **Step 1: Fixtures**

```ts
// core/test/fixtures/assignment.ts
export const ASSIGNMENT_OPEN_HTML = `<!doctype html><html><head><title>Assignment</title></head><body>
<div id="region-main"><h2>Assignment 3: Trees</h2>
<table class="generaltable submissionstatustable"><tbody>
  <tr><th class="cell c0">Submission status</th><td class="cell c1">No attempt</td></tr>
  <tr><th>Grading status</th><td>Not graded</td></tr>
  <tr><th>Due date</th><td>Wednesday, 30 September 2026, 11:59 PM</td></tr>
  <tr><th>Time remaining</th><td>1 day 12 hours</td></tr>
</tbody></table></div>
</body></html>`

export const ASSIGNMENT_DONE_HTML = `<!doctype html><html><head><title>Assignment</title></head><body>
<div id="region-main"><h2>Assignment 2: Stacks</h2>
<table class="generaltable submissionstatustable"><tbody>
  <tr><th>Submission status</th><td>Submitted for grading</td></tr>
  <tr><th>Grading status</th><td>Graded</td></tr>
  <tr><th>Due date</th><td>Saturday, 12 September 2026, 11:59 PM</td></tr>
  <tr><th>Grade</th><td>9.00 / 10.00</td></tr>
</tbody></table></div>
</body></html>`
```

```ts
// core/test/fixtures/grades.ts
export const GRADES_HTML = `<!doctype html><html><head><title>Course: Data Structures and Algorithms: View: User report</title></head><body>
<table class="generaltable user-grade">
<thead><tr><th>Grade item</th><th>Calculated weight</th><th>Grade</th><th>Range</th><th>Percentage</th><th>Feedback</th></tr></thead>
<tbody>
  <tr class="category"><td>Data Structures and Algorithms</td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><th>Assignment 1: Arrays</th><td>10 %</td><td>10.00</td><td>0–10</td><td>100.00 %</td><td></td></tr>
  <tr><th>Mid-semester exam</th><td>25 %</td><td>18.00</td><td>0–25</td><td>72.00 %</td><td>Good</td></tr>
  <tr><th>Assignment 3: Trees</th><td>10 %</td><td>-</td><td>0–10</td><td>-</td><td></td></tr>
  <tr><th>Course total</th><td>-</td><td>51.00</td><td>0–70</td><td>72.86 %</td><td></td></tr>
</tbody></table>
</body></html>`

export const GRADES_ERROR_HTML = `<!doctype html><html><head><title>Error</title></head><body>
<div class="box errorbox alert alert-danger">You are not enrolled in this course.</div>
</body></html>`
```

```ts
// core/test/fixtures/forum.ts
export const FORUM_HTML = `<!doctype html><html><head><title>Announcements</title></head><body>
<table class="forumheaderlist">
<thead><tr><th>Discussion</th><th>Started by</th><th>Replies</th><th>Last post</th></tr></thead>
<tbody>
  <tr><td class="topic"><a href="/rait/mod/forum/discuss.php?d=501">Mid-sem syllabus uploaded</a></td><td class="author">Prof. R. Sharma</td><td>0</td><td>Mon, 28 Sep 2026, 10:42 AM</td></tr>
  <tr><td class="topic"><a href="/rait/mod/forum/discuss.php?d=498">Lab moved to Thursday</a></td><td class="author">Prof. R. Sharma</td><td>0</td><td>Sun, 27 Sep 2026, 6:05 PM</td></tr>
</tbody></table>
</body></html>`

export const DISCUSSION_HTML = `<!doctype html><html><head><title>Mid-sem syllabus uploaded</title></head><body>
<div class="forumpost clearfix">
  <div class="author">Prof. R. Sharma</div>
  <time>Monday, 28 September 2026, 10:42 AM</time>
  <div class="posting fullpost">
    <p>Units 1 to 3 are in scope for the mid-semester exam.</p>
    <p>The question bank is in Files, under Unit 3.</p>
  </div>
</div>
</body></html>`
```

```ts
// core/test/fixtures/files.ts
export const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fake test file")

export const resourcePage = (origin: string) => `<!doctype html><html><head><title>Lecture 1 - Arrays</title></head><body>
<img src="${origin}/rait/pluginfile.php/1/theme_dypatil/logo/logo.png">
<a href="${origin}/rait/course/view.php?id=812">Back to course</a>
<div class="resourceworkaround">Click <a href="${origin}/rait/pluginfile.php/77/mod_resource/content/1/Lecture%201%20-%20Arrays.pdf?forcedownload=1">Lecture 1 - Arrays.pdf</a> to open the file.</div>
</body></html>`

export const flexpaperPage = (origin: string) => `<!doctype html><html><head><title>Linked Lists notes</title></head><body>
<a href="${origin}/rait/course/view.php?id=812">Back to course</a>
<div id="documentViewer"></div>
<script>
$('#documentViewer').FlexPaperViewer({ config : {
  PDFFile : '${origin}/rait/pluginfile.php/78/mod_flexpaper/content/0/Linked%20Lists.pdf',
  Scale : 0.6
}});
</script>
</body></html>`

export const presentationPage = (origin: string) => `<!doctype html><html><head><title>Trees slides</title></head><body>
<iframe id="presentationobject" src="${origin}/rait/pluginfile.php/80/mod_presentation/content/0/Trees.pptx"></iframe>
</body></html>`
```

- [ ] **Step 2: Write the failing test `core/test/parse-b.test.ts`**

```ts
import { describe, expect, test } from "bun:test"
import { UnexpectedPageError } from "../src/errors"
import { isSubmitted, parseAssignment } from "../src/parse/assignment"
import { filenameFromUrl, parseActivityFiles } from "../src/parse/files"
import { parseDiscussion, parseDiscussionList } from "../src/parse/forum"
import { parseGrades } from "../src/parse/grades"
import { parse } from "./dom"
import { ASSIGNMENT_DONE_HTML, ASSIGNMENT_OPEN_HTML } from "./fixtures/assignment"
import { flexpaperPage, presentationPage, resourcePage } from "./fixtures/files"
import { DISCUSSION_HTML, FORUM_HTML } from "./fixtures/forum"
import { GRADES_ERROR_HTML, GRADES_HTML } from "./fixtures/grades"

const BASE = "https://mydy.dypatil.edu"

describe("assignments", () => {
  test("open assignment", () => {
    const url = `${BASE}/rait/mod/assign/view.php?id=9201`
    expect(parseAssignment(parse(ASSIGNMENT_OPEN_HTML), url, "fallback")).toEqual({
      name: "Assignment 3: Trees",
      url,
      dueText: "Wednesday, 30 September 2026, 11:59 PM",
      due: new Date(2026, 8, 30, 23, 59),
      submissionStatus: "No attempt",
      gradingStatus: "Not graded",
      grade: null,
      timeRemaining: "1 day 12 hours",
      submitted: false,
    })
  })
  test("submitted and graded assignment", () => {
    const a = parseAssignment(parse(ASSIGNMENT_DONE_HTML), `${BASE}/rait/mod/assign/view.php?id=9202`, "fallback")
    expect(a).toMatchObject({ name: "Assignment 2: Stacks", submitted: true, gradingStatus: "Graded", grade: "9.00 / 10.00" })
    expect(a.due).toEqual(new Date(2026, 8, 12, 23, 59))
  })
  test("page without a heading or table keeps the link name", () => {
    const a = parseAssignment(parse("<html><body></body></html>"), `${BASE}/x`, "Lab 4")
    expect(a).toMatchObject({ name: "Lab 4", due: null, submitted: false, submissionStatus: null })
  })
  test("isSubmitted", () => {
    expect(isSubmitted("Submitted for grading")).toBe(true)
    expect(isSubmitted("No attempt")).toBe(false)
    expect(isSubmitted("Draft (not submitted)")).toBe(false)
    expect(isSubmitted(null)).toBe(false)
  })
})

describe("grades", () => {
  test("items, skipped category rows, pinned total", () => {
    const g = parseGrades(parse(GRADES_HTML))
    expect(g.items.map((i) => [i.name, i.grade, i.range, i.percentage, i.feedback])).toEqual([
      ["Assignment 1: Arrays", "10.00", "0–10", "100.00 %", null],
      ["Mid-semester exam", "18.00", "0–25", "72.00 %", "Good"],
      ["Assignment 3: Trees", "-", "0–10", "-", null],
    ])
    expect(g.total).toEqual({ name: "Course total", grade: "51.00", range: "0–70", percentage: "72.86 %", feedback: null })
  })
  test("Moodle error box becomes an UnexpectedPageError", () => {
    expect(() => parseGrades(parse(GRADES_ERROR_HTML))).toThrow(UnexpectedPageError)
    expect(() => parseGrades(parse(GRADES_ERROR_HTML))).toThrow("You are not enrolled in this course.")
  })
  test("no grade table", () => {
    expect(parseGrades(parse("<html><head><title>Course: X</title></head><body></body></html>"))).toEqual({
      courseName: "X",
      items: [],
      total: null,
    })
  })
})

describe("announcements", () => {
  const forumUrl = `${BASE}/rait/mod/forum/view.php?id=9001`
  test("discussion list", () => {
    expect(parseDiscussionList(parse(FORUM_HTML), forumUrl)).toEqual([
      { title: "Mid-sem syllabus uploaded", url: `${BASE}/rait/mod/forum/discuss.php?d=501`, author: "Prof. R. Sharma", dateText: "Mon, 28 Sep 2026, 10:42 AM" },
      { title: "Lab moved to Thursday", url: `${BASE}/rait/mod/forum/discuss.php?d=498`, author: "Prof. R. Sharma", dateText: "Sun, 27 Sep 2026, 6:05 PM" },
    ])
    expect(parseDiscussionList(parse(FORUM_HTML), forumUrl, 1)).toHaveLength(1)
  })
  test("discussion post keeps paragraph breaks", () => {
    const summary = { title: "Mid-sem syllabus uploaded", url: `${BASE}/rait/mod/forum/discuss.php?d=501`, author: null, dateText: null }
    expect(parseDiscussion(parse(DISCUSSION_HTML), summary)).toEqual({
      ...summary,
      author: "Prof. R. Sharma",
      dateText: "Monday, 28 September 2026, 10:42 AM",
      content: "Units 1 to 3 are in scope for the mid-semester exam.\n\nThe question bank is in Files, under Unit 3.",
    })
  })
})

describe("activity files", () => {
  test("direct pluginfile link, ignoring images and navigation", () => {
    const html = resourcePage(BASE)
    expect(parseActivityFiles(parse(html), html, `${BASE}/rait/mod/resource/view.php?id=9101`)).toEqual([
      { url: `${BASE}/rait/pluginfile.php/77/mod_resource/content/1/Lecture%201%20-%20Arrays.pdf?forcedownload=1`, filename: "Lecture 1 - Arrays.pdf", source: "direct" },
    ])
  })
  test("FlexPaper PDF from the viewer script", () => {
    const html = flexpaperPage(BASE)
    expect(parseActivityFiles(parse(html), html, `${BASE}/rait/mod/flexpaper/view.php?id=9102`)).toEqual([
      { url: `${BASE}/rait/pluginfile.php/78/mod_flexpaper/content/0/Linked%20Lists.pdf`, filename: "Linked Lists.pdf", source: "flexpaper" },
    ])
  })
  test("presentation iframe", () => {
    const html = presentationPage(BASE)
    expect(parseActivityFiles(parse(html), html, `${BASE}/rait/mod/presentation/view.php?id=9103`).map((f) => [f.source, f.filename])).toEqual([
      ["iframe", "Trees.pptx"],
    ])
  })
  test("filenameFromUrl decodes and drops the query", () => {
    expect(filenameFromUrl("https://x/pluginfile.php/1/a/Queue%20lab.docx?forcedownload=1")).toBe("Queue lab.docx")
  })
})
```

- [ ] **Step 2b: Run to see it fail**

Run: `bun test --cwd core parse-b`
Expected: FAIL, modules not found.

- [ ] **Step 3: `core/src/parse/assignment.ts`**

```ts
import { parseMoodleDate } from "../dates"
import { text } from "../html"
import type { Assignment } from "../types"

export function isSubmitted(status: string | null): boolean {
  return !!status && /submitted/i.test(status) && !/not submitted|no attempt|draft/i.test(status)
}

export function parseAssignment(doc: Document, pageUrl: string, fallbackName: string): Assignment {
  const fields = {
    dueText: null as string | null,
    submissionStatus: null as string | null,
    gradingStatus: null as string | null,
    grade: null as string | null,
    timeRemaining: null as string | null,
  }
  const table = doc.querySelector("table.submissionstatustable") ?? doc.querySelector("table.generaltable")
  table?.querySelectorAll("tr").forEach((row) => {
    const cells = row.querySelectorAll("td, th")
    if (cells.length < 2) return
    const label = text(cells[0]).toLowerCase()
    const value = text(cells[1]) || null
    if (label.includes("due date")) fields.dueText = value
    else if (label.includes("submission status")) fields.submissionStatus = value
    else if (label.includes("grading status")) fields.gradingStatus = value
    else if (label.includes("time remaining")) fields.timeRemaining = value
    else if (label.includes("grade") && !label.includes("grading")) fields.grade = value
  })
  return {
    name: text(doc.querySelector("h2")) || fallbackName,
    url: pageUrl,
    ...fields,
    due: parseMoodleDate(fields.dueText),
    submitted: isSubmitted(fields.submissionStatus),
  }
}
```

Note: the returned object must list keys so `toEqual` in the test matches; object key order does not matter for `toEqual`.

- [ ] **Step 4: `core/src/parse/grades.ts`**

```ts
import { UnexpectedPageError } from "../errors"
import { courseName, text } from "../html"
import type { GradeItem, GradeReport } from "../types"

type Column = "name" | "grade" | "range" | "percentage" | "feedback"

export function parseGrades(doc: Document): GradeReport {
  const error = doc.querySelector("div.errorbox") ?? doc.querySelector('div[class*="alert-danger"]')
  if (error) throw new UnexpectedPageError(text(error))

  const name = courseName(doc)
  const table =
    doc.querySelector('table[class*="user-grade"]') ?? doc.querySelector("table#user-grade") ?? doc.querySelector("table.generaltable")
  if (!table) return { courseName: name, items: [], total: null }

  const rows = Array.from(table.querySelectorAll("tr"))
  const headers = rows[0] ? Array.from(rows[0].querySelectorAll("th, td")).map((c) => text(c).toLowerCase()) : []
  const col: Partial<Record<Column, number>> = {}
  headers.forEach((h, i) => {
    if (h.includes("grade item") || (h.includes("item") && col.name === undefined)) col.name = i
    else if (h === "grade" || (h.includes("grade") && !h.includes("item") && col.grade === undefined)) col.grade = i
    else if (h.includes("range")) col.range = i
    else if (h.includes("percentage")) col.percentage = i
    else if (h.includes("feedback")) col.feedback = i
  })

  const items: GradeItem[] = []
  let total: GradeItem | null = null
  for (const row of rows.slice(1)) {
    const cells = Array.from(row.querySelectorAll("th, td"))
    if (!cells.length) continue
    const cell = (key: Column) => {
      const i = col[key]
      return i !== undefined && i < cells.length ? text(cells[i]) || null : null
    }
    const item: GradeItem = {
      name: cell("name") ?? text(cells[0]),
      grade: cell("grade"),
      range: cell("range"),
      percentage: cell("percentage"),
      feedback: cell("feedback"),
    }
    if (item.name.toLowerCase().includes("course total")) total = item
    else if (/category/.test(row.getAttribute("class") ?? "") && !item.grade) continue
    else items.push(item)
  }
  return { courseName: name, items, total }
}
```

- [ ] **Step 5: `core/src/parse/forum.ts`**

```ts
import { abs, text } from "../html"
import type { Announcement, AnnouncementSummary } from "../types"

const DISCUSS_LINK = 'a[href*="/mod/forum/discuss.php?d="]'

export function parseDiscussionList(doc: Document, pageUrl: string, limit = 10): AnnouncementSummary[] {
  const out: AnnouncementSummary[] = []
  const table = doc.querySelector('table[class*="forumheaderlist"], table[class*="discussion-list"]')
  if (table) {
    for (const row of Array.from(table.querySelectorAll("tr")).slice(1, limit + 1)) {
      const link = row.querySelector(DISCUSS_LINK)
      if (!link) continue
      const cells = Array.from(row.querySelectorAll("td, th"))
      out.push({
        title: text(link),
        url: abs(link.getAttribute("href")!, pageUrl),
        author: cells.length > 1 ? text(cells[1]) || null : null,
        dateText: cells.length > 2 ? text(cells[cells.length - 1]) || null : null,
      })
    }
  }
  if (!out.length) {
    const seen = new Set<string>()
    for (const link of Array.from(doc.querySelectorAll(DISCUSS_LINK))) {
      const url = abs(link.getAttribute("href")!, pageUrl)
      if (seen.has(url)) continue
      seen.add(url)
      out.push({ title: text(link), url, author: null, dateText: null })
      if (out.length >= limit) break
    }
  }
  return out
}

export function parseDiscussion(doc: Document, summary: AnnouncementSummary): Announcement {
  const post = doc.querySelector('div[class*="forumpost"], div[class*="forum-post"]')
  if (!post) return { ...summary, content: null }

  const body = post.querySelector('[class*="posting"], [class*="post-content"]')
  let content: string | null = null
  if (body) {
    const paragraphs = Array.from(body.querySelectorAll("p")).map((p) => text(p)).filter(Boolean)
    content = paragraphs.length ? paragraphs.join("\n\n") : text(body) || null
  }
  const author = summary.author ?? (text(post.querySelector(".author") ?? post.querySelector('a[href*="/user/"]')) || null)
  const dateText =
    summary.dateText ?? (text(post.querySelector("time") ?? post.querySelector('[class*="modified"], [class*="date"]')) || null)
  return { ...summary, author, dateText, content }
}
```

- [ ] **Step 6: `core/src/parse/files.ts`**

```ts
import { abs } from "../html"
import type { FileRef, FileSource } from "../types"

export function filenameFromUrl(url: string): string {
  const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "file"
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/** Candidate file URLs on an activity page, in the order the Python client tried them. */
export function parseActivityFiles(doc: Document, html: string, pageUrl: string): FileRef[] {
  const out: FileRef[] = []
  const seen = new Set<string>()
  const push = (href: string, source: FileSource) => {
    let url: string
    try {
      url = abs(href, pageUrl)
    } catch {
      return
    }
    if (seen.has(url)) return
    seen.add(url)
    out.push({ url, filename: filenameFromUrl(url), source })
  }

  const links = Array.from(doc.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")!)
  for (const href of links) if (href.includes("pluginfile.php") || /\.(pdf|pptx?|docx)$/i.test(href)) push(href, "direct")
  for (const m of html.matchAll(/PDFFile\s*:\s*'([^']+)'/g)) push(m[1]!, "flexpaper")
  for (const href of links) if (/\.pptx?$/i.test(href)) push(href, "presentation")
  const iframe = doc.querySelector("iframe#presentationobject")?.getAttribute("src")
  if (iframe) push(iframe, "iframe")
  const object = doc.querySelector("object#presentationobject")?.getAttribute("data")
  if (object) push(object, "object")
  return out
}
```

- [ ] **Step 7: Run the tests**

Run: `bun test --cwd core parse-b`
Expected: all pass (the assignment tests need Task 2's `dates.ts`).
