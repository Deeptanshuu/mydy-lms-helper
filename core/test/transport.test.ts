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

test("a same-host https -> http redirect is upgraded back to https", async () => {
  const seen: string[] = []
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input)
    seen.push(url)
    if (url === "https://mydy.example/rait/login/index.php") return new Response(null, { status: 303, headers: { location: "http://mydy.example" } })
    return new Response("home")
  }) as typeof fetch
  const page = await createBunTransport({ delayMs: 0, fetch: fakeFetch }).get("https://mydy.example/rait/login/index.php")
  expect(seen).toEqual(["https://mydy.example/rait/login/index.php", "https://mydy.example/"])
  expect(page.url).toBe("https://mydy.example/")
})

test("parseHtmlLinkedom returns a queryable Document", () => {
  const doc = parseHtmlLinkedom("<html><body><a class='x' href='/a'>A</a></body></html>")
  expect(doc.querySelector("a.x")?.getAttribute("href")).toBe("/a")
})

test("http:// URLs for MyDy are sent over https, even without a redirect", async () => {
  const seen: string[] = []
  const fakeFetch = (async (input: string | URL | Request) => {
    seen.push(String(input))
    return new Response("ok")
  }) as typeof fetch
  const t = createBunTransport({ delayMs: 0, fetch: fakeFetch })
  await t.post("http://mydy.dypatil.edu/rait/login/index.php", { password: "x" })
  await t.get("http://example.org/page")
  expect(seen).toEqual(["https://mydy.dypatil.edu/rait/login/index.php", "http://example.org/page"])
})
