import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { Show } from "solid-js"
import { color } from "../theme"
import { Footer, NeedsYouStrip, stripVisible, TopBar } from "./Chrome"
import { useApp } from "./context"
import { CourseDetail } from "./CourseDetail"
import { CourseList } from "./CourseList"
import { handleKey } from "./keys"
import { DownloadDrawer, Help, ToastView } from "./Overlays"
import { SignIn } from "./SignIn"

/** Below this width the course list and the detail pane are shown one at a time. */
export const NARROW_WIDTH = 100

export function App() {
  const ctx = useApp()
  const s = ctx.store.state
  const dims = useTerminalDimensions()
  useKeyboard((k) => handleKey(k, ctx))

  const narrow = () => dims().width < NARROW_WIDTH
  const usable = () => Math.max(20, dims().width - 4)
  const listWidth = () => (narrow() ? usable() : Math.min(56, Math.max(44, Math.floor(usable() * 0.44))))
  const detailWidth = () => (narrow() ? usable() : usable() - listWidth())
  // top bar, gap, [strip], panes, [drawer], footer
  const bodyHeight = () =>
    Math.max(6, dims().height - 2 - (stripVisible(s, ctx.now(), ctx.threshold) ? 1 : 0) - (s.download?.visible ? 5 : 0) - 1)

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color.bg}>
      <Show
        when={s.phase !== "signin"}
        fallback={<SignIn />}
      >
        <TopBar />
        <box height={1} flexShrink={0} />
        <NeedsYouStrip />
        <box flexDirection="row" paddingX={2} height={bodyHeight()} flexShrink={0}>
          <Show when={!narrow() || s.focus === "list"}>
            <CourseList width={listWidth()} height={bodyHeight()} />
          </Show>
          <Show when={!narrow() || s.focus === "detail"}>
            <CourseDetail width={detailWidth()} height={bodyHeight()} />
          </Show>
        </box>
        <box flexGrow={1} />
        <Show when={s.download?.visible}>
          <DownloadDrawer width={usable()} />
        </Show>
        <Footer />
      </Show>
      <Show when={s.overlay === "help"}>
        <Help />
      </Show>
      <ToastView />
    </box>
  )
}
