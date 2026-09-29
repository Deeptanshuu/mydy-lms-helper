import { useTerminalDimensions } from "@opentui/solid"
import { For, Match, Show, Switch } from "solid-js"
import { fit, formatBytes } from "../format"
import { color } from "../theme"
import { FOOTER_ROWS, headerRows } from "./Chrome"
import { useApp } from "./context"
import { Line, type Seg } from "./Line"
import { Card, eyebrowSegs, keySegs, meterSegs, type Tone } from "./kit"

const len = (s: string) => [...s].length

/** A dimming veil over the app behind a modal: the darkest surface at 70%. */
const SCRIM = `${color.bar}B3`

// ── Help ───────────────────────────────────────────────────────────────────────────────────────

type HelpEntry = { keys: string; label: string }
const HELP: Array<[title: string, entries: HelpEntry[]]> = [
  ["Move around", [
    { keys: "↑ ↓  j k", label: "move; the first row is the Overview" },
    { keys: "enter", label: "open course, read post" },
    { keys: "tab", label: "next tab (shift+tab: previous)" },
    { keys: "/", label: "filter courses" },
    { keys: "esc", label: "back, close, clear" },
  ]],
  ["Act", [
    { keys: "space", label: "mark course for download" },
    { keys: "d", label: "download marked courses (or this one)" },
    { keys: "o", label: "open in browser" },
    { keys: "r", label: "refresh from MyDy" },
    { keys: "q", label: "quit" },
  ]],
  ["Mouse", [
    { keys: "click", label: "select; click again to open" },
    { keys: "scroll", label: "move through lists and posts" },
    { keys: "shift+drag", label: "select text to copy" },
  ]],
]

type HelpRow = { kind: "gap" | "title" | "foot" } | { kind: "eyebrow"; text: string } | { kind: "entry"; entry: HelpEntry }

/**
 * The card's rows top to bottom. Tier 1 has a footer and padding; tier 0 (a short terminal) neither, and
 * the "esc close" hint moves up beside the title.
 */
function helpRows(tier: number): HelpRow[] {
  const rows: HelpRow[] = []
  if (tier >= 1) rows.push({ kind: "gap" })
  rows.push({ kind: "title" }, { kind: "gap" })
  HELP.forEach(([text, entries], i) => {
    if (i) rows.push({ kind: "gap" })
    rows.push({ kind: "eyebrow", text })
    rows.push(...entries.map((entry): HelpRow => ({ kind: "entry", entry })))
  })
  if (tier >= 1) rows.push({ kind: "gap" }, { kind: "foot" }, { kind: "gap" })
  return rows
}

const HELP_WIDTH = 64
/** Key column: the longest key ("shift+drag") and some air. */
const HELP_KEYS = 14

