// Big numerals for hero figures, 3 rows tall. The ASCII fonts' digits are too crude to read at a
// glance, so figures get their own face: a 3x5 pixel grid drawn with half blocks.

const PIXELS: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", "..#", "..#", "..#"],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  "%": ["#.#", "..#", ".#.", "#..", "#.#"],
  "/": ["..#", "..#", ".#.", "#..", "#.."],
  "-": ["...", "...", "###", "...", "..."],
  "+": ["...", ".#.", "###", ".#.", "..."],
  ".": [".", ".", ".", ".", "#"],
  ":": [".", "#", ".", "#", "."],
  " ": [".", ".", ".", ".", "."],
}

function halfBlocks(top: boolean, bottom: boolean): string {
  return top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " "
}

/** Rows of `text` in the big numeral face (unknown characters are skipped). One cell between glyphs. */
export function bigText(text: string): [string, string, string] {
  const rows: [string, string, string] = ["", "", ""]
  const glyphs = [...text].map((ch) => PIXELS[ch]).filter((g): g is string[] => !!g)
  glyphs.forEach((g, i) => {
    const gap = i ? " " : ""
    for (let r = 0; r < 3; r++) {
      const top = g[r * 2]!
      const bottom = g[r * 2 + 1]
      let row = ""
      for (let c = 0; c < top.length; c++) row += halfBlocks(top[c] === "#", bottom?.[c] === "#")
      rows[r] += gap + row
    }
  })
  return rows
}

export function bigTextWidth(text: string): number {
  return [...bigText(text)[0]].length
}

export const BIG_ROWS = 3
