// MyDy LMS Helper website: download button, the live TUI demo, the bulk download card and the "Set up with AI" menus.
const REPO = "Deeptanshuu/mydy-lms-helper"
const RELEASES = `https://github.com/${REPO}/releases`

// ---------------------------------------------------------------------------
// Download: pick the visitor's platform, link the newest TUI release that has a binary for it.
// ---------------------------------------------------------------------------
const PLATFORMS = {
  macArm: { asset: "mydy-darwin-arm64", label: "macOS" },
  macIntel: { asset: "mydy-darwin-x64", label: "macOS (Intel)" },
  windows: { asset: "mydy-windows-x64.exe", label: "Windows" },
  linux: { asset: "mydy-linux-x64", label: "Linux" },
  linuxArm: { asset: "mydy-linux-arm64", label: "Linux (ARM64)" },
}

function detectPlatform() {
  const ua = navigator.userAgent
  const platform = navigator.userAgentData?.platform ?? ""
  if (/android|iphone|ipad/i.test(ua)) return null
  if (/win/i.test(platform) || /Windows/.test(ua)) return "windows"
  if (/mac/i.test(platform) || /Macintosh|Mac OS X/.test(ua)) return "macArm"
  if (/linux/i.test(platform) || /Linux/.test(ua)) return /aarch64|arm64/i.test(ua) ? "linuxArm" : "linux"
  return null
}

async function setUpDownloads() {
  const button = document.getElementById("download")
  const label = document.getElementById("download-label")
  const note = document.getElementById("download-note")
  const platform = detectPlatform()
  label.textContent = platform ? `Download for ${PLATFORMS[platform].label}` : "Downloads"

  let release = null
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, { headers: { Accept: "application/vnd.github+json" } })
    if (res.ok) {
      const releases = await res.json()
      // TUI releases are tagged v*; extension releases are ext-v*.
      release = releases.find((r) => !r.draft && /^v\d/.test(r.tag_name) && r.assets.some((a) => a.name.startsWith("mydy-")))
    }
  } catch {
    // offline or rate-limited: keep the links pointing at the Releases page
  }

  const assetUrl = (name) => release?.assets.find((a) => a.name === name)?.browser_download_url
  for (const link of document.querySelectorAll("[data-asset]")) {
    const url = assetUrl(link.dataset.asset)
    if (url) link.href = url
    else link.classList.add("unavailable")
  }

  const url = platform && assetUrl(PLATFORMS[platform].asset)
  if (url) {
    button.href = url
    note.textContent = `${release.tag_name}. Unofficial and open source.`
  } else {
    button.href = RELEASES
    label.textContent = "Get it from Releases"
    if (!release) note.textContent = "No binaries released yet. Run it from source: see the setup guide under Install."
  }
}

