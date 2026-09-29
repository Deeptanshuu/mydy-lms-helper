// Renders the popup in headless Chrome with a stand-in `chrome` API and saves the README screenshots
// to docs/assets/extension-*.png. Run: npm run screenshots (set CHROME=/path/to/chrome if needed).
// `node scripts/screenshots.mjs --preview courses` writes extension/.preview.html to click through a scene in a browser.
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = join(EXT, "..", "docs", "assets")
const CHROME = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error("Chrome not found. Set CHROME=/path/to/chrome.")

const MYDY = "https://mydy.dypatil.edu/rait/my/"
const course = (id, name) => ({ id, name, url: `https://mydy.dypatil.edu/rait/course/view.php?id=${id}` })
const COURSES = [
  course("812", "Data Structures and Algorithms"),
  course("815", "Computer Networks"),
  course("820", "Software Engineering"),
  course("811", "Engineering Maths III"),
  course("701", "Operating Systems"),
  course("702", "Database Management Systems"),
  course("640", "Network Security"),
  course("530", "Data Structures Lab"),
]
const SELECTED = ["812", "815", "811"]

const SCENES = {
  signin: { height: 280, url: "https://mydy.dypatil.edu/rait/login/index.php", loggedIn: false },
  courses: { height: 544, url: MYDY, loggedIn: true, courses: COURSES, selected: SELECTED },
  // These two open the popup onto a saved run, the way it looks when reopened mid-download or after.
  progress: {
    height: 400, url: MYDY, loggedIn: true, courses: COURSES, selected: SELECTED,
    run: {
      state: "running", tabId: 1, current: 2, ratio: (1 + 7 / 12) / 3,
      courses: [
        { name: "Data Structures and Algorithms", downloaded: 14 },
        { name: "Computer Networks", downloaded: null },
        { name: "Engineering Maths III", downloaded: null },
      ],
      file: { index: 7, total: 12, name: "Subnetting practice sheet.pdf" },
      status: "Downloading Subnetting practice sheet.pdf",
    },
  },
  done: {
    height: 444, url: MYDY, loggedIn: true, courses: COURSES, selected: SELECTED, openFirst: true,
    run: {
      state: "done",
      results: [
        { course: "Data Structures and Algorithms", downloaded: 14, skipped: 0, failed: 0, files: ["Lecture 1 - Arrays.pdf", "Linked Lists.pptx", "Stack applications.pdf", "Queue lab manual.docx"] },
        { course: "Computer Networks", downloaded: 9, skipped: 3, failed: 0, files: ["OSI layers.pdf", "Subnetting practice sheet.pdf"] },
        { course: "Engineering Maths III", downloaded: 9, skipped: 0, failed: 1, files: ["Laplace transforms notes.pdf", "Tutorial 1.pdf"] },
      ],
    },
  },
}

// Runs inside the page, before js/popup.js, in place of the extension APIs.
function fakeChrome(scene) {
  window.chrome = {
    runtime: { lastError: undefined, getManifest: () => ({ version: scene.version }) },
    action: { setBadgeText() {} },
    storage: {
      local: { get: async () => ({ selectedCourses: scene.selected ?? [] }), set: async () => {} },
      session: { get: async () => (scene.run ? { run: scene.run } : {}), remove: async () => {} },
      onChanged: { addListener() {} },
    },
    downloads: { showDefaultFolder() {} },
    tabs: {
      query: async () => [{ id: 1, url: scene.url }],
      create() {},
      reload: async () => {},
      sendMessage(_tab, message, reply) {
        if (message.action === "checkLogin") setTimeout(() => reply({ loggedIn: scene.loggedIn }))
        if (message.action === "getCourses") setTimeout(() => reply({ courses: scene.courses }))
      },
    },
  }
  if (scene.openFirst) {
    document.addEventListener("DOMContentLoaded", () =>
      setTimeout(() => (document.querySelector("#doneCourses details").open = true), 300))
  }
}

// Headless Chrome writes the screenshot but doesn't always exit afterwards, so wait for the file
// to appear and stop changing, then stop Chrome.
function shoot(args, out) {
  rmSync(out, { force: true })
  const chrome = spawn(CHROME, args, { stdio: "ignore", detached: true })
  const stop = () => {
    try { process.kill(-chrome.pid, "SIGKILL") } catch {}
  }
  return new Promise((resolve, reject) => {
    let last = -1
    const started = Date.now()
    const poll = setInterval(() => {
      const size = existsSync(out) ? statSync(out).size : -1
      if (size > 0 && size === last) {
        clearInterval(poll)
        stop()
        resolve()
      } else if (Date.now() - started > 30_000) {
        clearInterval(poll)
        stop()
        reject(new Error(`Timed out rendering ${out}`))
      }
      last = size
    }, 400)
    chrome.on("exit", () => {
      if (!existsSync(out)) {
        clearInterval(poll)
        reject(new Error(`Chrome exited without writing ${out}`))
      }
    })
  })
}

const version = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).version
const popup = readFileSync(join(EXT, "popup.html"), "utf8")
const withStub = (scene) =>
  popup.replace('<script src="js/popup.js">', `<script>(${fakeChrome})(${JSON.stringify({ ...scene, version })})</script>\n  <script src="js/popup.js">`)

const preview = process.argv.indexOf("--preview")
if (preview !== -1) {
  const name = process.argv[preview + 1] ?? "courses"
  if (!SCENES[name]) throw new Error(`Unknown scene ${name}. Try: ${Object.keys(SCENES).join(", ")}`)
  // Self-contained, so it also works where relative files don't load.
  const css = readFileSync(join(EXT, "css", "popup.css"), "utf8")
  const js = readFileSync(join(EXT, "js", "popup.js"), "utf8")
  const page = withStub(SCENES[name])
    .replace('<link rel="stylesheet" href="css/popup.css">', () => `<style>${css}</style>`)
    .replace('<script src="js/popup.js"></script>', () => `<script>${js}</script>`)
  writeFileSync(join(EXT, ".preview.html"), page)
  console.log(`wrote ${join(EXT, ".preview.html")}`)
  process.exit(0)
}

const harness = join(EXT, ".screenshot.html")
try {
  for (const [name, scene] of Object.entries(SCENES)) {
    writeFileSync(harness, withStub(scene))
    const out = join(OUT, `extension-${name}.png`)
    const profile = mkdtempSync(join(tmpdir(), "mydy-shot-"))
    try {
      await shoot([
        "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
        // Chrome won't start as root (containers, CI) with its sandbox on.
        ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
        `--user-data-dir=${profile}`, "--force-device-scale-factor=2",
        `--window-size=380,${scene.height}`, "--virtual-time-budget=4000",
        `--screenshot=${out}`, pathToFileURL(harness).href,
      ], out)
    } finally {
      rmSync(profile, { recursive: true, force: true })
    }
    console.log(`wrote ${out}`)
  }
} finally {
  rmSync(harness, { force: true })
}
