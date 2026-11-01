import { useKeyboard, usePaste } from "@opentui/solid"
import { createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js"
import { gradePoints, type Results, type RevaluationApplication } from "@mydy/core/logic"
import { lineChart, type ChartRole } from "../chart"
import { fmtCredits, gpaLabel, gradeTone, resultsCaption, resultSemesters, sgpaChange, shownSemester, simSubjects, simulated } from "../derive"
import { fit, windowStart } from "../format"
import { slot } from "../icons"
import { RESULTS_ROW, type ResultsView } from "../state"
import { creditsByGrade, gradeTier, progression, semesterBreakdown } from "../stats"
import { color } from "../theme"
import { useApp } from "./context"
import { enterResults } from "./keys"
import { center, Line, wheel, type Seg } from "./Line"
import { Card, eyebrowSegs, Gap, meterSegs, StatTile, statTileHeight, tileWidths, Title } from "./kit"

// The Results pane: semester results from UniClaIRE, the university's results portal.
//
//   RESULTS · UNICLAIRE
//   Results
//   DY23MTCO012  ·  6 semesters  ·  132 credits  ·  fetched 2 hours ago
//
//   ╭ CGPA ──────────╮ ╭ Latest SGPA ──╮ ╭ Revaluation ──╮
//
//   SEMESTERS                          SEMESTER 6 · MAY 2026                21 credits
//   ▌ Semester 1   8.42 ━━━━━━━━━━    Machine Learning               4 cr    A+
//     Semester 2   8.10 ━━━━━━━━━     ...
//
// Without a UniClaIRE login the pane is a sign-in form instead. UniClaIRE is a separate account from MyDy.

const len = (s: string) => [...s].length
const COLUMN_GAP = 4
/** "Semester 12" */
const TERM_W = 11
/** "10.00" */
const GPA_W = 5

export function Results(props: { width: number; height: number }) {
  const ctx = useApp()
  const { store, services } = ctx
  const s = store.state
  const inner = () => Math.max(20, props.width - 4)
  const rows = () => Math.max(1, props.height - 2)

  onMount(() => services.loadResults(false))

  const captionSegs = (): Seg[] => {
    const parts = resultsCaption(s, ctx.now())
    while (parts.length > 1 && parts.join("  ·  ").length > inner()) parts.shift()
    return parts.flatMap((part, i): Seg[] => {
      const bad = /^(offline|last fetch)/.test(part)
      const status = /^(fetch|offline|last fetch)/.test(part)
      return [...(i ? [{ text: "  ·  ", fg: color.faint }] : []), { text: fit(part, inner()).trimEnd(), fg: bad ? color.low : status ? color.faint : color.muted }]
    })
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
        const n = resultSemesters(s).length
        if (!step || !n) return
        store.actions.setFocus("detail")
        store.actions.moveDetail(step, n)
      }}
    >
      <Line segs={eyebrowSegs("Results · UniClaIRE", inner())} />
      <Title text="Results" width={inner()} />
      <Line segs={captionSegs()} />
      <Gap />
      <Show
        when={s.results.status !== "signin"}
        fallback={<PortalSignIn width={inner()} />}
      >
        <Show when={s.results.data} fallback={<Placeholder width={inner()} />}>
          <Body width={inner()} height={rows() - 4} />
        </Show>
      </Show>
    </box>
  )
}

function Placeholder(props: { width: number }) {
  const { store } = useApp()
  const r = store.state.results
  const lines = (): Array<[string, string]> => {
    if (r.status === "loading" || r.status === "idle") return [["Fetching your results from UniClaIRE…", color.muted]]
    return [
      [r.message ?? "Couldn't fetch your results.", r.status === "offline" ? color.muted : color.low],
      ["Press r to try again.", color.faint],
    ]
  }
  return <For each={lines()}>{([text, fg]) => <Line segs={[{ text: fit(text, props.width).trimEnd(), fg }]} />}</For>
}

