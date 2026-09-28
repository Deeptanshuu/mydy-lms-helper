// MyDy Downloader popup.
// Talks to js/content.js in the MyDy tab:
//   checkLogin                  -> { loggedIn }
//   getCourses                  -> { courses: [{ id, name }] } | { error }
//   downloadCourses { courses } -> { success, results } | { error }
// and draws the updateProgress messages content.js sends while it downloads:
//   { phase, status, course: { index, total, name }, file: { index, total, name } | null, totals }

const MYDY = "https://mydy.dypatil.edu/"
const SVG_NS = "http://www.w3.org/2000/svg"
const SELECTION_KEY = "selectedCourses"

const $ = (id) => document.getElementById(id)

function icon(name, className = "") {
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("class", `ic ${className}`.trim())
  svg.setAttribute("aria-hidden", "true")
  const use = document.createElementNS(SVG_NS, "use")
  use.setAttribute("href", `#i-${name}`)
  svg.appendChild(use)
  return svg
}

function el(tag, className, ...children) {
  const node = document.createElement(tag)
  if (className) node.className = className
  for (const child of children) node.append(child)
  return node
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

class Popup {
  constructor() {
    this.tab = null
    this.courses = []
    this.selected = new Set()
    this.query = ""
    this.run = null // the download in progress: { courses, perCourse, startDownloaded }
    this.bind()
    $("version").textContent = `v${chrome.runtime.getManifest().version}`
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "updateProgress") this.onProgress(message)
    })
    this.start()
  }

  bind() {
    $("openMydyBtn").addEventListener("click", () => {
      chrome.tabs.create({ url: MYDY })
      window.close()
    })
    $("checkAgainBtn").addEventListener("click", () => this.start())
    $("retryBtn").addEventListener("click", () => this.start())
    $("reloadTabBtn").addEventListener("click", async () => {
      if (this.tab) await chrome.tabs.reload(this.tab.id)
      window.close()
    })
    $("refreshBtn").addEventListener("click", () => this.loadCourses())
    $("searchInput").addEventListener("input", (e) => this.setQuery(e.target.value))
    $("searchInput").addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.query) {
        e.preventDefault()
        this.setQuery("")
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        $("courseList").querySelector(".course")?.focus()
      }
    })
    $("clearSearchBtn").addEventListener("click", () => this.setQuery(""))
    $("selectAllBtn").addEventListener("click", () => this.toggleAllVisible())
    $("downloadSelectedBtn").addEventListener("click", () =>
      this.download(this.courses.filter((c) => this.selected.has(c.id))),
    )
    $("downloadAllBtn").addEventListener("click", () => this.download(this.courses))
    $("showFolderBtn").addEventListener("click", () => chrome.downloads.showDefaultFolder())
    $("backBtn").addEventListener("click", () => this.showCourses())
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !$("view-courses").hidden && document.activeElement !== $("searchInput")) {
        e.preventDefault()
        $("searchInput").focus()
      }
    })
  }

  show(view) {
    for (const section of document.querySelectorAll(".view")) section.hidden = section.id !== `view-${view}`
    $("refreshBtn").hidden = view !== "courses"
  }

  // ---- tab and sign-in ----

  async start() {
    this.show("checking")
    ;[this.tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!this.tab?.url?.startsWith(MYDY)) {
      this.showSignIn(false)
      return
    }
    try {
      const response = await this.send({ action: "checkLogin" }, 5000)
      if (response?.loggedIn) this.loadCourses()
      else this.showSignIn(true)
    } catch {
      this.showError("Couldn't reach the MyDy tab. Reload it and try again.")
    }
  }

  showSignIn(onMydy) {
    $("signinTitle").textContent = onMydy ? "Sign in to MyDy" : "Open MyDy first"
    $("signinText").textContent = onMydy
      ? "Sign in on this tab, then check again."
      : "This works on mydy.dypatil.edu. Open it, sign in, then click the extension again."
    $("openMydyBtn").hidden = onMydy
    $("checkAgainBtn").classList.toggle("primary", onMydy)
    this.show("signin")
  }

  showError(message) {
    $("errorText").textContent = message
    this.show("error")
  }

  send(message, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The MyDy tab didn't answer in time.")), timeout)
      chrome.tabs.sendMessage(this.tab.id, message, (response) => {
        clearTimeout(timer)
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else resolve(response)
      })
    })
  }

  // ---- course picker ----

  async loadCourses() {
    this.show("courses")
    const list = $("courseList")
    list.replaceChildren()
    list.dataset.empty = "Loading courses…"
    $("refreshBtn").classList.add("spinning")
    try {
      const response = await this.send({ action: "getCourses" }, 15000)
      if (response?.error) throw new Error(response.error)
      this.courses = response?.courses ?? []
      const saved = (await chrome.storage.local.get(SELECTION_KEY))[SELECTION_KEY] ?? []
      const ids = new Set(this.courses.map((c) => c.id))
      this.selected = new Set(saved.filter((id) => ids.has(id)))
      this.renderCourses()
    } catch (error) {
      this.showError(`Couldn't load your courses. ${error.message}`)
    } finally {
      $("refreshBtn").classList.remove("spinning")
    }
  }

  showCourses() {
    this.show("courses")
    this.renderCourses()
  }

  visibleCourses() {
    const q = this.query.trim().toLowerCase()
    return q ? this.courses.filter((c) => c.name.toLowerCase().includes(q)) : this.courses
  }

  setQuery(value) {
    this.query = value
    $("searchInput").value = value
    $("clearSearchBtn").hidden = !value
    this.renderCourses()
  }

  renderCourses() {
    const list = $("courseList")
    const visible = this.visibleCourses()
    list.dataset.empty = this.courses.length
      ? "No courses match that filter."
      : "No courses found. That's normal between semesters."
    list.replaceChildren(
      ...visible.map((course) => {
        const on = this.selected.has(course.id)
        const item = el("li", "course", icon(on ? "on" : "off"), el("span", "course-name", course.name))
        item.setAttribute("role", "option")
        item.setAttribute("aria-selected", String(on))
        item.tabIndex = 0
        item.title = course.name
        item.addEventListener("click", () => this.toggle(course.id))
        item.addEventListener("keydown", (e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault()
            this.toggle(course.id)
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            const next = e.key === "ArrowDown" ? item.nextElementSibling : item.previousElementSibling
            if (next) next.focus()
            else if (e.key === "ArrowUp") $("searchInput").focus()
          }
        })
        return item
      }),
    )

    const total = this.courses.length
    $("courseCount").textContent =
      visible.length === total ? plural(total, "course") : `${visible.length} of ${plural(total, "course")}`
    const allOn = visible.length > 0 && visible.every((c) => this.selected.has(c.id))
    $("selectAllBtn").textContent = allOn ? "Clear" : "Select all"
    $("selectAllBtn").hidden = visible.length === 0

    const n = this.selected.size
    const button = $("downloadSelectedBtn")
    button.disabled = n === 0
    button.querySelector("span").textContent = n ? `Download ${plural(n, "course")}` : "Select courses"
    $("downloadAllBtn").textContent = `All (${total})`
    $("downloadAllBtn").disabled = total === 0
  }

  toggle(id) {
    if (this.selected.has(id)) this.selected.delete(id)
    else this.selected.add(id)
    this.saveSelection()
    const focusedId = document.activeElement?.closest?.(".course") ? id : null
    this.renderCourses()
    if (focusedId !== null) {
      const index = this.visibleCourses().findIndex((c) => c.id === focusedId)
      $("courseList").children[index]?.focus()
    }
  }

  toggleAllVisible() {
    const visible = this.visibleCourses()
    const allOn = visible.every((c) => this.selected.has(c.id))
    for (const c of visible) allOn ? this.selected.delete(c.id) : this.selected.add(c.id)
    this.saveSelection()
    this.renderCourses()
  }

  saveSelection() {
    chrome.storage.local.set({ [SELECTION_KEY]: [...this.selected] })
  }

  // ---- downloading ----

  async download(courses) {
    if (!courses.length) return
    this.run = { courses, perCourse: new Map(), startDownloaded: 0, current: 0 }
    $("progressTitle").textContent = `Downloading ${plural(courses.length, "course")}`
    $("progressCount").textContent = `0 of ${courses.length}`
    this.setBar(0)
    $("progressStatus").textContent = "Starting…"
    this.renderSteps()
    this.show("progress")
    try {
      // Big downloads take a while; content.js keeps going even if this popup closes.
      const response = await this.send({ action: "downloadCourses", courses }, 60 * 60 * 1000)
      if (response?.success) this.showDone(response.results ?? [])
      else this.showError(response?.error ?? "The download stopped.")
    } catch (error) {
      this.showError(`The download stopped. ${error.message}`)
    } finally {
      this.run = null
    }
  }

  setBar(ratio) {
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)))
    $("progressBar").style.width = `${pct}%`
    $("progressPct").textContent = `${pct}%`
  }

  onProgress(message) {
    if (!this.run) return
    if (message.status) $("progressStatus").textContent = message.status
    const { course, file, totals, phase } = message
    if (phase === "done") this.setBar(1)
    if (!course) return

    if (course.index !== this.run.current) {
      this.run.current = course.index
      this.run.startDownloaded = totals?.downloaded ?? 0
    }
    if (phase === "course-done" && totals) {
      this.run.perCourse.set(course.index, totals.downloaded - this.run.startDownloaded)
    }
    const within = phase === "course-done" ? 1 : file && file.total ? file.index / file.total : 0
    this.setBar((course.index - 1 + within) / course.total)
    $("progressCount").textContent = `${course.index} of ${course.total}`
    this.renderSteps(file)
  }

  renderSteps(file = null) {
    const { courses, current, perCourse } = this.run
    $("progressCourses").replaceChildren(
      ...courses.map((course, i) => {
        const index = i + 1
        const done = perCourse.has(index)
        const state = done ? "done" : index === current ? "current" : "pending"
        const count = done
          ? plural(perCourse.get(index), "file")
          : state === "current"
            ? file ? `${file.index} of ${file.total}` : "scanning"
            : ""
        const name = { done: "done", current: "downloading", pending: "pending" }[state]
        return el("li", state, icon(name), el("span", "name", course.name), el("span", "count", count))
      }),
    )
  }

  showDone(results) {
    const files = results.reduce((sum, r) => sum + (r.downloaded || 0), 0)
    const failed = results.reduce((sum, r) => sum + (r.failed || 0), 0)
    const stat = (value, label, bad = false) => el("div", bad ? "stat bad" : "stat", el("b", "", String(value)), el("span", "", label))
    $("doneStats").replaceChildren(
      stat(files, files === 1 ? "file" : "files"),
      stat(results.length, results.length === 1 ? "course" : "courses"),
      ...(failed ? [stat(failed, "failed", true)] : []),
    )
    $("doneCourses").replaceChildren(
      ...results.map((r) => {
        const count = el("span", r.failed ? "count bad" : "count",
          r.downloaded ? plural(r.downloaded, "file") + (r.failed ? `, ${r.failed} failed` : "") : r.failed ? `${r.failed} failed` : "no files")
        const summary = el("summary", r.failed ? "failed" : "", icon(r.failed ? "alert" : "done"), el("span", "name", r.course), count)
        const details = el("details", "", summary)
        if (r.files?.length) details.append(el("ul", "files", ...r.files.map((name) => el("li", "", name))))
        return el("li", "", details)
      }),
    )
    this.selected.clear()
    this.saveSelection()
    this.show("done")
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.popup = new Popup()
})
