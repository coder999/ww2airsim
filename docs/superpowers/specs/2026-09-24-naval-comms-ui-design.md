# Naval Communications UI — visual redesign design

**Status: approved design, 2026-09-24.** Resolves critique item #2 ("the
main start game screen UI is bad and not intuitive and needs a fresh
look") via a parallel prototype Mark built independently:
`design-prototypes/telegram-ui/` — a full static HTML/CSS mockup of a
"WWII naval personnel record / after-action report" visual language
(letterhead, rubber stamps, ruled tables, a hand-drawn seal, typewriter/
stencil fonts), covering all three of roster, debrief, and settings.
Nothing in that directory is wired to `src/`; this spec is how it gets
ported in, not a restatement of the prototype file-by-file.

**Depends on** `2026-09-24-render-quality-selector-design.md` (the
Settings dialog's functional content: Render Quality Simple/Advanced,
Asset Quality, and `2026-09-24-visual-realism-pass-design.md`'s Damage
Model/G-force row) and Plan 9's already-shipped `roster.ts`/`titleScreen.ts`
/`debrief.ts`. This spec changes **how those screens look and are
structured in the DOM**, not what data they show or what choices they
offer — those stay exactly as already specified/shipped.

## 1. What ports, and what doesn't

**Confirmed with Mark, 2026-09-24**: three things in the prototype are
illustrative filler, not real requirements, and must **not** be built:

- The settings mockup's **Save/Cancel batch-apply pattern**. The render-
  quality-selector spec's decision stands unchanged: every control applies
  immediately on click/selection, no confirm step, no Cancel that discards
  a change. Port the prototype's *visual* button styling (`.ink-button`)
  if a button is needed anywhere (e.g. "New Pilot," "Return to Title"),
  not its Save/Cancel *interaction model*.
- The settings mockup's **audio volume slider and joystick/mouse control-
  -scheme picker**. Neither is a real feature; do not build them. If a
  real audio or input-scheme settings feature is ever wanted, it gets its
  own spec later — this document does not create that scope by having
  shown an example of it.
- The settings mockup's **specific copy and quality-tier count** (a single
  Low/Medium/High radio group, descriptions mentioning "shadow range,"
  which doesn't exist in this game). The prototype is a *visual* example;
  the actual settings screen's real content is exactly what
  `2026-09-24-render-quality-selector-design.md` and
  `2026-09-24-visual-realism-pass-design.md` §1 already specify (Render
  Quality's Simple row + Advanced per-system rows, the separate Asset
  Quality axis, the Damage Model/G-force row) — restyled into this visual
  language, not replaced by the mockup's simplified stand-in.

**What genuinely ports**: the whole `assets/telegram.css` design system
(palette, letterhead, ruled `.form-table`, the `.ballot-option`/`.ballot-
-box` radio pattern, `.stamp` variants, `.ink-button`), and the concrete
page structure of `roster.html`/`debrief.html` (which already track the
real data model closely — the roster table's columns match `PilotRecord`
almost exactly, and the debrief's outcome switcher already matches the
real 3-value `landed`/`ditched`/`killed`).

## 2. Scope: all three screens

Confirmed, 2026-09-24 — matches the prototype's own README scope, not a
narrower "just settings" cut:

1. **Roster** — the prototype's README names `src/render/roster.ts` as the
   port target; that's not quite right and worth correcting here so an
   implementer doesn't go looking in the wrong file: `roster.ts` is the
   pure data/`localStorage` module (`PilotRecord`, `loadRoster`,
   `startSortie`, etc.), no DOM. The actual roster **UI** — the step that
   currently renders above the scenario/loadout pickers — lives in
   `src/render/titleScreen.ts`. That is the real port target.
2. **Debrief** — `src/render/debrief.ts`'s `createDebrief(root, onRestart)`
   does own its DOM construction directly (confirmed by reading the file:
   `document.createElement` calls build the whole overlay panel) — the
   README's reference here is accurate.
3. **Settings** — the dialog designed in
   `2026-09-24-render-quality-selector-design.md` §6, also in
   `titleScreen.ts` per that spec. Did not exist as a screen before that
   spec; this document only restyles it.

Scenario and loadout picker steps (the rest of `titleScreen.ts`) are
**not** in scope — the prototype doesn't cover them, and Mark's scope
confirmation was "all of the above" against the three screens listed,
not an expansion beyond them. A follow-up could extend this visual
language to those steps later; that's a new decision, not implied here.

## 3. Concrete porting plan per screen

