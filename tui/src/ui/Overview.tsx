import { createEffect, createMemo, For, Show, untrack } from "solid-js"
import {
  announcementWhen, attendanceRows, deadlineSoon, deadlineWhen, greeting, latestAnnouncements,
  overviewCaption, overviewStats, pctLabel, upcomingDeadlines,
  type CourseAttendance, type Deadline, type LatestAnnouncement, type OverviewStats,
} from "../derive"
import { fit, windowStart } from "../format"
import { slot } from "../icons"
import { color } from "../theme"
import { useApp } from "./context"
import { activateDetail } from "./keys"
import { Card, eyebrowSegs, Figure, figureWidth, Gap, Meter, meterSegs, statTileHeight, Title, toneColor, type Tone } from "./kit"
import { Line, wheel, type Seg } from "./Line"

const len = (s: string) => [...s].length
/** First option that fits `width`; the last one otherwise. */
const pick = (width: number, ...options: string[]) => options.find((o) => len(o) <= width) ?? options[options.length - 1]!
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// ── Layout plan ────────────────────────────────────────────────────────────────────────────────

/** eyebrow, title, caption */
const HEADER_ROWS = 3
const NEWS_CAP = 5
const DEADLINE_CAP = 8
/** Cells between the two columns. */
const COLUMN_GAP = 4

interface Items {
  /** Items drawn (the rest collapse into a "+N more" line). */
  visible: number
  /** Rows per item: 2 = a name line and a detail line. */
  per: 1 | 2
  /** Blank rows between items. */
  gap: number
  more: boolean
  /** Rows the list takes, "+N more" included. */
  used: number
}

export interface OverviewPlan {
  /** KPI tiles across: 3 or 2. */
  tiles: number
  compact: boolean
  showTiles: boolean
  /** One line of KPI figures instead of tiles, when the tiles would starve the sections. */
  ribbon: boolean
  sideBySide: boolean
  /** Blank row between a section's eyebrow and its content. */
  headGap: number
  tilesGap: number
  newsGap: number
  /** Rows each section's content gets. */
  content: number
  att: Items
  due: Items
  news: number
}

function layoutItems(n: number, rows: number, per: 1 | 2, cap: number): Items {
  if (n <= 0 || rows <= 0) return { visible: 0, per, gap: 0, more: false, used: 0 }
  const shown = Math.min(n, cap)
  // Blank rows between items only when everything that will be drawn fits with them.
  const gap = shown * per + (shown - 1) + (shown < n ? 1 : 0) <= rows ? 1 : 0
  const rowsFor = (k: number) => k * per + Math.max(0, k - 1) * gap
  let k = shown
  if (k < n || rowsFor(k) > rows) while (k > 1 && rowsFor(k) + 1 > rows) k--
  const more = k < n && rowsFor(k) < rows
  return { visible: k, per, gap, more, used: Math.min(rows, rowsFor(k) + (more ? 1 : 0)) }
}

/**
 * Decides what fits: tile count and height, one or two columns, one-line or two-line rows, and whether
 * there is room left for the announcements. `width` and `height` are the pane's inside, padding excluded.
 */
