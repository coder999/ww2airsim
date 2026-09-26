// tools/models/stages/textures.ts
import type { Document } from '@gltf-transform/core'
import { textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

/** Stage 7: every texture re-encoded as WebP, no side over `maxSize`. */
export async function compressTextures(doc: Document, maxSize: number): Promise<void> {
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxSize, maxSize] }))
}
