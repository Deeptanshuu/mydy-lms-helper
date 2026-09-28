import { isAbsolute } from "node:path"

/** True for http(s) URLs and absolute local paths; anything else is refused. */
export function isOpenable(target: string): boolean {
  if (isAbsolute(target)) return true
  try {
    const { protocol } = new URL(target)
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}

/** Opens a URL or folder in the user's default application, best-effort. */
export function openExternal(target: string): void {
  if (!isOpenable(target)) return
  try {
    // Windows: never go through cmd.exe, which would treat "&" in a URL as a command separator.
    const command =
      process.platform === "darwin"
        ? ["open", target]
        : process.platform === "win32"
          ? ["rundll32", "url.dll,FileProtocolHandler", target]
          : ["xdg-open", target]
    Bun.spawn(command, { stdio: ["ignore", "ignore", "ignore"] })
  } catch {
    // no opener available on this system: nothing more we can do
  }
}
