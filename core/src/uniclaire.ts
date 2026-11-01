// UniClaIRE, the university's results portal (studentportal.universitysolutions.in). A separate account
// from MyDy: the registration number (often the student's mobile number) and the portal's own password.
// The USN (DY23...) comes from the profile after signing in. Same logic as mcp/uniclaire.py.
import { PortalLoginError, UnexpectedPageError } from "./errors"
import type { Transport } from "./transport"
import type { GradeScheme, ResultCourse, Results, ResultSemester, RevaluationApplication, RevaluationExam, RevaluationItem } from "./types"

export const UNICLAIRE_BASE_URL = "https://studentportal.universitysolutions.in"
export const UNICLAIRE_HOST = new URL(UNICLAIRE_BASE_URL).hostname
/** Headers the portal's XHR endpoints expect. */
export const UNICLAIRE_HEADERS = { "x-requested-with": "XMLHttpRequest", accept: "*/*" }

const LEGACY: Record<string, number> = { O: 10, A: 9, B: 8, C: 7, D: 6, E: 5, P: 4, F: 0, AB: 0 }
const NEW: Record<string, number> = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, P: 4, F: 0, AB: 0 }
const VALID = new Set([10, 9, 8, 7, 6, 5, 4, 0])

export function gradeScheme(usn: string): GradeScheme {
  const m = /^DY(\d{2})/i.exec(usn)
  return m && Number(m[1]) >= 24 ? "new" : "legacy"
}

/** Points for a grade as the portal prints it (a letter or a number), or null when it isn't one. */
export function gradePoints(raw: string, scheme: GradeScheme): number | null {
  const text = raw.trim().toUpperCase()
  const table = scheme === "new" ? NEW : LEGACY
  if (text in table) return table[text]!
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null
  const n = Math.round(Number(text))
  return VALID.has(n) ? n : null
}

/** The grades of a scheme, best first. */
export function gradeLetters(scheme: GradeScheme): string[] {
  return scheme === "new" ? ["O", "A+", "A", "B+", "B", "C", "P", "F"] : ["O", "A", "B", "C", "D", "E", "P", "F"]
}

/** Identifies one subject in one semester, for simulated grades. */
export const courseKey = (term: number, index: number) => `${term}:${index}`

/**
 * Results with some grades swapped for hypothetical ones (keyed by courseKey), SGPA and CGPA worked out
 * again. The what-if simulator: "what if revaluation turns this F into a C?"
 */
export function simulateResults(results: Results, overrides: Record<string, string>): Results {
  if (!Object.keys(overrides).length) return results
  const semesters = results.semesters.map((sem) => {
    const courses = sem.courses.map((c, i) => {
      const grade = overrides[courseKey(sem.term, i)]
      return grade === undefined ? c : { ...c, grade, points: gradePoints(grade, results.scheme) }
    })
    return { ...sem, courses, sgpa: weightedGpa(courses) }
  })
  return { ...results, semesters, cgpa: weightedGpa(semesters.flatMap((x) => x.courses)) }
}

export interface PortalExam {
  code: string
  name: string
}

/**
 * One exam per term letter ("A-2023-1": term, year, attempt): the latest year, then the highest attempt,
 * so a re-attempt replaces the first sitting. Codes of another shape are kept. Sorted by term.
 */
export function latestExams(rows: Array<{ year?: unknown; examname?: unknown }>): PortalExam[] {
  const byTerm = new Map<string, { code: string; name: string; year: string; attempt: number }>()
  for (const r of rows) {
    const code = String(r.year ?? "")
    const name = String(r.examname ?? "")
    const m = /^([A-Za-z])-(\d{4})-(\d+)$/.exec(code)
    if (!m) {
      byTerm.set(code, { code, name, year: "", attempt: 0 })
      continue
    }
    const [, term, year, attempt] = m as unknown as [string, string, string, string]
    const prev = byTerm.get(term)
    if (!prev || year > prev.year || (year === prev.year && Number(attempt) > prev.attempt)) {
      byTerm.set(term, { code, name, year, attempt: Number(attempt) })
    }
  }
  return [...byTerm.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, e]) => ({ code: e.code, name: e.name }))
}

