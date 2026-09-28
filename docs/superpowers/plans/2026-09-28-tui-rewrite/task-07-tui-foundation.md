### Task 7: TUI foundation: theme, icons, format helpers, paths, config, .env, credentials, cache

Read the global rules in `docs/superpowers/plans/2026-09-28-tui-rewrite.md` first. Task 1 must be done. Runs in parallel with Tasks 2, 3, 4, 5, 12. Import core **types only** (`import type ... from "@mydy/core/types"`), because the rest of core is still being written.

**Files:**
- Create: `tui/src/theme.ts`, `tui/src/icons.ts`, `tui/src/format.ts`, `tui/src/paths.ts`, `tui/src/config.ts`, `tui/src/env.ts`, `tui/src/credentials.ts`, `tui/src/cache.ts`
- Test: `tui/test/icons.test.ts`, `tui/test/format.test.ts`, `tui/test/local.test.ts`

**Interfaces:**
- Consumes: types from `@mydy/core/types`.
- Produces:
  - `theme.ts`: `color` (tokens: `bg panel bar strip line text strong muted accent onAccent onAccentMuted ok warn low`), `type Status = "ok" | "warn" | "low"`, `ratioStatus(ratio: number, threshold = 0.75): Status`
  - `icons.ts`: `type IconName`, `glyph(name, nerd): string`, `slot(name, nerd): string` (glyph + 2 spaces, or `""` when the set has no symbol), `type FileKind = "pdf" | "ppt" | "doc" | "file"`, `fileSlot(kind, nerd): string` (always 3 cells with Nerd Font, 5 cells without)
  - `format.ts`: `fit(text, width): string`, `type BarRun = { text: string; kind: "fill" | "empty" | "notch" }`, `barRuns(ratio, threshold, width): BarRun[]`, `windowStart(total, selected, height): number`, `formatAge(ms): string`, `formatBytes(n): string`, `parseScore(grade, range): { value: number; max: number } | null`, `fmtNumber(n): string`
  - `paths.ts`: `interface Dirs { config; cache; downloads }`, `appDirs(env?, platform?, home?): Dirs`
  - `config.ts`: `interface Config { downloadDir: string; nerdFont: boolean; threshold: number }` (threshold is a percentage, default 75), `loadConfig(dirs: Dirs): Promise<Config>`
  - `env.ts`: `parseDotEnv(text): Record<string, string>`, `readDotEnv(paths: string[]): Record<string, string>` (earlier paths win)
  - `credentials.ts`: `interface Credentials { username; password }`, `interface SecretStore { get; set; delete }`, `loadCredentials(env, store): Promise<{ creds: Credentials | null; source: "env" | "keychain" | null }>`, `saveCredentials(store, creds): Promise<{ ok: true } | { ok: false; reason: string }>`, `bunSecretStore(): SecretStore | null`
  - `cache.ts`: `interface SnapshotCourse { course; content?; assignments?; grades?; announcements? }`, `interface Snapshot { version: 1; user: string; savedAt: number; attendance: Attendance | null; courses: SnapshotCourse[] }`, `snapshotPath(dirs, user): string`, `saveSnapshot(dirs, snap): Promise<void>`, `loadSnapshot(dirs, user): Promise<Snapshot | null>`

- [ ] **Step 1: Write the failing tests**

```ts
// tui/test/icons.test.ts
import { expect, test } from "bun:test"
import { fileSlot, glyph, slot, type IconName } from "../src/icons"

const NAMES: IconName[] = ["app", "courses", "marked", "unmarked", "deadline", "alert", "attendance", "files", "assignments", "grades", "announcements", "section", "done", "download", "downloading", "refresh", "filter", "collapsed", "expanded", "keys"]

test("every Nerd Font icon is a single code point", () => {
  for (const name of NAMES) expect([...glyph(name, true)]).toHaveLength(1)
})
test("slot is the glyph plus two spaces, or nothing", () => {
  expect(slot("marked", true)).toBe("\u{F0132}  ")
  expect(slot("marked", false)).toBe("■  ")
  expect(slot("courses", false)).toBe("")
})
test("file slots have one width per mode", () => {
  expect(fileSlot("pdf", true)).toBe("\u{F0226}  ")
  expect(fileSlot("pdf", false)).toBe("pdf  ")
  expect(fileSlot("file", false)).toBe("file ")
  for (const k of ["pdf", "ppt", "doc", "file"] as const) expect([...fileSlot(k, false)]).toHaveLength(5)
})
```

