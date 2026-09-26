# ww2airsim

A WWII Pacific air combat simulator that runs in the browser. Fly an F6F
Hellcat from carrier and land bases over a geographically real Leyte Gulf,
fight, and get back aboard — because your score does not count until you do.

Inspired by *Hellcats Over the Pacific* (Graphic Simulations, 1991) and its
*Missions at Leyte Gulf* expansion. Clean-room: no original code, assets, or
mission text. `ww2airsim` is a working title.

## Status

**Plans 1–5 implemented (2026-09-15; ocean branch).** A deterministic F6F Hellcat flight
model runs headlessly in Node under `src/sim/`, graded against cited
historical trial figures by the test-card harness in `tools/testcards/`, with
a golden-trajectory regression, a randomised soak, and CI (Plan 1). It is
flyable in the browser on a WebGPU renderer, with keyboard controls, a chase
and cockpit camera and a gauge panel (Plan 2). Three input assists — stall
limiter, auto-rudder and altitude hold — sit between the keyboard and the
simulation, each switchable in flight (Plan 3). And the water it flies over is
no longer empty: real Leyte Gulf is under it (Plan 4, below).

The sea now has deterministic, Beaufort-driven FFT waves, depth colour,
shallow-water attenuation and foam (Plan 5). See the
[ocean handoff](docs/handoff/2026-09-15-plan5-ocean.md) for GPU measurements,
visual comparisons and the remaining art-direction questions.

Ground and water contact now ends the flight (Plan 10, below). And the
airplane now starts **parked on a runway at Tacloban and takes off from it**
(Plan 11a): the ground is a surface it rolls on rather than one it falls
through. Gear that takes seconds to move and costs drag while it hangs out,
rolling friction and wheel brakes, a tailwheel that steers until the tail
comes up, and a visual strip draped over the real heightfield — running
north-south, because east-west through the airfield runs into the sea. The
graded historical take-off card measures that real ground now instead of a
pinned state, inside a tolerance tightened from 10% to 2%; read the
[handoff](docs/handoff/2026-09-16-plan11a-ground-handling.md) before trusting
that agreement, because it records exactly which of its inputs are guesses.
**And it lands again (Plan 11b).** Flaps, ground effect, and a lateral tire
force so the wheels go where they point rather than skidding — a taxi turn used
to reach 113.6° of sideslip and now reaches 2.7°. The flap lift increment is
*derived* from two figures in the same trial table rather than estimated, and
it is graded against the 84.5 mph landing-configuration stall that
`f6f-hellcat.json` carried for two plans flagged as unreachable. A scripted
approach autopilot (`tools/autopilot/approach.ts`) flies an approach into
Tacloban every commit and asserts the airplane comes to rest on the strip, so
the landing envelope is a number in CI rather than an impression: touchdown at
1.47 m/s and 38.4 m/s, 0.0 m off the centreline. Read the
[handoff](docs/handoff/2026-09-17-plan11b-landing.md) for every figure that is
still an estimate.

A first scenery pass now adds procedural beach, grass, jungle and rock
materials, mapped Binahaan and Daguitan river surfaces, nearby trees, and
Tacloban hangars, control tower, service apron and stores. These buildings
and trees are visual only; collision, combat, AI and the meta-game remain ahead. See the
[scenery handoff](docs/handoff/2026-09-18-scenery.md) for coverage and limitations.

**Plan 12 is now complete:** the scenario holds one carrier and two escorts
in San Pedro Bay, Tacloban and Dulag as airfield records, and a second,
chocked Hellcat on the Tacloban apron. The renderer draws every one of those
entities and the simulation advances them on one clock. The authoritative
status and remaining order are in [master spec §15](docs/superpowers/specs/2026-09-12-ww2airsim-design.md).
Mark reordered them on 2026-09-16 so that the ground under the airplane comes
before there is anybody to shoot at; plan numbers were deliberately NOT
reused, for the reason the next paragraph records. **Master spec §15 holds the
order and the argument for it**, and this paragraph does not restate either.

**Plan 6 combat and damage is complete for the current F6F:** the playable
gunnery slice landed 2026-09-19. Space
fires the Hellcat's six guns with real flight time and finite ammunition,
rounds hit other airplanes' hit zones and damage their structure and systems,
and `?scenario=gunnery-range` parks two training targets downrange at
Tacloban. Tracers, hit flashes, engine smoke, a combat readout and gun audio
read that state. The
[handoff](docs/handoff/2026-09-19-plan6-gunnery.md) records what was measured
and master spec §15 holds the status.

**Plan 6b's strike slice landed 2026-09-22:** bombs, rockets, a title-screen
loadout picker, stores hung under the wings, ship and airfield-structure
damage. Tier 1 is green and reference-GPU Tier 2 acceptance passes all five
strike cases at 1.758 ms p95 at 1440p. Torpedoes and structural-overload
damage were the remaining Plan 6 items at that handoff; see the
[handoff](docs/handoff/2026-09-22-plan6b-strike.md) for what was actually
measured and what is still open, and master spec §15 for the status.

