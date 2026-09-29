import { createMemo, For, Show } from "solid-js"
import { courseMath, dueSoonCount } from "../derive"
import { fit } from "../format"
import { glyph, slot } from "../icons"
import { listRows, OVERVIEW_ROW, PREVIOUS_ROW, type Row } from "../state"
import { color } from "../theme"
import { useApp, type AppContextValue } from "./context"
import { eyebrowSegs, keySegs, meterSegs, toneColor } from "./kit"
import { Line, wheel, type Seg } from "./Line"

// The sidebar, top to bottom: Overview (nav), then a section per group. Every row is 2 cells of gutter
// (the selection bar lives in the first), `inner` cells of content, and 2 cells of right padding.
// Quiet on purpose: the meter is the only colour mark on a card, everything else is ink.
//
//   ▌ ◈  Overview
//
//     THIS SEMESTER  4
//
//   ▌ □  Computer Networks                  72%      <- 3-cell checkbox, then the name: a click on the
//   ▌    ━━━━━━━━━━━━━━━┃━━━  need 6        1 due          checkbox marks the course
//
// How much air the list gets depends on the height: cards with blank rows between them when they fit,
// then plain cards, then one line per course, then tighter gaps, then it scrolls.

const CHECK = 3 // the checkbox slot: exactly the 3 cells before a course name
const PCT = 4 // "100%"
const CAPTION = 7 // "need 47", "miss 10"
const DUE = 6 // "3 due", with room for two digits

interface Level {
  /** Two-line cards (name + meter) rather than one line per course. */
  card: boolean
  /** Blank rows between two courses. */
  itemGap: number
  /** Blank rows between a heading and what it introduces (and between Overview and the first section). */
  gap: number
  /** Blank rows between two sections. */
  sectionGap: number
  /** Rows the filter field takes. */
  field: number
}

// Richest first: the first level whose rows fit is used; the last one scrolls.
const LEVELS: Level[] = [
  { card: true, itemGap: 1, gap: 1, sectionGap: 2, field: 3 },
  { card: true, itemGap: 1, gap: 1, sectionGap: 1, field: 3 },
  { card: true, itemGap: 0, gap: 1, sectionGap: 1, field: 3 },
  { card: false, itemGap: 0, gap: 1, sectionGap: 1, field: 1 },
  { card: false, itemGap: 0, gap: 0, sectionGap: 1, field: 1 },
  { card: false, itemGap: 0, gap: 0, sectionGap: 0, field: 1 },
]

type Sel = "hot" | "cool" | undefined

/** One terminal row of the list. */
interface Entry {
  /** What a click selects: a course id, OVERVIEW_ROW or PREVIOUS_ROW. Null for headings and blanks. */
  key: string | null
  /** Selected with the list focused ("hot"), or selected while the detail pane has focus ("cool"). */
  sel: Sel
  /** The 2 cells left of the content: selection bar and a hanging chevron. */
  gutter: Seg[]
  /** The content, `inner` cells at most. When `mark` is set its first segment is the 3-cell checkbox. */
  body: Seg[]
  /** The course whose checkbox this row carries. */
  mark?: string
}

const len = (s: string) => [...s].length
const seg = (text: string, fg: string = color.muted, bold = false): Seg => ({ text, fg, bold: bold || undefined })
const spaces = (n: number) => " ".repeat(Math.max(0, n))
const BLANK: Entry = { key: null, sel: undefined, gutter: [], body: [] }

function gutterOf(sel: Sel): Seg[] {
  return [seg(sel ? "▌" : " ", sel === "hot" ? color.accent : color.lineStrong), seg(" ")]
}

/** Cuts a row of segments to `width` cells. */
function clip(segs: Seg[], width: number): Seg[] {
  const out: Seg[] = []
  let left = width
  for (const s of segs) {
    if (left <= 0) break
    const n = len(s.text)
    out.push(n <= left ? s : { ...s, text: [...s.text].slice(0, left).join("") })
    left -= n
  }
  return out
}

