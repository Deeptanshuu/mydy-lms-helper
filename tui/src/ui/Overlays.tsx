import { For, Show } from "solid-js"
import { fit, formatBytes } from "../format"
import { slot } from "../icons"
import { color } from "../theme"
import { useApp } from "./context"
import { Line, type Seg } from "./Line"

const HELP: Array<[title: string, keys: Array<[key: string, label: string]>]> = [
  ["Move around", [
    ["↑ ↓  j k", "move"],
    ["enter", "open course, read post"],
    ["tab", "next tab (shift+tab: previous)"],
    ["/", "filter courses"],
    ["esc", "back, close, clear"],
  ]],
  ["Act", [
    ["space", "mark course for download"],
    ["d", "download marked courses (or this one)"],
    ["o", "open in browser"],
    ["r", "refresh from MyDy"],
    ["q", "quit"],
  ]],
  ["Mouse", [
    ["click", "select; click again to open"],
    ["scroll", "move through lists and posts"],
    ["shift+drag", "select text to copy"],
  ]],
]

export function Help() {
  const { nerd, store } = useApp()
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={10}
      onMouseDown={() => store.actions.setOverlay(null)}
    >
      <box flexDirection="column" backgroundColor={color.panel} paddingX={3} paddingY={1} width={54}>
        <Line segs={[{ text: slot("keys", nerd), fg: color.accent }, { text: "Keys", fg: color.strong, bold: true }]} />
        <For each={HELP}>
          {([title, keys]) => (
            <>
              <box height={1} flexShrink={0} />
              <Line segs={[{ text: title, fg: color.muted }]} />
              <For each={keys}>{([key, label]) => <Line segs={[{ text: `  ${fit(key, 12)}`, fg: color.accent }, { text: label, fg: color.text }]} />}</For>
            </>
          )}
        </For>
        <box height={1} flexShrink={0} />
        <Line segs={[{ text: "esc", fg: color.accent }, { text: " close", fg: color.muted }]} />
      </box>
    </box>
  )
}

export function ToastView() {
  const { store } = useApp()
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
        const actions = (): Seg[] =>
          toast().action === "signin"
            ? [{ text: "enter", fg: color.accent }, { text: " sign in again   ", fg: color.muted }, { text: "esc", fg: color.accent }, { text: " dismiss", fg: color.muted }]
            : [{ text: "esc", fg: color.accent }, { text: " dismiss", fg: color.muted }]
        return (
          <box position="absolute" top={2} right={2} zIndex={20} flexDirection="column" backgroundColor={color.panel} paddingX={2} paddingY={1} width={48} onMouseDown={act}>
            <Line segs={[{ text: toast().title, fg: color.strong, bold: true }]} />
            <text fg={color.muted} wrapMode="word">{toast().detail}</text>
            <box height={1} flexShrink={0} />
            <Line segs={actions()} />
          </box>
        )
      }}
    </Show>
  )
}

export function DownloadDrawer(props: { width: number }) {
  const { store, nerd } = useApp()
  const d = () => store.state.download!
  const ratio = () => (d().total ? d().done / d().total : d().active ? 0 : 1)
  const barWidth = () => Math.max(10, props.width - 10)
  const filled = () => Math.round(ratio() * barWidth())
  const title = () =>
    d().active ? `Downloading ${d().courses} course${d().courses === 1 ? "" : "s"}` : "Download finished"
  const progress = () => (d().total ? `${d().done} of ${d().total} files, ${formatBytes(d().bytes)}` : "")
  const detail = (): Seg[] => [
    { text: (d().active ? d().current ?? d().message : d().message) ?? "", fg: color.muted },
    ...(d().skipped ? [{ text: `   skipped ${d().skipped} already saved`, fg: color.muted }] : []),
  ]
  return (
    <box flexDirection="column" backgroundColor={color.panel} paddingX={2} paddingY={1} flexShrink={0}>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <Line segs={[{ text: slot(d().active ? "downloading" : "done", nerd), fg: color.accent }, { text: title(), fg: color.strong, bold: true }]} />
        <Line segs={[{ text: progress(), fg: color.muted }]} />
      </box>
      <Line
        segs={[
          { text: "█".repeat(filled()), fg: color.accent },
          { text: "░".repeat(barWidth() - filled()), fg: color.line },
          { text: `  ${Math.round(ratio() * 100)}%`, fg: color.strong, bold: true },
        ]}
      />
      <Line segs={detail()} />
    </box>
  )
}
