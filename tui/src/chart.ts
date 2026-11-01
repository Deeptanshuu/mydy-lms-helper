// A line chart drawn with text: a CGPA line and SGPA dots over semesters, with a y axis and semester labels.
//
//   9.5 ┤        ⣀⡠⠤●⠒⠊
//   9.0 ┤  ●⠤⠒⠊⠉
//   8.5 ┤
//       └──────────────────
//        S1      S2      S3
//
// With `braille` the line is drawn in braille dots (2 × 4 per cell) so it reads as a smooth curve; without
// (fonts that lack braille), each cell the line crosses gets a "·".

export type ChartRole = "axis" | "label" | "line" | "dot" | "blank"
export interface ChartCell {
  text: string
  role: ChartRole
}

export interface ChartInput {
  /** One per semester, in order. */
  dots: Array<number | null>
  line: Array<number | null>
  labels: string[]
  width: number
  height: number
  braille: boolean
}

/** The y range: the data with some air, on half-point steps, inside 0..10, at least one point tall. */
export function yRange(values: number[]): [number, number] {
  if (!values.length) return [0, 10]
  const pad = 0.25
  let lo = Math.max(0, Math.floor((Math.min(...values) - pad) * 2) / 2)
  let hi = Math.min(10, Math.ceil((Math.max(...values) + pad) * 2) / 2)
  if (hi - lo < 1) {
    if (hi + 0.5 <= 10) hi += 0.5
    if (hi - lo < 1) lo = Math.max(0, hi - 1)
  }
  return [lo, hi]
}

// Braille dot bits by [row][column] inside a cell.
const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

/** Rows of cells, `height` rows of exactly `width` cells. */
export function lineChart(input: ChartInput): ChartCell[][] {
  const { width, height } = input
  const n = Math.max(input.dots.length, input.line.length)
  const values = [...input.dots, ...input.line].filter((v): v is number => v !== null)
  const [lo, hi] = yRange(values)
  const labelW = 4
  const plotW = Math.max(4, width - labelW - 1)
  const plotH = Math.max(2, height - 2)

  const subW = plotW * 2
  const subH = plotH * 4
  const sx = (i: number) => (n <= 1 ? Math.floor(subW / 2) : Math.round((i * (subW - 1)) / (n - 1)))
  const sy = (v: number) => Math.round(((hi - v) / (hi - lo)) * (subH - 1))

  // The line, as sub-cell dots.
  const bits: number[][] = Array.from({ length: plotH }, () => new Array<number>(plotW).fill(0))
  const plot = (x: number, y: number) => {
    const cx = x >> 1
    const cy = y >> 2
    if (cx >= 0 && cx < plotW && cy >= 0 && cy < plotH) bits[cy]![cx]! |= BITS[y & 3]![x & 1]!
  }
  let last: [number, number] | null = null
  input.line.forEach((v, i) => {
    if (v === null) return
    const p: [number, number] = [sx(i), sy(v)]
    if (!last) plot(...p)
    else {
      // Bresenham from the last point.
      let [x0, y0] = last
      const [x1, y1] = p
      const dx = Math.abs(x1 - x0)
      const dy = -Math.abs(y1 - y0)
      const stepX = x0 < x1 ? 1 : -1
      const stepY = y0 < y1 ? 1 : -1
      let err = dx + dy
      for (;;) {
        plot(x0, y0)
        if (x0 === x1 && y0 === y1) break
        const e2 = 2 * err
        if (e2 >= dy) {
          err += dy
          x0 += stepX
        }
        if (e2 <= dx) {
          err += dx
          y0 += stepY
        }
      }
    }
    last = p
  })

  const grid: ChartCell[][] = bits.map((row) =>
    row.map((b): ChartCell => (b ? { text: input.braille ? String.fromCharCode(0x2800 + b) : "·", role: "line" } : { text: " ", role: "blank" })),
  )
  // Dots go on top of the line.
  input.dots.forEach((v, i) => {
    if (v === null) return
    const cy = sy(v) >> 2
    const cx = sx(i) >> 1
    if (grid[cy]?.[cx]) grid[cy]![cx] = { text: "●", role: "dot" }
  })

  // The y axis: a tick and a label on the rows that whole or half points land on, the clearest step that fits.
  const step = [0.5, 1, 2, 5].find((st) => ((hi - lo) / st) * 2 <= plotH) ?? 5
  const ticks = new Map<number, string>()
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    const row = Math.round(((hi - v) / (hi - lo)) * (plotH - 1))
    if (!ticks.has(row)) ticks.set(row, Number.isInteger(v) ? String(v) : v.toFixed(1))
  }
  const rows: ChartCell[][] = grid.map((cells, r) => {
    const label = ticks.get(r)
    return [
      { text: (label ?? "").padStart(labelW), role: "label" },
      { text: label !== undefined ? "┤" : "│", role: "axis" },
      ...cells,
    ]
  })
  rows.push([{ text: " ".repeat(labelW), role: "blank" }, { text: "└" + "─".repeat(plotW), role: "axis" }])

  // Semester labels under their points, skipped where they would run into the previous one.
  const under = new Array<string>(plotW + 1).fill(" ")
  let free = 0
  input.labels.forEach((text, i) => {
    const at = Math.max(0, Math.min(plotW + 1 - text.length, 1 + (sx(i) >> 1) - Math.floor(text.length / 2)))
    if (at < free) return
    for (let k = 0; k < text.length; k++) under[at + k] = text[k]!
    free = at + text.length + 1
  })
  rows.push([{ text: " ".repeat(labelW), role: "blank" }, { text: under.join(""), role: "label" }])

  // Pad every row to exactly `width`.
  return rows.map((cells) => {
    const used = cells.reduce((k, c) => k + [...c.text].length, 0)
    return used < width ? [...cells, { text: " ".repeat(width - used), role: "blank" }] : cells
  })
}
