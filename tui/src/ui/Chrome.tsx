import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, For, Show } from "solid-js"
import { needsYouFor } from "../derive"
import { fit, formatAge } from "../format"
import { slot } from "../icons"
import { OVERVIEW_ROW, type AppState } from "../state"
import { color } from "../theme"
import { useApp } from "./context"
import { Dither, keepClear } from "./Dither"
import { pressKey } from "./keys"
import { Line, type Seg } from "./Line"
import { Gap, keySegs, keyWidth, Wordmark, wordmarkWidth } from "./kit"

const len = (s: string) => [...s].length

/** Rows the header takes at a given terminal height (App lays out the panes with it). */
export function headerRows(termHeight: number): number {
  return termHeight >= 28 ? 5 : 1
}
/** Rows the footer key bar takes. */
export const FOOTER_ROWS = 1

/** Air between the wordmark and the identity block. */
const WORDMARK_GAP = 3

/** Sync status as quiet text: faint when all is well, a small dot for the state, `low` only when it went wrong. */
function syncSegs(s: AppState, nowMs: number): Seg[] {
  const age = s.sync.lastSynced ? formatAge(nowMs - s.sync.lastSynced) : null
  switch (s.sync.status) {
    case "syncing":
      return [{ text: "● ", fg: color.accent }, { text: s.sync.message ?? "syncing", fg: color.muted }]
    case "offline":
      return [{ text: "● ", fg: color.low }, { text: `offline${age ? `, from ${age}` : ""}`, fg: color.low }]
    case "error":
      return [{ text: "● ", fg: color.low }, { text: s.sync.message ?? "something went wrong", fg: color.low }]
    default:
      return age ? [{ text: "● ", fg: color.ok }, { text: `synced ${age}`, fg: color.faint }] : []
  }
}

/** Cuts `segs` to `room` cells with an ellipsis on the segment that overflows. */
function clip(segs: Seg[], room: number): Seg[] {
  let left = room
  return segs.map((seg) => {
    const text = len(seg.text) <= left ? seg.text : fit(seg.text, Math.max(0, left)).trimEnd()
    left -= len(text)
    return { ...seg, text }
  })
}
const width = (segs: Seg[]) => segs.reduce((n, seg) => n + len(seg.text), 0)

export function TopBar() {
  const { store, nerd, now, services, animate } = useApp()
  const s = store.state
  const dims = useTerminalDimensions()
  const usable = () => dims().width - 4
  const context = () => [s.attendance?.batch, s.attendance?.semester].filter(Boolean).join(", ")
  const refresh = () => services.refresh()
  const wordmarkW = wordmarkWidth()

  // Identity: the batch and semester as the heading, the account under it as a caption.
  const heading = (): Seg[] => {
    const parts = [s.attendance?.batch, s.attendance?.semester].filter(Boolean) as string[]
    if (!parts.length) return [{ text: "Your courses", fg: color.strong, bold: true }]
    return parts.flatMap((p, i) => [...(i ? [{ text: " · ", fg: color.faint }] : []), { text: p, fg: color.strong, bold: true }])
  }
  const who = (): Seg[] => (s.user ? [{ text: s.user, fg: color.muted }] : [])
  const status = () => syncSegs(s, now().getTime())
  // The status keeps its place on the right; the identity is cut before it can run into it.
  const statusRoom = () => Math.max(10, Math.floor(usable() / 2))
  const statusClipped = () => clip(status(), statusRoom())
  const leftRoom = () => Math.max(8, usable() - wordmarkW - WORDMARK_GAP - width(statusClipped()) - 3)
  const headerMask = () => {
    const identityX = 2 + wordmarkW + WORDMARK_GAP
    const identityW = Math.max(width(clip(heading(), usable() - wordmarkW - WORDMARK_GAP)), width(clip(who(), leftRoom())))
    const statusW = width(statusClipped())
    return keepClear(
      [
        { x: 2, y: 1, width: wordmarkW, height: 3 },
        { x: identityX, y: 1, width: identityW, height: 2 },
        { x: dims().width - 2 - statusW, y: 2, width: statusW, height: 1 },
      ],
      6,
    )
  }

  return (
    <Show
      when={headerRows(dims().height) > 1}
      fallback={
        <box flexDirection="row" justifyContent="space-between" backgroundColor={color.bar} paddingX={2} height={1} flexShrink={0}>
          <Line
            segs={clip(
              [
                { text: slot("app", nerd), fg: color.accent },
                { text: "MyDy", fg: color.strong, bold: true },
                { text: context() ? `   ${context()}` : "", fg: color.muted },
              ],
              usable() - width(statusClipped()) - 2,
            )}
          />
          <Line segs={statusClipped()} onMouseDown={refresh} />
        </box>
      }
    >
      <box flexDirection="column" backgroundColor={color.bar} paddingX={2} height={5} flexShrink={0}>
        {/* The website's dithered waves drift through the empty middle of the band, kept clear of every word. */}
        <Dither position="absolute" top={0} left={0} width="100%" height="100%" mask={headerMask()} animate={animate} />
        <Gap />
        <box flexDirection="row" height={3} flexShrink={0}>
          <Wordmark blink={animate} />
          <box width={WORDMARK_GAP} flexShrink={0} />
          <box flexDirection="column" flexGrow={1}>
            <Line segs={clip(heading(), usable() - wordmarkW - WORDMARK_GAP)} />
            <box flexDirection="row" justifyContent="space-between" height={1} flexShrink={0}>
              <Line segs={clip(who(), leftRoom())} />
              <Line segs={statusClipped()} onMouseDown={refresh} />
            </box>
          </box>
        </box>
        <Gap />
      </box>
    </Show>
  )
}