/** Credit-weighted mean of grade points to two decimals; null with no graded credits. */
export function weightedGpa(courses: Pick<ResultCourse, "credits" | "points">[]): number | null {
  let points = 0
  let credits = 0
  for (const c of courses) {
    if (c.points === null || !Number.isFinite(c.credits)) continue
    points += c.credits * c.points
    credits += c.credits
  }
  return credits ? Math.round((points / credits) * 100) / 100 : null
}

const sumCredits = (courses: ResultCourse[]) => courses.reduce((n, c) => n + (Number.isFinite(c.credits) ? c.credits : 0), 0)
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim()
const subjectKey = (name: string) => name.toLowerCase().replace(/\s+/g, " ")

/** Turns each exam's marksheet rows into semesters. A subject only counts in the last exam it appears in. */
export function buildResults(usn: string, sittings: Array<{ exam: PortalExam; rows: Array<Record<string, unknown>> }>): Results {
  const scheme = gradeScheme(usn)
  const parsed = sittings.map(({ exam, rows }) => ({
    exam,
    courses: rows
      .filter((r) => str(r.subject))
      .map((r): ResultCourse => {
        const grade = str(r.remarks)
        const credits = Number(str(r.FCREDITS))
        return {
          name: str(r.subject),
          type: str(r.mthprue),
          credits: Number.isFinite(credits) ? credits : 0,
          grade,
          points: gradePoints(grade, scheme),
          internal: str(r.ia_exam),
          external: str(r.uni_exam),
          total: str(r.thtot),
        }
      }),
  }))

  const latest = new Map<string, number>()
  parsed.forEach(({ courses }, i) => courses.forEach((c) => latest.set(subjectKey(c.name), i)))

  const semesters: ResultSemester[] = []
  const every: ResultCourse[] = []
  parsed.forEach(({ exam, courses }, i) => {
    const kept = courses.filter((c) => latest.get(subjectKey(c.name)) === i)
    if (!kept.length) return
    every.push(...kept)
    semesters.push({ term: semesters.length + 1, exam: exam.name, code: exam.code, sgpa: weightedGpa(kept), credits: sumCredits(kept), courses: kept })
  })
  return { usn, scheme, cgpa: weightedGpa(every), credits: sumCredits(every), semesters }
}

export function parseRevaluation(rows: Array<Record<string, unknown>>): RevaluationExam[] {
  return rows.map((r) => ({
    code: str(r.year),
    exam: str(r.examname),
    examDate: str(r.examdate),
    resultDate: str(r.resultdate),
    open: str(r.rvenable) === "1",
    window: str(r.rvdates).replace(/<br\s*\/?>/gi, " | "),
  }))
}

export function parseApplications(rows: Array<Record<string, unknown>>): RevaluationApplication[] {
  return rows.map((r) => ({
    appNo: str(r.APPNO),
    applied: str(r.FAPPDATE),
    amount: str(r.FTOTAL),
    paid: str(r.FACKDATE),
    paymentType: str(r.FPAYMENTTYPE),
    status: str(r.status),
    items: null,
  }))
}

export function parseApplicationStatus(rows: Array<Record<string, unknown>>): RevaluationItem[] {
  return rows.map((r) => ({
    code: str(r.fsubcode),
    subject: str(r.fsubname),
    exam: str(r.fexamname),
    examDate: str(r.fexamdate),
    kind: str(r.fcorrdescpn) || str(r.fcorrtype),
    processed: str(r.frvstatus) === "T",
  }))
}

export interface UniclaireOptions {
  /** Should send UNICLAIRE_HEADERS with every request. */
  transport: Transport
  baseUrl?: string
}

