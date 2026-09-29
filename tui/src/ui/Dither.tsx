// <dither_field/>: the website hero's dithered orange waves (site/dither.js), drawn straight into the
// frame buffer as a quiet texture. Every terminal cell is "▀" whose foreground is the upper dither pixel and
// background the lower one, so the 8x8 Bayer grid runs on half-cell pixels (square-ish in most fonts) and
// reads as crisp dots. Defaults are calm on purpose: 3 levels, the brightest only 20% of the way to the wave
// colour, a slow drift. Importing this module registers the element; `Dither` is the same thing as a component.
//
// Layering recipe (verified by scripts/preview.tsx scenes 14 and 15): put the field inside a box and let it
// fill it (position="absolute", full size). It paints before its siblings whatever the source order (zIndex -1).
// Give the content that goes on top NO background colour: text cells only replace the glyph and keep the
// background already in the buffer, so the dither shows through around every letter. A backgroundColor on the
// text, a row or a wrapper box paints over the waves (a `Line` with a `bg` hides them; a Card with its own bg
// is a clean window, which is often what you want). Do not raise the text's contrast to fight the waves; keep
// the waves away from it with `mask` (see `keepClear`). At strength 0.2 the ink ladder stays readable on the
// brightest dots: strong 12:1, text 9:1, muted 4.9:1, but faint is only 2.6:1, so keep faint text clear.
//
//   <box height={6} backgroundColor={color.bar}>
//     <Dither position="absolute" top={0} left={0} width="100%" height="100%"
//       mask={keepClear([{ x: 3, y: 2, width: 20, height: 2 }], 4)} />   // no waves within 4 cells of the wordmark
//     <box paddingX={3} paddingY={2}><Wordmark /></box>  // no backgroundColor
//   </box>
//
// Recommended: header band strength 0.2 (levels 3), backdrop behind the sign-in card 0.15-0.2 with a vignette
// mask, slim decorative strip 0.15. `animate` redraws 12 times a second (about 0.4 ms for a 170x6 band, and an
// idle render of an unchanged frame is a cached blit); leave it off where a still texture is enough.
import { OptimizedBuffer, Renderable, RGBA, type RenderableOptions, type RenderContext } from "@opentui/core"
import { extend } from "@opentui/solid"
import type { JSX } from "solid-js"
import { ditherCells, ditherFrame, ditherMask, smoothstep, type DitherOptions } from "../dither"
import { color, mix } from "../theme"

export { smoothstep }

/**
 * 0..1 multiplier for the waves at one spot: (u, v) run 0..1 across the field, (x, y) are the same point in
 * terminal cells from its top-left corner (cells are about twice as tall as wide).
 */
