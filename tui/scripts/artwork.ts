// Writes docs/assets/banner.svg and docs/assets/how-it-works.svg in the TUI's look:
// the same monospace font, brand colours, and Material Design icons (the icons Nerd Fonts' nf-md-* glyphs are).
// Run: bun run --cwd tui artwork
import * as mdi from "@mdi/js"
import { join } from "node:path"
import { color } from "../src/theme"

const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
/** Advance width of one monospace character at `size` px (SF Mono / Menlo: 0.6em). */
const cw = (size: number) => size * 0.6

const icon = (path: string, x: number, y: number, size: number, fill: string) =>
  `<path d="${path}" fill="${fill}" transform="translate(${x} ${y}) scale(${(size / 24).toFixed(4)})"/>`

function text(x: number, y: number, size: number, fill: string, value: string, opts: { bold?: boolean; anchor?: "end" | "middle" } = {}) {
  const weight = opts.bold ? ` font-weight="700"` : ""
  const anchor = opts.anchor ? ` text-anchor="${opts.anchor}"` : ""
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${weight}${anchor} xml:space="preserve">${esc(value)}</text>`
}

/** Key hints like the TUI footer: keys in accent, labels muted, positioned by character count. */
function keyHints(x: number, y: number, size: number, hints: Array<[string, string]>): string {
  const out: string[] = []
  let at = x
  for (const [key, label] of hints) {
    out.push(text(at, y, size, color.accent, key))
    at += [...key].length * cw(size)
    out.push(text(at, y, size, color.muted, ` ${label}`))
    at += (label.length + 4) * cw(size)
  }
  return out.join("\n  ")
}

const svg = (width: number, height: number, title: string, desc: string, body: string[]) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title>
  <desc id="desc">${esc(desc)}</desc>
  <style>text { font-family: ${MONO}; }</style>
  <rect width="${width}" height="${height}" rx="16" fill="${color.bg}"/>
  ${body.join("\n  ")}
</svg>
`

/** Logo "cap prompt": a shell chevron, the graduation cap, and an underscore cursor. 64x64 design grid. */
function logoMarkup(x: number, y: number, size: number, outline = false): string {
  const k = size / 64
  return `<g transform="translate(${x} ${y}) scale(${k.toFixed(4)})">
    <rect width="64" height="64" rx="14" fill="${color.panel}"${outline ? ` stroke="${color.line}" stroke-width="${(1 / k).toFixed(2)}"` : ""}/>
    <polyline points="11,23 20,32 11,41" fill="none" stroke="${color.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    ${icon(mdi.mdiSchool, 25, 13, 32.4, color.strong)}
    <rect x="27" y="47" width="27" height="4" rx="2" fill="${color.accent}"/>
  </g>`
}

function logo(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" role="img" aria-label="MyDy LMS Helper logo">
  ${logoMarkup(0, 0, 64)}
</svg>
`
}

function banner(): string {
  const body: string[] = []

  // Mark and title
  body.push(logoMarkup(64, 60, 64, true))
  body.push(text(62, 196, 60, color.strong, "MyDy LMS Helper", { bold: true }))
  body.push(text(64, 238, 18, color.muted, "Attendance, grades, assignments and course files"))
  body.push(text(64, 264, 18, color.muted, "from the MyDy portal, without the clicking around."))

  // Component chips
  let chipX = 64
  for (const [path, label] of [[mdi.mdiConsole, "Terminal UI"], [mdi.mdiRobotOutline, "MCP server"], [mdi.mdiGoogleChrome, "Chrome extension"]] as const) {
    const w = Math.ceil(14 + 16 + 8 + label.length * cw(14) + 14)
    body.push(`<rect x="${chipX}" y="298" width="${w}" height="34" rx="17" fill="none" stroke="${color.line}"/>`)
    body.push(icon(path, chipX + 14, 307, 16, color.muted))
    body.push(text(chipX + 38, 320, 14, color.text, label))
    chipX += w + 10
  }

  // Terminal panel: the TUI's course list
  const px = 660
  const pw = 556
  body.push(`<rect x="${px}" y="44" width="${pw}" height="292" rx="12" fill="${color.panel}"/>`)
  body.push(`<path d="M${px + 12},44 H${px + pw - 12} A12,12 0 0 1 ${px + pw},56 V80 H${px} V56 A12,12 0 0 1 ${px + 12},44 Z" fill="${color.bar}"/>`)
  body.push(icon(mdi.mdiSchool, px + 16, 54, 16, color.accent))
  body.push(text(px + 42, 67, 14, color.strong, "MyDy", { bold: true }))
  const synced = "synced 2 min ago"
  body.push(icon(mdi.mdiRefresh, px + pw - 16 - synced.length * cw(12) - 20, 55, 14, color.muted))
  body.push(text(px + pw - 16, 67, 12, color.muted, synced, { anchor: "end" }))

  const rows: Array<[string, number, "ok" | "warn" | "low", string]> = [
    ["Data Structures", 88, "ok", "miss 8"],
    ["Operating Systems", 81, "ok", "miss 4"],
    ["Computer Networks", 72, "warn", "need 6"],
    ["Engineering Maths", 46, "low", "need 47"],
    ["Software Engg.", 93, "ok", "miss 12"],
  ]
  const barX = px + 220
  const barW = 168
  rows.forEach(([name, pct, status, advice], i) => {
    const yc = 112 + i * 40
    const selected = i === 0
    const ink = selected ? color.onAccent : color.text
    if (selected) body.push(`<rect x="${px + 12}" y="${yc - 16}" width="${pw - 24}" height="32" rx="6" fill="${color.accent}"/>`)
    body.push(icon(mdi.mdiCheckboxBlankOutline, px + 24, yc - 8, 16, selected ? color.onAccent : color.muted))
    body.push(text(px + 50, yc + 5, 14, ink, name, { bold: selected }))
    body.push(`<rect x="${barX}" y="${yc - 5}" width="${barW}" height="10" rx="3" fill="${selected ? color.onAccentMuted : color.line}"/>`)
    body.push(`<rect x="${barX}" y="${yc - 5}" width="${Math.round((barW * pct) / 100)}" height="10" rx="3" fill="${selected ? color.onAccent : color[status]}"/>`)
    const notch = barX + barW * 0.75
    body.push(`<line x1="${notch}" y1="${yc - 9}" x2="${notch}" y2="${yc + 9}" stroke="${selected ? color.onAccent : color.text}" stroke-width="1.5"/>`)
    body.push(text(px + 450, yc + 5, 14, selected ? color.onAccent : color[status], `${pct}%`, { anchor: "end" }))
    body.push(text(px + pw - 24, yc + 5, 14, selected ? color.onAccentMuted : color.muted, advice, { anchor: "end" }))
  })

  body.push(`<path d="M${px},306 H${px + pw} V324 A12,12 0 0 1 ${px + pw - 12},336 H${px + 12} A12,12 0 0 1 ${px},324 Z" fill="${color.bar}"/>`)
  body.push(keyHints(px + 24, 326, 12, [["↑↓", "move"], ["space", "mark"], ["d", "download"], ["?", "help"]]))

  return svg(1280, 380, "MyDy LMS Helper", "Attendance, grades, assignments and course files from the MyDy portal, shown as the terminal UI's course list with an attendance bar per course.", body)
}

function howItWorks(): string {
  const body: string[] = []
  body.push(`<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${color.muted}"/></marker></defs>`)
  body.push(text(48, 64, 22, color.strong, "How each part talks to MyDy", { bold: true }))

  const sources: Array<[string, string, string, string, number]> = [
    [mdi.mdiConsole, "Terminal UI", "tui/ (OpenTUI) + core/", "Keyboard-first dashboard and downloader", 104],
    [mdi.mdiRobotOutline, "MCP server", "mcp/mcp_server.py", "Lets AI assistants read your courses", 224],
    [mdi.mdiGoogleChrome, "Chrome extension", "extension/js/content.js", "Saves files with chrome.downloads", 344],
  ]
  for (const [path, title, code, desc, y] of sources) {
    body.push(`<rect x="48" y="${y}" width="380" height="100" rx="10" fill="${color.panel}" stroke="${color.line}"/>`)
    body.push(icon(path, 72, y + 21, 20, color.accent))
    body.push(text(102, y + 38, 18, color.strong, title, { bold: true }))
    body.push(text(72, y + 64, 14, color.text, code))
    body.push(text(72, y + 87, 13, color.muted, desc))
  }

  body.push(`<g fill="none" stroke="${color.muted}" stroke-width="2" marker-end="url(#arrow)">`)
  body.push(`  <path d="M428 154 C 640 154, 660 226, 866 226"/>`)
  body.push(`  <path d="M428 274 C 640 274, 660 260, 866 260"/>`)
  body.push(`  <path d="M428 394 C 640 394, 660 294, 866 294" stroke-dasharray="6 5"/>`)
  body.push(`</g>`)
  body.push(`<g stroke="${color.bg}" stroke-width="6" paint-order="stroke">`)
  body.push(text(446, 142, 13, color.text, "core/: own login, HTTP + HTML parsing"))
  body.push(text(446, 300, 13, color.text, "own login, HTTP + HTML parsing (Python)"))
  body.push(text(446, 420, 13, color.text, "reuses your logged-in browser tab"))
  body.push(`</g>`)

  body.push(`<rect x="872" y="176" width="360" height="168" rx="10" fill="${color.panel}" stroke="${color.accent}" stroke-width="2"/>`)
  body.push(icon(mdi.mdiSchool, 896, 194, 20, color.accent))
  body.push(text(926, 211, 18, color.strong, "MyDy (Moodle)", { bold: true }))
  body.push(text(896, 240, 14, color.accent, "mydy.dypatil.edu/rait"))
  body.push(text(896, 272, 13, color.text, "Courses, attendance, assignments,"))
  body.push(text(896, 294, 13, color.text, "grades, announcements and"))
  body.push(text(896, 316, 13, color.text, "course files"))

  return svg(1280, 480, "How each part talks to MyDy", "The terminal UI and the MCP server log in with your credentials and parse MyDy's HTML over HTTP. The Chrome extension reuses your logged-in browser tab.", body)
}

const dir = join(import.meta.dir, "..", "..", "docs", "assets")
await Bun.write(join(dir, "banner.svg"), banner())
await Bun.write(join(dir, "how-it-works.svg"), howItWorks())
await Bun.write(join(dir, "logo.svg"), logo())
console.log(["banner.svg", "how-it-works.svg", "logo.svg"].map((f) => `wrote ${join(dir, f)}`).join("\n"))
