import { calendarDayDiff } from "@mydy/core/logic"
import { createEffect, createMemo, For, Match, on, Show, Switch, untrack, type JSX } from "solid-js"
import { assignmentGroups, assignmentStatus, courseMath, detailItems, dueLabel, dueSoonCount, fileKindOf, fileRows, pctLabel } from "../derive"
import { fit, fmtNumber, parseScore, windowStart, wrapText } from "../format"
import { fileSlot } from "../icons"
import { PREVIOUS_ROW, TABS, type CourseDataKey, type CourseEntry, type TabName } from "../state"
import { color, ratioStatus } from "../theme"
import { useApp } from "./context"
import { activateDetail } from "./keys"
import { Card, eyebrowSegs, Gap, meterSegs, StatTile, statTileHeight, tileWidths, Title, toneColor, type Tone } from "./kit"
import { Line, wheel, type Seg } from "./Line"

// The course page. Quiet by design: one hero (the attendance figure), colour only on meters and small
// dots, text in the ink ladder, and the accent reserved for the cursor and the active tab.

const len = (s: string) => [...s].length
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const DAY = 86_400_000

const TAB_META: Record<TabName, { label: string; key: CourseDataKey; empty: string }> = {
  files: { label: "Files", key: "content", empty: "No files in this course yet." },
  assignments: { label: "Assignments", key: "assignments", empty: "No assignments in this course." },
  grades: { label: "Grades", key: "grades", empty: "No grades yet." },
  announcements: { label: "Announcements", key: "announcements", empty: "No announcements yet." },
}

// ── Data ───────────────────────────────────────────────────────────────────────────────────────

/** How many rows each tab has, or undefined while its data isn't loaded (so nothing is claimed). */
function tabCount(e: CourseEntry, tab: TabName): number | undefined {
  switch (tab) {
    case "files":
      return e.content === undefined ? undefined : fileRows(e).filter((r) => r.kind === "file").length
    case "assignments":
      return e.assignments?.length
    case "grades":
      return e.grades?.items.length
    case "announcements":
      return e.announcements?.length
  }
}

/** The value of a KPI that has no number yet. */
const UNKNOWN = "—"

/**
 * One KPI. State colour is a small mark, never text: `tone` colours the meter, `dot` a `●` before the
 * caption. The words stay in muted ink.
 */
interface Kpi {
  value: string
  unit?: string
  caption: string
  /** A caption for one-row layouts, where "next:" costs more room than it is worth. */
  short?: string
  dot?: Tone
  tone: Tone
  meter?: { ratio: number; threshold?: number }
}

/** A KPI whose data isn't here yet: says why instead of claiming zero. */
function pending(e: CourseEntry, key: CourseDataKey): Kpi {
  return { value: UNKNOWN, caption: e.errors[key] ? "couldn't load" : e.loading[key] ? "loading…" : "not loaded yet", tone: "neutral" }
}

function attendanceKpi(e: CourseEntry, threshold: number): Kpi | null {
  const a = e.attendance
  const m = courseMath(e, threshold)
  if (!a || !m || m.percentage === null) return null
  const advice = m.status === "ok" ? `can miss ${m.canMiss} more` : `attend the next ${m.mustAttend}`
  return {
    value: pctLabel(m.percentage, m.status !== "ok", threshold),
    caption: `${a.present} of ${a.total}, ${advice}`,
    tone: m.status,
    meter: { ratio: m.percentage / 100, threshold },
  }
}

function dueKpi(e: CourseEntry, now: Date): Kpi {
  if (e.assignments === undefined) return pending(e, "assignments")
  const count = dueSoonCount(e, now)
  if (!count) return { value: "0", caption: "nothing due this week", dot: "ok", tone: "ok" }
  const t = now.getTime()
  const next = assignmentGroups(e).pending.find((a) => a.due && Math.abs(a.due.getTime() - t) <= 7 * DAY)!
  const overdue = next.due!.getTime() < t
  // Overdue or due today reads as urgent (rose); the rest of the week as a warning.
  const tone: Tone = overdue || calendarDayDiff(next.due!, now) === 0 ? "low" : "warn"
  return {
    value: String(count),
    unit: count === 1 ? "assignment" : "assignments",
    caption: `${overdue ? "overdue" : "next"}: ${dueLabel(next, now)}`,
    short: overdue ? `overdue, ${dueLabel(next, now)}` : dueLabel(next, now),
    dot: tone,
    tone,
  }
}

