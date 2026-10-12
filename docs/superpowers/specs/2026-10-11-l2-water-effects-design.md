# L2 water-effects design

## Goal

Turn the existing curved shoreline ribbon into moving breaking water and a
visible shallow-water lane. The result should read as waves arriving, whitening
and dissipating along the real smoothed coastline, without changing the DEM,
the simulation shoreline, bathymetry, ocean FFT or collision.

## Existing seam

`content/scenery/beaches.glb` already supplies a world-wide `ShoreSurf` strip
whose UV.x follows the coast and UV.y runs from the waterline to the submerged
edge. `src/render/scene/beaches.ts` replaces that material at runtime and
updates an eye-position uniform for horizon sinking. The first L2 slice made
the strip static and feathered and explicitly deferred visible shallow water
and breaking-wave whitening.

## Design

- Keep the committed GLB and its two material roles. No new geometry, mesh,
  draw or content download is required.
- Add a seconds uniform to the beach handle. The frame loop updates it with
  simulation/render elapsed time; pausing freezes the shore animation with the
  rest of the scene.
- Use UV.y as physical cross-shore phase. Two broad, distorted breaker crests
  move from the submerged edge toward the waterline, brighten sharply near the
  break, then fragment and fade. UV.x supplies along-shore variation so the
  entire coast does not pulse in lockstep.
- A slower backwash/ripple term moves seaward behind each breaker. It changes
  brightness and opacity only; vertices and the mean waterline never move.
- The submerged part grades from muted turquoise/green-grey at the beach to the
  ocean color at its outer edge. The opaque sand still hides the DEM staircase;
  the surf overlay remains transparent and does not require ocean transparency.
- Sun/sky/cloud illumination remains the same lighting input as the existing
  beach materials. Foam is bright but not emissive and must still read at dusk.
- DEV `?shoreFx=off` restores the present static feathered strip for exact A/B
  captures and budget attribution. Production always uses the animated path.

## Boundaries

- No wave forces, undertow, spray particles, wet wheels, wakes, buoyancy or
  changed ditching behavior.
- No transparent-ocean rewrite, refraction, caustics or seabed rendering.
- No coastline regeneration and no change to beach widths or smoothing.
- No separate budget: the existing 8.33 ms 1440p High gate applies.

## Acceptance

- In a fixed camera sequence, foam crests progress shoreward while their
  along-shore breakup changes; they do not translate the geometry or coastline.
- The shallow lane is visibly distinct from both sand and deep ocean but
  feathers into each with no hard rectangle or tile seam.
- Pausing freezes the effect. `?shoreFx=off` matches the pre-plan static surf.
- Close Tacloban, oblique coastal and 6,000-foot captures have no WebGPU or
  console errors. The affected locked budget views remain inside their gates.
