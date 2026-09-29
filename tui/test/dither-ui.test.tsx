import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ditherLevel, type DitherOptions } from "../src/dither"
import { color, mix } from "../src/theme"
import { Dither, keepClear } from "../src/ui/Dither"

describe("keepClear", () => {
  const mask = keepClear([{ x: 10, y: 2, width: 8, height: 2 }], 4)
  test("hides the waves inside the rectangle and shows them well outside it", () => {
    expect(mask(0, 0, 12, 3)).toBe(0)
    expect(mask(0, 0, 10, 2)).toBe(0)
    expect(mask(0, 0, 60, 3)).toBe(1)
    expect(mask(0, 0, 12, 20)).toBe(1)
  })
  test("fades in between, and a row counts as two columns", () => {
    const edge = mask(0, 0, 20, 3) // 2 columns right of the rectangle
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(1)
    expect(mask(0, 0, 12, 5)).toBeLessThan(mask(0, 0, 12, 6)) // farther below, more visible
    expect(mask(0, 0, 12, 4 + 2)).toBe(1) // 2 rows = 4 cells: the feather
  })
})

// ---- the renderable ----

type Rgba = { buffer: ArrayLike<number> }
const hex = (c: Rgba) => "#" + [0, 1, 2].map((i) => Number(c.buffer[i]).toString(16).padStart(2, "0")).join("").toUpperCase()

async function render(view: () => any, width = 40, height = 6) {
  const t = await testRender(view, { width, height })
  await t.renderOnce()
  return t
}

const cellColors = (t: Awaited<ReturnType<typeof render>>) =>
  t.captureSpans().lines.map((line) => line.spans.flatMap((s) => [...s.text].map(() => ({ text: "", fg: hex(s.fg as Rgba), bg: hex(s.bg as Rgba) })).map((c, i) => ({ ...c, text: [...s.text][i]! }))))

