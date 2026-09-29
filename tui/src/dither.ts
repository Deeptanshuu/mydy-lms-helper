// The website hero's dithered waves as pure functions. site/dither.js is the WebGL2 original (a port of
// the React Bits "Dither" component): animated Perlin-noise fbm waves, quantised to a few brightness
// levels with an 8x8 Bayer matrix. Dependency-free on purpose, so the TUI (ui/Dither.tsx) and the README
// artwork (scripts/dither-art.ts) compute exactly the same pixels.
//
// Coordinates: a dither *cell* is `pixelSize` canvas pixels square (the site uses 3, the TUI 1, where a
// cell is half a terminal row). Rows count from the top. The waves are centred on the canvas and one unit
// of noise space is `scale` canvas pixels (default: the canvas height, like the website).

export interface DitherOptions {
  /** Canvas size in pixels; centres the waves and normalises mask coordinates. */
  width: number
  height: number
  /** Canvas pixels per dither cell. Default 1. */
  pixelSize?: number
  /** Brightness levels after dithering. Default 4 (COLOR_NUM). */
  levels?: number
  /** Drift of the waves per second (WAVE_SPEED). Default 0.05. */
  speed?: number
  /** Octave frequency multiplier (WAVE_FREQUENCY). Default 3. */
  frequency?: number
  /** Octave amplitude multiplier (WAVE_AMPLITUDE). Default 0.3. */
  amplitude?: number
  /** How bright the brightest waves get before dithering, 0..1 (WAVE_INTENSITY). Default 0.5. */
  intensity?: number
  /** Canvas pixels per unit of noise space: bigger = broader, calmer waves. Default: `height`. */
  scale?: number
  /**
   * Pixel rows that share one wave sample (the Bayer grid still runs per pixel). Default 1. The TUI uses 2, one
   * sample per terminal row: the waves are smooth, so the half-cell pixels below a sample lose nothing and the
   * frame costs half as much.
   */
  sampleRows?: number
  /** 0..1 multiplier of the wave brightness at (u, v), both 0..1 across the canvas, e.g. to fade the waves out behind text. */
  mask?: (u: number, v: number) => number
}

// ---- noise (Stefan Gustavson's classic Perlin noise, as in the shader) ----
const mod289 = (x: number) => x - Math.floor(x * (1 / 289)) * 289
const permute = (x: number) => mod289((x * 34 + 1) * x)
const taylorInvSqrt = (r: number) => 1.79284291400159 - 0.85373472095314 * r
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const fract = (x: number) => x - Math.floor(x)
const mix = (a: number, b: number, t: number) => a + (b - a) * t

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

// Every lattice corner's normalised gradient, filled in on first use. The lattice repeats every 289 cells and
// the table has one extra row and column so a cell's far corners are always at +1 (289 is 0 again).
const SIDE = 290
const GX = new Float64Array(SIDE * SIDE).fill(Number.NaN)
const GY = new Float64Array(SIDE * SIDE)

function fillGradient(ix: number, iy: number): void {
  const i = permute(permute(ix) + iy)
  let g = fract(i * (1 / 41)) * 2 - 1
  const gy = Math.abs(g) - 0.5
  g -= Math.floor(g + 0.5)
  const norm = taylorInvSqrt(g * g + gy * gy) // each corner is normalised by its own length
  GX[ix * SIDE + iy] = g * norm
  GY[ix * SIDE + iy] = gy * norm
}

// n mod 289 for the lattice coordinates a frame actually visits, without a division.
const WRAP_RANGE = 2048
const WRAP = Uint16Array.from({ length: WRAP_RANGE * 2 }, (_, i) => (((i - WRAP_RANGE) % 289) + 289) % 289)
const wrap289 = (n: number) => {
  if (n >= -WRAP_RANGE && n < WRAP_RANGE) return WRAP[n + WRAP_RANGE]!
  const m = (n | 0) % 289
  return m < 0 ? m + 289 : m
}

/** Classic 2D Perlin noise, about -1..1 (2.3 scales the raw gradient noise to that range). */
export function cnoise(px: number, py: number): number {
  const fx0 = Math.floor(px)
  const fy0 = Math.floor(py)
  const ix = wrap289(fx0)
  const iy = wrap289(fy0)
  // Corners in the shader's order: 00, 10, 01, 11.
  const a = ix * SIDE + iy
  const b = a + SIDE
  const c = a + 1
  const d = b + 1
  if (GX[a] !== GX[a]) fillGradient(ix, iy)
  if (GX[b] !== GX[b]) fillGradient(ix + 1, iy)
  if (GX[c] !== GX[c]) fillGradient(ix, iy + 1)
  if (GX[d] !== GX[d]) fillGradient(ix + 1, iy + 1)
  const x0 = px - fx0
  const y0 = py - fy0
  const x1 = x0 - 1
  const y1 = y0 - 1
  const n00 = GX[a]! * x0 + GY[a]! * y0
  const n10 = GX[b]! * x1 + GY[b]! * y0
  const n01 = GX[c]! * x0 + GY[c]! * y1
  const n11 = GX[d]! * x1 + GY[d]! * y1
  const fx = fade(x0)
  return 2.3 * mix(mix(n00, n10, fx), mix(n01, n11, fx), fade(y0))
}

/** Four octaves of |noise|: ridged waves. */
export function fbm(x: number, y: number, frequency = 3, amplitude = 0.3): number {
  let value = 0
  let amp = 1
  for (let i = 0; i < 4; i++) {
    value += amp * Math.abs(cnoise(x, y))
    x *= frequency
    y *= frequency
    amp *= amplitude
  }
  return value
}

