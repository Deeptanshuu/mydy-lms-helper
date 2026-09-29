// The website hero's dithered waves (site/dither.js), computed on the CPU for the README artwork:
// the shared core in src/dither.ts (same noise, fbm and 8x8 Bayer dithering the TUI draws), one fixed
// frame, encoded as a small palette PNG so it can live inside an SVG (READMEs can't load external
// files from an SVG).
import { deflateSync } from "node:zlib"
import { ditherCells, ditherFrame, smoothstep, type DitherOptions as CoreOptions } from "../src/dither"

type RGB = [number, number, number]

export interface DitherOptions {
  width: number
  height: number
  /** Seconds into the animation; picks the frame. */
  time: number
  /** 0..1 multiplier for each pixel, e.g. to fade the waves out behind text. */
  mask?: (x: number, y: number) => number
  pixelSize?: number
  background: RGB
  wave: RGB
  /** Same meaning as site/dither.js. */
  waveSpeed?: number
  waveFrequency?: number
  waveAmplitude?: number
  waveIntensity?: number
  colorNum?: number
  /** How strongly the dots are drawn (0..1), like the website canvas's opacity. */
  strength?: number
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Dither level (0..colorNum-1) for every pixel, row by row from the top. */
function ditherLevels(o: DitherOptions): Uint8Array {
  const { width: w, height: h, mask } = o
  const px = o.pixelSize ?? 3
  const core: CoreOptions = {
    width: w,
    height: h,
    pixelSize: px,
    levels: o.colorNum ?? 4,
    speed: o.waveSpeed ?? 0.05,
    frequency: o.waveFrequency ?? 3,
    amplitude: o.waveAmplitude ?? 0.3,
    intensity: o.waveIntensity ?? 0.5,
    mask: mask && ((u, v) => mask(u * w, v * h)), // this script's masks take pixel coordinates
  }
  const { cols, rows } = ditherCells(core)
  const cells = new Uint8Array(cols * rows)
  ditherFrame(cells, o.time, core)

  const out = new Uint8Array(w * h)
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const level = cells[by * cols + bx]!
      const fx = bx * px
      for (let y = by * px; y < Math.min(h, (by + 1) * px); y++) out.fill(level, y * w + fx, y * w + Math.min(w, fx + px))
    }
  }
  return out
}

// ---- a minimal palette PNG encoder ----
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const b of bytes) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, "ascii")
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}
function palettePng(width: number, height: number, pixels: Uint8Array, palette: RGB[], alpha: number[]): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 3, 0, 0, 0], 8) // 8-bit indexed colour
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.from(palette.flat().map((c) => Math.round(c * 255)))),
    chunk("tRNS", Buffer.from(alpha.map((a) => Math.round(a * 255)))),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ])
}

/**
 * An SVG <image> of the dithered waves at full resolution (crisp without relying on pixelated scaling).
 * Level 0 is transparent so whatever is underneath shows through.
 */
export function ditherImage(o: DitherOptions, x = 0, y = 0, attrs = ""): string {
  const levels = o.colorNum ?? 4
  const palette: RGB[] = Array.from({ length: levels }, (_, i) => {
    const t = (i / (levels - 1)) * (o.strength ?? 1)
    return [0, 1, 2].map((c) => mix(o.background[c]!, o.wave[c]!, t)) as RGB
  })
  const alpha = palette.map((_, i) => (i === 0 ? 0 : 1))
  const png = palettePng(o.width, o.height, ditherLevels(o), palette, alpha)
  return `<image x="${x}" y="${y}" width="${o.width}" height="${o.height}" href="data:image/png;base64,${png.toString("base64")}"${attrs ? ` ${attrs}` : ""}/>`
}

export { smoothstep }
