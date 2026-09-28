import { describe, expect, test } from "bun:test"
import { App } from "../src/ui/App"
import { renderWith } from "./helpers"

/** Cell position of the first occurrence of `text` in the frame (x counts code points, as cells). */
function find(frame: string, text: string): { x: number; y: number } {
  const lines = frame.split("\n")
  const y = lines.findIndex((l) => l.includes(text))
  if (y < 0) throw new Error(`"${text}" not on screen`)
  return { x: [...lines[y]!.slice(0, lines[y]!.indexOf(text))].length, y }
}

describe("mouse", () => {
  test("clicking a course selects it; clicking it again opens it", async () => {
    const t = await renderWith(() => <App />)
    const at = find(t.frame(), "Computer Networks")
    await t.mockMouse.click(at.x + 2, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.selectedId).toBe("815")
    expect(t.ctx.store.state.focus).toBe("list")
    await t.mockMouse.click(at.x + 2, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.focus).toBe("detail")
  })

  test("clicking the checkbox marks the course without selecting it", async () => {
    const t = await renderWith(() => <App />)
    const at = find(t.frame(), "Software Engineering")
    await t.mockMouse.click(at.x - 3, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.marked).toEqual(["820"])
    expect(t.ctx.store.state.selectedId).toBe("812")
  })

  test("clicking a tab switches to it", async () => {
    const t = await renderWith(() => <App />)
    const at = find(t.frame(), "Grades")
    await t.mockMouse.click(at.x + 1, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.tab).toBe("grades")
  })

  test("the wheel moves the course selection", async () => {
    const t = await renderWith(() => <App />)
    const at = find(t.frame(), "Computer Networks")
    await t.mockMouse.scroll(at.x, at.y, "down")
    await t.renderOnce()
    expect(t.ctx.store.state.selectedId).toBe("811")
  })

  test("footer hints are buttons", async () => {
    const t = await renderWith(() => <App />)
    const at = find(t.frame(), "help")
    await t.mockMouse.click(at.x, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.overlay).toBe("help")
    await t.mockMouse.click(1, 1)
    await t.renderOnce()
    expect(t.ctx.store.state.overlay).toBeNull()
  })

  test("clicking a needs-you item opens that course's assignments", async () => {
    const t = await renderWith(() => <App />)
    const at = find(t.frame(), "Lab 9: Subnetting")
    await t.mockMouse.click(at.x + 1, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.selectedId).toBe("815")
    expect(t.ctx.store.state.tab).toBe("assignments")
    expect(t.ctx.store.state.focus).toBe("detail")
  })

  test("clicking a file selects it; clicking again opens it in the browser", async () => {
    const t = await renderWith(() => <App />)
    const at = find(t.frame(), "Stack applications")
    await t.mockMouse.click(at.x + 1, at.y)
    await t.renderOnce()
    expect(t.ctx.store.state.detailIndex).toBe(2)
    await t.mockMouse.click(at.x + 1, at.y)
    await t.renderOnce()
    expect(t.ctx.services.calls).toContain("open https://mydy.dypatil.edu/rait/mod/flexpaper/view.php?id=9104")
  })
})
