import { NetworkError, PortalLoginError, type Results, type RevaluationApplication, type RevaluationExam } from "@mydy/core/logic"
import type { Snapshot } from "./cache"
import type { PortalCredentials } from "./credentials"
import type { AppStore } from "./state"

export interface ResultsClient {
  login(regno: string, password: string): Promise<string>
  results(): Promise<Results>
  revaluationWindows(): Promise<RevaluationExam[]>
  revaluationApplications(): Promise<RevaluationApplication[]>
}

export interface ResultsDeps {
  client: ResultsClient
  store: AppStore
  credentials: () => PortalCredentials | null
  setCredentials: (creds: PortalCredentials | null) => void
  /** Saves a login that just worked, when the user asked to be remembered. Returns a problem to show, if any. */
  remember: (creds: PortalCredentials) => Promise<string | null>
  forget: () => Promise<void>
  save: (snapshot: Snapshot) => Promise<void>
  now?: () => number
}

/** Results this fresh aren't fetched again just because the pane was opened. They change a few times a year. */
export const RESULTS_FRESH_MS = 6 * 60 * 60 * 1000
const OFFLINE = "Can't reach UniClaIRE. Press r to retry."

export function createResults(deps: ResultsDeps) {
  const { client, store } = deps
  const { actions } = store
  const now = () => (deps.now ?? Date.now)()
  let running: Promise<boolean> | null = null

  /** Signs in and fetches everything. True when it worked. */
  function fetchAll(creds: PortalCredentials): Promise<boolean> {
    running ??= (async () => {
      actions.setResults({ status: "loading", message: null })
      try {
        await client.login(creds.regno, creds.password)
        const data = await client.results()
        // The windows are a bonus: results without them beat no results.
        const windows = await client.revaluationWindows().catch(() => null)
        const applications = await client.revaluationApplications().catch(() => null)
        actions.applyResults(data, windows, now(), applications)
        await deps.save(actions.snapshot()).catch(() => undefined)
        return true
      } catch (e) {
        if (e instanceof PortalLoginError) actions.setResults({ status: "signin", message: e.message })
        else if (e instanceof NetworkError) actions.setResults({ status: "offline", message: OFFLINE })
        else actions.setResults({ status: "error", message: e instanceof Error ? e.message : String(e) })
        return false
      }
    })().finally(() => {
      running = null
    })
    return running
  }

  /** Opening the pane: fetch unless the last results are fresh. `force` (the r key) always fetches. */
  async function load(force = false): Promise<void> {
    const r = store.state.results
    if (r.status === "loading" || r.signingIn) return
    const creds = deps.credentials()
    if (!creds) {
      actions.setResults({ status: "signin" })
      return
    }
    if (!force && r.data && r.fetchedAt && now() - r.fetchedAt < RESULTS_FRESH_MS && r.status !== "signin") return
    // A login that was rejected stays rejected until the user types a new one.
    if (!force && r.status === "signin") return
    await fetchAll(creds)
  }

  async function signIn(regno: string, password: string, remember: boolean): Promise<void> {
    const creds = { regno: regno.trim(), password }
    actions.setResults({ signingIn: true, message: null })
    deps.setCredentials(creds)
    const ok = await fetchAll(creds)
    actions.setResults({ signingIn: false })
    if (!ok) {
      // Keep the form up with the portal's message; a login that didn't work isn't kept.
      if (store.state.results.status === "signin") deps.setCredentials(null)
      return
    }
    actions.setResults({ editing: false })
    if (remember) {
      const problem = await deps.remember(creds)
      if (problem) actions.setToast({ title: "UniClaIRE login not saved", detail: problem, action: null })
    }
  }

  async function signOut(): Promise<void> {
    deps.setCredentials(null)
    await deps.forget()
    actions.clearResults()
    actions.setResults({ status: "signin" })
    await deps.save(actions.snapshot()).catch(() => undefined)
  }

  return { load, signIn, signOut }
}

export type ResultsLoader = ReturnType<typeof createResults>
