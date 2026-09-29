// Preview scenes for the dithered waves (ui/Dither.tsx): a header band, a sign-in backdrop and a levels sheet.
// Rendered by scripts/preview.tsx as 14-dither-band, 15-dither-signin and 16-dither-levels.
import { For } from "solid-js"
import { color } from "../src/theme"
import { Body, Caption, Card, Eyebrow, Gap, keySegs, Title, Wordmark } from "../src/ui/kit"
import { Dither, keepClear, smoothstep, type DitherMask } from "../src/ui/Dither"
import { Line } from "../src/ui/Line"

/**
 * Header band: the waves fade in from the left, stay clear of the text on either side (keepClear takes the text's
 * rectangles in cells), and thin out towards the bottom edge. Text sits on top with no background.
 */
export function DitherBand(props: { animate?: boolean; time?: number }) {
  const clear = keepClear(
    [
      { x: 3, y: 2, width: 52, height: 2 }, // wordmark and the two lines next to it
      { x: 98, y: 2, width: 19, height: 2 }, // account and key hints, right-aligned
    ],
    5,
  )
  const mask: DitherMask = (u, v, x, y) => clear(u, v, x, y) * smoothstep(0.1, 0.5, u) * (1 - 0.4 * smoothstep(0.55, 1, v))
  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color.bg}>
      <box height={6} flexShrink={0} backgroundColor={color.bar}>
        <Dither position="absolute" top={0} left={0} width="100%" height="100%" mask={mask} animate={props.animate} time={props.time ?? 20} />
        <box flexDirection="row" height={6} paddingX={3} paddingY={2} columnGap={4}>
          <Wordmark />
          <box flexDirection="column">
            <Line segs={[{ text: "LMS Helper", fg: color.strong }]} />
            <Line segs={[{ text: "Semester 5 · synced 2 min ago", fg: color.muted }]} />
          </box>
          <box flexGrow={1} />
          <box flexDirection="column" alignItems="flex-end">
            <Line segs={[{ text: "student@dypatil.edu", fg: color.text }]} />
            <Line segs={[...keySegs("?", "help", false), { text: "   " }, ...keySegs("q", "quit", false)]} />
          </box>
        </box>
      </box>
      <box paddingX={4} paddingTop={1}>
        <Caption text="The header band above sits on color.bar; the rows below are the app background." />
      </box>
    </box>
  )
}

/** Sign-in: the waves fill the screen at low strength behind a centred card. */
export function DitherSignin(props: { animate?: boolean; time?: number }) {
  // A soft spotlight: no waves at all around the wordmark, card and hints, so even faint text stays readable.
  const vignette: DitherMask = (u, v) => smoothstep(0.8, 1.6, Math.hypot((u - 0.5) / 0.3, (v - 0.5) / 0.36))
  return (
    <box width="100%" height="100%" backgroundColor={color.bg} alignItems="center" justifyContent="center">
      <Dither position="absolute" top={0} left={0} width="100%" height="100%" background={color.bg} strength={0.18} mask={vignette} animate={props.animate} time={props.time ?? 12} />
      <box flexDirection="column" alignItems="center">
        <Wordmark />
        <Gap />
        <Card title="Sign in" width={52} paddingY={1} focused>
          <Body text="Sign in with your MyDy account." />
          <Gap />
          <Eyebrow text="Username" width={44} />
          <Caption text="student@dypatil.edu" />
          <Gap />
          <Eyebrow text="Password" width={44} />
          <Caption text="••••••••••" />
        </Card>
        <Gap />
        <Line segs={[...keySegs("enter", "sign in", false), { text: "   " }, ...keySegs("tab", "next field", false)]} />
      </box>
    </box>
  )
}

type Variant = { strength: number; levels?: number; intensity?: number }
const VARIANTS: Variant[] = [
  { strength: 0.35, levels: 4 },
  { strength: 0.25, levels: 4 },
  { strength: 0.2, levels: 4 },
  { strength: 0.25, levels: 3 },
  { strength: 0.2, levels: 3 }, // the default
  { strength: 0.15, levels: 3 },
  { strength: 0.1, levels: 3 },
  { strength: 0.2, levels: 2 },
  { strength: 0.2, levels: 3, intensity: 0.5 },
  { strength: 0.2, levels: 3, intensity: 0.9 },
]

const label = (v: Variant) => `levels ${v.levels ?? 3}   strength ${v.strength}   intensity ${v.intensity ?? 0.7}`

/** The same waves at different strengths and level counts, each band labelled. */
export function DitherLevels() {
  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color.bg} paddingX={2} paddingY={1} rowGap={1}>
      <Title text="Dither strength and levels" width={100} bar />
      <For each={VARIANTS}>
        {(v) => (
          <box height={4} flexShrink={0} backgroundColor={color.bar}>
            <Dither position="absolute" top={0} left={0} width="100%" height="100%" {...v} time={12} />
            <box paddingX={2} paddingY={1}>
              <Line segs={[{ text: label(v), fg: color.strong, bold: true }]} />
            </box>
          </box>
        )}
      </For>
    </box>
  )
}

/** The same band at successive moments (6 s apart), to judge how the waves flow when animated. */
export function DitherMotion() {
  const fade = (u: number) => smoothstep(0.2, 0.55, u)
  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color.bg} paddingY={1} rowGap={1}>
      <For each={[0, 2, 4, 6, 8, 10]}>
        {(dt) => (
          <box height={6} flexShrink={0} backgroundColor={color.bar}>
            <Dither position="absolute" top={0} left={0} width="100%" height="100%" mask={fade} time={20 + dt * 3} />
            <box paddingX={4} paddingY={2}>
              <Line segs={[{ text: `t = ${20 + dt * 3} s`, fg: color.muted }]} />
            </box>
          </box>
        )}
      </For>
    </box>
  )
}
