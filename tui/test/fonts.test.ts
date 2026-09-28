import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "../src/config"
import { FAMILY, FONT_FILES, FONT_VERSION, installFonts, runInstallFont, sha256, terminalAdvice, type FontFile, type InstallDeps } from "../src/fontinstall"
import {
  builtinSymbolTerminal, claimFontHint, fontDirs, FONT_HINT, isRemote, looksLikeNerdFont, nerdFontAvailable, parseNerdSetting, resolveNerdFont, systemDeps,
  userFontDir, type FontDeps,
} from "../src/fonts"
import { glyph, ICON_NAMES, slot } from "../src/icons"

// ── Resolution order ───────────────────────────────────────────────────────────────────────────

describe("parseNerdSetting", () => {
  test("booleans, common spellings and auto", () => {
    expect(parseNerdSetting(true)).toBe(true)
    expect(parseNerdSetting(false)).toBe(false)
    for (const yes of ["1", "true", "YES", " on "]) expect(parseNerdSetting(yes)).toBe(true)
    for (const no of ["0", "false", "No", "off"]) expect(parseNerdSetting(no)).toBe(false)
    expect(parseNerdSetting("Auto")).toBe("auto")
  })
  test("anything else is unrecognised", () => {
    for (const v of ["", "maybe", 1, 0, null, undefined, {}]) expect(parseNerdSetting(v)).toBeUndefined()
  })
})

describe("resolveNerdFont", () => {
  const spy = (answer: boolean) => {
    const calls = { n: 0 }
    return { calls, detect: () => (calls.n++, answer) }
  }
  const resolve = (o: { args?: string[]; env?: Record<string, string>; config?: boolean | "auto"; detected?: boolean }) => {
    const { calls, detect } = spy(o.detected ?? false)
    return { ...resolveNerdFont({ args: o.args ?? [], env: o.env ?? {}, config: o.config ?? "auto" }, detect), detections: calls.n }
  }

  test("a CLI flag beats the environment, the config and detection", () => {
    expect(resolve({ args: ["--nerd-font"], env: { MYDY_NERD_FONT: "0" }, config: false })).toEqual({ nerd: true, source: "flag", detections: 0 })
    expect(resolve({ args: ["--no-nerd-font"], env: { MYDY_NERD_FONT: "1" }, config: true, detected: true })).toEqual({ nerd: false, source: "flag", detections: 0 })
  })
  test("the last flag wins", () => {
    expect(resolve({ args: ["--no-nerd-font", "--nerd-font"] }).nerd).toBe(true)
    expect(resolve({ args: ["--nerd-font", "--no-nerd-font"] }).nerd).toBe(false)
  })
  test("MYDY_NERD_FONT beats the config and detection", () => {
    expect(resolve({ env: { MYDY_NERD_FONT: "1" }, config: false })).toEqual({ nerd: true, source: "env", detections: 0 })
    expect(resolve({ env: { MYDY_NERD_FONT: "0" }, config: true, detected: true })).toEqual({ nerd: false, source: "env", detections: 0 })
  })
  test("an unrecognised MYDY_NERD_FONT is ignored", () => {
    expect(resolve({ env: { MYDY_NERD_FONT: "banana" }, config: false })).toEqual({ nerd: false, source: "config", detections: 0 })
  })
  test("MYDY_NERD_FONT=auto skips the config and detects", () => {
    expect(resolve({ env: { MYDY_NERD_FONT: "auto" }, config: false, detected: true })).toEqual({ nerd: true, source: "auto", detections: 1 })
  })
  test("a boolean config beats detection", () => {
    expect(resolve({ config: true })).toEqual({ nerd: true, source: "config", detections: 0 })
    expect(resolve({ config: false, detected: true })).toEqual({ nerd: false, source: "config", detections: 0 })
  })
  test("auto asks the detector, once", () => {
    expect(resolve({ detected: true })).toEqual({ nerd: true, source: "auto", detections: 1 })
    expect(resolve({ detected: false })).toEqual({ nerd: false, source: "auto", detections: 1 })
  })
})

