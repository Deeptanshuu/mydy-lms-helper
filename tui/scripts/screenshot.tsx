// Renders the TUI with demo data and writes docs/assets/tui-*.svg for the README.
// GitHub renders SVG text with system fonts, which lack Nerd Font glyphs and draw block and box-drawing
// characters with gaps between rows, so everything that has to tile is drawn as vector shapes instead:
// each Nerd Font icon as its Material Design Icons path (nf-md-* glyphs are MDI icons), block elements
// (█ ▀ ▌ ▁-▇ ▖-▟ ░▒▓), box-drawing lines (─ ━ │ ┃ ╴-╻ ┌-┼), rounded corners (╭╮╰╯) and the Powerline pill
// caps as shapes that exactly fill the cell. Everything else stays text.
// Run: bun run --cwd tui screenshot
import * as mdi from "@mdi/js"
import { MDI_FILE, MDI_NAME } from "./mdi"
import { testRender } from "@opentui/solid"
import { join } from "node:path"
import { DEMO_NOW, demoStore } from "../src/demo"
import { CAP_LEFT, CAP_RIGHT, fileSlot, glyph, type FileKind, type IconName } from "../src/icons"
import { OVERVIEW_ROW, type AppStore } from "../src/state"
import { color } from "../src/theme"
import { App } from "../src/ui/App"
import { AppProvider, type Services } from "../src/ui/context"

const COLS = 120
const ROWS = 34
const CELL_W = 8.4
const LINE_H = 19
const PAD = 18
const LIGHT = 1.2
const HEAVY = 2.4
const noop = () => undefined
const services: Services = {
  refresh: noop, loadTab: noop, openAnnouncement: noop, startDownload: noop,
  cancelDownload: noop, signIn: noop, open: noop, quit: noop,
}

type Rgba = { buffer: ArrayLike<number> }
const hex = (c: Rgba) =>
  "#" + [0, 1, 2].map((i) => Math.round(Number(c.buffer[i])).toString(16).padStart(2, "0")).join("").toUpperCase()
const ICON_PATHS = new Map<string, string>([
  ...Object.entries(MDI_NAME).map(([name, key]) => [glyph(name as IconName, true), mdi[key]] as [string, string]),
  ...Object.entries(MDI_FILE).map(([kind, key]) => [[...fileSlot(kind as FileKind, true)][0]!, mdi[key]] as [string, string]),
])
const ICON_PX = 15

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// ---- vector cells -------------------------------------------------------------------------------
// Rectangles are integers in thousandths of a pixel, so edges that touch compare exactly and merge.
type Rect = [x0: number, y0: number, x1: number, y1: number]
const CW = CELL_W * 1000
const LH = LINE_H * 1000
const num = (v: number) => String(+(v / 1000).toFixed(3))
const px = (v: number) => String(+v.toFixed(2))

// Block elements as rectangles in eighths of the cell (x across, y down).
type Eighths = [number, number, number, number]
const QUADRANTS: Eighths[] = [[0, 0, 4, 4], [4, 0, 8, 4], [0, 4, 4, 8], [4, 4, 8, 8]] // UL UR LL LR
const QUAD_MASK = [4, 8, 1, 13, 9, 7, 11, 2, 6, 14] // U+2596..U+259F as UL=1 UR=2 LL=4 LR=8
function block(cp: number): { rects: Eighths[]; opacity?: number } | undefined {
  if (cp === 0x2580) return { rects: [[0, 0, 8, 4]] }
  if (cp >= 0x2581 && cp <= 0x2588) return { rects: [[0, 0x2588 - cp, 8, 8]] } // lower n/8, full block last
  if (cp >= 0x2589 && cp <= 0x258f) return { rects: [[0, 0, 0x2590 - cp, 8]] } // left n/8
  if (cp === 0x2590) return { rects: [[4, 0, 8, 8]] }
  if (cp >= 0x2591 && cp <= 0x2593) return { rects: [[0, 0, 8, 8]], opacity: (cp - 0x2590) / 4 }
  if (cp === 0x2594) return { rects: [[0, 0, 8, 1]] }
  if (cp === 0x2595) return { rects: [[7, 0, 8, 8]] }
  if (cp >= 0x2596 && cp <= 0x259f) return { rects: QUADRANTS.filter((_, i) => QUAD_MASK[cp - 0x2596]! & (1 << i)) }
}