/** "SECTION  4", or "SECTION  4 ›" on a toggle: muted, no rule. A selected toggle reads as its name: strong and bold. */
function eyebrow(text: string, width: number, opts: { count?: number; selected?: boolean; chevron?: string } = {}): Seg[] {
  const tail = opts.chevron ? 2 : 0
  const segs = eyebrowSegs(text, width - tail, { count: opts.count, tone: opts.selected ? color.strong : undefined })
  if (opts.selected) segs[1] = { ...segs[1]!, bold: true }
  return opts.chevron ? [...segs, seg(" " + opts.chevron, opts.selected ? color.strong : color.muted)] : segs
}

function selOf(ctx: AppContextValue, key: string): Sel {
  const s = ctx.store.state
  return s.selectedId === key ? (s.focus === "list" ? "hot" : "cool") : undefined
}

function navEntry(ctx: AppContextValue, inner: number): Entry {
  const sel = selOf(ctx, OVERVIEW_ROW)
  return {
    key: OVERVIEW_ROW,
    sel,
    gutter: gutterOf(sel),
    body: clip([seg(slot("overview", ctx.nerd), sel ? color.strong : color.muted), seg("Overview", sel ? color.strong : color.text, !!sel)], inner),
  }
}

/** Two rows (or one, in the dense levels) for a course. */
function courseEntries(ctx: AppContextValue, id: string, level: Level, inner: number, dueCol: boolean): Entry[] {
  const s = ctx.store.state
  const e = s.courses[id]
  if (!e) return []
  const sel = selOf(ctx, id)
  const m = courseMath(e, ctx.threshold)
  const marked = s.marked.includes(id)
  const due = dueSoonCount(e, ctx.now())
  const ink = sel ? color.strong : color.text
  // Unmarked checkboxes are an affordance, not content: faint. Marked ones are the accent.
  const box = seg(slot(marked ? "marked" : "unmarked", ctx.nerd), marked ? color.accent : color.faint)
  const pct = m?.percentage != null ? `${Math.round(m.percentage)}%` : ""
  const need = m ? (m.status === "ok" ? `miss ${m.canMiss}` : `need ${m.mustAttend}`) : ""
  const badge = due ? `${Math.min(due, 9)}${due > 9 ? "+" : ""} due` : ""
  const key = id

  if (!level.card) {
    // Without attendance (older semesters) the name gets the room the %, dot and miss/need columns would take.
    // The due column only exists when some course in the list has something due.
    const nameW = Math.max(4, inner - CHECK - (m ? 1 + PCT + 2 + 1 + CAPTION : 0) - (dueCol ? 1 + DUE : 0))
    // No meter on one line: a state dot is the colour mark.
    const cols = [
      ...(m ? [seg(" " + pct.padStart(PCT), color.text), seg(" ●", toneColor(m.status)), seg(" " + fit(need, CAPTION), color.muted)] : []),
      ...(dueCol ? [seg(" " + fit(badge, DUE), color.faint)] : []),
    ]
    return [{ key, sel, mark: id, gutter: gutterOf(sel), body: clip([box, seg(fit(e.course.name, nameW), ink, !!sel), ...cols], inner) }]
  }

  const nameW = Math.max(4, inner - CHECK - 1 - PCT)
  const first: Entry = {
    key, sel, mark: id, gutter: gutterOf(sel),
    body: clip([box, seg(fit(e.course.name, nameW), ink, !!sel), seg(" " + pct.padStart(PCT), color.text)], inner),
  }

  // Line 2: indented under the name. The meter is the one colour mark; its column is the same on every card.
  const contentW = inner - CHECK
  const meterW = Math.max(6, Math.min(28, contentW - 2 - CAPTION - 1 - DUE))
  const line: Seg[] = [seg(spaces(CHECK), color.muted)]
  let used = 0
  if (m && e.attendance) {
    line.push(...meterSegs({ ratio: e.attendance.present / e.attendance.total, width: meterW, tone: m.status, threshold: ctx.threshold, style: "line" }))
    line.push(seg("  ", color.muted), seg(fit(need, CAPTION), color.muted))
    used = meterW + 2 + CAPTION
  } else {
    // Attendance arrives after the courses do: don't claim there's none while it's still on its way.
    const loading = s.attendance === null && s.sync.status === "syncing"
    const note = fit(loading ? "loading attendance…" : "no attendance record", contentW - DUE - 1).trimEnd()
    line.push(seg(note, color.faint))
    used = len(note)
  }
  if (badge) line.push(seg(spaces(contentW - used - len(badge)), color.muted), seg(badge, color.faint))
  return [first, { key, sel, gutter: gutterOf(sel), body: clip(line, inner) }]
}