```ts
// tui/test/format.test.ts
import { describe, expect, test } from "bun:test"
import { barRuns, fit, fmtNumber, formatAge, formatBytes, parseScore, windowStart } from "../src/format"

describe("fit", () => {
  test("pads short text and truncates long text with an ellipsis", () => {
    expect(fit("abc", 5)).toBe("abc  ")
    expect(fit("Data Structures", 8)).toBe("Data St…")
    expect(fit("x", 0)).toBe("")
  })
  test("counts code points, not UTF-16 units", () => {
    expect([...fit("\u{F0474}ab", 3)]).toHaveLength(3)
  })
})

describe("barRuns", () => {
  test("filled past the 75% notch", () => {
    expect(barRuns(0.88, 0.75, 20)).toEqual([
      { kind: "fill", text: "█".repeat(15) },
      { kind: "notch", text: "│" },
      { kind: "fill", text: "██" },
      { kind: "empty", text: "░░" },
    ])
  })
  test("below the notch", () => {
    expect(barRuns(0.46, 0.75, 20)).toEqual([
      { kind: "fill", text: "█".repeat(9) },
      { kind: "empty", text: "░".repeat(6) },
      { kind: "notch", text: "│" },
      { kind: "empty", text: "░".repeat(4) },
    ])
  })
})

describe("windowStart", () => {
  test("keeps the selection in view", () => {
    expect(windowStart(5, 3, 20)).toBe(0)
    expect(windowStart(50, 10, 20)).toBe(0)
    expect(windowStart(50, 25, 20)).toBe(15)
    expect(windowStart(50, 49, 20)).toBe(30)
  })
})

describe("human formats", () => {
  test("formatAge", () => {
    expect(formatAge(30_000)).toBe("just now")
    expect(formatAge(2 * 60_000)).toBe("2 min ago")
    expect(formatAge(60 * 60_000)).toBe("1 hour ago")
    expect(formatAge(3 * 60 * 60_000)).toBe("3 hours ago")
    expect(formatAge(2 * 24 * 60 * 60_000)).toBe("2 days ago")
  })
  test("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(860 * 1024)).toBe("860 KB")
    expect(formatBytes(4.8 * 1024 * 1024)).toBe("4.8 MB")
  })
  test("parseScore", () => {
    expect(parseScore("18.00", "0–25")).toEqual({ value: 18, max: 25 })
    expect(parseScore("9.00 / 10.00", null)).toEqual({ value: 9, max: 10 })
    expect(parseScore("-", "0–10")).toBeNull()
    expect(parseScore(null, "0–10")).toBeNull()
    expect(parseScore("5", null)).toBeNull()
  })
  test("fmtNumber drops trailing zeros", () => {
    expect(fmtNumber(18)).toBe("18")
    expect(fmtNumber(9.5)).toBe("9.5")
    expect(fmtNumber(72.857)).toBe("72.86")
  })
})
```

