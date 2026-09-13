import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type Texture,
} from 'three'

/**
 * Rasterises a short string into a texture for a panel plate.
 *
 * Injected everywhere it is used rather than called directly, for two reasons.
 * It needs a `<canvas>`, and nexus -- the machine this project is developed and
 * tested on -- has no DOM at all, so a direct call would make `createPanel`
 * unbuildable in the test suite. And the strings themselves are the part worth
 * asserting: a test passes a recording factory and checks that the altimeter
 * plate says "1234", which is a real claim about correctness. The pixels are a
 * reference-platform check and nothing here pretends otherwise.
 *
 * Returns `null` where there is no canvas. `MeshBasicMaterial.map` accepts
 * null, so the panel still builds with its geometry and layout intact and only
 * the lettering missing -- which is what a headless run should get, rather than
 * a throw.
 */
export type TextTextureFactory = (text: string, aspect: number) => Texture | null

/** Texture height. Width follows from the plate's aspect, so glyphs stay square. */
const TEXTURE_HEIGHT_PX = 96

export const makeTextTexture: TextTextureFactory = (text, aspect) => {
  if (typeof document === 'undefined' || text === '') return null

  const canvas = document.createElement('canvas')
  canvas.height = TEXTURE_HEIGHT_PX
  canvas.width = Math.max(1, Math.round(TEXTURE_HEIGHT_PX * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1)))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Shrink to fit rather than clipping or squashing. "AIRSPEED  m/s" is far
  // wider than "FUEL  kg", and a panel where one label is cropped mid-word is
  // worse than one where it is a little smaller. Monospace so a changing
  // readout does not jitter horizontally as its digits change width.
  let size = Math.round(TEXTURE_HEIGHT_PX * 0.72)
  const maxWidth = canvas.width * 0.94
  for (; size > 8; size--) {
    ctx.font = `600 ${size}px ui-monospace, "DejaVu Sans Mono", monospace`
    if (ctx.measureText(text).width <= maxWidth) break
  }

  // Dark outline first: the plates sit on a near-black panel but the numerals
  // sit over the dial face, and a stroke keeps them legible over either.
  ctx.lineWidth = Math.max(2, size * 0.14)
  ctx.strokeStyle = '#05080a'
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2)
  ctx.fillStyle = '#eef4f7'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // A mip chain, despite these being regenerated whenever a readout changes.
  // The first version skipped it, reasoning the text is "read at close to
  // 1:1"; measured at 1440p from 0.6 m, the label plates are 590x96 texels
  // drawn into about 357x58 px and the numerals 218x96 into about 88x39 --
  // 1.65x and 2.5x minification. That is the same defect I-6 had just fixed on
  // the water, reintroduced one commit later on the strength of an unmeasured
  // claim. 96 px tall is a few kilobytes; the chain is cheap.
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = 4
  texture.magFilter = LinearFilter
  return texture
}