/** "Yoga          100%": attendance for subjects that match no course, quiet on purpose. */
function subjectEntry(subject: { subject: string; percentage: number | null }, inner: number): Entry {
  const pct = subject.percentage === null ? "" : `${Math.round(subject.percentage)}%`
  const contentW = inner - CHECK
  const name = fit(subject.subject, contentW - PCT - 1).trimEnd()
  return {
    key: null, sel: undefined, gutter: gutterOf(undefined),
    body: [seg(spaces(CHECK), color.muted), seg(name, color.muted), seg(spaces(contentW - len(name) - PCT)), seg(pct.padStart(PCT), color.muted)],
  }
}

/** Every row of the list at one density. Blank rows sit only between two things, never at either end. */
function entriesFor(rows: Row[], level: Level, ctx: AppContextValue, inner: number): Entry[] {
  const s = ctx.store.state
  const out: Entry[] = []
  let pending = 0
  const want = (n: number) => (pending = Math.max(pending, n))
  const push = (...entries: Entry[]) => {
    if (!entries.length) return
    if (out.length) for (let i = 0; i < pending; i++) out.push(BLANK)
    pending = 0
    for (const e of entries) out.push({ ...e, body: clip(e.body, inner) })
  }

  const brk = rows.findIndex((r) => r.kind === "group" || r.kind === "heading")
  const current = rows.slice(0, brk < 0 ? rows.length : brk).filter((r) => r.kind === "course").length
  const filtered = s.filter.trim() !== ""
  // While filtering only "Previous semesters" is announced by the list, so "This semester" is only
  // needed when both halves are on screen.
  const showCurrent = !filtered || brk >= 0
  let first = true
  let previous = false
  const dueCol = rows.some((r) => r.kind === "course" && dueSoonCount(s.courses[r.id]!, ctx.now()) > 0)

  for (const [i, row] of rows.entries()) {
    if (row.kind === "nav") {
      push(navEntry(ctx, inner))
      want(level.gap)
    } else if (row.kind === "course") {
      if (first && showCurrent) {
        push({ key: null, sel: undefined, gutter: gutterOf(undefined), body: eyebrow("This semester", inner, { count: current }) })
        want(level.gap)
      }
      first = false
      // Older semesters have no attendance to draw: one plain line per course.
      push(...courseEntries(ctx, row.id, previous ? { ...level, card: false } : level, inner, dueCol))
      want(previous ? 0 : level.itemGap)
    } else if (row.kind === "group") {
      const sel = selOf(ctx, row.key)
      want(level.sectionGap)
      push({
        key: row.key, sel,
        gutter: gutterOf(sel),
        body: eyebrow(row.label, inner, { count: row.count, selected: !!sel, chevron: glyph(row.open ? "expanded" : "collapsed", ctx.nerd) }),
      })
      want(level.gap)
      first = false
      previous = true
    } else if (row.kind === "heading") {
      const count = row.label === "Previous semesters" ? rows.length - i - 1 : s.unmatched.length
      want(level.sectionGap)
      push({ key: null, sel: undefined, gutter: gutterOf(undefined), body: eyebrow(row.label, inner, { count }) })
      want(level.gap)
      first = false
      previous = row.label === "Previous semesters"
    } else {
      push(subjectEntry(row.subject, inner))
      want(0)
    }
  }
  return out
}

