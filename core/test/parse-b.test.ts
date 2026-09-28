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

describe("review fixes", () => {
  test("announcement keeps lists, tables and divs, not just paragraphs", () => {
    const html = `<html><body><div class="forumpost"><div class="posting fullpost"><p>Mid-sem schedule:</p><ul><li>Unit 1 - Mon</li><li>Unit 2 - Tue</li></ul><table><tr><td>DSA</td><td>2 Oct</td></tr></table><div>Bring your ID card.</div></div></div></body></html>`
    const post = parseDiscussion(parse(html), { title: "t", url: "u", author: "a", dateText: "d" })
    expect(post.content).toContain("Mid-sem schedule:")
    expect(post.content).toContain("- Unit 1 - Mon\n- Unit 2 - Tue")
    expect(post.content).toContain("DSA | 2 Oct")
    expect(post.content).toContain("Bring your ID card.")
  })
  test("control characters never reach the terminal", () => {
    const html = `<html><body><div class="forumpost"><div class="posting">Hi&#27;]52;c;cHduZWQ=&#7; there</div></div></body></html>`
    const post = parseDiscussion(parse(html), { title: "t", url: "u", author: "a", dateText: "d" })
    expect(post.content).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
  })
  test("Moodle's 'Nothing has been submitted' is not submitted", () => {
    expect(isSubmitted("Nothing has been submitted for this assignment")).toBe(false)
  })
})