**Plan 6c structural overload landed 2026-09-23:** the fixed-step simulation
derives proper load from consecutive aircraft states and airspeed from the wind
frame. Exceeding the F6F content limits continuously damages structure, with
`OVER-G` and `OVERSPEED` warnings, current and peak DEV diagnostics, and a
destruction debrief that reaches Restart. Tier 1 is green and the reference-GPU
flight measured 10.82 g, 220.19 m/s, and a 1.301 ms render-pass p95 at 1440p
with zero validation errors. Torpedoes are deferred until a second,
historically appropriate airframe exists; they do not block Plan 7 AI. See the
[handoff](docs/handoff/2026-09-23-plan6c-structural-overload.md).

**Plan 7a AI landed 2026-09-23**, corrected the same day after its own
whole-branch review: a pure proportional-derivative flight controller turns a
desired world velocity into the same `Controls` a human pilot supplies, and a
pursuit pilot predicts a bounded lead intercept and fires only within a
short-range gun cone. Every assigned pilot's controls are derived from one
start-of-tick snapshot before any aircraft steps, so controller cadence is
the fixed 60 Hz tick and reversing the aircraft array cannot change a
trajectory. The review found the gun gate and the steering disagreed on where
the nose was aimed — 1,002 rounds fired over 90 s, zero hits — and a
dead-astern target could silently command nothing; both are fixed and
covered by a new hits-not-just-shots test at both tiers.
`?scenario=pursuit-range` starts the player and one AI-flown F6F airborne
astern; on the reference GPU it turns onto a gun solution and lands a hit
within 24.3 s, at 0.860 ms render-pass p95 with zero validation errors. The
rest of the maneuver library, formation and landing AI remain Plan 7c. See
the [handoff](docs/handoff/2026-09-23-plan7a-ai-pursuit.md).

**Plan 7b energy-aware maneuvering landed 2026-09-23.** An AI pilot now
chooses between three maneuvers — Pursue, Extend, Break — rescored on a
per-skill cadence (`PilotSkill`: reaction delay, gunnery accuracy, energy
discipline), instead of flying one script forever. A
`MIN_ENGAGEMENT_RANGE_M` (120 m) override forces a break-off before
point-blank range, closing the pass-through gap 7a's own review had
declined to fix. On the reference GPU, `pursuer-1` (now `VETERAN_SKILL`)
closes under 120 m, never comes closer than 50 m, and opens range
afterward, at 0.861 ms render-pass p95 with zero validation errors. See the
[handoff](docs/handoff/2026-09-23-plan7b-combat-depth.md) for the three
formula bugs the overnight run found and fixed along the way.

**Plan 7d AI pursuit difficulty landed 2026-09-24.** A `green`-skill pursuer
now steers against a stale snapshot of the target captured at its last
rescore rather than live ground truth, and applies deterministic,
skill-scaled jitter (`controlNoise`) to its final roll/pitch/yaw — closing
the gap Mark's own play found: "I can't ever get behind that pilot," true
even at the easiest preset. A scripted hard-break-and-reversal now genuinely
gets behind `pursuer-1` at `green` skill within a bounded window on the
reference GPU (23.6 s, gpu p95 1.616 ms, player confirmed alive when it
happens — not a frozen corpse's stale geometry). The final review found the
acceptance spec's own geometry helper had been exactly inverted (it passed
when the pursuer had the player in its own gun cone) and fixed it with a new
Tier 1 unit suite deriving the bearing convention from the app's actual
heading construction rather than hand-picking it. Re-running Tier 2 broadly
also surfaced that `ai-maneuver.spec.ts`'s point-blank break-off gate is now
red — the veteran pursuer kills a passive player before that range is
reached — left as an open gameplay-balance decision rather than forced
green. See the
[handoff](docs/handoff/2026-09-24-plan7d-ai-pursuit-difficulty.md) for both.

**Plan 7c AI safety envelope and maneuver library is complete and merged to `main` (2026-09-26).** Its two merge blockers and the low-target finding were resolved by Mark's decisions of 2026-09-26. AI pilots can no longer overload their own airframe, fly into the sea or over-speed, and an AI Zero no longer cuts its own engine under negative g. A pursuing AI chases a low target down to 50 ft above the ground, and no lower. After a missed head-on pass the pursuer now turns back and fights again, where before it flew away for good. Veterans fly the named maneuvers (yo-yos, lag pursuit, attack run, scissors, split-S, Immelmann; an AI Zero flies no Immelmann), and greens fly only 7b's basic set, so they are easy to beat. The veteran was toned down per Mark's ruling. See the [handoff](docs/handoff/2026-09-26-ai-7c.md); master spec §15 holds the status.

**The A6M Zero flies, headless (Z2, 2026-09-25):**
`content/aircraft/a6m2-zero.json` is graded against the 1942 Navy trial of a
captured A6M2. Its controls stiffen above 250 mph, its engine cuts out under
negative g, and it carries two 7.7 mm guns and two 20 mm cannon with their own
ballistics. It appears in no shipped scenario yet. See the
[handoff](docs/handoff/2026-09-25-z2-zero-flight-model.md); master spec §15
holds the status.

