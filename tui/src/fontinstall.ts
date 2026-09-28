// `mydy --install-font`: downloads JetBrainsMono Nerd Font into the user's own font folder (no admin rights),
// checks every file against a hash pinned in this file, and says how to select it in the terminal.
// It never edits a terminal's config: fonts are the terminal's setting, so we only tell the user where.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { builtinSymbolTerminal, userFontDir } from "./fonts"

type Env = Record<string, string | undefined>

export const FAMILY = "JetBrainsMono Nerd Font"
export const FONT_VERSION = "v3.4.0"

export interface FontFile {
  name: string
  url: string
  /** SHA-256 of the file at that URL, computed when the URL was pinned. */
  sha256: string
  /** Windows only: the name it is registered under in HKCU\...\Fonts. */
  registry?: string
}

// Pinned to a release tag, so the bytes behind these URLs can't change. To bump: download the new files,
// run `sha256sum`, and update the tag and hashes together. The OFL sits next to the fonts as the license requires.
const BASE = `https://raw.githubusercontent.com/ryanoasis/nerd-fonts/${FONT_VERSION}/patched-fonts/JetBrainsMono/Ligatures`
export const FONT_FILES: FontFile[] = [
  {
    name: "JetBrainsMonoNerdFont-Regular.ttf",
    url: `${BASE}/Regular/JetBrainsMonoNerdFont-Regular.ttf`,
    sha256: "0ec29a68b539ece7078fc714cebff0c0accb2f4948f8f7963d9f5e86633b12d9",
    registry: `${FAMILY} Regular (TrueType)`,
  },
  {
    name: "JetBrainsMonoNerdFont-Bold.ttf",
    url: `${BASE}/Bold/JetBrainsMonoNerdFont-Bold.ttf`,
    sha256: "e82e27a7f37c9a0a13cc4e417503a149c6a0280586930772d2ebed803159c864",
    registry: `${FAMILY} Bold (TrueType)`,
  },
  {
    name: "JetBrainsMonoNerdFont-OFL.txt",
    url: `${BASE}/Regular/OFL.txt`,
    sha256: "30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad",
  },
]

const REG_KEY = "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"

export const sha256 = (data: Uint8Array): string => new Bun.CryptoHasher("sha256").update(data).digest("hex")

export interface InstallDeps {
  fetch: (url: string) => Promise<Response>
  /** null when the file doesn't exist. */
  read: (path: string) => Promise<Uint8Array | null>
  write: (path: string, data: Uint8Array) => Promise<void>
  /** Runs a command; true when it exited 0, false when missing or failed. */
  run: (cmd: string[]) => boolean
  out: (text: string) => void
}

export function systemInstallDeps(): InstallDeps {
  return {
    fetch: (url) => fetch(url, { signal: AbortSignal.timeout(60_000) }),
    read: async (path) => {
      try {
        return new Uint8Array(await readFile(path))
      } catch {
        return null
      }
    },
    // Write beside, then rename: a cancelled download never leaves a half font that fontconfig would choke on.
    write: async (path, data) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(`${path}.part`, data)
      await rename(`${path}.part`, path)
    },
    run: (cmd) => {
      try {
        return Bun.spawnSync({ cmd, stdin: "ignore", stdout: "ignore", stderr: "ignore" }).success
      } catch {
        return false
      }
    },
    out: (text) => void process.stdout.write(text),
  }
}

export interface InstallResult {
  dir: string
  installed: string[]
  present: string[]
  failed: string[]
}

