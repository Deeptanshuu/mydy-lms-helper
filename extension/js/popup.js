// MyDy Downloader popup.
// Talks to js/content.js in the MyDy tab:
//   checkLogin                  -> { loggedIn }
//   getCourses                  -> { courses: [{ id, name }] } | { error }
//   downloadCourses { courses } -> { success, results } | { error }
// While a download runs, background.js keeps its state in chrome.storage.session ("run"); the popup
// draws that, so closing and reopening it mid-download (or after) picks up where it was.

const MYDY = "https://mydy.dypatil.edu/"
const SVG_NS = "http://www.w3.org/2000/svg"
const SELECTION_KEY = "selectedCourses"
const RUN_KEY = "run"

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
    this.bind()
    $("version").textContent = `v${chrome.runtime.getManifest().version}`
    // Follow the run while its progress is on screen.
    chrome.storage.onChanged.addListener((changes, area) => {
      const run = changes[RUN_KEY]?.newValue
      if (area === "session" && run && !$("view-progress").hidden) this.showRun(run)
    })
    this.start()
  }

  bind() {
    $("openMydyBtn").addEventListener("click", () => {
      chrome.tabs.create({ url: MYDY })
      window.close()
    })
    $("checkAgainBtn").addEventListener("click", () => this.start())
    $("retryBtn").addEventListener("click", async () => {
      await this.dismissRun()
      this.start({ ignoreRun: true })
    })
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
    $("backBtn").addEventListener("click", async () => {
      await this.dismissRun()
      if (this.courses.length) this.showCourses()
      else this.start({ ignoreRun: true })
    })
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

  async start({ ignoreRun = false } = {}) {
    this.show("checking")
    ;[this.tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!ignoreRun) {
      // A download that's running, or finished while the popup was closed.
      const run = (await chrome.storage.session.get(RUN_KEY))[RUN_KEY]
      if (run) {
        this.showRun(run)
        return
      }
    }
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
    this.renderProgress({
      courses: courses.map((c) => ({ name: c.name, downloaded: null })),
      current: 0, ratio: 0, file: null, status: "Starting…",
    })
    try {
      // content.js keeps going even if this popup closes; the run's state tells the rest.
      const response = await this.send({ action: "downloadCourses", courses }, 6 * 60 * 60 * 1000)
      if (response?.error) this.showError(response.error)
      else if (response?.success && !$("view-progress").hidden) this.showDone(response.results ?? [])
    } catch (error) {
      const run = (await chrome.storage.session.get(RUN_KEY))[RUN_KEY]
      if (!run) this.showError(`The download stopped. ${error.message}`)
    }
  }

  showRun(run) {
    if (run.state === "running") this.renderProgress(run)
    else if (run.state === "done") this.showDone(run.results ?? [])
    else this.showError(run.error ?? "The download stopped.")
  }

  async dismissRun() {
    await chrome.storage.session.remove(RUN_KEY)
    chrome.action.setBadgeText({ text: "" })
  }

  setBar(ratio) {
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)))
    $("progressBar").style.width = `${pct}%`
    $("progressPct").textContent = `${pct}%`
  }

  renderProgress(run) {
    const total = run.courses.length
    $("progressTitle").textContent = total ? `Downloading ${plural(total, "course")}` : "Downloading"
    $("progressCount").textContent = total ? `${run.current || 0} of ${total}` : ""
    this.setBar(run.ratio ?? 0)
    $("progressStatus").textContent = run.status || "Starting…"
    $("progressCourses").replaceChildren(
      ...run.courses.map((course, i) => {
        const index = i + 1
        const state = course.downloaded !== null ? "done" : index === run.current ? "current" : "pending"
        const count = state === "done"
          ? plural(course.downloaded, "file")
          : state === "current"
            ? run.file ? `${run.file.index} of ${run.file.total}` : "scanning"
            : ""
        const name = { done: "done", current: "downloading", pending: "pending" }[state]
        return el("li", state, icon(name), el("span", "name", course.name), el("span", "count", count))
      }),
    )
    this.show("progress")
  }

  showDone(results) {
    const files = results.reduce((sum, r) => sum + (r.downloaded || 0), 0)
    const skipped = results.reduce((sum, r) => sum + (r.skipped || 0), 0)
    const failed = results.reduce((sum, r) => sum + (r.failed || 0), 0)
    const stat = (value, label, bad = false) => el("div", bad ? "stat bad" : "stat", el("b", "", String(value)), el("span", "", label))
    $("doneStats").replaceChildren(
      stat(files, files === 1 ? "file" : "files"),
      stat(results.length, results.length === 1 ? "course" : "courses"),
      ...(skipped ? [stat(skipped, "saved before")] : []),
      ...(failed ? [stat(failed, "failed", true)] : []),
    )
    $("doneCourses").replaceChildren(
      ...results.map((r) => {
        const parts = [
          r.downloaded ? plural(r.downloaded, "file") : "",
          r.skipped ? `${r.skipped} saved before` : "",
          r.failed ? `${r.failed} failed` : "",
        ].filter(Boolean)
        const count = el("span", r.failed ? "count bad" : "count", parts.join(", ") || "no files")
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
