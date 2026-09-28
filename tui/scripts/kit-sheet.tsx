// A style sheet of the design kit, rendered by scripts/preview.tsx as 00-kit.
import { color } from "../src/theme"
import { useApp } from "../src/ui/context"
import { Body, Caption, Card, Display, Eyebrow, Gap, keySegs, Meter, statusPill, StatTile, Title, tileWidths } from "../src/ui/kit"
import { Line } from "../src/ui/Line"

export function KitSheet() {
  const { nerd } = useApp()
  const w = tileWidths(112, 4)
  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color.bg} paddingX={4} paddingY={1}>
      <Display text="MyDy" color={color.accent} />
      <Gap />
      <Title text="Data Structures and Algorithms" width={80} bar />
      <Caption text="Semester 5 · Prof. R. Sharma · 5 files, 4 assignments" />
      <Gap />
      <Eyebrow text="Attendance" width={112} count={4} />
      <Gap />
      <Body text="Body copy sits in the text ink, one step below the title." />
      <Caption text="Captions are muted: the secondary fact." />
      <Caption text="Hints are faint: key hints, placeholders, units." faint />
      <Gap />
      <box flexDirection="row" columnGap={2}>
        <StatTile label="Attendance" value="82%" caption="3 of 4 above 75%" tone="ok" meter={{ ratio: 0.82, threshold: 0.75 }} width={w[0]!} />
        <StatTile label="Due this week" value="2" unit="due" caption="next: tomorrow 23:59" captionTone="warn" width={w[1]!} />
        <StatTile label="At risk" value="1" unit="course" caption="Engineering Maths III" captionTone="low" tone="low" meter={{ ratio: 0.46, threshold: 0.75 }} width={w[2]!} />
        <StatTile label="Grade" value="51/70" caption="73% course total" tone="accent" meter={{ ratio: 0.73 }} width={w[3]!} />
      </box>
      <Gap />
      <box flexDirection="row" columnGap={2}>
        <Card title="Meters" width={54} paddingY={1}>
          <Meter ratio={0.93} width={40} tone="ok" threshold={0.75} />
          <Gap />
          <Meter ratio={0.72} width={40} tone="warn" threshold={0.75} />
          <Gap />
          <Meter ratio={0.46} width={40} tone="low" threshold={0.75} style="line" />
          <Gap />
          <Meter ratio={0.88} width={40} tone="ok" threshold={0.75} style="line" />
        </Card>
        <Card title="Pills & keys" width={56} paddingY={1} focused>
          <Line segs={[...statusPill("on track", "ok", nerd), { text: "  " }, ...statusPill("close", "warn", nerd), { text: "  " }, ...statusPill("at risk", "low", nerd), { text: "  " }, ...statusPill("2 due", "accent", nerd)]} />
          <Gap />
          <Line bg={color.bar} segs={[...keySegs("enter", "open", nerd), { text: "   " }, ...keySegs("space", "mark", nerd), { text: "   " }, ...keySegs("?", "help", nerd)]} />
        </Card>
      </box>
    </box>
  )
}