```ts
// tui/test/local.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadSnapshot, saveSnapshot, snapshotPath, type Snapshot } from "../src/cache"
import { loadConfig } from "../src/config"
import { loadCredentials, saveCredentials, type SecretStore } from "../src/credentials"
import { parseDotEnv, readDotEnv } from "../src/env"
import { appDirs, type Dirs } from "../src/paths"

let root: string
let dirs: Dirs
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mydy-test-"))
  dirs = { config: join(root, "config"), cache: join(root, "cache"), downloads: join(root, "Downloads", "MyDy") }
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe("appDirs", () => {
  test("macOS", () => {
    expect(appDirs({}, "darwin", "/Users/me")).toEqual({
      config: join("/Users/me", ".config", "mydy"),
      cache: join("/Users/me", "Library", "Caches", "mydy"),
      downloads: join("/Users/me", "Downloads", "MyDy"),
    })
  })
  test("Linux honours XDG", () => {
    expect(appDirs({ XDG_CONFIG_HOME: "/x/conf", XDG_CACHE_HOME: "/x/cache" }, "linux", "/home/me")).toEqual({
      config: join("/x/conf", "mydy"),
      cache: join("/x/cache", "mydy"),
      downloads: join("/home/me", "Downloads", "MyDy"),
    })
  })
  test("Windows uses APPDATA and LOCALAPPDATA", () => {
    const d = appDirs({ APPDATA: "C:/Users/me/AppData/Roaming", LOCALAPPDATA: "C:/Users/me/AppData/Local" }, "win32", "C:/Users/me")
    expect(d.config).toBe(join("C:/Users/me/AppData/Roaming", "mydy"))
    expect(d.cache).toBe(join("C:/Users/me/AppData/Local", "mydy"))
  })
})

describe("loadConfig", () => {
  test("defaults when there is no file", async () => {
    expect(await loadConfig(dirs)).toEqual({ downloadDir: dirs.downloads, nerdFont: true, threshold: 75 })
  })
  test("reads valid values, ignores invalid ones, expands ~", async () => {
    await mkdir(dirs.config, { recursive: true })
    await writeFile(join(dirs.config, "config.json"), JSON.stringify({ downloadDir: "~/Notes", nerdFont: false, threshold: 150 }))
    const c = await loadConfig(dirs)
    expect(c.nerdFont).toBe(false)
    expect(c.threshold).toBe(75)
    expect(c.downloadDir.endsWith(join("", "Notes"))).toBe(true)
    expect(c.downloadDir.startsWith("~")).toBe(false)
  })
  test("broken JSON falls back to defaults", async () => {
    await mkdir(dirs.config, { recursive: true })
    await writeFile(join(dirs.config, "config.json"), "{ nope")
    expect((await loadConfig(dirs)).threshold).toBe(75)
  })
})

describe(".env", () => {
  test("parseDotEnv handles quotes, comments and export", () => {
    expect(parseDotEnv(`# comment\nexport A=1\nB="two words"\nC='x#y'\nD=plain # trailing\n\nbad line`)).toEqual({
      A: "1", B: "two words", C: "x#y", D: "plain",
    })
  })
  test("readDotEnv: earlier files win, missing files are skipped", async () => {
    await writeFile(join(root, "a.env"), "X=from-a\n")
    await writeFile(join(root, "b.env"), "X=from-b\nY=from-b\n")
    expect(readDotEnv([join(root, "a.env"), join(root, "missing.env"), join(root, "b.env")])).toEqual({ X: "from-a", Y: "from-b" })
  })
})

function memoryStore(initial: string | null = null, failSet = false): SecretStore & { value: string | null } {
  const s = {
    value: initial,
    get: async () => s.value,
    set: async ({ value }: { value: string }) => {
      if (failSet) throw new Error("no keyring")
      s.value = value
    },
    delete: async () => ((s.value = null), true),
  }
  return s
}

describe("credentials", () => {
  test("environment wins over the keychain", async () => {
    const r = await loadCredentials({ MYDY_USERNAME: "env@x", MYDY_PASSWORD: "p" }, memoryStore(JSON.stringify({ username: "kc@x", password: "q" })))
    expect(r).toEqual({ creds: { username: "env@x", password: "p" }, source: "env" })
  })
  test("keychain JSON, and junk is ignored", async () => {
    expect((await loadCredentials({}, memoryStore(JSON.stringify({ username: "kc@x", password: "q" })))).source).toBe("keychain")
    expect((await loadCredentials({}, memoryStore("not json"))).creds).toBeNull()
    expect((await loadCredentials({}, null)).creds).toBeNull()
  })
  test("saving reports why it failed", async () => {
    const creds = { username: "a@b", password: "c" }
    const ok = memoryStore()
    expect(await saveCredentials(ok, creds)).toEqual({ ok: true })
    expect(JSON.parse(ok.value!)).toEqual(creds)
    const bad = await saveCredentials(memoryStore(null, true), creds)
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.reason).toContain("no keyring")
    expect((await saveCredentials(null, creds)).ok).toBe(false)
  })
})

