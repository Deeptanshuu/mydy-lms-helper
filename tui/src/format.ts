/** Pads or truncates (with "…") to exactly `width` code points. */
export function fit(text: string, width: number): string {
  if (width <= 0) return ""
  const chars = [...text]
  if (chars.length > width) return chars.slice(0, Math.max(0, width - 1)).join("") + "…"
  return text + " ".repeat(width - chars.length)
}

export type BarRun = { text: string; kind: "fill" | "empty" | "notch" }

/** An attendance bar `width` cells wide with a notch at the threshold. */
export function barRuns(ratio: number, threshold: number, width: number): BarRun[] {
  const w = Math.max(3, width)
  const notchAt = Math.min(w - 1, Math.max(0, Math.round(threshold * w)))
  const filled = Math.min(w, Math.max(0, Math.round(ratio * w)))
  const runs: BarRun[] = []
  for (let i = 0; i < w; i++) {
    const kind: BarRun["kind"] = i === notchAt ? "notch" : i < filled ? "fill" : "empty"
    const ch = kind === "fill" ? "█" : kind === "empty" ? "░" : "│"
    const last = runs[runs.length - 1]
    if (last && last.kind === kind) last.text += ch
    else runs.push({ kind, text: ch })
  }
  return runs
}

/** First visible row so `selected` stays roughly centred in a window of `height` rows. */
export function windowStart(total: number, selected: number, height: number): number {
  if (total <= height || selected < 0) return 0
  return Math.max(0, Math.min(total - height, selected - Math.floor(height / 2)))
}

export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

export function fmtNumber(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/** "18.00" with range "0–25", or "9.00 / 10.00". Null when ungraded or unparseable. */
export function parseScore(grade: string | null, range: string | null): { value: number; max: number } | null {
  if (!grade) return null
  const [left = "", right] = grade.split("/")
  const value = Number.parseFloat(left.replace(",", "."))
  if (!Number.isFinite(value)) return null
  const maxSource = right ?? range ?? ""
  const numbers = maxSource.match(/\d+(?:[.,]\d+)?/g)
  const max = numbers ? Number.parseFloat(numbers[numbers.length - 1]!.replace(",", ".")) : Number.NaN
  return Number.isFinite(max) && max > 0 ? { value, max } : null
}

/** Word-wraps text to `width` columns, keeping blank lines between paragraphs and splitting over-long words. */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(10, width)
  const out: string[] = []
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("")
      continue
    }
    let line = ""
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while ([...word].length > w) {
        if (line) out.push(line)
        out.push([...word].slice(0, w).join(""))
        word = [...word].slice(w).join("")
        line = ""
      }
      if (!line) line = word
      else if ([...line].length + 1 + [...word].length <= w) line += ` ${word}`
      else {
        out.push(line)
        line = word
      }
    }
    if (line) out.push(line)
  }
  return out
}
