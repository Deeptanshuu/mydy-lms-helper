import { homedir } from "node:os"
import { join } from "node:path"

export interface Dirs {
  config: string
  cache: string
  downloads: string
}

export function appDirs(env: Record<string, string | undefined> = process.env, platform: string = process.platform, home: string = homedir()): Dirs {
  const downloads = join(home, "Downloads", "MyDy")
  if (platform === "win32") {
    return {
      config: join(env.APPDATA ?? join(home, "AppData", "Roaming"), "mydy"),
      cache: join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "mydy"),
      downloads,
    }
  }
  const config = join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "mydy")
  if (platform === "darwin") return { config, cache: join(home, "Library", "Caches", "mydy"), downloads }
  return { config, cache: join(env.XDG_CACHE_HOME ?? join(home, ".cache"), "mydy"), downloads }
}
