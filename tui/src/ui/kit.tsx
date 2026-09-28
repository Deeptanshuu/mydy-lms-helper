// The design kit: a type ladder and a handful of components every screen is built from.
//
//   H1  Display   ASCII "tiny" font, 2 rows tall: the wordmark.
//       Figure    big pixel numerals, 3 rows tall: hero numbers in stat tiles and dashboards.
//   H2  Title     bold, strong ink, optional accent bar. Page and course titles.
//   H3  Eyebrow   UPPERCASE, bold, muted, trailed by a hairline rule and an optional count. Section labels.
//   P   Body      text ink.
//       Caption   muted ink. The secondary fact under a title or a value.
//       Hint      faint ink. Key hints, placeholders, units.
//
// Rhythm: one blank row between a heading and its content, two between sections. Panels pad 2 cells
// left and right, 1 row top and bottom. Colour is for state (ok / warn / low) and the one accent.
import { measureText } from "@opentui/core"
import { Show, type JSX } from "solid-js"
import { BIG_ROWS, bigText, bigTextWidth } from "../bigtext"
import { fit } from "../format"
import { CAP_LEFT, CAP_RIGHT, slot, type IconName } from "../icons"
import { color, track, type Status } from "../theme"
import { Line, type MouseProps, type Seg } from "./Line"

export type Tone = Status | "accent" | "neutral"

export function toneColor(tone: Tone): string {
  return tone === "neutral" ? color.muted : color[tone]
}
function toneTrack(tone: Tone): string {
  return tone === "accent" ? color.accentSoft : tone === "neutral" ? color.line : track[tone]
}

const len = (s: string) => [...s].length

// ── Type ladder ────────────────────────────────────────────────────────────────────────────────

export type DisplayFont = "tiny" | "block" | "slick"