export function overviewPlan(i: { width: number; height: number; courses: number; deadlines: number; announcements: number }): OverviewPlan {
  const tiles = i.width >= 58 ? 3 : 2
  const sideBySide = i.width >= 64
  const above = HEADER_ROWS + 1
  // Rows left for the sections under a KPI area of the given height (a stacked layout splits them).
  const rowsAfter = (kpiRows: number) => {
    const free = i.height - above - (kpiRows ? kpiRows + 1 : 0)
    const headGap = free >= 6 ? 1 : 0
    return { free, headGap, content: Math.max(0, sideBySide ? free - 1 - headGap : Math.floor((free - 3 - 2 * headGap) / 2)) }
  }
  // Roomy tiles if the sections still get a useful number of rows (and their breathing row); else compact
  // tiles; else a one-line ribbon of the same figures; else nothing.
  const want = Math.min(4, Math.max(i.courses, i.deadlines, 1))
  let compact = false
  let showTiles = true
  let ribbon = false
  let r = rowsAfter(statTileHeight(false))
  if (r.content < want || !r.headGap) {
    compact = true
    r = rowsAfter(statTileHeight(true))
  }
  if (r.content < (sideBySide ? 3 : want)) {
    showTiles = false
    ribbon = true
    r = rowsAfter(1)
  }
  if (r.content < 2) {
    ribbon = false
    r = rowsAfter(0)
  }
  const { headGap, content } = r
  const att = layoutItems(i.courses, content, 1, i.courses)
  const due = layoutItems(i.deadlines, content, sideBySide && Math.floor(content / 2) >= Math.min(i.deadlines, 4) && content >= 2 ? 2 : 1, DEADLINE_CAP)
  const emptyDue = i.deadlines === 0 ? (content >= 2 && due.per === 2 ? 2 : 1) : 0
  const emptyAtt = i.courses === 0 ? 1 : 0
  const used = sideBySide
    ? Math.max(att.used, due.used, emptyDue, emptyAtt)
    : Math.max(att.used, emptyAtt) + Math.max(due.used, emptyDue) + 1 + 2 * headGap + 1

  const kpiRows = showTiles ? statTileHeight(compact) : ribbon ? 1 : 0
  let spare = i.height - above - (kpiRows ? kpiRows + 1 : 0) - 1 - headGap - Math.max(used, 1)
  // Announcements are a bonus: only when they get two blank rows above them and at least three of their own.
  let news = 0
  if (!compact && showTiles && i.announcements >= 3 && spare >= 2 + 1 + headGap + 3) {
    news = Math.min(i.announcements, NEWS_CAP, spare - 3 - headGap)
    spare -= 3 + headGap + news
  }
  const tilesGap = 1 + (spare > 0 ? 1 : 0)
  const newsGap = 2
  return { tiles, compact, showTiles, ribbon, sideBySide, headGap, tilesGap, newsGap, content, att, due, news }
}

// ── KPI tiles ──────────────────────────────────────────────────────────────────────────────────

interface Tile {
  label: string
  value: string
  unit?: string
  caption: string
  /** A small dot before the caption: the tile's one status mark when it has no meter. */
  mark?: Tone
  tone?: Tone
  meter?: { ratio: number; threshold?: number }
}

/** The first tile is the hero and gets a wider card. */
function tileWidths(width: number, count: number): number[] {
  if (count < 2) return [width]
  const avail = width - 2 * (count - 1)
  const hero = Math.round((avail * 1.25) / (count - 1 + 1.25))
  const rest = avail - hero
  const each = Math.floor(rest / (count - 1))
  const extra = rest - each * (count - 1)
  return [hero, ...Array.from({ length: count - 1 }, (_, i) => each + (i < extra ? 1 : 0))]
}

