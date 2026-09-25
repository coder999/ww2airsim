/**
 * The physically based atmosphere's constants and its CPU model (photoreal
 * render pass, design §4.3). Pure: no three, no DOM, imported by Node tests.
 *
 * Model: Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere
 * Rendering Technique", with Bruneton's Earth defaults. Everything is in
 * METERS (coefficients per meter), and every light quantity is RELATIVE: the
 * sun's illuminance at the top of the atmosphere on a surface facing it is
 * [1, 1, 1]. Radiances are that per steradian.
 *
 * The GPU LUTs (atmosphereLuts.ts) are built from these same constants, so
 * the helpers they mirror are exported here: the density profile, the
 * ray/sphere distances, the phase functions, the per-step Ψms integrand, and
 * both LUT (u, v) mappings. Change a formula here and the GPU copy must change
 * with it: tests/e2e/atmosphere.spec.ts (Tier 2) reads the GPU transmittance
 * LUT back and fails beyond 2% of `transmittanceToTop`, and the GPU Ψms LUT
 * beyond 2% of `multipleScatteringPsi` (measured 2026-09-25 on the reference
 * desktop: both within 0.1%).
 */
export const ATMOSPHERE = {
  bottomRadiusM: 6_360_000, topRadiusM: 6_460_000,
  rayleighScattering: [5.802e-6, 13.558e-6, 33.1e-6], rayleighScaleHeightM: 8000,
  mieScattering: 3.996e-6, mieAbsorption: 4.40e-6, mieScaleHeightM: 1200, mieG: 0.8,
  ozoneAbsorption: [0.650e-6, 1.881e-6, 0.085e-6], ozoneCenterM: 25_000, ozoneHalfWidthM: 15_000,
  groundAlbedo: 0.3,
} as const

export type Rgb = readonly [number, number, number]

const A = ATMOSPHERE
const DEG = Math.PI / 180
const MIE_EXTINCTION = A.mieScattering + A.mieAbsorption

// ---------------------------------------------------------------------------
// Medium

/** Relative densities at altitude hM (m above bottomRadius): Rayleigh and Mie
 *  exponentials, ozone a tent peaking at 1 at `ozoneCenterM`. */
export function densityAt(hM: number): { rayleigh: number; mie: number; ozone: number } {
  const h = Math.max(0, hM)
  return {
    rayleigh: Math.exp(-h / A.rayleighScaleHeightM),
    mie: Math.exp(-h / A.mieScaleHeightM),
    ozone: Math.max(0, 1 - Math.abs(h - A.ozoneCenterM) / A.ozoneHalfWidthM),
  }
}

/** Extinction per meter at altitude h (m above bottomRadius). */
export function extinctionAt(hM: number): Rgb {
  const d = densityAt(hM)
  const mie = MIE_EXTINCTION * d.mie
  return [
    A.rayleighScattering[0] * d.rayleigh + mie + A.ozoneAbsorption[0] * d.ozone,
    A.rayleighScattering[1] * d.rayleigh + mie + A.ozoneAbsorption[1] * d.ozone,
    A.rayleighScattering[2] * d.rayleigh + mie + A.ozoneAbsorption[2] * d.ozone,
  ]
}

// ---------------------------------------------------------------------------
// Geometry. r is the distance from the planet's center (m), mu the cosine of
// the ray's angle to the local zenith. Bruneton 2017's functions, same names.

function clampRadius(r: number): number { return Math.min(A.topRadiusM, Math.max(A.bottomRadiusM, r)) }

/** Distance along (r, mu) to the top-of-atmosphere sphere (r inside it). */
export function distanceToTopBoundary(r: number, mu: number): number {
  const disc = r * r * (mu * mu - 1) + A.topRadiusM * A.topRadiusM
  return Math.max(0, -r * mu + Math.sqrt(Math.max(0, disc)))
}

/** Distance along (r, mu) to the ground sphere; only meaningful when
 *  `rayIntersectsGround(r, mu)`. */
