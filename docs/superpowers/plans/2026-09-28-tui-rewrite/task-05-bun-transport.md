### Task 5: Bun transport: cookie jar, manual redirects, pacing, linkedom parser

Read the global rules in `docs/superpowers/plans/2026-09-28-tui-rewrite.md` first. Task 1 must be done. Runs in parallel with Tasks 2, 3, 4, 7, 12.

Bun's `fetch` does not keep cookies between requests, so MyDy's session cookie (set in the middle of a redirect chain during sign-in) must be tracked by hand. This file is the only Bun-specific part of `core/`.

**Files:**
- Create: `core/src/bun.ts`
- Test: `core/test/transport.test.ts`

**Interfaces:**
- Consumes: `Transport`, `Page` (`core/src/transport.ts`), `NetworkError` (`core/src/errors.ts`).
- Produces (import path `@mydy/core/bun`):
  - `parseHtmlLinkedom(html: string): Document`
  - `class CookieJar { store(url: string, setCookies: string[]): void; header(url: string): string | undefined }`
  - `createBunTransport(options?: BunTransportOptions): Transport & { jar: CookieJar }` with `BunTransportOptions = { delayMs?: number (500); downloadDelayMs?: number (600); maxRedirects?: number (10); userAgent?: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }`

- [ ] **Step 1: Write the failing test `core/test/transport.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createBunTransport, parseHtmlLinkedom } from "../src/bun"
import { NetworkError } from "../src/errors"

let server: ReturnType<typeof Bun.serve>
let base = ""
const hits: Array<{ path: string; at: number }> = []
let lastForm = ""

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      hits.push({ path: url.pathname, at: Date.now() })
      const echo = () => new Response(`cookie:${req.headers.get("cookie") ?? ""}`)
      switch (url.pathname) {
        case "/set":
          return new Response(null, { status: 302, headers: { location: "/landing", "set-cookie": "a=1; Path=/; HttpOnly" } })
        case "/landing":
          return echo()
        case "/form":
          lastForm = await req.text()
          return new Response(null, { status: 303, headers: { location: "/landing", "set-cookie": "b=2; Path=/" } })
        case "/clear":
          return new Response("cleared", { headers: { "set-cookie": "a=; Max-Age=0; Path=/" } })
        case "/loop":
          return new Response(null, { status: 302, headers: { location: "/loop" } })
        case "/file":
          return new Response(new Uint8Array([1, 2, 3, 4, 5]), { headers: { "content-type": "application/pdf" } })
        case "/ua":
          return new Response(req.headers.get("user-agent") ?? "")
        default:
          return new Response("missing", { status: 404 })
      }
    },
  })
  base = `http://localhost:${server.port}`
})
afterAll(() => server.stop(true))

const fresh = (delayMs = 0) => createBunTransport({ delayMs, downloadDelayMs: 0 })

