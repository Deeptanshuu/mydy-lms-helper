import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, For, Show } from "solid-js"
import { needsYouFor } from "../derive"
import { fit, formatAge } from "../format"
import { slot } from "../icons"
import type { AppState } from "../state"
import { color } from "../theme"
import { useApp } from "./context"
import { pressKey } from "./keys"
import { Line, type Seg } from "./Line"

export function TopBar() {
  const { store, nerd, now, services } = useApp()
  const s = store.state
  const context = () => [s.attendance?.batch, s.attendance?.semester].filter(Boolean).join(", ")
  const status = (): Seg => {
    const age = s.sync.lastSynced ? formatAge(now().getTime() - s.sync.lastSynced) : null
    switch (s.sync.status) {
      case "syncing":
        return { text: `${slot("refresh", nerd)}${s.sync.message ?? "syncing"}`, fg: color.muted }
      case "offline":
        return { text: `${slot("alert", nerd)}offline${age ? `, from ${age}` : ""}`, fg: color.low }
      case "error":
        return { text: `${slot("alert", nerd)}${s.sync.message ?? "something went wrong"}`, fg: color.low }
      default:
        return { text: age ? `${slot("refresh", nerd)}synced ${age}` : "", fg: color.muted }
    }
  }
  return (
    <box flexDirection="row" justifyContent="space-between" backgroundColor={color.bar} paddingX={2} height={1} flexShrink={0}>
      <Line
        segs={[
          { text: slot("app", nerd), fg: color.accent },
          { text: "MyDy", fg: color.strong, bold: true },
          { text: context() ? `   ${context()}` : "", fg: color.muted },
        ]}
      />
      <Line segs={[status()]} onMouseDown={() => services.refresh()} />
    </box>
  )
}

export function stripVisible(s: AppState, now: Date, threshold: number): boolean {
  return s.sync.status === "offline" || needsYouFor(s, now, threshold).length > 0
}

/** "Needs you" strip: what to act on across the current semester, or the offline notice. Items are clickable. */
export function NeedsYouStrip() {
  const { store, nerd, now, threshold } = useApp()
  const s = store.state
  const items = createMemo(() => needsYouFor(s, now(), threshold))
  const offline = (): Seg[] => [
    { text: "Can't reach mydy.dypatil.edu.", fg: color.low },
    { text: " Check your connection, then press ", fg: color.muted },
    { text: "r", fg: color.accent },
    { text: " to retry.", fg: color.muted },
  ]
  const dims = useTerminalDimensions()
  const badge = () => ` ${slot("alert", nerd)}needs you `
  // Only what fits: whole items first, then a title on its own. Never cut a word at the edge.
  const shown = createMemo(() => {
    let room = dims().width - 4 - [...badge()].length
    const out: Array<{ item: ReturnType<typeof items>[number]; title: string; detail: string }> = []
    for (const item of items().slice(0, 2)) {
      const title = [...item.title].length
      const full = 3 + title + 2 + [...item.detail].length
      if (full <= room) {
        out.push({ item, title: item.title, detail: item.detail })
        room -= full
        continue
      }
      if (out.length === 0) out.push({ item, title: fit(item.title, room - 3).trimEnd(), detail: "" })
      else if (3 + title <= room) out.push({ item, title: item.title, detail: "" })
      break
    }
    return out
  })
  const open = (courseId: string, kind: "attendance" | "deadline") => {
    store.actions.select(courseId)
    store.actions.setTab(kind === "deadline" ? "assignments" : "files")
    store.actions.setFocus("detail")
  }
  return (
    <Show when={s.sync.status === "offline" || items().length > 0}>
      <Show
        when={s.sync.status !== "offline"}
        fallback={<Line bg={color.strip} paddingX={2} segs={offline()} />}
      >
        <box flexDirection="row" height={1} flexShrink={0} backgroundColor={color.strip} paddingX={2}>
          <Line segs={[{ text: badge(), bg: color.accent, fg: color.onAccent, bold: true }]} />
          <For each={shown()}>
            {(entry) => (
              <Line
                segs={[
                  { text: `   ${entry.title}`, fg: entry.item.severity === "low" ? color.low : color.warn },
                  ...(entry.detail ? [{ text: `  ${entry.detail}`, fg: color.muted }] : []),
                ]}
                onMouseDown={() => open(entry.item.courseId, entry.item.kind)}
              />
            )}
          </For>
        </box>
      </Show>
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
  if (s.focus === "detail") {
    const keys: Key[] = [["↑↓", "move"], ["tab", "next tab"]]
    if (s.tab === "announcements") keys.push(["enter", "read"])
    if (s.tab !== "grades") keys.push(["o", "open in browser"])
    keys.push(["esc", "back"], ["?", "help"], ["q", "quit"])
    return keys
  }
  return [["↑↓", "move"], ["enter", "open"], ["space", "mark"], ["d", "download"], ["tab", "next tab"], ["/", "filter"], ["r", "refresh"], ["?", "help"], ["q", "quit"]]
}

// Dropped first when the footer is too narrow; "? help", "q quit" and "esc" always stay.
const DROP_ORDER = ["tab", "r", "enter", "/", "↑↓", "space", "o", "d", "x"]

export function fitKeys(keys: Key[], width: number): Key[] {
  const size = (ks: Key[]) => ks.reduce((n, [k, l], i) => n + (i ? 3 : 0) + [...k].length + 1 + l.length, 0)
  const out = [...keys]
  for (const drop of DROP_ORDER) {
    if (size(out) <= width) break
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
  const keys = () => fitKeys(footerKeys(ctx.store.state), dims().width - 4)
  return (
    <box flexDirection="row" height={1} flexShrink={0} backgroundColor={color.bar} paddingX={2}>
      <For each={keys()}>
        {([key, label], i) => (
          <Line
            segs={[
              { text: `${i() ? "   " : ""}${key}`, fg: color.accent },
              { text: ` ${label}`, fg: color.muted },
            ]}
            onMouseDown={() => pressKey(KEY_NAMES[key] ?? key, ctx)}
          />
        )}
      </For>
    </box>
  )
}
