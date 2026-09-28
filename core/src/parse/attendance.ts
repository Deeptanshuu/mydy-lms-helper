import { text } from "../html"
import type { Attendance, AttendanceSubject } from "../types"

const whole = (s: string): number | null => (/^\d+$/.test(s) ? Number(s) : null)

export function parseAttendance(doc: Document): Attendance {
  let batch: string | null = null
  let semester: string | null = null
  doc.querySelectorAll("div[style]").forEach((d) => {
    if (!/float/.test(d.getAttribute("style") ?? "")) return
    const t = text(d)
    if (/^[A-Z]+-\d+-/.test(t)) batch = t
    else if (t.includes("Semester")) semester = t
  })

  const subjects: AttendanceSubject[] = []
  // Only the first table, as the Python client did; later tables are monthly or summary breakdowns.
  doc.querySelector("table.generaltable")?.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td")).map((c) => text(c))
    if (cells.length < 5) return
    const total = whole(cells[1]!)
    const present = whole(cells[2]!)
    if (total === null || present === null) return
    const absent = whole(cells[3]!)
    const pct = Number.parseFloat(cells[4]!)
    subjects.push({
      subject: cells[0]!,
      total,
      present,
      absent: absent ?? total - present,
      percentage: Number.isFinite(pct) ? pct : null,
    })
  })
  return { batch, semester, subjects }
}
