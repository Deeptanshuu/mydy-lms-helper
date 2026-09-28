import { readFileSync } from "node:fs"

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    let value = m[2]!
    const quoted = /^(["'])(.*)\1$/.exec(value)
    value = quoted ? quoted[2]! : value.replace(/\s+#.*$/, "")
    out[m[1]!] = value
  }
  return out
}

/** Merges .env files; a key in an earlier path wins over the same key in a later one. */
export function readDotEnv(paths: string[]): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const path of [...paths].reverse()) {
    try {
      Object.assign(merged, parseDotEnv(readFileSync(path, "utf8")))
    } catch {
      // missing or unreadable: skip
    }
  }
  return merged
}