// Box-drawing lines as arm weights [left, right, up, down]: 0 none, 1 light, 2 heavy.
type Arms = [number, number, number, number]
const ARMS: Record<string, Arms> = {}
const arms = (chars: string, a: Arms[]) => [...chars].forEach((ch, i) => (ARMS[ch] = a[i]!))
arms("─━│┃┌┏┐┓└┗┘┛", [[1, 1, 0, 0], [2, 2, 0, 0], [0, 0, 1, 1], [0, 0, 2, 2], [0, 1, 0, 1], [0, 2, 0, 2], [1, 0, 0, 1], [2, 0, 0, 2], [0, 1, 1, 0], [0, 2, 2, 0], [1, 0, 1, 0], [2, 0, 2, 0]])
arms("├┣┤┫┬┳┴┻┼╋", [[0, 1, 1, 1], [0, 2, 2, 2], [1, 0, 1, 1], [2, 0, 2, 2], [1, 1, 0, 1], [2, 2, 0, 2], [1, 1, 1, 0], [2, 2, 2, 0], [1, 1, 1, 1], [2, 2, 2, 2]])
arms("╴╵╶╷╸╹╺╻╼╽╾╿", [[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1], [2, 0, 0, 0], [0, 0, 2, 0], [0, 2, 0, 0], [0, 0, 0, 2], [1, 2, 0, 0], [0, 0, 1, 2], [2, 1, 0, 0], [0, 0, 2, 1]])
const THICK = [0, LIGHT, HEAVY]
// Line centres sit on pixel centres (light) or pixel edges (heavy), so a 1.2px stroke fills one pixel row
// and a 2.4px one fills two at 1x, and vertical runs and the arcs that join them agree on the x.
const centre = (v: number, weight: number) => (weight === 1 ? Math.floor(v) + 0.5 : Math.round(v))
const milli = (v: number) => Math.round(v * 1000)
function armRects([l, r, u, d]: Arms, x: number, y: number): Rect[] {
  const mx = x + CELL_W / 2
  const my = y + LINE_H / 2
  const vertical = Math.max(u, d)
  const horizontal = Math.max(l, r)
  // Where the arms cross. Each arm runs half a stroke past it so corners and tees fill in.
  const cx = centre(mx, u || d || 1)
  const cy = centre(my, l || r || 1)
  const reachV = vertical ? THICK[vertical]! / 2 : 0
  const reachH = horizontal ? THICK[horizontal]! / 2 : 0
  const out: Rect[] = []
  const arm = (x0: number, y0: number, x1: number, y1: number) => out.push([milli(x0), milli(y0), milli(x1), milli(y1)])
  if (l) arm(x, centre(my, l) - THICK[l]! / 2, cx + reachV, centre(my, l) + THICK[l]! / 2)
  if (r) arm(cx - reachV, centre(my, r) - THICK[r]! / 2, x + CELL_W, centre(my, r) + THICK[r]! / 2)
  if (u) arm(centre(mx, u) - THICK[u]! / 2, y, centre(mx, u) + THICK[u]! / 2, cy + reachH)
  if (d) arm(centre(mx, d) - THICK[d]! / 2, cy - reachH, centre(mx, d) + THICK[d]! / 2, y + LINE_H)
  return out
}

