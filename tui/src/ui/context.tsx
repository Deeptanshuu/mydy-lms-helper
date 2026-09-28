import type { AnnouncementSummary } from "@mydy/core/logic"
import { createContext, useContext, type JSX } from "solid-js"
import type { AppStore, TabName } from "../state"

/** Side effects the views can trigger. Implemented in src/index.tsx, faked in tests. */
export interface Services {
  refresh(): void
  loadTab(courseId: string, tab: TabName): void
  openAnnouncement(summary: AnnouncementSummary): void
  startDownload(courseIds: string[]): void
  cancelDownload(): void
  signIn(username: string, password: string, remember: boolean): void
  open(target: string): void
  quit(): void
}

export interface AppContextValue {
  store: AppStore
  nerd: boolean
  /** Attendance requirement as a fraction, e.g. 0.75. */
  threshold: number
  services: Services
  now: () => Date
}

const AppContext = createContext<AppContextValue>()

export function AppProvider(props: { value: AppContextValue; children: JSX.Element }) {
  return <AppContext.Provider value={props.value}>{props.children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error("useApp must be used inside AppProvider")
  return value
}
