### Task 6: Core client, fake MyDy server, smoke script

Read the global rules in `docs/superpowers/plans/2026-09-28-tui-rewrite.md` first. Tasks 1 to 5 must be done. Runs in parallel with Task 8.

**Files:**
- Create: `core/src/client.ts`, `core/src/index.ts`, `core/test/fake-mydy.ts`, `core/scripts/smoke.ts`
- Test: `core/test/client.test.ts`

**Interfaces:**
- Consumes: every parser from Tasks 3 and 4; `createBunTransport`, `parseHtmlLinkedom` (Task 5); errors and types (Task 1); `matchAttendance`, `currentSemester` (Task 2); all fixtures.
- Produces (import path `@mydy/core`):
  - `MYDY_BASE_URL = "https://mydy.dypatil.edu"`, `maskUser(u: string): string`
  - `class MydyClient` with `constructor({ transport, parseHtml, baseUrl? })` and methods `login(username, password): Promise<LoginResult>`, `courses(): Promise<Course[]>`, `attendance(): Promise<Attendance>`, `courseContent(id): Promise<Section[]>`, `assignments(id): Promise<Assignment[]>`, `grades(id): Promise<GradeReport>`, `announcements(id, limit = 10): Promise<AnnouncementSummary[]>`, `announcement(summary): Promise<Announcement>`, `resolveFiles(activityUrl): Promise<FileRef[]>`, `download(url): Promise<Response>`, `clearCache(): void`
  - `core/src/index.ts` re-exports `./logic`, `./html`, `./client`, all parsers, and the `Transport`/`Page` types.
  - `core/test/fake-mydy.ts`: `startFakeMydy(opts?: { password?: string }): { url: string; stop(): void; expireSessions(): void; requests: string[] }` (password defaults to `"correct horse"`)

Behaviour to preserve from `tui/client.py`:
- Sign-in: GET `/rait/login/index.php`; if MyDy redirected to its home page (`/`), POST `/index.php` with `{ username, wantsurl: "", next: "Next" }`; use that response if it landed on `/rait/login/index.php?uname=...`, else GET `/rait/login/index.php?uname=<user>&wantsurl=`. Post the form's hidden fields plus `password` (plus `username` if the form had none) to the form action. Failure if the response still has a password field or says "invalid login" / "login failed" / "incorrect".
- A signed-in request that ends up on `/` or a `/login/` page means the session expired: throw `SessionExpiredError`.
- The course page is fetched once per course and reused by `courseContent`, `assignments` and `announcements` until `clearCache()` (called at the start of each sync and by `login`).
- An assignment page that fails with `UnexpectedPageError` is kept as an entry with only its name and URL; other errors propagate.

- [ ] **Step 1: Fake server `core/test/fake-mydy.ts`**

