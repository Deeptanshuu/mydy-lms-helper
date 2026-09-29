import { detailItems, type DetailItem } from "../derive"
import { OVERVIEW_ROW, PREVIOUS_ROW } from "../state"
import type { AppContextValue } from "./context"

export interface KeyLike {
  name: string
  sequence: string
  ctrl: boolean
  shift: boolean
  meta?: boolean
  preventDefault?: () => void
}

const is = (k: KeyLike, ...names: string[]) => names.includes(k.name) || names.includes(k.sequence)

/** Global key handling for the main screen. The sign-in screen handles its own keys. */
export function handleKey(k: KeyLike, ctx: AppContextValue): void {
  const { store, services } = ctx
  const { state: s, actions: a } = store

  if (k.ctrl && k.name === "c") return services.quit()
  if (s.phase === "signin") return

  if (s.overlay === "help") {
    if (is(k, "escape", "?", "q")) a.setOverlay(null)
    return
  }

  if (s.toast) {
    if (is(k, "return", "enter") && s.toast.action === "signin") {
      a.setToast(null)
      a.setSignIn(null, false)
      a.setPhase("signin")
      return
    }
    if (is(k, "escape")) return a.setToast(null)
  }

  // While the filter input has focus, letters go to the input, not to shortcuts.
  if (s.filtering) {
    if (is(k, "escape")) {
      a.setFilter("")
      a.setFiltering(false)
    } else if (is(k, "return", "enter")) {
      a.setFiltering(false)
      if (s.selectedId && s.courses[s.selectedId]) a.setFocus("detail")
    } else if (is(k, "down")) a.moveSelection(1)
    else if (is(k, "up")) a.moveSelection(-1)
    return
  }

  if (s.download?.visible) {
    if (is(k, "x") && s.download.active) return services.cancelDownload()
    if (is(k, "o")) return services.open(s.download.folder)
    if (is(k, "escape")) return a.setDownload(s.download.active ? { visible: false } : null)
  }

  if (is(k, "q")) return services.quit()
  if (is(k, "?")) return a.setOverlay("help")
  if (is(k, "/")) {
    // Otherwise the filter input, focused by this very key press, also receives the "/".
    k.preventDefault?.()
    a.setFocus("list")
    a.setFiltering(true)
    return
  }
  if (is(k, "r")) return services.refresh()
  if (is(k, "tab")) return a.cycleTab(k.shift ? -1 : 1)
  if (is(k, "d")) {
    const ids = s.marked.length ? [...s.marked] : s.selectedId && s.courses[s.selectedId] ? [s.selectedId] : []
    if (ids.length) services.startDownload(ids)
    return
  }

  const course = s.selectedId && s.selectedId !== PREVIOUS_ROW ? s.courses[s.selectedId] : undefined

  if (s.focus === "list") {
    if (is(k, "down", "j")) return a.moveSelection(1)
    if (is(k, "up", "k")) return a.moveSelection(-1)
    if (is(k, "space")) {
      if (s.selectedId === PREVIOUS_ROW) return a.togglePrevious()
      if (course) a.toggleMark(course.course.id)
      return
    }
    if (is(k, "return", "enter", "right", "l")) {
      if (s.selectedId === PREVIOUS_ROW) return a.togglePrevious()
      // The Overview always takes focus: on narrow terminals that is the only way to see it.
      if (course || s.selectedId === OVERVIEW_ROW) a.setFocus("detail")
      return
    }
    if (is(k, "escape") && s.filter) return a.setFilter("")
    if (is(k, "o") && course) return services.open(course.course.url)
    return
  }

  // Detail pane
  const items = detailItems(s, ctx.now())
  if (is(k, "escape", "left", "h")) {
    if (s.reading) return a.setReading(null)
    return a.setFocus("list")
  }
  if (s.reading && is(k, "down", "j")) return a.scrollReading(1)
  if (s.reading && is(k, "up", "k")) return a.scrollReading(-1)
  if (is(k, "down", "j")) return a.moveDetail(1, items.length)
  if (is(k, "up", "k")) return a.moveDetail(-1, items.length)
  if (is(k, "space") && course) return a.toggleMark(course.course.id)
  const item = items[s.detailIndex]
  if (is(k, "return", "enter") && item?.courseId) return openDeadline(ctx, item)
  if (is(k, "return", "enter") && item?.announcement) return services.openAnnouncement(item.announcement)
  if (is(k, "o") && item) return services.open(item.url)
}

/** Runs a key's action as if it was pressed (used by clickable footer hints). */
export function pressKey(name: string, ctx: AppContextValue): void {
  handleKey({ name, sequence: name.length === 1 ? name : "", ctrl: false, shift: false }, ctx)
}

/** Overview deadline row: jump to that assignment on its course's Assignments tab. */
export function openDeadline(ctx: AppContextValue, item: DetailItem): void {
  if (!item.courseId) return
  const { actions: a } = ctx.store
  a.select(item.courseId)
  a.setTab("assignments")
  a.setDetail(item.courseIndex ?? 0)
}

/** What clicking the selected detail row does: read an announcement, jump to a deadline's course, otherwise open it in the browser. */
export function activateDetail(ctx: AppContextValue): void {
  const item = detailItems(ctx.store.state, ctx.now())[ctx.store.state.detailIndex]
  if (!item) return
  if (item.courseId) openDeadline(ctx, item)
  else if (item.announcement) ctx.services.openAnnouncement(item.announcement)
  else ctx.services.open(item.url)
}