**Missions have an engine, headless (M1, 2026-09-25):** a scenario that
declares objectives now runs them in the sim every tick. There are seven
objective kinds, triggers that fire once, and held groups that enter
mid-flight, and only a landing at a named base earns a badge. No shipped
scenario uses it until M3, and nothing shows it until M2. See the
[handoff](docs/handoff/2026-09-25-m1-mission-engine.md); master spec §15
holds the status.

**Plan 17 radar landed 2026-09-23.** The cockpit panel's reserved `radar`
slot now shows a rotating, heading-up sweep with fading contact dots and a
`Tab`-cycled 15/5/1 mi range — motivated directly by Mark's own
`pursuit-range` playtest, where he evaded the AI contact and had no way to
find it again. Tier 1 is green and the reference-GPU spec passed 5
consecutive runs against the real RX 6700 XT, gpu p95 0.82-1.13 ms (budget
6.0 ms) with zero validation errors. Task review caught and fixed two real
defects along the way — a doubled render-target uv-flip in the diagnostic
readback, and a nearly-unfalsifiable brightness assertion — both covered in
the [handoff](docs/handoff/2026-09-23-plan17-radar.md), which also has the
measured figures and the deferred list.

**A title screen landed 2026-09-19**, the first slice of Plan 9: Mark's title
art with **New game** and **About project**. The world boots behind it and is
held until New game (Enter also works), which is the click that unlocks audio
on a first visit. [Handoff](docs/handoff/2026-09-19-title-screen.md).

**The title screen became two sequential memo forms 2026-09-24**, in the
Naval Communications style: Form 1 of 2 is the pilot roster, New game opens
Form 2 of 2 (Sortie Orders: mission and armament), and **Launch** starts the
flight, with Back returning to the roster. About project and Settings sit in
their own memo underneath both. The KIA-pilot resurrection now happens on
Launch, not New game. `src/render/titleScreen.ts` is authoritative; the e2e
harness's `startGame` walks both forms.

