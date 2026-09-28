import { activityName, safeAbs, text } from "../html"
import type { Activity, Section } from "../types"

function activitiesIn(root: ParentNode, pageUrl: string): Activity[] {
  const out: Activity[] = []
  root.querySelectorAll("li.activity").forEach((li) => {
    const url = safeAbs(li.querySelector("a[href]")?.getAttribute("href"), pageUrl)
    if (!url) return
    const type = /modtype_(\w+)/.exec(li.getAttribute("class") ?? "")?.[1] ?? "unknown"
    out.push({ name: activityName(li), type, url })
  })
  return out
}

export function parseCourseContent(doc: Document, pageUrl: string): Section[] {
  let elements = Array.from(doc.querySelectorAll("li.section"))
  if (!elements.length) elements = Array.from(doc.querySelectorAll("div.section"))

  const sections = elements.map((sec): Section => {
    const num = /section-(\d+)/.exec(sec.getAttribute("id") ?? "")?.[1]
    const nameEl = sec.querySelector(".sectionname") ?? sec.querySelector("h3, h4")
    return {
      number: num !== undefined ? Number(num) : null,
      name: text(nameEl) || `Section ${num ?? ""}`.trim(),
      activities: activitiesIn(sec, pageUrl),
    }
  })
  if (sections.length) return sections

  const all = activitiesIn(doc, pageUrl)
  return all.length ? [{ number: 0, name: "All activities", activities: all }] : []
}

export function parseAssignmentLinks(doc: Document, pageUrl: string): Array<{ name: string; url: string }> {
  const area: ParentNode = doc.querySelector("div.course-content") ?? doc.querySelector("#region-main") ?? doc
  const out: Array<{ name: string; url: string }> = []
  const seen = new Set<string>()

  area.querySelectorAll('li[class*="modtype_assign"]').forEach((li) => {
    const url = safeAbs(li.querySelector('a[href*="/mod/assign/view.php"]')?.getAttribute("href"), pageUrl)
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push({ name: activityName(li), url })
  })
  if (!out.length) {
    area.querySelectorAll('a[href*="/mod/assign/view.php?id="]').forEach((link) => {
      const url = safeAbs(link.getAttribute("href"), pageUrl)
      if (!url || seen.has(url)) return
      seen.add(url)
      out.push({ name: text(link), url })
    })
  }
  return out
}

/** The announcements forum: a forum activity named "...announcement...", else the first forum link. */
export function parseForumLink(doc: Document, pageUrl: string): string | null {
  for (const li of Array.from(doc.querySelectorAll('li[class*="modtype_forum"]'))) {
    const link = li.querySelector("a[href]")
    const url = safeAbs(link?.getAttribute("href"), pageUrl)
    if (link && url && text(link).toLowerCase().includes("announcement")) return url
  }
  for (const link of Array.from(doc.querySelectorAll('a[href*="/mod/forum/view.php?id="]'))) {
    const url = safeAbs(link.getAttribute("href"), pageUrl)
    if (url) return url
  }
  return null
}
