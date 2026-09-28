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
