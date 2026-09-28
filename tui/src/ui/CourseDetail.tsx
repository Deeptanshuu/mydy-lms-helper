import { createEffect, createMemo, For, Match, on, Show, Switch, untrack } from "solid-js"
import { assignmentGroups, assignmentStatus, courseMath, detailItems, dueLabel, fileKindOf, fileRows } from "../derive"
import { barRuns, fit, fmtNumber, parseScore, windowStart, wrapText } from "../format"
import { fileSlot, slot, type IconName } from "../icons"
import { PREVIOUS_ROW, TABS, type CourseDataKey, type CourseEntry, type TabName } from "../state"
import { color, ratioStatus } from "../theme"
import { useApp } from "./context"
import { activateDetail } from "./keys"
import { Line, wheel, type Seg } from "./Line"

const TAB_META: Record<TabName, { icon: IconName; label: string; key: CourseDataKey; empty: string }> = {
  files: { icon: "files", label: "Files", key: "content", empty: "No files in this course yet." },
  assignments: { icon: "assignments", label: "Assignments", key: "assignments", empty: "No assignments in this course." },
  grades: { icon: "grades", label: "Grades", key: "grades", empty: "No grades yet." },
  announcements: { icon: "announcements", label: "Announcements", key: "announcements", empty: "No announcements yet." },
}

type DisplayRow = { segs: Seg[]; index?: number }

/** Renders `rows`, highlighting the one whose index is the detail cursor, scrolled to keep it visible. */
function RowList(props: { rows: DisplayRow[]; height: number }) {
  const ctx = useApp()
  const { store } = ctx
  const s = store.state
  const selectedRow = () => (s.focus === "detail" ? props.rows.findIndex((r) => r.index === s.detailIndex) : -1)
  const visible = createMemo(() => {
    const start = windowStart(props.rows.length, selectedRow(), props.height)
    return props.rows.slice(start, start + props.height)
  })
  return (
    <For each={visible()}>
      {(row) => {
        const hot = () => s.focus === "detail" && row.index !== undefined && row.index === s.detailIndex
        const segs = () => (hot() ? row.segs.map((seg) => ({ ...seg, fg: seg.fg === color.muted ? color.onAccentMuted : color.onAccent })) : row.segs)
        // Click selects the row; clicking the selected row opens it.
        const click = () => {
          if (row.index === undefined) return
          if (hot()) activateDetail(ctx)
          else store.actions.setDetail(row.index)
        }
        return <Line bg={hot() ? color.accent : undefined} segs={segs()} onMouseDown={click} />
      }}
    </For>
  )
}

/** Loading / error / empty states shared by every tab. Null means: render the data. */
function tabNotice(e: CourseEntry, tab: TabName, hasRows: boolean): Seg | null {
  const { key, empty } = TAB_META[tab]
  if (e.errors[key]) return { text: e.errors[key]!, fg: color.low }
  if (e[key] === undefined) return { text: "Loading…", fg: color.muted }
  return hasRows ? null : { text: empty, fg: color.muted }
}

function FilesTab(props: { entry: CourseEntry; width: number; height: number }) {
  const { nerd } = useApp()
  const rows = createMemo((): DisplayRow[] => {
    const out: DisplayRow[] = []
    for (const r of fileRows(props.entry)) {
      if (r.kind === "section") {
        if (out.length) out.push({ segs: [] })
        out.push({ segs: [{ text: slot("section", nerd), fg: color.muted }, { text: r.name, fg: color.muted }] })
      } else {
        const kind = fileKindOf(r.activity)
        const tint = kind === "pdf" ? color.low : kind === "ppt" ? color.accent : color.muted
        out.push({ index: r.index, segs: [{ text: "   " }, { text: fileSlot(kind, nerd), fg: tint }, { text: fit(r.activity.name, props.width - 10).trimEnd(), fg: color.text }] })
      }
    }
    return out
  })
  return (
    <Show when={tabNotice(props.entry, "files", rows().length > 0)} fallback={<RowList rows={rows()} height={props.height} />}>
      {(notice) => <Line segs={[notice()]} />}
    </Show>
  )
}