/** Whether there is anything to say: the offline notice always, needs-you items unless the Overview already lists them. */
export function stripVisible(s: AppState, now: Date, threshold: number): boolean {
  if (s.sync.status === "offline") return true
  return s.selectedId !== OVERVIEW_ROW && needsYouFor(s, now, threshold).length > 0
}

/** Below this many terminal rows the strip gives up its breathing row. */
const STRIP_AIR_HEIGHT = 30

/**
 * Rows the "needs you" strip takes (0 when hidden): the line itself, plus a blank row under it on a tall
 * terminal. Pass the terminal height; without it the roomy answer is assumed, which only wastes a row.
 */
export function stripRows(s: AppState, now: Date, threshold: number, termHeight = Number.POSITIVE_INFINITY): number {
  if (!stripVisible(s, now, threshold)) return 0
  return termHeight >= STRIP_AIR_HEIGHT ? 2 : 1
}

type NeedsItem = ReturnType<typeof needsYouFor>[number]
type Entry = { item: NeedsItem; title: string; detail: string }

/** Cells between two items. */
const ITEM_GAP = 3
/** Cells one item takes: the dot and a space, the title, two spaces, the detail. */
const entryWidth = (e: { title: string; detail: string }) => 2 + len(e.title) + (e.detail ? 2 + len(e.detail) : 0)

/**
 * The items that fit in `room` cells: whole items first, then whole titles without their detail. A word
 * is never cut at the edge (except a lone first title, with "…"). `used` is the cells taken, gaps included.
 */
export function fitEntries(items: NeedsItem[], room: number): { entries: Entry[]; used: number } {
  const candidates = items.slice(0, 2)
  const total = (entries: Entry[]) => entries.reduce((n, e, i) => n + (i ? ITEM_GAP : 0) + entryWidth(e), 0)
  const full = candidates.map((item): Entry => ({ item, title: item.title, detail: item.detail }))
  if (total(full) <= room) return { entries: full, used: total(full) }
  const entries: Entry[] = []
  for (const item of candidates) {
    const left = room - total(entries) - (entries.length ? ITEM_GAP : 0)
    if (entryWidth(item) <= left) entries.push({ item, title: item.title, detail: item.detail })
    else if (entries.length === 0) entries.push({ item, title: fit(item.title, Math.max(1, left - 2)).trimEnd(), detail: "" })
    else if (entryWidth({ title: item.title, detail: "" }) <= left) entries.push({ item, title: item.title, detail: "" })
    else break
    if (entries[entries.length - 1]!.detail === "") break
  }
  return { entries, used: total(entries) }
}

const NEEDS_LABEL = "NEEDS YOU"
/** Content starts 2 cells in, like the panes; one cell is kept free on the right. */
const LEAD = 2
const RIGHT = 1
const AFTER_LABEL = 3
const OFFLINE_FULL = "Can't reach mydy.dypatil.edu. Check your connection, then press r to retry."
const OFFLINE_SHORT = "Can't reach mydy.dypatil.edu. Press r to retry."

/**
 * "Needs you": one quiet line of what to act on this semester. Each item is a small dot in its severity
 * colour, the title, and the detail in muted ink. Items are clickable. Offline it says so, in `low`.
 */
