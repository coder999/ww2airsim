// tools/models/blender/silhouette-overlay.ts
// Overlay a glTF projection on a measured three-view drawing. This is a likeness-review tool,
// not a test: the caller supplies the drawing's pixel calibration and the model origin's distance aft
// of the spinner tip. The mesh is drawn as filled translucent triangles, so the model's OUTLINE can be
// compared with the drawing's: a vertex scatter hid a canopy 0.3 m high and a fin 0.35 m tall on the
// first D3A and B-17 duplicates (2026-10-11). Moving parts except control surfaces are omitted.
// `top` projects x/z instead of x/y (+z, the right wing, up the page); thrustPx is then the top view's centerline row.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { modelIO } from '../document.js'

const argv = process.argv.slice(2)
if (argv.length !== 9 && !(argv.length === 10 && argv[9] === 'top')) throw new Error('usage: npx tsx tools/models/blender/silhouette-overlay.ts <model.glb> <drawing.png> <out.png> <nosePx> <tailPx> <thrustPx> <originAftM> <lengthM> <cropBottomPx> [top]')
const [modelPath, drawingPath, outPath] = argv
const [nosePx, tailPx, thrustPx, originAftM, lengthM, cropBottomPx] = argv.slice(3, 9).map(Number)
if ([nosePx, tailPx, thrustPx, originAftM, lengthM, cropBottomPx].some((v) => !Number.isFinite(v))) throw new Error('pixel calibration and dimensions must be finite numbers')
const top = argv[9] === 'top'
const ppm = (tailPx! - nosePx!) / lengthM!
const doc = await modelIO().readBinary(new Uint8Array(readFileSync(modelPath!)))
const polygons: string[] = []
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh || /^(Prop\d*|GearL|GearR|GearNose|Tailwheel)$/.test(node.getName())) continue
  const m = node.getWorldMatrix()
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const idx = prim.getIndices()
    const px = (i: number): string => {
      const [x, y, z] = pos.getElement(i, [0, 0, 0]) as [number, number, number]
      const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!
      const wv = -(top ? m[2]! * x + m[6]! * y + m[10]! * z + m[14]! : m[1]! * x + m[5]! * y + m[9]! * z + m[13]!)
      return `${(nosePx! + (originAftM! - wx) * ppm).toFixed(1)},${(thrustPx! + wv * ppm).toFixed(1)}`
    }
    const count = idx ? idx.getCount() : pos.getCount()
    for (let t = 0; t < count; t += 3) {
      polygons.push(`<polygon points="${[0, 1, 2].map((k) => px(idx ? idx.getScalar(t + k) : t + k)).join(' ')}"/>`)
    }
  }
}
const meta = await sharp(drawingPath!).metadata()
const width = meta.width!, height = Math.min(meta.height!, cropBottomPx!)
const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><g fill="#e02020" fill-opacity="0.04">${polygons.join('')}</g></svg>`)
await sharp(drawingPath!).flatten({ background: '#ffffff' }).extract({ left: 0, top: 0, width, height }).composite([{ input: svg }]).png().toFile(outPath!)
console.log(`${outPath}: ${polygons.length} projected triangles, ${ppm.toFixed(3)} px/m`)
