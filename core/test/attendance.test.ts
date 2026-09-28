import { describe, expect, test } from "bun:test"
import { attendanceMath } from "../src/attendance"

describe("attendanceMath", () => {
  test("above the threshold: how many more can be missed", () => {
    expect(attendanceMath(44, 50)).toEqual({ percentage: 88, status: "ok", canMiss: 8, mustAttend: 0 })
    expect(attendanceMath(39, 48)).toMatchObject({ status: "ok", canMiss: 4 })
  })
  test("exactly at the threshold can miss none", () => {
    expect(attendanceMath(30, 40)).toMatchObject({ status: "ok", canMiss: 0, mustAttend: 0 })
  })
  test("below: how many in a row to attend", () => {
    expect(attendanceMath(33, 46)).toMatchObject({ status: "warn", canMiss: 0, mustAttend: 6 })
    expect(attendanceMath(19, 41)).toMatchObject({ status: "low", mustAttend: 47 })
  })
  test("no classes held yet is not an error", () => {
    expect(attendanceMath(0, 0)).toEqual({ percentage: null, status: "ok", canMiss: 0, mustAttend: 0 })
  })
  test("custom threshold", () => {
    expect(attendanceMath(16, 20, 0.8)).toMatchObject({ status: "ok", canMiss: 0 })
    expect(attendanceMath(15, 20, 0.8)).toMatchObject({ status: "warn", mustAttend: 5 })
  })
})