```ts
import { ASSIGNMENT_DONE_HTML, ASSIGNMENT_OPEN_HTML } from "./fixtures/assignment"
import { ATTENDANCE_HTML } from "./fixtures/attendance"
import { DASHBOARD_HTML, HOME_HTML, LOGIN_FAILED_HTML, LOGIN_FORM_HTML } from "./fixtures/auth"
import { COURSE_HTML } from "./fixtures/course"
import { flexpaperPage, PDF_BYTES, presentationPage, resourcePage } from "./fixtures/files"
import { DISCUSSION_HTML, FORUM_HTML } from "./fixtures/forum"
import { GRADES_HTML } from "./fixtures/grades"

export interface FakeMydy {
  url: string
  stop(): void
  expireSessions(): void
  requests: string[]
}

export function startFakeMydy(opts: { password?: string } = {}): FakeMydy {
  const password = opts.password ?? "correct horse"
  const sessions = new Set<string>()
  const requests: string[] = []
  let counter = 0

  const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } })
  const redirect = (to: string, extra: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, ...extra } })

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const u = new URL(req.url)
      const path = u.pathname
      requests.push(`${req.method} ${path}${u.search}`)
      const sid = /MoodleSession=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1]
      const signedIn = !!sid && sessions.has(sid)

      if (path === "/") return html(HOME_HTML)
      if (path === "/index.php" && req.method === "POST") {
        const form = await req.formData()
        return redirect(`/rait/login/index.php?uname=${encodeURIComponent(String(form.get("username")))}&wantsurl=`)
      }
      if (path === "/rait/login/index.php" && req.method === "GET") {
        return u.searchParams.has("uname") ? html(LOGIN_FORM_HTML) : redirect("/")
      }
      if (path === "/rait/login/index.php" && req.method === "POST") {
        const form = await req.formData()
        if (form.get("password") === password && form.get("logintoken") === "tok123") {
          const id = `s${++counter}`
          sessions.add(id)
          return redirect("/rait/my/", { "set-cookie": `MoodleSession=${id}; Path=/; HttpOnly` })
        }
        return html(LOGIN_FAILED_HTML)
      }
      if (!signedIn) return redirect("/rait/login/index.php")

      const id = u.searchParams.get("id") ?? u.searchParams.get("d")
      switch (path) {
        case "/rait/my/":
          return html(DASHBOARD_HTML)
        case "/rait/blocks/academic_status/ajax.php":
          return html(ATTENDANCE_HTML)
        case "/rait/grade/report/user/index.php":
          return html(GRADES_HTML)
        case "/rait/course/view.php":
          return id === "812" ? html(COURSE_HTML) : html("<html><body>No such course</body></html>", 404)
        case "/rait/mod/assign/view.php":
          return html(id === "9201" ? ASSIGNMENT_OPEN_HTML : ASSIGNMENT_DONE_HTML)
        case "/rait/mod/forum/view.php":
          return html(FORUM_HTML)
        case "/rait/mod/forum/discuss.php":
          return html(DISCUSSION_HTML)
        case "/rait/mod/resource/view.php":
          return html(resourcePage(u.origin))
        case "/rait/mod/flexpaper/view.php":
          return html(flexpaperPage(u.origin))
        case "/rait/mod/presentation/view.php":
          return html(presentationPage(u.origin))
      }
      if (path.startsWith("/rait/pluginfile.php/")) {
        return new Response(PDF_BYTES, { headers: { "content-type": "application/pdf", "content-length": String(PDF_BYTES.length) } })
      }
      return html("<html><body>Not found</body></html>", 404)
    },
  })

  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
    expireSessions: () => sessions.clear(),
    requests,
  }
}
```

