# Aircraft model candidates to download

CC0/CC-BY glTF candidates for the 12-aircraft roster, found 2026-09-24. None
have verified rigging yet — Sketchfab gates `.glb` downloads behind login,
and an automated login via the Epic Games account hit Epic's own bot/security
check (a 403 "please complete a security check" page), which isn't something
to script around. Downloading these by hand in a browser you're already
signed into sidesteps that entirely.

**After downloading:** drop the `.glb` files into
`~/projects/ww2airsim/tmp/candidates/`, named `<aircraft>-<author>.glb` (e.g.
`f6f-snrnsrk5.glb`). I'll inspect each one's node names and tell you which
have real separate gear/flap nodes versus a single fused mesh.

All licenses below are **CC-BY 4.0** (author credit required, commercial use
allowed) unless noted otherwise. No CC0 candidates exist for any of these 12
aircraft — CC-BY is the best tier actually available.

## Fighters

| Aircraft | Link | Author | Notes |
| --- | --- | --- | --- |
| F6F Hellcat | https://sketchfab.com/3d-models/f6f-hellcat-5b0151482fa745d5ade945be7963262e | snrnsrk5 | low-poly (1.3k verts) |
| F6F Hellcat | https://sketchfab.com/3d-models/f6f-d64f29e7f1c144e6a0712ea12d83a91e | manilov.ap | mid-poly (19k verts), part of a matching set with the F4U below |
| F4F Wildcat | https://sketchfab.com/3d-models/grumman-f4f-wildcat-airplane-ac26b8bf6be44ba7b903ca7fbdedf7e4 | rojatsu | 100k faces |
| F4U Corsair | https://sketchfab.com/3d-models/f4u-b042ee1ca0674810a7d05a7a568dd284 | manilov.ap | matches the F6F above |
| A6M Zero | https://sketchfab.com/3d-models/a6m-zero-dfc211d9a0684d90b3f0d09ec560e97f | zdw930 | only 2.7k triangles — likely too simple to be separately rigged, download anyway to confirm |
| Ki-43 Oscar | https://sketchfab.com/3d-models/ki43-abdc04cc7afb4aeba0eaac6c5079d6e6 | manilov.ap | 19k triangles, more detailed than the Zero above |
| D3A Val | https://sketchfab.com/3d-models/aichi-d3a-val-6f47d38de28b4a879481850b68bca501 | helijah | tagged `flightgear` — worth trying first, see note below. Historically fixed/spatted gear, no retraction rig expected |
| D3A Val (alt) | https://sketchfab.com/3d-models/aichi-d3a1-a4c0ce9aaa4e4317bdb9e70180da7d5b | 42manako | "full interior included" per listing |

**P-38 Lightning and Ki-84 Frank: no license-clean candidate found.** Every
P-38/Ki-84 lead was either a paid restrictive-license listing, missing glTF
export entirely, or (for one P-38 alternate) a plausible *War Thunder*
game-asset extraction — the uploader self-applying a CC-BY label to an asset
they don't own isn't a real license grant, so that one's excluded regardless
of its tag.

## Bombers

| Aircraft | Link | Author | Notes |
| --- | --- | --- | --- |
| B-17 Flying Fortress | https://sketchfab.com/3d-models/boeing-b-17-flying-fortress-927f07f6ddcf470ab0387ce5829024d5 | helijah | tagged `flightgear` — **best rigging bet in this whole list**, see note below |
| B-17 Flying Fortress (alt) | https://sketchfab.com/3d-models/boeing-b-17-flying-fortress-473f99fba3cb44ef97d0e40100e89d72 | maykel-bv | "optimized for Unreal Engine," no rigging claim, fallback only |
| B-29 Superfortress | https://sketchfab.com/3d-models/boeing-b-29-superfortress-5b051209bff445ff88eab3bd94fdfdfd | Spark_Customs | 44.6k faces, lean game-ready poly count |
| G4M Betty | https://sketchfab.com/3d-models/mitsubishi-g4m-f326a41bfa5f4a34a471e95c663c2368 | Jec (Jec_Games) | only 2.6k faces — likely too simple, low expectations |

**Ki-21 Sally: no license-clean candidate.** The only well-built option
(native glb, 114k faces, 4K textures) is also a plausible War Thunder
extraction — same IP problem as the P-38 alternate above, excluded.

## Why the FlightGear-tagged ones are worth trying first

FlightGear is an open-source flight sim whose animation system requires
every moving part (gear, flaps, control surfaces) to be a separately-named,
independently-addressable node — that's a structural requirement of how
FlightGear works, not a modeling choice. A model tagged `flightgear` (the
B-17 by helijah, the D3A Val by helijah) is the closest thing to a real
signal that gear/flaps are already separate nodes, versus every other
listing here where that's just unverified.

## Known dead ends (don't bother)

- Sketchfab Store items (Zeus Game Assets, NETRUNNER_pl Corsair/Hellcat) are
  Sketchfab's **Standard license** — personal/non-commercial, no
  redistribution, despite being "free to download."
- ThomasBeerens' F4F/F6F/F4U-4 set is CC-BY-**NonCommercial** — excluded,
  NC doesn't clear the bar.
- A confirmed-well-rigged F4U Corsair exists on itch.io (jamesarndt, $12,
  "all control surfaces and both wheels are independent transforms") but
  ships only as a `.unitypackage`, no glTF — fallback only if nothing above
  pans out.
- OpenGameArt.org has nothing for any of these 12 aircraft in 3D (it does
  have a matching 2D top-down sprite set, not applicable here).
- Smithsonian Open Access (3d.si.edu) was checked for the B-17, Zero, and
  P-38 — confirmed CC0 on their *photos* of the Zero and P-38J, but no 3D
  model exists for either, and the site was returning 403s on the B-17 check.