The title's **Library** opens the separate Hangar catalog described in
[GAMEPLAY.md's Library section](GAMEPLAY.md#library). Its delivered scope and
the remaining model-track work are recorded in
[master spec §15](docs/superpowers/specs/2026-09-12-ww2airsim-design.md#15-first-steps).

**Models build from a manifest (Z1, 2026-09-25).** Each shipped glb has one
entry in `tools/models/entries/*.json`; `npm run models:build` runs it through
the glTF-Transform stages into `content/aircraft/` or `content/ships/`, and
`npm run models:inspect -- <file.glb>` prints the node tree, counts and
source-frame bounds an entry is written against. The Wildcat's entry is
frozen, so a bare build skips it. The design is
[A6M Zero spec §6](docs/superpowers/specs/2026-09-25-a6m-zero-design.md#6-the-model-pipeline-the-interface-lane-c-designs-against);
see the [handoff](docs/handoff/2026-09-25-z1-model-pipeline.md); master spec
§15 holds the status.

**The rest of Plan 9 (roster, live scoring, dynamic scenario switching)
landed 2026-09-23/24.** A pilot roster now sits ahead of the scenario/loadout
pickers (persisted to `localStorage`, not the design doc's original
IndexedDB — Mark's call, the scale never justified it); landing or crashing
now produces a real debrief with per-target points, the recovery multiplier
applied, the banked total, and a promotion notice, instead of every field
reading zero; picking a different scenario swaps the entity list in place
with no page reload. This plan's first real reference-GPU run — for the
scenario-switch feature specifically — found the switch didn't work at all,
tracked to a temporal-dead-zone bug class in `main.ts`'s title-screen
callback (a closure created before several bindings it reads were declared,
across real `await` boundaries) that a silent `ReferenceError` was aborting
with no visible symptom; fixed across six bindings, the last two found only
by building a click harness fast enough to beat the race. The same run found
this plan's own roster gate had broken the shared Tier 2 test harness
repo-wide (~20 spec files), fixed separately. The final whole-branch review
then found one more real regression in the same area — returning to title
after a landing and flying a second sortie silently stopped banking any
score, because the "New Game" path reset the scoring baseline but not the
other flight/debrief UI state Restart already reset — fixed and re-verified
on the real GPU (a banked total going 500 → 1000 across two landings in one
session). [Handoff](docs/handoff/2026-09-23-plan9-meta-game.md). Open:
roster export/import has no UI wiring yet (needs a replace-vs-merge design
decision first); badge content (no scenario declares an objective yet).

**The UI-realism plan landed 2026-09-24.** The title screen now has persisted
Render Quality, Asset Quality and Damage Model settings; the roster, settings
and debrief use the Naval Communications visual system; and L0/L1 terrain now
ships as selectable asset quality (L0 through Git LFS). Arcade damage disables
only G/overspeed structural consequences, not the stress measurement or HUD.
The reference-GPU acceptance covered every new screen and setting at 1.988 ms
GPU p95 with zero validation errors. See the
[handoff](docs/handoff/2026-09-24-plan-ui-realism.md) for measured evidence,
the Git LFS/CI tradeoff and the deliberately deferred asset-quality work;
master spec §15 remains the authoritative status table.

**Terrain surface textures landed 2026-09-26.** Five CC0 Poly Haven materials
(sand, grass, dirt, jungle floor and rock) now add photographed albedo and normal
detail under the existing land-cover blend. The 2.77 MB KTX2 arrays load before
terrain creation, preserve the procedural average color, fade with distance and
turn off entirely at scenery `low`; a failed texture load falls back to the old
procedural ground. See the
[plan](docs/superpowers/plans/2026-09-26-terrain-surface-textures.md),
[handoff](docs/handoff/2026-09-26-terrain-textures.md) and master spec §15.

**Clouds landed 2026-09-19 (Plan 16a):** volumetric cloud layers raymarched
from two committed noise volumes, declared per scenario in `weather.clouds`
(`free-flight` has a cumulus deck at 1,500 m and a cirrus sheet at 7,000 m;
the gunnery range stays clear). They drift with the wind, curve over the
horizon, fog with the terrain, and going into one is a whiteout with the
panel intact. The [distant-cloud refinement](docs/handoff/2026-09-19-clouds-distance.md)
reduces horizon stipple and repeating rows; its cloud-pass cost measured
1.63 ms at high, 1440p (2026-09-19). See the
[original handoff](docs/handoff/2026-09-19-plan16a-clouds.md).

**Cloud shadows landed 2026-09-19 (Plan 16b):** one sun-view transmittance
map rendered each frame from the same cloud field, carried by the sun's
custom shadow node into every lit material; the terrain and the sea read it
directly. The pass cost 0.16–0.40 ms at high, 1440p. See the
[handoff](docs/handoff/2026-09-19-plan16b-cloud-shadows.md); master spec
§15 holds the status.

**Cloud fidelity II landed 2026-09-25:** a weather map makes cumulus
separate cells with flat bases and varied tops, carved by packed multiscale
noise and a curl field; High updates one cloud pixel in sixteen per frame to
fund 128 view steps, against the 60 Hz High budget. See the
[handoff](docs/handoff/2026-09-25-cloud-fidelity-ii.md) for the reference-GPU
numbers; master spec §15 holds the status.

**The sun moves (Plan 16c, 2026-09-19):** each scenario states an apparent
solar hour (`weather.timeOfDay`); the sun sits where it would over Leyte on
1944-10-20, creeps with the sim clock, and the sky, haze, lights, clouds, sea
and shadows follow its elevation through one keyframed palette. `?timeOfDay=`
picks any hour in DEV. See the
[handoff](docs/handoff/2026-09-19-plan16c-sun.md); master spec §15 holds the
status.

That count was genuinely unsettled until then, and this paragraph said so:
input assists were inserted into the slot the roadmap had given terrain, and
three design documents each shifted differently — the renderer design still
called terrain Plan 3 and the ocean Plan 4, the terrain design called the
ocean Plan 6, and the assists design reserved Plan 5 for combat. Those encoded
two different answers to "what comes after terrain" rather than three typos.
**The table in master spec §15 is now the only authoritative copy**; every
other document points at it.

The cockpit has a grey trapezoidal dashboard with a dark rim and raised centre,
occupying about 30% of screen height,
with smaller airspeed, altitude and climb dials, an attitude ball, a heading
tape, throttle and fuel columns, and a central **RADAR / RESERVED** bay for
the combat phase. Fuel has five marks from EMPTY to FULL. Slip remains a
diagnostic quantity but has no dedicated cockpit dial. The gunsight stays on
the boresight. Use a window at least 3:2 for the complete instrument row.

Follow view shows a small white numeric flight-data strip by default; **I**
or its Hide/Show button toggles it. The preference survives camera switches.
It includes speed, altitude, climb, heading, fuel, throttle, pitch and bank.
The follow camera eases farther behind the plane as speed increases and
closer as it slows. **C** switches views, including quick taps. See the
[cockpit feedback handoff](docs/handoff/2026-09-15-cockpit-feedback.md).

**T** runs the flight at triple time, as the 1991 original did, and **T**
again returns it to real time. Both camera modes show a **3× TIME** badge
while it is on. Compression multiplies the frame's elapsed time rather than
shortening the fixed step, so a compressed flight is the same trajectory
played faster and the waves speed up with it; the pilot's head still pans at
real speed. A machine slow enough to owe more than `MAX_STEPS_PER_FRAME` gets
less than 3x rather than a widening backlog.

Touching the ground or the sea now ends the flight (Plan 10). A gentle,
wings-level, near-stall arrival on water is a ditching the pilot survives;
everything else — any land contact, or a hard, banked, or fast water contact —
is a wreck. Water can be survived and land cannot because the F6F model has no
landing gear, flaps, or rolling friction to land on land *with*; there is
nothing to make a survivable land contact out of. Either way the simulation
freezes at the moment of contact, a debrief dialog reports what happened, and
the only control is a restart back to the spawn point. See master spec §15 for
where this sits in the roadmap and what comes next.

The full design lives in
[`docs/superpowers/specs/2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md)
and remains the authoritative description of the project as a whole — read it
for intent, and the code for what is actually built.

What the player sees — scoring and ranks, the aircraft, ship and building
rosters, the scenarios — is in [`GAMEPLAY.md`](GAMEPLAY.md).

## Ocean: trying Plan 5

Run `npm run dev -- --port 5183` in the ocean worktree. Compare
`http://localhost:5183/?spawnY=100&beaufort=2&oceanTime=17` with force `6`.
Remove `oceanTime` to animate. `oceanTier=high`, `medium` or `low` holds a
quality tier for development comparisons. These URL overrides are absent
from production builds. Default weather is Beaufort 4.

Three disjoint wave bands use 509/127/31 m periods. High quality runs three
256² FFTs, medium two 128² FFTs, low one 128² FFT. A one-time warm-up check
can reduce quality if measured cost exceeds its threshold. Water remains a
rendering effect: wave forces and water collision are future work.

## Terrain: what Plan 4 built, and what it did not

**What it is.** Copernicus GLO-30 elevation, resampled offline into one
8193 × 8193 heightfield — a 200 × 200 km tangent plane at 24.4 m posting,
centred on 10.8 N 125.3 E — drawn as a CDLOD quadtree out to 100 km with
camera-relative coordinates, a `d²/2R` horizon sink and aerial-perspective
fog. The simulation answers `heightAt(x, z)` from the same pyramid and fires
a crash event on contact (`src/sim/world/terrain.ts`). Design:
[`2026-09-13-terrain-design.md`](docs/superpowers/specs/2026-09-13-terrain-design.md).

**What it is not.** Each of these is deliberate, and each belongs to a later
plan rather than to a to-do list:

- ~~**No surface materials.**~~ Fixed by Plan 13b, 2026-09-18: the terrain is
  coloured by ESA WorldCover class fractions, not by height and slope alone,
  and the shipped raster is 247.6 KiB, not the "400 MB splat guide" once
  assumed here. Handoff:
  [`2026-09-18-plan13b-land-cover.md`](docs/handoff/2026-09-18-plan13b-land-cover.md).
- **Bathymetry arrived in Plan 5.** A 513 × 513 GEBCO grid drives ocean colour
  and shallow-water attenuation. It stores signed metre depths in 526,338
  bytes; the terrain pyramid and collision surface retain their own encoding.
- ~~**No crash response.**~~ Fixed by Plan 10, 2026-09-16 (above). Contact now
  ends the flight and raises a debrief. **No ground handling yet**: no
  runways, gear or deck operations. Those are Plan 11.
- ~~**No trees, buildings or roads. The surface is bare relief.**~~ False
  since `daa1b39`, 2026-09-17: trees (`src/render/scene/vegetation.ts`) and
  the Tacloban airfield buildings (`scene/airfield.ts`) are drawn. Real
  OpenStreetMap towns/villages (deterministic hut rings), the Maharlika
  Highway alignment and Dulag's own smaller 1944 building layout landed in
  Plan 13d, 2026-09-24. Handoff:
  [`2026-09-23-plan13d-places.md`](docs/handoff/2026-09-23-plan13d-places.md);
  roadmap table in
  [`2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md)
  §15.

**Three things you will see that have already been ruled on**, recorded here
so they are not re-reported as bugs:

- ~~**The true beach is hidden by flat water.**~~ Fixed 2026-09-15: terrain
  and ocean use the same curvature sink, with reversed floating-point depth
  preventing long-range interleaving. Coastline detail is still limited by
  the source grids; judge the visual result in the Plan 5 captures.
- **Red/orange sea markers removed (2026-09-15).** These were an early
  kilometre-spaced test grid for scale and speed cues, not terrain artifacts.
- ~~**`main.ts`'s three-line physics-wiring call site is unasserted**~~ —
  closed 2026-09-14. The body moved to `applyTerrainLevel`
  (`src/render/terrain/load.ts`) and is driven by a test with a fake mesh;
  the call site is now one line. `window.__ww2.groundHeightM()` remains the
  check from outside, and is `null` if no field ever reached the simulation.

The hand-off to Mark — screenshots, the measured GPU frame cost, the LOD
height-error tables, and the one open question — is
[`docs/handoff/2026-09-14-plan4-terrain.md`](docs/handoff/2026-09-14-plan4-terrain.md).

## Getting started

Node 22, npm, and **Git LFS** (`git-lfs`) — the last one is new as of Task 2
(2026-09-24) and easy to miss, because its absence does not look like a
missing tool. `content/terrain/L0.bin` is 134 MB, over GitHub's 100 MB
per-file limit, so it is committed via Git LFS rather than as a plain blob. A
checkout without git-lfs installed (or without `git lfs pull` run) gets a
~130-byte pointer file in its place, and `npm run verify` fails with an
exact-byte-count mismatch that reads exactly like data corruption, not like a
missing prerequisite. Install once per machine, then pull if a clone predates
this:

```sh
git lfs install        # once per machine, not per clone
git lfs pull            # if `content/terrain/L0.bin` is ~130 bytes, not ~134 MB
npm ci
npm run verify   # typecheck -> lint -> depcruise -> tests
```

`npm run verify` is the gate: it runs `tsc --noEmit`, ESLint, the
dependency-cruiser boundary rules, and the full vitest suite, in that order.
CI (`ci.yml`, `nightly-soak.yml`) deliberately does NOT fetch LFS content (a
bandwidth-cost decision against GitHub LFS's free 1 GB/month quota, made
because those workflows run on every push/PR or nightly — see `ci.yml`'s own
comment); the handful of tests that need L0's real bytes detect the pointer
and skip themselves by name instead of failing. `deploy.yml` (manual,
low-frequency) DOES fetch LFS content, and is where L0 is actually verified
before a release ships.

## The terrain pyramid: a clone already flies

Nothing has to be downloaded to fly over Leyte. Since Task 2 (2026-09-24),
`content/terrain/` carries the WHOLE pyramid, `header.json` and
`L0.bin`…`L12.bin` — 179,022,522 bytes, all committed (L0 via Git LFS, per
the prerequisite above; L1 and coarser as plain git blobs). The browser only
fetches part of it, though: `finestFetchedLevelFor` (`src/render/content.ts`)
resolves how far down the pyramid a page load goes from the persisted Asset
Quality tier, and until a later task wires that up from a real Settings
choice, every session uses the same placeholder, `'low'` — L8 down to L1,
eight levels, 44,771,216 bytes (`LOD.rings` is 8 and no ring can sample
anything coarser, `coarsestFetchedLevel` in `src/render/terrain/lod.ts`). L1,
at 49 m sample spacing, is what a fresh page load draws and what the physics
queries today; `'medium'`/`'high'`/`'ultra'` (not yet reachable without that
later task) go one level further, to L0 at 24 m.

Before Task 2, only L2–L12 (703,306 bytes) were committed and the pyramid
stopped at L4 (390 m) for both rendering and physics; L0–L3 lived gitignored
in `content/terrain/tiles/` and had to be rebuilt locally to even exist.
`npm run terrain:build` no longer unlocks anything the committed set lacks —
everything down to L0 is committed now — but it still regenerates the
pyramid from source, which matters for verifying the pipeline itself is
reproducible, or after changing the resampler, the mip filter, or the DEM.
One command, which fetches the eight source tiles itself if the cache is
empty:

```sh
npm run terrain:build    # tools/terrain/build.ts; prints bytes written and elapsed time
npm run bathy:build      # GEBCO subset → 513² int16 metre grid, 526338 bytes
```

Measured on nexus, 2026-09-14 (before Task 2; the committed byte counts above
are current):

| | |
| --- | --- |
| Downloaded | **106,966,683 bytes** — eight Copernicus GLO-30 COGs into `tools/terrain/cache/`, gitignored |
| Written | **179,022,674 bytes** of pyramid — at the time, the 178,319,368 bytes of gitignored `L0`–`L3`, plus the 703,306 already-committed bytes, rewritten byte-identically |

(Plan 4 estimated "~90 MB of downloads". The eight tiles measure 107 MB; the
ninth 1° × 1° cell this world touches is 100% open ocean and Copernicus
publishes no tile for it — `ASSETS.md` has the confirmation.)

Three Tier 1 checks skip themselves **by name** rather than vanishing when
their preconditions are not met: the mip-0 far-field height-error table and
the L0/L1 whole-surface error pin in `tests/render/terrainLod.test.ts`, the
L0-specific size/hash checks in `tests/tools/terrainBuild.test.ts`, and the
L0 byte-count assertion in `tests/build/dist.test.ts`. All three gate on
`tools/terrain/load.ts`'s `hasRealLevelFile(0)` — true only when `L0.bin` is
its real 134 MB, not an unsmudged LFS pointer — which is exactly the CI
situation described above. `tests/tools/terrainBuild.test.ts`'s
built-grid-against-source-tiles block additionally needs the gitignored
source cache; running only the `fetch.ts` half of the command above without
also running `terrain:build` turns that one's named skip into an ENOENT
(review 2026-09-14, finding M3). Everything else in `npm run verify` runs
regardless.

## Tier 2: the GPU harness

Checks that need a real GPU and a browser cannot run in `npm run verify` or in
hosted CI: an adapter guard (confirms the browser is actually using the
reference GPU, not a software rasterizer), camera sweeps that assert zero
WebGPU validation errors, and the frame-time budget. Deliberately no
screenshot goldens — see `tests/e2e/adapter.spec.ts`'s doc comment for why.

WebGPU is exposed only in a secure context, and a plain-HTTP LAN address is
not one, so the dev server is never simply browsed at `http://<nexus>:5173`.
Two loops satisfy that; `vite.config.ts` is authoritative for both, and the
Playwright runner is separate from either — it has to be on a machine with a
real GPU.

```sh
# on nexus — real HTTPS, no tunnel (added 2026-09-16)
npm run dev:lan
# then open https://ww2airsim.windomlane.org on the Windows desktop
```

That hostname answers twice over: on the LAN a router record sends it straight
to nexus with a Let's Encrypt certificate, and from anywhere else it goes out
through Cloudflare behind an Access login. Plain `npm run dev` binds loopback
and this hostname then returns 502 — the same 502 as no server at all, which
is exactly why the `dev:lan` script exists. How it is wired, and what breaks
it, live in `vps-local/shared/traefik/dynamic/ww2airsim-dev.yml`.

```sh
# or the original loop — loopback plus an SSH tunnel, because
# http://localhost IS itself a secure context
npm run dev                              # on nexus
ssh -L 5173:localhost:5173 nexus         # on the Windows desktop
```

**Or drive the whole thing from nexus.** Playwright connects to a server on
the Windows box rather than being started there, and the desktop's browser
loads the app over the LAN from the hostname above — so only ONE tunnel is
needed, for Playwright's control channel:

```sh
# on nexus: dev server, then the control tunnel (backgrounded)
npm run dev:lan
ssh -N -L 39001:127.0.0.1:3000 ryzen    # this 39001 -> its Playwright server

PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2
```

Verified 2026-09-16: whole suite green against that URL, adapter guard
included, so the desktop really was on its own GPU and really did reach nexus
directly. This replaced a second, reverse tunnel
(`ssh -N -R 5173:localhost:5173 ryzen`) that existed only to make nexus's
loopback dev server visible to the desktop; if the LAN path is ever
unavailable, that reverse tunnel plus plain `npm run dev` is still the
fallback, with `PW_BASE_URL` left unset. An isolated worktree on another port
needs `PW_BASE_URL=http://localhost:5183` and the reverse tunnel, since only
5173 is routed — unless it uses one of the two dedicated slots below, which
route the same real-HTTPS way `ww2airsim.windomlane.org` does and need no
reverse tunnel at all.

**Two more slots exist for running a second and third dev server in
parallel** — e.g. two worktrees each mid-plan, both needing the reference
GPU at once. `ww2airsim-3.windomlane.org` routes to port 5174,
`ww2airsim-2.windomlane.org` to port 5175; both are real A records +
Traefik routes, wired exactly like the main hostname above (LAN goes
straight to nexus with a cert, off-LAN goes through the Cloudflare tunnel
and Access). To use one from a worktree: edit that worktree's own
`vite.config.ts` — change `TUNNEL_HOST` to the slot's hostname and
`server.port` to match — then run `WW2AIRSIM_TUNNEL=1 npx vite --port 5174`
(or `5175`) from the worktree. That edit is local scratch, not something to
commit: `vite.config.ts` on `main` stays pointed at the primary hostname and
port 5173, and each worktree that wants a slot points its own uncommitted
copy at it for as long as it needs the GPU. Whichever worktree is using a
slot should say so if asked, since only one dev server can bind a given port
at a time; there's no reservation system beyond that. Both routes are
persistent, reusable infrastructure, not scoped to whichever plan first
needed them — see `vps-local/shared/traefik/dynamic/ww2airsim-3-dev.yml`
and `ww2airsim-2-dev.yml` for the full wiring and history. (The 5174 slot
was originally named `ww2airsim-wt`, renamed to `ww2airsim-3` 2026-09-24
to match `ww2airsim-2`'s own generic naming.)

The one thing this cannot do for itself: **the `playwright run-server` it
connects to must already be running in the Windows console session** (started
there by hand, `npx playwright run-server --port 3000 --host 127.0.0.1 --unsafe`).
`--unsafe` is not optional: without it the server silently discards the
`args` this repo's `playwright.config.ts` sends it, so none of the Chromium
flags in `CHROMIUM_ARGS` apply on the reference platform (measured 2026-09-18
by reading `chrome://version` through a server started without it).
Chromium launched over SSH gets no GPU at all -- `requestAdapter()` returns
null, headless AND headed, because the SSH session is not the console session
(measured 2026-09-13). That is a session problem, not a headless one, so
`headless: false` is not a workaround for it.

One-time setup on the Windows desktop (a separate checkout — the test runner
has to be local to the GPU, the dev server does not):

```sh
git clone https://github.com/coder999/ww2airsim.git
cd ww2airsim
git checkout <branch-or-commit-with-this-work>   # until merged to main
npm ci
npx playwright install chromium
```

Then, with the tunnel open and `npm run dev` running on nexus:

```sh
npm run test:tier2
```

Expect every test to pass; the count is deliberately not written down here,
because it grows with each plan and a stale number reads as a failure. What
the suite covers is the adapter guard, camera sweeps that assert zero WebGPU
validation errors, the ocean's GPU-vs-CPU FFT and budget checks, and the
frame-time budget. If the adapter test fails, read its printed summary before
anything else — it is almost always telling you the browser fell back to a
software rasterizer, not that anything else is wrong.

**Flying somewhere specific.** The airplane spawns **parked on the runway at
Tacloban** and faces north, down the strip from the `tacloban` airfield record
in `content/bases/`. This paragraph said it spawned over open water 23 km from
land until 2026-09-17, which had been false since Task 14 moved the spawn
ashore — the exact doc rot `~/projects/CLAUDE.md`
warns about, found while deploying.

`?spawnX=&spawnY=&spawnZ=` moves it, and any of the three turns the ground
spawn OFF — an override means an airborne airplane at 120 m/s heading east
with its gear up, which is what Tier 2's terrain and ocean specs want and is
the opposite of what a take-off test wants (`hasSpawnOverride`). The
parameters exist in DEV only and `tests/build/dist.test.ts` asserts they are
absent from a production bundle.

`?scenario=deck-quals` starts a different world instead of the default one:
the player parked on the Essex's flight deck, 110 m aft of its center, with
the task force making 15 kn into 15 kn of wind. `?beaufort=` overrides the
sea state the scenario's wind would otherwise choose. Both are DEV-only and
covered by the same production-bundle assertion.

`?cloudTier=off|high|medium|low` fixes the cloud quality tier or removes the
pass, for measuring one scene with and without it, and `?cloudDebug=` paints
one link of the raymarch (`depth`, `layer`, `shape`, `density`, `slab`,
`point`, `eye`, or `nodepth` to ignore the scene depth) -- the way the first
GPU run of Plan 16a was diagnosed. Both are DEV-only.

`?scenario=gunnery-range` parks the player on the Tacloban strip 300 m south
of the runway center with a chocked training Hellcat at the center -- exactly
the guns' 300 m convergence -- and a second one 500 m ahead, 35 m left. Hold
Space from the chocks and the readout at the top of the screen counts the
rounds down and the hits up; `window.__ww2.combat()` reports the same record
to Tier 2 (`tests/e2e/gunnery.spec.ts`).

## Deployment

Live at <https://ww2airsim.com>, a public static site on the OVH
VPS. `noindex`, because it is unfinished.

Deploys are **manual**: `gh workflow run deploy.yml --repo coder999/ww2airsim`.
Pushing `main` releases nothing. The workflow checks out with `lfs: true`
(needed since Task 2, 2026-09-24: `content/terrain/L0.bin` is committed via
Git LFS), runs `npm run verify`, builds, rsyncs `dist/`, and then asserts the
live site — including that `content/terrain/L0.bin` IS public (200, by
design: it is committed content a real page load fetches) and that
the gitignored terrain scratch directory never became public
(`content/terrain/tiles/L6-preview.png` is a sentinel path that must 404 —
before Task 2 this checked `tiles/L0.bin`, which moved out of that directory).

The design, the facts it rests on and how each was verified are in
[`docs/superpowers/specs/2026-09-15-deployment-design.md`](docs/superpowers/specs/2026-09-15-deployment-design.md).
The VPS side lives in `vps-infra/sites/ww2airsim/`.

## What this is, and is not

This is a technical playground; the engineering is the point. Depth is
allocated unevenly and on purpose:

| Area | Depth |
| --- | --- |
| World and terrain — real DEM and bathymetry, CDLOD, 100 km views | Deep |
| Graphics — WebGPU, cascaded FFT ocean, volumetric cloud | Deep |
| Flight physics — honest forces, simplified moments | Good enough |
| Combat AI — pursuit, energy awareness, a small maneuver set | Basic |
| Content — eight scenarios, six aircraft | Minimal |

Explicitly not in scope: multiplayer, a persistent strategic campaign,
study-level aerodynamics, mobile, or VR.

## Requirements

A WebGPU-capable Chromium. There is no WebGL2 fallback in v1, though the
renderer boundary keeps one possible without touching the simulation.

**It also renders on Android Chrome** — observed on Mark's tablet 2026-09-17
against the live site, and the first non-AMD adapter this has ever run on.
Recorded as an observation, **not as a supported platform**: mobile is
explicitly out of scope above, and that has not changed.

Two things it happens to demonstrate, both by design rather than by luck:

- **It is view-only.** `src/input/` is `bindings.ts`, `keyboard.ts` and
  `lookAround.ts` — there is no touch, pointer or gamepad handling anywhere in
  the codebase, so nothing on a tablet can fly it. A paired Bluetooth keyboard
  would.
- **The player is told nothing about the unfamiliar GPU, and should not be.**
  `judgeAdapter` (`src/render/adapterGuard.ts`) returns `warn` for a real GPU
  that is not the RX 6700 XT, and a `warn` reaches only the DEV overlay, which
  `main.ts` builds as `null` in a production build. `warn` exists to stop
  *measurements* being trusted off the reference platform, which is a
  developer's problem and not a pilot's. Only `fail` — an actual software
  rasterizer — reaches the screen, through `showFailure`.

## Architecture in one line

`sim/` never imports `render/` and never touches a browser global. That single
constraint is what makes ~90% of the logic testable headlessly in Node, and
what lets an AI pilot fly the player's seat in end-to-end tests.

## License

[AGPL-3.0](LICENSE). Copyright (C) 2026 Mark Tuttle.

Note the network clause: anyone who runs a modified version of this as a
network service must offer its source to users. Third-party code contributed
here must therefore be AGPL-compatible — permissive licenses such as MIT, BSD,
and Apache-2.0 are fine.

Bundled assets are licensed separately and individually recorded, with source
and license, in `ASSETS.md`. Terrain is derived from open government datasets
attributed in the same file, and the licence notice that must travel with the
derived data is committed beside it in `content/terrain/NOTICE.md`.