function Body(props: { width: number; height: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const real = () => s.results.data!
  const sim = createMemo(() => simulated(s)!)
  const changes = () => Object.keys(s.results.sim).length

  // Tiles when the lists below still get a few rows; compact tiles before none.
  const tileRows = () => {
    // The charts need the height more than the tiles do.
    if (s.results.view === "statistics") return { show: false, compact: true }
    for (const compact of [false, true]) if (props.height - statTileHeight(compact) - 1 - 2 >= 6) return { show: true, compact }
    return { show: false, compact: true }
  }
  const tiles = () => (props.width >= 58 ? 3 : 2)
  // Under the tiles: the view switch and a blank row.
  const listRows = () => props.height - (tileRows().show ? statTileHeight(tileRows().compact) + 1 : 0) - 2
  const widths = () => tileWidths(props.width, tiles())

  const latest = (r: Results) => [...r.semesters].reverse().find((x) => x.sgpa !== null) ?? null
  const open = () => (s.results.revaluation ?? []).filter((e) => e.open)
  const delta = (a: number | null, b: number | null) => {
    if (a === null || b === null || a === b) return ""
    const d = Math.round((a - b) * 100) / 100
    return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`
  }
  const cgpaMoved = () => changes() > 0 && sim().cgpa !== real().cgpa
  const cgpaCaption = () => (cgpaMoved() ? `${delta(sim().cgpa, real().cgpa)} · was ${gpaLabel(real().cgpa)}` : `${fmtCredits(real().credits)} credits`)
  const sgpaCaption = () => {
    const now = latest(sim())
    const was = real().semesters.find((x) => x.term === now?.term)
    if (changes() && now && was && now.sgpa !== was.sgpa) return `${delta(now.sgpa, was.sgpa)} · was ${gpaLabel(was.sgpa)}`
    return sgpaChange(sim().semesters) ?? (now ? `semester ${now.term}` : "no grades yet")
  }
  const appCount = () => s.results.applications?.length ?? 0
  const rvCaption = () => {
    const first = open()[0]
    if (first) return `${first.exam}: ${first.window || "window open"}`
    if (appCount()) return `${appCount()} application${appCount() === 1 ? "" : "s"}`
    return s.results.revaluation === null ? "couldn't check" : "no window open"
  }

  return (
    <box flexDirection="column" flexShrink={0}>
      <Show when={tileRows().show}>
        <box flexDirection="row" columnGap={2} height={statTileHeight(tileRows().compact)} flexShrink={0}>
          <StatTile
            label={changes() ? "CGPA · what-if" : "CGPA"}
            value={gpaLabel(sim().cgpa)}
            unit="/ 10"
            tone="accent"
            meter={sim().cgpa !== null ? { ratio: sim().cgpa! / 10 } : undefined}
            caption={cgpaCaption()}
            captionTone={cgpaMoved() ? "accent" : undefined}
            width={widths()[0]!}
            compact={tileRows().compact}
          />
          <StatTile
            label="Latest SGPA"
            value={gpaLabel(latest(sim())?.sgpa ?? null)}
            tone="neutral"
            meter={latest(sim()) ? { ratio: latest(sim())!.sgpa! / 10 } : undefined}
            caption={sgpaCaption()}
            width={widths()[1]!}
            compact={tileRows().compact}
          />
          <Show when={tiles() === 3}>
            <StatTile
              label="Revaluation"
              value={s.results.revaluation === null ? "—" : open().length ? "Open" : "Closed"}
              captionTone={open().length ? "warn" : undefined}
              caption={rvCaption()}
              width={widths()[2]!}
              compact={tileRows().compact}
            />
          </Show>
        </box>
        <Gap />
      </Show>
      <ViewSwitch width={props.width} />
      <Gap />
      <Switch>
        <Match when={s.results.view === "grades"}>
          <Grades width={props.width} height={listRows()} />
        </Match>
        <Match when={s.results.view === "statistics"}>
          <Statistics width={props.width} height={listRows()} />
        </Match>
        <Match when={s.results.view === "revaluation"}>
          <Revaluation width={props.width} height={listRows()} />
        </Match>
      </Switch>
    </box>
  )
}

/** "GRADES    STATISTICS    REVALUATION  2" with the current one lit, and the what-if state on the right. */
function ViewSwitch(props: { width: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const changes = () => Object.keys(s.results.sim).length
  const tab = (label: string, on: boolean, count?: number): Seg[] => [
    { text: label.toUpperCase(), fg: on ? color.strong : color.muted, bold: on || undefined },
    { text: count ? `  ${count}` : "", fg: color.faint },
  ]
  const right = (): Seg[] => {
    const n = changes()
    if (s.results.view === "statistics" && n) return [{ text: `● what-if: ${n} grade${n === 1 ? "" : "s"} changed`, fg: color.accent }]
    if (s.results.view !== "grades") return []
    if (s.results.simulating) return [{ text: `● what-if: ← → change grade${n ? `, ${n} changed` : ""}`, fg: color.accent }]
    if (n) return [{ text: `● what-if: ${n} grade${n === 1 ? "" : "s"} changed`, fg: color.accent }]
    return [{ text: "s", fg: color.text, bold: true }, { text: " what-if", fg: color.faint }]
  }
  const views: Array<[ResultsView, string]> = [["grades", "Grades"], ["statistics", "Statistics"], ["revaluation", "Revaluation"]]
  const tabSegs = (view: ResultsView, label: string) => tab(label, s.results.view === view, view === "revaluation" ? s.results.applications?.length : undefined)
  const go = (view: ResultsView) => () => {
    ctx.store.actions.setResults({ view, simulating: false })
    ctx.store.actions.setDetail(0)
  }
  const width = (segs: Seg[]) => segs.reduce((n, x) => n + len(x.text), 0)
  const leftW = () => views.reduce((n, [v, l], i) => n + (i ? 4 : 0) + width(tabSegs(v, l)), 0)
  const gap = () => props.width - leftW() - width(right())
  return (
    <box flexDirection="row" height={1} flexShrink={0}>
      <For each={views}>{([view, label], i) => <Line segs={[{ text: i() ? "    " : "" }, ...tabSegs(view, label)]} onMouseDown={go(view)} />}</For>
      <Show when={gap() >= 2}>
        <Line segs={[{ text: " ".repeat(gap()) }, ...right()]} />
      </Show>
    </box>
  )
}

function Grades(props: { width: number; height: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const semesters = createMemo(() => resultSemesters(s))
  const shown = () => Math.min(shownSemester(s), Math.max(0, semesters().length - 1))
  const sideBySide = () => props.width >= 72
  const colWidths = () => {
    const w = props.width - COLUMN_GAP
    const left = Math.min(40, Math.max(TERM_W + GPA_W + 10, Math.floor(w * 0.36)))
    return [left, w - left] as const
  }
  const stackedTop = () => Math.min(semesters().length + 2, Math.max(3, Math.floor(props.height / 2)))
  return (
    <box flexDirection={sideBySide() ? "row" : "column"} columnGap={COLUMN_GAP} flexShrink={0}>
      <Semesters selected={shown()} width={sideBySide() ? colWidths()[0] : props.width} height={sideBySide() ? props.height : stackedTop()} />
      <Show when={semesters()[shown()]}>
        <Courses semester={shown()} width={sideBySide() ? colWidths()[1] : props.width} height={sideBySide() ? props.height : props.height - stackedTop() - 1} />
      </Show>
    </box>
  )
}

function Semesters(props: { selected: number; width: number; height: number }) {
  const ctx = useApp()
  const { store } = ctx
  const s = store.state
  const rows = createMemo(() => simulated(s)?.semesters ?? [])
  const real = () => s.results.data?.semesters ?? []
  const room = () => Math.max(1, props.height - 2)
  const start = createMemo(() => windowStart(rows().length, props.selected, room()))
  const shown = () => rows().slice(start(), start() + room())
  const meterW = () => Math.max(4, Math.min(20, props.width - 2 - TERM_W - 1 - GPA_W - 1))
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <Line segs={eyebrowSegs("Semesters", props.width, { count: rows().length })} />
      <Gap />
      <Show when={rows().length} fallback={<Line segs={[{ text: "No results published yet.", fg: color.muted }]} />}>
        <For each={shown()}>
          {(sem, i) => {
            const index = () => start() + i()
            const on = () => index() === props.selected
            // While simulating the cursor is on a subject; the semester only shows which one it's in.
            const hot = () => on() && s.focus === "detail" && !s.results.simulating
            const changed = () => sem.sgpa !== real()[index()]?.sgpa
            const click = () => {
              if (s.results.simulating) store.actions.setResults({ simulating: false })
              store.actions.setDetail(index())
            }
            return (
              <Line
                onMouseDown={click}
                bg={hot() ? color.accentSoft : on() ? color.raised : undefined}
                segs={[
                  { text: on() ? "▌ " : "  ", fg: hot() ? color.accent : color.lineStrong },
                  { text: fit(`Semester ${sem.term}`, TERM_W), fg: on() ? color.strong : color.text, bold: on() || undefined },
                  { text: " " },
                  { text: gpaLabel(sem.sgpa).padStart(GPA_W), fg: changed() ? color.accent : color.text, bold: changed() || undefined },
                  { text: " " },
                  ...(sem.sgpa !== null ? meterSegs({ ratio: sem.sgpa / 10, width: meterW(), tone: "accent", style: "line" }) : []),
                ]}
              />
            )
          }}
        </For>
      </Show>
    </box>
  )
}

function Courses(props: { semester: number; width: number; height: number }) {
  const ctx = useApp()
  const { store } = ctx
  const s = store.state
  const sem = () => simulated(s)!.semesters[props.semester]!
  const real = () => s.results.data!.semesters[props.semester]!
  const subjects = createMemo(() => simSubjects(s))
  // The simulator's cursor, as an index into this semester's courses (-1: not here).
  const cursor = () => {
    if (!s.results.simulating) return -1
    const at = subjects()[s.detailIndex]
    return at && at.semester === props.semester ? at.index : -1
  }
  const room = () => Math.max(1, props.height - 2)
  const start = createMemo(() => (cursor() < 0 ? 0 : windowStart(sem().courses.length, cursor(), room())))
  const more = () => sem().courses.length - start() > room()
  const shown = () => sem().courses.slice(start(), start() + (more() ? room() - 1 : room()))
  const gradeText = (i: number) => {
    const was = real().courses[i]?.grade || "—"
    const now = sem().courses[i]?.grade || "—"
    return now === was ? now : `${was} → ${now}`
  }
  const gradeW = () => Math.max(2, ...sem().courses.map((_, i) => len(gradeText(i))))
  const creditW = 6 // "4.5 cr"
  const nameW = () => Math.max(4, props.width - 2 - creditW - 2 - gradeW() - 2)
  const title = () => `Semester ${sem().term}${sem().exam ? ` · ${sem().exam}` : ""}`
  const tone = (points: number | null) => {
    const t = gradeTone(points)
    return t === "low" ? color.low : t === "ok" ? color.ok : t === "muted" ? color.faint : color.text
  }
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <Line segs={eyebrowSegs(title(), props.width, { count: `${fmtCredits(sem().credits)} credits` })} />
      <Gap />
      <For each={shown()}>
        {(c, i) => {
          const index = () => start() + i()
          const hot = () => index() === cursor()
          const changed = () => c.grade !== real().courses[index()]?.grade
          // A click on a subject opens the simulator on it.
          const click = () => {
            const flat = subjects().findIndex((x) => x.semester === props.semester && x.index === index())
            if (!s.results.simulating) store.actions.setResults({ simulating: true })
            store.actions.setDetail(flat)
          }
          return (
            <Line
              onMouseDown={click}
              bg={hot() ? color.accentSoft : undefined}
              segs={[
                { text: hot() ? "▌ " : "  ", fg: color.accent },
                { text: fit(c.name, nameW()), fg: hot() ? color.strong : color.text, bold: hot() || undefined },
                { text: "  " },
                { text: (c.credits ? `${fmtCredits(c.credits)} cr` : "").padStart(creditW), fg: color.muted },
                { text: "  " },
                { text: gradeText(index()).padStart(gradeW()), fg: changed() ? color.accent : tone(c.points), bold: true },
              ]}
            />
          )
        }}
      </For>
      <Show when={more()}>
        <Line segs={[{ text: `  +${sem().courses.length - start() - shown().length} more`, fg: color.faint }]} />
      </Show>
    </box>
  )
}

function Revaluation(props: { width: number; height: number }) {
  const ctx = useApp()
  const { store } = ctx
  const s = store.state
  const apps = () => s.results.applications ?? []
  const selected = () => Math.min(s.detailIndex, Math.max(0, apps().length - 1))
  const app = () => apps()[selected()]
  const sideBySide = () => props.width >= 72
  const leftW = () => (sideBySide() ? Math.min(40, Math.floor((props.width - COLUMN_GAP) * 0.36)) : props.width)
  const rightW = () => (sideBySide() ? props.width - COLUMN_GAP - leftW() : props.width)
  const room = () => Math.max(1, (sideBySide() ? props.height : Math.min(apps().length + 2, Math.floor(props.height / 2))) - 2)
  const start = createMemo(() => windowStart(apps().length, selected(), room()))
  const windows = () => (s.results.revaluation ?? []).filter((e) => e.open)
  const pending = (a: RevaluationApplication) => a.items?.filter((x) => !x.processed).length ?? 0

  return (
    <Show
      when={s.results.applications !== null}
      fallback={
        <>
          <Line segs={[{ text: "Couldn't load your revaluation applications.", fg: color.muted }]} />
          <Line segs={[{ text: "Press r to try again.", fg: color.faint }]} />
        </>
      }
    >
      <Show
        when={apps().length}
        fallback={
          <>
            <Line segs={[{ text: "No revaluation applications.", fg: color.muted }]} />
            <Show when={windows()[0]}>
              {(w) => <Line segs={[{ text: fit(`The window is open for ${w().exam}: ${w().window}`, props.width).trimEnd(), fg: color.warn }]} />}
            </Show>
          </>
        }
      >
        <box flexDirection={sideBySide() ? "row" : "column"} columnGap={COLUMN_GAP} rowGap={1} flexShrink={0}>
          <box flexDirection="column" width={leftW()} flexShrink={0}>
            <Line segs={eyebrowSegs("Applications", leftW(), { count: apps().length })} />
            <Gap />
            <For each={apps().slice(start(), start() + room())}>
              {(a, i) => {
                const index = () => start() + i()
                const on = () => index() === selected()
                const hot = () => on() && s.focus === "detail"
                const state = () => (a.items === null ? a.status || "—" : pending(a) ? `${pending(a)} pending` : "done")
                return (
                  <Line
                    onMouseDown={() => store.actions.setDetail(index())}
                    bg={hot() ? color.accentSoft : on() ? color.raised : undefined}
                    segs={[
                      { text: on() ? "▌ " : "  ", fg: hot() ? color.accent : color.lineStrong },
                      { text: fit(a.appNo, Math.max(4, leftW() - 2 - len(state()) - 1)), fg: on() ? color.strong : color.text, bold: on() || undefined },
                      { text: " " },
                      { text: state(), fg: a.items === null ? color.muted : pending(a) ? color.warn : color.ok },
                    ]}
                  />
                )
              }}
            </For>
          </box>
          <Show when={app()}>
            {(a) => <ApplicationDetail app={a()} width={rightW()} />}
          </Show>
        </box>
      </Show>
    </Show>
  )
}

function ApplicationDetail(props: { app: RevaluationApplication; width: number }) {
  const facts = () =>
    [
      props.app.applied && `applied ${props.app.applied}`,
      props.app.amount && `Rs ${props.app.amount}`,
      props.app.paid && `paid ${props.app.paid}${props.app.paymentType ? ` (${props.app.paymentType})` : ""}`,
    ]
      .filter(Boolean)
      .join(" · ")
  const STATUS_W = 9 // "processed"
  const kindW = () => Math.min(14, Math.max(0, ...(props.app.items ?? []).map((x) => len(x.kind))))
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <Line segs={eyebrowSegs(`Application ${props.app.appNo}`, props.width, { count: props.app.status })} />
      <Line segs={[{ text: fit(facts(), props.width).trimEnd(), fg: color.muted }]} />
      <Gap />
      <Show when={props.app.items} fallback={<Line segs={[{ text: fit("Couldn't read this application's progress. Press r to retry.", props.width).trimEnd(), fg: color.muted }]} />}>
        {(items) => (
          <Show when={items().length} fallback={<Line segs={[{ text: "No subjects listed on this application.", fg: color.muted }]} />}>
            <For each={items()}>
              {(it) => (
                <Line
                  segs={[
                    { text: fit(`${it.code ? `${it.code}  ` : ""}${it.subject}`, Math.max(4, props.width - kindW() - 2 - STATUS_W - 2)), fg: color.text },
                    { text: "  " },
                    { text: fit(it.kind, kindW()), fg: color.muted },
                    { text: "  " },
                    { text: (it.processed ? "processed" : "pending").padStart(STATUS_W), fg: it.processed ? color.ok : color.warn, bold: true },
                  ]}
                />
              )}
            </For>
          </Show>
        )}
      </Show>
    </box>
  )
}

// ── Statistics ─────────────────────────────────────────────────────────────────────────────────
// The GPA calculator's Statistics tab in text: grade progression, credits by grade, semester breakdown.

const TIER_COLOR = { top: color.ok, good: color.accent, fair: color.warn, fail: color.low } as const
const TIER_TONE = { top: "ok", good: "accent", fair: "warn", fail: "low" } as const
const tierColor = (points: number) => TIER_COLOR[gradeTier(points)]
const tierTone = (points: number) => TIER_TONE[gradeTier(points)]

function Statistics(props: { width: number; height: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const results = () => simulated(s)!
  const rows = createMemo(() => semesterBreakdown(results()))
  const dist = createMemo(() => creditsByGrade(results()))
  const wide = () => props.width >= 80
  const distW = () => (wide() ? Math.min(36, Math.floor((props.width - COLUMN_GAP) * 0.36)) : props.width)
  const chartW = () => (wide() ? props.width - COLUMN_GAP - distW() : props.width)
  // The table (eyebrow, blank, header, a row per semester) goes under the charts when they keep 10 rows.
  const tableH = () => rows().length + 3
  const showTable = () => props.height - tableH() - 2 >= 10
  const top = () => (showTable() ? props.height - tableH() - 2 : props.height)
  // Stacked, the distribution goes under the chart when both fit.
  const distH = () => dist().grades.length + 2
  const stackDist = () => !wide() && top() - distH() - 1 >= 8
  const chartH = () => (wide() ? top() : stackDist() ? top() - distH() - 1 : top())

  return (
    <Show when={results().semesters.length} fallback={<Line segs={[{ text: "No results to chart yet.", fg: color.muted }]} />}>
      <box flexDirection="column" flexShrink={0}>
        <box flexDirection={wide() ? "row" : "column"} columnGap={COLUMN_GAP} rowGap={1} flexShrink={0}>
          <Progression width={chartW()} height={chartH()} />
          <Show when={wide() || stackDist()}>
            <Distribution width={distW()} />
          </Show>
        </box>
        <Show when={showTable()}>
          <Gap rows={2} />
          <Breakdown width={props.width} />
        </Show>
      </box>
    </Show>
  )
}

function Progression(props: { width: number; height: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const points = createMemo(() => progression(simulated(s)!))
  const roleColor: Record<ChartRole, string | undefined> = { axis: color.lineStrong, label: color.faint, line: color.accent, dot: color.strong, blank: undefined }
  const chart = createMemo(() =>
    lineChart({
      dots: points().map((p) => p.sgpa),
      line: points().map((p) => p.cgpa),
      labels: points().map((p) => `S${p.term}`),
      width: props.width,
      height: Math.max(4, props.height - 2),
      braille: ctx.nerd,
    }),
  )
  const legend = (): Seg[] => [
    { text: "●", fg: color.strong },
    { text: " SGPA   ", fg: color.muted },
    { text: ctx.nerd ? "⠤⠤" : "··", fg: color.accent },
    { text: " CGPA", fg: color.muted },
  ]
  const LEGEND_W = 16
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <box flexDirection="row" height={1} flexShrink={0}>
        <Line segs={eyebrowSegs("Grade progression", Math.max(4, props.width - LEGEND_W - 2))} />
        <box flexGrow={1} />
        <Show when={props.width >= 36}>
          <Line segs={legend()} />
        </Show>
      </box>
      <Gap />
      <For each={chart()}>{(row) => <Line segs={row.map((c) => ({ text: c.text, fg: roleColor[c.role] }))} />}</For>
    </box>
  )
}

function Distribution(props: { width: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const dist = createMemo(() => creditsByGrade(simulated(s)!))
  const GRADE_W = 3
  const PCT_W = 4
  const numW = () => Math.max(2, ...dist().grades.map((g) => len(fmtCredits(g.credits))))
  const meterW = () => Math.max(4, props.width - GRADE_W - 1 - 1 - numW() - 1 - PCT_W)
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <Line segs={eyebrowSegs("Credits by grade", props.width, { count: `${fmtCredits(dist().total)} cr` })} />
      <Gap />
      <Show when={dist().grades.length} fallback={<Line segs={[{ text: "No graded credits yet.", fg: color.muted }]} />}>
        <For each={dist().grades}>
          {(g) => (
            <Line
              segs={[
                { text: g.grade.padEnd(GRADE_W), fg: tierColor(g.points), bold: true },
                { text: " " },
                ...meterSegs({ ratio: g.frac, width: meterW(), tone: tierTone(g.points), style: "line" }),
                { text: " " },
                { text: fmtCredits(g.credits).padStart(numW()), fg: color.text },
                { text: `${Math.round(g.frac * 100)}%`.padStart(PCT_W + 1), fg: color.faint },
              ]}
            />
          )}
        </For>
      </Show>
    </box>
  )
}

function Breakdown(props: { width: number }) {
  const ctx = useApp()
  const s = ctx.store.state
  const scheme = () => s.results.data!.scheme
  const rows = createMemo(() => semesterBreakdown(simulated(s)!))
  const COLS = { sem: 9, credits: 8, sgpa: 7, delta: 8, cgpa: 7 }
  const fixed = COLS.sem + COLS.credits + COLS.sgpa + COLS.delta + COLS.cgpa + 2
  const showGrades = () => props.width - fixed >= 6
  const right = (text: string, w: number) => text.padStart(w)
  const deltaText = (d: number | null) => (d === null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(2)}`)
  const badges = (grades: Array<[string, number]>): Seg[] =>
    grades.flatMap(([g, n], i): Seg[] => {
      const pts = gradePoints(g, scheme())
      return [{ text: i ? " " : "" }, { text: n > 1 ? `${g}×${n}` : g, fg: pts === null ? color.faint : tierColor(pts), bold: true }]
    })
  return (
    <box flexDirection="column" width={props.width} flexShrink={0}>
      <Line segs={eyebrowSegs("Semester breakdown", props.width)} />
      <Gap />
      <Line
        segs={[
          { text: "SEMESTER".padEnd(COLS.sem), fg: color.faint },
          { text: right("CREDITS", COLS.credits), fg: color.faint },
          { text: right("SGPA", COLS.sgpa), fg: color.faint },
          { text: right("CHANGE", COLS.delta), fg: color.faint },
          { text: right("CGPA", COLS.cgpa), fg: color.faint },
          { text: "  " },
          { text: showGrades() ? "GRADES" : "", fg: color.faint },
        ]}
      />
      <For each={rows()}>
        {(r) => (
          <Line
            segs={[
              { text: `Sem ${r.term}`.padEnd(COLS.sem), fg: color.text },
              { text: right(fmtCredits(r.credits), COLS.credits), fg: color.muted },
              { text: right(gpaLabel(r.sgpa), COLS.sgpa), fg: color.strong, bold: true },
              { text: right(deltaText(r.delta), COLS.delta), fg: r.delta === null || r.delta === 0 ? color.faint : r.delta > 0 ? color.ok : color.low },
              { text: right(gpaLabel(r.cgpa), COLS.cgpa), fg: color.muted },
              { text: "  " },
              ...(showGrades() ? badges(r.grades) : []),
            ]}
          />
        )}
      </For>
    </box>
  )
}

// ── Sign-in form ───────────────────────────────────────────────────────────────────────────────

type Field = "regno" | "password" | "remember" | "submit"
const FIELDS: Field[] = ["regno", "password", "remember", "submit"]

function PortalSignIn(props: { width: number }) {
  const ctx = useApp()
  const { store, services, nerd } = ctx
  const s = store.state
  const [regno, setRegno] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [remember, setRemember] = createSignal(true)
  const [field, setField] = createSignal<Field>("regno")
  const [hint, setHint] = createSignal<string | null>(null)

  const width = () => Math.min(56, props.width)
  const inner = () => width() - 6
  const editing = () => s.results.editing && s.selectedId === RESULTS_ROW
  const active = (f: Field) => editing() && field() === f

  const move = (step: number) => setField((f) => FIELDS[(FIELDS.indexOf(f) + step + FIELDS.length) % FIELDS.length]!)
  const submit = () => {
    if (s.results.signingIn) return
    if (!regno().trim() || !password()) return void setHint("Enter your registration number and password.")
    setHint(null)
    services.portalSignIn(regno().trim(), password(), remember())
  }
  const focus = (f: Field) => () => {
    if (!editing()) enterResults(ctx)
    store.actions.setResults({ editing: true })
    setField(f)
  }

  useKeyboard((k) => {
    if (!editing() || s.phase !== "main" || s.overlay) return
    if (k.name === "tab") return move(k.shift ? -1 : 1)
    if (k.name === "down") return move(1)
    if (k.name === "up") return move(-1)
    if (k.name === "return") return submit()
    if (field() === "remember" && k.name === "space") return setRemember((r) => !r)
    // Drawn as dots, so its keys are handled here rather than by an <input>.
    if (field() === "password") {
      if (k.name === "backspace") setPassword((p) => p.slice(0, -1))
      else if (!k.ctrl && !k.meta && k.sequence.length === 1 && k.sequence >= " ") setPassword((p) => p + k.sequence)
    }
  })
  usePaste((e) => {
    if (!editing() || field() !== "password") return
    e.preventDefault()
    setPassword((p) => p + new TextDecoder().decode(e.bytes).replace(/[\r\n]/g, ""))
  })

  const label = (text: string, f: Field): Seg[] => [{ text: text.toUpperCase(), fg: active(f) ? color.text : color.muted }]
  const bar = (f: Field): Seg => ({ text: active(f) ? "▌ " : "  ", fg: color.accent })
  const error = () => hint() ?? s.results.message

  return (
    <box flexDirection="column" flexShrink={0}>
      <Line segs={[{ text: fit("Your SGPA and CGPA come from UniClaIRE, the university's results portal.", props.width).trimEnd(), fg: color.muted }]} />
      <Show when={!editing()}>
        <Line segs={[{ text: "Press enter to sign in.", fg: color.faint }]} />
      </Show>
      <Gap />
      <Card width={width()} paddingY={1} focused={editing()}>
        <Line segs={label("Registration number", "regno")} onMouseDown={focus("regno")} />
        <box flexDirection="row" height={1} flexShrink={0} backgroundColor={color.raised} onMouseDown={focus("regno")}>
          <Line bg={color.raised} segs={[bar("regno")]} />
          <input
            focused={active("regno")}
            value={regno()}
            onInput={(v: string) => setRegno(v)}
            placeholder="usually your mobile number"
            width={inner() - 2}
            backgroundColor={color.raised}
            focusedBackgroundColor={color.raised}
            textColor={color.text}
            focusedTextColor={color.strong}
            placeholderColor={color.faint}
          />
        </box>
        <Gap />
        <Line segs={label("Portal password", "password")} onMouseDown={focus("password")} />
        <Line
          onMouseDown={focus("password")}
          bg={color.raised}
          segs={[
            bar("password"),
            password() ? { text: "•".repeat(Math.min(password().length, inner() - 3)), fg: color.strong } : { text: active("password") ? "" : "not your MyDy password", fg: color.faint },
            { text: active("password") ? "_" : "", fg: color.accent },
          ]}
        />
        <Line segs={error() ? [{ text: fit(error()!, inner()).trimEnd(), fg: color.low }] : []} />
        <Line
          onMouseDown={() => {
            focus("remember")()
            setRemember((r) => !r)
          }}
          segs={[
            { text: slot(remember() ? "marked" : "unmarked", nerd), fg: remember() ? color.accent : color.faint },
            { text: "Remember on this computer", fg: active("remember") ? color.strong : color.text },
          ]}
        />
        <Gap />
        <Line
          onMouseDown={() => {
            focus("submit")()
            submit()
          }}
          bg={active("submit") ? color.accent : color.raised}
          segs={[{ text: center(s.results.signingIn ? "Signing in…" : "Sign in", inner()), fg: active("submit") ? color.onAccent : color.text, bold: true }]}
        />
      </Card>
    </box>
  )
}
