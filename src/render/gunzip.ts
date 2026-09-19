/**
 * Inflates a fetched `.gz` body -- or leaves it alone if the server already
 * did.
 *
 * Found 2026-09-19 (Plan 16a, first GPU run): Vite's dev server sends a
 * `.gz` file with `Content-Encoding: gzip`, so the browser inflates it before
 * `fetch` hands it over, and piping those bytes through a second
 * `DecompressionStream` aborts the request (`net::ERR_ABORTED`, surfacing as
 * `TypeError: Failed to fetch`). Production nginx sends the raw bytes with no
 * encoding header, where the stream was right. The land-cover loader had
 * carried this since 2026-09-18 and painted procedurally in every dev-server
 * session with only a console warning to show for it.
 *
 * Deciding by the gzip magic (0x1f 0x8b) rather than by the response header
 * is what makes this correct on both servers and on any proxy in between.
 */
export async function inflateIfGzipped(body: ArrayBuffer): Promise<Uint8Array> {
  const bytes = new Uint8Array(body)
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  const inflated = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  return new Uint8Array(inflated)
}