// ---------------------------------------------------------------------------
// Live demo: frames rendered from the real TUI by tui/scripts/site.tsx
// ---------------------------------------------------------------------------
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function setUpDemo() {
  const terminal = document.getElementById("terminal")
  const screen = document.getElementById("screen")
  const caption = document.getElementById("caption")
  const mode = document.getElementById("mode")
  const replay = document.getElementById("replay")

  let demo
  try {
    const inline = document.getElementById("demo-data")
    demo = inline ? JSON.parse(inline.textContent) : await (await fetch("demo.json")).json()
  } catch {
    caption.textContent = "The demo couldn't load. The screenshots in the README show the app."
    return
  }

  const bg = demo.bg.toUpperCase()
  const icons = new Map(Object.entries(demo.icons))
  const rowHtml = demo.rowTable.map((runs) =>
    runs
      .map(([text, fg, bgi, bold]) => {
        const style = `color:${demo.palette[fg]}${demo.palette[bgi] !== bg ? `;background:${demo.palette[bgi]}` : ""}${bold ? ";font-weight:700" : ""}`
        let html = ""
        for (const ch of text) {
          const path = icons.get(ch)
          html += path ? `<span class="ti"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></span>` : escapeHtml(ch)
        }
        return `<span style="${style}">${html}</span>`
      })
      .join(""),
  )

  // Fit the frame's columns to the container width.
  const fit = () => {
    const probe = document.createElement("span")
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:100px"
    probe.textContent = "0".repeat(10)
    screen.appendChild(probe)
    const charPerPx = probe.getBoundingClientRect().width / 1000
    probe.remove()
    const width = terminal.clientWidth - 32
    const size = Math.min(16, Math.max(4, width / (demo.cols * charPerPx)))
    screen.style.fontSize = `${size}px`
    // Whole-pixel rows, so backgrounds meet without hairline gaps.
    screen.style.setProperty("--rh", `${Math.round(size * 1.3)}px`)
  }

  const show = (frame) => {
    screen.innerHTML = demo.frames[frame].map((r) => `<span class="row">${rowHtml[r]}</span>`).join("")
  }

  // ---- autoplay tour, then hand over to the visitor ----
  const progress = document.getElementById("progress")
  const stepLabel = document.getElementById("step")
  const pauseButton = document.getElementById("pause")
  const segments = demo.autoplay.map((s, i) => {
    const seg = document.createElement("button")
    seg.type = "button"
    seg.className = "seg"
    seg.setAttribute("aria-label", `Tour step ${i + 1}${s.caption ? `: ${s.caption}` : ""}`)
    seg.addEventListener("click", () => {
      if (driving) startTour()
      goTo(i)
    })
    progress.appendChild(seg)
    return seg
  })

  let current = demo.start
  let step = 0
  let timer = null
  let driving = false
  let paused = false
  let startedAt = 0
  let remaining = 0
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches

  const paint = () => {
    segments.forEach((seg, i) => {
      seg.classList.toggle("done", i < step)
      seg.classList.remove("current")
    })
    const seg = segments[step]
    seg.style.setProperty("--dur", `${demo.autoplay[step].ms}ms`)
    void seg.offsetWidth // restart the fill animation
    seg.classList.add("current")
    stepLabel.textContent = `${step + 1}/${segments.length}`
  }
  const schedule = (ms) => {
    clearTimeout(timer)
    startedAt = performance.now()
    remaining = ms
    timer = setTimeout(() => goTo((step + 1) % demo.autoplay.length), ms)
  }
  const goTo = (i) => {
    step = i
    const s = demo.autoplay[step]
    show(s.f)
    // Carry the last caption forward over steps that don't set one.
    let c = ""
    for (let j = step; j >= 0 && !c; j--) c = demo.autoplay[j].caption
    caption.textContent = c
    paint()
    if (!paused) schedule(s.ms)
  }
  const stopTour = () => {
    clearTimeout(timer)
    timer = null
  }
  const setPaused = (on) => {
    paused = on
    progress.classList.toggle("paused", on)
    pauseButton.textContent = on ? "Play" : "Pause"
    if (on) {
      remaining = Math.max(0, remaining - (performance.now() - startedAt))
      stopTour()
    } else schedule(remaining || demo.autoplay[step].ms)
  }
  const startTour = () => {
    driving = false
    mode.textContent = "tour"
    mode.classList.remove("driving")
    progress.classList.remove("hidden")
    pauseButton.hidden = false
    stepLabel.hidden = false
    paused = false
    progress.classList.remove("paused")
    pauseButton.textContent = "Pause"
    goTo(0)
  }
  const drive = (key) => {
    if (!driving) {
      stopTour()
      driving = true
      current = demo.start
      mode.textContent = "you're driving"
      mode.classList.add("driving")
      progress.classList.add("hidden")
      pauseButton.hidden = true
      stepLabel.hidden = true
      caption.textContent = "j k move, enter opens, tab switches tabs, esc goes back, ? shows every key."
    }
    const next = demo.edges[current]?.[key]
    if (next !== undefined) {
      current = next
      show(current)
    }
  }
  pauseButton.addEventListener("click", () => setPaused(!paused))

  const KEYMAP = { j: "j", ArrowDown: "j", k: "k", ArrowUp: "k", Enter: "enter", ArrowRight: "enter", Escape: "esc", ArrowLeft: "esc", "?": "?" }
  terminal.addEventListener("keydown", (e) => {
    const key = e.key === "Tab" ? (e.shiftKey ? "shift+tab" : "tab") : KEYMAP[e.key]
    if (!key) return
    e.preventDefault()
    drive(key)
  })
  terminal.addEventListener("click", () => terminal.focus())
  for (const button of document.querySelectorAll(".keypad [data-key]")) {
    button.addEventListener("click", () => drive(button.dataset.key))
  }
  replay.addEventListener("click", startTour)

  fit()
  addEventListener("resize", fit)
  if (reduced) {
    show(demo.start)
    caption.textContent = "Click the terminal and use j, k, tab, enter, esc and ? to explore, or press Play for the tour."
    paused = true
    progress.classList.add("paused")
    pauseButton.textContent = "Play"
    step = 0
    paint()
    return
  }
  // Only run the tour while the demo is on screen.
  let started = false
  new IntersectionObserver(([entry]) => {
    if (driving || paused) return
    if (entry.isIntersecting) {
      if (!started) {
        started = true
        goTo(0)
      } else if (!timer) {
        progress.classList.remove("paused")
        schedule(remaining || demo.autoplay[step].ms)
      }
    } else if (timer) {
      remaining = Math.max(0, remaining - (performance.now() - startedAt))
      progress.classList.add("paused")
      stopTour()
    }
  }).observe(terminal)
}