function AssignmentsTab(props: { entry: CourseEntry; width: number; height: number }) {
  const { nerd, now } = useApp()
  const rows = createMemo((): DisplayRow[] => {
    const { pending, done } = assignmentGroups(props.entry)
    const statusWidth = Math.max(6, ...[...pending, ...done].map((a) => assignmentStatus(a).text.length))
    const nameWidth = Math.max(12, props.width - 3 - 16 - 2 - 2 - statusWidth)
    const out: DisplayRow[] = [{ segs: [{ text: `   ${fit("Due", 16)}  ${fit("Assignment", nameWidth)}  Status`, fg: color.muted }] }, { segs: [] }]
    let index = 0
    const line = (a: (typeof pending)[number], icon: IconName, iconColor: string) => {
      const status = assignmentStatus(a)
      out.push({
        index: index++,
        segs: [
          { text: slot(icon, nerd), fg: iconColor },
          { text: fit(dueLabel(a, now()), 16), fg: a.submitted ? color.muted : color.text },
          { text: `  ${fit(a.name, nameWidth)}  `, fg: color.text },
          { text: status.text, fg: status.tone === "muted" ? color.muted : color[status.tone] },
        ],
      })
    }
    for (const a of pending) {
      const soon = a.due ? Math.abs(a.due.getTime() - now().getTime()) <= 7 * 86_400_000 : false
      line(a, "deadline", soon ? color.warn : color.muted)
    }
    if (done.length) {
      if (pending.length) out.push({ segs: [] })
      out.push({ segs: [{ text: "Done", fg: color.muted }] })
      for (const a of done) line(a, "done", color.ok)
    }
    return pending.length || done.length ? out : []
  })
  return (
    <Show when={tabNotice(props.entry, "assignments", rows().length > 0)} fallback={<RowList rows={rows()} height={props.height} />}>
      {(notice) => <Line segs={[notice()]} />}
    </Show>
  )
}

function scoreSegs(grade: string | null, range: string | null, nameWidth: number, name: string, nameColor: string): Seg[] {
  const score = parseScore(grade, range)
  if (!score) return [{ text: fit(name, nameWidth), fg: nameColor }, { text: "  not graded yet", fg: color.muted }]
  const ratio = Math.max(0, Math.min(1, score.value / score.max))
  const filled = Math.round(ratio * 12)
  return [
    { text: fit(name, nameWidth), fg: nameColor },
    { text: "  " },
    { text: "█".repeat(filled), fg: color[ratioStatus(ratio)] },
    { text: "░".repeat(12 - filled), fg: color.line },
    { text: `  ${fmtNumber(score.value).padStart(5)}`, fg: color.strong, bold: true },
    { text: ` / ${fmtNumber(score.max)}`, fg: color.muted },
  ]
}

function GradesTab(props: { entry: CourseEntry; width: number; height: number }) {
  const nameWidth = () => Math.max(10, Math.min(40, props.width - 30))
  const rows = createMemo((): DisplayRow[] =>
    (props.entry.grades?.items ?? []).map((g, index) => ({ index, segs: scoreSegs(g.grade, g.range, nameWidth(), g.name, color.text) })),
  )
  const total = () => props.entry.grades?.total
  return (
    <Show when={tabNotice(props.entry, "grades", rows().length > 0)} fallback={
      <box flexDirection="column" flexGrow={1}>
        <RowList rows={rows()} height={Math.max(1, props.height - 2)} />
        <Show when={total()}>
          {(t) => (
            <>
              <box height={1} flexShrink={0} />
              <Line bg={color.strip} segs={[...scoreSegs(t().grade, t().range, Math.max(10, nameWidth() - (t().percentage ? t().percentage!.length + 3 : 0)), "Course total", color.strong), { text: t().percentage ? `   ${t().percentage}` : "", fg: color.muted }]} />
            </>
          )}
        </Show>
      </box>
    }>
      {(notice) => <Line segs={[notice()]} />}
    </Show>
  )
}