export type DitherMask = (u: number, v: number, x: number, y: number) => number

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A mask that hides the waves inside `rects` (cells, from the field's top-left) and brings them back over
 * `feather` cells around each one: the way to keep them well away from text.
 */
export function keepClear(rects: Rect[], feather = 4): DitherMask {
  return (_u, _v, x, y) => {
    let m = 1
    for (const r of rects) {
      const dx = Math.max(r.x - x, 0, x - (r.x + r.width))
      const dy = Math.max(r.y - y, 0, y - (r.y + r.height)) * 2 // a row is about two columns tall
      m = Math.min(m, smoothstep(0, feather, Math.hypot(dx, dy)))
    }
    return m
  }
}

export interface DitherFieldOptions extends RenderableOptions<DitherRenderable> {
  /** The darkest level: the colour of the surface behind the field, "#RRGGBB". Default `color.bar`. */
  background?: string
  /** The colour the waves fade towards, "#RRGGBB". Default `color.accent`. */
  wave?: string
  /** Brightness levels after dithering (the website uses 4; 3 is quieter, 2 is a plain checkerboard). Default 3. */
  levels?: number
  /** 0..1: how far the brightest level goes from `background` towards `wave`. Default 0.2. */
  strength?: number
  /** Wave drift per second (site/dither.js waveSpeed, 0.05 there). Default 0.02: barely moving. */
  speed?: number
  /** Octave frequency multiplier (waveFrequency). Default 3. */
  frequency?: number
  /** Octave amplitude multiplier (waveAmplitude). Default 0.3. */
  amplitude?: number
  /** How bright the waves get before dithering, 0..1 (waveIntensity): more dots at the higher levels. Default 0.7, like the README artwork (the site uses 0.5). */
  intensity?: number
  /** Dither pixels (half rows) per unit of noise space: bigger = broader, calmer waves. Default: the field's height in pixels, at least 44. */
  scale?: number
  /** Where the waves are visible; see `DitherMask` and `keepClear`. Default: everywhere. */
  mask?: DitherMask
  /** Seconds into the animation: the frame drawn when not animating (and where the animation starts). Default 0. */
  time?: number
  /** Redraw `fps` times a second. Default false, so tests and previews are deterministic. */
  animate?: boolean
  /** Redraws per second while animating. Default 12. */
  fps?: number
}

const FRAME_CHAR = "▀"
/** Smallest default noise scale in dither pixels: below it a 6-row band would show a dozen ridges. */
const MIN_SCALE = 44

export class DitherRenderable extends Renderable {
  private _background: string = color.bar
  private _wave: string = color.accent
  private _levels = 3
  private _strength = 0.2
  private _speed = 0.02
  private _frequency = 3
  private _amplitude = 0.3
  private _intensity = 0.7
  private _scale: number | undefined
  private _mask: DitherMask | undefined
  private _time = 0
  private _animate = false
  private _fps = 12

  private palette: RGBA[] | undefined
  private cells = new Uint8Array(0)
  private maskGrid: Float32Array | undefined
  /** The painted frame. Renders that change nothing (a keypress elsewhere) just blit it. */
  private frame: OptimizedBuffer | undefined
  private stale = true
  private gridW = 0
  private gridH = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private startedAt = 0

  // Solid creates elements with `new Renderable(ctx, { id })` and assigns the props afterwards, so every
  // prop has a setter; the options are for building one by hand.
  constructor(ctx: RenderContext, options: DitherFieldOptions = {}) {
    // zIndex -1: painted before every sibling. Solid inserts static children before component ones, so with equal
    // zIndex the field could land in front of the text it is meant to sit behind.
    super(ctx, { flexShrink: 0, zIndex: -1, ...options })
    this.selectable = false
    for (const key of ["background", "wave", "levels", "strength", "speed", "frequency", "amplitude", "intensity", "scale", "mask", "time", "animate", "fps"] as const) {
      if (options[key] !== undefined) (this as Record<string, unknown>)[key] = options[key]
    }
  }

  get background() { return this._background }
  set background(v: string | undefined) { this._background = v ?? color.bar; this.restyle() }
  get wave() { return this._wave }
  set wave(v: string | undefined) { this._wave = v ?? color.accent; this.restyle() }
  get levels() { return this._levels }
  set levels(v: number | undefined) { this._levels = Math.max(2, Math.round(v ?? 3)); this.restyle() }
  get strength() { return this._strength }
  set strength(v: number | undefined) { this._strength = Math.min(1, Math.max(0, v ?? 0.2)); this.restyle() }

  get speed() { return this._speed }
  set speed(v: number | undefined) { this._speed = v ?? 0.02; this.touch() }
  get frequency() { return this._frequency }
  set frequency(v: number | undefined) { this._frequency = v ?? 3; this.touch() }
  get amplitude() { return this._amplitude }
  set amplitude(v: number | undefined) { this._amplitude = v ?? 0.3; this.touch() }
  get intensity() { return this._intensity }
  set intensity(v: number | undefined) { this._intensity = Math.min(1, Math.max(0, v ?? 0.7)); this.touch() }
  get scale() { return this._scale }
  set scale(v: number | undefined) { this._scale = v === undefined ? undefined : Math.max(1, v); this.touch() }
  get mask() { return this._mask }
  set mask(v: DitherMask | undefined) {
    this._mask = v
    this.gridW = 0 // resample on the next draw
    this.touch()
  }
  get time() { return this._time }
  set time(v: number | undefined) { this._time = v ?? 0; this.touch() }

  get animate() { return this._animate }
  set animate(v: boolean | undefined) {
    this._animate = v ?? false
    if (this._animate) this.startTimer()
    else this.stopTimer()
    this.touch()
  }
  get fps() { return this._fps }
  set fps(v: number | undefined) {
    this._fps = Math.min(60, Math.max(1, v ?? 12))
    if (this.timer) {
      this.stopTimer()
      this.startTimer()
    }
  }

  /** Something the picture depends on changed: repaint on the next render. */
  private touch() {
    this.stale = true
    this.requestRender()
  }

  private restyle() {
    this.palette = undefined
    this.touch()
  }

  private startTimer() {
    if (this.timer || this.isDestroyed) return
    this.startedAt = performance.now()
    this.timer = setInterval(() => {
      if (this.visible && !this.isDestroyed) this.touch()
    }, 1000 / this._fps)
    this.timer.unref?.() // never keep the process alive for a background effect
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  /** One colour per level, background to full strength. Identical colours share one RGBA. */
  private levelColors(): RGBA[] {
    if (this.palette) return this.palette
    const seen = new Map<string, RGBA>()
    this.palette = Array.from({ length: this._levels }, (_, i) => {
      const hex = mix(this._wave, this._background, (i / (this._levels - 1)) * this._strength)
      let rgba = seen.get(hex)
      if (!rgba) seen.set(hex, (rgba = RGBA.fromHex(hex)))
      return rgba
    })
    return this.palette
  }

  /** The dither for a field `w` cells wide and `h` rows tall: two dither pixels per row, one wave sample per row. */
  private field(w: number, h: number): DitherOptions {
    const mask = this._mask
    return {
      width: w,
      height: h * 2,
      levels: this._levels,
      speed: this._speed,
      frequency: this._frequency,
      amplitude: this._amplitude,
      intensity: this._intensity,
      scale: this._scale ?? Math.max(MIN_SCALE, h * 2), // the site's rule (one screen height per unit), but never finer than a band needs
      sampleRows: 2,
      mask: mask && ((u, v) => mask(u, v, u * w, v * h)),
    }
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    const w = this.width
    const h = this.height
    if (!this.visible || this.isDestroyed || w <= 0 || h <= 0) return
    if (!this.frame) this.frame = OptimizedBuffer.create(w, h, this._ctx.widthMethod, { respectAlpha: false, id: `dither-${this.id}` })
    if (w !== this.gridW || h !== this.gridH) {
      this.gridW = w
      this.gridH = h
      this.frame.resize(w, h)
      const field = this.field(w, h)
      const { cols, rows } = ditherCells(field)
      this.cells = new Uint8Array(cols * rows)
      this.maskGrid = ditherMask(field)
      this.stale = true
    }
    if (this.stale) {
      this.stale = false
      this.paint(this.frame, w, h)
    }
    // A blit, so the native side clips to the screen and to scissor rects (scrollboxes, overflow).
    buffer.drawFrameBuffer(this._screenX, Math.trunc(this._screenY), this.frame)
  }

  private paint(frame: OptimizedBuffer, w: number, h: number) {
    const t = this._time + (this._animate ? (performance.now() - this.startedAt) / 1000 : 0)
    ditherFrame(this.cells, t, this.field(w, h), this.maskGrid)
    const palette = this.levelColors()
    const cells = this.cells
    for (let y = 0; y < h; y++) {
      const top = y * 2 * w
      const bottom = top + w
      for (let x = 0; x < w; x++) {
        const upper = cells[top + x]!
        const lower = cells[bottom + x]!
        // A cell whose halves match is plain background: a space, so text over it copies cleanly.
        if (upper === lower) frame.setCell(x, y, " ", palette[upper]!, palette[upper]!)
        else frame.setCell(x, y, FRAME_CHAR, palette[upper]!, palette[lower]!)
      }
    }
  }

  protected destroySelf(): void {
    this.stopTimer()
    this.frame?.destroy()
    this.frame = undefined
    super.destroySelf()
  }
}

// `<dither_field/>` in JSX.
extend({ dither_field: DitherRenderable })

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    dither_field: typeof DitherRenderable
  }
}

/**
 * The dithered waves with the TUI's tokens and quiet defaults. Same props as `<dither_field/>`.
 *
 *   <Dither position="absolute" top={0} left={0} width="100%" height="100%" mask={keepClear(textRects)} />
 */
export function Dither(props: DitherFieldOptions): JSX.Element {
  return <dither_field {...props} />
}