- [ ] **Step 2: Write the failing test `core/test/client.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createBunTransport, parseHtmlLinkedom } from "../src/bun"
import { MydyClient, maskUser } from "../src/client"
import { LoginFailedError, SessionExpiredError } from "../src/errors"
import { startFakeMydy, type FakeMydy } from "./fake-mydy"

let fake: FakeMydy
let client: MydyClient

beforeEach(() => {
  fake = startFakeMydy()
  client = new MydyClient({ transport: createBunTransport({ delayMs: 0, downloadDelayMs: 0 }), parseHtml: parseHtmlLinkedom, baseUrl: fake.url })
})
afterEach(() => fake.stop())

const signIn = () => client.login("student@dypatil.edu", "correct horse")

describe("sign-in", () => {
  test("two-step sign-in returns a masked username", async () => {
    expect(await signIn()).toEqual({ maskedUser: "st****du" })
    expect(fake.requests).toContain("POST /index.php")
    expect(fake.requests).toContain("POST /rait/login/index.php")
  })
  test("wrong password", async () => {
    const err = await client.login("student@dypatil.edu", "nope").catch((e) => e)
    expect(err).toBeInstanceOf(LoginFailedError)
    expect(err.message).toBe("Wrong email or password.")
  })
  test("maskUser", () => {
    expect(maskUser("ab")).toBe("****")
  })
})

describe("signed in", () => {
  beforeEach(signIn)

  test("courses and attendance", async () => {
    expect((await client.courses()).map((c) => c.id)).toEqual(["815", "812", "811", "640"])
    const att = await client.attendance()
    expect(att.semester).toBe("Semester 5")
    expect(att.subjects).toHaveLength(4)
  })

  test("course content, assignments and announcements share one course page fetch", async () => {
    const sections = await client.courseContent("812")
    expect(sections).toHaveLength(2)
    const assignments = await client.assignments("812")
    expect(assignments.map((a) => [a.name, a.submitted])).toEqual([
      ["Assignment 3: Trees", false],
      ["Assignment 2: Stacks", true],
    ])
    expect(assignments[0]!.due).toEqual(new Date(2026, 8, 30, 23, 59))
    const announcements = await client.announcements("812")
    expect(announcements.map((a) => a.title)).toEqual(["Mid-sem syllabus uploaded", "Lab moved to Thursday"])
    expect(fake.requests.filter((r) => r === "GET /rait/course/view.php?id=812")).toHaveLength(1)

    client.clearCache()
    await client.courseContent("812")
    expect(fake.requests.filter((r) => r === "GET /rait/course/view.php?id=812")).toHaveLength(2)
  })

  test("full announcement text", async () => {
    const [first] = await client.announcements("812")
    const post = await client.announcement(first!)
    expect(post.content).toContain("Units 1 to 3 are in scope")
    expect(post.author).toBe("Prof. R. Sharma")
  })

  test("grades", async () => {
    const g = await client.grades("812")
    expect(g.total?.grade).toBe("51.00")
    expect(g.items).toHaveLength(3)
  })

  test("resolve and download a file", async () => {
    const refs = await client.resolveFiles(`${fake.url}/rait/mod/resource/view.php?id=9101`)
    expect(refs.map((r) => [r.source, r.filename])).toEqual([["direct", "Lecture 1 - Arrays.pdf"]])
    const res = await client.download(refs[0]!.url)
    expect(await res.text()).toBe("%PDF-1.4 fake test file")
  })

  test("an expired session is reported, not parsed as a page", async () => {
    fake.expireSessions()
    await expect(client.courses()).rejects.toBeInstanceOf(SessionExpiredError)
  })
})
```

- [ ] **Step 3: Run to see it fail**

Run: `bun test --cwd core client`
Expected: FAIL, `Cannot find module '../src/client'`.

- [ ] **Step 4: Implement `core/src/client.ts`**

