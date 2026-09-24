# Post-overnight critiques: seven items to triage

**Status: musings, not a plan.** Mark's list from playing the overnight
build (Plans 7b/9/13d), 2026-09-24. Each item below has been checked against
the actual code/history before writing anything down — several turned out
to already have a diagnosis or a directly relevant prior decision on record.
Nothing here is scheduled. Going through this together decides what becomes
a real plan, in what order, and (per §7 of the render-quality musings this
doc leans on) several of these share the same underlying "start menu"
surface, so the order matters.

---

## 1. Trees disappear once flying — likely already diagnosed, unresolved

**This matches a known, root-caused issue from 2026-09-20**, not a new bug:
[`project-ww2airsim-low-tier-hides-trees`]. Measured in Mark's own real
Chrome (not the Tier 2 harness, which never sees it — vsync'd GPU clocks
down and reads the same scene ~3x faster): a one-time quality probe
(`adaptOceanQuality`, on the title screen) reads **11.1 ms at 1440p**
since 16a's clouds landed, picks the `low` tier, and `SCENERY_TIERS.low.
treeFadeEndM = 0` draws zero trees — for the entire flight, decided once,
before Start is even pressed. That exactly matches "I see them from
Tacloban on the ground but they disappear once the propeller starts": the
probe runs, downgrades silently, and nothing after that point ever
re-measures.

Four options were already on the table 2026-09-20, undecided:
1. **Make the downgrade visible** (an indicator, so at least it's not
   silent).
2. **Measure after Start, not on the title screen** — avoids contending
   with the title screen's own render load, closer to steady-state.
3. **Decouple trees from the ocean tier** — give `low` a reduced forest
   instead of zero.
4. **Raise the low-tier threshold** — stop downgrading a scene that's
   actually fine.

Worth folding into item 4 below regardless: if a start-screen quality
selector happens, a persisted/explicit choice replaces the silent
auto-probe outright, which is option "5" nobody wrote down in September
because localStorage didn't exist in `src/` yet — **it does now** (Plan 9
added it for the roster). That changes the calculus.

## 2. Start-screen UI needs a fresh look

Current `src/render/titleScreen.ts` is 490 lines of hand-built DOM (native
`<button>`s, no framework) — functional (scenario/loadout/roster pickers
all work, keyboard-first) but was built incrementally across several plans
(9 most recently, which bolted a roster step onto the existing scenario/
loadout flow) rather than designed as one screen. "Needs a fresh look" is a
real, standalone design question — worth deciding whether it's a visual
pass on the existing structure or a rebuild, and that decision should
probably happen *after* item 4 (arcade/realistic selector) and the render-
quality musings' own open question 3 ("does the start menu exist at all,
or do quality options live in the `/` panel with the other controls?") are
settled, since both would land new controls on this same screen.

## 3. Pursuit AI is too strong

Likely not a balance bug so much as a default: `content/scenarios/
pursuit-range.json` — the only scenario with a named scripted opponent —
sets `pursuer-1` to **`"skill": "veteran"`**, Plan 7b's hardest preset:

| | `VETERAN_SKILL` | `GREEN_SKILL` |
| --- | --- | --- |
| `reactionS` | 0.3 (near-instant) | 1.0 |
| `gunneryAccuracy` | 0.6 (**narrower/more accurate** gun cone — lower is better for the AI, counter-intuitively named) | 1.0 (widest cone) |
| `energyDiscipline` | 0.7 | 0.3 |
| `disengageThreshold` | -400 (holds the fight much longer) | -150 |

So the one scenario that exists today is, by construction, flying against
the sharpest opponent the plan shipped — near-instant reactions, the
tightest gun cone, and a pilot that won't disengage until badly damaged.
Cheapest lever: flip `pursuit-range.json` to `"green"`, or add a scenario
variant at each tier. Separately worth asking: is "I can't get behind that
pilot" about the AI's *maneuvering* (Pursue/Extend/Break scoring itself)
being too optimal regardless of skill, or specifically about the veteran
preset's numbers? The two have very different fixes — a scenario content
change vs. a scoring-weight change — and only flying the `green` preset
head-to-head would tell them apart.

## 4. G-force/strain damage: add an arcade/realistic toggle

The mechanic exists and is fully implemented: `src/sim/damage/overload.ts`
tracks `loadFactorG`/`peakLoadFactorG` against each aircraft's
`StructuralLimits.gLimit` (and a dive-speed limit) every tick, flagging
`overG`/`overspeed`. It's driven by real physics (proper acceleration minus
gravity), not a fudge — the "arcade" ask is specifically to be able to
*disable* it, not to fix a bug in it.

This is the same surface the render-quality musings document (2026-09-18,
§5.2 and §7) already raised and left open: **"does a start menu exist," a
persisted quality-tier choice, and the observation that nothing in `src/`
used `localStorage` at the time.** Both blockers it named are gone now —
Plan 9 built a title-screen roster step and `localStorage` persistence
(`src/render/roster.ts`) for an unrelated reason, but the mechanism (a
title-screen choice that survives reload) is exactly what an arcade/
realistic toggle needs. Concretely this becomes: a `PilotRecord`- or
session-level flag, a title-screen selector next to (or combined with)
whatever item 2's redesign does, and `overload.ts`'s call sites gated on
it. Small in code terms; the open question is entirely UI placement,
which is why items 2, 3's numbers, and this one probably want to be
designed as one pass over the title screen rather than three separate
patches to it.

## 5. Aircraft roster expanded in the design doc

Already merged (`f65b577`, "added more aircraft" — pushed from a separate
checkout, merged into `main` cleanly alongside tonight's work). Master spec
§9's roster table now lists 11 aircraft instead of 5 (Wildcat, Corsair,
B-29, Val, Oscar, and Sally added to the existing Hellcat/P-38/B-17/Zero/
Frank/Betty set), each tagged player-flown/friendly-AI/hostile. The table's
own header note still applies — **"mirrors the original's and should be
confirmed against a primary source before art work begins; it currently
derives from a secondary summary."** Only one aircraft (`f6f-hellcat.json`)
has actual `content/aircraft/` data today; the rest of the roster is
currently names and roles only, no flight model, no geometry. Worth noting
a few of the new entries have typos in the design doc itself (`f4F` should
read `F4F`, "Playfer-flown"/"firendly"/"fitgher" are typos, "Mitsubishi
K-21 Sally" — the real aircraft is the **Ki-21**, not K-21, an easy
transcription slip) — small, but worth fixing before this table is treated
as a spec other plans build from.

## 6. Better aircraft rendering — real 3D models

Today's F6F is 138 lines of hand-built primitive geometry (boxes,
cylinders) in `src/render/scene/hellcat.ts` — master spec §10 explicitly
allows this as one of exactly two options: "either verifiable-licence
assets or deliberately simple models built by hand." The Sketchfab model
Mark found is a real example of why the *other* option is hard: most
Sketchfab uploads carry a "Standard" license (personal/non-commercial,
attribution required, often no redistribution of the model file itself) —
`ASSETS.md`'s own opening line is blunt about why this repo cares: "the
repo is public and AGPL-3.0, so unverifiable asset provenance is the
project's main legal exposure — free model sites are riddled with license
laundering." That gate already blocked Plan 15 Task 1 once (audio) until
Mark confirmed provenance by hand. The real options, in order of least to
most work:
1. **Better hand-built low-poly geometry** — no licensing question at all,
   same category as today's model, just more detail/segments/materials.
   This is also the only option compatible with item 7 (gear/flaps need
   *rigged, moving parts*, which a licensed static mesh may or may not
   have set up as separate objects — hand-built geometry can be built with
   exactly the joints needed).
2. **A CC0-licensed model**, if one that's actually CC0 (not
   "free to view," not "personal use") turns up — rare for WW2 warbird
   models specifically, worth a real search pass before assuming one
   exists.
3. **Commission or build one from a primary-source drawing** (a
   3-view/blueprint), which sidesteps the licensing question entirely at
   the cost of real modeling effort.

Recommend deciding this alongside item 7, since gear/flap animation is
much cheaper to build into a purpose-built low-poly model (option 1) than
to retrofit onto an arbitrary downloaded mesh.

## 7. Visible, animating landing gear and flaps

**The physics already fully model this** — `gearFraction`/`flapFraction`
are continuous `[0,1]` state on every `AircraftState`
(`src/sim/flight/state.ts`), driven by real travel-time/drag/lift numbers
from each aircraft's content schema (`src/sim/flight/schema.ts`'s `gear`/
`flap` objects). This is purely a rendering gap, not a simulation one:
`hellcat.ts` has no gear or flap geometry at all today, so there is nothing
to animate regardless of how the physics reports the fraction. Once item 6
picks a modeling approach, wiring gear/flap fraction to a rotation/
translation on two or three extra Object3D nodes is small — the hard part
is the model having separate movable parts to drive in the first place,
which is exactly why this pairs with item 6 rather than standing alone.

## 8. "Is our GPU budget quite constrained?" — no, headroom is large

Answered directly by the render-quality musings doc (2026-09-18, still
current) and reconfirmed by tonight's own Plan 13d frame-time measurement:

| | gpu p95 | % of 60 Hz budget (16.67 ms) |
| --- | --- | --- |
| 2026-09-18 baseline | 5.177 ms | 31% |
| Tonight (Plan 13d, after the 8x mask increase) | 3.055 ms | 18% |

Frame time has never been the binding constraint and still isn't —
tonight's plan added real per-frame cost (a road/river mask read, a merged
town-hut mesh) and the number went *down*, most likely a less-loaded
reference machine rather than a real improvement, but either way there is
roughly **3-5x of GPU time currently unspent**. The musings doc's own
answer to "what actually limits realism" was **content, not budget**: no
real ground textures at all (`surface.ts` is 100% procedural value noise),
terrain shipped at L2 resolution with L1/L0 already built on disk but not
shipped (a download-size decision, not a render-time one), and — as of
tonight — hand-built primitive aircraft geometry. Shadows, atmospheric
scattering, tonemapping/bloom/TAA, and restoring the tree density that got
traded away for the cloud pass are all listed there as "costs GPU time
that already exists; no download" — i.e., available without touching the
budget question at all. **This item and items 6/7 are really the same
question** ("make it look better") with the musings doc's own §7 open
questions (download ceiling, minimum target hardware, KTX2-vs-PNG) still
unanswered and still gating anything that adds a real texture/model
download.

---

## How these cluster

Three groups, not seven independent items:

- **The title screen** (2, 3's difficulty framing if a per-flight selector
  is wanted, 4, and possibly 1's fix) — one design pass, not four patches.
- **Visual fidelity** (6, 7, 8, and 1 if the fix is "give low a real
  forest") — gated on the render-quality musings' still-open questions
  (download ceiling, target hardware, KTX2-vs-PNG) before any real asset
  work starts.
- **Standalone, cheap, no dependencies**: 3's scenario-content fix (flip
  `pursuit-range.json` to a lower skill, or add a tier variant) and 5's
  typo fixes in the design doc.
