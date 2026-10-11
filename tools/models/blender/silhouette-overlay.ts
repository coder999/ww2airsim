// tools/models/blender/silhouette-overlay.ts
// Overlay a glTF side projection on a measured three-view drawing. This is a likeness-review tool,
// not a test: the caller supplies the drawing's pixel calibration and the model origin's distance aft
// of the spinner tip. Red dots are projected mesh vertices; moving parts except control surfaces are omitted.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { modelIO } from '../document.js'
import { worldPositions } from '../rig.js'

const argv = process.argv.slice(2)
if (argv.length !== 9) throw new Error('usage: npx tsx tools/models/blender/silhouette-overlay.ts <model.glb> <drawing.png> <out.png> <nosePx> <tailPx> <thrustPx> <originAftM> <lengthM> <cropBottomPx>')
const [modelPath, drawingPath, outPath] = argv
const [nosePx, tailPx, thrustPx, originAftM, lengthM, cropBottomPx] = argv.slice(3).map(Number)
if ([nosePx, tailPx, thrustPx, originAftM, lengthM, cropBottomPx].some((v) => !Number.isFinite(v))) throw new Error('pixel calibration and dimensions must be finite numbers')
const ppm = (tailPx! - nosePx!) / lengthM!
const doc = await modelIO().readBinary(new Uint8Array(readFileSync(modelPath!)))
const nodes = doc.getRoot().listNodes().filter((n) => !/^(Prop|GearL|GearR|GearNose|Tailwheel)$/.test(n.getName()))
const points = nodes.flatMap((n) => worldPositions(n)).map(([x, y]) => [nosePx! + (originAftM! - x!) * ppm, thrustPx! - y! * ppm] as const)
const meta = await sharp(drawingPath!).metadata()
const width = meta.width!, height = Math.min(meta.height!, cropBottomPx!)
const circles = points.filter(([x, y]) => x >= 0 && x < width && y >= 0 && y < height)
  .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.75"/>`).join('')
const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><g fill="#e02020" fill-opacity="0.48">${circles}</g></svg>`)
await sharp(drawingPath!).extract({ left: 0, top: 0, width, height }).composite([{ input: svg }]).png().toFile(outPath!)
console.log(`${outPath}: ${points.length} projected vertices, ${ppm.toFixed(3)} px/m`)
