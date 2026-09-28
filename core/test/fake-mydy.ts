import { ASSIGNMENT_DONE_HTML, ASSIGNMENT_OPEN_HTML } from "./fixtures/assignment"
import { ATTENDANCE_HTML } from "./fixtures/attendance"
import { DASHBOARD_HTML, HOME_HTML, LOGIN_FAILED_HTML, LOGIN_FORM_HTML } from "./fixtures/auth"
import { COURSE_HTML } from "./fixtures/course"
import { flexpaperPage, PDF_BYTES, presentationPage, resourcePage } from "./fixtures/files"
import { DISCUSSION_HTML, FORUM_HTML } from "./fixtures/forum"
import { GRADES_HTML } from "./fixtures/grades"

export interface FakeMydy {
  url: string
  stop(): void
  expireSessions(): void
  requests: string[]
}

export function startFakeMydy(opts: { password?: string } = {}): FakeMydy {
  const password = opts.password ?? "correct horse"
  const sessions = new Set<string>()
  const requests: string[] = []
  let counter = 0

  const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } })
  const redirect = (to: string, extra: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, ...extra } })

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const u = new URL(req.url)
      const path = u.pathname
      requests.push(`${req.method} ${path}${u.search}`)
      const sid = /MoodleSession=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1]
      const signedIn = !!sid && sessions.has(sid)

      if (path === "/") return html(HOME_HTML)
      if (path === "/index.php" && req.method === "POST") {
        const form = await req.formData()
        return redirect(`/rait/login/index.php?uname=${encodeURIComponent(String(form.get("username")))}&wantsurl=`)
      }
      if (path === "/rait/login/index.php" && req.method === "GET") {
        return u.searchParams.has("uname") ? html(LOGIN_FORM_HTML) : redirect("/")
      }
      if (path === "/rait/login/index.php" && req.method === "POST") {
        const form = await req.formData()
        if (form.get("password") === password && form.get("logintoken") === "tok123") {
          const id = `s${++counter}`
          sessions.add(id)
          return redirect("/rait/my/", { "set-cookie": `MoodleSession=${id}; Path=/; HttpOnly` })
        }
        return html(LOGIN_FAILED_HTML)
      }
      if (!signedIn) return redirect("/rait/login/index.php")

      const id = u.searchParams.get("id") ?? u.searchParams.get("d")
      switch (path) {
        case "/rait/my/":
          return html(DASHBOARD_HTML)
        case "/rait/blocks/academic_status/ajax.php":
          return html(ATTENDANCE_HTML)
        case "/rait/grade/report/user/index.php":
          return html(GRADES_HTML)
        case "/rait/course/view.php":
          return id === "812" ? html(COURSE_HTML) : html("<html><body>No such course</body></html>", 404)
        case "/rait/mod/assign/view.php":
          return html(id === "9201" ? ASSIGNMENT_OPEN_HTML : ASSIGNMENT_DONE_HTML)
        case "/rait/mod/forum/view.php":
          return html(FORUM_HTML)
        case "/rait/mod/forum/discuss.php":
          return html(DISCUSSION_HTML)
        case "/rait/mod/resource/view.php":
          return html(resourcePage(u.origin))
        case "/rait/mod/flexpaper/view.php":
          return html(flexpaperPage(u.origin))
        case "/rait/mod/presentation/view.php":
          return html(presentationPage(u.origin))
      }
      if (path.startsWith("/rait/pluginfile.php/")) {
        return new Response(PDF_BYTES, { headers: { "content-type": "application/pdf", "content-length": String(PDF_BYTES.length) } })
      }
      return html("<html><body>Not found</body></html>", 404)
    },
  })

  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
    expireSessions: () => sessions.clear(),
    requests,
  }
}
