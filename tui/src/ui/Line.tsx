import type { MouseEvent } from "@opentui/core"
import { For } from "solid-js"

export interface Seg {
  text: string
  fg?: string
  bg?: string
  bold?: boolean
}

export interface MouseProps {
  onMouseDown?: (e: MouseEvent) => void
  onMouseScroll?: (e: MouseEvent) => void
}

/** One terminal row made of coloured segments. */
export function Line(props: { segs: Seg[]; bg?: string; fg?: string; paddingX?: number } & MouseProps) {
  return (
    <box
      height={1}
      flexShrink={0}
      backgroundColor={props.bg}
      paddingLeft={props.paddingX ?? 0}
      paddingRight={props.paddingX ?? 0}
      onMouseDown={props.onMouseDown}
      onMouseScroll={props.onMouseScroll}
    >
      <text fg={props.fg} wrapMode="none">
        <For each={props.segs}>
          {(s) =>
            s.bold ? (
              <b>
                <span style={{ fg: s.fg, bg: s.bg }}>{s.text}</span>
              </b>
            ) : (
              <span style={{ fg: s.fg, bg: s.bg }}>{s.text}</span>
            )
          }
        </For>
      </text>
    </box>
  )
}

/** Centres `text` in `width` cells. */
export function center(text: string, width: number): string {
  const len = [...text].length
  if (len >= width) return text
  const left = Math.floor((width - len) / 2)
  return " ".repeat(left) + text + " ".repeat(width - len - left)
}

/** +1 for wheel down, -1 for wheel up, 0 otherwise. */
export function wheel(e: MouseEvent): number {
  return e.scroll?.direction === "down" ? 1 : e.scroll?.direction === "up" ? -1 : 0
}
