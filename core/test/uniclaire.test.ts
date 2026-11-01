import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createBunTransport } from "../src/bun"
import { PortalLoginError } from "../src/errors"
import { buildResults, courseKey, gradeLetters, gradePoints, gradeScheme, latestExams, simulateResults, UNICLAIRE_HEADERS, UniclaireClient, weightedGpa } from "../src/uniclaire"

describe("grade maths", () => {
  test("the scheme follows the batch in the USN", () => {
    expect(gradeScheme("DY24MTCO012")).toBe("new")
    expect(gradeScheme("DY23MTCO012")).toBe("legacy")
    expect(gradeScheme("1RA20CS001")).toBe("legacy")
  })

  test("letters and numbers become points; anything else is ungraded", () => {
    expect(gradePoints("A+", "new")).toBe(9)
    expect(gradePoints("a", "new")).toBe(8)
    expect(gradePoints("A", "legacy")).toBe(9)
    expect(gradePoints("ab", "legacy")).toBe(0)
    expect(gradePoints("8.0", "legacy")).toBe(8)
    expect(gradePoints("3", "legacy")).toBeNull()
    expect(gradePoints("PP", "new")).toBeNull()
    expect(gradePoints("", "new")).toBeNull()
  })

  test("a re-attempt replaces the first sitting of the same term", () => {
    const exams = latestExams([
      { year: "B-2024-1", examname: "Sem 2" },
      { year: "A-2023-1", examname: "Sem 1" },
      { year: "A-2024-2", examname: "Sem 1 ATKT" },
    ])
    expect(exams).toEqual([{ code: "A-2024-2", name: "Sem 1 ATKT" }, { code: "B-2024-1", name: "Sem 2" }])
  })

  test("ungraded courses don't count towards the GPA", () => {
    expect(weightedGpa([{ credits: 4, points: 10 }, { credits: 2, points: 7 }, { credits: 3, points: null }])).toBe(9)
    expect(weightedGpa([{ credits: 3, points: null }])).toBeNull()
  })

  test("a subject counts only in the last exam it appears in", () => {
    const r = buildResults("DY23MT001", [
      { exam: { code: "A-2023-1", name: "Sem 1" }, rows: [{ subject: "Maths", FCREDITS: "4", remarks: "F" }, { subject: "Physics", FCREDITS: 2, remarks: "O" }] },
      { exam: { code: "B-2024-1", name: "Sem 2" }, rows: [{ subject: "maths ", FCREDITS: "4", remarks: "B" }, { subject: "DBMS", FCREDITS: "3", remarks: "A" }, { subject: "" }] },
    ])
    expect(r.semesters.map((s) => [s.term, s.sgpa, s.courses.map((c) => c.name)])).toEqual([
      [1, 10, ["Physics"]],
      [2, 8.43, ["maths", "DBMS"]],
    ])
    expect(r.cgpa).toBe(8.78)
    expect(r.credits).toBe(9)
  })
})

describe("what-if simulator", () => {
  const base = buildResults("DY23MT001", [
    { exam: { code: "A-2023-1", name: "Sem 1" }, rows: [{ subject: "Maths", FCREDITS: "4", remarks: "A" }, { subject: "Lab", FCREDITS: "1", remarks: "O" }] },
    { exam: { code: "B-2024-1", name: "Sem 2" }, rows: [{ subject: "DBMS", FCREDITS: "4", remarks: "F" }, { subject: "OS", FCREDITS: "4", remarks: "B" }] },
  ])

  test("letters follow the scheme, best first", () => {
    expect(gradeLetters("new")).toEqual(["O", "A+", "A", "B+", "B", "C", "P", "F"])
    expect(gradeLetters("legacy")[1]).toBe("A")
  })

  test("a changed grade moves its SGPA and the CGPA, and nothing else", () => {
    expect(base.semesters[1]!.sgpa).toBe(4)
    const sim = simulateResults(base, { [courseKey(2, 0)]: "C" })
    expect(sim.semesters[1]!.courses[0]).toMatchObject({ name: "DBMS", grade: "C", points: 7 })
    expect(sim.semesters[1]!.sgpa).toBe(7.5)
    expect(sim.semesters[0]).toEqual(base.semesters[0]!)
    expect(sim.cgpa).toBe(weightedGpa(sim.semesters.flatMap((x) => x.courses)))
    expect(sim.cgpa! > base.cgpa!).toBe(true)
    expect(base.semesters[1]!.courses[0]!.grade).toBe("F")
  })

  test("no overrides: the same results", () => {
    expect(simulateResults(base, {})).toBe(base)
  })
})

