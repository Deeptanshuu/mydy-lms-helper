export interface Credentials {
  username: string
  password: string
}

export interface SecretStore {
  get(o: { service: string; name: string }): Promise<string | null>
  set(o: { service: string; name: string; value: string }): Promise<void>
  delete(o: { service: string; name: string }): Promise<boolean>
}

const KEY = { service: "mydy-lms-helper", name: "credentials" }

export async function loadCredentials(
  env: Record<string, string | undefined>,
  store: SecretStore | null,
): Promise<{ creds: Credentials | null; source: "env" | "keychain" | null }> {
  if (env.MYDY_USERNAME && env.MYDY_PASSWORD) {
    return { creds: { username: env.MYDY_USERNAME, password: env.MYDY_PASSWORD }, source: "env" }
  }
  if (store) {
    try {
      const raw = await store.get(KEY)
      const value = raw ? JSON.parse(raw) : null
      if (typeof value?.username === "string" && typeof value?.password === "string") {
        return { creds: { username: value.username, password: value.password }, source: "keychain" }
      }
    } catch {
      // unreadable keychain entry: treat as absent
    }
  }
  return { creds: null, source: null }
}

export async function saveCredentials(store: SecretStore | null, creds: Credentials): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!store) return { ok: false, reason: "This system has no keychain available, so you'll be asked to sign in next time." }
  try {
    await store.set({ ...KEY, value: JSON.stringify(creds) })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: `Couldn't save to the system keychain (${(e as Error).message}). You'll be asked to sign in next time.` }
  }
}

/** Bun.secrets (macOS Keychain, libsecret, Windows Credential Manager), or null if this Bun lacks it. */
export function bunSecretStore(): SecretStore | null {
  const secrets = (Bun as unknown as { secrets?: SecretStore }).secrets
  return secrets ? { get: (o) => secrets.get(o), set: (o) => secrets.set(o), delete: (o) => secrets.delete(o) } : null
}