describe("config", () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mydy-fonts-"))
  })
  afterEach(() => rm(root, { recursive: true, force: true }))
  const dirs = () => ({ config: root, cache: join(root, "cache"), downloads: join(root, "dl") })
  const withConfig = async (json: unknown) => {
    await writeFile(join(root, "config.json"), JSON.stringify(json))
    return (await loadConfig(dirs())).nerdFont
  }

  test("nerdFont defaults to auto", async () => {
    expect((await loadConfig(dirs())).nerdFont).toBe("auto")
  })
  test("booleans and auto are accepted, junk falls back to auto", async () => {
    expect(await withConfig({ nerdFont: true })).toBe(true)
    expect(await withConfig({ nerdFont: false })).toBe(false)
    expect(await withConfig({ nerdFont: "auto" })).toBe("auto")
    expect(await withConfig({ nerdFont: "false" })).toBe(false)
    expect(await withConfig({ nerdFont: 7 })).toBe("auto")
    expect(await withConfig({})).toBe("auto")
  })
})

// ── Terminals ──────────────────────────────────────────────────────────────────────────────────

describe("builtinSymbolTerminal", () => {
  test("Ghostty, WezTerm and kitty", () => {
    expect(builtinSymbolTerminal({ TERM_PROGRAM: "ghostty" })).toBe("Ghostty")
    expect(builtinSymbolTerminal({ TERM: "xterm-ghostty" })).toBe("Ghostty")
    expect(builtinSymbolTerminal({ TERM_PROGRAM: "WezTerm" })).toBe("WezTerm")
    expect(builtinSymbolTerminal({ TERM: "wezterm" })).toBe("WezTerm")
    expect(builtinSymbolTerminal({ TERM: "xterm-kitty" })).toBe("kitty")
    expect(builtinSymbolTerminal({ KITTY_WINDOW_ID: "3", TERM: "xterm-256color" })).toBe("kitty")
  })
  test("everything else has no built-in symbols", () => {
    for (const env of [{}, { TERM_PROGRAM: "iTerm.app" }, { TERM_PROGRAM: "Apple_Terminal" }, { TERM_PROGRAM: "vscode" }, { WT_SESSION: "x" }, { TERM: "xterm-256color" }, { TERM: "alacritty" }, { TERM_PROGRAM: "tmux" }]) {
      expect(builtinSymbolTerminal(env)).toBeNull()
    }
  })
  test("ssh is detected from any of its variables", () => {
    expect(isRemote({ SSH_CONNECTION: "1.2.3.4 1 5.6.7.8 22" })).toBe(true)
    expect(isRemote({ SSH_TTY: "/dev/pts/1" })).toBe(true)
    expect(isRemote({})).toBe(false)
  })
})

// ── Font names ─────────────────────────────────────────────────────────────────────────────────

describe("looksLikeNerdFont", () => {
  test("Nerd Font family and file names", () => {
    for (const name of [
      "JetBrainsMono Nerd Font", "JetBrainsMonoNerdFont-Regular.ttf", "Symbols Nerd Font", "SymbolsNerdFontMono-Regular.ttf", "Hack Nerd Font Mono",
      "FiraCode Nerd Font Propo", "JetBrainsMono NF", "JetBrainsMono NFM", "CaskaydiaCoveNF.ttf", "CaskaydiaCoveNF-Regular.ttf", "CaskaydiaCoveNFM-Regular.ttf",
      "CaskaydiaCoveNFP-Bold.ttf", "MesloLGS NF Regular.ttf", "nerd-fonts", "NerdFonts", "Hack NF",
    ]) {
      expect(looksLikeNerdFont(name)).toBe(true)
    }
  })
  test("ordinary fonts", () => {
    for (const name of [
      "DejaVu Sans Mono", "Liberation Mono", "Consolas", "Menlo", "Menlo-Regular.ttf", "Cascadia Code", "Cascadia Mono", "JetBrains Mono", "JetBrainsMono-Regular.ttf",
      "Infinity.ttf", "CONFIG.ttf", "INF.ttf", "SF Mono", "IBM Plex Mono", "FiraCode-Regular.ttf", "Noto Sans Mono CJK JP", "NFL Sans", "Inconsolata",
    ]) {
      expect(looksLikeNerdFont(name)).toBe(false)
    }
  })
  test("matches inside a whole fc-list listing", () => {
    expect(looksLikeNerdFont("DejaVu Sans Mono\nJetBrainsMono Nerd Font,JetBrainsMono NF\nLiberation Mono\n")).toBe(true)
    expect(looksLikeNerdFont("DejaVu Sans Mono\nLiberation Mono\nIPAGothic,IPAゴシック\n")).toBe(false)
  })
})