// ---------------------------------------------------------------------------
// "Set up with AI" menus: copy a setup prompt or the commands, or open the prompt in an assistant
// ---------------------------------------------------------------------------
// Each menu says which setup it's for: data-ai-menu="general" (the whole project) or "mcp".
const AI_SETUP = {
  general: {
    prompt: `Help me set up MyDy LMS Helper (https://github.com/${REPO}), an unofficial, open-source helper for the MyDy LMS at D.Y. Patil (mydy.dypatil.edu). It has a terminal app (attendance, deadlines, grades, announcements and bulk downloads on one screen), an MCP server that lets an AI assistant like you read my courses, and a Chrome extension for downloading course files.

README: https://github.com/${REPO}#readme

Ask me which of these I want and which operating system I use, then walk me through the setup one step at a time.`,
    commands: `git clone https://github.com/${REPO}.git
cd mydy-lms-helper
bun install
bun run tui`,
  },
  mcp: {
    prompt: `Help me set up the MCP server from MyDy LMS Helper, so you can read my MyDy (mydy.dypatil.edu) courses, attendance, deadlines, grades and announcements, and download my course files.

Project: https://github.com/${REPO}
Setup guide: https://github.com/${REPO}/blob/main/mcp/README.md

Read the setup guide, ask me which operating system and which AI app I use, then walk me through it one step at a time.`,
    commands: `git clone https://github.com/${REPO}.git
cd mydy-lms-helper
python3 -m venv .venv
.venv/bin/pip install -r mcp/requirements.txt
claude mcp add mydy-lms \\
  -e MYDY_USERNAME=your_email@dypatil.edu \\
  -e MYDY_PASSWORD=your_password \\
  -- "$PWD/.venv/bin/python" "$PWD/mcp/mcp_server.py"`,
  },
}