/** Characters the ASCII fonts can draw; anything else is dropped rather than rendered as a gap. */
const DRAWABLE = /[0-9A-Z!?.+\-_=@#$%&()/:;,'" ]/

export function displayText(text: string): string {
  return [...text.toUpperCase()].filter((ch) => DRAWABLE.test(ch)).join("")
}

/** Cells wide and rows tall that `text` takes in an ASCII font. */
export function displaySize(text: string, font: DisplayFont = "tiny"): { width: number; height: number } {
  const t = displayText(text)
  return t ? measureText({ text: t, font }) : { width: 0, height: font === "tiny" ? 2 : 6 }
}

/** H1: big ASCII lettering. `tiny` is 2 rows tall, `block` and `slick` are 6. */
export function Display(props: { text: string; color?: string | string[]; bg?: string; font?: DisplayFont }) {
  return (
    <ascii_font
      text={displayText(props.text)}
      font={props.font ?? "tiny"}
      color={props.color ?? color.strong}
      backgroundColor={props.bg ?? "transparent"}
      selectable={false}
      flexShrink={0}
    />
  )
}

/** H1 for numbers: `text` in the big pixel numerals (digits and % / - + . : only), 3 rows tall. */
export function Figure(props: { text: string; color?: string; bg?: string; unit?: string; unitColor?: string } & MouseProps) {
  const rows = () => bigText(props.text)
  return (
    <box flexDirection="column" height={BIG_ROWS} flexShrink={0} backgroundColor={props.bg} onMouseDown={props.onMouseDown}>
      <Line segs={[{ text: rows()[0], fg: props.color ?? color.strong }]} />
      <Line segs={[{ text: rows()[1], fg: props.color ?? color.strong }]} />
      <Line segs={[{ text: rows()[2], fg: props.color ?? color.strong }, { text: props.unit ? ` ${props.unit}` : "", fg: props.unitColor ?? color.muted }]} />
    </box>
  )
}

export function figureWidth(text: string, unit?: string): number {
  return bigTextWidth(text) + (unit ? len(unit) + 1 : 0)
}

/** H2: a bold title in strong ink, with an optional accent bar and icon in front. */
export function Title(props: { text: string; width: number; icon?: IconName; nerd?: boolean; bar?: boolean; color?: string; bg?: string } & MouseProps) {
  const lead = () => (props.bar ? "▍ " : "") + (props.icon && props.nerd !== undefined ? slot(props.icon, props.nerd) : "")
  return (
    <Line
      bg={props.bg}
      onMouseDown={props.onMouseDown}
      segs={[
        { text: lead(), fg: color.accent },
        { text: fit(props.text, Math.max(1, props.width - len(lead()))).trimEnd(), fg: props.color ?? color.strong, bold: true },
      ]}
    />
  )
}

/**
 * H3: "SECTION  4". Uppercase label in muted ink with a faint count. Quiet by default: pass
 * `rule: true` for a hairline to `width` (use at most one ruled heading per pane).
 */
export function eyebrowSegs(text: string, width: number, opts: { count?: string | number; tone?: string; icon?: string; rule?: boolean } = {}): Seg[] {
  const label = text.toUpperCase()
  const icon = opts.icon ?? ""
  const count = opts.count === undefined || opts.count === "" ? "" : String(opts.count)
  if (!opts.rule) {
    return [
      { text: icon, fg: opts.tone ?? color.muted },
      { text: fit(label, Math.max(1, width - len(icon) - (count ? len(count) + 2 : 0))).trimEnd(), fg: opts.tone ?? color.muted },
      { text: count ? `  ${count}` : "", fg: color.faint },
    ]
  }
  // Exactly `width` cells: label, a space, the rule, then (with a count) a space and the count.
  const used = len(icon) + len(label) + (count ? len(count) + 1 : 0)
  return [
    { text: icon, fg: opts.tone ?? color.muted },
    { text: label, fg: opts.tone ?? color.muted },
    { text: " " + "─".repeat(Math.max(0, width - used - 1)) + (count ? " " : ""), fg: color.line },
    { text: count, fg: color.faint },
  ]
}

export function Eyebrow(props: { text: string; width: number; count?: string | number; tone?: string; icon?: string; rule?: boolean; bg?: string } & MouseProps) {
  return <Line bg={props.bg} onMouseDown={props.onMouseDown} segs={eyebrowSegs(props.text, props.width, props)} />
}

export function Body(props: { text: string; width?: number; bg?: string }) {
  return <Line bg={props.bg} segs={[{ text: props.width ? fit(props.text, props.width).trimEnd() : props.text, fg: color.text }]} />
}

export function Caption(props: { text: string; width?: number; bg?: string; faint?: boolean }) {
  return <Line bg={props.bg} segs={[{ text: props.width ? fit(props.text, props.width).trimEnd() : props.text, fg: props.faint ? color.faint : color.muted }]} />
}

// ── Space and lines ────────────────────────────────────────────────────────────────────────────

/** Vertical whitespace, in rows. */
export function Gap(props: { rows?: number; bg?: string }) {
  return <box height={props.rows ?? 1} flexShrink={0} backgroundColor={props.bg} />
}

/** A horizontal rule `width` cells wide. */
export function Rule(props: { width: number; char?: string; color?: string; bg?: string }) {
  return <Line bg={props.bg} segs={[{ text: (props.char ?? "─").repeat(Math.max(0, props.width)), fg: props.color ?? color.line }]} />
}

// ── Containers ─────────────────────────────────────────────────────────────────────────────────

/**
 * A rounded, bordered panel with its title set into the top border: ╭─ Title ───╮.
 * Content gets 2 cells of padding either side. `focused` lights the border in the accent.
 */
export function Card(props: {
  title?: string
  width?: number | "auto" | `${number}%`
  height?: number | "auto" | `${number}%`
  flexGrow?: number
  focused?: boolean
  borderColor?: string
  titleColor?: string
  bg?: string
  paddingX?: number
  paddingY?: number
  children?: JSX.Element
} & MouseProps) {
  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={props.borderColor ?? (props.focused ? color.accentLine : color.line)}
      title={props.title ? ` ${props.title} ` : undefined}
      titleColor={props.titleColor ?? (props.focused ? color.accent : color.muted)}
      titleAlignment="left"
      backgroundColor={props.bg ?? color.panel}
      paddingLeft={props.paddingX ?? 2}
      paddingRight={props.paddingX ?? 2}
      paddingTop={props.paddingY ?? 0}
      paddingBottom={props.paddingY ?? 0}
      width={props.width}
      height={props.height}
      flexGrow={props.flexGrow}
      flexShrink={0}
      onMouseDown={props.onMouseDown}
      onMouseScroll={props.onMouseScroll}
    >
      {props.children}
    </box>
  )
}

