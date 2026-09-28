import { testRender } from "@opentui/solid"
import type { JSX } from "solid-js"
import { DEMO_NOW, demoStore } from "../src/demo"
import type { AppStore } from "../src/state"
import { AppProvider, type AppContextValue, type Services } from "../src/ui/context"

export function fakeServices(): Services & { calls: string[] } {
  const calls: string[] = []
  const record = (name: string) => (...args: unknown[]) => void calls.push([name, ...args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))].join(" "))
  return {
    calls,
    refresh: record("refresh"),
    loadTab: record("loadTab"),
    openAnnouncement: record("openAnnouncement"),
    startDownload: record("startDownload"),
    cancelDownload: record("cancelDownload"),
    signIn: record("signIn"),
    open: record("open"),
    quit: record("quit"),
  }
}

type FakeServices = ReturnType<typeof fakeServices>
export type TestContext = AppContextValue & { services: FakeServices }

export function context(opts: { store?: AppStore; nerd?: boolean; services?: FakeServices } = {}): TestContext {
  return { store: opts.store ?? demoStore(), nerd: opts.nerd ?? true, threshold: 0.75, services: opts.services ?? fakeServices(), now: () => DEMO_NOW }
}

export async function renderWith(node: () => JSX.Element, opts: { ctx?: TestContext; width?: number; height?: number } = {}) {
  const ctx = opts.ctx ?? context()
  const setup = await testRender(() => <AppProvider value={ctx}>{node()}</AppProvider>, { width: opts.width ?? 120, height: opts.height ?? 36 })
  await setup.renderOnce()
  return { ...setup, ctx, frame: () => setup.captureCharFrame() }
}