const size = (n: number) => (n < 1_048_576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1_048_576).toFixed(1)} MB`)
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Downloads what's missing or wrong, verifies it, installs it. Returns what happened per file; prints as it goes. */
export async function installFonts(env: Env, platform: string, home: string, deps: InstallDeps, files: FontFile[] = FONT_FILES): Promise<InstallResult> {
  const dir = userFontDir(env, platform, home)
  const result: InstallResult = { dir, installed: [], present: [], failed: [] }
  deps.out(`Installing ${FAMILY} ${FONT_VERSION} into ${dir}\n\n`)

  for (const [i, file] of files.entries()) {
    const target = join(dir, file.name)
    deps.out(`  [${i + 1}/${files.length}] ${file.name}  `)
    const have = await deps.read(target)
    if (have && sha256(have) === file.sha256) {
      deps.out("already installed\n")
      result.present.push(file.name)
      continue
    }
    try {
      deps.out("downloading... ")
      const res = await deps.fetch(file.url)
      if (!res.ok) throw new Error(`the server answered ${res.status}`)
      const data = new Uint8Array(await res.arrayBuffer())
      if (sha256(data) !== file.sha256) throw new Error("checksum mismatch, not installed")
      await deps.write(target, data)
      deps.out(`ok (${size(data.length)}, checksum verified)\n`)
      result.installed.push(file.name)
    } catch (e) {
      deps.out(`failed: ${reason(e)}\n`)
      result.failed.push(file.name)
    }
  }

  const ready = files.filter((f) => result.installed.includes(f.name) || result.present.includes(f.name))
  if (platform === "win32") {
    // A font file in the folder isn't usable until it is registered; reg add /f is safe to repeat.
    for (const file of ready) {
      if (!file.registry) continue
      const ok = deps.run(["reg", "add", REG_KEY, "/v", file.registry, "/t", "REG_SZ", "/d", join(dir, file.name), "/f"])
      if (!ok) deps.out(`\n  Couldn't register ${file.name} for your user. Open it and choose Install instead.\n`)
    }
  } else if (platform !== "darwin" && result.installed.length) {
    deps.out("\n  Refreshing the font cache... ")
    deps.out(deps.run(["fc-cache", "-f", dir]) ? "done\n" : "fc-cache not found; log out and in again if the font doesn't show up\n")
  }
  return result
}

// ── Telling the user where to pick it ──────────────────────────────────────────────────────────

/** How to select the font in the terminal we're running in (or a generic line). Only text: nothing is changed. */
export function terminalAdvice(env: Env): string[] {
  const builtin = builtinSymbolTerminal(env)
  if (builtin) {
    const config: Record<string, string[]> = {
      Ghostty: ["font-family = JetBrainsMono Nerd Font", "in your Ghostty config."],
      WezTerm: [`config.font = wezterm.font("${FAMILY}")`, "in your wezterm.lua."],
      kitty: [`font_family ${FAMILY}`, "in your kitty.conf."],
    }
    const [line, where] = config[builtin]!
    return [`${builtin} draws Nerd Font icons itself, so mydy already has them with any font.`, `To use ${FAMILY} for everything anyway, put`, `  ${line}`, where!]
  }
  switch (env.TERM_PROGRAM) {
    case "iTerm.app":
      return [`iTerm2: Settings > Profiles > Text > Font, then choose "${FAMILY}".`]
    case "Apple_Terminal":
      return [`Terminal: Terminal > Settings > Profiles > Text > Font > Change..., then choose "${FAMILY}".`]
    case "vscode":
      return [`VS Code: Settings, search for terminal.integrated.fontFamily and set it to`, `  ${FAMILY}`]
  }
  if (Object.keys(env).some((k) => k.startsWith("ALACRITTY_"))) {
    return ["Alacritty: add this to alacritty.toml, then restart it:", "  [font.normal]", `  family = "${FAMILY}"`]
  }
  if (env.WT_SESSION) {
    return [
      `Windows Terminal: Settings (Ctrl+,) > Profiles > Defaults > Appearance > Font face > "${FAMILY}".`,
      `If it isn't listed, restart Windows Terminal, or try "JetBrainsMono NF".`,
    ]
  }
  return [`Open your terminal's font settings and choose "${FAMILY}" (the regular one, not "Mono").`, "Restart the terminal if the font isn't listed."]
}

/** The whole `mydy --install-font` command. Returns the process exit code. */
export async function runInstallFont(
  env: Env = process.env,
  platform: string = process.platform,
  home: string = homedir(),
  deps: InstallDeps = systemInstallDeps(),
  files: FontFile[] = FONT_FILES,
): Promise<number> {
  deps.out(`MyDy font installer\n${FAMILY} is licensed under the SIL Open Font License; a copy is saved next to the fonts.\n\n`)
  const result = await installFonts(env, platform, home, deps, files)
  if (result.failed.length) {
    deps.out(`\nCouldn't install ${result.failed.join(", ")}. Check your connection and run mydy --install-font again; files already installed are kept.\n`)
    return 1
  }
  const builtin = builtinSymbolTerminal(env)
  deps.out(builtin ? "\nDone.\n\n" : "\nDone. One step is left: select the font in your terminal. mydy can't do that for you.\n\n")
  for (const line of terminalAdvice(env)) deps.out(`  ${line}\n`)
  deps.out(`\nYour terminal's config files were not touched.\n`)
  if (!builtin) deps.out(`Until you have selected it, icons show as boxes: run mydy --no-nerd-font (or set MYDY_NERD_FONT=0) for plain symbols.\n`)
  return 0
}
