import { describe, expect, test } from "bun:test"
import { abs, activityName, courseName, text } from "../src/html"
import { parse } from "./dom"

describe("html helpers", () => {
  test("text collapses whitespace and tolerates null", () => {
    expect(text(parse("<html><body><p>  a \n  b </p></body></html>").querySelector("p"))).toBe("a b")
    expect(text(null)).toBe("")
  })

  test("abs resolves relative links against the page URL", () => {
    expect(abs("/rait/mod/resource/view.php?id=1", "https://mydy.dypatil.edu/rait/my/")).toBe(
      "https://mydy.dypatil.edu/rait/mod/resource/view.php?id=1",
    )
  })

  test("activityName drops the screen-reader suffix", () => {
    const doc = parse(
      `<html><body><ul><li class="activity"><a href="/x"><span class="instancename">Lecture 1<span class="accesshide"> File</span></span></a></li></ul></body></html>`,
    )
    expect(activityName(doc.querySelector("li")!)).toBe("Lecture 1")
  })

  test("activityName falls back to the link's own text", () => {
    const doc = parse(`<html><body><ul><li><a href="/x">Syllabus <span class="badge">New</span></a></li></ul></body></html>`)
    expect(activityName(doc.querySelector("li")!)).toBe("Syllabus")
  })

  test("courseName reads the page title", () => {
    expect(courseName(parse("<html><head><title>Course: Computer Networks</title></head><body></body></html>"))).toBe(
      "Computer Networks",
    )
    expect(courseName(parse("<html><head></head><body></body></html>"))).toBe("Unknown course")
  })
})