export function NeedsYouStrip() {
  const { store, now, threshold } = useApp()
  const s = store.state
  const dims = useTerminalDimensions()
  const items = createMemo(() => needsYouFor(s, now(), threshold))
  const offline = () => s.sync.status === "offline"
  const rows = () => stripRows(s, now(), threshold, dims().height)
  const room = () => dims().width - LEAD - RIGHT - len(NEEDS_LABEL) - AFTER_LABEL
  const laidOut = createMemo(() => fitEntries(items(), room()))
  const hidden = () => items().length - laidOut().entries.length

  const open = (courseId: string, kind: "attendance" | "deadline") => {
    store.actions.select(courseId)
    store.actions.setTab(kind === "deadline" ? "assignments" : "files")
    store.actions.setFocus("detail")
  }

  return (
    <Show when={stripVisible(s, now(), threshold)}>
      <box flexDirection="column" height={rows()} flexShrink={0}>
        <box flexDirection="row" height={1} flexShrink={0} paddingLeft={LEAD}>
          <Show
            when={!offline()}
            fallback={<Line segs={[{ text: len(OFFLINE_FULL) <= dims().width - LEAD - RIGHT ? OFFLINE_FULL : OFFLINE_SHORT, fg: color.low }]} />}
          >
            <Line segs={[{ text: NEEDS_LABEL, fg: color.muted }, { text: " ".repeat(AFTER_LABEL) }]} />
            <For each={laidOut().entries}>
              {(entry, i) => (
                <>
                  <Show when={i() > 0}>
                    <box width={ITEM_GAP} flexShrink={0} />
                  </Show>
                  <Line
                    segs={[
                      { text: "● ", fg: color[entry.item.severity] },
                      { text: entry.title, fg: color.text },
                      ...(entry.detail ? [{ text: `  ${entry.detail}`, fg: color.muted }] : []),
                    ]}
                    onMouseDown={() => open(entry.item.courseId, entry.item.kind)}
                  />
                </>
              )}
            </For>
            <Show when={hidden() > 0 && room() - laidOut().used >= 12}>
              <Line segs={[{ text: `   +${hidden()} more`, fg: color.faint }]} />
            </Show>
          </Show>
        </box>
        <Show when={rows() > 1}>
          <Gap rows={rows() - 1} />
        </Show>
      </box>
    </Show>
  )
}

type Key = [key: string, label: string]

export function footerKeys(s: AppState): Key[] {
  if (s.overlay === "help") return [["esc", "close help"]]
  if (s.filtering) return [["enter", "open"], ["↑↓", "move"], ["esc", "clear filter"]]
  if (s.download?.visible) {
    return s.download.active ? [["x", "cancel"], ["o", "open folder"], ["esc", "hide panel"]] : [["o", "open folder"], ["esc", "close panel"]]
  }
  if (s.focus === "detail" && s.selectedId === OVERVIEW_ROW) {
    return [["↑↓", "move"], ["enter", "open course"], ["o", "open in browser"], ["esc", "back"], ["?", "help"], ["q", "quit"]]
  }
  if (s.focus === "detail") {
    const keys: Key[] = [["↑↓", "move"], ["tab", "next tab"]]
    if (s.tab === "announcements") keys.push(["enter", "read"])
    if (s.tab !== "grades") keys.push(["o", "open in browser"])
    keys.push(["esc", "back"], ["?", "help"], ["q", "quit"])
    return keys
  }
  // "r refresh" and "tab next tab" work here too; they live in the help, not the footer.
  if (s.selectedId === OVERVIEW_ROW) return [["↑↓", "move"], ["enter", "open"], ["/", "filter"], ["r", "refresh"], ["?", "help"], ["q", "quit"]]
  return [["↑↓", "move"], ["enter", "open"], ["space", "mark"], ["d", "download"], ["/", "filter"], ["?", "help"], ["q", "quit"]]
}

// Dropped first when the footer is too narrow; "? help", "q quit" and "esc" always stay.
const DROP_ORDER = ["tab", "r", "enter", "/", "↑↓", "space", "o", "d", "x"]
/** Cells between two hints. */
const KEY_GAP = 3

/** Cells `keys` take with a gap between them. */
function keysWidth(keys: Key[]): number {
  return keys.reduce((n, [k, l], i) => n + (i ? KEY_GAP : 0) + keyWidth(k, l), 0)
}

export function fitKeys(keys: Key[], width: number): Key[] {
  const out = [...keys]
  for (const drop of DROP_ORDER) {
    if (keysWidth(out) <= width) break
    const at = out.findIndex(([k]) => k === drop)
    if (at >= 0) out.splice(at, 1)
  }
  return out
}

// Footer labels map to key names handleKey understands.
const KEY_NAMES: Record<string, string> = { "↑↓": "down", enter: "return", space: "space", esc: "escape" }

export function Footer() {
  const ctx = useApp()
  const dims = useTerminalDimensions()
  // Help and quit sit at the right edge, everything else runs from the left.
  const keys = () => fitKeys(footerKeys(ctx.store.state), dims().width - 4)
  const edge = ([k]: Key) => k === "?" || k === "q"
  const hint = ([key, label]: Key) => <Line segs={keySegs(key, label, ctx.nerd)} onMouseDown={() => pressKey(KEY_NAMES[key] ?? key, ctx)} />
  return (
    <box flexDirection="row" justifyContent="space-between" height={1} flexShrink={0} backgroundColor={color.bar} paddingX={2}>
      <box flexDirection="row" columnGap={KEY_GAP} flexShrink={0}>
        <For each={keys().filter((k) => !edge(k))}>{hint}</For>
      </box>
      <box flexDirection="row" columnGap={KEY_GAP} flexShrink={0}>
        <For each={keys().filter(edge)}>{hint}</For>
      </box>
    </box>
  )
}
