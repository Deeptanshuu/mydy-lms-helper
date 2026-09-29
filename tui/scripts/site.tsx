// Builds the website's live demo: drives the real TUI (demo data, test renderer) through every state
// reachable with j/k/tab/shift+tab/enter/esc/?, records which key leads where, plus a scripted autoplay tour.
// Writes site/demo.json and copies the logo, favicon and the README screenshots (the <noscript> fallback) into site/assets/.
// Run: bun run --cwd tui site
import * as mdi from "@mdi/js"
import { MDI_FILE, MDI_NAME } from "./mdi"
import { testRender } from "@opentui/solid"
import { copyFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { DEMO_NOW, DEMO_POSTS, demoStore } from "../src/demo"
import { fileSlot, glyph, type FileKind, type IconName } from "../src/icons"
import { OVERVIEW_ROW } from "../src/state"
import { color } from "../src/theme"
import { App } from "../src/ui/App"
import { AppProvider, type Services } from "../src/ui/context"

const COLS = 120
const ROWS = 34
const MAX_STATES = 400
const ROOT = join(import.meta.dir, "..", "..")
const SITE = join(ROOT, "site")

// ---- icons: Nerd Font code point -> Material Design Icons path -------------------------------
const ICONS: Record<string, string> = {}
for (const [name, key] of Object.entries(MDI_NAME)) ICONS[glyph(name as IconName, true)] = mdi[key]
for (const [kind, key] of Object.entries(MDI_FILE)) ICONS[[...fileSlot(kind as FileKind, true)][0]!] = mdi[key]

// ---- frame encoding ------------------------------------------------------------------------------
type Run = [text: string, fg: number, bg: number, bold: 0 | 1]
const palette: string[] = []
const paletteIndex = new Map<string, number>()
const rowTable: Run[][] = []
const rowIndex = new Map<string, number>()
const frames: number[][] = []
const frameIndex = new Map<string, number>()

const hex = (c: { buffer: ArrayLike<number> }) =>
  "#" + [0, 1, 2].map((i) => Math.round(Number(c.buffer[i])).toString(16).padStart(2, "0")).join("").toUpperCase()
function colour(c: { buffer: ArrayLike<number> }): number {
  const h = hex(c)
  let i = paletteIndex.get(h)
  if (i === undefined) {
    i = palette.push(h) - 1
    paletteIndex.set(h, i)
  }
  return i
}

type Setup = Awaited<ReturnType<typeof testRender>>

function capture(t: Setup): number {
  const rows = t.captureSpans().lines.map((line) => {
    const runs: Run[] = line.spans.map((s) => [s.text, colour(s.fg as never), colour(s.bg as never), s.attributes & 1 ? 1 : 0])
    const key = JSON.stringify(runs)
    let i = rowIndex.get(key)
    if (i === undefined) {
      i = rowTable.push(runs) - 1
      rowIndex.set(key, i)
    }
    return i
  })
  const key = rows.join(",")
  let i = frameIndex.get(key)
  if (i === undefined) {
    i = frames.push(rows) - 1
    frameIndex.set(key, i)
  }
  return i
}

// ---- driving the app -------------------------------------------------------------------------------
const noop = () => undefined

const store = demoStore()
// The app opens on the Overview (demoStore() selects a course, for the screenshots and tests).
store.actions.select(OVERVIEW_ROW)
const services: Services = {
  refresh: noop,
  loadTab: noop,
  openAnnouncement: (s) => store.actions.setReading({ ...s, content: DEMO_POSTS[s.title] ?? null }),
  startDownload: (ids) =>
    store.actions.setDownload({
      active: true, visible: true, courses: ids.length, total: 23, done: 14, bytes: 13_002_342, skipped: 3,
      current: "Engineering Maths III / Laplace transforms notes.pdf", folder: "~/Downloads/MyDy",
    }),
  cancelDownload: noop,
  signIn: noop,
  open: noop,
  quit: noop,
}
// One renderer for everything: creating hundreds of renderers exhausts OpenTUI's native buffers.
const t = await testRender(
  () => (
    <AppProvider value={{ store, nerd: true, threshold: 0.75, services, now: () => DEMO_NOW }}>
      <App />
    </AppProvider>
  ),
  { width: COLS, height: ROWS },
)
await t.renderOnce()
const initial = store.actions.cloneState()

type KeyName = "j" | "k" | "tab" | "shift+tab" | "enter" | "esc" | "?" | "space" | "d"
const INTERACTIVE: KeyName[] = ["j", "k", "tab", "shift+tab", "enter", "esc", "?"]

async function press(key: KeyName) {
  switch (key) {
    case "tab":
      t.mockInput.pressTab()
      break
    case "shift+tab":
      t.mockInput.pressTab({ shift: true })
      break
    case "enter":
      t.mockInput.pressEnter()
      break
    case "esc":
      t.mockInput.pressEscape()
      // A lone ESC is only reported once the parser's alt-key timeout passes.
      await Bun.sleep(40)
      break
    case "space":
      t.mockInput.pressKey(" ")
      break
    default:
      t.mockInput.pressKey(key)
  }
  await t.renderOnce()
}

async function show(state: ReturnType<typeof store.actions.cloneState>) {
  store.actions.replaceState(state)
  await t.renderOnce()
}

// ---- explore the key graph --------------------------------------------------------------------------
const start = capture(t)
const states = new Map<number, ReturnType<typeof store.actions.cloneState>>([[start, initial]])
const edges: Array<Partial<Record<KeyName, number>>> = []
const queue = [start]
let truncated = false
while (queue.length) {
  const id = queue.shift()!
  edges[id] = {}
  for (const key of INTERACTIVE) {
    await show(states.get(id)!)
    await press(key)
    const next = capture(t)
    edges[id]![key] = next
    if (!states.has(next)) {
      if (states.size >= MAX_STATES) {
        truncated = true
        edges[id]![key] = id
        continue
      }
      states.set(next, store.actions.cloneState())
      queue.push(next)
    }
  }
}
if (truncated) console.warn(`state graph capped at ${MAX_STATES} states; some keys loop back`)

// ---- autoplay tour -------------------------------------------------------------------------------------
const TOUR: Array<[KeyName | null, number, string]> = [
  [null, 3800, "It opens on the Overview: attendance, what's due this week and your grades on one screen."],
  ["j", 2800, "Pick a course and the needs-you row under the header keeps what's urgent in view."],
  ["j", 2800, "Computer Networks is at 72%: attend the next 6 classes to get back to 75%."],
  ["space", 1600, "Press space to mark courses for download."],
  ["j", 700, ""],
  ["space", 1600, ""],
  ["d", 3200, "d downloads everything marked, skipping files you already have."],
  ["esc", 900, ""],
  ["enter", 2600, "enter opens a course: files first."],
  ["tab", 2800, "tab switches to assignments, most urgent first."],
  ["tab", 2600, "Grades, with the course total pinned at the bottom."],
  ["tab", 1600, "Announcements."],
  ["enter", 3200, "enter reads the whole post without leaving the terminal."],
  ["esc", 700, ""],
  ["esc", 1400, "esc goes back."],
  ["k", 500, ""],
  ["k", 500, ""],
  ["k", 2200, "Back on the Overview. enter steps in, and j and k pick a deadline."],
  ["enter", 1600, ""],
  ["j", 1000, ""],
  ["enter", 3200, "enter on a deadline jumps straight to that assignment."],
  ["?", 3400, "Press ? any time for every key."],
  ["esc", 1400, ""],
]
const autoplay: Array<{ f: number; ms: number; caption: string }> = []
await show(initial)
let caption = ""
for (const [key, ms, text] of TOUR) {
  if (key) await press(key)
  if (text) caption = text
  autoplay.push({ f: capture(t), ms, caption })
}
t.renderer.destroy()

// ---- write -------------------------------------------------------------------------------------------
await mkdir(join(SITE, "assets"), { recursive: true })
const demo = { cols: COLS, rows: ROWS, bg: color.bg, palette, icons: ICONS, rowTable, frames, start, edges, autoplay }
await Bun.write(join(SITE, "demo.json"), JSON.stringify(demo))
await copyFile(join(ROOT, "docs", "assets", "logo.svg"), join(SITE, "assets", "logo.svg"))
await copyFile(join(ROOT, "docs", "assets", "tui-overview.svg"), join(SITE, "assets", "tui-overview.svg"))
await copyFile(join(ROOT, "docs", "assets", "tui-dashboard.svg"), join(SITE, "assets", "tui-dashboard.svg"))
await copyFile(join(ROOT, "extension", "icons", "icon-32.png"), join(SITE, "assets", "favicon-32.png"))
await copyFile(join(ROOT, "extension", "icons", "icon-128.png"), join(SITE, "assets", "icon-128.png"))
const size = (await Bun.file(join(SITE, "demo.json")).arrayBuffer()).byteLength
console.log(`site/demo.json: ${frames.length} frames, ${states.size} interactive states, ${rowTable.length} unique rows, ${palette.length} colours, ${(size / 1024).toFixed(0)} KB`)
process.exit(0)