function tilesFor(st: OverviewStats, count: number, width: number, threshold: number, syncing: boolean): Tile[] {
  const inside = tileWidths(width, count).map((tw) => Math.max(4, tw - 6))
  const thr = `${Math.round(threshold * 100)}%`
  const a = st.attendance

  const attendance: Tile = a
    ? ((w) => ({
        label: "Attendance",
        value: pctLabel(a.percentage, a.status !== "ok", threshold),
        tone: a.status,
        meter: { ratio: a.ratio, threshold },
        caption: a.below
          ? pick(w, `${a.above} of ${a.tracked} courses above ${thr}`, `${a.above} of ${a.tracked} above ${thr}`, `${a.above} of ${a.tracked} ≥ ${thr}`, `${a.above}/${a.tracked} on track`)
          : pick(w, `every course above ${thr}`, `all above ${thr}`, "all on track"),
      }))(inside[0]!)
    : { label: "Attendance", value: "—", caption: "no attendance yet" }

  const d = st.due
  const next = d.next
  const soon = next ? deadlineSoon(next) : ""
  const w = inside[1] ?? 4
  const room = w - 2 - len(soon) - 3
  const due: Tile = {
    label: "Due this week",
    value: d.count || !d.pending ? String(d.count) : "—",
    unit: d.count ? (d.count === 1 ? "assignment" : "assignments") : undefined,
    mark: next ? d.status : d.pending ? undefined : "ok",
    caption: next
      ? room >= 8
        ? `${soon} · ${fit(next.name, room).trimEnd()}`
        : pick(w - 2, ...(next.urgency === "overdue" ? [`${d.overdue} overdue`] : []), `next: ${soon}`, soon)
      : d.pending
        ? syncing ? "checking deadlines…" : `${st.courses - d.pending} of ${st.courses} courses loaded`
        : "all clear",
  }

  const g = st.grades
  const gw = inside[2] ?? 4
  const grades: Tile =
    g.average !== null
      ? {
          label: "Grades",
          value: `${Math.round(g.average * 100)}%`,
          unit: "average",
          tone: "neutral",
          meter: { ratio: g.average },
          caption: pick(gw, `from ${g.graded} of ${g.courses} courses`, `${g.graded} of ${g.courses} courses`, `${g.graded} of ${g.courses}`),
        }
      : { label: "Grades", value: "—", caption: g.loaded ? "no course totals yet" : "no grades yet" }

  return [attendance, due, grades].slice(0, count)
}

/**
 * A KPI card. Only the hero tile shows its value as the big pixel Figure; the others keep it as a bold
 * line so one number leads and the rest support it. The meter carries the state; captions stay muted.
 */
function KpiTile(props: Tile & { width: number; compact: boolean; hero: boolean }) {
  const inner = () => Math.max(4, props.width - 6)
  const big = () => props.hero && /^[0-9%/\-+.: ]+$/.test(props.value) && figureWidth(props.value, props.unit) <= inner()
  const mark = () => (props.mark ? "● " : "")
  return (
    <Card title={props.label} width={props.width} height={statTileHeight(props.compact)}>
      <Show
        when={big()}
        fallback={
          <>
            <Gap rows={props.compact ? 1 : 2} />
            <Line segs={[{ text: fit(props.value, inner()).trimEnd(), fg: color.strong, bold: true }, { text: props.unit ? ` ${props.unit}` : "", fg: color.muted }]} />
            <Gap />
          </>
        }
      >
        {/* A row of air between the label in the border and the figure. */}
        <Show when={!props.compact}>
          <Gap />
        </Show>
        <Figure text={props.value} unit={props.unit} bg={color.panel} />
      </Show>
      <Show when={!props.compact}>
        <Show when={props.meter} fallback={<Gap />}>
          {(m) => <Meter ratio={m().ratio} width={inner()} tone={props.tone ?? "neutral"} threshold={m().threshold} style="line" bg={color.panel} />}
        </Show>
      </Show>
      <Line segs={[{ text: mark(), fg: props.mark ? toneColor(props.mark) : undefined }, { text: fit(props.caption, inner() - len(mark())).trimEnd(), fg: color.muted }]} />
    </Card>
  )
}

/** The KPI figures on one line, for panes too short for tiles: "● 76% attendance   ● 2 due this week ...". */
function ribbonSegs(st: OverviewStats, width: number, threshold: number): Seg[] {
  const a = st.attendance
  const d = st.due
  const g = st.grades
  const items = [
    { tone: a ? color[a.status] : color.faint, value: a ? pctLabel(a.percentage, a.status !== "ok", threshold) : "—", label: "attendance" },
    { tone: d.pending && !d.count ? color.faint : color[d.status], value: d.count || !d.pending ? String(d.count) : "—", label: "due this week" },
    { tone: color.faint, value: g.average !== null ? `${Math.round(g.average * 100)}%` : "—", label: "grades" },
  ]
  const segs: Seg[] = []
  let used = 0
  let count = 0
  for (const it of items) {
    const need = (count ? 3 : 0) + 2 + len(it.value) + 1 + len(it.label)
    if (used + need > width) break
    if (count) segs.push({ text: "   " })
    segs.push({ text: "● ", fg: it.tone }, { text: it.value, fg: color.strong }, { text: ` ${it.label}`, fg: color.muted })
    used += need
    count++
  }
  return segs
}

