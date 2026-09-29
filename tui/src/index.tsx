#!/usr/bin/env bun
import { join } from "node:path"
import { MydyClient } from "@mydy/core"
import { createBunTransport, parseHtmlLinkedom } from "@mydy/core/bun"
import { LoginFailedError, NetworkError, type Course } from "@mydy/core/logic"
import { createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { createSignal } from "solid-js"
import pkg from "../package.json"
import { loadSnapshot, saveSnapshot } from "./cache"
import { loadConfig } from "./config"
import { bunSecretStore, loadCredentials, saveCredentials, type Credentials } from "./credentials"
import { downloadCourses } from "./download"
import { readDotEnv } from "./env"
import { runInstallFont } from "./fontinstall"
import { claimFontHint, FONT_HINT, isRemote, nerdFontAvailable, resolveNerdFont } from "./fonts"
import { openExternal } from "./open"
import { appDirs } from "./paths"
import { createAppStore } from "./state"
import { createSync } from "./sync"
import { color } from "./theme"
import { AppProvider, type Services } from "./ui/context"

const args = process.argv.slice(2)

if (args.includes("--version")) {
  console.log(pkg.version)
  process.exit(0)
}

if (args.includes("--help")) {
  const dirs = appDirs()
  console.log(`mydy ${pkg.version} — MyDy LMS terminal client

Usage: mydy [options]

Options:
  --nerd-font      Use Nerd Font icons, skipping detection
  --no-nerd-font   Use plain Unicode symbols instead of Nerd Font icons
  --install-font   Download JetBrainsMono Nerd Font into your user fonts, then exit
  --no-animations  Keep the dithered textures still
  --version        Print the version number and exit
  --help           Show this help and exit

Icons: with no flag, MYDY_NERD_FONT=1 or 0 in the environment decides, then the
config file, then auto-detection (Ghostty, WezTerm and kitty have icons built in;
elsewhere an installed Nerd Font is looked for).

Sign-in: MYDY_USERNAME and MYDY_PASSWORD from the environment or a .env file,
then a saved keychain login, then the sign-in screen.

Config file: ${join(dirs.config, "config.json")}
  downloadDir   where downloaded files are saved (default ~/Downloads/MyDy)
  nerdFont      true, false or "auto": use Nerd Font icons (default "auto", detects one)
  threshold     attendance requirement, as a percentage (default 75)
  animations    let the dithered textures drift (default true; MYDY_ANIMATIONS=0 turns it off)
`)
  process.exit(0)
}

// Plain stdout, no UI: download, install, exit.
if (args.includes("--install-font")) process.exit(await runInstallFont())

// Deferred: pulls in the whole UI tree, and doesn't exist until the screens land.
const { App } = await import("./ui/App")

const dirs = appDirs()
const config = await loadConfig(dirs)
const threshold = config.threshold / 100
const env = {
  ...readDotEnv([join(process.cwd(), ".env"), join(import.meta.dir, "..", "..", ".env")]),
  ...process.env,
}
const font = resolveNerdFont({ args, env, config: config.nerdFont }, () => nerdFontAvailable(env))
const nerd = font.nerd
const animate = config.animations && !args.includes("--no-animations") && env.MYDY_ANIMATIONS !== "0"
const secrets = bunSecretStore()
const store = createAppStore()
const { actions } = store
const client = new MydyClient({ transport: createBunTransport(), parseHtml: parseHtmlLinkedom })

let creds: Credentials | null = null

const sync = createSync({
  client,
  store,
  credentials: () => creds,
  save: (snapshot) => saveSnapshot(dirs, snapshot),
})

const [now, setNow] = createSignal(new Date())
setInterval(() => setNow(new Date()), 30_000)

const renderer = await createCliRenderer({ exitOnCtrlC: false, backgroundColor: color.bg, useMouse: true })

let downloadController: AbortController | null = null

async function start(c: Credentials): Promise<void> {
  creds = c
  actions.setUser(c.username)
  const snapshot = await loadSnapshot(dirs, c.username)
  if (snapshot) actions.hydrate(snapshot)
  actions.setPhase("main")
  void sync.run()
}

async function startDownload(ids: string[]): Promise<void> {
  if (store.state.download?.active) {
    actions.setDownload({ visible: true })
    return
  }
  const courses: Course[] = ids.flatMap((id) => {
    const course = store.state.courses[id]?.course
    return course ? [course] : []
  })

  downloadController = new AbortController()
  const signal = downloadController.signal
  actions.setDownload(null)
  actions.setDownload({ active: true, visible: true, courses: courses.length, folder: config.downloadDir, message: "finding files" })

  let done = 0
  let bytes = 0
  let skipped = 0
  let failed = 0

  try {
    const summary = await sync.withSession(() =>
      downloadCourses(courses, {
        client,
        dir: config.downloadDir,
        signal,
        onEvent: (event) => {
          if (event.type === "planned") {
            actions.setDownload({ total: event.total, message: null })
            return
          }
          done++
          bytes += event.bytes
          if (event.status === "skipped") skipped++
          if (event.status === "failed") failed++
          actions.setDownload({ done, bytes, current: `${event.course} / ${event.name}`, skipped, failed })
        },
      }),
    )
    const message = summary.cancelled
      ? `Cancelled. ${summary.saved} files saved to ${config.downloadDir}`
      : `Saved ${summary.saved} files to ${config.downloadDir}` + (summary.failed ? `, ${summary.failed} couldn't be downloaded` : "")
    actions.setDownload({ active: false, message })
    actions.clearMarks()
  } catch (e) {
    const message =
      e instanceof NetworkError
        ? "Can't reach MyDy. Files already saved are kept; press d to resume."
        : `Download stopped: ${e instanceof Error ? e.message : String(e)}`
    actions.setDownload({ active: false, message })
  } finally {
    downloadController = null
  }
}

async function signIn(username: string, password: string, remember: boolean): Promise<void> {
  actions.setSignIn(null, true)
  try {
    await client.login(username, password)
    sync.markSignedIn()
    if (remember) {
      const saved = await saveCredentials(secrets, { username, password })
      if (!saved.ok) actions.setToast({ title: "Login not saved", detail: saved.reason, action: null })
    }
    actions.setSignIn(null, false)
    await start({ username, password })
  } catch (e) {
    const message =
      e instanceof LoginFailedError
        ? e.message
        : e instanceof NetworkError
          ? "Can't reach mydy.dypatil.edu. Check your connection and try again."
          : `Sign-in failed: ${e instanceof Error ? e.message : String(e)}`
    actions.setSignIn(message, false)
  }
}

const services: Services = {
  // After a refresh, retry the open tab too (it may be showing "Can't reach MyDy").
  refresh: () =>
    void sync.run().then(() => {
      const id = store.state.selectedId
      if (id && store.state.courses[id]) void sync.loadTab(id, store.state.tab)
    }),
  loadTab: (id, tab) => void sync.loadTab(id, tab),
  openAnnouncement: (summary) => void sync.openAnnouncement(summary),
  startDownload: (ids) => void startDownload(ids),
  cancelDownload: () => downloadController?.abort(),
  signIn: (username, password, remember) => void signIn(username, password, remember),
  open: openExternal,
  quit: () => {
    renderer.destroy()
    process.exit(0)
  },
}

const found = await loadCredentials(env, secrets)
if (found.creds) await start(found.creds)
else actions.setPhase("signin")

await render(
  () => (
    <AppProvider value={{ store, nerd, threshold, services, now, animate }}>
      <App />
    </AppProvider>
  ),
  renderer,
)

// Icons fell back to plain symbols because nothing said otherwise and no Nerd Font was found: say so once.
// Not over ssh (the font that matters is on the other end) and never over another toast.
if (font.source === "auto" && !nerd && !isRemote(env) && !store.state.toast && (await claimFontHint(dirs.config))) actions.setToast(FONT_HINT)
