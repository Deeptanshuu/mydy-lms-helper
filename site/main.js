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
// A frame is a grid of terminal cells (character, colours, bold). They are painted on a canvas cell by cell, the way a
// terminal does: text from the page's monospace font, but block elements, box-drawing lines, rounded corners, dots and
// icons drawn as shapes that fill their cell exactly. Fonts draw those glyphs with gaps between rows and columns, and
// differently on every platform, which breaks the pixel wordmark, the meters and the card borders.

// Block elements (U+2580..259F) as rectangles in eighths of the cell: [x0, y0, x1, y1].
const QUADRANTS = [[0, 0, 4, 4], [4, 0, 8, 4], [0, 4, 4, 8], [4, 4, 8, 8]] // upper left, upper right, lower left, lower right
const QUADRANT_MASK = [4, 8, 1, 13, 9, 7, 11, 2, 6, 14] // U+2596..259F as UL=1 UR=2 LL=4 LR=8
function blockShape(cp) {
  if (cp === 0x2580) return { rects: [[0, 0, 8, 4]] }
  if (cp >= 0x2581 && cp <= 0x2588) return { rects: [[0, 0x2588 - cp, 8, 8]] } // lower n/8, full block last
  if (cp >= 0x2589 && cp <= 0x258f) return { rects: [[0, 0, 0x2590 - cp, 8]] } // left n/8
  if (cp === 0x2590) return { rects: [[4, 0, 8, 8]] }
  if (cp >= 0x2591 && cp <= 0x2593) return { rects: [[0, 0, 8, 8]], alpha: (cp - 0x2590) / 4 } // light, medium, dark shade
  if (cp === 0x2594) return { rects: [[0, 0, 8, 1]] }
  if (cp === 0x2595) return { rects: [[7, 0, 8, 8]] }
  if (cp >= 0x2596 && cp <= 0x259f) return { rects: QUADRANTS.filter((_, i) => QUADRANT_MASK[cp - 0x2596] & (1 << i)) }
}

