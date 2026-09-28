// MyDy LMS Helper website: download button, install tabs, copy buttons and the live TUI demo.
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
    note.textContent = `${release.tag_name}. Unofficial and open source. Your login is only ever sent to MyDy.`
  } else {
    button.href = RELEASES
    label.textContent = "Get it from Releases"
    if (!release) note.textContent = "Binaries for this version arrive with the next release. Until then, run it from source with Bun (see Install)."
  }
}

// ---------------------------------------------------------------------------
// Install tabs (WAI-ARIA tabs pattern) and copy buttons
// ---------------------------------------------------------------------------
function setUpTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')]
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab
      t.setAttribute("aria-selected", String(on))
      t.tabIndex = on ? 0 : -1
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on
    }
  }
  // Links elsewhere on the page can open a specific install tab.
  for (const link of document.querySelectorAll("[data-open-tab]")) {
    link.addEventListener("click", () => select(document.getElementById(link.dataset.openTab)))
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab))
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
      if (!step) return
      e.preventDefault()
      const next = tabs[(i + step + tabs.length) % tabs.length]
      select(next)
      next.focus()
    })
  })
}

function setUpCopy() {
  for (const button of document.querySelectorAll(".copy")) {
    button.addEventListener("click", async () => {
      const code = button.parentElement.querySelector("code").textContent
      try {
        await navigator.clipboard.writeText(code)
        button.textContent = "Copied"
        button.classList.add("done")
      } catch {
        button.textContent = "Select and copy"
      }
      setTimeout(() => {
        button.textContent = "Copy"
        button.classList.remove("done")
      }, 1600)
    })
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
    screen.style.fontSize = `${Math.min(14, Math.max(4, width / (demo.cols * charPerPx)))}px`
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

setUpDownloads()
setUpTabs()
setUpCopy()
setUpDemo()
