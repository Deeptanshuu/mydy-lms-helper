import { parseMoodleDate } from "../dates"
import { text } from "../html"
import type { Assignment } from "../types"

export function isSubmitted(status: string | null): boolean {
  return !!status && /submitted/i.test(status) && !/not submitted|nothing has been submitted|no submission|no attempt|draft/i.test(status)
}

export function parseAssignment(doc: Document, pageUrl: string, fallbackName: string): Assignment {
  const fields = {
    dueText: null as string | null,
    submissionStatus: null as string | null,
    gradingStatus: null as string | null,
    grade: null as string | null,
    timeRemaining: null as string | null,
  }
  const table = doc.querySelector("table.submissionstatustable") ?? doc.querySelector("table.generaltable")
  table?.querySelectorAll("tr").forEach((row) => {
    const cells = row.querySelectorAll("td, th")
    if (cells.length < 2) return
    const label = text(cells[0]).toLowerCase()
    const value = text(cells[1]) || null
    if (label.includes("due date")) fields.dueText = value
    else if (label.includes("submission status")) fields.submissionStatus = value
    else if (label.includes("grading status")) fields.gradingStatus = value
    else if (label.includes("time remaining")) fields.timeRemaining = value
    else if (label.includes("grade") && !label.includes("grading")) fields.grade = value
  })
  return {
    name: text(doc.querySelector("h2")) || fallbackName,
    url: pageUrl,
    ...fields,
    due: parseMoodleDate(fields.dueText),
    submitted: isSubmitted(fields.submissionStatus),
  }
}
