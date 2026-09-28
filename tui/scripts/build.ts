#!/usr/bin/env bun
// bun scripts/build.ts        builds a binary for the current platform
// bun scripts/build.ts --all  builds every released platform (for CI)
import solidPlugin from "@opentui/solid/bun-plugin"

const ALL_TARGETS: Bun.Build.CompileTarget[] = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-windows-x64",
]

const PLATFORM: Record<string, string> = { darwin: "darwin", linux: "linux", win32: "windows" }

function localTarget(): Bun.Build.CompileTarget {
  const os = PLATFORM[process.platform] ?? process.platform
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  return `bun-${os}-${arch}` as Bun.Build.CompileTarget
}

async function build(target: Bun.Build.CompileTarget): Promise<void> {
  const [, os, arch] = target.split("-")
  const outfile = `./dist/mydy-${os}-${arch}${os === "windows" ? ".exe" : ""}`
  console.log(`Building ${target} -> ${outfile}`)

  const result = await Bun.build({
    entrypoints: ["./src/index.tsx"],
    target: "bun",
    plugins: [solidPlugin],
    compile: {
      target,
      outfile,
      autoloadBunfig: false,
      autoloadDotenv: false,
    },
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
}

const targets = process.argv.includes("--all") ? ALL_TARGETS : [localTarget()]

try {
  for (const target of targets) await build(target)
} catch (e) {
  console.error(e)
  process.exit(1)
}
