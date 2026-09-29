import {
  LoginFailedError,
  NetworkError,
  SessionExpiredError,
  type Announcement,
  type AnnouncementSummary,
  type Assignment,
  type Attendance,
  type Course,
  type GradeReport,
  type LoginResult,
  type Section,
} from "@mydy/core/logic"
import type { Snapshot } from "./cache"
import type { Credentials } from "./credentials"
import type { AppStore, CourseDataKey, TabName } from "./state"

export interface SyncClient {
  login(username: string, password: string): Promise<LoginResult>
  courses(): Promise<Course[]>
  attendance(): Promise<Attendance>
  courseContent(id: string): Promise<Section[]>
  assignments(id: string): Promise<Assignment[]>
  grades(id: string): Promise<GradeReport>
  announcements(id: string, limit?: number): Promise<AnnouncementSummary[]>
  announcement(summary: AnnouncementSummary): Promise<Announcement>
  clearCache(): void
}

export interface SyncDeps {
  client: SyncClient
  store: AppStore
  credentials: () => Credentials | null
  save: (snapshot: Snapshot) => Promise<void>
  now?: () => number
}

const TAB_DATA: Record<TabName, CourseDataKey> = { files: "content", assignments: "assignments", grades: "grades", announcements: "announcements" }
const OFFLINE_TAB_MESSAGE = "Can't reach MyDy. Press r to retry."

export function createSync(deps: SyncDeps) {
  const { client, store } = deps
  const { actions } = store
  let signedIn = false
  let running: Promise<void> | null = null
  let signingIn: Promise<void> | null = null

  // Requests that find no session share one login instead of each starting their own.
  function signIn(): Promise<void> {
    signingIn ??= (async () => {
      const creds = deps.credentials()
      if (!creds) throw new LoginFailedError("No saved login.")
      actions.setSync({ status: "syncing", message: "signing in" })
      await client.login(creds.username, creds.password)
      signedIn = true
    })().finally(() => {
      signingIn = null
    })
    return signingIn
  }

  async function withSession<T>(fn: () => Promise<T>): Promise<T> {
    if (!signedIn) await signIn()
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof SessionExpiredError)) throw e
      signedIn = false
      await signIn()
      return await fn()
    }
  }

  function report(e: unknown): void {
    if (e instanceof NetworkError) {
      actions.setSync({ status: "offline", message: e.message })
    } else if (e instanceof LoginFailedError || e instanceof SessionExpiredError) {
      signedIn = false
      actions.setSync({ status: "idle", message: null })
      actions.setToast({
        title: "Signed out of MyDy",
        detail: /wrong/i.test(e.message) ? "Your password may have changed." : e.message,
        action: "signin",
      })
    } else {
      actions.setSync({ status: "error", message: e instanceof Error ? e.message : String(e) })
    }
  }

  const save = () => deps.save(actions.snapshot()).catch(() => undefined)

  async function runOnce(): Promise<void> {
    client.clearCache()
    actions.setSync({ status: "syncing", message: "loading courses" })
    actions.applyCourses(await withSession(() => client.courses()))
    actions.setSync({ status: "syncing", message: "loading attendance" })
    actions.applyAttendance(await withSession(() => client.attendance()))
    const ids = [...store.state.currentIds]
    for (const [i, id] of ids.entries()) {
      actions.setSync({ status: "syncing", message: `checking deadlines ${i + 1} of ${ids.length}` })
      actions.setCourseData(id, "content", await withSession(() => client.courseContent(id)))
      actions.setCourseData(id, "assignments", await withSession(() => client.assignments(id)))
    }
    actions.setSync({ status: "idle", message: null, lastSynced: (deps.now ?? Date.now)() })
    await save()
  }

  function run(): Promise<void> {
    running ??= runOnce()
      .catch(report)
      .finally(() => {
        running = null
      })
    return running
  }

  function fetchData(id: string, key: CourseDataKey) {
    switch (key) {
      case "content":
        return client.courseContent(id)
      case "assignments":
        return client.assignments(id)
      case "grades":
        return client.grades(id)
      case "announcements":
        return client.announcements(id)
    }
  }

  async function loadTab(id: string, tab: TabName): Promise<void> {
    const key = TAB_DATA[tab]
    const entry = store.state.courses[id]
    if (!entry || entry[key] !== undefined || entry.loading[key]) return
    actions.setLoading(id, key, true)
    try {
      actions.setCourseData(id, key, (await withSession<unknown>(() => fetchData(id, key))) as never)
      await save()
    } catch (e) {
      if (e instanceof LoginFailedError || e instanceof SessionExpiredError) report(e)
      actions.setError(id, key, e instanceof NetworkError ? OFFLINE_TAB_MESSAGE : e instanceof Error ? e.message : String(e))
    } finally {
      actions.setLoading(id, key, false)
    }
  }

  async function openAnnouncement(summary: AnnouncementSummary): Promise<void> {
    const from = store.state.selectedId
    // Only show the post if the user is still on the same course's announcements when it arrives.
    const stillWanted = () => store.state.selectedId === from && store.state.tab === "announcements"
    try {
      const post = await withSession(() => client.announcement(summary))
      if (stillWanted()) actions.setReading(post)
    } catch (e) {
      if (!stillWanted()) return
      actions.setReading({
        ...summary,
        content: e instanceof NetworkError ? OFFLINE_TAB_MESSAGE : `Couldn't load this post: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  return {
    run,
    loadTab,
    openAnnouncement,
    withSession,
    markSignedIn: () => {
      signedIn = true
    },
    reset: () => {
      signedIn = false
    },
  }
}

export type Sync = ReturnType<typeof createSync>