function gradeKpi(e: CourseEntry): Kpi {
  if (e.grades === undefined) return pending(e, "grades")
  const total = e.grades.total
  const score = total ? parseScore(total.grade, total.range) : null
  if (!score) return { value: UNKNOWN, caption: e.grades.items.length ? "no course total yet" : "not graded yet", tone: "neutral" }
  const ratio = clamp(score.value / score.max, 0, 1)
  return {
    value: fmtNumber(score.value),
    unit: `/ ${fmtNumber(score.max)}`,
    caption: `${Math.round(ratio * 100)}% course total`,
    tone: ratioStatus(ratio),
    meter: { ratio },
  }
}

// ── Layout ─────────────────────────────────────────────────────────────────────────────────────

/** Narrowest pane (cells inside the padding) that still fits KPI cards. */
const CARDS_MIN = 64
/** The hero tile's width: wide enough for "44 of 50, can miss 8 more", at most this on wide panes. */
const HERO_MIN = 34
const HERO_MAX = 46
const TAB_ROWS = 3
/** Rows of a small KPI card: border, value line, caption line. Compact: border and one line. */
const miniHeight = (compact: boolean) => (compact ? 3 : 4)

interface Plan {
  kpi: "cards" | "line" | "none"
  compact: boolean
  eyebrow: boolean
  caption: boolean
  /** Blank rows between the header, the KPIs and the tabs: 2 when there is room to spare, else 1. */
  gap: number
  /** Rows above the tab body, padding excluded. */
  chrome: number
}

/**
 * Picks the richest header that still leaves `want` rows for the tab body: full KPI cards, compact
 * cards, one inline attendance line, that without the eyebrow, and last just the title. When nothing
 * leaves `want`, the richest one that leaves `floor`, else the leanest.
 */
function planFor(height: number, width: number, hasAttendance: boolean, want: number, floor = 4): Plan {
  const options: Array<Omit<Plan, "chrome" | "gap">> = [
    { kpi: "cards", compact: false, eyebrow: true, caption: true },
    { kpi: "cards", compact: true, eyebrow: true, caption: true },
    { kpi: "line", compact: false, eyebrow: true, caption: true },
    { kpi: "line", compact: false, eyebrow: false, caption: true },
    { kpi: "none", compact: false, eyebrow: false, caption: false },
  ]
  const build = (o: (typeof options)[number], gap: number): Plan => {
    const header = (o.eyebrow ? 1 : 0) + 1 + (o.caption ? 1 : 0) + gap // eyebrow, title, caption, gap
    // Cards: the hero tile beside two small ones. Without attendance: the two small ones and a line saying why.
    const cards = hasAttendance ? statTileHeight(o.compact) : miniHeight(o.compact) + 1
    const kpi = o.kpi === "cards" ? cards + gap : o.kpi === "line" ? 1 + gap : 0
    return { ...o, gap, chrome: header + kpi + TAB_ROWS }
  }
  const body = (p: Plan) => height - 2 - p.chrome
  const plans = options.filter((o) => o.kpi !== "cards" || width >= CARDS_MIN).map((o) => build(o, 1))
  const chosen = plans.find((p) => body(p) >= want) ?? plans.find((p) => body(p) >= floor) ?? plans[plans.length - 1]!
  // Two blank rows between sections, as the type rhythm asks, once that still leaves the body room.
  const roomy = build(chosen, 2)
  return chosen.kpi !== "none" && body(roomy) >= Math.max(want, 12) ? roomy : chosen
}

// ── Rows ───────────────────────────────────────────────────────────────────────────────────────

/** A row's segments depend on whether it is the cursor row (its colours change). Rows without an index can't be selected. */
type DisplayRow = { segs: (hot: boolean) => Seg[]; index?: number; blank?: boolean }
const SPACER: DisplayRow = { segs: () => [], blank: true }

const BAR_ON: Seg[] = [{ text: "▌", fg: color.accent }, { text: " " }]
const BAR_OFF: Seg[] = [{ text: "  " }]
/** Cells a selectable row spends on the bar before its content. */
const BAR = 2