// ── Data marks ─────────────────────────────────────────────────────────────────────────────────

const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"]

/**
 * A meter `width` cells wide. The track is a dark step of the fill's own hue so the whole bar reads
 * as one state. `threshold` draws a tick where the requirement sits.
 *   block: full-height cells with 1/8-cell precision.  line: a thin ━ rule with 1/2-cell precision.
 */
export function meterSegs(opts: { ratio: number; width: number; tone: Tone; threshold?: number; style?: "block" | "line"; bg?: string }): Seg[] {
  const w = Math.max(1, Math.floor(opts.width))
  const r = Math.max(0, Math.min(1, Number.isFinite(opts.ratio) ? opts.ratio : 0))
  const fill = toneColor(opts.tone)
  const tr = toneTrack(opts.tone)
  const notch = opts.threshold === undefined ? -1 : Math.min(w - 1, Math.max(0, Math.round(opts.threshold * w)))
  const cells: Seg[] = []
  if ((opts.style ?? "block") === "line") {
    const halves = Math.round(r * w * 2)
    for (let i = 0; i < w; i++) {
      const filled = halves >= (i + 1) * 2 ? 2 : halves - i * 2 === 1 ? 1 : 0
      if (i === notch && filled < 2) cells.push({ text: "┃", fg: color.muted, bg: opts.bg })
      else if (filled === 2) cells.push({ text: "━", fg: fill, bg: opts.bg })
      else if (filled === 1) cells.push({ text: "╸", fg: fill, bg: opts.bg })
      else cells.push({ text: "━", fg: tr, bg: opts.bg })
    }
  } else {
    const eighths = Math.round(r * w * 8)
    for (let i = 0; i < w; i++) {
      const n = Math.max(0, Math.min(8, eighths - i * 8))
      if (i === notch && n < 8) cells.push({ text: n >= 4 ? "▐" : "▕", fg: color.strong, bg: n >= 4 ? fill : tr })
      else if (n === 8) cells.push({ text: "█", fg: fill })
      else if (n > 0) cells.push({ text: EIGHTHS[n]!, fg: fill, bg: tr })
      else cells.push({ text: " ", bg: tr })
    }
  }
  // Merge runs that share colours so a line has few spans.
  const out: Seg[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.fg === c.fg && last.bg === c.bg) last.text += c.text
    else out.push({ ...c })
  }
  return out
}

export function Meter(props: { ratio: number; width: number; tone: Tone; threshold?: number; style?: "block" | "line"; bg?: string }) {
  return <Line bg={props.bg} segs={meterSegs(props)} />
}

/** Unicode sparkline for a series of values (▁▂▃▄▅▆▇█), scaled to [min, max]. */
export function sparkline(values: number[], min = Math.min(...values), max = Math.max(...values)): string {
  const bars = "▁▂▃▄▅▆▇█"
  const span = max - min || 1
  return values.map((v) => bars[Math.max(0, Math.min(7, Math.round(((v - min) / span) * 7)))]!).join("")
}

// ── Pills and keys ─────────────────────────────────────────────────────────────────────────────

/**
 * A pill: text on a tinted background with rounded ends (Powerline half circles) when a Nerd Font is
 * available, half-block ends (▐ ▌, in every monospace font) otherwise. `on` is the surface the pill
 * sits on. Width: text + 2 either way.
 */
