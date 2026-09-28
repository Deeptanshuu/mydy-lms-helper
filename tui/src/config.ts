import { homedir } from "node:os"
import { join } from "node:path"
import type { Dirs } from "./paths"

export interface Config {
  downloadDir: string
  nerdFont: boolean
  /** Attendance requirement as a percentage. */
  threshold: number
}

const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p)

export async function loadConfig(dirs: Dirs): Promise<Config> {
  const defaults: Config = { downloadDir: dirs.downloads, nerdFont: true, threshold: 75 }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(await Bun.file(join(dirs.config, "config.json")).text())
  } catch {
    return defaults
  }
  return {
    downloadDir: typeof raw.downloadDir === "string" && raw.downloadDir.trim() ? expandHome(raw.downloadDir.trim()) : defaults.downloadDir,
    nerdFont: typeof raw.nerdFont === "boolean" ? raw.nerdFont : defaults.nerdFont,
    threshold: typeof raw.threshold === "number" && raw.threshold > 0 && raw.threshold < 100 ? raw.threshold : defaults.threshold,
  }
}