/** Renders `rows`, tinting the one whose index is the detail cursor, scrolled to keep it visible. */
function RowList(props: { rows: DisplayRow[]; height: number; width: number }) {
  const ctx = useApp()
  const { store } = ctx
  const s = store.state
  const selectedRow = () => (s.focus === "detail" ? props.rows.findIndex((r) => r.index === s.detailIndex) : -1)
  // When rows overflow, the last row of the box says how many are out of view.
  const overflow = () => props.rows.length > props.height && props.height >= 3
  const shown = () => (overflow() ? props.height - 1 : props.height)
  // A window never opens on a spacer: the row would only push the content down.
  const start = () => {
    const at = windowStart(props.rows.length, selectedRow(), shown())
    return props.rows[at]?.blank && at < selectedRow() ? at + 1 : at
  }
  const visible = createMemo(() => props.rows.slice(start(), start() + shown()))
  const above = () => start()
  const below = () => Math.max(0, props.rows.length - start() - shown())
  const cue = () => [above() ? `↑ ${above()} above` : "", below() ? `↓ ${below()} more` : ""].filter(Boolean).join("   ")
  return (
    <>
      <RowsView rows={visible()} />
      <Show when={overflow()}>
        <Line segs={[{ text: " ".repeat(Math.max(0, props.width - len(cue()))) + cue(), fg: color.faint }]} />
      </Show>
    </>
  )
}

function RowsView(props: { rows: DisplayRow[] }) {
  const ctx = useApp()
  const { store } = ctx
  const s = store.state
  return (
    <For each={props.rows}>
      {(row) => {
        const hot = () => s.focus === "detail" && row.index !== undefined && row.index === s.detailIndex
        const segs = () => (row.index === undefined ? row.segs(false) : [...(hot() ? BAR_ON : BAR_OFF), ...row.segs(hot())])
        // Click selects the row; clicking the selected row opens it.
        const click = () => {
          if (row.index === undefined) return
          if (hot()) activateDetail(ctx)
          else store.actions.setDetail(row.index)
        }
        return <Line bg={hot() ? color.accentSoft : undefined} segs={segs()} onMouseDown={click} />
      }}
    </For>
  )
}

/** A centred one-line notice (loading, error, empty), a little below the top of the tab body. */
function Notice(props: { text: string; tone: string; width: number; height: number }) {
  const top = () => clamp(Math.floor((props.height - 1) / 3), 0, 3)
  const text = () => fit(props.text, props.width).trimEnd()
  const pad = () => " ".repeat(Math.max(0, Math.floor((props.width - len(text())) / 2)))
  return (
    <>
      <Gap rows={top()} />
      <Line segs={[{ text: pad() }, { text: text(), fg: props.tone }]} />
    </>
  )
}

/** Loading / error / empty states shared by every tab. Null means: render the data. */
function tabNotice(e: CourseEntry, tab: TabName, hasRows: boolean): { text: string; tone: string } | null {
  const { key, empty } = TAB_META[tab]
  if (e.errors[key]) return { text: e.errors[key]!, tone: color.low }
  if (e[key] === undefined) return { text: "Loading…", tone: color.muted }
  return hasRows ? null : { text: empty, tone: color.muted }
}

/** Renders the tab's notice when there is one, otherwise `children`. */
function TabBody(props: { entry: CourseEntry; tab: TabName; hasRows: boolean; width: number; height: number; children: JSX.Element }) {
  return (
    <Show when={tabNotice(props.entry, props.tab, props.hasRows)} fallback={props.children}>
      {(n) => <Notice {...n()} width={props.width} height={props.height} />}
    </Show>
  )
}

// Row text stays in the ink ladder: text for the primary column, bold strong on the cursor row only.
const primary = (hot: boolean) => (hot ? color.strong : color.text)

function FilesTab(props: { entry: CourseEntry; width: number; height: number }) {
  const { nerd } = useApp()
  const rows = createMemo((): DisplayRow[] => {
    const out: DisplayRow[] = []
    const all = fileRows(props.entry)
    all.forEach((r, i) => {
      if (r.kind === "section") {
        if (out.length) out.push(SPACER)
        let n = 0
        for (let j = i + 1; j < all.length && all[j]!.kind === "file"; j++) n++
        out.push({ segs: () => eyebrowSegs(r.name, props.width, { count: n }) })
      } else {
        const icon = fileSlot(fileKindOf(r.activity), nerd)
        const name = fit(r.activity.name, Math.max(4, props.width - BAR - len(icon))).trimEnd()
        // File-type icons are quiet: muted, lifted to text ink on the cursor row.
        out.push({ index: r.index, segs: (hot) => [{ text: icon, fg: hot ? color.text : color.muted }, { text: name, fg: primary(hot), bold: hot }] })
      }
    })
    return out
  })
  return (
    <TabBody entry={props.entry} tab="files" hasRows={rows().length > 0} width={props.width} height={props.height}>
      <RowList rows={rows()} height={props.height} width={props.width} />
    </TabBody>
  )
}