// ── Sections ───────────────────────────────────────────────────────────────────────────────────

/** A section eyebrow whose trailing note is dropped when it wouldn't fit. */
function sectionEyebrow(label: string, width: number, ...notes: Array<string | number | undefined>): Seg[] {
  const note = notes.find((n) => n !== undefined && len(label) + len(String(n)) + 2 <= width)
  return eyebrowSegs(label, width, { count: note })
}

function Attendance(props: { rows: CourseAttendance[]; items: Items; width: number; headGap: number }) {
  const { threshold, store } = useApp()
  const shown = () => props.rows.slice(0, props.items.visible)
  const pctW = 4
  // Names take what they need; the meter gets the rest (at least 6 cells).
  const longest = () => Math.max(1, ...shown().map((r) => len(r.name)))
  const meterW = () => clamp(props.width - pctW - 2 - longest(), 6, 24)
  const open = (id: string) => () => {
    store.actions.select(id)
    store.actions.setFocus("list")
  }
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <Line segs={sectionEyebrow("Attendance by course", props.width, `${Math.round(threshold * 100)}% required`, `≥ ${Math.round(threshold * 100)}%`)} />
      <Gap rows={props.headGap} />
      <Show when={props.rows.length} fallback={<Line segs={[{ text: "No attendance records yet.", fg: color.muted }]} />}>
        <For each={shown()}>
          {(r, i) => (
            <box flexDirection="column" flexShrink={0} onMouseDown={open(r.id)}>
              <Line
                segs={[
                  { text: fit(r.name, props.width - meterW() - pctW - 2), fg: color.text },
                  { text: " " },
                  ...meterSegs({ ratio: r.ratio, width: meterW(), tone: r.status, threshold, style: "line" }),
                  { text: " " },
                  { text: pctLabel(r.percentage, r.below, threshold).padStart(pctW), fg: color.text },
                ]}
              />
              <Show when={props.items.gap && i() < shown().length - 1}>
                <Gap />
              </Show>
            </box>
          )}
        </For>
        <Show when={props.items.more}>
          <Line segs={[{ text: `+${props.rows.length - props.items.visible} more`, fg: color.faint }]} />
        </Show>
      </Show>
    </box>
  )
}

