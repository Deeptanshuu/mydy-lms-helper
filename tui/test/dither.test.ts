import { describe, expect, test } from "bun:test"
import { BAYER, cnoise, ditherCells, ditherFrame, ditherLevel, ditherMask, fbm, quantize, smoothstep, wavePattern, type DitherOptions } from "../src/dither"

// The shader's noise written the straightforward way (arrays, no tables), as the reference for the fast one.
const ref = (() => {
  const mod289 = (x: number) => x - Math.floor(x * (1 / 289)) * 289
  const permute = (x: number) => mod289((x * 34 + 1) * x)
  const taylor = (r: number) => 1.79284291400159 - 0.85373472095314 * r
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const fract = (x: number) => x - Math.floor(x)
  const mixf = (a: number, b: number, t: number) => a + (b - a) * t
  return function cnoiseRef(px: number, py: number): number {
    const fx0 = Math.floor(px)
    const fy0 = Math.floor(py)
    const ix = [mod289(fx0), mod289(fx0 + 1), mod289(fx0), mod289(fx0 + 1)]
    const iy = [mod289(fy0), mod289(fy0), mod289(fy0 + 1), mod289(fy0 + 1)]
    const pf = [px - fx0, py - fy0]
    const gx: number[] = []
    const gy: number[] = []
    for (let k = 0; k < 4; k++) {
      const i = permute(permute(ix[k]!) + iy[k]!)
      let g = fract(i * (1 / 41)) * 2 - 1
      gy.push(Math.abs(g) - 0.5)
      g -= Math.floor(g + 0.5)
      gx.push(g)
    }
    const n = (k: number) => taylor(gx[k]! * gx[k]! + gy[k]! * gy[k]!)
    const dx = [pf[0]!, pf[0]! - 1, pf[0]!, pf[0]! - 1]
    const dy = [pf[1]!, pf[1]!, pf[1]! - 1, pf[1]! - 1]
    const c = [0, 1, 2, 3].map((k) => n(k) * (gx[k]! * dx[k]! + gy[k]! * dy[k]!))
    const fx = fade(pf[0]!)
    return 2.3 * mixf(mixf(c[0]!, c[1]!, fx), mixf(c[2]!, c[3]!, fx), fade(pf[1]!))
  }
})()

/** A small deterministic generator, so a failing case can be reproduced. */
function lcg(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

const field = (over: Partial<DitherOptions> = {}): DitherOptions => ({ width: 60, height: 24, scale: 44, ...over })
const frame = (o: DitherOptions, t = 3) => {
  const { cols, rows } = ditherCells(o)
  const out = new Uint8Array(cols * rows)
  ditherFrame(out, t, o)
  return out
}

describe("noise", () => {
  test("cnoise matches the plain implementation of the shader's Perlin noise", () => {
    const rand = lcg(7)
    for (let i = 0; i < 5000; i++) {
      const x = (rand() - 0.5) * 80
      const y = (rand() - 0.5) * 80
      expect(cnoise(x, y)).toBeCloseTo(ref(x, y), 12)
    }
  })
  test("cnoise stays within the shader's range and is 0 on lattice points", () => {
    const rand = lcg(11)
    for (let i = 0; i < 2000; i++) expect(Math.abs(cnoise(rand() * 300 - 150, rand() * 300 - 150))).toBeLessThan(1.5)
    expect(cnoise(3, -4)).toBeCloseTo(0, 12)
  })
  test("far coordinates wrap like the shader's mod 289 lattice", () => {
    expect(cnoise(300.25, 17.5)).toBeCloseTo(cnoise(11.25, 17.5), 12)
    expect(cnoise(-5000.5, 2.25)).toBeCloseTo(ref(-5000.5, 2.25), 12)
  })
  test("fbm sums four octaves of |noise|", () => {
    const x = 0.37
    const y = -1.21
    const expected = Math.abs(cnoise(x, y)) + 0.3 * Math.abs(cnoise(x * 3, y * 3)) + 0.09 * Math.abs(cnoise(x * 9, y * 9)) + 0.027 * Math.abs(cnoise(x * 27, y * 27))
    expect(fbm(x, y)).toBeCloseTo(expected, 12)
  })
  test("the waves drift with time", () => {
    expect(wavePattern(0.3, 0.2, 0)).not.toBeCloseTo(wavePattern(0.3, 0.2, 40), 3)
  })
})

describe("quantize", () => {
  test("the Bayer matrix is a permutation of 0..63", () => {
    expect([...BAYER].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i))
  })
  test("no brightness is the darkest level and full brightness the top one", () => {
    for (const levels of [3, 4, 6]) {
      for (let bx = 0; bx < 8; bx++) for (let by = 0; by < 8; by++) {
        expect(quantize(0, bx, by, levels)).toBe(0)
        expect(quantize(1, bx, by, levels)).toBe(levels - 1)
      }
    }
  })
  test("mid brightness dithers between neighbouring levels", () => {
    const seen = new Set<number>()
    for (let bx = 0; bx < 8; bx++) for (let by = 0; by < 8; by++) seen.add(quantize(0.5, bx, by, 4))
    expect(seen.size).toBeGreaterThan(1)
    expect(Math.max(...seen) - Math.min(...seen)).toBeLessThanOrEqual(1)
  })
})

