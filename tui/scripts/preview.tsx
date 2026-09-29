// Renders the TUI with demo data in several states and writes one HTML page per scene, drawn cell
// by cell, so a redesign can be checked by eye (screenshot the pages with any headless browser).
// Nerd Font icons are drawn as their Material Design Icons paths (nf-md-* glyphs are MDI icons).
// Run: bun run --cwd tui preview [outDir]
import * as mdi from "@mdi/js"
import { MDI_FILE, MDI_NAME } from "./mdi"
import { testRender } from "@opentui/solid"
import { mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { DEMO_NOW, DEMO_POSTS, demoStore } from "../src/demo"
import { CAP_LEFT, CAP_RIGHT, fileSlot, glyph, type FileKind, type IconName } from "../src/icons"
import { createAppStore, type AppStore } from "../src/state"
import { color } from "../src/theme"
import type { JSX } from "solid-js"
import { App } from "../src/ui/App"
import { KitSheet } from "./kit-sheet"
import { DitherBand, DitherLevels, DitherMotion, DitherSignin } from "./dither-scenes"
import { AppProvider, type Services } from "../src/ui/context"

const outDir = resolve(process.argv[2] ?? join(import.meta.dir, "..", "preview"))
mkdirSync(outDir, { recursive: true })

const noop = () => undefined
const services: Services = {
  refresh: noop, loadTab: noop, openAnnouncement: noop, startDownload: noop,
  cancelDownload: noop, signIn: noop, open: noop, quit: noop,
}

type Rgba = { buffer: ArrayLike<number> }
const hex = (c: Rgba) =>
  "#" + [0, 1, 2].map((i) => Math.round(Number(c.buffer[i]) * (Number(c.buffer[i]) <= 1 ? 255 : 1)).toString(16).padStart(2, "0")).join("")


// Every nf-md glyph the UI uses, mapped to its MDI path. Icons added later resolve through the
// icon table automatically as long as MDI_NAME has an entry for them.
function iconPaths(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [name, key] of Object.entries(MDI_NAME)) {
    const g = glyph(name as IconName, true)
    const path = key ? (mdi[key] as string | undefined) : undefined
    if (g && path) map.set(g, path)
  }
  for (const [kind, key] of Object.entries(MDI_FILE)) map.set([...fileSlot(kind as FileKind, true)][0]!, mdi[key] as string)
  return map
}
const ICONS = iconPaths()
// MYDY_PREVIEW_FONT=/path/to/a Nerd Font .ttf renders with that font (icons and pill caps drawn by it, as in a
// terminal). Without it, DejaVu Sans Mono plus vector icons stand in. Line height = the font's cell height.
const FONT = process.env.MYDY_PREVIEW_FONT
const LINE = FONT ? 1.32 : 1.164
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function scene(name: string, store: AppStore, cols = 120, rows = 34, nerd = true, view: () => JSX.Element = () => <App />) {
  const t = await testRender(
    () => (
      <AppProvider value={{ store, nerd, threshold: 0.75, services, now: () => DEMO_NOW }}>
        {view()}
      </AppProvider>
    ),
    { width: cols, height: rows },
  )
  await t.renderOnce()
  await t.renderOnce()
  const frame = t.captureSpans()
  const lines = frame.lines.map((line) => {
    const cells = line.spans.map((span) => {
      const fg = hex(span.fg as Rgba)
      const bg = hex(span.bg as Rgba)
      const bold = span.attributes & 1 ? "font-weight:700;" : ""
      const dim = span.attributes & 2 ? "opacity:.6;" : ""
      const italic = span.attributes & 4 ? "font-style:italic;" : ""
      const underline = span.attributes & 8 ? "text-decoration:underline;" : ""
      const body = [...span.text]
        .map((ch) => {
          // Powerline half circles: a half disc filling the cell, in the foreground colour.
          if (FONT) return esc(ch)
          if (ch === CAP_LEFT) return `<i class="cap"><svg viewBox="0 0 10 20" preserveAspectRatio="none"><path d="M10 0A10 10 0 0 0 10 20Z" fill="${fg}"/></svg></i>`
          if (ch === CAP_RIGHT) return `<i class="cap"><svg viewBox="0 0 10 20" preserveAspectRatio="none"><path d="M0 0A10 10 0 0 1 0 20Z" fill="${fg}"/></svg></i>`
          const path = ICONS.get(ch)
          return path
            ? `<i class="ic"><svg viewBox="0 0 24 24"><path d="${path}" fill="${fg}"/></svg></i>`
            : esc(ch)
        })
        .join("")
      return `<span style="color:${fg};background:${bg};${bold}${dim}${italic}${underline}width:${span.width}ch">${body}</span>`
    })
    return `<div class="l">${cells.join("")}</div>`
  })
  const html = `<!doctype html><meta charset="utf-8"><title>${name}</title><style>
body{margin:0;background:#000;display:inline-block}
${FONT ? `@font-face{font-family:Term;src:url("file://${FONT}")}` : ""}
.t{font:15px/${LINE} ${FONT ? "Term," : ""}'DejaVu Sans Mono',monospace;background:${color.bg};padding:14px;display:inline-block}
.l{white-space:pre;height:${LINE}em;display:flex}
.l span{display:inline-block;overflow:visible;flex:none}
.ic{display:inline-block;width:1ch;height:1.164em;position:relative;vertical-align:top}
.ic svg{position:absolute;left:-.05em;top:.12em;width:1.05em;height:1.05em}
.cap{display:inline-block;width:1ch;height:1.164em;vertical-align:top}
.cap svg{width:100%;height:100%;display:block}
</style><div class="t">${lines.join("\n")}</div>`
  await Bun.write(join(outDir, `${name}.html`), html)
  t.renderer.destroy()
  console.log(`${name}.html  ${cols}x${rows}`)
}