export class UniclaireClient {
  readonly baseUrl: string
  private readonly transport: Transport
  private usn: string | null = null

  constructor(options: UniclaireOptions) {
    this.transport = options.transport
    this.baseUrl = (options.baseUrl ?? UNICLAIRE_BASE_URL).replace(/\/$/, "")
  }

  private async json(method: "GET" | "POST", path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const url = new URL(this.baseUrl + path)
    if (method === "GET") {
      for (const [k, v] of Object.entries({ ...params, _: String(Date.now()) })) url.searchParams.set(k, v)
    }
    const page = method === "GET" ? await this.transport.get(url.toString()) : await this.transport.post(url.toString(), params)
    try {
      const value = JSON.parse(page.html) as unknown
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { data: value }
    } catch {
      throw new UnexpectedPageError(`UniClaIRE sent an unexpected reply (${page.status}).`, page.url)
    }
  }

  /** Signs in and returns the USN. */
  async login(regno: string, password: string): Promise<string> {
    this.usn = null
    await this.transport.get(this.baseUrl + "/")
    // The portal's "captcha" is a value it hands out and expects back.
    const captcha = str((await this.json("GET", "/get_captcha.php").catch(() => ({}) as Record<string, unknown>)).captcha)
    const page = await this.transport.post(`${this.baseUrl}/signin.php`, { regno, passwd: password, captcha })
    let ok = page.status < 400
    let message = ""
    try {
      const j = JSON.parse(page.html) as Record<string, unknown>
      if ("error_code" in j) ok = str(j.error_code) === "0"
      message = str(j.msg)
    } catch {
      if (/invalid|incorrect|failed|wrong/i.test(page.html)) ok = false
    }
    if (!ok) throw new PortalLoginError(message || "Wrong registration number or password.", page.url)

    const profile = await this.json("POST", "/src/profile.php")
    const usn = str(profile.strRegno || profile.fregno || profile.FREGNO || profile.regno)
    if (!usn) throw new UnexpectedPageError("Signed in, but UniClaIRE didn't say which USN this is.")
    this.usn = usn
    return usn
  }

  private signedIn(): string {
    if (!this.usn) throw new PortalLoginError("Not signed in to UniClaIRE.")
    return this.usn
  }

  async results(): Promise<Results> {
    const usn = this.signedIn()
    const list = await this.json("GET", "/src/results_new.php", { a: "getResAll" })
    const exams = latestExams(Array.isArray(list.data) ? list.data : [])
    const sittings = []
    for (const exam of exams) {
      const sheet = await this.json("GET", "/src/results_new.php", { a: "getResults", examno: exam.code, regno: usn })
      sittings.push({ exam, rows: Array.isArray(sheet.body) ? (sheet.body as Array<Record<string, unknown>>) : [] })
    }
    return buildResults(usn, sittings)
  }

  /** Your revaluation applications, each with its per-subject progress (null where that couldn't be read). */
  async revaluationApplications(): Promise<RevaluationApplication[]> {
    const usn = this.signedIn()
    const res = await this.json("GET", "/src/yourAppsRVRT.php", { a: "getYourAppsRVRT", regno: usn })
    const apps = parseApplications(Array.isArray(res.tableData) ? res.tableData : [])
    for (const app of apps) app.items = await this.revaluationStatus(app.appNo).catch(() => null)
    return apps
  }

  async revaluationStatus(appNo: string): Promise<RevaluationItem[]> {
    this.signedIn()
    const res = await this.json("POST", "/src/rvappstatus.php", { app_no: appNo })
    return parseApplicationStatus(Array.isArray(res.data) ? res.data : [])
  }

  async revaluationWindows(): Promise<RevaluationExam[]> {
    this.signedIn()
    const res = await this.json("GET", "/src/results_new.php", { a: "getRvAll" })
    return parseRevaluation(Array.isArray(res.data) ? res.data : [])
  }
}