function AnnouncementsTab(props: { entry: CourseEntry; width: number; height: number }) {
  const { store } = useApp()
  const s = store.state
  const rows = createMemo((): DisplayRow[] =>
    (props.entry.announcements ?? []).map((a, index) => ({
      index,
      segs: [{ text: fit(a.dateText ?? "", 18), fg: color.muted }, { text: `  ${a.title}`, fg: color.text }],
    })),
  )
  const listHeight = () => (s.reading ? Math.min(rows().length, 4) : props.height)
  // list, blank, title strip, blank, then the post; one row kept for the scroll hint
  const bodyRows = () => Math.max(3, props.height - listHeight() - 4)
  const lines = createMemo(() => (s.reading ? wrapText(s.reading.content ?? "This post has no text.", props.width - 2) : []))
  createEffect(() => store.actions.setReadingMax(Math.max(0, lines().length - bodyRows())))
  const visibleLines = () => lines().slice(s.readingScroll, s.readingScroll + bodyRows())
  const more = () => s.readingScroll + bodyRows() < lines().length
  return (
    <Show when={tabNotice(props.entry, "announcements", rows().length > 0)} fallback={
      <box flexDirection="column" flexGrow={1}>
        <RowList rows={rows()} height={listHeight()} />
        <Show when={s.reading}>
          {(post) => (
            <>
              <box height={1} flexShrink={0} />
              <Line bg={color.strip} segs={[{ text: ` ${post().title}`, fg: color.strong, bold: true }, { text: `   ${[post().author, post().dateText].filter(Boolean).join(", ")}`, fg: color.muted }]} />
              <box height={1} flexShrink={0} />
              <For each={visibleLines()}>{(line) => <Line segs={[{ text: ` ${line}`, fg: color.text }]} />}</For>
              <Show when={more() || s.readingScroll > 0}>
                <Line segs={[{ text: more() ? " ↓ " : " ↑ ", fg: color.accent }, { text: "j/k to scroll, esc to close", fg: color.muted }]} />
              </Show>
            </>
          )}
        </Show>
      </box>
    }>
      {(notice) => <Line segs={[notice()]} />}
    </Show>
  )
}

function AttendanceLine(props: { entry: CourseEntry; width: number }) {
  const { nerd, threshold } = useApp()
  const segs = (): Seg[] => {
    const a = props.entry.attendance
    const m = courseMath(props.entry, threshold)
    if (!a || !m || m.percentage === null) return [{ text: "No attendance record for this course", fg: color.muted }]
    const tint = color[m.status]
    const advice = m.status === "ok" ? `can miss ${m.canMiss} more` : `attend the next ${m.mustAttend}`
    const tail = `   ${a.present} of ${a.total}, ${advice}`
    // icon (3) + bar + "  88%" (5) + tail must fit
    const barWidth = Math.max(8, Math.min(30, props.width - 3 - 5 - tail.length))
    return [
      { text: slot("attendance", nerd), fg: color.muted },
      ...barRuns(a.present / a.total, threshold, barWidth).map((r): Seg => ({
        text: r.text,
        fg: r.kind === "fill" ? tint : r.kind === "notch" ? color.strong : color.line,
      })),
      { text: `  ${Math.round(m.percentage)}%`, fg: tint, bold: true },
      { text: tail, fg: color.muted },
    ]
  }
  return <Line segs={segs()} />
}

function TabsRow(props: { width: number }) {
  const { store, nerd } = useApp()
  const label = (tab: TabName, icons: boolean) => ` ${icons ? slot(TAB_META[tab].icon, nerd) : ""}${TAB_META[tab].label} `
  const total = (icons: boolean) => TABS.reduce((n, tab, i) => n + (i ? 1 : 0) + [...label(tab, icons)].length, 0)
  // Drop the icons rather than clip the last tab on narrower terminals.
  const icons = () => total(true) <= props.width
  return (
    <box flexDirection="row" height={1} flexShrink={0}>
      <For each={TABS}>
        {(tab, i) => {
          const on = () => store.state.tab === tab
          return (
            <Line
              segs={[
                ...(i() ? [{ text: " " }] : []),
                { text: label(tab, icons()), bg: on() ? color.accent : undefined, fg: on() ? color.onAccent : color.muted, bold: on() },
              ]}
              onMouseDown={() => store.actions.setTab(tab)}
            />
          )
        }}
      </For>
    </box>
  )
}

export function CourseDetail(props: { width: number; height: number }) {
  const { store, services } = useApp()
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
  // paddingY (2) + title, blank, attendance, blank, tabs, blank
  const bodyHeight = () => Math.max(3, props.height - 8)

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
      <Show
        when={entry()}
        fallback={
          <Line segs={[{ text: s.selectedId === PREVIOUS_ROW ? "Press enter to show previous semesters." : "Select a course on the left.", fg: color.muted }]} />
        }
      >
        {(e) => (
          <>
            <Line segs={[{ text: fit(e().course.name, inner()).trimEnd(), fg: color.strong, bold: true }]} />
            <box height={1} flexShrink={0} />
            <AttendanceLine entry={e()} width={inner()} />
            <box height={1} flexShrink={0} />
            <TabsRow width={inner()} />
            <box height={1} flexShrink={0} />
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
          </>
        )}
      </Show>
    </box>
  )
}