function Deadlines(props: { rows: Deadline[]; items: Items; width: number; headGap: number; syncing: boolean; pending: boolean }) {
  const ctx = useApp()
  const { store, nerd } = ctx
  const s = store.state
  const selected = () => (s.focus === "detail" ? s.detailIndex : -1)
  const start = createMemo(() => windowStart(props.rows.length, selected(), props.items.visible))
  const shown = createMemo(() => props.rows.slice(start(), start() + props.items.visible))
  // One-line rows end in the date, right-aligned to the widest one.
  const dateW = createMemo(() => Math.max(...shown().map((d) => len(deadlineWhen(d).label))))
  const textW = () => props.width - 3
  const hidden = () => props.rows.length - props.items.visible
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <Line segs={sectionEyebrow("Upcoming deadlines", props.width, props.rows.length || undefined)} />
      <Gap rows={props.headGap} />
      <Show
        when={props.rows.length}
        fallback={
          <>
            <Line
              segs={
                props.pending
                  ? [{ text: props.syncing ? "Checking deadlines…" : "Some courses haven't loaded yet.", fg: color.muted }]
                  : [{ text: slot("ok", nerd), fg: color.ok }, { text: pick(props.width - len(slot("ok", nerd)), "Nothing due in the next 7 days", "Nothing due this week", "All clear"), fg: color.muted }]
              }
            />
            <Show when={!props.pending && props.items.per === 2}>
              <Line segs={[{ text: pick(props.width, "   Unsubmitted work shows up here.", "   Nothing waiting on you.").trimEnd(), fg: color.faint }]} />
            </Show>
          </>
        }
      >
        <For each={shown()}>
          {(d, i) => {
            const index = () => start() + i()
            const hot = () => selected() === index()
            const last = () => i() === shown().length - 1
            const when = deadlineWhen(d)
            const dot = d.urgency === "later" ? "○" : "●"
            const dotColor = d.urgency === "overdue" || d.urgency === "urgent" ? color.low : d.urgency === "soon" ? color.warn : color.faint
            const bar = (): Seg => (hot() ? { text: "▌", fg: color.accent } : { text: " " })
            const click = () => (hot() ? activateDetail(ctx) : store.actions.setDetail(index()))
            const soft = () => (hot() ? color.accentSoft : undefined)
            const name = (w: number): Seg => ({ text: fit(d.name, w), fg: hot() ? color.strong : color.text, bold: hot() })
            // "Tomorrow", or "Overdue, yesterday" / "Today by 23:59" when the detail matters.
            const meta = () => (d.days <= 0 ? `${when.label}, ${when.detail}` : when.label)
            return (
              <box flexDirection="column" flexShrink={0}>
                <box flexDirection="column" flexShrink={0} onMouseDown={click}>
                  <Show
                    when={props.items.per === 2}
                    fallback={
                      <Line
                        bg={soft()}
                        segs={[bar(), { text: dot, fg: dotColor }, { text: " " }, name(textW() - dateW() - 1), { text: " " }, { text: when.label.padStart(dateW()), fg: color.muted }]}
                      />
                    }
                  >
                    <Line bg={soft()} segs={[bar(), { text: dot, fg: dotColor }, { text: " " }, name(textW())]} />
                    <Line
                      bg={soft()}
                      segs={[
                        bar(),
                        { text: "  " },
                        { text: fit(meta(), textW()).trimEnd(), fg: color.muted },
                        ...(len(meta()) + 3 < textW() ? [{ text: ` · ${fit(d.courseName, textW() - len(meta()) - 3)}`.trimEnd(), fg: hot() ? color.muted : color.faint }] : []),
                      ]}
                    />
                  </Show>
                </box>
                <Show when={props.items.gap && !last()}>
                  <Gap />
                </Show>
              </box>
            )
          }}
        </For>
        <Show when={props.items.more}>
          <Line segs={[{ text: `   +${hidden()} more`, fg: color.faint }]} />
        </Show>
      </Show>
    </box>
  )
}

function Announcements(props: { rows: LatestAnnouncement[]; width: number; headGap: number }) {
  const { store, now } = useApp()
  const dateW = 10
  const courseW = Math.min(32, Math.floor(props.width * 0.3))
  // Let the course column follow the titles instead of sitting at the far edge.
  const titleW = Math.min(props.width - dateW - courseW - 4, Math.max(...props.rows.map((a) => len(a.title))))
  const open = (a: LatestAnnouncement) => () => {
    store.actions.select(a.courseId)
    store.actions.setTab("announcements")
    store.actions.setDetail(a.index)
  }
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <Line segs={sectionEyebrow("Latest announcements", props.width, props.rows.length)} />
      <Gap rows={props.headGap} />
      <For each={props.rows}>
        {(a) => (
          <Line
            onMouseDown={open(a)}
            segs={[
              { text: fit(announcementWhen(a, now()), dateW), fg: color.muted },
              { text: "  " },
              { text: fit(a.title, titleW), fg: color.text },
              { text: "  " },
              { text: fit(a.courseName, courseW).trimEnd(), fg: color.faint },
            ]}
          />
        )}
      </For>
    </box>
  )
}

// ── The pane ───────────────────────────────────────────────────────────────────────────────────