describe("<Dither/>", () => {
  test("draws upper-half blocks (top pixel as foreground, bottom as background), plain spaces where they match", async () => {
    const t = await render(() => <Dither position="absolute" top={0} left={0} width="100%" height="100%" time={20} strength={0.5} />)
    const cells = cellColors(t).flat()
    expect(cells).toHaveLength(40 * 6)
    expect(cells.every((c) => (c.text === " " ? c.fg === c.bg : c.text === "▀" && c.fg !== c.bg))).toBe(true)
    expect(cells.some((c) => c.text === "▀")).toBe(true)
    // Colours come from the palette: levels 0, 1 and 2 at strength 0.5.
    const palette = new Set([0, 0.5, 1].map((i) => mix(color.accent, color.bar, i * 0.5)))
    for (const c of cells) {
      expect(palette.has(c.fg)).toBe(true)
      expect(palette.has(c.bg)).toBe(true)
    }
    expect(new Set(cells.map((c) => c.fg)).size).toBeGreaterThan(1)
    t.renderer.destroy()
  })

  test("is deterministic when not animating", async () => {
    const view = () => <Dither position="absolute" top={0} left={0} width="100%" height="100%" time={7} />
    const a = await render(view)
    const b = await render(view)
    expect(cellColors(a)).toEqual(cellColors(b))
    await a.renderOnce()
    expect(cellColors(a)).toEqual(cellColors(b))
    a.renderer.destroy()
    b.renderer.destroy()
  })

  test("matches the core: the same levels the pure function computes", async () => {
    const t = await render(() => <Dither position="absolute" top={0} left={0} width="100%" height="100%" time={9} strength={1} background="#000000" wave="#FFFFFF" />, 30, 5)
    const o: DitherOptions = { width: 30, height: 10, levels: 3, speed: 0.02, intensity: 0.7, scale: 44, sampleRows: 2 }
    const shade = (level: number) => hex({ buffer: [0, 1, 2].map(() => Math.round((level / 2) * 255)) })
    const cells = cellColors(t)
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 30; x++) {
        expect(cells[y]![x]!.fg).toBe(shade(ditherLevel(x, y * 2, 9, o)))
        expect(cells[y]![x]!.bg).toBe(shade(ditherLevel(x, y * 2 + 1, 9, o)))
      }
    }
    t.renderer.destroy()
  })

  test("a mask of 0 leaves only the background colour", async () => {
    const t = await render(() => <Dither position="absolute" top={0} left={0} width="100%" height="100%" time={20} mask={() => 0} />)
    for (const c of cellColors(t).flat()) {
      expect(c.fg).toBe(color.bar)
      expect(c.bg).toBe(color.bar)
    }
    t.renderer.destroy()
  })

  test("the mask receives cell coordinates too", async () => {
    const seen: number[][] = []
    const t = await render(() => <Dither position="absolute" top={0} left={0} width="100%" height="100%" mask={(u, v, x, y) => (seen.push([u, v, x, y]), 1)} />, 20, 4)
    expect(seen.length).toBe(20 * 8)
    const last = seen.at(-1)!
    expect(last[0]).toBeCloseTo(19.5 / 20)
    expect(last[1]).toBeCloseTo(7.5 / 8)
    expect(last[2]).toBeCloseTo(19.5)
    expect(last[3]).toBeCloseTo(3.75)
    t.renderer.destroy()
  })

  test("text on top keeps the dither behind it, and a background colour covers it", async () => {
    const t = await render(() => (
      <box width="100%" height="100%" backgroundColor={color.bar}>
        <Dither position="absolute" top={0} left={0} width="100%" height="100%" time={20} strength={1} />
        <box paddingLeft={2} paddingTop={1}>
          <text fg={color.strong}>HELLO</text>
        </box>
        <box position="absolute" top={3} left={2} height={1} width={5} backgroundColor="#123456">
          <text fg={color.strong}>COVER</text>
        </box>
      </box>
    ))
    const cells = cellColors(t)
    const hello = cells[1]!.slice(2, 7)
    expect(hello.map((c) => c.text).join("")).toBe("HELLO")
    // The glyph cells keep a dither colour behind the letters (one of the palette's), not a flat surface.
    const palette = new Set([0, 1 / 2, 1].map((i) => mix(color.accent, color.bar, i)))
    for (const c of hello) expect(palette.has(c.bg)).toBe(true)
    // The cells next to the word are still dither.
    expect(cells[1]![8]!.text).toBe("▀")
    // A box with its own background paints over it.
    for (const c of cells[3]!.slice(2, 7)) expect(c.bg).toBe("#123456")
    t.renderer.destroy()
  })

  test("props update the picture", async () => {
    let d: any
    const t = await render(() => <dither_field ref={(r: unknown) => (d = r)} position="absolute" top={0} left={0} width="100%" height="100%" time={20} />)
    const before = cellColors(t)
    d.time = 60
    await t.renderOnce()
    expect(cellColors(t)).not.toEqual(before)
    d.strength = 1
    await t.renderOnce()
    const bright = new Set(cellColors(t).flat().map((c) => c.fg))
    expect(bright.has(color.accent)).toBe(true)
    d.mask = () => 0
    await t.renderOnce()
    expect(new Set(cellColors(t).flat().map((c) => c.fg))).toEqual(new Set([color.bar]))
    t.renderer.destroy()
  })

  test("animating redraws on a timer that stops when the renderable is destroyed", async () => {
    let d: any
    const t = await render(() => <dither_field ref={(r: unknown) => (d = r)} position="absolute" top={0} left={0} width="100%" height="100%" animate speed={2} fps={30} />)
    const first = cellColors(t)
    await Bun.sleep(150)
    await t.renderOnce()
    expect(cellColors(t)).not.toEqual(first)
    expect(d.timer).toBeDefined()
    d.destroy()
    expect(d.timer).toBeUndefined()
    t.renderer.destroy()
  })

  test("survives a zero-sized field and a resize", async () => {
    const t = await render(() => (
      <box flexDirection="column" width="100%" height="100%">
        <dither_field height={0} />
        <dither_field height={2} time={3} />
      </box>
    ))
    t.resize(25, 8)
    await t.renderOnce()
    expect(cellColors(t)[0]).toHaveLength(25)
    expect(cellColors(t)[0]!.every((c) => c.text === "▀" || c.text === " ")).toBe(true)
    t.renderer.destroy()
  })
})