describe("createBunTransport", () => {
  test("a cookie set on a redirect is sent on the next hop", async () => {
    const page = await fresh().get(`${base}/set`)
    expect(page.url).toBe(`${base}/landing`)
    expect(page.status).toBe(200)
    expect(page.html).toBe("cookie:a=1")
  })

  test("POST is form-encoded and a 303 turns into a GET", async () => {
    const page = await fresh().post(`${base}/form`, { username: "s@x.edu", password: "p&q=1" })
    expect(lastForm).toBe("username=s%40x.edu&password=p%26q%3D1")
    expect(page.url).toBe(`${base}/landing`)
    expect(page.html).toBe("cookie:b=2")
  })

  test("Max-Age=0 deletes a cookie", async () => {
    const t = fresh()
    await t.get(`${base}/set`)
    await t.get(`${base}/clear`)
    expect((await t.get(`${base}/landing`)).html).toBe("cookie:")
  })

  test("redirect loops become a NetworkError", async () => {
    await expect(fresh().get(`${base}/loop`)).rejects.toBeInstanceOf(NetworkError)
  })

  test("an unreachable host becomes a NetworkError that names the host", async () => {
    const err = await fresh().get("http://127.0.0.1:1/").catch((e) => e)
    expect(err).toBeInstanceOf(NetworkError)
    expect(String(err.message)).toContain("Can't reach 127.0.0.1")
  })

  test("requests are paced one at a time", async () => {
    const t = fresh(80)
    hits.length = 0
    await Promise.all([t.get(`${base}/landing`), t.get(`${base}/landing`), t.get(`${base}/landing`)])
    const times = hits.filter((h) => h.path === "/landing").map((h) => h.at)
    expect(times).toHaveLength(3)
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(70)
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(70)
  })

  test("download streams the body", async () => {
    const res = await fresh().download(`${base}/file`)
    expect(res.ok).toBe(true)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  test("sends a browser user agent", async () => {
    expect((await fresh().get(`${base}/ua`)).html).toContain("Mozilla/5.0")
  })
})

test("parseHtmlLinkedom returns a queryable Document", () => {
  const doc = parseHtmlLinkedom("<html><body><a class='x' href='/a'>A</a></body></html>")
  expect(doc.querySelector("a.x")?.getAttribute("href")).toBe("/a")
})
```

- [ ] **Step 2: Run to see it fail**

Run: `bun test --cwd core transport`
Expected: FAIL, `Cannot find module '../src/bun'`.

- [ ] **Step 3: Implement `core/src/bun.ts`**

```ts
import { DOMParser } from "linkedom"
import { NetworkError } from "./errors"
import type { Page, Transport } from "./transport"

export function parseHtmlLinkedom(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html") as unknown as Document
}

/** Minimal per-host cookie jar. MyDy lives on one host, so Domain/Path attributes are not needed. */
export class CookieJar {
  private readonly byHost = new Map<string, Map<string, string>>()

  store(url: string, setCookies: string[]): void {
    if (!setCookies.length) return
    const host = new URL(url).hostname
    let jar = this.byHost.get(host)
    if (!jar) this.byHost.set(host, (jar = new Map()))
    for (const line of setCookies) {
      const [pair = "", ...attrs] = line.split(";")
      const eq = pair.indexOf("=")
      if (eq < 1) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const expired = attrs.some((attr) => {
        const [k = "", v = ""] = attr.split("=")
        const key = k.trim().toLowerCase()
        if (key === "max-age") return Number(v) <= 0
        if (key === "expires") {
          const at = Date.parse(v)
          return Number.isFinite(at) && at < Date.now()
        }
        return false
      })
      if (expired || value === "" || value === "deleted") jar.delete(name)
      else jar.set(name, value)
    }
  }

  header(url: string): string | undefined {
    const jar = this.byHost.get(new URL(url).hostname)
    if (!jar?.size) return undefined
    return Array.from(jar, ([k, v]) => `${k}=${v}`).join("; ")
  }
}

export interface BunTransportOptions {
  delayMs?: number
  downloadDelayMs?: number
  maxRedirects?: number
  userAgent?: string
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])
const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

export function createBunTransport(options: BunTransportOptions = {}): Transport & { jar: CookieJar } {
  const delayMs = options.delayMs ?? 500
  const downloadDelayMs = options.downloadDelayMs ?? 600
  const maxRedirects = options.maxRedirects ?? 10
  const userAgent = options.userAgent ?? DEFAULT_UA
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms))
  const jar = new CookieJar()

  // One request at a time, with a gap after the previous one finished.
  let lastFinished = 0
  let queue: Promise<unknown> = Promise.resolve()
  function paced<T>(delay: number, task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = lastFinished + delay - Date.now()
      if (lastFinished && wait > 0) await sleep(wait)
      try {
        return await task()
      } finally {
        lastFinished = Date.now()
      }
    }
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  }

  async function request(method: "GET" | "POST", url: string, body?: URLSearchParams): Promise<{ res: Response; url: string }> {
    let current = url
    let currentMethod = method
    let currentBody = body
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const headers: Record<string, string> = { "user-agent": userAgent }
      const cookie = jar.header(current)
      if (cookie) headers.cookie = cookie
      if (currentBody) headers["content-type"] = "application/x-www-form-urlencoded"

      let res: Response
      try {
        res = await doFetch(current, { method: currentMethod, headers, body: currentBody, redirect: "manual" })
      } catch (e) {
        throw new NetworkError(`Can't reach ${new URL(current).hostname}: ${(e as Error).message}`, current)
      }
      jar.store(current, res.headers.getSetCookie())

      const location = res.headers.get("location")
      if (REDIRECTS.has(res.status) && location) {
        await res.body?.cancel().catch(() => undefined)
        current = new URL(location, current).toString()
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === "POST")) {
          currentMethod = "GET"
          currentBody = undefined
        }
        continue
      }
      return { res, url: current }
    }
    throw new NetworkError(`Too many redirects from ${new URL(url).hostname}`, url)
  }

  const toPage = async ({ res, url }: { res: Response; url: string }): Promise<Page> => ({ url, status: res.status, html: await res.text() })

  return {
    jar,
    get: (url) => paced(delayMs, async () => toPage(await request("GET", url))),
    post: (url, form) => paced(delayMs, async () => toPage(await request("POST", url, new URLSearchParams(form)))),
    download: (url) => paced(downloadDelayMs, async () => (await request("GET", url)).res),
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test --cwd core transport`
Expected: 9 pass. If the pacing test is flaky on a loaded machine, keep the assertion at `>= 70` ms for an 80 ms delay; do not remove it.