```ts
import { LoginFailedError, SessionExpiredError, UnexpectedPageError } from "./errors"
import { parseAssignment } from "./parse/assignment"
import { parseAttendance } from "./parse/attendance"
import { parseAssignmentLinks, parseCourseContent, parseForumLink } from "./parse/course"
import { parseCourses } from "./parse/courses"
import { parseActivityFiles } from "./parse/files"
import { parseDiscussion, parseDiscussionList } from "./parse/forum"
import { parseGrades } from "./parse/grades"
import { hasLoginError, looksSignedIn, parseLoginForm } from "./parse/login"
import type { Page, Transport } from "./transport"
import type {
  Announcement,
  AnnouncementSummary,
  Assignment,
  Attendance,
  Course,
  FileRef,
  GradeReport,
  LoginResult,
  Section,
} from "./types"

export const MYDY_BASE_URL = "https://mydy.dypatil.edu"

export interface ClientOptions {
  transport: Transport
  parseHtml: (html: string) => Document
  baseUrl?: string
}

interface Loaded {
  page: Page
  doc: Document
}

export function maskUser(username: string): string {
  return username.length > 4 ? `${username.slice(0, 2)}****${username.slice(-2)}` : "****"
}

function landedSignedOut(finalUrl: string, requestedUrl: string): boolean {
  if (new URL(requestedUrl).pathname.includes("/login/")) return false
  const path = new URL(finalUrl).pathname
  return path === "/" || path.includes("/login/")
}

export class MydyClient {
  readonly baseUrl: string
  private readonly rait: string
  private readonly transport: Transport
  private readonly parseHtml: (html: string) => Document
  private readonly coursePages = new Map<string, Promise<Loaded>>()

  constructor(options: ClientOptions) {
    this.transport = options.transport
    this.parseHtml = options.parseHtml
    this.baseUrl = (options.baseUrl ?? MYDY_BASE_URL).replace(/\/$/, "")
    this.rait = `${this.baseUrl}/rait`
  }

  clearCache(): void {
    this.coursePages.clear()
  }

  async login(username: string, password: string): Promise<LoginResult> {
    this.clearCache()
    const loginUrl = `${this.rait}/login/index.php`
    let page = await this.transport.get(loginUrl)
    if (new URL(page.url).pathname === "/") {
      const step = await this.transport.post(`${this.baseUrl}/index.php`, { username, wantsurl: "", next: "Next" })
      page =
        step.url.includes("/rait/login/index.php") && step.url.includes("uname=")
          ? step
          : await this.transport.get(`${loginUrl}?uname=${encodeURIComponent(username)}&wantsurl=`)
    }

    const form = parseLoginForm(this.parseHtml(page.html), page.url)
    if (!form) throw new LoginFailedError("Couldn't find the MyDy sign-in form. MyDy may be down; try again later.", page.url)
    const fields: Record<string, string> = { ...form.fields, password }
    if (!("username" in fields)) fields.username = username

    const result = await this.transport.post(form.action, fields)
    const doc = this.parseHtml(result.html)
    if (doc.querySelector('input[name="password"]') || hasLoginError(result.html)) {
      throw new LoginFailedError("Wrong email or password.", result.url)
    }
    if (!looksSignedIn(result.html, result.url)) throw new LoginFailedError("MyDy didn't confirm the sign-in. Try again.", result.url)
    return { maskedUser: maskUser(username) }
  }

  private async load(url: string): Promise<Loaded> {
    const page = await this.transport.get(url)
    if (landedSignedOut(page.url, url)) throw new SessionExpiredError("MyDy signed you out.", url)
    if (page.status >= 400) throw new UnexpectedPageError(`MyDy returned an error (${page.status}).`, url)
    return { page, doc: this.parseHtml(page.html) }
  }

  private coursePage(id: string): Promise<Loaded> {
    let pending = this.coursePages.get(id)
    if (!pending) {
      pending = this.load(`${this.rait}/course/view.php?id=${encodeURIComponent(id)}`)
      this.coursePages.set(id, pending)
      pending.catch(() => this.coursePages.delete(id))
    }
    return pending
  }

  async courses(): Promise<Course[]> {
    const { page, doc } = await this.load(`${this.rait}/my/`)
    return parseCourses(doc, page.url)
  }

  async attendance(): Promise<Attendance> {
    const { doc } = await this.load(`${this.rait}/blocks/academic_status/ajax.php?action=attendance`)
    return parseAttendance(doc)
  }

  async courseContent(id: string): Promise<Section[]> {
    const { page, doc } = await this.coursePage(id)
    return parseCourseContent(doc, page.url)
  }

  async assignments(id: string): Promise<Assignment[]> {
    const { page, doc } = await this.coursePage(id)
    const out: Assignment[] = []
    for (const link of parseAssignmentLinks(doc, page.url)) {
      try {
        const loaded = await this.load(link.url)
        out.push(parseAssignment(loaded.doc, link.url, link.name))
      } catch (e) {
        if (!(e instanceof UnexpectedPageError)) throw e
        out.push({ name: link.name, url: link.url, dueText: null, due: null, submissionStatus: null, gradingStatus: null, grade: null, timeRemaining: null, submitted: false })
      }
    }
    return out
  }

  async grades(id: string): Promise<GradeReport> {
    const { doc } = await this.load(`${this.rait}/grade/report/user/index.php?id=${encodeURIComponent(id)}`)
    return parseGrades(doc)
  }

  async announcements(id: string, limit = 10): Promise<AnnouncementSummary[]> {
    const { page, doc } = await this.coursePage(id)
    const forum = parseForumLink(doc, page.url)
    if (!forum) return []
    const list = await this.load(forum)
    return parseDiscussionList(list.doc, list.page.url, limit)
  }

  async announcement(summary: AnnouncementSummary): Promise<Announcement> {
    const { doc } = await this.load(summary.url)
    return parseDiscussion(doc, summary)
  }

  async resolveFiles(activityUrl: string): Promise<FileRef[]> {
    const { page, doc } = await this.load(activityUrl)
    return parseActivityFiles(doc, page.html, page.url)
  }

  download(url: string): Promise<Response> {
    return this.transport.download(url)
  }
}
```