describe("snapshot cache", () => {
  const snap: Snapshot = {
    version: 1,
    user: "student@dypatil.edu",
    savedAt: 1_790_000_000_000,
    attendance: { batch: "CSE-2023-A", semester: "Semester 5", subjects: [] },
    courses: [{
      course: { id: "812", name: "Data Structures", url: "https://x" },
      assignments: [{ name: "A3", url: "https://x/a", dueText: null, due: new Date(2026, 8, 30, 23, 59), submissionStatus: null, gradingStatus: null, grade: null, timeRemaining: null, submitted: false }],
    }],
  }
  test("round trip revives dates", async () => {
    await saveSnapshot(dirs, snap)
    const loaded = await loadSnapshot(dirs, "student@dypatil.edu")
    expect(loaded?.courses[0]?.assignments?.[0]?.due).toEqual(new Date(2026, 8, 30, 23, 59))
    expect(loaded?.attendance?.semester).toBe("Semester 5")
  })
  test("file name does not contain the username", () => {
    expect(snapshotPath(dirs, "student@dypatil.edu")).not.toContain("student")
  })
  test("missing or foreign files load as null", async () => {
    expect(await loadSnapshot(dirs, "nobody@x")).toBeNull()
    await mkdir(dirs.cache, { recursive: true })
    await writeFile(snapshotPath(dirs, "old@x"), JSON.stringify({ version: 0 }))
    expect(await loadSnapshot(dirs, "old@x")).toBeNull()
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `bun test --cwd tui`
Expected: FAIL, modules not found.

- [ ] **Step 3: `tui/src/theme.ts`**

```ts
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
```

- [ ] **Step 4: `tui/src/icons.ts`**

```ts
export type IconName =
  | "app" | "courses" | "marked" | "unmarked" | "deadline" | "alert" | "attendance"
  | "files" | "assignments" | "grades" | "announcements" | "section" | "done"
  | "download" | "downloading" | "refresh" | "filter" | "collapsed" | "expanded" | "keys"

// Nerd Fonts Material Design (nf-md-*) code points.
const NERD: Record<IconName, string> = {
  app: "\u{F0474}", // school
  courses: "\u{F14F7}", // book_open_variant
  marked: "\u{F0132}", // checkbox_marked
  unmarked: "\u{F0131}", // checkbox_blank_outline
  deadline: "\u{F00F0}", // calendar_clock
  alert: "\u{F0026}", // alert
  attendance: "\u{F0128}", // chart_bar
  files: "\u{F024B}", // folder
  assignments: "\u{F0A38}", // clipboard_text_outline
  grades: "\u{F04D2}", // star_outline
  announcements: "\u{F00E6}", // bullhorn
  section: "\u{F0256}", // folder_outline
  done: "\u{F012C}", // check
  download: "\u{F01DA}", // download
  downloading: "\u{F0997}", // progress_download
  refresh: "\u{F0450}", // refresh
  filter: "\u{F0349}", // magnify
  collapsed: "\u{F0142}", // chevron_right
  expanded: "\u{F0140}", // chevron_down
  keys: "\u{F030C}", // keyboard
}

// Symbols every terminal font has. "" means: no icon in this mode.
const UNICODE: Record<IconName, string> = {
  app: "◆", courses: "", marked: "■", unmarked: "□", deadline: "◷", alert: "▲", attendance: "",
  files: "", assignments: "", grades: "", announcements: "", section: "▾", done: "✓",
  download: "↓", downloading: "↓", refresh: "↻", filter: "/", collapsed: "▸", expanded: "▾", keys: "",
}

export function glyph(name: IconName, nerd: boolean): string {
  return (nerd ? NERD : UNICODE)[name]
}

/** Icon plus two spaces (a 3-cell slot), or "" when this mode has no icon. */
export function slot(name: IconName, nerd: boolean): string {
  const g = glyph(name, nerd)
  return g ? `${g}  ` : ""
}

export type FileKind = "pdf" | "ppt" | "doc" | "file"

const FILE_NERD: Record<FileKind, string> = {
  pdf: "\u{F0226}", // file_pdf_box
  ppt: "\u{F0228}", // file_powerpoint_box
  doc: "\u{F09EE}", // file_document_outline
  file: "\u{F0224}", // file_outline
}

/** 3 cells with a Nerd Font, 5 cells ("pdf  ", "file ") without. */
export function fileSlot(kind: FileKind, nerd: boolean): string {
  return nerd ? `${FILE_NERD[kind]}  ` : kind.padEnd(4) + " "
}
```

- [ ] **Step 5: `tui/src/format.ts`**

```ts
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
```

- [ ] **Step 6: `tui/src/paths.ts` and `tui/src/config.ts`**

```ts
// tui/src/paths.ts
import { homedir } from "node:os"
import { join } from "node:path"

export interface Dirs {
  config: string
  cache: string
  downloads: string
}

export function appDirs(env: Record<string, string | undefined> = process.env, platform: string = process.platform, home: string = homedir()): Dirs {
  const downloads = join(home, "Downloads", "MyDy")
  if (platform === "win32") {
    return {
      config: join(env.APPDATA ?? join(home, "AppData", "Roaming"), "mydy"),
      cache: join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "mydy"),
      downloads,
    }
  }
  const config = join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "mydy")
  if (platform === "darwin") return { config, cache: join(home, "Library", "Caches", "mydy"), downloads }
  return { config, cache: join(env.XDG_CACHE_HOME ?? join(home, ".cache"), "mydy"), downloads }
}
```

```ts
// tui/src/config.ts
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
```

- [ ] **Step 7: `tui/src/env.ts` and `tui/src/credentials.ts`**

```ts
// tui/src/env.ts
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
```

```ts
// tui/src/credentials.ts
export interface Credentials {
  username: string
  password: string
}

export interface SecretStore {
  get(o: { service: string; name: string }): Promise<string | null>
  set(o: { service: string; name: string; value: string }): Promise<void>
  delete(o: { service: string; name: string }): Promise<boolean>
}

const KEY = { service: "mydy-lms-helper", name: "credentials" }

export async function loadCredentials(
  env: Record<string, string | undefined>,
  store: SecretStore | null,
): Promise<{ creds: Credentials | null; source: "env" | "keychain" | null }> {
  if (env.MYDY_USERNAME && env.MYDY_PASSWORD) {
    return { creds: { username: env.MYDY_USERNAME, password: env.MYDY_PASSWORD }, source: "env" }
  }
  if (store) {
    try {
      const raw = await store.get(KEY)
      const value = raw ? JSON.parse(raw) : null
      if (typeof value?.username === "string" && typeof value?.password === "string") {
        return { creds: { username: value.username, password: value.password }, source: "keychain" }
      }
    } catch {
      // unreadable keychain entry: treat as absent
    }
  }
  return { creds: null, source: null }
}

export async function saveCredentials(store: SecretStore | null, creds: Credentials): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!store) return { ok: false, reason: "This system has no keychain available, so you'll be asked to sign in next time." }
  try {
    await store.set({ ...KEY, value: JSON.stringify(creds) })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: `Couldn't save to the system keychain (${(e as Error).message}). You'll be asked to sign in next time.` }
  }
}

/** Bun.secrets (macOS Keychain, libsecret, Windows Credential Manager), or null if this Bun lacks it. */
export function bunSecretStore(): SecretStore | null {
  const secrets = (Bun as unknown as { secrets?: SecretStore }).secrets
  return secrets ? { get: (o) => secrets.get(o), set: (o) => secrets.set(o), delete: (o) => secrets.delete(o) } : null
}
```

- [ ] **Step 8: `tui/src/cache.ts`**

```ts
import { mkdir, rename } from "node:fs/promises"
import { join } from "node:path"
import type { AnnouncementSummary, Assignment, Attendance, Course, GradeReport, Section } from "@mydy/core/types"
import type { Dirs } from "./paths"

export interface SnapshotCourse {
  course: Course
  content?: Section[]
  assignments?: Assignment[]
  grades?: GradeReport
  announcements?: AnnouncementSummary[]
}

export interface Snapshot {
  version: 1
  user: string
  savedAt: number
  attendance: Attendance | null
  courses: SnapshotCourse[]
}

export function snapshotPath(dirs: Dirs, user: string): string {
  const hash = new Bun.CryptoHasher("sha256").update(user.trim().toLowerCase()).digest("hex").slice(0, 16)
  return join(dirs.cache, `${hash}.json`)
}

export async function saveSnapshot(dirs: Dirs, snap: Snapshot): Promise<void> {
  await mkdir(dirs.cache, { recursive: true })
  const path = snapshotPath(dirs, snap.user)
  await Bun.write(`${path}.tmp`, JSON.stringify(snap))
  await rename(`${path}.tmp`, path)
}

export async function loadSnapshot(dirs: Dirs, user: string): Promise<Snapshot | null> {
  try {
    const snap = JSON.parse(await Bun.file(snapshotPath(dirs, user)).text()) as Snapshot
    if (snap?.version !== 1 || !Array.isArray(snap.courses)) return null
    for (const c of snap.courses) for (const a of c.assignments ?? []) a.due = a.due ? new Date(a.due) : null
    return snap
  } catch {
    return null
  }
}
```

- [ ] **Step 9: Run the tests**

Run: `bun test --cwd tui`
Expected: all pass.
