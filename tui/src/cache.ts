import { chmod, mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { AnnouncementSummary, Assignment, Attendance, Course, GradeReport, Section } from "@mydy/core/types"
import type { Dirs } from "./paths"

export interface SnapshotCourse {
  course: Course
  content?: Section[]
  assignments?: Assignment[]
  grades?: GradeReport
  announcements?: AnnouncementSummary[]
}

export interface Snapshot {
  version: 1
  user: string
  savedAt: number
  attendance: Attendance | null
  courses: SnapshotCourse[]
}

export function snapshotPath(dirs: Dirs, user: string): string {
  const hash = new Bun.CryptoHasher("sha256").update(user.trim().toLowerCase()).digest("hex").slice(0, 16)
  return join(dirs.cache, `${hash}.json`)
}

export async function saveSnapshot(dirs: Dirs, snap: Snapshot): Promise<void> {
  // Grades, attendance and the email address: readable by this user only.
  await mkdir(dirs.cache, { recursive: true, mode: 0o700 })
  await chmod(dirs.cache, 0o700).catch(() => undefined)
  const path = snapshotPath(dirs, snap.user)
  await writeFile(`${path}.tmp`, JSON.stringify(snap), { mode: 0o600 })
  await rename(`${path}.tmp`, path)
  await chmod(path, 0o600).catch(() => undefined)
}

export async function loadSnapshot(dirs: Dirs, user: string): Promise<Snapshot | null> {
  try {
    const snap = JSON.parse(await Bun.file(snapshotPath(dirs, user)).text()) as Snapshot
    if (snap?.version !== 1 || !Array.isArray(snap.courses)) return null
    for (const c of snap.courses) for (const a of c.assignments ?? []) a.due = a.due ? new Date(a.due) : null
    return snap
  } catch {
    return null
  }
}
