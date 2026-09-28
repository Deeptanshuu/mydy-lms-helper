import { useKeyboard, usePaste } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import { slot } from "../icons"
import { color } from "../theme"
import { useApp } from "./context"
import { center, Line, type Seg } from "./Line"

const WIDTH = 40
type Field = "email" | "password" | "remember" | "submit"
const FIELDS: Field[] = ["email", "password", "remember", "submit"]

export function SignIn() {
  const { store, nerd, services } = useApp()
  const s = store.state
  const [email, setEmail] = createSignal(s.user ?? "")
  const [password, setPassword] = createSignal("")
  const [remember, setRemember] = createSignal(true)
  const [field, setField] = createSignal<Field>(s.user ? "password" : "email")
  const [hint, setHint] = createSignal<string | null>(null)

  const move = (step: number) => setField((f) => FIELDS[(FIELDS.indexOf(f) + step + FIELDS.length) % FIELDS.length]!)
  const submit = () => {
    if (s.signingIn) return
    if (!email().trim() || !password()) {
      setHint("Enter your email and password.")
      return
    }
    setHint(null)
    services.signIn(email().trim(), password(), remember())
  }

  useKeyboard((k) => {
    if (s.phase !== "signin") return
    if (k.name === "tab") return move(k.shift ? -1 : 1)
    if (k.name === "down") return move(1)
    if (k.name === "up") return move(-1)
    if (k.name === "return") return submit()
    if (field() === "remember" && k.name === "space") return setRemember((r) => !r)
    // The password is drawn as dots, so its keys are handled here rather than by an <input>.
    if (field() === "password") {
      if (k.name === "backspace") setPassword((p) => p.slice(0, -1))
      else if (!k.ctrl && !k.meta && k.sequence.length === 1 && k.sequence >= " ") setPassword((p) => p + k.sequence)
    }
  })

  usePaste((e) => {
    if (s.phase !== "signin" || field() !== "password") return
    e.preventDefault()
    setPassword((p) => p + new TextDecoder().decode(e.bytes).replace(/[\r\n]/g, ""))
  })

  const error = () => s.signInError ?? hint()
  const label = (text: string, f: Field): Seg[] => [{ text, fg: field() === f ? color.strong : color.muted }]

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color.bg}>
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <box flexDirection="column" width={WIDTH}>
          <Line segs={[{ text: slot("app", nerd), fg: color.accent }, { text: "MyDy", fg: color.strong, bold: true }]} />
          <Line segs={[{ text: "Sign in with your MyDy account", fg: color.muted }]} />
          <box height={1} />
          <Line segs={label("Email", "email")} onMouseDown={() => setField("email")} />
          <input
            onMouseDown={() => setField("email")}
            focused={field() === "email"}
            value={email()}
            onInput={(v: string) => setEmail(v)}
            placeholder="you@dypatil.edu"
            width={WIDTH}
            backgroundColor={color.panel}
            focusedBackgroundColor={color.panel}
            textColor={color.text}
            focusedTextColor={color.strong}
            placeholderColor={color.muted}
          />
          <box height={1} />
          <Line segs={label("Password", "password")} onMouseDown={() => setField("password")} />
          <Line
            onMouseDown={() => setField("password")}
            bg={color.panel}
            segs={[{ text: "•".repeat(password().length), fg: color.strong }, { text: field() === "password" ? "▏" : "", fg: color.accent }]}
          />
          <box height={1} />
          <Line
            onMouseDown={() => {
              setField("remember")
              setRemember((r) => !r)
            }}
            segs={[
              { text: slot(remember() ? "marked" : "unmarked", nerd), fg: remember() ? color.accent : color.muted },
              { text: "Remember me on this computer", fg: field() === "remember" ? color.strong : color.text },
            ]}
          />
          <box height={1} />
          <Line
            onMouseDown={submit}
            bg={field() === "submit" ? color.strong : color.accent}
            segs={[{ text: center(s.signingIn ? "Signing in…" : "Sign in", WIDTH), fg: color.onAccent, bold: true }]}
          />
          <box height={1} />
          <Show when={error()}>
            {(message) => <Line segs={[{ text: slot("alert", nerd), fg: color.low }, { text: message(), fg: color.low }]} />}
          </Show>
        </box>
      </box>
      <Line
        bg={color.bar}
        paddingX={2}
        segs={[
          { text: "tab", fg: color.accent }, { text: " next field   ", fg: color.muted },
          { text: "space", fg: color.accent }, { text: " toggle   ", fg: color.muted },
          { text: "enter", fg: color.accent }, { text: " sign in   ", fg: color.muted },
          { text: "ctrl+c", fg: color.accent }, { text: " quit", fg: color.muted },
        ]}
      />
    </box>
  )
}