export function distanceToBottomBoundary(r: number, mu: number): number {
  const disc = r * r * (mu * mu - 1) + A.bottomRadiusM * A.bottomRadiusM
  return Math.max(0, -r * mu - Math.sqrt(Math.max(0, disc)))
}

/** True when the ray (r, mu) hits the ground. A ray exactly tangent to the
 *  ground counts as a hit, as in Bruneton 2017. */
export function rayIntersectsGround(r: number, mu: number): boolean {
  return mu < 0 && r * r * (mu * mu - 1) + A.bottomRadiusM * A.bottomRadiusM >= 0
}

/** Cosine of the geometric horizon's zenith angle seen from radius r (≤ 0). */
export function horizonMu(r: number): number {
  const s = A.bottomRadiusM / Math.max(r, A.bottomRadiusM)
  return -Math.sqrt(Math.max(0, 1 - s * s))
}

// ---------------------------------------------------------------------------
// Transmittance

/** Optical depth from (r, mu) to the top boundary, ignoring the ground:
 *  `samples` midpoint steps of `extinctionAt` in x = sqrt(t / d), i.e.
 *  t = d·x², dt = 2·d·x·dx — steps start at d/n² (24 m straight up) and
 *  grow outward, where the density has already fallen off. Uniform steps of
 *  d/64 = 1.56 km under-count the 1.2 km Mie layer by 7%; this is within
 *  0.1% of a 4096-step reference. The GPU transmittance LUT must use the
 *  same scheme (or more samples) to agree within 2%. */
function opticalDepthToTop(r: number, mu: number, samples: number): Rgb {
  const d = distanceToTopBoundary(r, mu)
  let t0 = 0, t1 = 0, t2 = 0
  for (let i = 0; i < samples; i++) {
    const x = (i + 0.5) / samples
    const t = d * x * x, w = 2 * d * x / samples
    const ri = Math.sqrt(r * r + 2 * r * mu * t + t * t)
    const e = extinctionAt(ri - A.bottomRadiusM)
    t0 += e[0] * w; t1 += e[1] * w; t2 += e[2] * w
  }
  return [t0, t1, t2]
}

/** Transmittance from altitude hM toward the top of the atmosphere along a ray
 *  with cosine `mu` to the local zenith. 0 if the ray hits the ground. */
