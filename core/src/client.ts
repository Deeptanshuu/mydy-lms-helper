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
