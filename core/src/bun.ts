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
  /** Hosts that are only ever contacted over https: any http:// URL for them is upgraded before sending. */
  httpsHosts?: string[]
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
  const httpsHosts = new Set(options.httpsHosts ?? ["mydy.dypatil.edu"])
  // Pages can link or post to MyDy's http:// address; the password and session cookie must never go out in plain text.
  const secure = (url: string): string => {
    const u = new URL(url)
    if (u.protocol === "http:" && httpsHosts.has(u.hostname)) u.protocol = "https:"
    return u.toString()
  }

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
    let current = secure(url)
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
        const next = new URL(location, current)
        const from = new URL(current)
        // MyDy redirects some https pages to its http:// address. Never downgrade on the same host:
        // it would send the session cookie in plain text (and port 80 may not answer at all).
        if (from.protocol === "https:" && next.protocol === "http:" && next.hostname === from.hostname) next.protocol = "https:"
        current = secure(next.toString())
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
