import { expect, test } from "bun:test"
import { fileSlot, glyph, slot, type IconName } from "../src/icons"

const NAMES: IconName[] = ["app", "courses", "marked", "unmarked", "deadline", "alert", "attendance", "files", "assignments", "grades", "announcements", "section", "done", "download", "downloading", "refresh", "filter", "collapsed", "expanded", "keys"]

test("every Nerd Font icon is a single code point", () => {
  for (const name of NAMES) expect([...glyph(name, true)]).toHaveLength(1)
})
test("slot is the glyph plus two spaces, or nothing", () => {
  expect(slot("marked", true)).toBe("\u{F0132}  ")
  expect(slot("marked", false)).toBe("■  ")
  expect(slot("courses", false)).toBe("")
})
test("file slots have one width per mode", () => {
  expect(fileSlot("pdf", true)).toBe("\u{F0226}  ")
  expect(fileSlot("pdf", false)).toBe("pdf  ")
  expect(fileSlot("file", false)).toBe("file ")
  for (const k of ["pdf", "ppt", "doc", "file"] as const) expect([...fileSlot(k, false)]).toHaveLength(5)
})
