import { abs, safeAbs } from "../html"

export interface LoginForm {
  action: string
  fields: Record<string, string>
}

/** The Moodle sign-in form: its hidden fields and absolute action URL. Null when the page has no password field. */
export function parseLoginForm(doc: Document, pageUrl: string): LoginForm | null {
  const password = doc.querySelector('input[name="password"]')
  if (!password) return null
  const form = password.closest("form") ?? doc.querySelector("form")
  const scope: ParentNode = form ?? doc
  const fields: Record<string, string> = {}
  scope.querySelectorAll('input[type="hidden"]').forEach((input) => {
    const name = input.getAttribute("name")
    if (name) fields[name] = input.getAttribute("value") ?? ""
  })
  const action = form?.getAttribute("action")
  return { action: safeAbs(action, pageUrl) ?? abs("/rait/login/index.php", pageUrl), fields }
}

export function hasLoginError(html: string): boolean {
  return /invalid login|login failed|incorrect/i.test(html)
}

export function looksSignedIn(html: string, url: string): boolean {
  return /dashboard|logout|profile/i.test(html) || (url.includes("/rait") && !url.includes("login"))
}
