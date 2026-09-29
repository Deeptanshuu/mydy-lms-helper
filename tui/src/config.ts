import { homedir } from "node:os"
import { join } from "node:path"
import { parseNerdSetting, type NerdFontSetting } from "./fonts"
import type { Dirs } from "./paths"

export interface Config {
  downloadDir: string
  /** true / false force Nerd Font icons on / off; "auto" looks for a Nerd Font (see fonts.ts). */
  nerdFont: NerdFontSetting
  /** Attendance requirement as a percentage. */
  threshold: number
  /** Let the dithered textures drift. */
  animations: boolean
}

const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p)

export async function loadConfig(dirs: Dirs): Promise<Config> {
  const defaults: Config = { downloadDir: dirs.downloads, nerdFont: "auto", threshold: 75, animations: true }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(await Bun.file(join(dirs.config, "config.json")).text())
  } catch {
    return defaults
  }
  return {
    downloadDir: typeof raw.downloadDir === "string" && raw.downloadDir.trim() ? expandHome(raw.downloadDir.trim()) : defaults.downloadDir,
    nerdFont: parseNerdSetting(raw.nerdFont) ?? defaults.nerdFont,
    threshold: typeof raw.threshold === "number" && raw.threshold > 0 && raw.threshold < 100 ? raw.threshold : defaults.threshold,
    animations: typeof raw.animations === "boolean" ? raw.animations : defaults.animations,
  }
}
