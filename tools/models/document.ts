// tools/models/document.ts
import { Node, NodeIO, type Document, type Mesh, type Scene } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

/** The one reader/writer every model tool uses. Every extension is registered, so a
 *  WebP- or KTX-textured input reads; the pipeline itself never adds a compression
 *  extension (A6M Zero spec §6.2: no decoder is wired into GLTFLoader). */
export function modelIO(): NodeIO {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS)
}

/** The document's only scene. Every input this project uses has exactly one. */
export function onlyScene(doc: Document): Scene {
  const scenes = doc.getRoot().listScenes()
  if (scenes.length !== 1) throw new Error(`expected exactly one scene, found ${scenes.length}`)
  return scenes[0]!
}

/** Exactly one node named `name`, or a thrown error naming it. */
export function findNode(doc: Document, name: string): Node {
  const matches = doc.getRoot().listNodes().filter((n) => n.getName() === name)
  if (matches.length !== 1) throw new Error(`node "${name}": expected exactly one, found ${matches.length}`)
  return matches[0]!
}

/** `root` and every node below it, parents first. */
export function subtree(root: Node): Node[] {
  const out: Node[] = []
  root.traverse((n) => { out.push(n) })
  return out
}

/** Nodes reachable from the scene that carry a mesh. */
export function meshNodes(doc: Document): Node[] {
  const out: Node[] = []
  onlyScene(doc).traverse((n) => { if (n.getMesh()) out.push(n) })
  return out
}

/** Gives `node` a mesh, and primitives, that nothing else references, so a
 *  transform baked into it moves nothing else. Returns that mesh. */
export function ownMesh(doc: Document, node: Node): Mesh | null {
  const mesh = node.getMesh()
  if (!mesh) return null
  const users = mesh.listParents().filter((p) => p instanceof Node)
  const primsShared = mesh.listPrimitives().some((p) => p.listParents().filter((q) => q !== mesh && q.propertyType === 'Mesh').length > 0)
  if (users.length <= 1 && !primsShared) return mesh
  const copy = doc.createMesh(mesh.getName())
  for (const p of mesh.listPrimitives()) copy.addPrimitive(p.clone())
  node.setMesh(copy)
  return copy
}

/** Detaches `node` from wherever it hangs and hangs it directly under the scene. */
export function moveToSceneRoot(doc: Document, node: Node): void {
  const parent = node.getParentNode()
  if (parent) parent.removeChild(node)
  const scene = onlyScene(doc)
  if (!scene.listChildren().includes(node)) scene.addChild(node)
}

/** Disposes `root` and everything below it. */
export function disposeSubtree(root: Node): void {
  for (const n of subtree(root).reverse()) n.dispose()
}