const DUE_WIDTH = 16
const DOT = "●"

function AssignmentsTab(props: { entry: CourseEntry; width: number; height: number }) {
  const { now } = useApp()
  const rows = createMemo((): DisplayRow[] => {
    const { pending, done } = assignmentGroups(props.entry)
    if (!pending.length && !done.length) return []
    // Status: a small dot in the state colour, then the words in muted ink.
    const statusWidth = Math.max(len("STATUS"), ...[...pending, ...done].map((a) => 2 + len(assignmentStatus(a).text)))
    // bar, due, gap, name, gap, status, and a cell of air before the pane's edge
    const nameWidth = Math.max(10, props.width - BAR - DUE_WIDTH - 2 - 2 - statusWidth - 1)
    const out: DisplayRow[] = [
      { segs: () => [{ text: `  ${fit("DUE", DUE_WIDTH)}  ${fit("ASSIGNMENT", nameWidth)}  STATUS`, fg: color.faint }] },
    ]
    let index = 0
    const line = (a: (typeof pending)[number]) => {
      const status = assignmentStatus(a)
      const dot = status.tone === "muted" ? color.faint : color[status.tone]
      out.push({
        index: index++,
        segs: (hot) => [
          { text: fit(dueLabel(a, now()), DUE_WIDTH), fg: a.submitted ? color.muted : color.text },
          { text: `  ${fit(a.name, nameWidth)}  `, fg: primary(hot), bold: hot },
          { text: DOT, fg: dot },
          { text: ` ${status.text}`, fg: color.muted },
        ],
      })
    }
    for (const a of pending) line(a)
    if (done.length) {
      if (pending.length) out.push(SPACER)
      out.push({ segs: () => eyebrowSegs("Done", props.width, { count: done.length }) })
      for (const a of done) line(a)
    }
    return out
  })
  return (
    <TabBody entry={props.entry} tab="assignments" hasRows={rows().length > 0} width={props.width} height={props.height}>
      <RowList rows={rows()} height={props.height} width={props.width} />
    </TabBody>
  )
}

const SCORE_VALUE = 5
/** "18 / 25": value right-aligned to the slash, so a column of scores lines up on it. */
const SCORE_WIDTH = SCORE_VALUE + 3 + SCORE_VALUE

/** Column widths for a Grades row of `width` cells: the name takes what the meter (14 to 36) leaves, up to 44. */
function gradeColumns(width: number): { name: number; meter: number } {
  const avail = width - BAR - 2 - 2 - SCORE_WIDTH
  const name = clamp(avail - 14, 10, 44)
  return { name, meter: clamp(avail - name, 14, 36) }
}

function gradeSegs(grade: string | null, range: string | null, name: string, cols: { name: number; meter: number }, opts: { hot?: boolean; bg?: string; nameColor?: string }): Seg[] {
  const nameSeg: Seg = { text: fit(name, cols.name), fg: opts.nameColor ?? primary(!!opts.hot), bold: opts.hot, bg: opts.bg }
  const score = parseScore(grade, range)
  if (!score) return [nameSeg, { text: "  not graded yet", fg: color.muted, bg: opts.bg }]
  const ratio = clamp(score.value / score.max, 0, 1)
  return [
    nameSeg,
    { text: "  ", bg: opts.bg },
    ...meterSegs({ ratio, width: cols.meter, tone: ratioStatus(ratio), style: "line", bg: opts.bg }),
    { text: "  ", bg: opts.bg },
    { text: fmtNumber(score.value).padStart(SCORE_VALUE), fg: opts.nameColor ?? color.text, bg: opts.bg },
    { text: ` / ${fmtNumber(score.max).padEnd(SCORE_VALUE)}`, fg: color.muted, bg: opts.bg },
  ]
}