/**
 * First visible row. Scrolls as little as possible: the selection keeps one row of context, the ends
 * snap so the headings above the first course and the subjects under the last row stay reachable.
 */
function nextStart(prev: number, entries: Entry[], room: number, selected: string | null): number {
  const max = Math.max(0, entries.length - room)
  const at = selected === null ? -1 : entries.findIndex((e) => e.key === selected)
  if (at < 0) return Math.min(prev, max)
  const last = entries.findLastIndex((e) => e.key === selected)
  const keys = entries.filter((e) => e.key)
  if (keys[keys.length - 1]?.key === selected) return max
  if (keys[0]?.key === selected) return 0
  let start = Math.min(prev, max)
  if (at - 1 < start) start = at - 1
  else if (last + 1 >= start + room) start = last + 2 - room
  const top = entries.findIndex((e) => e.mark !== undefined)
  if (start <= top) start = 0
  return Math.max(0, Math.min(max, start))
}

function FilterField(props: { width: number; rows: number }) {
  const { store, nerd } = useApp()
  const filtering = () => store.state.filtering
  const icon = () => slot("filter", nerd)
  const field = () => (
    <>
      <text fg={color.muted}>{icon()}</text>
      <input
        focused={store.state.filtering}
        value={store.state.filter}
        placeholder="Filter courses"
        onInput={(v: string) => store.actions.setFilter(v)}
        width={Math.max(8, props.width - (props.rows > 1 ? 4 : 2) - [...icon()].length)}
        backgroundColor={color.raised}
        focusedBackgroundColor={color.raised}
        textColor={color.text}
        focusedTextColor={color.strong}
        placeholderColor={color.muted}
      />
    </>
  )
  // A bordered box with a filled row inside when the height allows, a plain raised row when it doesn't.
  return (
    <box paddingX={2} flexShrink={0}>
      <Show
        when={props.rows > 1}
        fallback={
          <box flexDirection="row" height={1} paddingX={1} backgroundColor={color.raised}>
            {field()}
          </box>
        }
      >
        <box height={3} border borderStyle="rounded" borderColor={filtering() ? color.faint : color.lineStrong} backgroundColor={color.panel}>
          <box flexDirection="row" height={1} paddingX={1} backgroundColor={color.raised}>
            {field()}
          </box>
        </box>
      </Show>
    </box>
  )
}

