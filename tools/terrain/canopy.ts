/** Original periodic crown height field. This is material geometry, not imagery
 * or a reconstruction of historical tree locations. RG = slope, B = tone,
 * A = enclosure. A wrapped bake and mipmaps keep it seamless and stable. */
export function bakeCanopy(size = 1024, tileM = 512): Uint8Array {
  const height = new Float32Array(size * size), tone = new Float32Array(size * size)
  height.fill(8)
  tone.fill(0.4)
  let seed = 19441020
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const step = tileM / size
  const wrap = (i: number) => ((i % size) + size) % size
  const at = (x: number, y: number) => wrap(y) * size + wrap(x)
  // Overlapping, asymmetrical crowns with smaller branch clusters. No grid.
  for (let tree = 0; tree < 2800; tree++) {
    const x = random() * size, y = random() * size, radius = 7 + random() * 6
    const top = 13 + random() * 9, tint = 0.48 + random() * 0.4
    for (let lobe = 0; lobe < 5; lobe++) {
      const cx = x + (random() - 0.5) * radius / step, cy = y + (random() - 0.5) * radius / step
      const rx = radius * (0.45 + random() * 0.5) / step, ry = rx * (0.7 + random() * 0.6)
      const h = top * (0.7 + random() * 0.3)
      for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
        const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2
        if (d >= 1) continue
        const value = 8 + (h - 8) * Math.sqrt(1 - d), i = at(px, py)
        if (value > height[i]!) { height[i] = value; tone[i] = tint }
      }
    }
  }
  const hash = (x: number, y: number, period: number) => {
    let h = Math.imul(((x % period) + period) % period, 374761393) ^ Math.imul(((y % period) + period) % period, 668265263)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const noise = (x: number, y: number, period: number) => {
    const px = x * period / size, py = y * period / size
    const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    return (hash(ix, iy, period) * (1 - sx) + hash(ix + 1, iy, period) * sx) * (1 - sy)
      + (hash(ix, iy + 1, period) * (1 - sx) + hash(ix + 1, iy + 1, period) * sx) * sy
  }
  // Branch-scale roughness breaks the smooth ellipsoid highlights; leaf-scale
  // reflectance supplies grain without another runtime lookup.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = at(x, y)
    height[i]! += (noise(x, y, 128) - 0.5) * 2.8 + (noise(x, y, 256) - 0.5) * 1.2
    tone[i]! *= 0.82 + noise(x, y, 256) * 0.3 + noise(x, y, 512) * 0.12
  }
  const data = new Uint8Array(size * size * 4)
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
  const reach = Math.max(1, Math.round(5 / step))
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = at(x, y), h = height[i]!
    const dx = (height[at(x + 1, y)]! - height[at(x - 1, y)]!) / (2 * step)
    const dz = (height[at(x, y + 1)]! - height[at(x, y - 1)]!) / (2 * step)
    const neighbors = (height[at(x + reach, y)]! + height[at(x - reach, y)]! + height[at(x, y + reach)]! + height[at(x, y - reach)]!) / 4
    const enclosure = Math.max(0.35, 1 - Math.max(0, neighbors - h) * 0.075)
    data[i * 4] = byte(dx / 5 + 0.5)
    data[i * 4 + 1] = byte(dz / 5 + 0.5)
    data[i * 4 + 2] = byte(tone[i]! * (0.4 + 0.6 * Math.min(1, h / 12)) * enclosure)
    data[i * 4 + 3] = byte(enclosure)
  }
  return data
}