function GradesTab(props: { entry: CourseEntry; width: number; height: number }) {
  const cols = () => gradeColumns(props.width)
  const rows = createMemo((): DisplayRow[] =>
    (props.entry.grades?.items ?? []).map((g, index) => ({ index, segs: (hot) => gradeSegs(g.grade, g.range, g.name, cols(), { hot }) })),
  )
  const total = () => props.entry.grades?.total
  // The total is a band: a raised strip with a row of air above and below, or just the row when short of space.
  const band = () => (props.height >= rows().length + 5 ? 3 : 1)
  return (
    <TabBody entry={props.entry} tab="grades" hasRows={rows().length > 0} width={props.width} height={props.height}>
      <RowList rows={rows()} height={Math.max(1, props.height - (total() ? band() + 1 : 0))} width={props.width} />
      <Show when={total()}>
        {(t) => {
          const air = () => (band() === 3 ? <Line bg={color.raised} segs={[]} /> : null)
          return (
            <>
              <Gap />
              {air()}
              <Line
                bg={color.raised}
                segs={[
                  { text: BAR_OFF[0]!.text, bg: color.raised },
                  ...gradeSegs(t().grade, t().range, "Course total", cols(), { bg: color.raised, nameColor: color.strong }),
                ]}
              />
              {air()}
            </>
          )
        }}
      </Show>
    </TabBody>
  )
}

const DATE_WIDTH = 18
/** Widest a post is set: long lines are hard to read. */
const READING_MAX = 88

