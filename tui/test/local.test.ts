import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadSnapshot, saveSnapshot, snapshotPath, type Snapshot } from "../src/cache"
import { loadConfig } from "../src/config"
import { loadCredentials, saveCredentials, type SecretStore } from "../src/credentials"
import { parseDotEnv, readDotEnv } from "../src/env"
import { appDirs, type Dirs } from "../src/paths"

let root: string
let dirs: Dirs
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mydy-test-"))
  dirs = { config: join(root, "config"), cache: join(root, "cache"), downloads: join(root, "Downloads", "MyDy") }
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe("appDirs", () => {
  test("macOS", () => {
    expect(appDirs({}, "darwin", "/Users/me")).toEqual({
      config: join("/Users/me", ".config", "mydy"),
      cache: join("/Users/me", "Library", "Caches", "mydy"),
      downloads: join("/Users/me", "Downloads", "MyDy"),
    })
  })
  test("Linux honours XDG", () => {
    expect(appDirs({ XDG_CONFIG_HOME: "/x/conf", XDG_CACHE_HOME: "/x/cache" }, "linux", "/home/me")).toEqual({
      config: join("/x/conf", "mydy"),
      cache: join("/x/cache", "mydy"),
      downloads: join("/home/me", "Downloads", "MyDy"),
    })
  })
  test("Windows uses APPDATA and LOCALAPPDATA", () => {
    const d = appDirs({ APPDATA: "C:/Users/me/AppData/Roaming", LOCALAPPDATA: "C:/Users/me/AppData/Local" }, "win32", "C:/Users/me")
    expect(d.config).toBe(join("C:/Users/me/AppData/Roaming", "mydy"))
    expect(d.cache).toBe(join("C:/Users/me/AppData/Local", "mydy"))
  })
})

describe("loadConfig", () => {
  test("defaults when there is no file", async () => {
    expect(await loadConfig(dirs)).toEqual({ downloadDir: dirs.downloads, nerdFont: true, threshold: 75 })
  })
  test("reads valid values, ignores invalid ones, expands ~", async () => {
    await mkdir(dirs.config, { recursive: true })
    await writeFile(join(dirs.config, "config.json"), JSON.stringify({ downloadDir: "~/Notes", nerdFont: false, threshold: 150 }))
    const c = await loadConfig(dirs)
    expect(c.nerdFont).toBe(false)
    expect(c.threshold).toBe(75)
    expect(c.downloadDir.endsWith(join("", "Notes"))).toBe(true)
    expect(c.downloadDir.startsWith("~")).toBe(false)
  })
  test("broken JSON falls back to defaults", async () => {
    await mkdir(dirs.config, { recursive: true })
    await writeFile(join(dirs.config, "config.json"), "{ nope")
    expect((await loadConfig(dirs)).threshold).toBe(75)
  })
})

describe(".env", () => {
  test("parseDotEnv handles quotes, comments and export", () => {
    expect(parseDotEnv(`# comment\nexport A=1\nB="two words"\nC='x#y'\nD=plain # trailing\n\nbad line`)).toEqual({
      A: "1", B: "two words", C: "x#y", D: "plain",
    })
  })
  test("readDotEnv: earlier files win, missing files are skipped", async () => {
    await writeFile(join(root, "a.env"), "X=from-a\n")
    await writeFile(join(root, "b.env"), "X=from-b\nY=from-b\n")
    expect(readDotEnv([join(root, "a.env"), join(root, "missing.env"), join(root, "b.env")])).toEqual({ X: "from-a", Y: "from-b" })
  })
})

function memoryStore(initial: string | null = null, failSet = false): SecretStore & { value: string | null } {
  const s = {
    value: initial,
    get: async () => s.value,
    set: async ({ value }: { value: string }) => {
      if (failSet) throw new Error("no keyring")
      s.value = value
    },
    delete: async () => ((s.value = null), true),
  }
  return s
}

describe("credentials", () => {
  test("environment wins over the keychain", async () => {
    const r = await loadCredentials({ MYDY_USERNAME: "env@x", MYDY_PASSWORD: "p" }, memoryStore(JSON.stringify({ username: "kc@x", password: "q" })))
    expect(r).toEqual({ creds: { username: "env@x", password: "p" }, source: "env" })
  })
  test("keychain JSON, and junk is ignored", async () => {
    expect((await loadCredentials({}, memoryStore(JSON.stringify({ username: "kc@x", password: "q" })))).source).toBe("keychain")
    expect((await loadCredentials({}, memoryStore("not json"))).creds).toBeNull()
    expect((await loadCredentials({}, null)).creds).toBeNull()
  })
  test("saving reports why it failed", async () => {
    const creds = { username: "a@b", password: "c" }
    const ok = memoryStore()
    expect(await saveCredentials(ok, creds)).toEqual({ ok: true })
    expect(JSON.parse(ok.value!)).toEqual(creds)
    const bad = await saveCredentials(memoryStore(null, true), creds)
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.reason).toContain("no keyring")
    expect((await saveCredentials(null, creds)).ok).toBe(false)
  })
})

describe("snapshot cache", () => {
  const snap: Snapshot = {
    version: 1,
    user: "student@dypatil.edu",
    savedAt: 1_790_000_000_000,
    attendance: { batch: "CSE-2023-A", semester: "Semester 5", subjects: [] },
    courses: [{
      course: { id: "812", name: "Data Structures", url: "https://x" },
      assignments: [{ name: "A3", url: "https://x/a", dueText: null, due: new Date(2026, 8, 30, 23, 59), submissionStatus: null, gradingStatus: null, grade: null, timeRemaining: null, submitted: false }],
    }],
  }
  test("round trip revives dates", async () => {
    await saveSnapshot(dirs, snap)
    const loaded = await loadSnapshot(dirs, "student@dypatil.edu")
    expect(loaded?.courses[0]?.assignments?.[0]?.due).toEqual(new Date(2026, 8, 30, 23, 59))
    expect(loaded?.attendance?.semester).toBe("Semester 5")
  })
  test("file name does not contain the username", () => {
    expect(snapshotPath(dirs, "student@dypatil.edu")).not.toContain("student")
  })
  test("missing or foreign files load as null", async () => {
    expect(await loadSnapshot(dirs, "nobody@x")).toBeNull()
    await mkdir(dirs.cache, { recursive: true })
    await writeFile(snapshotPath(dirs, "old@x"), JSON.stringify({ version: 0 }))
    expect(await loadSnapshot(dirs, "old@x")).toBeNull()
  })
})