export function CourseList(props: { width: number; height: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const rows = createMemo(() => listRows(s))
  const inner = () => Math.max(12, props.width - 4)
  const filtering = () => s.filtering || !!s.filter
  const courseRows = () => rows().filter((r) => r.kind === "course")

  // Rows taken below the list: a filter/scroll status row and the "download marked" row, with air above.
  const reserve = (level: Level, windowed: boolean) => {
    const status = s.filter || windowed ? 1 : 0
    const marked = s.marked.length ? 1 : 0
    if (!status && !marked) return 0
    return status + marked + (level.gap ? (status && marked ? 2 : 1) : 0)
  }
  const top = (level: Level) => (filtering() ? level.field + level.gap : 0)

  const plan = createMemo(() => {
    const avail = Math.max(1, props.height - 2)
    for (const level of LEVELS) {
      const entries = entriesFor(rows(), level, ctx, inner())
      const room = avail - top(level) - reserve(level, false)
      if (entries.length <= room) return { level, entries, room, windowed: false }
    }
    const level = LEVELS[LEVELS.length - 1]!
    return { level, entries: entriesFor(rows(), level, ctx, inner()), room: Math.max(1, avail - top(level) - reserve(level, true)), windowed: true }
  })
  const start = createMemo((prev: number) => {
    const p = plan()
    return p.windowed ? nextStart(prev, p.entries, p.room, s.selectedId) : 0
  }, 0)
  const visible = () => plan().entries.slice(start(), start() + plan().room)

  const emptyText = () =>
    s.filter ? "No courses match." : s.sync.status === "syncing" ? "Loading courses…" : "No courses yet. Press r to refresh."

  // Click selects; clicking the selected row opens it (or expands "Previous semesters").
  const click = (key: string) => {
    const { state: s, actions: a } = ctx.store
    if (key === PREVIOUS_ROW) {
      a.select(key)
      a.togglePrevious()
    } else if (s.selectedId === key && s.focus === "list") a.setFocus("detail")
    else {
      a.select(key)
      a.setFocus("list")
    }
  }

  const statusSegs = (): Seg[] => {
    const p = plan()
    const at = courseRows().findIndex((r) => r.kind === "course" && r.id === s.selectedId)
    const left = s.filter ? `${courseRows().length} of ${s.order.length} courses` : at >= 0 ? `${at + 1} of ${courseRows().length}` : ""
    const arrows = [start() > 0 ? "▲" : "", p.windowed && start() + p.room < p.entries.length ? "▼" : ""].filter(Boolean).join(" ")
    return [seg(left, color.muted), seg(spaces(inner() - len(left) - len(arrows)), color.muted), seg(arrows, color.faint)]
  }
  const markedSegs = (): Seg[] => keySegs("d", `download ${s.marked.length} marked`)
  const statusRow = () => !!s.filter || plan().windowed

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      backgroundColor={color.panel}
      paddingY={1}
      flexShrink={0}
      onMouseScroll={(e) => wheel(e) && ctx.store.actions.moveSelection(wheel(e))}
    >
      <Show when={filtering()}>
        <FilterField width={inner()} rows={plan().level.field} />
        <Show when={plan().level.gap > 0}>
          <box height={1} flexShrink={0} />
        </Show>
      </Show>
      <Show when={rows().length > 0} fallback={<Line paddingX={2} segs={[seg(emptyText(), color.muted)]} />}>
        <For each={visible()}>
          {(entry) => {
            const bg = entry.sel === "hot" ? color.accentSoft : entry.sel === "cool" ? color.raised : undefined
            // The 3 cells after the gutter are the checkbox: clicking them marks the course for download.
            const mark = (e: { stopPropagation(): void }) => {
              e.stopPropagation()
              ctx.store.actions.toggleMark(entry.mark!)
            }
            return (
              <Show when={entry.gutter.length > 0} fallback={<box height={1} flexShrink={0} />}>
                <box flexDirection="row" width={props.width} height={1} flexShrink={0} backgroundColor={bg} onMouseDown={entry.key ? () => click(entry.key!) : undefined}>
                  <Show when={entry.mark} fallback={<Line segs={[...entry.gutter, ...entry.body]} />}>
                    <Line segs={entry.gutter} />
                    <Line segs={entry.body.slice(0, 1)} onMouseDown={mark} />
                    <Line segs={entry.body.slice(1)} />
                  </Show>
                </box>
              </Show>
            )
          }}
        </For>
      </Show>
      <box flexGrow={1} />
      <Show when={(statusRow() || s.marked.length > 0) && plan().level.gap > 0}>
        <box height={1} flexShrink={0} />
      </Show>
      <Show when={statusRow()}>
        <Line paddingX={2} segs={clip(statusSegs(), inner())} />
      </Show>
      <Show when={s.marked.length > 0}>
        <Show when={statusRow() && plan().level.gap > 0}>
          <box height={1} flexShrink={0} />
        </Show>
        <Line paddingX={2} segs={clip(markedSegs(), inner())} />
      </Show>
    </box>
  )
}