function AnnouncementsTab(props: { entry: CourseEntry; width: number; height: number }) {
  const { store } = useApp()
  const s = store.state
  const rows = createMemo((): DisplayRow[] =>
    (props.entry.announcements ?? []).map((a, index) => ({
      index,
      segs: (hot) => [
        { text: fit(a.dateText ?? "", DATE_WIDTH), fg: hot ? color.muted : color.faint },
        { text: fit(a.title, Math.max(4, props.width - BAR - DATE_WIDTH)).trimEnd(), fg: primary(hot), bold: hot },
      ],
    })),
  )
  // While reading: a short list, a blank row, then title, byline, (air,) the text and a hint row.
  const air = () => (props.height >= 12 ? 1 : 0)
  const postFixed = () => 3 + air()
  const listHeight = () => {
    if (!s.reading) return props.height
    let n = Math.min(rows().length, 4)
    while (n > 0 && props.height - n - 1 - postFixed() < 4) n--
    return n
  }
  const bodyRows = () => Math.max(1, props.height - listHeight() - (listHeight() ? 1 : 0) - postFixed())
  const readWidth = () => Math.max(10, Math.min(props.width - 4, READING_MAX))
  const lines = createMemo(() => (s.reading ? wrapText(s.reading.content ?? "This post has no text.", readWidth()) : []))
  createEffect(() => store.actions.setReadingMax(Math.max(0, lines().length - bodyRows())))
  const visibleLines = () => lines().slice(s.readingScroll, s.readingScroll + bodyRows())
  const more = () => s.readingScroll + bodyRows() < lines().length
  return (
    <TabBody entry={props.entry} tab="announcements" hasRows={rows().length > 0} width={props.width} height={props.height}>
      <RowList rows={rows()} height={listHeight()} width={props.width} />
      <Show when={s.reading}>
        {(post) => (
          <>
            <Show when={listHeight() > 0}>
              <Gap />
            </Show>
            <Title text={post().title} width={props.width} />
            <Line segs={[{ text: fit([post().author, post().dateText].filter(Boolean).join(" · "), props.width).trimEnd(), fg: color.muted }]} />
            <Gap rows={air()} />
            <For each={visibleLines()}>{(line) => <Line segs={[{ text: `  ${line}`, fg: color.text }]} />}</For>
            {/* Fills the rows a short post leaves, so the hint stays on the last row. */}
            <box flexGrow={1} />
            <Line
              segs={[
                { text: more() ? "↓ " : s.readingScroll > 0 ? "↑ " : "", fg: color.faint },
                { text: more() || s.readingScroll > 0 ? "j/k to scroll, esc to close" : "esc to close", fg: color.faint },
              ]}
            />
          </>
        )}
      </Show>
    </TabBody>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────────────────────

/** "4 files · 4 assignments · 3 announcements": only what is loaded, dropping the tail before cutting a fact. */
function factsSegs(e: CourseEntry, width: number): Seg[] {
  const known: Array<[string, number | undefined]> = [["file", tabCount(e, "files")], ["assignment", tabCount(e, "assignments")], ["announcement", tabCount(e, "announcements")]]
  const facts = known.flatMap(([word, n]) => (n === undefined ? [] : [`${n} ${word}${n === 1 ? "" : "s"}`]))
  if (!facts.length) return [{ text: "Open a tab to load its details.", fg: color.faint }]
  const size = (k: number) => facts.slice(0, k).reduce((sum, f, i) => sum + len(f) + (i ? 3 : 0), 0)
  let keep = facts.length
  while (keep > 1 && size(keep) > width) keep--
  const out: Seg[] = []
  facts.slice(0, keep).forEach((f, i) => {
    if (i) out.push({ text: " · ", fg: color.faint })
    out.push({ text: i === 0 ? fit(f, width).trimEnd() : f, fg: color.muted })
  })
  return out
}

function Header(props: { entry: CourseEntry; width: number; eyebrow: boolean; caption: boolean }) {
  const { store } = useApp()
  const s = store.state
  const context = () => {
    if (!s.currentIds.includes(props.entry.course.id)) return "Course · Previous semester"
    return s.attendance?.semester ? `Course · ${s.attendance.semester}` : "Course"
  }
  return (
    <>
      <Show when={props.eyebrow}>
        <Line segs={eyebrowSegs(context(), props.width)} />
      </Show>
      <Title text={props.entry.course.name} width={props.width} />
      <Show when={props.caption}>
        <Line segs={factsSegs(props.entry, props.width)} />
      </Show>
    </>
  )
}

// ── KPIs ───────────────────────────────────────────────────────────────────────────────────────

/** A small KPI card: bold value and unit, an optional thin meter, then the caption behind its state dot. */
function MiniTile(props: { label: string; kpi: Kpi; width: number; compact: boolean }) {
  const inner = () => Math.max(4, props.width - 6)
  const valueColor = () => (props.kpi.value === UNKNOWN ? color.faint : color.strong)
  const unit = () => (props.kpi.unit ? ` ${props.kpi.unit}` : "")
  const dot = (): Seg[] => (props.kpi.dot ? [{ text: DOT, fg: toneColor(props.kpi.dot) }, { text: " " }] : [])
  const dotWidth = () => (props.kpi.dot ? 2 : 0)
  const head = (): Seg[] => [{ text: props.kpi.value, fg: valueColor(), bold: true }, { text: unit(), fg: color.muted }]
  const headWidth = () => len(props.kpi.value) + len(unit())
  // Compact: value, unit and caption share one row; the unit goes first when they don't all fit.
  const oneRow = (): Seg[] => {
    const value = props.kpi.value
    const fits = (c: string) => len(value) + len(unit()) + 2 + dotWidth() + len(c) <= inner()
    const caption = [props.kpi.caption, props.kpi.short].find((c) => c !== undefined && fits(c)) ?? props.kpi.short ?? props.kpi.caption
    const showUnit = fits(caption)
    const room = inner() - len(value) - (showUnit ? len(unit()) : 0) - 2 - dotWidth()
    return [
      { text: value, fg: valueColor(), bold: true },
      { text: showUnit ? unit() : "", fg: color.muted },
      { text: "  " },
      ...dot(),
      { text: fit(caption, Math.max(0, room)).trimEnd(), fg: color.muted },
    ]
  }
  const meter = (): Seg[] => {
    const w = Math.min(36, inner() - headWidth() - 3)
    if (!props.kpi.meter || w < 6) return []
    return [{ text: "   " }, ...meterSegs({ ratio: props.kpi.meter.ratio, width: w, tone: props.kpi.tone, threshold: props.kpi.meter.threshold, style: "line", bg: color.panel })]
  }
  return (
    <Card title={props.label} width={props.width} height={miniHeight(props.compact)}>
      <Show when={!props.compact} fallback={<Line segs={oneRow()} />}>
        <Line segs={[...head(), ...meter()]} />
        <Line segs={[...dot(), { text: fit(props.kpi.caption, inner() - dotWidth()).trimEnd(), fg: color.muted }]} />
      </Show>
    </Card>
  )
}

function Kpis(props: { entry: CourseEntry; width: number; compact: boolean }) {
  const { threshold, now } = useApp()
  const attendance = createMemo(() => attendanceKpi(props.entry, threshold))
  const due = createMemo(() => dueKpi(props.entry, now()))
  const grade = createMemo(() => gradeKpi(props.entry))
  const hero = () => clamp(Math.floor((props.width - 2) / 2), HERO_MIN, HERO_MAX)
  const side = () => props.width - hero() - 2
  return (
    <Switch>
      {/* No record: the two small cards side by side, and a line saying why there is no hero. */}
      <Match when={!attendance()}>
        <box flexDirection="row" columnGap={2} height={miniHeight(props.compact)} flexShrink={0}>
          <MiniTile label="Due soon" kpi={due()} width={tileWidths(props.width, 2)[0]!} compact={props.compact} />
          <MiniTile label="Grade" kpi={grade()} width={tileWidths(props.width, 2)[1]!} compact={props.compact} />
        </box>
        <Line segs={[{ text: "No attendance record for this course", fg: color.muted }]} />
      </Match>
      {/* The hero: the attendance figure. The other two KPIs stack beside it as plain text values. */}
      <Match when={true}>
        <box flexDirection="row" columnGap={2} height={statTileHeight(props.compact)} flexShrink={0}>
          <StatTile
            label="Attendance"
            value={attendance()!.value}
            caption={attendance()!.caption}
            tone={attendance()!.tone}
            meter={attendance()!.meter}
            width={hero()}
            compact={props.compact}
          />
          <box flexDirection="column" width={side()} flexShrink={0}>
            <MiniTile label="Due soon" kpi={due()} width={side()} compact={props.compact} />
            <MiniTile label="Grade" kpi={grade()} width={side()} compact={props.compact} />
          </box>
        </box>
      </Match>
    </Switch>
  )
}

/** The whole KPI row on one line, for panes too short or narrow for cards. The meter carries the state colour. */
function InlineKpis(props: { entry: CourseEntry; width: number }) {
  const { threshold, now } = useApp()
  const segs = (): Seg[] => {
    const a = attendanceKpi(props.entry, threshold)
    if (!a) return [{ text: "No attendance record for this course", fg: color.muted }]
    const value = `  ${a.value}`
    // The caption gives way before the meter shrinks below 6 cells.
    const captionRoom = props.width - len(value) - 6
    const caption = fit(`   ${a.caption}`, Math.max(0, Math.min(captionRoom, len(a.caption) + 3))).trimEnd()
    const meterWidth = clamp(props.width - len(value) - len(caption), 6, 24)
    const out: Seg[] = [
      ...meterSegs({ ratio: a.meter!.ratio, width: meterWidth, tone: a.tone, threshold: a.meter!.threshold, style: "line" }),
      { text: value, fg: color.strong },
      { text: caption, fg: color.muted },
    ]
    // Room left over: the other two KPIs, as short facts.
    let room = props.width - meterWidth - len(value) - len(caption)
    const d = dueKpi(props.entry, now())
    const g = gradeKpi(props.entry)
    const extras: string[] = []
    if (d.value !== UNKNOWN && d.value !== "0") extras.push(`${d.value} due`)
    if (g.meter) extras.push(`${g.value} ${g.unit}`)
    for (const text of extras) {
      if (room < len(text) + 7) break
      out.push({ text: "   ·   ", fg: color.faint }, { text, fg: color.muted })
      room -= len(text) + 7
    }
    return out
  }
  return <Line segs={segs()} />
}

// ── Tabs ───────────────────────────────────────────────────────────────────────────────────────

function TabsRow(props: { entry: CourseEntry; width: number }) {
  const { store } = useApp()
  const count = (tab: TabName, counts: boolean) => {
    const n = counts ? tabCount(props.entry, tab) : undefined
    return n === undefined ? "" : ` ${n}`
  }
  const cellWidth = (tab: TabName, counts: boolean) => len(TAB_META[tab].label) + len(count(tab, counts))
  // Airiest first: shrink the gaps, then drop the counts.
  const config = createMemo(() => {
    const tries = [{ counts: true, gap: 4 }, { counts: true, gap: 3 }, { counts: true, gap: 2 }, { counts: false, gap: 2 }, { counts: false, gap: 1 }]
    const size = (c: (typeof tries)[number]) => TABS.reduce((n, tab) => n + cellWidth(tab, c.counts), 0) + c.gap * (TABS.length - 1)
    return tries.find((c) => size(c) <= props.width) ?? tries[tries.length - 1]!
  })
  const used = () => TABS.reduce((n, tab) => n + cellWidth(tab, config().counts), 0) + config().gap * (TABS.length - 1)
  return (
    <box flexDirection="row" height={2} flexShrink={0}>
      <For each={TABS}>
        {(tab, i) => {
          const on = () => store.state.tab === tab
          const w = () => cellWidth(tab, config().counts)
          // Each tab owns the gap after it (the last one, the rest of the row), so its whole column is clickable.
          const after = () => (i() === TABS.length - 1 ? Math.max(0, props.width - used()) : config().gap)
          return (
            <box flexDirection="column" width={w() + after()} flexShrink={0} onMouseDown={() => store.actions.setTab(tab)}>
              <Line
                segs={[
                  { text: TAB_META[tab].label, fg: on() ? color.strong : color.muted, bold: on() },
                  { text: count(tab, config().counts), fg: color.faint },
                ]}
              />
              <Line segs={[{ text: (on() ? "━" : "─").repeat(w()), fg: on() ? color.accent : color.line }, { text: "─".repeat(after()), fg: color.line }]} />
            </box>
          )
        }}
      </For>
    </box>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────────────────────

/** Nothing to show: a course isn't selected, or the "Previous semesters" row is. An H2-ish line and a caption. */
function EmptyState(props: { width: number; height: number }) {
  const { store } = useApp()
  const previous = () => store.state.selectedId === PREVIOUS_ROW
  const title = () => (previous() ? "Previous semesters" : "No course selected")
  const caption = () => (previous() ? "Press enter to show previous semesters." : "Select a course on the left.")
  const centre = (n: number) => " ".repeat(Math.max(0, Math.floor((props.width - n) / 2)))
  return (
    <>
      <Gap rows={clamp(Math.floor((props.height - 2) / 3), 0, 8)} />
      <Line segs={[{ text: centre(len(title())) }, { text: title(), fg: color.strong, bold: true }]} />
      <Line segs={[{ text: centre(len(caption())) }, { text: caption(), fg: color.muted }]} />
    </>
  )
}

// ── Pane ───────────────────────────────────────────────────────────────────────────────────────

export function CourseDetail(props: { width: number; height: number }) {
  const { store, services, threshold } = useApp()
  const s = store.state
  const entry = () => (s.selectedId ? s.courses[s.selectedId] : undefined)

  // Fetch the tab's data when the course or tab changes. untrack: loadTab reads the store,
  // and re-running on its own loading/error updates would retry failures in a loop.
  createEffect(
    on([() => s.selectedId, () => s.tab], ([id, tab]) => {
      if (id && s.courses[id]) untrack(() => services.loadTab(id, tab))
    }),
  )

  const inner = () => Math.max(20, props.width - 4)

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      paddingX={2}
      paddingY={1}
      onMouseScroll={(e) => {
        const step = wheel(e)
        if (!step) return
        if (s.reading) store.actions.scrollReading(step)
        else {
          store.actions.setFocus("detail")
          store.actions.moveDetail(step, detailItems(s).length)
        }
      }}
    >
      <Show when={entry()} fallback={<EmptyState width={inner()} height={props.height} />}>
        {(e) => {
          // A post being read wants room: the KPI cards give way before the text does.
          const plan = createMemo(() => planFor(props.height, inner(), attendanceKpi(e(), threshold) !== null, s.reading ? 14 : 7, s.reading ? 14 : 4))
          // paddingY (2) + everything above the tab body
          const bodyHeight = () => Math.max(1, props.height - 2 - plan().chrome)
          return (
            <>
              <Header entry={e()} width={inner()} eyebrow={plan().eyebrow} caption={plan().caption} />
              <Gap rows={plan().gap} />
              <Show when={plan().kpi === "cards"}>
                <Kpis entry={e()} width={inner()} compact={plan().compact} />
              </Show>
              <Show when={plan().kpi === "line"}>
                <InlineKpis entry={e()} width={inner()} />
              </Show>
              <Show when={plan().kpi !== "none"}>
                <Gap rows={plan().gap} />
              </Show>
              <TabsRow entry={e()} width={inner()} />
              <Gap />
              <box flexDirection="column" height={bodyHeight()} flexShrink={0} overflow="hidden">
                <Switch>
                  <Match when={s.tab === "files"}>
                    <FilesTab entry={e()} width={inner()} height={bodyHeight()} />
                  </Match>
                  <Match when={s.tab === "assignments"}>
                    <AssignmentsTab entry={e()} width={inner()} height={bodyHeight()} />
                  </Match>
                  <Match when={s.tab === "grades"}>
                    <GradesTab entry={e()} width={inner()} height={bodyHeight()} />
                  </Match>
                  <Match when={s.tab === "announcements"}>
                    <AnnouncementsTab entry={e()} width={inner()} height={bodyHeight()} />
                  </Match>
                </Switch>
              </box>
            </>
          )
        }}
      </Show>
    </box>
  )
}