/** The dashboard shown when "Overview" is selected in the sidebar. */
export function Overview(props: { width: number; height: number }) {
  const ctx = useApp()
  const { store, threshold, services } = ctx
  const s = store.state
  const inner = () => Math.max(20, props.width - 4)

  // Grades and announcements load per tab, so fetch them here too: once the sync is done, one request at a
  // time (loadTab skips what it already has or is loading).
  createEffect(() => {
    if (s.sync.status !== "idle") return
    const ids = [...s.currentIds]
    untrack(async () => {
      for (const id of ids) for (const tab of ["grades", "announcements"] as const) await services.loadTab(id, tab)
    })
  })

  const stats = createMemo(() => overviewStats(s, ctx.now(), threshold))
  const courses = createMemo(() => attendanceRows(s, threshold))
  const deadlines = createMemo(() => upcomingDeadlines(s, ctx.now()))
  const news = createMemo(() => latestAnnouncements(s, NEWS_CAP))
  const plan = createMemo(() =>
    overviewPlan({ width: inner(), height: Math.max(1, props.height - 2), courses: courses().length, deadlines: deadlines().length, announcements: news().length }),
  )
  const syncing = () => s.sync.status === "syncing"

  const tiles = createMemo(() => tilesFor(stats(), plan().tiles, inner(), threshold, syncing()))
  const widths = () => tileWidths(inner(), plan().tiles)

  const eyebrow = () => `Overview${s.attendance?.semester ? ` · ${s.attendance.semester}` : ""}`
  // Facts drop from the end (sync age first) rather than being cut mid-word. Sync is faint text, low only when it failed.
  const captionSegs = (): Seg[] => {
    const parts = overviewCaption(s, ctx.now())
    while (parts.length > 1 && parts.join("  ·  ").length > inner()) parts.pop()
    return parts.flatMap((part, i): Seg[] => {
      const sync = /^(synced|syncing|offline|last sync)/.test(part)
      const fg = !sync ? color.muted : /^(offline|last sync)/.test(part) ? color.low : color.faint
      return [...(i ? [{ text: "  ·  ", fg: color.faint }] : []), { text: fit(part, inner()).trimEnd(), fg }]
    })
  }

  const colWidths = () => {
    const w = inner() - COLUMN_GAP
    // One-line deadlines need the room for their names more than two-line ones do.
    const att = Math.floor(w * (plan().due.per === 2 ? 0.55 : 0.5))
    return [att, w - att] as const
  }

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      paddingX={2}
      paddingY={1}
      overflow="hidden"
      backgroundColor={color.bg}
      onMouseScroll={(e) => {
        const step = wheel(e)
        if (!step || !deadlines().length) return
        store.actions.setFocus("detail")
        store.actions.moveDetail(step, deadlines().length)
      }}
    >
      <Line segs={eyebrowSegs(eyebrow(), inner())} />
      <Title text={greeting(ctx.now())} width={inner()} />
      <Line segs={captionSegs()} />
      <Gap />

      <Show when={plan().showTiles}>
        <box flexDirection="row" columnGap={2} height={statTileHeight(plan().compact)} flexShrink={0}>
          <For each={tiles()}>{(t, i) => <KpiTile {...t} width={widths()[i()]!} compact={plan().compact} hero={i() === 0} />}</For>
        </box>
        <Gap rows={plan().tilesGap} />
      </Show>

      <Show when={plan().ribbon}>
        <Line segs={ribbonSegs(stats(), inner(), threshold)} />
        <Gap rows={plan().tilesGap} />
      </Show>

      <box flexDirection={plan().sideBySide ? "row" : "column"} columnGap={COLUMN_GAP} rowGap={1} flexShrink={0}>
        <Attendance rows={courses()} items={plan().att} width={plan().sideBySide ? colWidths()[0] : inner()} headGap={plan().headGap} />
        <Deadlines
          rows={deadlines()}
          items={plan().due}
          width={plan().sideBySide ? colWidths()[1] : inner()}
          headGap={plan().headGap}
          syncing={syncing()}
          pending={stats().due.pending > 0}
        />
      </box>

      <Show when={plan().news > 0}>
        <Gap rows={plan().newsGap} />
        <Announcements rows={news().slice(0, plan().news)} width={inner()} headGap={plan().headGap} />
      </Show>
    </box>
  )
}
