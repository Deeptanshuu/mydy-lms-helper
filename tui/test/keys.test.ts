import { describe, expect, test } from "bun:test"
import { PREVIOUS_ROW } from "../src/state"
import { handleKey, type KeyLike } from "../src/ui/keys"
import { context, fakeServices } from "./helpers"

const key = (name: string, extra: Partial<KeyLike> = {}): KeyLike => ({ name, sequence: name.length === 1 ? name : "", ctrl: false, shift: false, ...extra })
function setup() {
  const services = fakeServices()
  const ctx = context({ services })
  const press = (...keys: KeyLike[]) => keys.forEach((k) => handleKey(k, ctx))
  return { ctx, s: ctx.store.state, services, press }
}

describe("course list", () => {
  test("j/k move, space marks, d downloads the marked courses", () => {
    const { s, services, press } = setup()
    press(key("k"), key("space"), key("j"), key("j"), key("space"), key("d"))
    expect(s.marked).toEqual(["815", "811"])
    expect(services.calls).toContain('startDownload ["815","811"]')
  })
  test("d with nothing marked downloads the selected course", () => {
    const { services, press } = setup()
    press(key("d"))
    expect(services.calls).toContain('startDownload ["812"]')
  })
  test("enter on 'Previous semesters' expands it; enter on a course opens the detail pane", () => {
    const { s, press } = setup()
    press(key("j"), key("j"))
    expect(s.selectedId).toBe(PREVIOUS_ROW)
    press(key("return"))
    expect(s.showPrevious).toBe(true)
    press(key("k"), key("return"))
    expect(s.focus).toBe("detail")
  })
  test("tab and shift+tab switch course tabs", () => {
    const { s, press } = setup()
    press(key("tab"))
    expect(s.tab).toBe("assignments")
    press(key("tab", { shift: true }), key("tab", { shift: true }))
    expect(s.tab).toBe("announcements")
  })
})

describe("filter", () => {
  test("/ starts filtering; letters don't trigger shortcuts; esc clears", () => {
    const { s, services, press } = setup()
    press(key("/"))
    expect(s.filtering).toBe(true)
    press(key("q"), key("d"), key("r"))
    expect(services.calls.filter((c) => !c.startsWith("loadTab"))).toEqual([])
    press(key("escape"))
    expect(s.filtering).toBe(false)
    expect(s.filter).toBe("")
  })
  test("ctrl+c quits even while filtering", () => {
    const { services, press } = setup()
    press(key("/"), key("c", { ctrl: true }))
    expect(services.calls).toContain("quit")
  })
})

describe("detail pane", () => {
  test("o opens the selected file; esc returns to the list", () => {
    const { s, services, press } = setup()
    press(key("return"), key("j"), key("o"))
    expect(services.calls).toContain("open https://mydy.dypatil.edu/rait/mod/presentation/view.php?id=9103")
    press(key("escape"))
    expect(s.focus).toBe("list")
  })
  test("enter on an announcement reads it", () => {
    const { ctx, services, press } = setup()
    ctx.store.actions.setTab("announcements")
    press(key("return"), key("return"))
    expect(services.calls.some((c) => c.startsWith("openAnnouncement") && c.includes("Mid-sem syllabus uploaded"))).toBe(true)
  })
})

describe("overlays", () => {
  test("? opens help, esc closes it, other keys are ignored meanwhile", () => {
    const { s, services, press } = setup()
    press(key("?", { sequence: "?" }))
    expect(s.overlay).toBe("help")
    press(key("d"))
    expect(services.calls.some((c) => c.startsWith("startDownload"))).toBe(false)
    press(key("escape"))
    expect(s.overlay).toBeNull()
  })
  test("the signed-out toast leads back to sign-in", () => {
    const { ctx, s, press } = setup()
    ctx.store.actions.setToast({ title: "Signed out of MyDy", detail: "x", action: "signin" })
    press(key("return"))
    expect(s.phase).toBe("signin")
    expect(s.toast).toBeNull()
  })
  test("x cancels an active download; esc hides the panel", () => {
    const { ctx, s, services, press } = setup()
    ctx.store.actions.setDownload({ active: true, visible: true, folder: "/d" })
    press(key("x"))
    expect(services.calls).toContain("cancelDownload")
    press(key("escape"))
    expect(s.download?.visible).toBe(false)
  })
})