describe("font folders", () => {
  test("per platform", () => {
    expect(fontDirs({}, "linux", "/home/me")).toEqual([join("/home/me", ".local/share/fonts"), join("/home/me", ".fonts"), "/usr/share/fonts", "/usr/local/share/fonts"])
    expect(fontDirs({ XDG_DATA_HOME: "/x" }, "linux", "/home/me")[0]).toBe(join("/x", "fonts"))
    expect(fontDirs({}, "darwin", "/Users/me")).toEqual([join("/Users/me", "Library", "Fonts"), "/Library/Fonts"])
    expect(fontDirs({ LOCALAPPDATA: "C:/L", WINDIR: "C:/W" }, "win32", "C:/Users/me")).toEqual([join("C:/L", "Microsoft", "Windows", "Fonts"), join("C:/W", "Fonts")])
  })
  test("--install-font goes to a per-user folder", () => {
    expect(userFontDir({}, "linux", "/home/me")).toBe(join("/home/me", ".local/share/fonts", "MyDy"))
    expect(userFontDir({}, "darwin", "/Users/me")).toBe(join("/Users/me", "Library", "Fonts"))
    expect(userFontDir({ LOCALAPPDATA: "C:/L" }, "win32", "C:/Users/me")).toBe(join("C:/L", "Microsoft", "Windows", "Fonts"))
  })
})

// ── Detection ──────────────────────────────────────────────────────────────────────────────────

type Tree = { [name: string]: Tree | null }
const walk = (tree: Tree, path: string): Tree | null => {
  let node: Tree | null = tree
  for (const part of path.split(/[\\/]/).filter(Boolean)) node = node?.[part] ?? null
  return node
}
function fakeDeps(o: { tree?: Tree; fcList?: string | null; home?: string; now?: () => number } = {}) {
  const log = { run: [] as string[][], list: [] as string[] }
  const deps: FontDeps = {
    home: o.home ?? "/home/me",
    run: (cmd) => (log.run.push(cmd), o.fcList ?? null),
    list: (dir) => {
      log.list.push(dir)
      const node = walk(o.tree ?? {}, dir)
      return node ? Object.entries(node).map(([name, child]) => ({ name, dir: child !== null })) : null
    },
    now: o.now ?? (() => 0),
  }
  return { deps, log }
}