describe("ditherFrame", () => {
  test("same inputs give the same frame", () => {
    expect(frame(field())).toEqual(frame(field()))
    expect(frame(field({ sampleRows: 2 }), 12.5)).toEqual(frame(field({ sampleRows: 2 }), 12.5))
  })
  test("time changes the frame", () => {
    expect(frame(field(), 0)).not.toEqual(frame(field(), 30))
  })
  test("every level is within range, whatever the number of levels", () => {
    for (const levels of [2, 3, 4, 6]) {
      const out = frame(field({ levels, intensity: 1 }))
      expect(Math.max(...out)).toBeLessThanOrEqual(levels - 1)
      expect(Math.min(...out)).toBeGreaterThanOrEqual(0)
    }
    expect(new Set(frame(field({ levels: 4, intensity: 1 }))).size).toBeGreaterThan(2)
  })
  test("ditherLevel agrees with the frame cell by cell", () => {
    for (const sampleRows of [1, 2]) {
      const o = field({ sampleRows, mask: (u) => u })
      const out = frame(o, 5)
      const { cols, rows } = ditherCells(o)
      for (let y = 0; y < rows; y += 3) for (let x = 0; x < cols; x += 2) expect(ditherLevel(x, y, 5, o)).toBe(out[y * cols + x]!)
    }
  })
  test("a mask of 0 hides the waves completely, even with 2 levels", () => {
    for (const levels of [2, 3, 4]) {
      const out = frame(field({ levels, intensity: 1, mask: () => 0 }))
      expect(Math.max(...out)).toBe(0)
    }
  })
  test("a mask thins the waves out where it is below 1", () => {
    const full = frame(field({ intensity: 1 }))
    const half = frame(field({ intensity: 1, mask: (u) => (u < 0.5 ? 0 : 1) }))
    const { cols, rows } = ditherCells(field())
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        if (x < cols / 2) expect(half[i]).toBe(0)
        else expect(half[i]).toBe(full[i]!)
      }
    }
  })
  test("a sampled mask grid gives the same frame as the mask function", () => {
    const o = field({ mask: (u, v) => Math.min(1, u * 2) * (1 - v * 0.5) })
    const { cols, rows } = ditherCells(o)
    const withGrid = new Uint8Array(cols * rows)
    ditherFrame(withGrid, 3, o, ditherMask(o))
    expect(withGrid).toEqual(frame(o))
  })
  test("sampleRows shares one wave sample between rows but keeps the Bayer pattern per pixel", () => {
    const one = frame(field({ sampleRows: 1, levels: 4, intensity: 1 }))
    const two = frame(field({ sampleRows: 2, levels: 4, intensity: 1 }))
    expect(two).not.toEqual(one)
    // Same picture overall: the mean level differs by well under one level.
    const mean = (a: Uint8Array) => a.reduce((s, v) => s + v, 0) / a.length
    expect(Math.abs(mean(one) - mean(two))).toBeLessThan(0.3)
  })
  test("pixelSize makes cells cover several canvas pixels", () => {
    expect(ditherCells({ width: 100, height: 30, pixelSize: 4 })).toEqual({ cols: 25, rows: 8 })
  })
})

describe("performance", () => {
  test("a 200x10 terminal band (200x20 dither pixels) computes far inside a frame budget", () => {
    const o = field({ width: 200, height: 20, sampleRows: 2 })
    const { cols, rows } = ditherCells(o)
    const out = new Uint8Array(cols * rows)
    for (let i = 0; i < 5; i++) ditherFrame(out, i, o) // warm up
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) ditherFrame(out, 5 + i * 0.083, o)
    const perFrame = (performance.now() - t0) / 20
    // About 0.5 ms on a development machine; the bound only catches an accidental 20x slowdown.
    expect(perFrame).toBeLessThan(12)
  })
})

describe("smoothstep", () => {
  test("eases from 0 to 1 and clamps outside the edges", () => {
    expect(smoothstep(0.2, 0.6, 0)).toBe(0)
    expect(smoothstep(0.2, 0.6, 1)).toBe(1)
    expect(smoothstep(0.2, 0.6, 0.4)).toBeCloseTo(0.5, 12)
  })
})
