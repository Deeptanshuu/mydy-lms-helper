// The website hero's dithered waves (site/dither.js), computed on the CPU for the README artwork:
// same noise, fbm and 8x8 Bayer dithering, one fixed frame, encoded as a small palette PNG so it can
// live inside an SVG (READMEs can't load external files from an SVG).
import { deflateSync } from "node:zlib"

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

// ---- noise (Stefan Gustavson's classic Perlin noise, as in the shader) ----
const mod289 = (x: number) => x - Math.floor(x * (1 / 289)) * 289
const permute = (x: number) => mod289((x * 34 + 1) * x)
const taylorInvSqrt = (r: number) => 1.79284291400159 - 0.85373472095314 * r
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const fract = (x: number) => x - Math.floor(x)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function cnoise(px: number, py: number): number {
  const fx0 = Math.floor(px)
  const fy0 = Math.floor(py)
  const [ix0, iy0, ix1, iy1] = [mod289(fx0), mod289(fy0), mod289(fx0 + 1), mod289(fy0 + 1)]
  const [pfx0, pfy0] = [px - fx0, py - fy0]
  const [pfx1, pfy1] = [pfx0 - 1, pfy0 - 1]
  // Corners in the shader's xzxz / yyww order: 00, 10, 01, 11.
  const ix = [ix0, ix1, ix0, ix1]
  const iy = [iy0, iy0, iy1, iy1]
  const gx: number[] = []
  const gy: number[] = []
  for (let k = 0; k < 4; k++) {
    const i = permute(permute(ix[k]!) + iy[k]!)
    let g = fract(i * (1 / 41)) * 2 - 1
    gy.push(Math.abs(g) - 0.5)
    g -= Math.floor(g + 0.5)
    gx.push(g)
  }
  // Each corner's gradient is normalised by its own length (the shader's norm vector).
  const n = (k: number) => taylorInvSqrt(gx[k]! * gx[k]! + gy[k]! * gy[k]!)
  const [nx0, nx1, nx2, nx3] = [n(0), n(1), n(2), n(3)]
  const n00 = nx0 * (gx[0]! * pfx0 + gy[0]! * pfy0)
  const n10 = nx1 * (gx[1]! * pfx1 + gy[1]! * pfy0)
  const n01 = nx2 * (gx[2]! * pfx0 + gy[2]! * pfy1)
  const n11 = nx3 * (gx[3]! * pfx1 + gy[3]! * pfy1)
  const fxy = [fade(pfx0), fade(pfy0)] as const
  const nx = [mix(n00, n10, fxy[0]), mix(n01, n11, fxy[0])] as const
  return 2.3 * mix(nx[0], nx[1], fxy[1])
}

const BAYER = [
  0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31,
  8, 56, 4, 52, 11, 59, 7, 55, 40, 24, 36, 20, 43, 27, 39, 23,
  2, 50, 14, 62, 1, 49, 13, 61, 34, 18, 46, 30, 33, 17, 45, 29,
  10, 58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22, 41, 25, 37, 21,
]

/** Dither level (0..colorNum-1) for every pixel, row by row from the top. */
function ditherLevels(o: DitherOptions): Uint8Array {
  const { width: w, height: h, time, mask } = o
  const px = o.pixelSize ?? 3
  const speed = o.waveSpeed ?? 0.05
  const freq = o.waveFrequency ?? 3
  const ampK = o.waveAmplitude ?? 0.3
  const intensity = o.waveIntensity ?? 0.5
  const levels = o.colorNum ?? 4
  const step = 1 / (levels - 1)

  const fbm = (x: number, y: number) => {
    let value = 0
    let amp = 1
    for (let i = 0; i < 4; i++) {
      value += amp * Math.abs(cnoise(x, y))
      x *= freq
      y *= freq
      amp *= ampK
    }
    return value
  }

  const out = new Uint8Array(w * h)
  for (let by = 0; by * px < h; by++) {
    for (let bx = 0; bx * px < w; bx++) {
      // gl_FragCoord runs bottom-up; sample at the cell's corner like the shader.
      const fx = bx * px
      const fy = h - (by + 1) * px
      const ux = (fx / w - 0.5) * (w / h)
      const uy = fy / h - 0.5
      const shift = fbm(ux - time * speed, uy - time * speed)
      const f = fbm(ux + shift, uy + shift)
      let v = Math.min(1, Math.max(0, f)) * intensity * (mask ? mask(fx + px / 2, by * px + px / 2) : 1)
      v += (BAYER[(by % 8) * 8 + (bx % 8)]! / 64 - 0.25) * step
      v = Math.min(1, Math.max(0, v - mix(0.2, 0, smoothstep(0.45, 0.8, v))))
      const level = Math.floor(v * (levels - 1) + 0.5)
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
