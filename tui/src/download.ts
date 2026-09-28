import { mkdir, rename, stat, unlink } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { SessionExpiredError, type Activity, type Course, type FileRef, type Section } from "@mydy/core/logic"
import { DOWNLOADABLE } from "./derive"

export interface DownloadClient {
  courseContent(id: string): Promise<Section[]>
  resolveFiles(activityUrl: string): Promise<FileRef[]>
  download(url: string): Promise<Response>
}

export type FileStatus = "saved" | "skipped" | "failed"

export type DownloadEvent =
  | { type: "planned"; total: number }
  | { type: "file"; course: string; name: string; status: FileStatus; bytes: number }

export interface DownloadSummary {
  saved: number
  skipped: number
  failed: number
  bytes: number
  cancelled: boolean
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/** A single safe path segment: no separators, control characters, "." / "..", trailing dots or reserved names. */
export function safeName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_").trim().replace(/[. ]+$/, "")
  if (!cleaned || cleaned === "." || cleaned === "..") return "Untitled"
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

export async function downloadCourses(
  courses: Course[],
  opts: { client: DownloadClient; dir: string; signal?: AbortSignal; onEvent?: (e: DownloadEvent) => void },
): Promise<DownloadSummary> {
  const { client, dir, signal, onEvent } = opts
  const jobs: Array<{ course: Course; activity: Activity }> = []
  for (const course of courses) {
    if (signal?.aborted) break
    for (const section of await client.courseContent(course.id)) {
      for (const activity of section.activities) if (DOWNLOADABLE.has(activity.type)) jobs.push({ course, activity })
    }
  }
  onEvent?.({ type: "planned", total: jobs.length })

  const summary: DownloadSummary = { saved: 0, skipped: 0, failed: 0, bytes: 0, cancelled: false }
  for (const { course, activity } of jobs) {
    if (signal?.aborted) break
    const result = await saveActivity(client, activity, join(dir, safeName(course.name)))
    summary[result.status]++
    summary.bytes += result.bytes
    onEvent?.({ type: "file", course: course.name, name: result.name, status: result.status, bytes: result.bytes })
  }
  summary.cancelled = !!signal?.aborted
  return summary
}

async function saveActivity(client: DownloadClient, activity: Activity, folder: string): Promise<{ status: FileStatus; name: string; bytes: number }> {
  let refs: FileRef[]
  try {
    refs = await client.resolveFiles(activity.url)
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e
    return { status: "failed", name: activity.name, bytes: 0 }
  }

  for (const ref of refs) {
    let res: Response
    try {
      res = await client.download(ref.url)
    } catch (e) {
      if (e instanceof SessionExpiredError) throw e
      continue
    }
    // A signed-out redirect lands on an HTML page; never save that as the file.
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) {
      await res.body?.cancel().catch(() => undefined)
      continue
    }

    await mkdir(folder, { recursive: true })
    const name = safeName(ref.filename)
    const target = join(folder, name)
    if (!resolve(target).startsWith(resolve(folder) + sep)) {
      await res.body?.cancel().catch(() => undefined)
      continue
    }
    const size = Number(res.headers.get("content-length") ?? 0)
    const existing = await stat(target).catch(() => null)
    if (existing && size > 0 && existing.size === size) {
      await res.body?.cancel().catch(() => undefined)
      return { status: "skipped", name, bytes: 0 }
    }

    const part = `${target}.part`
    try {
      const bytes = await writeStream(part, res)
      await rename(part, target)
      return { status: "saved", name, bytes }
    } catch {
      await unlink(part).catch(() => undefined)
    }
  }
  return { status: "failed", name: activity.name, bytes: 0 }
}

// Bun.write(path, response) never settles when the body stream errors, so copy chunk by chunk.
async function writeStream(path: string, res: Response): Promise<number> {
  const writer = Bun.file(path).writer()
  let bytes = 0
  try {
    if (res.body) {
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        writer.write(value)
        bytes += value.byteLength
      }
    }
  } finally {
    await writer.end()
  }
  return bytes
}
