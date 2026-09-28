import { useKeyboard, usePaste, useTerminalDimensions } from "@opentui/solid"
import { createSignal, For, Show } from "solid-js"
import { fit } from "../format"
import { slot } from "../icons"
import { color, mix } from "../theme"
import { useApp } from "./context"
import { Dither, smoothstep } from "./Dither"
import { center, Line, type Seg } from "./Line"
import { Card, Display, Gap, keySegs, keyWidth, Title } from "./kit"

/** Card width, border and padding included. */
const CARD_WIDTH = 54
/** The primary button when it has the focus: the accent, a step brighter. */
const ACCENT_HOT = mix(color.accent, color.strong, 0.3)
/** Waves only toward the edges of the screen. */
const vignette = (u: number, v: number) => smoothstep(0.8, 1.6, Math.hypot((u - 0.5) / 0.3, (v - 0.5) / 0.36))

type Field = "email" | "password" | "remember" | "submit"
const FIELDS: Field[] = ["email", "password", "remember", "submit"]

export function SignIn() {
  const { store, nerd, services, animate } = useApp()
  const s = store.state
  const dims = useTerminalDimensions()
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

  // What fits: 3 = wordmark, tagline, 3-row fields; 2 = 1-row fields; 1 = wordmark only; 0 = just the card.
  const tier = () => (dims().height >= 34 ? 3 : dims().height >= 27 ? 2 : dims().height >= 22 ? 1 : 0)
  const width = () => Math.min(CARD_WIDTH, dims().width - 4)
  const inner = () => width() - 6
  const fieldRows = () => (tier() === 3 ? 3 : 1)

  const label = (text: string, f: Field): Seg[] => [{ text: text.toUpperCase(), fg: field() === f ? color.text : color.muted }]
  // A field is a raised strip; the one with the focus gets an accent bar down its left edge, nothing more.
  const bar = (f: Field) => <Line bg={color.raised} segs={[{ text: field() === f ? "▌ " : "  ", fg: color.accent }]} />
  const padRows = (f: Field) => (
    <Show when={fieldRows() === 3}>
      <Line bg={color.raised} segs={[{ text: field() === f ? "▌" : "", fg: color.accent }]} onMouseDown={() => setField(f)} />
    </Show>
  )
  // Footer hints; on a narrow terminal the space hint goes first, then tab. Enter and quit stay.
  const hints = () => {
    const all: Array<[string, string]> = [["tab", "next field"], ["space", "toggle"], ["enter", "sign in"], ["ctrl+c", "quit"]]
    const width = (ks: typeof all) => ks.reduce((n, [k, l], i) => n + (i ? 3 : 0) + keyWidth(k, l), 0)
    let out = all
    for (const drop of ["space", "tab"]) if (width(out) > dims().width - 4) out = out.filter(([k]) => k !== drop)
    return out
  }
  const submitLabel = () => (s.signingIn ? "Signing in…" : "Sign in")
  const buttonBg = () => (field() === "submit" ? ACCENT_HOT : color.accent)
  const buttonPad = () => (
    <Show when={fieldRows() === 3}>
      <Line bg={buttonBg()} segs={[]} onMouseDown={submit} />
    </Show>
  )

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color.bg}>
      {/* The website's dithered waves around the edges, fading to nothing well before the card. */}
      <Dither position="absolute" top={0} left={0} width="100%" height="100%" background={color.bg} strength={0.16} mask={vignette} animate={animate} fps={8} />
      <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
        <Show when={tier() >= 1}>
          <Display text="MYDY" color={color.accent} />
          <Show when={tier() >= 2}>
            <Gap />
            <Line segs={[{ text: "Attendance, deadlines and files, in one place", fg: color.faint }]} />
          </Show>
          <Gap />
        </Show>
        <Card width={width()} paddingY={tier() >= 1 ? 1 : 0}>
          <Title text="Sign in" width={inner()} />
          <Line segs={[{ text: "Sign in with your MyDy account", fg: color.muted }]} />
          <Gap />
          <Line segs={label("Email", "email")} onMouseDown={() => setField("email")} />
          {padRows("email")}
          <box flexDirection="row" height={1} flexShrink={0} backgroundColor={color.raised}>
            {bar("email")}
            <input
              onMouseDown={() => setField("email")}
              focused={field() === "email"}
              value={email()}
              onInput={(v: string) => setEmail(v)}
              placeholder="you@dypatil.edu"
              width={inner() - 2}
              backgroundColor={color.raised}
              focusedBackgroundColor={color.raised}
              textColor={color.text}
              focusedTextColor={color.strong}
              placeholderColor={color.faint}
            />
          </box>
          {padRows("email")}
          <Gap />
          <Line segs={label("Password", "password")} onMouseDown={() => setField("password")} />
          {padRows("password")}
          <Line
            onMouseDown={() => setField("password")}
            bg={color.raised}
            segs={[
              { text: field() === "password" ? "▌ " : "  ", fg: color.accent },
              password() ? { text: "•".repeat(password().length), fg: color.strong } : { text: field() === "password" ? "" : "your password", fg: color.faint },
              { text: field() === "password" ? "_" : "", fg: color.accent },
            ]}
          />
          {padRows("password")}
          {/* The error sits under the password and takes the row that would be blank, so nothing shifts when it appears. */}
          <Line
            segs={error() ? [{ text: fit(error()!, inner()).trimEnd(), fg: color.low }] : []}
          />
          <Line
            onMouseDown={() => {
              setField("remember")
              setRemember((r) => !r)
            }}
            segs={[
              { text: slot(remember() ? "marked" : "unmarked", nerd), fg: remember() ? color.accent : color.faint },
              { text: "Remember me on this computer", fg: field() === "remember" ? color.strong : color.text },
            ]}
          />
          <Gap />
          {buttonPad()}
          <Line
            onMouseDown={submit}
            bg={buttonBg()}
            segs={[{ text: center(submitLabel(), inner()), fg: color.onAccent, bold: true }]}
          />
          {buttonPad()}
        </Card>
      </box>
      <box flexDirection="row" columnGap={3} height={1} flexShrink={0} backgroundColor={color.bar} paddingX={2}>
        <For each={hints()}>{([key, text]) => <Line segs={keySegs(key, text, nerd)} />}</For>
      </box>
    </box>
  )
}
