import { describe, expect, test } from "bun:test"
import { calendarDayDiff, clockTime, parseMoodleDate, relativeDue, shortDate } from "../src/dates"

const now = new Date(2026, 8, 29, 10, 0) // Tue 29 Sep 2026, 10:00

describe("parseMoodleDate", () => {
  test("full Moodle format", () => {
    expect(parseMoodleDate("Wednesday, 30 September 2026, 11:59 PM")).toEqual(new Date(2026, 8, 30, 23, 59))
    expect(parseMoodleDate("Monday, 5 October 2026, 12:05 AM")).toEqual(new Date(2026, 9, 5, 0, 5))
  })
  test("date without a time means end of day", () => {
    expect(parseMoodleDate("12 Sep 2026")).toEqual(new Date(2026, 8, 12, 23, 59))
  })
  test("unparseable input", () => {
    expect(parseMoodleDate("not a date")).toBeNull()
    expect(parseMoodleDate(null)).toBeNull()
  })
})

describe("formatting", () => {
  test("calendarDayDiff counts calendar days, not 24h blocks", () => {
    expect(calendarDayDiff(new Date(2026, 8, 30, 1), new Date(2026, 8, 29, 23))).toBe(1)
  })
  test("shortDate and clockTime", () => {
    expect(shortDate(new Date(2026, 9, 12))).toBe("Mon 12 Oct")
    expect(clockTime(new Date(2026, 8, 30, 9, 5))).toBe("09:05")
  })
  test("relativeDue", () => {
    expect(relativeDue(new Date(2026, 8, 29, 23, 59), now)).toBe("due today")
    expect(relativeDue(new Date(2026, 8, 30, 23, 59), now)).toBe("due tomorrow")
    expect(relativeDue(new Date(2026, 9, 2, 12, 0), now)).toBe("due in 3 days")
    expect(relativeDue(new Date(2026, 9, 12, 23, 59), now)).toBe("due Mon 12 Oct")
    expect(relativeDue(new Date(2026, 8, 29, 8, 0), now)).toBe("was due today")
    expect(relativeDue(new Date(2026, 8, 27, 23, 59), now)).toBe("overdue by 2 days")
  })
})