/** Rounded corners: a quarter circle from the middle of one cell edge, then a straight run to the other. */
function corner(ch: string, x: number, y: number): string | undefined {
  const cx = centre(x + CELL_W / 2, 1)
  const cy = centre(y + LINE_H / 2, 1)
  const arc = (edge: number, r: number, sweep: 0 | 1, dy: 1 | -1) =>
    `M${px(edge)} ${px(cy)}A${px(r)} ${px(r)} 0 0 ${sweep} ${px(cx)} ${px(cy + dy * r)}V${px(dy > 0 ? y + LINE_H : y)}`
  if (ch === "╭") return arc(x + CELL_W, x + CELL_W - cx, 0, 1)
  if (ch === "╮") return arc(x, cx - x, 1, 1)
  if (ch === "╰") return arc(x + CELL_W, x + CELL_W - cx, 1, -1)
  if (ch === "╯") return arc(x, cx - x, 0, -1)
}

/**
 * Powerline half discs filling the cell: the flat side on the cell edge, the curve bulging out. The flat
 * side runs a pixel into the neighbouring pill body (the same colour) so no seam shows between them.
 */
function cap(ch: string, x: number, y: number): string | undefined {
  const [Y, Y1] = [px(y), px(y + LINE_H)]
  const [rx, ry] = [px(CELL_W), px(LINE_H / 2)]
  if (ch === CAP_RIGHT) return `M${px(x - 1)} ${Y}H${px(x)}A${rx} ${ry} 0 0 1 ${px(x)} ${Y1}H${px(x - 1)}Z`
  if (ch === CAP_LEFT) return `M${px(x + CELL_W + 1)} ${Y}H${px(x + CELL_W)}A${rx} ${ry} 0 0 0 ${px(x + CELL_W)} ${Y1}H${px(x + CELL_W + 1)}Z`
}

/** Merges touching or overlapping rectangles into as few as possible: along x, then along y, until stable. */
function mergeAlong(rects: Rect[], k: 0 | 1): Rect[] {
  const o = 1 - k
  const out: Rect[] = []
  for (const r of [...rects].sort((p, q) => p[o] - q[o] || p[o + 2] - q[o + 2] || p[k] - q[k])) {
    const last = out[out.length - 1]
    if (last && last[o] === r[o] && last[o + 2] === r[o + 2] && r[k] <= last[k + 2]) last[k + 2] = Math.max(last[k + 2], r[k + 2])
    else out.push([...r])
  }
  return out
}
function merge(rects: Rect[]): Rect[] {
  let n = -1
  while (rects.length !== n) {
    n = rects.length
    rects = mergeAlong(mergeAlong(rects, 0), 1)
  }
  return rects
}

const rectPath = ([x0, y0, x1, y1]: Rect) => `M${num(x0)} ${num(y0)}h${num(x1 - x0)}v${num(y1 - y0)}h${num(x0 - x1)}z`
const add = <T,>(map: Map<string, T[]>, key: string, item: T) => map.set(key, [...(map.get(key) ?? []), item])

type Frame = { lines: { spans: { text: string; width: number; fg: Rgba; bg: Rgba; attributes: number }[] }[] }

