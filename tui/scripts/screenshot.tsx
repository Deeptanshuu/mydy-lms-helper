// Renders the TUI with demo data and writes docs/assets/tui-*.svg for the README.
// GitHub renders SVG text with system fonts, which lack Nerd Font glyphs, so each Nerd Font icon is
// drawn as its Material Design Icons path (nf-md-* glyphs are MDI icons).
// Run: bun run --cwd tui screenshot
import * as mdi from "@mdi/js"
import { testRender } from "@opentui/solid"
import { join } from "node:path"
import { DEMO_NOW, demoStore } from "../src/demo"
import { fileSlot, glyph, type FileKind, type IconName } from "../src/icons"
import type { AppStore } from "../src/state"
import { color } from "../src/theme"
import { App } from "../src/ui/App"
import { AppProvider, type Services } from "../src/ui/context"

const COLS = 120
const ROWS = 32
const CELL_W = 8.4
const LINE_H = 19
const PAD = 18
const noop = () => undefined
const services: Services = {
  refresh: noop, loadTab: noop, openAnnouncement: noop, startDownload: noop,
  cancelDownload: noop, signIn: noop, open: noop, quit: noop,
}

type Rgba = { buffer: ArrayLike<number> }
const hex = (c: Rgba) =>
  "#" + [0, 1, 2].map((i) => Math.round(Number(c.buffer[i])).toString(16).padStart(2, "0")).join("").toUpperCase()
const MDI_NAME: Record<IconName, keyof typeof mdi> = {
  app: "mdiSchool", courses: "mdiBookOpenVariant", marked: "mdiCheckboxMarked", unmarked: "mdiCheckboxBlankOutline",
  deadline: "mdiCalendarClock", alert: "mdiAlert", attendance: "mdiChartBar", files: "mdiFolder",
  assignments: "mdiClipboardTextOutline", grades: "mdiStarOutline", announcements: "mdiBullhorn", section: "mdiFolderOutline",
  done: "mdiCheck", download: "mdiDownload", downloading: "mdiProgressDownload", refresh: "mdiRefresh", filter: "mdiMagnify",
  collapsed: "mdiChevronRight", expanded: "mdiChevronDown", keys: "mdiKeyboard",
}
const MDI_FILE: Record<FileKind, keyof typeof mdi> = { pdf: "mdiFilePdfBox", ppt: "mdiFilePowerpointBox", doc: "mdiFileDocumentOutline", file: "mdiFileOutline" }
const ICON_PATHS = new Map<string, string>([
  ...Object.entries(MDI_NAME).map(([name, key]) => [glyph(name as IconName, true), mdi[key]] as [string, string]),
  ...Object.entries(MDI_FILE).map(([kind, key]) => [[...fileSlot(kind as FileKind, true)][0]!, mdi[key]] as [string, string]),
])
const ICON_PX = 15

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

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
  const frame = t.captureSpans()
  const width = Math.ceil(COLS * CELL_W + PAD * 2)
  const height = ROWS * LINE_H + PAD * 2
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="MyDy LMS Helper terminal UI">`,
    `<style>text{font-family:ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;font-size:14px;white-space:pre}</style>`,
    `<rect width="${width}" height="${height}" rx="12" fill="${color.bg}"/>`,
  ]
  frame.lines.forEach((line, row) => {
    let col = 0
    const y = PAD + row * LINE_H
    for (const span of line.spans) {
      const cells = span.width
      const x = PAD + col * CELL_W
      const bg = hex(span.bg as Rgba)
      if (bg !== color.bg && bg !== "#000000") out.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${(cells * CELL_W).toFixed(1)}" height="${LINE_H}" fill="${bg}"/>`)
      const fg = hex(span.fg as Rgba)
      const bold = span.attributes & 1 ? ` font-weight="700"` : ""
      // Split the span into plain-text runs and icon cells.
      let runStart = 0
      let run = ""
      const flush = (at: number) => {
        if (run.trim()) {
          const rx = PAD + (col + runStart) * CELL_W
          out.push(`<text x="${rx.toFixed(1)}" y="${y + 14}" fill="${fg}"${bold} textLength="${([...run].length * CELL_W).toFixed(1)}" lengthAdjust="spacing" xml:space="preserve">${escape(run)}</text>`)
        }
        run = ""
        runStart = at
      }
      ;[...span.text].forEach((ch, i) => {
        const path = ICON_PATHS.get(ch)
        if (!path) {
          if (!run) runStart = i
          run += ch
          return
        }
        flush(i + 1)
        const ix = PAD + (col + i) * CELL_W - 1
        out.push(`<path d="${path}" fill="${fg}" transform="translate(${ix.toFixed(1)} ${(y + 2).toFixed(1)}) scale(${(ICON_PX / 24).toFixed(4)})"/>`)
      })
      flush(0)
      col += cells
    }
  })
  out.push("</svg>")
  const path = join(import.meta.dir, "..", "..", "docs", "assets", `${name}.svg`)
  await Bun.write(path, out.join("\n") + "\n")
  t.renderer.destroy()
  console.log(`wrote ${path}`)
}

await shot("tui-dashboard", demoStore())
const assignments = demoStore()
assignments.actions.setFocus("detail")
assignments.actions.setTab("assignments")
await shot("tui-assignments", assignments)
process.exit(0)