// Box-drawing lines as arm weights [left, right, up, down]: 0 none, 1 light, 2 heavy.
const ARMS = {}
const defineArms = (chars, weights) => [...chars].forEach((ch, i) => (ARMS[ch] = weights[i]))
defineArms("─━│┃┌┏┐┓└┗┘┛", [[1, 1, 0, 0], [2, 2, 0, 0], [0, 0, 1, 1], [0, 0, 2, 2], [0, 1, 0, 1], [0, 2, 0, 2], [1, 0, 0, 1], [2, 0, 0, 2], [0, 1, 1, 0], [0, 2, 2, 0], [1, 0, 1, 0], [2, 0, 2, 0]])
defineArms("├┣┤┫┬┳┴┻┼╋", [[0, 1, 1, 1], [0, 2, 2, 2], [1, 0, 1, 1], [2, 0, 2, 2], [1, 1, 0, 1], [2, 2, 0, 2], [1, 1, 1, 0], [2, 2, 2, 0], [1, 1, 1, 1], [2, 2, 2, 2]])
defineArms("╴╵╶╷╸╹╺╻╼╽╾╿", [[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1], [2, 0, 0, 0], [0, 0, 2, 0], [0, 2, 0, 0], [0, 0, 0, 2], [1, 2, 0, 0], [0, 0, 1, 2], [2, 1, 0, 0], [0, 0, 2, 1]])
// Rounded corners: [the horizontal arm points right, the vertical arm points down]
const CORNERS = { "╭": [true, true], "╮": [false, true], "╰": [true, false], "╯": [false, false] }

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

  // Each unique row becomes one entry per column: [character, foreground, background, bold].
  const bg = demo.bg.toUpperCase()
  const rows = demo.rowTable.map((runs) => {
    const cells = []
    for (const [text, fg, bgi, bold] of runs) for (const char of text) cells.push([char, demo.palette[fg], demo.palette[bgi], bold])
    return cells
  })
  const icons = new Map(Object.entries(demo.icons).map(([char, path]) => [char, new Path2D(path)]))

  const ctx = screen.getContext("2d")
  const family = getComputedStyle(screen).fontFamily
  let frame = demo.start
  // Cell size and font size in device pixels, and where a text baseline sits in a cell.
  let cw = 0
  let ch = 0
  let fontPx = 0
  let baseline = 0

  // Stroke widths for light and heavy lines, and a stroke's first pixel so that it is centred on `mid`.
  const light = () => Math.max(1, Math.round(cw * 0.12))
  const heavy = () => Math.max(light() + 1, Math.round(cw * 0.24))
  const stroke = (arm) => (arm === 2 ? heavy() : arm === 1 ? light() : 0)
  const centred = (mid, size) => Math.round(mid) - Math.floor(size / 2)

  // Box-drawing lines: each arm runs from the cell edge to the middle, and past it to the far side of the arms it
  // crosses, so corners and tees fill in.
  function drawLines(arms, x, y) {
    const [l, r, u, d] = arms.map(stroke)
    const mx = x + cw / 2
    const my = y + ch / 2
    const rect = (x0, y0, x1, y1) => ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    const vertical = [u, d].filter(Boolean)
    const horizontal = [l, r].filter(Boolean)
    const xNear = vertical.length ? Math.min(...vertical.map((t) => centred(mx, t))) : Math.round(mx)
    const xFar = vertical.length ? Math.max(...vertical.map((t) => centred(mx, t) + t)) : Math.round(mx)
    const yNear = horizontal.length ? Math.min(...horizontal.map((t) => centred(my, t))) : Math.round(my)
    const yFar = horizontal.length ? Math.max(...horizontal.map((t) => centred(my, t) + t)) : Math.round(my)
    if (l) rect(x, centred(my, l), xFar, centred(my, l) + l)
    if (r) rect(xNear, centred(my, r), x + cw, centred(my, r) + r)
    if (u) rect(centred(mx, u), y, centred(mx, u) + u, yFar)
    if (d) rect(centred(mx, d), yNear, centred(mx, d) + d, y + ch)
  }

  // Rounded corners: a straight run from one cell edge, a quarter circle, and a straight run to the other edge.
  function drawCorner([right, down], x, y) {
    const t = light()
    const lx = centred(x + cw / 2, t) + t / 2
    const ly = centred(y + ch / 2, t) + t / 2
    const r = cw / 2
    const sx = right ? 1 : -1
    const sy = down ? 1 : -1
    ctx.lineWidth = t
    ctx.beginPath()
    ctx.moveTo(right ? x + cw : x, ly)
    ctx.arc(lx + sx * r, ly + sy * r, r, -sy * (Math.PI / 2), right ? Math.PI : 0, right === down)
    ctx.lineTo(lx, down ? y + ch : y)
    ctx.stroke()
  }

  // Draws one cell's glyph as a shape if it has one, and says whether it did.
  function drawShape(char, x, y) {
    const cp = char.codePointAt(0)
    const block = cp >= 0x2580 && cp <= 0x259f ? blockShape(cp) : undefined
    if (block) {
      if (block.alpha) ctx.globalAlpha = block.alpha
      for (const [a, b, c, d] of block.rects) {
        const x0 = x + Math.round((a * cw) / 8)
        const y0 = y + Math.round((b * ch) / 8)
        ctx.fillRect(x0, y0, x + Math.round((c * cw) / 8) - x0, y + Math.round((d * ch) / 8) - y0)
      }
      ctx.globalAlpha = 1
    } else if (ARMS[char]) drawLines(ARMS[char], x, y)
    else if (CORNERS[char]) drawCorner(CORNERS[char], x, y)
    else if (char === "●" || char === "○") {
      // A small dot on the height of lowercase letters, the same size in every font.
      const radius = cw * 0.36
      const t = light()
      ctx.beginPath()
      ctx.arc(x + cw / 2, y + baseline - fontPx * 0.3, char === "●" ? radius : radius - t / 2, 0, Math.PI * 2)
      if (char === "●") ctx.fill()
      else {
        ctx.lineWidth = t
        ctx.stroke()
      }
    } else if (icons.has(char)) {
      // Nerd Font icons as Material Design Icons: 1.2em, starting at the cell and running over the space after it.
      const size = fontPx * 1.2
      ctx.save()
      ctx.translate(x - fontPx * 0.05, y + (ch - size) / 2)
      ctx.scale(size / 24, size / 24)
      ctx.fill(icons.get(char))
      ctx.restore()
    } else return false
    return true
  }

  function draw(index) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, screen.width, screen.height)
    const cells = demo.frames[index].map((r) => rows[r])
    // Backgrounds first, so an icon that runs over into the next cell is not painted over.
    cells.forEach((row, line) => {
      for (let col = 0; col < row.length; ) {
        let end = col + 1
        while (end < row.length && row[end][2] === row[col][2]) end++
        if (row[col][2] !== bg) {
          ctx.fillStyle = row[col][2]
          ctx.fillRect(col * cw, line * ch, (end - col) * cw, ch)
        }
        col = end
      }
    })
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    if ("fontKerning" in ctx) ctx.fontKerning = "none"
    let bold = -1
    cells.forEach((row, line) => {
      row.forEach(([char, fg, , weight], col) => {
        if (char === " ") return
        ctx.fillStyle = ctx.strokeStyle = fg
        const x = col * cw
        const y = line * ch
        if (drawShape(char, x, y)) return
        if (weight !== bold) {
          bold = weight
          ctx.font = `${weight ? "700 " : ""}${fontPx}px ${family}`
        }
        ctx.fillText(char, x + cw / 2, y + baseline)
      })
    })
  }

  const show = (index) => {
    frame = index
    draw(index)
  }

  // Fit the frame's columns to the container width, in whole device pixels so that neighbouring cells meet exactly.
  const fit = () => {
    const dpr = window.devicePixelRatio || 1
    ctx.font = `100px ${family}`
    const advance = ctx.measureText("0").width / 100 || 0.6
    const width = terminal.clientWidth - 32
    cw = Math.max(3, Math.min(Math.floor((width * dpr) / demo.cols), Math.floor(16 * advance * dpr)))
    fontPx = cw / advance
    ch = Math.round(fontPx * 1.3)
    screen.width = cw * demo.cols
    screen.height = ch * demo.rows
    screen.style.width = `${(cw * demo.cols) / dpr}px`
    screen.style.height = `${(ch * demo.rows) / dpr}px`
    // Centre text in a row the way a line box does.
    ctx.font = `${fontPx}px ${family}`
    const metrics = ctx.measureText("Mg")
    const ascent = metrics.fontBoundingBoxAscent ?? fontPx * 0.8
    const descent = metrics.fontBoundingBoxDescent ?? fontPx * 0.2
    baseline = Math.round((ch - (ascent + descent)) / 2 + ascent)
    draw(frame)
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
    prompt: `Help me set up MyDy LMS Helper (https://github.com/${REPO}), an unofficial, open-source helper for the MyDy LMS at D.Y. Patil (mydy.dypatil.edu). It has a terminal app (an Overview of attendance, deadlines and grades, plus announcements and bulk downloads), an MCP server that lets an AI assistant like you read my courses, and a Chrome extension for downloading course files.

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
claude mcp add mydy-lms -s user \\
  -e MYDY_USERNAME=your_email@dypatil.edu \\
  -e MYDY_PASSWORD=your_password \\
  -- "$(command -v uv)" run --script "$PWD/mcp/mcp_server.py"`,
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