**Roster** (`titleScreen.ts`'s roster step): swap the current native-
-button list for `roster.html`'s `.sheet`/`.letterhead`/`.form-table`
structure, real data substituted for the mockup's example rows
(`HARTWELL, J. R.` etc.) — real pilot name, rank (from the existing
10-tier ladder), score, sorties, kills, and status (`active`/`kia`).
Row selection (today: presumably a click/keyboard-selected state) maps to
the mockup's `.row-selected` class. Pilot creation (today: an inline form,
per Plan 9's handoff) needs a `.typed-input`-styled text field in the same
visual language — the mockup doesn't show this exact case since it only
ever displays an existing roster, so this is new composition within the
existing design system, not a 1:1 port.

**Debrief** (`debrief.ts`'s `createDebrief`): swap the current DOM
construction for `debrief.html`'s `.routing` (From/To/DTG/Precedence)
header, `.form-section-title`/figure-row flight stats, `.form-table`
targets-destroyed breakdown, and the outcome `.stamp` (blue/red/etc.
variant keyed off `landed`/`ditched`/`killed`, matching the mockup's
`outcome-switch` demo but driven by the real `DebriefModel.outcome`, not a
UI toggle — a player never chooses their own outcome). The final review's
fix (recovery multiplier, banked total, promotion notice all rendered) all
needs a home in this new layout — likely additional `.figure-row` entries
in the Flight Figures section, an implementation-level layout call.

**Settings** (`titleScreen.ts`'s new Settings dialog): `.ballot-option`/
`.ballot-box` for every Simple/Advanced/Asset-Quality/Damage-Model radio
row (the pattern already implements `role="radio"`/`aria-checked`/
`tabindex="0"`/keyboard Enter-Space activation in the prototype's own JS,
which already matches this title screen's existing keyboard-first
convention — no accessibility regression from the restyle). The
`(Recommended)` tag becomes a `.stamp--violet` stamp exactly as the mockup
shows, attached to whichever tier the GPU probe actually recommends (not
hardcoded to "Medium" the way the mockup's static example is). "Advanced
▸" stays a disclosure toggle, styled as an `.ink-button` rather than
invented from scratch. "Reset to auto-detect" is an `.ink-button` too.

## 4. What does not port

- `.proto-nav` (the "← index | settings.html" breadcrumb) — prototype-
  -review chrome only, not part of the real game.
- The prototype's stray decorative examples the styleguide calls out as
  non-mapping to real state (e.g. a "P.O.W." stamp) — don't invent a real
  status to justify keeping a stamp that was only ever a palette example.
- The four `.html` files and `design-prototypes/` directory themselves —
  once ported, they stay as historical reference (not deleted, matching
  this repo's general "git remembers, don't delete working reference
  material for no reason" discipline), but nothing in `src/` imports them.

## 5. Font hosting (a real open item the prototype itself flagged)

The prototype pulls Special Elite (body/typewriter) and Stardos Stencil
(headers/stamps) from Google Fonts at runtime — fine for a static review
mockup, explicitly flagged in the prototype's own README as "worth
revisiting (self-host or swap) before any of this lands in the real
game." **Judgment call**: self-host both font files (download once,
commit under an `ASSETS.md`-tracked path like the existing audio/scenery
content, matching this project's general no-external-runtime-dependency
posture — a game that otherwise fetches nothing from a third party at
play time except OSM-derived content already baked into a build step
should not gain a live Google Fonts dependency for two typefaces).
Flagging this for Mark's review since it's a judgment call, not a
measured fact.

## 6. What this spec deliberately does not do

- No new settings *content* — every control's existence, tier count, and
  copy comes from the specs this one depends on, not from the mockup.
- No audio, input-scheme, or any other settings row beyond what's already
  specified elsewhere (§1).
- No change to the scenario/loadout picker steps (§2).
- No change to `roster.ts`/`debrief.ts`'s actual data model or scoring
  logic — this is presentation only.

## 7. Testing

**Tier 1**: existing `roster.test.ts`/`debrief.test.ts`/`titleScreen.test.ts`
coverage continues to pass — this is a restyle, and the DOM query
selectors those tests use will need updating to match new class names/
structure, but the *behavior* they assert (what data shows, what a click
does) should not change. Any test that breaks because of a genuine
behavior change (not just a selector change) is a signal something in
this "presentation only" scope got exceeded — worth a second look before
just fixing the test.

**Tier 2**: real-GPU screenshots of all three redesigned screens, read
directly, confirming the letterhead/stamp/table rendering looks correct
inside the actual title-screen DOM overlay (a static HTML file opened
directly and this game's own overlay-over-WebGPU-canvas context are not
guaranteed to composite identically — worth confirming for real, not
assuming a static mockup ports pixel-perfect).

## 8. Open items for the implementation plan, not this spec

- Exact `.typed-input` composition for the roster's new-pilot form (§3) —
  the mockup has no matching example to copy verbatim.
- Where the recovery-multiplier/banked-total/promotion fields land within
  debrief's new Flight Figures layout (§3) — a layout decision, not a
  data one.
- Self-hosted font file sourcing/licensing (Special Elite and Stardos
  Stencil are both Google Fonts-hosted **open-source** faces — likely
  OFL-licensed, which permits self-hosting/redistribution, but confirm
  the exact license and add the `ASSETS.md` row before committing the
  font files, same gate every other asset in this repo passes through).
