/** Blends `a` over `b`: amount 1 is all `a`, 0 is all `b`. Both are "#RRGGBB". */
export function mix(a: string, b: string, amount: number): string {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return "#" + [0, 1, 2].map((i) => Math.round(ch(a, i) * amount + ch(b, i) * (1 - amount)).toString(16).padStart(2, "0")).join("").toUpperCase()
}

// Surfaces, darkest to lightest. Depth reads as "further forward = lighter".
const bar = "#08090A" // header and footer bands
const bg = "#0D0E10" // the app background
const panel = "#131518" // sidebar and panes
const raised = "#1A1D21" // cards, tiles, inputs
const overlay = "#21252A" // popovers, help, toasts

const accent = "#FF6500"
const ok = "#6FCF97"
const warn = "#F2C94C"
// Rose rather than red: a red sits too close to the orange accent to tell apart (checked in OKLab).
const low = "#FF4F9A"

export const color = {
  bar, bg, panel, raised, overlay,
  /** Kept for older call sites: the tinted band behind strips and totals. */
  strip: raised,

  // Lines
  line: "#31363D",
  lineStrong: "#4A515A",

  // Ink ladder: strong (headings) > text (body) > muted (secondary) > faint (labels, hints)
  strong: "#F5F6F7",
  text: "#D2D6DB",
  muted: "#8B929A",
  faint: "#5C636B",

  accent,
  /** Accent tint for selected rows and active tabs: readable text on top, unlike a full fill. */
  accentSoft: mix(accent, panel, 0.16),
  accentLine: mix(accent, panel, 0.45),
  onAccent: bar,
  onAccentMuted: "#5A2A00",

  ok, warn, low,
  /** Meter tracks: a dark step of the fill's own hue, so the whole bar reads as one state. */
  okTrack: mix(ok, panel, 0.18),
  warnTrack: mix(warn, panel, 0.18),
  lowTrack: mix(low, panel, 0.2),
  okSoft: mix(ok, panel, 0.12),
  warnSoft: mix(warn, panel, 0.12),
  lowSoft: mix(low, panel, 0.14),
} as const

export type Status = "ok" | "warn" | "low"

export function ratioStatus(ratio: number, threshold = 0.75): Status {
  return ratio >= threshold ? "ok" : ratio >= 0.5 ? "warn" : "low"
}

export const track: Record<Status, string> = { ok: color.okTrack, warn: color.warnTrack, low: color.lowTrack }
export const soft: Record<Status, string> = { ok: color.okSoft, warn: color.warnSoft, low: color.lowSoft }