const OPEN_IN = {
  chatgpt: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`,
  claude: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`,
  perplexity: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`,
}

function setUpAiMenus() {
  const menus = [...document.querySelectorAll("[data-ai-menu]")]
  const closeAll = (except) => menus.forEach((m) => m !== except && m.close?.())

  for (const root of menus) {
    const setup = AI_SETUP[root.dataset.aiMenu] ?? AI_SETUP.general
    const button = root.querySelector(".ai-menu-button")
    const list = root.querySelector('[role="menu"]')
    const items = [...list.querySelectorAll('[role="menuitem"]')]
    const open = (focus) => {
      closeAll(root)
      list.hidden = false
      button.setAttribute("aria-expanded", "true")
      if (focus) items[focus === "last" ? items.length - 1 : 0].focus()
    }
    root.close = (refocus = false) => {
      if (list.hidden) return
      list.hidden = true
      button.setAttribute("aria-expanded", "false")
      if (refocus) button.focus()
    }

    button.addEventListener("click", () => (list.hidden ? open() : root.close()))
    button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        open(e.key === "ArrowUp" ? "last" : "first")
      }
    })
    list.addEventListener("keydown", (e) => {
      const i = items.indexOf(document.activeElement)
      const go = (n) => items[(n + items.length) % items.length].focus()
      if (e.key === "ArrowDown") go(i + 1)
      else if (e.key === "ArrowUp") go(i - 1)
      else if (e.key === "Home") go(0)
      else if (e.key === "End") go(items.length - 1)
      else if (e.key === "Escape") root.close(true)
      else if (e.key === "Tab") root.close()
      else return
      e.preventDefault()
    })

    for (const item of items) {
      if (item.dataset.open) {
        item.href = OPEN_IN[item.dataset.open](setup.prompt)
        item.addEventListener("click", () => root.close())
      }
      if (item.dataset.copy) {
        const label = item.querySelector("span")
        const original = label.textContent
        item.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(item.dataset.copy === "prompt" ? setup.prompt : setup.commands)
            label.textContent = "Copied"
            item.classList.add("done")
          } catch {
            label.textContent = "Couldn't copy"
          }
          setTimeout(() => {
            label.textContent = original
            item.classList.remove("done")
            root.close()
          }, 1200)
        })
      }
    }
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-ai-menu]")) closeAll()
  })
}

// ---------------------------------------------------------------------------
// Bulk download card: plays the download drawer while it's on screen
// ---------------------------------------------------------------------------
function setUpDownloadCard() {
  const drawer = document.getElementById("dl-demo")
  if (!drawer || matchMedia("(prefers-reduced-motion: reduce)").matches) return
  const $ = (id) => document.getElementById(id)
  const files = [
    "Data Structures and Algorithms/Lecture 1 - Arrays.pdf",
    "Data Structures and Algorithms/Linked Lists.pptx",
    "Data Structures and Algorithms/Stack applications.pdf",
    "Data Structures and Algorithms/Queue lab manual.docx",
    "Computer Networks/OSI layers.pdf",
    "Computer Networks/Subnetting practice sheet.pdf",
    "Engineering Maths III/Laplace transforms notes.pdf",
    "Engineering Maths III/Tutorial 1.pdf",
  ]
  const total = 58
  const skipped = 6
  let done = 0
  let timer = null
  const render = () => {
    const finished = done >= total
    const pct = Math.round((done / total) * 100)
    $("dl-icon").setAttribute("href", finished ? "#i-done" : "#i-dling")
    $("dl-title").textContent = finished ? "Download finished" : "Downloading 3 courses"
    $("dl-count").textContent = `${done} of ${total} files`
    $("dl-bar").style.width = `${pct}%`
    $("dl-pct").textContent = `${pct}%`
    $("dl-file").textContent = finished ? `skipped ${skipped} already saved` : files[done % files.length]
  }
  const tick = () => {
    done = done >= total ? 0 : done + 1
    render()
    timer = setTimeout(tick, done >= total ? 2600 : 90 + (done % 7) * 25)
  }
  new IntersectionObserver(([entry]) => {
    clearTimeout(timer)
    if (entry.isIntersecting) tick()
  }).observe(drawer)
}

setUpDownloads()
setUpDemo()
setUpDownloadCard()
setUpAiMenus()
