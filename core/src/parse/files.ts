import { abs, stripControl } from "../html"
import type { FileRef, FileSource } from "../types"

export function filenameFromUrl(url: string): string {
  const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "file"
  try {
    return stripControl(decodeURIComponent(last))
  } catch {
    return stripControl(last)
  }
}

/** Candidate file URLs on an activity page, in the order the Python client tried them. */
export function parseActivityFiles(doc: Document, html: string, pageUrl: string): FileRef[] {
  const out: FileRef[] = []
  const seen = new Set<string>()
  const push = (href: string, source: FileSource) => {
    let url: string
    try {
      url = abs(href, pageUrl)
    } catch {
      return
    }
    if (seen.has(url)) return
    seen.add(url)
    out.push({ url, filename: filenameFromUrl(url), source })
  }

  const links = Array.from(doc.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")!)
  for (const href of links) if (href.includes("pluginfile.php") || /\.(pdf|pptx?|docx)$/i.test(href)) push(href, "direct")
  for (const m of html.matchAll(/PDFFile\s*:\s*'([^']+)'/g)) push(m[1]!, "flexpaper")
  for (const href of links) if (/\.pptx?$/i.test(href)) push(href, "presentation")
  const iframe = doc.querySelector("iframe#presentationobject")?.getAttribute("src")
  if (iframe) push(iframe, "iframe")
  const object = doc.querySelector("object#presentationobject")?.getAttribute("data")
  if (object) push(object, "object")
  return out
}
