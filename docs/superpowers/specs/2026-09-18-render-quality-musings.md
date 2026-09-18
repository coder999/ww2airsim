# Render quality: where the headroom actually is

**Status: musings, not a plan.** Written 2026-09-18 after Mark asked whether
render quality had been held back to keep the browser fast, and whether more
realism is reachable with WebGPU at the cost of a loading bar. Every number
below was measured against this repo on the date given; nothing here is
scheduled, and §7 lists what only Mark can decide.

## 1. The short answer

The frame-time budget has never been the binding constraint, and it is not
what limits realism today. **Shipped content is.**

## 2. The budget is a tripwire, not a ceiling

`GPU_BUDGET_P95_MS = 6.0` in `tests/e2e/terrain.spec.ts`. Its own comment says
what it is: 1.2x the measured p95, sized so "a regression the size of the old
`quadsPerNode` doubling (+2 ms) still fails it". It is a regression detector,
and it was derived against a **120 Hz** frame (8.33 ms).

Measured 2026-09-18 on the reference desktop (RX 6700 XT, 2560x1440, GPU
timestamps serialized on the resolve):

| | ms |
| --- | --- |
| gpu p50 | 5.112 |
| gpu p95 | **5.177** |
| a 120 Hz frame | 8.33 |
| a 60 Hz frame | 16.67 |

So the frame currently uses **31% of a 60 Hz budget**. There is roughly 3x of
GPU time that nothing is spending.

## 3. What has actually been traded away, honestly

Only one thing, and it is reversible:

- **Tree density.** Codex's 121-cell square became a 69-cell disc: p95 11.73 ->
  5.05 ms (table in `tests/render/scenery.test.ts`).

One reduction that is *not* a compromise and should not be "restored":

- **Anisotropic filtering, 8 -> 1.** It cost 5.18 ms (8.98 vs 3.80) and
  screenshots down the runway were indistinguishable, because the surface is
  8- to 64-cell value noise on a 256-texel tile and has no fine structure for
  anisotropy to preserve. The reasoning is at `src/render/terrain/surface.ts:69`
  and a guard test pins it. **It becomes worth revisiting only if real textures
  land** (§5) — then there is fine structure, and the trade changes.

## 4. What actually limits realism

Three things, all download decisions rather than frame-time ones. Build is
**17 MB** total today.

| | today | headroom |
| --- | --- | --- |
| Terrain | **97.66 m**/sample (L2, 11 MB) | L1 at 48.8 m (+32 MB) and L0 at 24.4 m (+128 MB) are **already built on disk**, gitignored, not shipped |
| Land cover | 1025² over 200 km = **195 m**/texel | finer raster; 2049² was already measured at 168 KiB gzipped during 13b |
| Surface textures | **none at all** | every surface is procedural value noise from `surface.ts` |

That last row is the ceiling. `ASSETS.md` states it plainly: "No external
bitmap assets." Nothing in this build samples a photograph of anything.

## 5. Mark's direction, 2026-09-18

Two next steps, in his words: **open-source external bitmap assets**, and
**render quality options in a game start menu** so heavier GPUs get more and
lesser GPUs still render.

### 5.1 External bitmap assets

This is the single largest realism lever, and it is a licensing problem before
it is a rendering problem.

`ASSETS.md` opens: "Every bundled asset is recorded here **before** it is
committed: source URL, author, and license. The repo is public and AGPL-3.0, so
unverifiable asset provenance is the project's main legal exposure — free model
sites are riddled with license laundering." That gate is real and it already
stopped work once: Plan 15 Task 1 was blocked until Mark confirmed the WAVs
came from Adobe Firefly.

So: **CC0 or explicitly-licensed sources only, one `ASSETS.md` row per file,
recorded before commit, and a `NOTICE.md` beside them.** `content/audio/` and
`content/scenery/` are the worked examples of the shape.

Worth deciding early, because it changes everything downstream: **KTX2/Basis
supercompressed textures, or PNG?** PNG decodes to full uncompressed VRAM; KTX2
stays compressed on the GPU and is a fraction of the download. At the scale
this needs — several ground materials, each with albedo plus normal — that is
the difference between a few MB and a few tens of MB.

### 5.2 Quality tiers and a start menu

**The pattern already exists — generalise it, do not invent one.**
`src/render/ocean/tiers.ts` has `OCEAN_TIERS` (`high`/`medium`/`low`, varying
cascades and FFT size), `tierForFrameTimeMs` picking one from a measured frame
time at runtime, and `oceanTierFromQuery` as a DEV-only override for measuring
identical scenes at each setting. Read that file first.

Two things it does *not* give, which a settings menu needs:

1. **Nothing persists.** There is no `localStorage` or `sessionStorage` use
   anywhere in `src/` (checked 2026-09-18). A chosen quality level surviving a
   reload is new machinery.
2. **`judgeAdapter` grades honesty, not capability.** `src/render/adapterGuard.ts`
   returns `ok`/`warn`/`fail` and exists to catch a *software rasterizer*
   pretending to be a GPU. It cannot rank an RX 6700 XT against an integrated
   part. Runtime measurement — what `tierForFrameTimeMs` does — is the only
   honest source of a capability tier in a browser.

**The standing "no play-screen UI" rule does not block this.** That rule is
about the *play* screen: Mark declined a map-credit watermark on 2026-09-17,
and the ODbL attribution lives in the `/` controls panel because of it. A start
menu is before play, so it is a new surface rather than a violation — but it is
new UI on a project that has deliberately had almost none, so it deserves an
explicit decision rather than being assumed from this note.

An honest caveat about auto-detection: a one-time frame-time probe is what the
ocean does, and it is cheap, but a probe taken during load contends with
decoding and streaming. If a menu exists, **offering an explicit override is
worth more than perfecting the guess.**

## 6. What the headroom would buy, roughly in payoff order

**Costs GPU time that already exists; no download:**

- **Shadows.** Nothing in the world casts one today. Almost certainly the
  largest single realism jump available, and affordable at 31% frame use.
- Atmospheric scattering and aerial perspective on distant terrain — most of
  what makes distance read as distance.
- Put the tree density back (§3).
- Tonemapping, bloom, TAA.

**Costs download; loading-bar territory:**

- **L1 terrain, +32 MB for 4x the relief detail.** Cheapest big win: the data
  is already built, so it is a constants change and a rebuild, in the shape of
  `eef5b4d` which moved L4 -> L2.
- Real ground textures (§5.1).
- Finer land cover raster.

## 7. Open questions — Mark's calls, not an agent's

1. **Download ceiling.** 17 MB today. What is acceptable with a loading bar —
   50 MB? 150 MB? This single number decides L1-versus-L0 and how many texture
   sets are affordable.
2. **Minimum target hardware.** "Lesser GPUs still render" needs a floor.
   Integrated Intel? A five-year-old laptop? Everything in §5.2 hangs off it.
3. **Does the start menu exist at all**, given how deliberately UI-free this
   project has been so far — or do quality options live in the `/` panel with
   the other controls?
4. **KTX2 or PNG** (§5.1), before any texture is committed.
5. **Ordering against Plan 12.** Entities is the roadmap's designated next
   plan. Does the world get better-looking before or after it gets more things
   in it? Neither answer is wrong; doing both at once is.

## 8. What this document is not

Not a plan, not a spec, and not scheduled. Nothing here has been brainstormed
with Mark beyond the exchange that produced it. Anything acted on from here
starts with `superpowers:brainstorming`, then a spec, then a plan — and §7 gets
answered first, because four of those five questions change what the plan says.
