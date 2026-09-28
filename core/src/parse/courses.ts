import { safeAbs, text } from "../html"
import type { Course } from "../types"

const COURSE_LINK = 'a[href*="/course/view.php?id="]'

/** Courses linked from the dashboard, unique by id, newest (highest id) first. */
export function parseCourses(doc: Document, pageUrl: string): Course[] {
  const seen = new Set<string>()
  const out: Course[] = []
  const collect = (root: ParentNode) => {
    root.querySelectorAll(COURSE_LINK).forEach((a) => {
      const href = a.getAttribute("href") ?? ""
      const id = /[?&]id=(\d+)/.exec(href)?.[1]
      const name = text(a)
      const url = safeAbs(href, pageUrl)
      if (!id || !url || seen.has(id) || name.length <= 2) return
      seen.add(id)
      out.push({ id, name, url })
    })
  }

  const previous = Array.from(doc.querySelectorAll("div[id]")).find((d) => /stu_previousclasses/.test(d.getAttribute("id") ?? ""))
  if (previous) collect(previous)
  doc.querySelectorAll("div[class]").forEach((d) => {
    if (/block.*(navigation|tree|university)/.test(d.getAttribute("class") ?? "")) collect(d)
  })
  if (!out.length) collect(doc)
  return out.sort((a, b) => Number(b.id) - Number(a.id))
}