export function pillSegs(text: string, opts: { bg: string; fg: string; on?: string; nerd: boolean; bold?: boolean }): Seg[] {
  return [
    { text: opts.nerd ? CAP_LEFT : "▐", fg: opts.bg, bg: opts.on },
    { text, fg: opts.fg, bg: opts.bg, bold: opts.bold },
    { text: opts.nerd ? CAP_RIGHT : "▌", fg: opts.bg, bg: opts.on },
  ]
}

export function pillWidth(text: string): number {
  return len(text) + 2
}

/** A status pill: tinted background in the tone's hue, text in the tone. */
export function statusPill(text: string, tone: Tone, nerd: boolean, on?: string): Seg[] {
  const bg = tone === "accent" ? color.accentSoft : tone === "neutral" ? color.raised : track[tone]
  return pillSegs(text, { bg, fg: toneColor(tone), on, nerd, bold: true })
}

/** A key hint: the key in body ink, its label faint. Deliberately plain: a row of keycaps is loud. */
export function keySegs(key: string, label: string, _nerd?: boolean, _on?: string): Seg[] {
  return [{ text: key, fg: color.text, bold: true }, { text: ` ${label}`, fg: color.faint }]
}

export function keyWidth(key: string, label: string): number {
  return len(key) + 1 + len(label)
}

// ── Stat tile ──────────────────────────────────────────────────────────────────────────────────

/** Rows a StatTile takes, border included: 8, or 6 when compact (no meter, no breathing row). */
export function statTileHeight(compact = false): number {
  return compact ? 6 : 8
}

/**
 * A KPI card: label set in the border, the value as a big Figure with its unit on the baseline, then a
 * meter and a caption. The value stays in strong ink; the meter and the caption tone carry the state.
 * Values the numeral face can't draw (or that don't fit) fall back to bold text.
 */
export function StatTile(props: {
  label: string
  value: string
  unit?: string
  caption?: string
  captionTone?: Tone
  tone?: Tone
  meter?: { ratio: number; threshold?: number }
  width: number
  compact?: boolean
  focused?: boolean
  bg?: string
} & MouseProps) {
  const inner = () => Math.max(4, props.width - 6)
  const bg = () => props.bg ?? color.panel
  const drawable = () => /^[0-9%/\-+.: ]+$/.test(props.value)
  const fits = () => drawable() && figureWidth(props.value, props.unit) <= inner()
  return (
    <Card title={props.label} width={props.width} height={statTileHeight(props.compact)} focused={props.focused} bg={bg()} onMouseDown={props.onMouseDown}>
      <Show
        when={fits()}
        fallback={
          <>
            <Gap rows={props.compact ? 1 : 2} />
            <Line segs={[{ text: fit(props.value, inner()).trimEnd(), fg: color.strong, bold: true }, { text: props.unit ? ` ${props.unit}` : "", fg: color.muted }]} />
            <Gap />
          </>
        }
      >
        <Show when={!props.compact}>
          <Gap />
        </Show>
        <Figure text={props.value} unit={props.unit} bg={bg()} />
      </Show>
      <Show when={!props.compact}>
        <Show when={props.meter} fallback={<Gap />}>
          {(m) => <Meter ratio={m().ratio} width={inner()} tone={props.tone ?? "accent"} threshold={m().threshold} style="line" bg={bg()} />}
        </Show>
      </Show>
      <Line segs={[{ text: fit(props.caption ?? "", inner()).trimEnd(), fg: props.captionTone ? toneColor(props.captionTone) : color.muted }]} />
    </Card>
  )
}

/** Lays out `count` equal tiles in `width` cells with `gap` cells between them. */
export function tileWidths(width: number, count: number, gap = 2): number[] {
  const each = Math.floor((width - gap * (count - 1)) / count)
  const extra = width - gap * (count - 1) - each * count
  return Array.from({ length: count }, (_, i) => each + (i < extra ? 1 : 0))
}