/** Wave brightness (before clamping and intensity) at a point in noise space, `t` seconds into the animation. */
export function wavePattern(x: number, y: number, t: number, speed = 0.05, frequency = 3, amplitude = 0.3): number {
  const shift = fbm(x - t * speed, y - t * speed, frequency, amplitude)
  return fbm(x + shift, y + shift, frequency, amplitude)
}

// 8x8 Bayer matrix, values 0..63 (the same table as site/dither.js).
export const BAYER: readonly number[] = [
  0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31,
  8, 56, 4, 52, 11, 59, 7, 55, 40, 24, 36, 20, 43, 27, 39, 23,
  2, 50, 14, 62, 1, 49, 13, 61, 34, 18, 46, 30, 33, 17, 45, 29,
  10, 58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22, 41, 25, 37, 21,
]

/** Ordered dithering: a brightness 0..1 at cell (bx, by) to a level 0..levels-1. */
export function quantize(v: number, bx: number, by: number, levels: number): number {
  v += (BAYER[(by & 7) * 8 + (bx & 7)]! / 64 - 0.25) * (1 / (levels - 1))
  // Pull darker tones down a little so the shadows stay clean.
  v = Math.min(1, Math.max(0, v - mix(0.2, 0, smoothstep(0.45, 0.8, v))))
  return Math.floor(v * (levels - 1) + 0.5)
}

interface Resolved {
  w: number
  h: number
  px: number
  sampleRows: number
  levels: number
  speed: number
  frequency: number
  amplitude: number
  intensity: number
  /** width / scale and height / scale: the noise-space extent of the canvas. */
  wk: number
  hk: number
  mask: DitherOptions["mask"]
}

function resolve(o: DitherOptions): Resolved {
  const scale = o.scale ?? o.height
  return {
    w: o.width,
    h: o.height,
    px: o.pixelSize ?? 1,
    sampleRows: Math.max(1, Math.round(o.sampleRows ?? 1)),
    levels: Math.max(2, Math.round(o.levels ?? 4)),
    speed: o.speed ?? 0.05,
    frequency: o.frequency ?? 3,
    amplitude: o.amplitude ?? 0.3,
    intensity: o.intensity ?? 0.5,
    wk: o.width / scale,
    hk: o.height / scale,
    mask: o.mask,
  }
}

/** Wave brightness 0..intensity for the block of pixel rows starting at row `by0` and column `bx`. */
function waveAt(r: Resolved, bx: number, by0: number, t: number): number {
  // gl_FragCoord runs bottom-up; sample at the block's corner like the shader.
  const fx = bx * r.px
  const fy = r.h - (by0 + r.sampleRows) * r.px
  const ux = (fx / r.w - 0.5) * r.wk
  const uy = (fy / r.h - 0.5) * r.hk
  const f = wavePattern(ux, uy, t, r.speed, r.frequency, r.amplitude)
  return Math.min(1, Math.max(0, f)) * r.intensity
}

/** Cells across and down for a canvas: the size of the array `ditherFrame` fills. */
export function ditherCells(o: Pick<DitherOptions, "width" | "height" | "pixelSize">): { cols: number; rows: number } {
  const px = o.pixelSize ?? 1
  return { cols: Math.ceil(o.width / px), rows: Math.ceil(o.height / px) }
}

/** The mask sampled at every cell's centre, for `ditherFrame`: a fixed mask only needs computing once per size. */
export function ditherMask(o: DitherOptions): Float32Array | undefined {
  if (!o.mask) return undefined
  const { cols, rows } = ditherCells(o)
  const px = o.pixelSize ?? 1
  const grid = new Float32Array(cols * rows)
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) grid[by * cols + bx] = o.mask((bx * px + px / 2) / o.width, (by * px + px / 2) / o.height)
  }
  return grid
}

/**
 * Level (0..levels-1) of cell (x, y), x across and y down from the top-left, `t` seconds into the animation.
 * A mask of 0 hides the waves completely: the level is 0 whatever the number of levels.
 */
export function ditherLevel(x: number, y: number, t: number, o: DitherOptions): number {
  const r = resolve(o)
  const m = r.mask ? r.mask((x * r.px + r.px / 2) / r.w, (y * r.px + r.px / 2) / r.h) : 1
  if (m <= 0) return 0
  return quantize(waveAt(r, x, y - (y % r.sampleRows), t) * m, x, y, r.levels)
}

/**
 * Fills `out` (row by row from the top, `cols * rows` cells, see `ditherCells`) with every cell's level.
 * This is the fast path: options are resolved once, and cells the mask hides cost nothing.
 * Pass `maskGrid` (from `ditherMask`) to reuse a sampled mask across frames.
 */
export function ditherFrame(out: Uint8Array, t: number, o: DitherOptions, maskGrid?: ArrayLike<number>): void {
  const r = resolve(o)
  const { cols, rows } = ditherCells(o)
  const mask = maskGrid ? undefined : r.mask
  const sr = r.sampleRows
  for (let by0 = 0; by0 < rows; by0 += sr) {
    const end = Math.min(rows, by0 + sr)
    for (let bx = 0; bx < cols; bx++) {
      let wave = -1 // sampled on the first visible pixel of the block
      for (let by = by0; by < end; by++) {
        const i = by * cols + bx
        const m = maskGrid ? maskGrid[i]! : mask ? mask((bx * r.px + r.px / 2) / r.w, (by * r.px + r.px / 2) / r.h) : 1
        if (m <= 0) {
          out[i] = 0
          continue
        }
        if (wave < 0) wave = waveAt(r, bx, by0, t)
        out[i] = quantize(wave * m, bx, by, r.levels)
      }
    }
  }
}
