import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Course, FileRef, Section } from "@mydy/core/logic"
import { downloadCourses, safeName, type DownloadClient, type DownloadEvent } from "../src/download"

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "mydy-dl-")) })
afterEach(() => rm(dir, { recursive: true, force: true }))

const COURSE: Course = { id: "812", name: "Data Structures: Sem 5", url: "u" }
const SECTIONS: Section[] = [{ number: 1, name: "Unit 1", activities: [
  { name: "Lecture 1", type: "resource", url: "act-a" },
  { name: "Notes", type: "flexpaper", url: "act-b" },
  { name: "Assignment", type: "assign", url: "act-c" },
] }]
const pdf = (body: string) => new Response(body, { headers: { "content-type": "application/pdf", "content-length": String(body.length) } })

function client(files: Record<string, () => Response>, refs: Record<string, FileRef[]>): DownloadClient {
  return {
    courseContent: async () => SECTIONS,
    resolveFiles: async (url) => refs[url] ?? [],
    download: async (url) => files[url]!(),
  }
}
const REFS: Record<string, FileRef[]> = {
  "act-a": [{ url: "f-a", filename: "Lecture 1.pdf", source: "direct" }],
  "act-b": [{ url: "missing", filename: "x.pdf", source: "direct" }, { url: "f-b", filename: "Notes.pdf", source: "flexpaper" }],
}
const folder = () => join(dir, "Data Structures_ Sem 5")

test("saves downloadable activities into a folder per course, trying each candidate", async () => {
  const events: DownloadEvent[] = []
  const summary = await downloadCourses([COURSE], {
    client: client({ "f-a": () => pdf("AAAA"), missing: () => new Response("no", { status: 404 }), "f-b": () => pdf("BB") }, REFS),
    dir,
    onEvent: (e) => events.push(e),
  })
  expect(summary).toEqual({ saved: 2, skipped: 0, failed: 0, bytes: 6, cancelled: false })
  expect(await readFile(join(folder(), "Lecture 1.pdf"), "utf8")).toBe("AAAA")
  expect(await readFile(join(folder(), "Notes.pdf"), "utf8")).toBe("BB")
  expect(events[0]).toEqual({ type: "planned", total: 2 })
})

test("an existing file of the same size is skipped", async () => {
  await mkdir(folder(), { recursive: true })
  await writeFile(join(folder(), "Lecture 1.pdf"), "AAAA")
  const summary = await downloadCourses([COURSE], { client: client({ "f-a": () => pdf("AAAA"), missing: () => new Response("", { status: 404 }), "f-b": () => pdf("BB") }, REFS), dir })
  expect(summary.skipped).toBe(1)
  expect(summary.saved).toBe(1)
})

test("an HTML page (signed out) is not saved as a file", async () => {
  const html = () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })
  const summary = await downloadCourses([COURSE], { client: client({ "f-a": html, missing: html, "f-b": html }, REFS), dir })
  expect(summary.failed).toBe(2)
  expect(existsSync(join(folder(), "Lecture 1.pdf"))).toBe(false)
})

test("a stream that breaks midway leaves no file and no .part", async () => {
  const broken = () =>
    new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("AA")); c.error(new Error("connection reset")) } }), { headers: { "content-type": "application/pdf" } })
  const summary = await downloadCourses([COURSE], { client: client({ "f-a": broken, missing: broken, "f-b": broken }, REFS), dir })
  expect(summary.failed).toBe(2)
  expect(existsSync(join(folder(), "Lecture 1.pdf"))).toBe(false)
  expect(existsSync(join(folder(), "Lecture 1.pdf.part"))).toBe(false)
})

test("cancelling stops before the next file", async () => {
  const controller = new AbortController()
  const summary = await downloadCourses([COURSE], {
    client: client({ "f-a": () => pdf("AAAA"), missing: () => new Response("", { status: 404 }), "f-b": () => pdf("BB") }, REFS),
    dir,
    signal: controller.signal,
    onEvent: (e) => { if (e.type === "file") controller.abort() },
  })
  expect(summary.saved).toBe(1)
  expect(summary.cancelled).toBe(true)
})

test("safeName", () => {
  expect(safeName('a/b:c?"d')).toBe("a_b_c__d")
  expect(safeName("  ")).toBe("Untitled")
})