export function Help() {
  const { nerd, store } = useApp()
  const dims = useTerminalDimensions()
  const close = () => store.actions.setOverlay(null)
  const tier = () => (dims().height >= 30 ? 1 : 0)
  const rows = () => helpRows(tier())
  const width = () => Math.min(HELP_WIDTH, dims().width - 4)
  const height = () => rows().length + 2
  const inner = () => width() - 6
  const left = () => Math.max(0, Math.floor((dims().width - width()) / 2))
  const top = () => Math.max(0, Math.floor((dims().height - FOOTER_ROWS - height()) / 2))

  const title = () => (
    <box flexDirection="row" justifyContent="space-between" height={1} flexShrink={0}>
      <Line bg={color.overlay} segs={[{ text: "Keys & mouse", fg: color.strong, bold: true }]} />
      <Show when={tier() === 0}>
        <Line bg={color.overlay} segs={keySegs("esc", "close", nerd)} />
      </Show>
    </box>
  )
  const entry = (e: HelpEntry) => (
    <Line
      bg={color.overlay}
      segs={[
        { text: fit(e.keys, HELP_KEYS), fg: color.strong },
        { text: fit(e.label, Math.max(1, inner() - HELP_KEYS)).trimEnd(), fg: color.muted },
      ]}
    />
  )

  return (
    <>
      {/* Everything but the footer is dimmed and closes the help when clicked; the footer stays live. */}
      <box position="absolute" top={0} left={0} width="100%" height={Math.max(1, dims().height - FOOTER_ROWS)} zIndex={10} backgroundColor={SCRIM} onMouseDown={close} />
      <box position="absolute" top={top()} left={left()} zIndex={12}>
        <Card borderColor={color.lineStrong} bg={color.overlay} width={width()} height={height()}>
          <For each={rows()}>
            {(row) => (
              <Switch>
                <Match when={row.kind === "gap"}>
                  <box height={1} flexShrink={0} />
                </Match>
                <Match when={row.kind === "title"}>{title()}</Match>
                <Match when={row.kind === "eyebrow"}>
                  <Line bg={color.overlay} segs={eyebrowSegs((row as { text: string }).text, inner())} />
                </Match>
                <Match when={row.kind === "entry"}>{entry((row as { entry: HelpEntry }).entry)}</Match>
                <Match when={row.kind === "foot"}>
                  <Line bg={color.overlay} segs={keySegs("esc", "close", nerd)} />
                </Match>
              </Switch>
            )}
          </For>
        </Card>
      </box>
    </>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────────────────────────

/** Greedy word wrap to `width` cells (a word longer than a line is cut). */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word
    else if (len(line) + 1 + len(word) <= width) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
    while (len(line) > width) {
      lines.push([...line].slice(0, width).join(""))
      line = [...line].slice(width).join("")
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : [""]
}

const TOAST_WIDTH = 52

export function ToastView() {
  const { store, nerd } = useApp()
  const dims = useTerminalDimensions()
  const act = () => {
    const toast = store.state.toast
    store.actions.setToast(null)
    if (toast?.action === "signin") {
      store.actions.setSignIn(null, false)
      store.actions.setPhase("signin")
    }
  }
  return (
    <Show when={store.state.toast}>
      {(toast) => {
        const tone: Tone = "warn"
        const width = () => Math.min(TOAST_WIDTH, dims().width - 4)
        // The bar takes the first cell, then 2 of padding on the left and 2 on the right.
        const detail = () => wrapWords(toast().detail, width() - 5)
        const height = () => 1 + 1 + detail().length + 1 + 1 + 1
        const top = () => (store.state.phase === "signin" ? 1 : headerRows(dims().height) + 2)
        const actions = (): Seg[] =>
          toast().action === "signin"
            ? [...keySegs("enter", "sign in again", nerd), { text: "   " }, ...keySegs("esc", "dismiss", nerd)]
            : keySegs("esc", "dismiss", nerd)
        // Every row starts with the status-coloured bar, so the toast reads as one block.
        const row = (segs: Seg[]) => <Line bg={color.overlay} segs={[{ text: "▌  ", fg: color[tone], bg: color.overlay }, ...segs]} />
        return (
          <box position="absolute" top={top()} right={2} width={width()} height={height()} zIndex={20} flexDirection="column" backgroundColor={color.overlay} onMouseDown={act}>
            {row([])}
            {row([{ text: toast().title, fg: color.strong, bold: true }])}
            <For each={detail()}>{(text) => row([{ text, fg: color.muted }])}</For>
            {row([])}
            {row(actions())}
            {row([])}
          </box>
        )
      }}
    </Show>
  )
}

// ── Download drawer ────────────────────────────────────────────────────────────────────────────

/** Rows the download drawer takes while visible: a card with a meter, a stats line and the current file. */
export const DRAWER_ROWS = 5

export function DownloadDrawer(props: { width: number }) {
  const { store } = useApp()
  const d = () => store.state.download!
  const ratio = () => (d().total ? d().done / d().total : d().active ? 0 : 1)
  // A download that stopped on an error says so in the meter's colour, not just in the message.
  const stopped = () => !d().active && /^(Can't reach|Download stopped)/.test(d().message ?? "")
  const tone = (): Tone => (d().active ? "accent" : stopped() ? "low" : "ok")
  const title = () => (d().active ? `Downloading ${d().courses} course${d().courses === 1 ? "" : "s"}` : "Download finished")
  const inner = () => Math.max(20, props.width - 6)
  const PCT = 5
  const progress = () => (d().total ? `${d().done} of ${d().total} files, ${formatBytes(d().bytes)}` : "")
  const stats = (): Seg[] => [
    { text: progress(), fg: color.text },
    ...(d().skipped ? [{ text: `${progress() ? "   " : ""}skipped ${d().skipped} already saved`, fg: color.muted }] : []),
    ...(d().failed ? [{ text: `   ${d().failed} failed`, fg: color.low }] : []),
  ]
  const current = () => (d().active ? d().current ?? d().message : d().message) ?? ""
  return (
    <box paddingX={2} height={DRAWER_ROWS} flexShrink={0}>
      <Card title={title()} width={props.width} height={DRAWER_ROWS}>
        <Line
          segs={[
            ...meterSegs({ ratio: ratio(), width: inner() - PCT, tone: tone(), style: "block" }),
            { text: `${Math.round(ratio() * 100)}%`.padStart(PCT), fg: color.strong },
          ]}
        />
        <Line segs={stats()} />
        <Line segs={[{ text: fit(current(), inner()).trimEnd(), fg: color.muted }]} />
      </Card>
    </box>
  )
}