describe("client", () => {
  let server: ReturnType<typeof Bun.serve>
  let client: UniclaireClient
  const requests: string[] = []

  beforeEach(() => {
    requests.length = 0
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const u = new URL(req.url)
        requests.push(`${req.method} ${u.pathname} ${req.headers.get("x-requested-with")}`)
        const json = (v: unknown, headers: Record<string, string> = {}) => Response.json(v, { headers })
        const signedIn = req.headers.get("cookie")?.includes("PHPSESSID=ok")
        switch (u.pathname) {
          case "/":
            return new Response("<html></html>", { headers: { "set-cookie": "PHPSESSID=pending; Path=/" } })
          case "/get_captcha.php":
            return json({ captcha: "4711" })
          case "/signin.php": {
            const form = await req.formData()
            return form.get("passwd") === "pw" && form.get("captcha") === "4711"
              ? json({ error_code: 0, msg: "ok" }, { "set-cookie": "PHPSESSID=ok; Path=/" })
              : json({ error_code: 1, msg: "Invalid credentials" })
          }
        }
        if (!signedIn) return new Response("login first", { status: 403 })
        if (u.pathname === "/src/profile.php") return json({ strRegno: "DY24MT001" })
        const a = u.searchParams.get("a")
        if (a === "getResAll") return json({ data: [{ year: "A-2024-1", examname: "Sem 1" }] })
        if (a === "getResults") return json({ body: [{ subject: "Maths", FCREDITS: "4", remarks: "A+" }, { subject: "Lab", FCREDITS: "1", remarks: "O" }] })
        if (a === "getYourAppsRVRT") return json({ tableData: [{ APPNO: "RV1", FAPPDATE: "02-11-2026", FTOTAL: "500", FACKDATE: "02-11-2026", FPAYMENTTYPE: "Online", status: "Applied" }, { APPNO: "RV2", status: "Applied" }] })
        if (u.pathname === "/src/rvappstatus.php") {
          const app = (await req.formData()).get("app_no")
          if (app === "RV2") return new Response("oops", { status: 500 })
          return json({ data: [{ fsubcode: "CS301", fsubname: "DBMS ", fexamname: "Sem 2", fexamdate: "May 2024", fcorrtype: "RV", fcorrdescpn: "Revaluation", frvstatus: "T" }] })
        }
        if (a === "getRvAll") return json({ data: [{ year: "A-2024-1", examname: "Sem 1", rvenable: "1", rvdates: "RV: 1 Nov<br/>RT: 3 Nov" }] })
        return new Response("not found", { status: 404 })
      },
    })
    client = new UniclaireClient({ transport: createBunTransport({ delayMs: 0, headers: UNICLAIRE_HEADERS }), baseUrl: server.url.toString() })
  })
  afterEach(() => server.stop(true))

  test("signs in, then reads results and revaluation windows", async () => {
    expect(await client.login("9876543210", "pw")).toBe("DY24MT001")
    expect(requests.every((r) => r.endsWith("XMLHttpRequest"))).toBe(true)
    const r = await client.results()
    expect(r.scheme).toBe("new")
    expect(r.cgpa).toBe(9.2)
    expect(r.semesters[0]!.courses.map((c) => [c.grade, c.points])).toEqual([["A+", 9], ["O", 10]])
    expect(await client.revaluationWindows()).toEqual([
      { code: "A-2024-1", exam: "Sem 1", examDate: "", resultDate: "", open: true, window: "RV: 1 Nov | RT: 3 Nov" },
    ])
  })

  test("applications come with each subject's progress", async () => {
    await client.login("9876543210", "pw")
    const apps = await client.revaluationApplications()
    expect(apps[0]).toEqual({
      appNo: "RV1", applied: "02-11-2026", amount: "500", paid: "02-11-2026", paymentType: "Online", status: "Applied",
      items: [{ code: "CS301", subject: "DBMS", exam: "Sem 2", examDate: "May 2024", kind: "Revaluation", processed: true }],
    })
    // One application's status failing doesn't lose the list.
    expect(apps[1]!.items).toBeNull()
  })

  test("a wrong password says what the portal said", async () => {
    const err = await client.login("9876543210", "nope").catch((e) => e)
    expect(err).toBeInstanceOf(PortalLoginError)
    expect(err.message).toBe("Invalid credentials")
  })

  test("results need a sign-in first", async () => {
    expect(await client.results().catch((e) => e)).toBeInstanceOf(PortalLoginError)
  })
})