describe("nerdFontAvailable", () => {
  test("a terminal with built-in symbols is enough; nothing is inspected", () => {
    const { deps, log } = fakeDeps()
    expect(nerdFontAvailable({ TERM_PROGRAM: "ghostty" }, "linux", deps)).toBe(true)
    expect(nerdFontAvailable({ TERM: "xterm-kitty" }, "darwin", deps)).toBe(true)
    expect(log.run).toEqual([])
    expect(log.list).toEqual([])
  })
  test("built-in symbols also count over ssh (TERM travels, the fonts don't)", () => {
    expect(nerdFontAvailable({ TERM: "xterm-kitty", SSH_TTY: "/dev/pts/0" }, "linux", fakeDeps().deps)).toBe(true)
  })
  test("over ssh the server's fonts say nothing about the local terminal", () => {
    const { deps, log } = fakeDeps({ fcList: "JetBrainsMono Nerd Font\n" })
    expect(nerdFontAvailable({ SSH_CONNECTION: "a b c d" }, "linux", deps)).toBe(false)
    expect(log.run).toEqual([])
  })
  test("Linux: fc-list lists a Nerd Font", () => {
    const { deps, log } = fakeDeps({ fcList: "DejaVu Sans Mono\nJetBrainsMono Nerd Font,JetBrainsMono NF\n" })
    expect(nerdFontAvailable({}, "linux", deps)).toBe(true)
    expect(log.run[0]).toEqual(["fc-list", ":", "family"])
    expect(log.list).toEqual([]) // fc-list answered, so no folder scan
  })
  test("Linux: fc-list without a Nerd Font is a no, without scanning folders", () => {
    const { deps, log } = fakeDeps({ fcList: "DejaVu Sans Mono\nLiberation Mono\n", tree: { usr: { share: { fonts: { "JetBrainsMonoNerdFont-Regular.ttf": null } } } } })
    expect(nerdFontAvailable({}, "linux", deps)).toBe(false)
    expect(log.list).toEqual([])
  })
  test("Linux: without fc-list, folders are scanned, nested", () => {
    const tree: Tree = { usr: { share: { fonts: { truetype: { dejavu: { "DejaVuSansMono.ttf": null }, "jb-mono": { "JetBrainsMonoNerdFont-Regular.ttf": null } } } } } }
    expect(nerdFontAvailable({}, "linux", fakeDeps({ tree, fcList: null }).deps)).toBe(true)
  })
  test("Linux: user font folder (XDG_DATA_HOME) and ~/.fonts are scanned", () => {
    const xdg: Tree = { xdg: { fonts: { MyDy: { "CaskaydiaCoveNF.ttf": null } } } }
    expect(nerdFontAvailable({ XDG_DATA_HOME: "/xdg" }, "linux", fakeDeps({ tree: xdg }).deps)).toBe(true)
    const dot: Tree = { home: { me: { ".fonts": { "Hack NF.otf": null } } } }
    expect(nerdFontAvailable({}, "linux", fakeDeps({ tree: dot }).deps)).toBe(true)
  })
  test("Linux: no Nerd Font anywhere", () => {
    const tree: Tree = { usr: { share: { fonts: { truetype: { dejavu: { "DejaVuSansMono.ttf": null }, liberation: { "LiberationMono-Regular.ttf": null } } } } } }
    expect(nerdFontAvailable({}, "linux", fakeDeps({ tree }).deps)).toBe(false)
  })
  test("only font files count: notes and licenses that mention Nerd Font don't", () => {
    const tree: Tree = { usr: { share: { fonts: { "nerd-font-notes.txt": null, "JetBrainsMonoNerdFont-OFL.txt": null } } } }
    expect(nerdFontAvailable({}, "linux", fakeDeps({ tree }).deps)).toBe(false)
  })
  test("a folder named for Nerd Fonts counts", () => {
    const tree: Tree = { usr: { share: { fonts: { "nerd-fonts": { "Whatever.ttf": null } } } } }
    expect(nerdFontAvailable({}, "linux", fakeDeps({ tree }).deps)).toBe(true)
  })
  test("macOS: ~/Library/Fonts and /Library/Fonts", () => {
    const user: Tree = { Users: { me: { Library: { Fonts: { "JetBrainsMonoNerdFont-Bold.ttf": null } } } } }
    expect(nerdFontAvailable({}, "darwin", fakeDeps({ tree: user, home: "/Users/me" }).deps)).toBe(true)
    const system: Tree = { Library: { Fonts: { "SymbolsNerdFont-Regular.ttf": null } } }
    expect(nerdFontAvailable({}, "darwin", fakeDeps({ tree: system, home: "/Users/me" }).deps)).toBe(true)
    expect(nerdFontAvailable({}, "darwin", fakeDeps({ tree: { Library: { Fonts: { "Menlo.ttc": null } } }, home: "/Users/me" }).deps)).toBe(false)
  })
  test("macOS and Windows never run fc-list", () => {
    for (const platform of ["darwin", "win32"]) {
      const { deps, log } = fakeDeps({ fcList: "JetBrainsMono Nerd Font" })
      expect(nerdFontAvailable({}, platform, deps)).toBe(false)
      expect(log.run).toEqual([])
    }
  })
  test("Windows: per-user and system font folders", () => {
    const env = { LOCALAPPDATA: "/L", WINDIR: "/W" }
    expect(nerdFontAvailable(env, "win32", fakeDeps({ tree: { L: { Microsoft: { Windows: { Fonts: { "JetBrainsMonoNerdFont-Regular.ttf": null } } } } } }).deps)).toBe(true)
    expect(nerdFontAvailable(env, "win32", fakeDeps({ tree: { W: { Fonts: { "CascadiaCodeNF.ttf": null } } } }).deps)).toBe(true)
    expect(nerdFontAvailable(env, "win32", fakeDeps({ tree: { W: { Fonts: { "consola.ttf": null } } } }).deps)).toBe(false)
  })
  test("the folder scan is bounded in depth, entries and time", () => {
    const deep: Tree = { usr: { share: { fonts: { a: { b: { c: { d: { e: { "NerdFont.ttf": null } } } } } } } } }
    expect(nerdFontAvailable({}, "linux", fakeDeps({ tree: deep }).deps)).toBe(false)

    const many: Tree = { usr: { share: { fonts: { ...Object.fromEntries(Array.from({ length: 6000 }, (_, i) => [`f${i}.ttf`, null])), "NerdFont.ttf": null } } } }
    expect(nerdFontAvailable({}, "linux", fakeDeps({ tree: many }).deps)).toBe(false)

    let t = 0
    const slow: Tree = { usr: { share: { fonts: { "a.ttf": null, "b.ttf": null, "NerdFont.ttf": null } } } }
    expect(nerdFontAvailable({}, "linux", fakeDeps({ tree: slow, now: () => (t += 100) }).deps)).toBe(false)
  })
  test("never throws, whatever the machine does", () => {
    const boom = () => {
      throw new Error("nope")
    }
    expect(nerdFontAvailable({}, "linux", { home: "/h", run: boom, list: boom, now: () => 0 })).toBe(false)
    expect(nerdFontAvailable({}, "darwin", { home: "/h", run: boom, list: boom, now: () => 0 })).toBe(false)
  })
  test("the real machine: answers quickly and without throwing", () => {
    const start = performance.now()
    expect(typeof nerdFontAvailable({ ...process.env, TERM_PROGRAM: undefined, TERM: undefined, KITTY_WINDOW_ID: undefined, SSH_CONNECTION: undefined, SSH_TTY: undefined, SSH_CLIENT: undefined })).toBe("boolean")
    expect(performance.now() - start).toBeLessThan(1000) // ~20 ms with fc-list; generous for slow CI disks
    expect(systemDeps().run(["definitely-not-a-real-command-xyz"], 100)).toBeNull()
    expect(systemDeps().list("/definitely/not/a/dir")).toBeNull()
  })
})

