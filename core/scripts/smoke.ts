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