export function transmittanceToTop(hM: number, mu: number, samples = 64): Rgb {
  const r = clampRadius(A.bottomRadiusM + hM)
  if (rayIntersectsGround(r, mu)) return [0, 0, 0]
  const tau = opticalDepthToTop(r, mu, samples)
  return [Math.exp(-tau[0]), Math.exp(-tau[1]), Math.exp(-tau[2])]
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** How far below the local geometric horizon the sun fades to nothing: the
 *  existing dusk floor (palette.ts's -6° key). */
export const SUN_FADE_BELOW_HORIZON_DEG = 6

/** Sun illuminance color reaching altitude hM at sun elevation (deg), relative
 *  to top-of-atmosphere = [1,1,1].
 *
 *  Above the geometric horizon of hM (0° at sea level, -1.76° at 3 km) this is
 *  exactly `transmittanceToTop(hM, sin(e))`. Below it the ray is blocked, so
 *  the grazing (tangent-ray) value is faded by a smoothstep over the next
 *  6° — continuous at the horizon, 0 at the dusk floor, never NaN. The disc's
 *  0.27° radius is not modeled: the fade starts at the disc's center. */
export function sunColorAt(hM: number, elevationDeg: number): Rgb {
  const r = clampRadius(A.bottomRadiusM + hM)
  const mu = Math.sin(elevationDeg * DEG)
  if (!rayIntersectsGround(r, mu)) return transmittanceToTop(hM, mu)
  const muH = horizonMu(r)
  const horizonDeg = Math.asin(muH) / DEG
  const fade = smoothstep(horizonDeg - SUN_FADE_BELOW_HORIZON_DEG, horizonDeg, elevationDeg)
  if (fade === 0) return [0, 0, 0]
  const tau = opticalDepthToTop(r, muH, 64)
  return [Math.exp(-tau[0]) * fade, Math.exp(-tau[1]) * fade, Math.exp(-tau[2]) * fade]
}

// ---------------------------------------------------------------------------
// Phase functions (both normalized to 1 over the sphere)

export function rayleighPhase(cosTheta: number): number {
  return (3 / (16 * Math.PI)) * (1 + cosTheta * cosTheta)
}

/** Cornette-Shanks (1992), Bruneton's and Hillaire's Mie phase. */
export function cornetteShanksPhase(cosTheta: number, g: number): number {
  const g2 = g * g
  const k = (3 / (8 * Math.PI)) * (1 - g2) / (2 + g2)
  return k * (1 + cosTheta * cosTheta) / Math.pow(Math.max(1e-9, 1 + g2 - 2 * g * cosTheta), 1.5)
}

// ---------------------------------------------------------------------------
// Ray marching shared by the multiple-scattering term and the sky irradiance

type Vec = [number, number, number]

/** One ray from `origin` (planet-centered, m) along unit `dir`, marched in
 *  `samples` steps to the ground or the top. Each step integrates the
 *  in-scattered radiance analytically over the step, S * (1 - e^{-σt Δ}) / σt
 *  (Hillaire 2020's "energy-conserving" integration), and `source` supplies
 *  S per channel at the step's midpoint. Returns the accumulated radiance, the
 *  throughput to the far end, and where the ray ended. */
function marchRay(
  origin: Vec, dir: Vec, samples: number,
  source: (p: Vec, r: number, hM: number, out: Vec) => void,
): { L: Vec; throughput: Vec; groundHit: Vec | null } {
  const r = Math.hypot(origin[0], origin[1], origin[2])
  const mu = (origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2]) / r
  const ground = rayIntersectsGround(r, mu)
  const dist = ground ? distanceToBottomBoundary(r, mu) : distanceToTopBoundary(r, mu)
  const dt = dist / samples
  const L: Vec = [0, 0, 0], T: Vec = [1, 1, 1], S: Vec = [0, 0, 0], p: Vec = [0, 0, 0]
  for (let i = 0; i < samples; i++) {
    const t = (i + 0.5) * dt
    p[0] = origin[0] + dir[0] * t; p[1] = origin[1] + dir[1] * t; p[2] = origin[2] + dir[2] * t
    const rp = Math.hypot(p[0], p[1], p[2])
    const hp = rp - A.bottomRadiusM
    const ext = extinctionAt(hp)
    source(p, rp, hp, S)
    for (let c = 0; c < 3; c++) {
      const sigmaT = Math.max(1e-12, ext[c]!)
      const stepT = Math.exp(-sigmaT * dt)
      L[c] = L[c]! + T[c]! * S[c]! * (1 - stepT) / sigmaT
      T[c] = T[c]! * stepT
    }
  }
  const groundHit: Vec | null = ground ? [origin[0] + dir[0] * dist, origin[1] + dir[1] * dist, origin[2] + dir[2] * dist] : null
  return { L, throughput: T, groundHit }
}

/** Scattering (not extinction) coefficients per meter at hM. */
export function scatteringAt(hM: number): { rayleigh: Rgb; mie: number } {
  const d = densityAt(hM)
  return {
    rayleigh: [A.rayleighScattering[0] * d.rayleigh, A.rayleighScattering[1] * d.rayleigh, A.rayleighScattering[2] * d.rayleigh],
    mie: A.mieScattering * d.mie,
  }
}

/** Transmittance from point p (planet-centered) toward the sun, 0 in the
 *  planet's shadow. */
function sunTransmittanceAt(p: Vec, rp: number, hp: number, sun: Vec, samples: number): Rgb {
  const muS = (p[0] * sun[0] + p[1] * sun[1] + p[2] * sun[2]) / rp
  return transmittanceToTop(hp, muS, samples)
}

/** Unit direction k of an n×n uniform sphere grid (Hillaire's 8×8 = 64). */
function sphereDirection(k: number, n: number): Vec {
  const i = k % n, j = Math.floor(k / n)
  const phi = 2 * Math.PI * (i + 0.5) / n
  const cosTheta = 1 - 2 * (j + 0.5) / n
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
  return [sinTheta * Math.cos(phi), cosTheta, sinTheta * Math.sin(phi)]
}

export const MULTI_SCATTERING_DIRECTIONS = 64
export const MULTI_SCATTERING_STEPS = 20
const INNER_TRANSMITTANCE_SAMPLES = 32

/**
 * Hillaire 2020 §5.5: the isotropic multiple-scattering transfer Ψms at
 * altitude hM with the sun at cosine `muS` to the zenith. This is the value
 * one texel of the 32×32 multi-scattering LUT holds; the GPU pass is a copy of
 * this function.
 *
 * Assumptions (Hillaire's, stated so a reader knows what is approximated):
 *  1. Light scattered twice or more is ISOTROPIC — the phase function for every
 *     order ≥ 2 is 1/4π. Good for Rayleigh; Mie's forward peak is lost for
 *     those orders only.
 *  2. The neighborhood of the point is uniform: every order sees the same
 *     2nd-order luminance L2 and the same transfer fraction f_ms that the
 *     point itself sees, so all orders sum as a geometric series
 *     L2 · (1 + f_ms + f_ms² + …) = L2 / (1 − f_ms).
 *  3. The ground is Lambertian with `groundAlbedo`, lit by the transmitted sun
 *     only (its own sky light enters through the series).
 *
 * L2 = mean over 64 directions of the single-scattered luminance arriving
 * along each (isotropic phase, sun illuminance 1, plus the ground's
 * albedo/π · T_sun · cos term); f_ms = mean over the same directions of
 * ∫ σs · T dt (unit isotropic illumination). Units: the returned Ψms is a
 * radiance per unit scattering coefficient, so a view ray adds σs(p) · Ψms
 * to its in-scattered source term (sun illuminance at TOA = 1).
 */
export function multipleScatteringPsi(hM: number, muS: number): Rgb {
  const r = clampRadius(A.bottomRadiusM + hM)
  const origin: Vec = [0, r, 0]
  const sinS = Math.sqrt(Math.max(0, 1 - muS * muS))
  const sun: Vec = [sinS, muS, 0]
  const isotropic = 1 / (4 * Math.PI)
  const L2: Vec = [0, 0, 0], fms: Vec = [0, 0, 0]
  const n = Math.round(Math.sqrt(MULTI_SCATTERING_DIRECTIONS))
  for (let k = 0; k < n * n; k++) {
    const dir = sphereDirection(k, n)
    const lum = marchRay(origin, dir, MULTI_SCATTERING_STEPS, (p, rp, hp, out) => {
      const s = scatteringAt(hp), ts = sunTransmittanceAt(p, rp, hp, sun, INNER_TRANSMITTANCE_SAMPLES)
      for (let c = 0; c < 3; c++) out[c] = (s.rayleigh[c]! + s.mie) * isotropic * ts[c]!
    })
    const tr = marchRay(origin, dir, MULTI_SCATTERING_STEPS, (_p, _rp, hp, out) => {
      const s = scatteringAt(hp)
      for (let c = 0; c < 3; c++) out[c] = s.rayleigh[c]! + s.mie
    })
    for (let c = 0; c < 3; c++) { L2[c] = L2[c]! + lum.L[c]!; fms[c] = fms[c]! + tr.L[c]! }
    if (lum.groundHit) {
      const g = lum.groundHit, rg = Math.hypot(g[0], g[1], g[2])
      const cosSun = Math.max(0, (g[0] * sun[0] + g[1] * sun[1] + g[2] * sun[2]) / rg)
      const ts = sunTransmittanceAt(g, rg, 0, sun, INNER_TRANSMITTANCE_SAMPLES)
      for (let c = 0; c < 3; c++) L2[c] = L2[c]! + lum.throughput[c]! * ts[c]! * cosSun * A.groundAlbedo / Math.PI
    }
  }
  const N = n * n
  const psi = (c: 0 | 1 | 2): number => (L2[c] / N) / (1 - Math.min(0.99, fms[c] / N))
  return [psi(0), psi(1), psi(2)]
}

// ---------------------------------------------------------------------------
// Sky irradiance

const IRRADIANCE_AZIMUTHS = 8
const IRRADIANCE_BANDS = 4
const IRRADIANCE_VIEW_STEPS = 16

/** Sky irradiance on an up-facing and a down-facing surface at altitude hM,
 *  single-scattering + an isotropic multiple-scattering term, in the same
 *  relative units (sun at TOA = 1).
 *
 *  up: the upper hemisphere's sky radiance, cosine-weighted, on a fixed 8
 *  azimuths × 4 cos-zenith bands grid; each direction marched in 16 steps with
 *  Rayleigh + Cornette-Shanks Mie single scattering (sun transmittance per
 *  step) plus σs · Ψms, Ψms evaluated once at the query point.
 *  down: a Lambertian ground of `groundAlbedo` lit by the sea-level direct sun
 *  and by `up` (Hillaire §4's ground term, integrated over the lower
 *  hemisphere it is albedo × ground irradiance). With the sun up this is
 *  LARGER than `up` at the default 0.3 albedo (0.20 vs 0.03 red at 45°): a
 *  bright ground under a clear sky out-shines the diffuse sky, as bifacial PV
 *  rear-side measurements show. Pass the scene's own albedo (open ocean
 *  ≈ 0.06) where the ground is darker; Ψms keeps the constant 0.3. The atmosphere between a
 *  high aircraft and the ground is not modeled here; aerial perspective
 *  (Task 8's LUT) covers what the eye sees of it.
 *
 *  Costs ~40k `extinctionAt` calls: evaluate on sun/altitude change, not
 *  per pixel. */
export function skyIrradiance(hM: number, elevationDeg: number, groundAlbedo: number = A.groundAlbedo): { up: Rgb; down: Rgb } {
  const r = clampRadius(A.bottomRadiusM + hM)
  const origin: Vec = [0, r, 0]
  const muS = Math.sin(elevationDeg * DEG)
  const sun: Vec = [Math.cos(elevationDeg * DEG), muS, 0]
  const psi = multipleScatteringPsi(hM, muS)
  const up: Vec = [0, 0, 0]
  const dMu = 1 / IRRADIANCE_BANDS, dPhi = 2 * Math.PI / IRRADIANCE_AZIMUTHS
  for (let b = 0; b < IRRADIANCE_BANDS; b++) {
    const mu = (b + 0.5) * dMu
    const sinT = Math.sqrt(1 - mu * mu)
    for (let a = 0; a < IRRADIANCE_AZIMUTHS; a++) {
      const phi = (a + 0.5) * dPhi
      const dir: Vec = [sinT * Math.cos(phi), mu, sinT * Math.sin(phi)]
      const cosTheta = dir[0] * sun[0] + dir[1] * sun[1] + dir[2] * sun[2]
      const pR = rayleighPhase(cosTheta), pM = cornetteShanksPhase(cosTheta, A.mieG)
      const { L } = marchRay(origin, dir, IRRADIANCE_VIEW_STEPS, (p, rp, hp, out) => {
        const s = scatteringAt(hp), ts = sunTransmittanceAt(p, rp, hp, sun, INNER_TRANSMITTANCE_SAMPLES)
        for (let c = 0; c < 3; c++) {
          out[c] = (s.rayleigh[c]! * pR + s.mie * pM) * ts[c]! + (s.rayleigh[c]! + s.mie) * psi[c]!
        }
      })
      for (let c = 0; c < 3; c++) up[c] = up[c]! + L[c]! * mu * dMu * dPhi
    }
  }
  const direct = sunColorAt(0, elevationDeg)
  const cosSun = Math.max(0, muS)
  const bounce = (c: 0 | 1 | 2): number => groundAlbedo * (direct[c] * cosSun + up[c])
  const down: Rgb = [bounce(0), bounce(1), bounce(2)]
  return { up: [up[0], up[1], up[2]], down }
}

// ---------------------------------------------------------------------------
// LUT (u, v) mappings. Both use texel-center coordinates: the unit-range
// parameter's 0 and 1 land on the first and last texel centers, not the
// edges, so a LUT texel's own center decodes to exactly its parameters.

export const TRANSMITTANCE_LUT_WIDTH = 256
export const TRANSMITTANCE_LUT_HEIGHT = 64
export const MULTI_SCATTERING_LUT_SIZE = 32

function toTexel(x: number, n: number): number { return 0.5 / n + x * (1 - 1 / n) }
function fromTexel(u: number, n: number): number { return (u - 0.5 / n) / (1 - 1 / n) }

/** Bruneton 2017's transmittance-LUT mapping: u from the distance to the top
 *  (x_mu, between the zenith and the horizon distances), v from the horizon
 *  distance (x_r). Only rays that do not hit the ground are representable. */
export function transmittanceLutUv(hM: number, mu: number): [number, number] {
  const R = A.bottomRadiusM, top = A.topRadiusM
  const r = clampRadius(R + hM)
  const H = Math.sqrt(top * top - R * R)
  const rho = Math.sqrt(Math.max(0, r * r - R * R))
  const d = distanceToTopBoundary(r, mu)
  const dMin = top - r, dMax = rho + H
  const xMu = dMax > dMin ? (d - dMin) / (dMax - dMin) : 0
  return [toTexel(Math.min(1, Math.max(0, xMu)), TRANSMITTANCE_LUT_WIDTH), toTexel(rho / H, TRANSMITTANCE_LUT_HEIGHT)]
}

/** Inverse of `transmittanceLutUv`: the (altitude, mu) a texel represents. */
export function transmittanceLutParams(u: number, v: number): { hM: number; mu: number } {
  const R = A.bottomRadiusM, top = A.topRadiusM
  const xMu = fromTexel(u, TRANSMITTANCE_LUT_WIDTH), xR = fromTexel(v, TRANSMITTANCE_LUT_HEIGHT)
  const H = Math.sqrt(top * top - R * R)
  const rho = H * xR
  const r = Math.sqrt(rho * rho + R * R)
  const dMin = top - r, dMax = rho + H
  const d = dMin + xMu * (dMax - dMin)
  const mu = d === 0 ? 1 : (H * H - rho * rho - d * d) / (2 * r * d)
  return { hM: r - R, mu: Math.min(1, Math.max(-1, mu)) }
}

/** Hillaire 2020's multi-scattering-LUT mapping, u = sun cosine, v = altitude,
 *  with the same texel-center convention as the transmittance LUT (Hillaire's
 *  own sub-UV pair is not an exact inverse, which the CPU/GPU check cannot
 *  afford). */
export function multiScatteringLutUv(hM: number, muS: number): [number, number] {
  const n = MULTI_SCATTERING_LUT_SIZE
  const x = Math.min(1, Math.max(0, 0.5 + 0.5 * muS))
  const y = Math.min(1, Math.max(0, hM / (A.topRadiusM - A.bottomRadiusM)))
  return [toTexel(x, n), toTexel(y, n)]
}

export function multiScatteringLutParams(u: number, v: number): { hM: number; muS: number } {
  const n = MULTI_SCATTERING_LUT_SIZE
  return { hM: fromTexel(v, n) * (A.topRadiusM - A.bottomRadiusM), muS: 2 * fromTexel(u, n) - 1 }
}
