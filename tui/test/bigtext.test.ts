import { expect, test } from "bun:test"
import { BIG_ROWS, bigText, bigTextWidth } from "../src/bigtext"

test("figures are 3 rows of half blocks, one cell between glyphs", () => {
  const rows = bigText("88%")
  expect(rows).toHaveLength(BIG_ROWS)
  expect(rows).toEqual(["█▀█ █▀█ ▀ █", "█▀█ █▀█ ▄▀ ", "▀▀▀ ▀▀▀ ▀ ▀"])
  expect(bigTextWidth("88%")).toBe(11)
})

test("the wordmark letters, chevron and cursor", () => {
  expect(bigText("MYDY")).toEqual(["█▄ ▄█ ▀▄ ▄▀ █▀▀▄ ▀▄ ▄▀", "█ ▀ █   █   █  █   █  ", "▀   ▀   ▀   ▀▀▀    ▀  "])
  expect(bigText(">")).toEqual(["▀▄ ", " ▄▀", "▀  "])
  expect(bigText("_")).toEqual(["   ", "   ", "▀▀▀"])
})

test("characters the face can't draw are skipped", () => {
  expect(bigText("7x")).toEqual(bigText("7"))
  expect(bigText("")).toEqual(["", "", ""])
})
