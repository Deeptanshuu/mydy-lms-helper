import { describe, expect, test } from "bun:test"
import { barRuns, fit, fmtNumber, formatAge, formatBytes, parseScore, windowStart } from "../src/format"

describe("fit", () => {
  test("pads short text and truncates long text with an ellipsis", () => {
    expect(fit("abc", 5)).toBe("abc  ")
    expect(fit("Data Structures", 8)).toBe("Data St…")
    expect(fit("x", 0)).toBe("")
  })
  test("counts code points, not UTF-16 units", () => {
    expect([...fit("\u{F0474}ab", 3)]).toHaveLength(3)
  })
})

describe("barRuns", () => {
  test("filled past the 75% notch", () => {
    expect(barRuns(0.88, 0.75, 20)).toEqual([
      { kind: "fill", text: "█".repeat(15) },
      { kind: "notch", text: "│" },
      { kind: "fill", text: "██" },
      { kind: "empty", text: "░░" },
    ])
  })
  test("below the notch", () => {
    expect(barRuns(0.46, 0.75, 20)).toEqual([
      { kind: "fill", text: "█".repeat(9) },
      { kind: "empty", text: "░".repeat(6) },
      { kind: "notch", text: "│" },
      { kind: "empty", text: "░".repeat(4) },
    ])
  })
})

describe("windowStart", () => {
  test("keeps the selection in view", () => {
    expect(windowStart(5, 3, 20)).toBe(0)
    expect(windowStart(50, 10, 20)).toBe(0)
    expect(windowStart(50, 25, 20)).toBe(15)
    expect(windowStart(50, 49, 20)).toBe(30)
  })
})

describe("human formats", () => {
  test("formatAge", () => {
    expect(formatAge(30_000)).toBe("just now")
    expect(formatAge(2 * 60_000)).toBe("2 min ago")
    expect(formatAge(60 * 60_000)).toBe("1 hour ago")
    expect(formatAge(3 * 60 * 60_000)).toBe("3 hours ago")
    expect(formatAge(2 * 24 * 60 * 60_000)).toBe("2 days ago")
  })
  test("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(860 * 1024)).toBe("860 KB")
    expect(formatBytes(4.8 * 1024 * 1024)).toBe("4.8 MB")
  })
  test("parseScore", () => {
    expect(parseScore("18.00", "0–25")).toEqual({ value: 18, max: 25 })
    expect(parseScore("9.00 / 10.00", null)).toEqual({ value: 9, max: 10 })
    expect(parseScore("-", "0–10")).toBeNull()
    expect(parseScore(null, "0–10")).toBeNull()
    expect(parseScore("5", null)).toBeNull()
  })
  test("fmtNumber drops trailing zeros", () => {
    expect(fmtNumber(18)).toBe("18")
    expect(fmtNumber(9.5)).toBe("9.5")
    expect(fmtNumber(72.857)).toBe("72.86")
  })
})
