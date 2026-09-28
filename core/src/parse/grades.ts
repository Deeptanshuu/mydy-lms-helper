import { UnexpectedPageError } from "../errors"
import { courseName, text } from "../html"
import type { GradeItem, GradeReport } from "../types"

type Column = "name" | "grade" | "range" | "percentage" | "feedback"

export function parseGrades(doc: Document): GradeReport {
  const error = doc.querySelector("div.errorbox") ?? doc.querySelector('div[class*="alert-danger"]')
  if (error) throw new UnexpectedPageError(text(error))

  const name = courseName(doc)
  const table =
    doc.querySelector('table[class*="user-grade"]') ?? doc.querySelector("table#user-grade") ?? doc.querySelector("table.generaltable")
  if (!table) return { courseName: name, items: [], total: null }

  const rows = Array.from(table.querySelectorAll("tr"))
  const headers = rows[0] ? Array.from(rows[0].querySelectorAll("th, td")).map((c) => text(c).toLowerCase()) : []
  const col: Partial<Record<Column, number>> = {}
  headers.forEach((h, i) => {
    if (h.includes("grade item") || (h.includes("item") && col.name === undefined)) col.name = i
    else if (h === "grade" || (h.includes("grade") && !h.includes("item") && col.grade === undefined)) col.grade = i
    else if (h.includes("range")) col.range = i
    else if (h.includes("percentage")) col.percentage = i
    else if (h.includes("feedback")) col.feedback = i
  })

  const items: GradeItem[] = []
  let total: GradeItem | null = null
  for (const row of rows.slice(1)) {
    const cells = Array.from(row.querySelectorAll("th, td"))
    if (!cells.length) continue
    const cell = (key: Column) => {
      const i = col[key]
      return i !== undefined && i < cells.length ? text(cells[i]) || null : null
    }
    const item: GradeItem = {
      name: cell("name") ?? text(cells[0]),
      grade: cell("grade"),
      range: cell("range"),
      percentage: cell("percentage"),
      feedback: cell("feedback"),
    }
    if (item.name.toLowerCase().includes("course total")) total = item
    else if (/category/.test(row.getAttribute("class") ?? "") && !item.grade) continue
    else items.push(item)
  }
  return { courseName: name, items, total }
}
