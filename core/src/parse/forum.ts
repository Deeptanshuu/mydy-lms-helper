import { blockText, safeAbs, text } from "../html"
import type { Announcement, AnnouncementSummary } from "../types"

const DISCUSS_LINK = 'a[href*="/mod/forum/discuss.php?d="]'

export function parseDiscussionList(doc: Document, pageUrl: string, limit = 10): AnnouncementSummary[] {
  const out: AnnouncementSummary[] = []
  const table = doc.querySelector('table[class*="forumheaderlist"], table[class*="discussion-list"]')
  if (table) {
    for (const row of Array.from(table.querySelectorAll("tr")).slice(1, limit + 1)) {
      const link = row.querySelector(DISCUSS_LINK)
      const url = safeAbs(link?.getAttribute("href"), pageUrl)
      if (!link || !url) continue
      const cells = Array.from(row.querySelectorAll("td, th"))
      out.push({
        title: text(link),
        url,
        author: cells.length > 1 ? text(cells[1]) || null : null,
        dateText: cells.length > 2 ? text(cells[cells.length - 1]) || null : null,
      })
    }
  }
  if (!out.length) {
    const seen = new Set<string>()
    for (const link of Array.from(doc.querySelectorAll(DISCUSS_LINK))) {
      const url = safeAbs(link.getAttribute("href"), pageUrl)
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push({ title: text(link), url, author: null, dateText: null })
      if (out.length >= limit) break
    }
  }
  return out
}

export function parseDiscussion(doc: Document, summary: AnnouncementSummary): Announcement {
  const post = doc.querySelector('div[class*="forumpost"], div[class*="forum-post"]')
  if (!post) return { ...summary, content: null }

  const body = post.querySelector('[class*="posting"], [class*="post-content"]')
  const content = body ? blockText(body) || null : null
  const author = summary.author ?? (text(post.querySelector(".author") ?? post.querySelector('a[href*="/user/"]')) || null)
  const dateText =
    summary.dateText ?? (text(post.querySelector("time") ?? post.querySelector('[class*="modified"], [class*="date"]')) || null)
  return { ...summary, author, dateText, content }
}
