export const color = {
  bg: "#0E0F10",
  panel: "#17191B",
  bar: "#08090A",
  strip: "#1C1E21",
  line: "#2C2F33",
  text: "#D8DCDF",
  strong: "#F4F5F6",
  muted: "#8A9096",
  accent: "#FF6500",
  onAccent: "#08090A",
  onAccentMuted: "#5A2A00",
  ok: "#6FCF97",
  warn: "#F2C94C",
  low: "#F0506E",
} as const

export type Status = "ok" | "warn" | "low"

export function ratioStatus(ratio: number, threshold = 0.75): Status {
  return ratio >= threshold ? "ok" : ratio >= 0.5 ? "warn" : "low"
}
