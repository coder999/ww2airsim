/** Directional terrain visibility. Elevations and distances are meters here;
 * this is an offline lighting derivative, never a replacement physics DEM. */
export type HeightGrid = { readonly samples: number; readonly stepM: number; readonly heights: Float32Array }

export function sampleHeight(g: HeightGrid, x: number, z: number): number {
  const cx = Math.max(0, Math.min(g.samples - 1, x))
  const cz = Math.max(0, Math.min(g.samples - 1, z))
  const ix = Math.min(g.samples - 2, Math.floor(cx)), iz = Math.min(g.samples - 2, Math.floor(cz))
  const fx = cx - ix, fz = cz - iz, i = iz * g.samples + ix
  return (g.heights[i]! * (1 - fx) + g.heights[i + 1]! * fx) * (1 - fz)
    + (g.heights[i + g.samples]! * (1 - fx) + g.heights[i + g.samples + 1]! * fx) * fz
}

/** Max elevation above the receiver in a direction (east=0, south=pi/2).
 * Stop at the dataset edge rather than inventing repeated mountain walls.
 * Samples are close together nearby and widen in the distance. */
export function horizonAngle(g: HeightGrid, x: number, z: number, angle: number, distancesM: readonly number[]): number {
  const h = sampleHeight(g, x, z), dx = Math.cos(angle), dz = Math.sin(angle)
  let slope = 0
  for (const d of distancesM) {
    const sx = x + dx * d / g.stepM, sz = z + dz * d / g.stepM
    if (sx < 0 || sz < 0 || sx > g.samples - 1 || sz > g.samples - 1) break
    slope = Math.max(slope, (sampleHeight(g, sx, sz) - h) / d)
  }
  return Math.atan(slope)
}

export function horizonDistances(stepM: number, reachM: number): number[] {
  const result: number[] = []
  for (let d = stepM; d <= reachM; d += Math.max(stepM, d * 0.15)) result.push(d)
  return result
}

/** Fraction of diffuse irradiance from an isotropic sky reaching a tilted
 * receiver. Integrate n·direction above each terrain horizon. The denominator
 * uses only the receiver's own plane, so an open tilted slope stays at 1.
 * Ground bounce is deliberately not included in this sky visibility. */
export function skyVisibility(horizons: readonly number[], slopeX: number, slopeZ: number): number {
  let visible = 0, open = 0
  const integral = (a: number, b: number, lo: number): number => {
    // Integrate (a*cos(elevation)+b*sin(elevation))*cos(elevation) d(elevation).
    return a * (Math.PI / 4 - lo / 2 - Math.sin(2 * lo) / 4)
      + b * Math.cos(lo) ** 2 / 2
  }
  const inv = 1 / Math.hypot(slopeX, 1, slopeZ)
  for (let i = 0; i < horizons.length; i++) {
    const az = i * 2 * Math.PI / horizons.length
    const a = (-slopeX * Math.cos(az) - slopeZ * Math.sin(az)) * inv
    const b = inv
    const plane = Math.max(0, Math.atan2(-a, b))
    visible += integral(a, b, Math.max(plane, horizons[i]!))
    open += integral(a, b, plane)
  }
  return Math.max(0, Math.min(1, visible / open))
}

export function bakeHorizons(g: HeightGrid, samples: number, directions: number, reachM: number,
  progress: (row: number) => void = () => {}): { horizons: Uint8Array; sky: Uint8Array } {
  const count = samples * samples
  const horizons = new Uint8Array(count * directions), sky = new Uint8Array(count)
  const distances = horizonDistances(g.stepM, reachM)
  const angles = new Array<number>(directions)
  for (let z = 0; z < samples; z++) {
    const gz = z * (g.samples - 1) / (samples - 1)
    for (let x = 0; x < samples; x++) {
      const gx = x * (g.samples - 1) / (samples - 1), index = z * samples + x
      if (sampleHeight(g, gx, gz) <= 0) { sky[index] = 255; continue }
      for (let d = 0; d < directions; d++) {
        angles[d] = horizonAngle(g, gx, gz, d * Math.PI * 2 / directions, distances)
        horizons[d * count + index] = Math.round(angles[d]! * 255 / (Math.PI / 2))
      }
      const sx = (sampleHeight(g, gx + 1, gz) - sampleHeight(g, gx - 1, gz)) / (2 * g.stepM)
      const sz = (sampleHeight(g, gx, gz + 1) - sampleHeight(g, gx, gz - 1)) / (2 * g.stepM)
      sky[index] = Math.round(skyVisibility(angles, sx, sz) * 255)
    }
    if (z % 128 === 0) progress(z)
  }
  return { horizons, sky }
}
