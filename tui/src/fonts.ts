// Can the user's terminal draw Nerd Font icons? A program can't choose the terminal's font, so this only
// guesses. Icons are Private Use Area glyphs: without a Nerd Font they show as empty boxes, while plain
// Unicode symbols always work, so every "not sure" answer here is false.
import { readdirSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export type NerdFontSetting = boolean | "auto"
type Env = Record<string, string | undefined>

/** "1", "off", "auto"... from the environment or a hand-edited config. undefined when unrecognised. */
export function parseNerdSetting(value: unknown): NerdFontSetting | undefined {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return undefined
  switch (value.trim().toLowerCase()) {
    case "1": case "true": case "yes": case "on": return true
    case "0": case "false": case "no": case "off": return false
    case "auto": return "auto"
    default: return undefined
  }
}

export type NerdSource = "flag" | "env" | "config" | "auto"

/** CLI flag > MYDY_NERD_FONT > config > auto-detection. `source` says which one decided. */
export function resolveNerdFont(
  input: { args: string[]; env: Env; config: NerdFontSetting },
  detect: () => boolean,
): { nerd: boolean; source: NerdSource } {
  // The last of the two flags wins, like most CLIs.
  const flag = input.args.findLast((a) => a === "--nerd-font" || a === "--no-nerd-font")
  if (flag) return { nerd: flag === "--nerd-font", source: "flag" }
  const fromEnv = parseNerdSetting(input.env.MYDY_NERD_FONT)
  if (typeof fromEnv === "boolean") return { nerd: fromEnv, source: "env" }
  // MYDY_NERD_FONT=auto skips the config file and detects.
  if (fromEnv !== "auto" && typeof input.config === "boolean") return { nerd: input.config, source: "config" }
  return { nerd: detect(), source: "auto" }
}

// ── Terminals ──────────────────────────────────────────────────────────────────────────────────

/**
 * Terminals that draw Nerd Font symbols themselves, whatever font is selected. TERM survives ssh (when the
 * terminfo is installed); TERM_PROGRAM doesn't. kitty has bundled the symbols since 0.36 and we can't ask
 * a terminal its version from inside it, so any kitty counts.
 */
export function builtinSymbolTerminal(env: Env): "Ghostty" | "WezTerm" | "kitty" | null {
  const program = (env.TERM_PROGRAM ?? "").toLowerCase()
  const term = env.TERM ?? ""
  if (program === "ghostty" || term === "xterm-ghostty") return "Ghostty"
  if (program === "wezterm" || term === "wezterm") return "WezTerm"
  if (term === "xterm-kitty" || env.KITTY_WINDOW_ID) return "kitty"
  return null
}

/** Over ssh the fonts we can see belong to the server, not to the terminal that draws them. */
export const isRemote = (env: Env): boolean => Boolean(env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY)

// ── Font names ─────────────────────────────────────────────────────────────────────────────────

// "JetBrainsMono Nerd Font", "JetBrainsMonoNerdFont-Regular.ttf", "Symbols Nerd Font", a "nerd-fonts" folder.
const NERD_WORDS = /nerd[\s_-]?fonts?/i
// Windows-compatible names: "JetBrainsMono NF", "CaskaydiaCoveNF.ttf", "...NFM-Regular.ttf" (Mono), "NFP" (Propo).
// Case-sensitive on purpose ("Infinity" has "nf"), and not after another capital ("INF", "CONFIG").
const NERD_ABBR = /(?<![A-Z])NF[MP]?(?![A-Za-z])/

export const looksLikeNerdFont = (name: string): boolean => NERD_WORDS.test(name) || NERD_ABBR.test(name)

/** Where fonts live for one platform, most likely first. */
export function fontDirs(env: Env, platform: string, home: string): string[] {
  if (platform === "darwin") return [join(home, "Library", "Fonts"), "/Library/Fonts"]
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local")
    return [join(local, "Microsoft", "Windows", "Fonts"), join(env.WINDIR ?? "C:\\Windows", "Fonts")]
  }
  return [join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), "fonts"), join(home, ".fonts"), "/usr/share/fonts", "/usr/local/share/fonts"]
}

/** The per-user directory --install-font writes to (no admin rights needed). */
export function userFontDir(env: Env, platform: string, home: string): string {
  const first = fontDirs(env, platform, home)[0]!
  return platform === "darwin" || platform === "win32" ? first : join(first, "MyDy")
}

// ── Looking at the machine ─────────────────────────────────────────────────────────────────────

export interface FontDeps {
  home: string
  /** stdout of a short command; null when it is missing, fails or times out. */
  run: (cmd: string[], timeoutMs: number) => string | null
  /** Entries of a directory; null when it can't be read. */
  list: (dir: string) => { name: string; dir: boolean }[] | null
  now: () => number
}

export function systemDeps(): FontDeps {
  return {
    home: homedir(),
    run: (cmd, timeout) => {
      try {
        const r = Bun.spawnSync({ cmd, stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout })
        return r.success ? r.stdout.toString() : null
      } catch {
        return null // not installed
      }
    },
    list: (dir) => {
      try {
        return readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }))
      } catch {
        return null
      }
    },
    now: () => performance.now(),
  }
}

const FONT_FILE = /\.(ttf|otf|ttc|otc)$/i
// /usr/share/fonts/truetype/<family>/<file> is depth 2; the rest is head room. Bounded so a huge fonts folder can't slow startup.
const MAX_DEPTH = 4
const MAX_ENTRIES = 5000
const BUDGET_MS = 60

function scanForNerdFont(dirs: string[], deps: FontDeps): boolean {
  const deadline = deps.now() + BUDGET_MS
  const stack = dirs.map((path) => ({ path, depth: 0 })).reverse() // first dir is popped first
  let seen = 0
  while (stack.length) {
    const { path, depth } = stack.pop()!
    for (const entry of deps.list(path) ?? []) {
      if (++seen > MAX_ENTRIES || deps.now() > deadline) return false
      if (entry.dir) {
        if (looksLikeNerdFont(entry.name)) return true
        if (depth < MAX_DEPTH) stack.push({ path: join(path, entry.name), depth: depth + 1 })
      } else if (FONT_FILE.test(entry.name) && looksLikeNerdFont(entry.name)) return true
    }
  }
  return false
}

/** True when a Nerd Font is probably available to the terminal. Never throws; about 20 ms with fc-list. */
export function nerdFontAvailable(env: Env = process.env, platform: string = process.platform, deps: FontDeps = systemDeps()): boolean {
  try {
    if (builtinSymbolTerminal(env)) return true
    if (isRemote(env)) return false
    if (platform !== "darwin" && platform !== "win32") {
      const families = deps.run(["fc-list", ":", "family"], 300)
      if (families !== null) return looksLikeNerdFont(families)
    }
    return scanForNerdFont(fontDirs(env, platform, deps.home), deps)
  } catch {
    return false
  }
}

// ── First-run hint ─────────────────────────────────────────────────────────────────────────────

export const FONT_HINT = {
  title: "Icons are in plain mode",
  detail: "No Nerd Font found. Run mydy --install-font for the full look (then pick it in your terminal's settings).",
  action: null,
} as const

/** True the first time only: creates a marker file in the config dir. False when it exists or can't be written (never nag). */
export async function claimFontHint(configDir: string): Promise<boolean> {
  try {
    await mkdir(configDir, { recursive: true })
    await writeFile(join(configDir, "font-hint-shown"), "The plain-icons hint was shown once. Delete this file to see it again.\n", { flag: "wx" })
    return true
  } catch {
    return false
  }
}
