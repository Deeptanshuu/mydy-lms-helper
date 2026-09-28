// C0/C1 control characters (ESC, BEL, ...). MyDy text is shown in a terminal, where these would be
// interpreted as escape sequences (title changes, clipboard writes, screen clears).
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g

export function stripControl(s: string): string {
  return s.replace(CONTROL, "")
}

/** Visible text with runs of whitespace collapsed and control characters removed; "" for a missing element. */
export function text(el: Element | Node | null | undefined): string {
  return stripControl(el?.textContent ?? "").replace(/\s+/g, " ").trim()
}

export function abs(href: string, base: string): string {
  return new URL(href, base).toString()
}

/** Like abs(), but null for an href that isn't a valid URL (MyDy pages contain some). */
export function safeAbs(href: string | null | undefined, base: string): string | null {
  if (!href) return null
  try {
    return new URL(href.trim(), base).toString()
  } catch {
    return null
  }
}

const BLOCK = new Set(["P", "DIV", "LI", "TR", "UL", "OL", "TABLE", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "SECTION"])

/** Readable multi-line text of a rich HTML body: paragraphs, list items, table rows and line breaks kept. */
export function blockText(root: Element): string {
  const clone = root.cloneNode(true) as Element
  const doc = clone.ownerDocument
  clone.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")))
  clone.querySelectorAll("li").forEach((li) => li.insertBefore(doc.createTextNode("- "), li.firstChild))
  clone.querySelectorAll("td, th").forEach((cell) => {
    if (cell.nextElementSibling) cell.appendChild(doc.createTextNode(" | "))
  })
  clone.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toUpperCase()
    if (!BLOCK.has(tag)) return
    el.insertBefore(doc.createTextNode("\n"), el.firstChild)
    // List items and table rows sit on consecutive lines; other blocks get a blank line after them.
    if (tag !== "LI" && tag !== "TR") el.appendChild(doc.createTextNode("\n\n"))
  })
  return stripControl(clone.textContent ?? "")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Activity title without Moodle's hidden screen-reader suffix (" File", " Forum", ...). */
export function activityName(el: Element): string {
  const span = el.querySelector("span.instancename")
  if (span) {
    const clone = span.cloneNode(true) as Element
    clone.querySelectorAll("span.accesshide").forEach((n) => n.remove())
    return text(clone)
  }
  const link = el.querySelector("a[href]")
  if (!link) return ""
  const own = Array.from(link.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  return own || text(link)
}

/** Course name from a page title such as "Course: Computer Networks". */
export function courseName(doc: Document): string {
  const title = text(doc.querySelector("title"))
  if (!title) return "Unknown course"
  const i = title.indexOf("Course:")
  return i >= 0 ? title.slice(i + "Course:".length).trim() : title
}
