import { createMemo, For, Show } from "solid-js"
import { courseMath, dueSoonCount } from "../derive"
import { fit, windowStart } from "../format"
import { glyph, slot } from "../icons"
import { listRows, type Row } from "../state"
import { color } from "../theme"
import { useApp, type AppContextValue } from "./context"
import { Line, wheel, type Seg } from "./Line"
import { PREVIOUS_ROW } from "../state"

// slot(3) name " " pct(4) "  " miss/need(8) " " due(4)
const FIXED_COLUMNS = 3 + 1 + 4 + 2 + 8 + 1 + 4

function rowView(row: Row, width: number, ctx: AppContextValue): { segs: Seg[]; bg?: string } {
  const s = ctx.store.state
  const nameWidth = Math.max(8, width - FIXED_COLUMNS)

  if (row.kind === "heading") return { segs: [{ text: row.label, fg: color.muted }] }
  if (row.kind === "subject") {
    const pct = row.subject.percentage === null ? "" : `${Math.round(row.subject.percentage)}%`
    return { segs: [{ text: `   ${fit(row.subject.subject, nameWidth)} ${pct.padStart(4)}`, fg: color.muted }] }
  }

  const selected = s.selectedId === (row.kind === "course" ? row.id : row.key)
  const hot = selected && s.focus === "list"
  const bg = hot ? color.accent : selected ? color.strip : undefined
  const tone = (c: string) => (hot ? color.onAccent : c)
  const quiet = hot ? color.onAccentMuted : color.muted

  if (row.kind === "group") {
    return {
      bg,
      segs: [
        { text: slot(row.open ? "expanded" : "collapsed", ctx.nerd), fg: quiet },
        { text: `${row.label} (${row.count})`, fg: hot ? color.onAccent : color.muted },
      ],
    }
  }

  const e = s.courses[row.id]
  if (!e) return { segs: [] }
  const m = courseMath(e, ctx.threshold)
  const marked = s.marked.includes(row.id)
  const due = dueSoonCount(e, ctx.now())
  const pct = m?.percentage != null ? `${Math.round(m.percentage)}%` : ""
  const missNeed = m ? (m.status === "ok" ? `miss ${m.canMiss}` : `need ${m.mustAttend}`) : ""
  return {
    bg,
    segs: [
      { text: slot(marked ? "marked" : "unmarked", ctx.nerd), fg: marked ? tone(color.accent) : quiet },
      { text: fit(e.course.name, nameWidth), fg: tone(selected ? color.strong : color.text), bold: selected },
      { text: ` ${pct.padStart(4)}`, fg: m ? tone(color[m.status]) : quiet },
      { text: `  ${fit(missNeed, 8)}`, fg: quiet },
      { text: ` ${fit(due ? `${glyph("deadline", ctx.nerd)} ${due}` : "", 4)}`, fg: tone(color.accent) },
    ],
  }
}

function FilterField(props: { width: number }) {
  const { store, nerd } = useApp()
  return (
    <box flexDirection="row" height={1} flexShrink={0}>
      <text fg={color.accent}>{slot("filter", nerd)}</text>
      <input
        focused={store.state.filtering}
        value={store.state.filter}
        placeholder="Filter courses"
        onInput={(v: string) => store.actions.setFilter(v)}
        width={Math.max(8, props.width - 3)}
        backgroundColor={color.panel}
        focusedBackgroundColor={color.panel}
        textColor={color.text}
        focusedTextColor={color.strong}
        placeholderColor={color.muted}
      />
    </box>
  )
}

export function CourseList(props: { width: number; height: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const rows = createMemo(() => listRows(s))
  const selectedIndex = createMemo(() =>
    rows().findIndex((r) => (r.kind === "course" && r.id === s.selectedId) || (r.kind === "group" && r.key === s.selectedId)),
  )
  const inner = () => Math.max(12, props.width - 4)
  const footerRows = () => (s.filter ? 2 : 0) + (s.marked.length ? 2 : 0)
  // paddingY (2) + title + blank row
  const bodyHeight = () => Math.max(1, props.height - 4 - footerRows())
  const visible = createMemo(() => {
    const all = rows()
    const selected = selectedIndex()
    const lastSelectable = all.findLastIndex((r) => r.kind === "course" || r.kind === "group")
    // On the last selectable row, show the end of the list so trailing headings and subjects are reachable.
    const start = selected >= 0 && selected === lastSelectable
      ? Math.max(0, all.length - bodyHeight())
      : windowStart(all.length, selected, bodyHeight())
    return all.slice(start, start + bodyHeight())
  })
  const courseCount = () => rows().filter((r) => r.kind === "course").length
  const emptyText = () =>
    s.filter ? "No courses match." : s.sync.status === "syncing" ? "Loading courses…" : "No courses yet. Press r to refresh."

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      backgroundColor={color.panel}
      paddingX={2}
      paddingY={1}
      flexShrink={0}
      onMouseScroll={(e) => wheel(e) && ctx.store.actions.moveSelection(wheel(e))}
    >
      <Show
        when={s.filtering || s.filter}
        fallback={<Line segs={[{ text: slot("courses", ctx.nerd), fg: color.muted }, { text: "Courses", fg: color.strong, bold: true }]} />}
      >
        <FilterField width={inner()} />
      </Show>
      <box height={1} flexShrink={0} />
      <Show when={rows().length > 0} fallback={<Line segs={[{ text: emptyText(), fg: color.muted }]} />}>
        <For each={visible()}>
          {(row) => {
            const view = createMemo(() => rowView(row, inner(), ctx))
            const key = row.kind === "course" ? row.id : row.kind === "group" ? row.key : null
            // Click selects; clicking the selected row opens it (or expands "Previous semesters").
            const click = () => {
              if (!key) return
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
            // The first 3 cells are the checkbox: clicking it marks the course for download.
            const mark = (e: { stopPropagation(): void }) => {
              if (row.kind !== "course") return
              e.stopPropagation()
              ctx.store.actions.toggleMark(row.id)
            }
            return (
              <box flexDirection="row" height={1} flexShrink={0} backgroundColor={view().bg} onMouseDown={click}>
                <Line segs={view().segs.slice(0, 1)} onMouseDown={row.kind === "course" ? mark : undefined} />
                <Line segs={view().segs.slice(1)} />
              </box>
            )
          }}
        </For>
      </Show>
      <box flexGrow={1} />
      <Show when={s.filter}>
        <box height={1} flexShrink={0} />
        <Line segs={[{ text: `${courseCount()} of ${s.order.length} courses`, fg: color.muted }]} />
      </Show>
      <Show when={s.marked.length > 0}>
        <box height={1} flexShrink={0} />
        <Line segs={[{ text: slot("download", ctx.nerd), fg: color.accent }, { text: `${s.marked.length} marked for download`, fg: color.muted }]} />
      </Show>
    </box>
  )
}