- [ ] **Step 5: `core/src/index.ts`**

```ts
export * from "./logic"
export * from "./html"
export * from "./client"
export type { Page, Transport } from "./transport"
export * from "./parse/login"
export * from "./parse/courses"
export * from "./parse/attendance"
export * from "./parse/course"
export * from "./parse/assignment"
export * from "./parse/grades"
export * from "./parse/forum"
export * from "./parse/files"
```

- [ ] **Step 6: Run the tests**

Run: `bun test --cwd core`
Expected: every core test passes.

- [ ] **Step 7: Smoke script `core/scripts/smoke.ts`**

Read-only. It prints counts and the masked username; it never prints the password.

```ts
import { createBunTransport, parseHtmlLinkedom } from "../src/bun"
import { MydyClient } from "../src/client"
import { currentSemester, matchAttendance } from "../src/match"

const username = process.env.MYDY_USERNAME
const password = process.env.MYDY_PASSWORD
if (!username || !password) {
  console.error("Set MYDY_USERNAME and MYDY_PASSWORD in the repo's .env first.")
  process.exit(1)
}

const client = new MydyClient({ transport: createBunTransport(), parseHtml: parseHtmlLinkedom })
const started = Date.now()
const log = (label: string, value: unknown) => console.log(`${label.padEnd(24)} ${value}`)
const DOWNLOADABLE = new Set(["resource", "flexpaper", "presentation", "casestudy", "dyquestion"])

log("signed in as", (await client.login(username, password)).maskedUser)
const courses = await client.courses()
log("courses", courses.length)
const attendance = await client.attendance()
log("attendance subjects", attendance.subjects.length)
log("batch / semester", `${attendance.batch ?? "-"} / ${attendance.semester ?? "-"}`)
const match = matchAttendance(courses, attendance.subjects)
log("matched to courses", `${match.byCourse.size}; unmatched: ${match.unmatched.map((s) => s.subject).join(", ") || "none"}`)
const current = currentSemester(courses, match.byCourse)
log("current semester", current.length)

const course = courses.find((c) => c.id === current[0]) ?? courses[0]
if (!course) {
  log("stopped", "no courses to sample")
  process.exit(0)
}
log("sample course", `${course.name} (${course.id})`)
const content = await client.courseContent(course.id)
log("sections / activities", `${content.length} / ${content.reduce((n, s) => n + s.activities.length, 0)}`)
const assignments = await client.assignments(course.id)
log("assignments", `${assignments.length} (with a parsed due date: ${assignments.filter((a) => a.due).length})`)
const grades = await client.grades(course.id)
log("grade items", `${grades.items.length} (total: ${grades.total?.grade ?? "-"})`)
const announcements = await client.announcements(course.id, 3)
log("announcements", announcements.length)
if (announcements[0]) log("first post length", (await client.announcement(announcements[0])).content?.length ?? 0)
const fileActivity = content.flatMap((s) => s.activities).find((a) => DOWNLOADABLE.has(a.type))
if (fileActivity) {
  const refs = await client.resolveFiles(fileActivity.url)
  log("file refs (1 activity)", refs.map((r) => `${r.source}:${r.filename}`).join(", ") || "none")
}
log("time", `${((Date.now() - started) / 1000).toFixed(1)} s`)
```

Do not run the smoke script in this task (the controller runs it in Task 13 with the user's credentials). Only check it type-checks: `bun run --cwd core typecheck`.
