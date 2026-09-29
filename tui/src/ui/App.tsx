import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { Show } from "solid-js"
import { OVERVIEW_ROW } from "../state"
import { color } from "../theme"
import { Footer, FOOTER_ROWS, headerRows, NeedsYouStrip, stripRows, TopBar } from "./Chrome"
import { useApp } from "./context"
import { CourseDetail } from "./CourseDetail"
import { CourseList } from "./CourseList"
import { handleKey } from "./keys"
import { DownloadDrawer, DRAWER_ROWS, Help, ToastView } from "./Overlays"
import { Overview } from "./Overview"
import { SignIn } from "./SignIn"

/** Below this width the course list and the detail pane are shown one at a time. */
export const NARROW_WIDTH = 100
/** Cells between the sidebar and the main pane. */
export const PANE_GAP = 2

export function App() {
  const ctx = useApp()
  const s = ctx.store.state
  const dims = useTerminalDimensions()
  useKeyboard((k) => handleKey(k, ctx))

  const narrow = () => dims().width < NARROW_WIDTH
  const usable = () => Math.max(20, dims().width - 4)
  const listWidth = () => (narrow() ? usable() : Math.min(48, Math.max(40, Math.floor(usable() * 0.34))))
  const detailWidth = () => (narrow() ? usable() : usable() - listWidth() - PANE_GAP)
  const bodyHeight = () =>
    Math.max(
      6,
      dims().height - headerRows(dims().height) - stripRows(s, ctx.now(), ctx.threshold, dims().height) - (s.download?.visible ? DRAWER_ROWS : 0) - FOOTER_ROWS,
    )

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color.bg}>
      <Show when={s.phase !== "signin"} fallback={<SignIn />}>
        <TopBar />
        <NeedsYouStrip />
        <box flexDirection="row" paddingX={2} columnGap={PANE_GAP} height={bodyHeight()} flexShrink={0}>
          <Show when={!narrow() || s.focus === "list"}>
            <CourseList width={listWidth()} height={bodyHeight()} />
          </Show>
          <Show when={!narrow() || s.focus === "detail"}>
            <Show when={s.selectedId === OVERVIEW_ROW} fallback={<CourseDetail width={detailWidth()} height={bodyHeight()} />}>
              <Overview width={detailWidth()} height={bodyHeight()} />
            </Show>
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