/** Draws a captured frame as an SVG document. */
export function toSvg(frame: Frame): string {
  const rows = frame.lines.length
  const width = Math.ceil(COLS * CELL_W + PAD * 2)
  const height = rows * LINE_H + PAD * 2

  const fills = new Map<string, Rect[]>() // cell backgrounds, by colour
  const blocks = new Map<string, Rect[]>() // block elements, by "colour" or "colour opacity"
  const rules = new Map<string, Rect[]>() // box-drawing lines, by colour
  const arcs = new Map<string, string[]>() // rounded corners, by colour
  const caps = new Map<string, string[]>() // pill caps, by colour
  const glyphs: string[] = [] // icons and text
  frame.lines.forEach((line, row) => {
    let col = 0
    const y = PAD + row * LINE_H
    for (const span of line.spans) {
      const cells = span.width
      const bg = hex(span.bg as Rgba)
      const fg = hex(span.fg as Rgba)
      const bold = span.attributes & 1 ? ` font-weight="700"` : ""
      const at = (c: number) => PAD + c * CELL_W
      if (bg !== color.bg) {
        for (let c = col; c < col + cells; c++) add(fills, bg, [Math.round(at(c) * 1000), y * 1000, Math.round(at(c + 1) * 1000), (y + LINE_H) * 1000])
      }
      // Split the span into plain-text runs and single cells drawn as shapes or icons.
      let runStart = 0
      let run = ""
      const flush = () => {
        const text = run.trim()
        if (text) {
          const lead = run.length - run.trimStart().length
          glyphs.push(`<text x="${at(col + runStart + lead).toFixed(1)}" y="${y + 14}" fill="${fg}"${bold} textLength="${(text.length * CELL_W).toFixed(1)}" lengthAdjust="spacing" xml:space="preserve">${escape(text)}</text>`)
        }
        run = ""
      }
      ;[...span.text].forEach((ch, i) => {
        const x = at(col + i)
        const [X, Y] = [Math.round(x * 1000), y * 1000]
        const shape = block(ch.codePointAt(0)!)
        const lines = ARMS[ch]
        const arc = corner(ch, x, y)
        const pill = cap(ch, x, y)
        const path = ICON_PATHS.get(ch)
        if (shape) {
          for (const [a, b, c, d] of shape.rects) add(blocks, shape.opacity ? `${fg} ${shape.opacity}` : fg, [X + (a * CW) / 8, Y + (b * LH) / 8, X + (c * CW) / 8, Y + (d * LH) / 8])
        } else if (lines) {
          for (const r of armRects(lines, x, y)) add(rules, fg, r)
        } else if (arc) {
          add(arcs, fg, arc)
        } else if (pill) {
          add(caps, fg, pill)
        } else if (path) {
          glyphs.push(`<path d="${path}" fill="${fg}" transform="translate(${(x - 1).toFixed(1)} ${(y + 2).toFixed(1)}) scale(${(ICON_PX / 24).toFixed(4)})"/>`)
        } else {
          if (!run) runStart = i
          run += ch
          return
        }
        flush()
        runStart = i + 1
      })
      flush()
      col += cells
    }
  })

  const rectGroup = (map: Map<string, Rect[]>) =>
    [...map].map(([key, rects]) => {
      const [fill, opacity] = key.split(" ")
      return `<path fill="${fill}"${opacity ? ` fill-opacity="${opacity}"` : ""} d="${merge(rects).map(rectPath).join("")}"/>`
    })
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="MyDy LMS Helper terminal UI">`,
    `<style>text{font-family:ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;font-size:14px;white-space:pre}</style>`,
    `<rect width="${width}" height="${height}" rx="12" fill="${color.bg}"/>`,
    `<g shape-rendering="crispEdges">`,
    ...rectGroup(fills),
    ...rectGroup(blocks),
    `</g>`,
    ...rectGroup(rules),
    ...(arcs.size ? [`<g fill="none" stroke-width="${LIGHT}">`, ...[...arcs].map(([stroke, d]) => `<path stroke="${stroke}" d="${d.join("")}"/>`), `</g>`] : []),
    ...[...caps].map(([fill, d]) => `<path fill="${fill}" d="${d.join("")}"/>`),
    ...glyphs,
    "</svg>",
  ]
  return out.join("\n") + "\n"
}

async function shot(name: string, store: AppStore) {
  const t = await testRender(
    () => (
      <AppProvider value={{ store, nerd: true, threshold: 0.75, services, now: () => DEMO_NOW }}>
        <App />
      </AppProvider>
    ),
    { width: COLS, height: ROWS },
  )
  await t.renderOnce()
  await t.renderOnce()
  const svg = toSvg(t.captureSpans() as Frame)
  const path = join(import.meta.dir, "..", "..", "docs", "assets", `${name}.svg`)
  await Bun.write(path, svg)
  t.renderer.destroy()
  console.log(`wrote ${path} (${Math.round(svg.length / 1024)} KB)`)
}

if (import.meta.main) {
  await shot("tui-dashboard", demoStore())
  const assignments = demoStore()
  assignments.actions.setFocus("detail")
  assignments.actions.setTab("assignments")
  await shot("tui-assignments", assignments)
  const overview = demoStore()
  overview.actions.select(OVERVIEW_ROW)
  await shot("tui-overview", overview)
  process.exit(0)
}