// ── First-run hint ─────────────────────────────────────────────────────────────────────────────

describe("first-run hint", () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mydy-hint-"))
  })
  afterEach(() => rm(root, { recursive: true, force: true }))

  test("shows once: the first claim wins, later ones don't (config dir is created)", async () => {
    const dir = join(root, "does", "not", "exist")
    expect(await claimFontHint(dir)).toBe(true)
    expect(await claimFontHint(dir)).toBe(false)
    expect(await claimFontHint(dir)).toBe(false)
    expect(await readdir(dir)).toEqual(["font-hint-shown"])
  })
  test("if the marker can't be written it never shows (no nagging on every launch)", async () => {
    const file = join(root, "a-file")
    await writeFile(file, "x")
    expect(await claimFontHint(join(file, "sub"))).toBe(false)
  })
  test("the toast fits: short title, detail names the command, no emoji", () => {
    expect(FONT_HINT.action).toBeNull()
    expect(FONT_HINT.title.length).toBeLessThanOrEqual(44)
    expect(FONT_HINT.detail).toContain("mydy --install-font")
    expect(FONT_HINT.detail.length).toBeLessThanOrEqual(44 * 3)
    expect(`${FONT_HINT.title}${FONT_HINT.detail}`).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

// ── Installer ──────────────────────────────────────────────────────────────────────────────────

const bytes = (s: string) => new TextEncoder().encode(s)
const FAKE: FontFile[] = [
  { name: "Font-Regular.ttf", url: "https://example.test/Regular.ttf", sha256: sha256(bytes("regular bytes")), registry: "Font Regular (TrueType)" },
  { name: "Font-Bold.ttf", url: "https://example.test/Bold.ttf", sha256: sha256(bytes("bold bytes")), registry: "Font Bold (TrueType)" },
  { name: "Font-OFL.txt", url: "https://example.test/OFL.txt", sha256: sha256(bytes("license text")) },
]
const BODIES: Record<string, string> = {
  "https://example.test/Regular.ttf": "regular bytes",
  "https://example.test/Bold.ttf": "bold bytes",
  "https://example.test/OFL.txt": "license text",
}

function fakeInstall(o: { disk?: Record<string, string>; bodies?: Record<string, string | number>; ranOk?: boolean } = {}) {
  const disk = new Map(Object.entries(o.disk ?? {}))
  const bodies = o.bodies ?? BODIES
  const log = { fetched: [] as string[], ran: [] as string[][], out: "" }
  const deps: InstallDeps = {
    fetch: async (url) => {
      log.fetched.push(url)
      const body = bodies[url]
      if (typeof body === "number") return new Response("nope", { status: body })
      return new Response(bytes(body ?? ""))
    },
    read: async (path) => (disk.has(path) ? bytes(disk.get(path)!) : null),
    write: async (path, data) => void disk.set(path, new TextDecoder().decode(data)),
    run: (cmd) => (log.ran.push(cmd), o.ranOk ?? true),
    out: (text) => void (log.out += text),
  }
  return { deps, disk, log }
}

describe("installFonts", () => {
  const dir = userFontDir({}, "linux", "/home/me")

  test("installs every file, verifies each, then refreshes the font cache", async () => {
    const { deps, disk, log } = fakeInstall()
    const r = await installFonts({}, "linux", "/home/me", deps, FAKE)
    expect(r).toEqual({ dir, installed: ["Font-Regular.ttf", "Font-Bold.ttf", "Font-OFL.txt"], present: [], failed: [] })
    expect(disk.get(join(dir, "Font-Regular.ttf"))).toBe("regular bytes")
    expect(disk.get(join(dir, "Font-OFL.txt"))).toBe("license text")
    expect(log.ran).toEqual([["fc-cache", "-f", dir]])
    expect(log.out).toContain("[1/3] Font-Regular.ttf")
    expect(log.out).toContain("checksum verified")
  })
  test("files already there with the right hash are skipped: nothing is downloaded", async () => {
    const { deps, log } = fakeInstall({ disk: { [join(dir, "Font-Regular.ttf")]: "regular bytes", [join(dir, "Font-Bold.ttf")]: "bold bytes", [join(dir, "Font-OFL.txt")]: "license text" } })
    const r = await installFonts({}, "linux", "/home/me", deps, FAKE)
    expect(r.present).toHaveLength(3)
    expect(r.installed).toEqual([])
    expect(log.fetched).toEqual([])
    expect(log.ran).toEqual([]) // nothing new, no cache refresh
    expect(log.out).toContain("already installed")
  })
  test("only what is missing is downloaded", async () => {
    const { deps, log } = fakeInstall({ disk: { [join(dir, "Font-Regular.ttf")]: "regular bytes" } })
    const r = await installFonts({}, "linux", "/home/me", deps, FAKE)
    expect(r.present).toEqual(["Font-Regular.ttf"])
    expect(log.fetched).toEqual(["https://example.test/Bold.ttf", "https://example.test/OFL.txt"])
  })
  test("a file with the wrong hash (partial or modified) is replaced", async () => {
    const { deps, disk } = fakeInstall({ disk: { [join(dir, "Font-Regular.ttf")]: "truncat" } })
    const r = await installFonts({}, "linux", "/home/me", deps, FAKE)
    expect(r.installed).toContain("Font-Regular.ttf")
    expect(disk.get(join(dir, "Font-Regular.ttf"))).toBe("regular bytes")
  })
  test("a download that fails its checksum is never written", async () => {
    const { deps, disk, log } = fakeInstall({ bodies: { ...BODIES, "https://example.test/Bold.ttf": "tampered!" } })
    const r = await installFonts({}, "linux", "/home/me", deps, FAKE)
    expect(r.failed).toEqual(["Font-Bold.ttf"])
    expect(r.installed).toEqual(["Font-Regular.ttf", "Font-OFL.txt"])
    expect(disk.has(join(dir, "Font-Bold.ttf"))).toBe(false)
    expect(log.out).toContain("checksum mismatch")
  })
  test("an HTTP error or a dead network is a failure, not a crash", async () => {
    const http = fakeInstall({ bodies: { ...BODIES, "https://example.test/Regular.ttf": 404 } })
    expect((await installFonts({}, "linux", "/home/me", http.deps, FAKE)).failed).toEqual(["Font-Regular.ttf"])
    expect(http.log.out).toContain("404")

    const offline = fakeInstall()
    offline.deps.fetch = async () => {
      throw new Error("Unable to connect")
    }
    const r = await installFonts({}, "linux", "/home/me", offline.deps, FAKE)
    expect(r.failed).toHaveLength(3)
    expect(offline.log.out).toContain("Unable to connect")
  })
  test("macOS installs into ~/Library/Fonts and needs no cache refresh", async () => {
    const { deps, disk, log } = fakeInstall()
    await installFonts({}, "darwin", "/Users/me", deps, FAKE)
    expect(disk.has(join("/Users/me", "Library", "Fonts", "Font-Regular.ttf"))).toBe(true)
    expect(log.ran).toEqual([])
  })
  test("Windows registers each font for the current user, and the license is not registered", async () => {
    const { deps, log } = fakeInstall()
    const env = { LOCALAPPDATA: "/L" }
    await installFonts(env, "win32", "/Users/me", deps, FAKE)
    const fonts = join("/L", "Microsoft", "Windows", "Fonts")
    const key = "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
    expect(log.ran).toEqual([
      ["reg", "add", key, "/v", "Font Regular (TrueType)", "/t", "REG_SZ", "/d", join(fonts, "Font-Regular.ttf"), "/f"],
      ["reg", "add", key, "/v", "Font Bold (TrueType)", "/t", "REG_SZ", "/d", join(fonts, "Font-Bold.ttf"), "/f"],
    ])
  })
  test("Windows re-registers fonts that were already installed (registration may be missing)", async () => {
    const fonts = join("/L", "Microsoft", "Windows", "Fonts")
    const { deps, log } = fakeInstall({ disk: { [join(fonts, "Font-Regular.ttf")]: "regular bytes" } })
    await installFonts({ LOCALAPPDATA: "/L" }, "win32", "/Users/me", deps, FAKE)
    expect(log.ran.map((c) => c[4])).toEqual(["Font Regular (TrueType)", "Font Bold (TrueType)"])
  })
  test("a missing fc-cache is explained, not fatal", async () => {
    const { deps, log } = fakeInstall({ ranOk: false })
    const r = await installFonts({}, "linux", "/home/me", deps, FAKE)
    expect(r.failed).toEqual([])
    expect(log.out).toContain("fc-cache not found")
  })
})

describe("the pinned files", () => {
  test("come from a release tag on raw.githubusercontent.com, with a SHA-256 each", () => {
    expect(FONT_VERSION).toMatch(/^v\d+\.\d+\.\d+$/)
    expect(FONT_FILES.map((f) => f.name)).toEqual(["JetBrainsMonoNerdFont-Regular.ttf", "JetBrainsMonoNerdFont-Bold.ttf", "JetBrainsMonoNerdFont-OFL.txt"])
    for (const f of FONT_FILES) {
      expect(f.url.startsWith(`https://raw.githubusercontent.com/ryanoasis/nerd-fonts/${FONT_VERSION}/patched-fonts/JetBrainsMono/`)).toBe(true)
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(FONT_FILES[0]!.registry).toBe("JetBrainsMono Nerd Font Regular (TrueType)")
    expect(FONT_FILES[1]!.registry).toBe("JetBrainsMono Nerd Font Bold (TrueType)")
    expect(new Set(FONT_FILES.map((f) => f.sha256)).size).toBe(FONT_FILES.length)
  })
  test("sha256 is the usual hex digest", () => {
    expect(sha256(bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})

describe("terminalAdvice", () => {
  const text = (env: Record<string, string>) => terminalAdvice(env).join("\n")

  test("terminals that already have symbols say so, and show their own config line", () => {
    expect(text({ TERM_PROGRAM: "ghostty" })).toContain("Ghostty draws Nerd Font icons itself")
    expect(text({ TERM_PROGRAM: "ghostty" })).toContain("font-family = JetBrainsMono Nerd Font")
    expect(text({ TERM_PROGRAM: "WezTerm" })).toContain('wezterm.font("JetBrainsMono Nerd Font")')
    expect(text({ TERM: "xterm-kitty" })).toContain("font_family JetBrainsMono Nerd Font")
  })
  test("the terminals that need the font selected", () => {
    expect(text({ TERM_PROGRAM: "iTerm.app" })).toContain("Profiles > Text > Font")
    expect(text({ TERM_PROGRAM: "Apple_Terminal" })).toContain("Terminal > Settings > Profiles > Text > Font")
    expect(text({ TERM_PROGRAM: "vscode" })).toContain("terminal.integrated.fontFamily")
    expect(text({ WT_SESSION: "abc" })).toContain("Windows Terminal")
    expect(text({ ALACRITTY_LOG: "/tmp/x" })).toContain('family = "JetBrainsMono Nerd Font"')
    expect(text({ ALACRITTY_WINDOW_ID: "1" })).toContain("alacritty.toml")
  })
  test("VS Code inside Windows Terminal is VS Code", () => {
    expect(text({ TERM_PROGRAM: "vscode", WT_SESSION: "abc" })).toContain("terminal.integrated.fontFamily")
  })
  test("anything else gets the generic line", () => {
    expect(text({})).toContain(`choose "${FAMILY}"`)
    expect(text({ TERM_PROGRAM: "Hyper" })).toContain("font settings")
  })
})

describe("runInstallFont", () => {
  test("success: exit 0, then where to select the font in this terminal, and a promise about config files", async () => {
    const { deps, log } = fakeInstall()
    expect(await runInstallFont({ TERM_PROGRAM: "iTerm.app" }, "darwin", "/Users/me", deps, FAKE)).toBe(0)
    expect(log.out).toContain("Profiles > Text > Font")
    expect(log.out).toContain("config files were not touched")
    expect(log.out).toContain("--no-nerd-font") // icons are boxes until the font is selected
  })
  test("a terminal with built-in symbols is told it is already fine, without the boxes warning", async () => {
    const { deps, log } = fakeInstall()
    expect(await runInstallFont({ TERM_PROGRAM: "ghostty" }, "linux", "/home/me", deps, FAKE)).toBe(0)
    expect(log.out).toContain("Ghostty draws Nerd Font icons itself")
    expect(log.out).not.toContain("--no-nerd-font")
  })
  test("a failed download exits 1 and says how to retry; the terminal advice is not shown", async () => {
    const { deps, log } = fakeInstall({ bodies: { ...BODIES, "https://example.test/Bold.ttf": 500 } })
    expect(await runInstallFont({ TERM_PROGRAM: "iTerm.app" }, "darwin", "/Users/me", deps, FAKE)).toBe(1)
    expect(log.out).toContain("run mydy --install-font again")
    expect(log.out).toContain("Font-Bold.ttf")
    expect(log.out).not.toContain("Profiles > Text > Font")
  })
  test("the license is announced up front", async () => {
    const { deps, log } = fakeInstall()
    await runInstallFont({}, "linux", "/home/me", deps, FAKE)
    expect(log.out).toContain("SIL Open Font License")
  })
})

// ── Unicode fallbacks ──────────────────────────────────────────────────────────────────────────

// What we allow in a fallback: ASCII, Latin-1 punctuation, and the WGL4 symbols (Windows Glyph List 4, which
// Consolas / Lucida Console / Courier New / Cascadia Mono cover; DejaVu Sans Mono and Liberation Mono checked
// with fontTools, Menlo derives from DejaVu). Deliberately not: ✓ ✕ ◆ ◈ ◎ ▸ ▾ ◷ ↻ ↗ (Liberation Mono has none of them).
const WGL4_SYMBOLS = "■□▪▫▬▲►▼◄◊○●◘◙◦←↑→↓↔↕↨•…‼√∙∞≈≡≤≥⌂♠♣♥♦☼♪♫☺☻"
const LATIN1_PUNCT = "·×±÷°«»¦§¶"

describe("Unicode icon fallbacks", () => {
  const fallbacks = ICON_NAMES.map((name) => [name, glyph(name, false)] as const).filter(([, g]) => g !== "")

  test("there is a fallback table entry for every icon", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(30)
    for (const name of ICON_NAMES) expect(typeof glyph(name, false)).toBe("string")
  })
  test("every fallback is one character from a set every monospace font ships", () => {
    for (const [name, g] of fallbacks) {
      const chars = [...g]
      expect(chars, name).toHaveLength(1)
      const c = chars[0]!
      const ok = c.charCodeAt(0) < 0x7f || LATIN1_PUNCT.includes(c) || WGL4_SYMBOLS.includes(c)
      expect(ok, `${name}: ${c} U+${c.codePointAt(0)!.toString(16).toUpperCase()} is outside the safe set`).toBe(true)
    }
  })
  test("every fallback is exactly one cell and none is an emoji", () => {
    for (const [name, g] of fallbacks) {
      expect(Bun.stringWidth(g), name).toBe(1)
      expect(g, name).not.toMatch(/\p{Emoji_Presentation}|\uFE0F|\u200D/u)
    }
  })
  test("no fallback is private-use (that's what the Nerd Font is for)", () => {
    for (const [name, g] of fallbacks) expect(g, name).not.toMatch(/[\uE000-\uF8FF\u{F0000}-\u{10FFFF}]/u)
  })
  test("the icons that must never be blank in plain mode still have a symbol", () => {
    // glyph() is used directly in `${glyph("deadline")} 3 due`, so an empty string would leave a stray space.
    for (const name of ["marked", "unmarked", "deadline", "alert", "done", "collapsed", "expanded", "dot", "ok", "danger", "offline"] as const) {
      expect(glyph(name, false), name).not.toBe("")
    }
  })
  test("a plain-mode slot is 3 cells wide, or empty", () => {
    for (const name of ICON_NAMES) {
      expect(Bun.stringWidth(slot(name, false)) === 3 || slot(name, false) === "", name).toBe(true)
    }
  })
})