const s = () => demoStore()

await scene("00-kit", s(), 120, 40, true, () => <KitSheet />)

await scene("01-overview", s())

{
  const st = s()
  st.actions.setFocus("detail")
  await scene("02-files", st)
}
{
  const st = s()
  st.actions.setFocus("detail")
  st.actions.setTab("assignments")
  await scene("03-assignments", st)
}
{
  const st = s()
  st.actions.setFocus("detail")
  st.actions.setTab("grades")
  await scene("04-grades", st)
}
{
  const st = s()
  st.actions.setFocus("detail")
  st.actions.setTab("announcements")
  const a = st.state.courses["812"]!.announcements![0]!
  st.actions.setReading({ ...a, content: DEMO_POSTS[a.title] ?? null })
  await scene("05-announcement", st)
}
{
  const st = s()
  st.actions.setOverlay("help")
  await scene("06-help", st)
}
{
  const st = s()
  st.actions.toggleMark("812")
  st.actions.toggleMark("815")
  st.actions.setDownload({
    active: true, visible: true, courses: 2, total: 23, done: 14, bytes: 13_002_342, skipped: 3, failed: 0,
    current: "Unit 2: Stacks and Queues / Stack applications.pdf", folder: "~/Downloads/MyDy", message: null,
  })
  await scene("07-download", st)
}
await scene("08-narrow", s(), 90, 30)
await scene("09-wide", s(), 170, 46)
{
  const st = createAppStore()
  st.actions.setPhase("signin")
  await scene("10-signin", st)
}
{
  const st = s()
  st.actions.setFiltering(true)
  st.actions.setFilter("data")
  await scene("11-filter", st)
}
await scene("12-no-nerd-font", s(), 120, 34, false)
{
  const st = s()
  st.actions.select("811")
  await scene("13-low-attendance", st)
}
// Chrome scenes: toast, offline, syncing, sign-in error, tiny terminal.
{
  const st = s()
  st.actions.setToast({ title: "Signed out of MyDy", detail: "Your password may have changed.", action: "signin" })
  await scene("14-toast", st)
}
{
  const st = s()
  st.actions.setSync({ status: "offline", message: "Can't reach mydy.dypatil.edu" })
  await scene("15-offline", st)
}
{
  const st = s()
  st.actions.setSync({ status: "syncing", message: "loading attendance" })
  await scene("16-syncing", st)
}
{
  const st = createAppStore()
  st.actions.setPhase("signin")
  st.actions.setSignIn("Wrong email or password.", false)
  await scene("17-signin-error", st, 90, 30)
}
{
  const st = s()
  st.actions.setOverlay("help")
  await scene("18-help-small", st, 80, 24)
}
await scene("19-small", s(), 80, 24)
// Sidebar scenes: Overview selected, previous semesters open, two marked, short terminals.
{
  const st = s()
  st.actions.select("nav:overview")
  await scene("20-side-overview-row", st)
}
{
  const st = s()
  st.actions.togglePrevious()
  await scene("21-side-previous", st)
}
{
  const st = s()
  st.actions.toggleMark("812")
  st.actions.toggleMark("815")
  await scene("22-side-marked", st)
}
await scene("23-side-short", s(), 120, 24)
{
  const st = s()
  st.actions.togglePrevious()
  st.actions.toggleMark("812")
  st.actions.select("530")
  await scene("24-side-scroll", st, 120, 24)
}
// Course pane scenes: narrow with the detail focused, short terminals, no attendance, loading, error, empty and reading states.
{
  const st = s()
  st.actions.setFocus("detail")
  await scene("d1-narrow-detail", st, 90, 30)
}
{
  const st = s()
  st.actions.setFocus("detail")
  await scene("d2-short", st, 120, 26)
}
{
  const st = s()
  st.actions.togglePrevious()
  st.actions.select("640")
  await scene("d3-no-attendance", st)
}
{
  const st = s()
  st.actions.select("820")
  st.actions.setTab("announcements")
  st.actions.setCourseData("820", "announcements", undefined as never)
  await scene("d4-loading", st)
}
{
  const st = s()
  st.actions.setTab("grades")
  st.actions.setCourseData("812", "grades", undefined as never)
  st.actions.setError("812", "grades", "Can't reach MyDy. Press r to retry.")
  await scene("d5-error", st)
}
{
  const st = s()
  st.actions.setFocus("detail")
  st.actions.setTab("announcements")
  const a = st.state.courses["812"]!.announcements![1]!
  st.actions.setReading({ ...a, content: DEMO_POSTS[a.title] ?? null })
  await scene("d6-reading-small", st, 80, 24)
}
{
  const st = s()
  st.actions.togglePrevious()
  st.actions.select("group:previous")
  await scene("d7-previous-row", st)
}
{
  const st = s()
  st.actions.select("811")
  st.actions.setTab("assignments")
  await scene("d8-empty-tab", st)
}
{
  const st = s()
  st.actions.setFocus("detail")
  st.actions.setTab("assignments")
  await scene("d9-narrow-assignments", st, 90, 30)
}
{
  const st = s()
  st.actions.setFocus("detail")
  st.actions.setTab("grades")
  await scene("d10-small-grades", st, 80, 24)
}
{
  const st = s()
  st.actions.setFocus("detail")
  st.actions.setTab("announcements")
  const a = st.state.courses["812"]!.announcements![0]!
  st.actions.setReading({ ...a, content: DEMO_POSTS[a.title] ?? null })
  await scene("d11-reading-wide", st, 170, 46)
}
{
  const st = s()
  st.actions.select("811")
  st.actions.setFocus("detail")
  st.actions.setTab("grades")
  await scene("d12-low-grades", st, 120, 34, false)
}
// Overview (the dashboard): list focus, wide, narrow with detail focus, short without a Nerd Font, a selected deadline.
{
  const st = s()
  st.actions.select("nav:overview")
  await scene("ov1-overview", st)
  await scene("ov2-overview-wide", st, 170, 46)
  await scene("ov4-overview-short", st, 120, 26, false)
}
{
  const st = s()
  st.actions.select("nav:overview")
  st.actions.setFocus("detail")
  await scene("ov3-overview-narrow", st, 90, 30)
}
{
  const st = s()
  st.actions.select("nav:overview")
  st.actions.setDetail(1)
  await scene("ov5-overview-selected", st)
}
await scene("25-side-tiny", (() => { const st = s(); st.actions.togglePrevious(); st.actions.select("640"); return st })(), 100, 16)
await scene("14-dither-band", s(), 120, 9, true, () => <DitherBand />)
await scene("15-dither-signin", s(), 120, 34, true, () => <DitherSignin />)
await scene("16-dither-levels", s(), 120, 53, true, () => <DitherLevels />)
await scene("17-dither-motion", s(), 120, 44, true, () => <DitherMotion />)
{
  const st = s()
  st.actions.setToast({ title: "Login not saved", detail: "Your computer's keychain refused the password, so you'll be asked to sign in again next time you open MyDy.", action: null })
  st.actions.setDownload({
    active: false, visible: true, courses: 2, total: 23, done: 23, bytes: 25_002_342, skipped: 3, failed: 2,
    current: null, folder: "~/Downloads/MyDy", message: "Saved 18 files to ~/Downloads/MyDy, 2 couldn't be downloaded",
  })
  await scene("20-download-done", st, 100, 32)
}
{
  const st = s()
  st.actions.setCourseData("812", "content", [
    { number: 1, name: "Unit 1: Arrays and Linked Lists", activities: Array.from({ length: 9 }, (_, i) => ({ name: `Lecture ${i + 1} - Arrays.pdf`, type: "resource", url: `https://x/${i}` })) },
    { number: 2, name: "Unit 2: Stacks and Queues", activities: Array.from({ length: 9 }, (_, i) => ({ name: `Stacks and queues part ${i + 1}`, type: "presentation", url: `https://y/${i}` })) },
  ])
  st.actions.setFocus("detail")
  st.actions.setDetail(11)
  await scene("d13-overflow", st)
}
{
  const st = s()
  st.actions.setFocus("detail")
  st.actions.setTab("grades")
  await scene("d14-wide-grades", st, 170, 46)
}
{
  const st = s()
  st.actions.select("group:previous")
  await scene("26-side-group-selected", st)
}
await scene("d15-two-pane-min", s(), 100, 30)
await scene("d16-mid", s(), 110, 34)
process.exit(0)
