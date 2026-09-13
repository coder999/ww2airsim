# spike/ — throwaway probes

Nothing in here is part of the game. Each subdirectory answers one question that
was cheaper to settle by running it than by reasoning about it, and is deleted
once its answer is recorded. Nothing under `src/` or `tools/` may import from
here, and `npm run verify` does not cover it — `tsconfig.json` and the lint
script both scope to `src`, `tests` and `tools` on purpose.

## webgpu-day0

Answers spec §15's day-0 questions on the reference platform. **Requires the
Windows desktop** — nexus is headless and cannot render.

On nexus:

```bash
npm run spike:webgpu
```

On the Windows desktop:

```bash
ssh -L 5173:localhost:5173 nexus
```

then open <http://localhost:5173> and click **Copy report to clipboard**.

The tunnel is not a convenience. `navigator.gpu` is exposed only in a secure
context, and a plain-HTTP LAN address such as `http://192.168.0.50:5173` is not
one — browsing by IP makes WebGPU unavailable before any other question can be
asked (spec §2). That is why the dev server binds loopback-only.

What it reports:

| Check | Why it matters |
| --- | --- |
| Secure context | Gates everything below it |
| `navigator.gpu` present | WebGPU available at all |
| `adapter.info` identifies the RX 6700 XT | A software rasterizer can present as a non-fallback adapter, and any frame-time budget or golden screenshot taken from one is worthless |
| TSL `workgroupArray` + `workgroupBarrier` | Verified **numerically** — the reduction returns a wrong sum if the barrier does not synchronise, so this tests behaviour rather than the presence of a symbol |
| TSL `StorageTexture` write | Reported separately, so a texture problem cannot masquerade as "TSL compute is broken" |
| Raw WGSL via `wgslFn` | Only runs if the TSL path fails — settles the spec's stated contingency in the same visit |

Verified on nexus 2026-09-12 against a no-GPU headless Chromium: the page loads,
correctly diagnoses the insecure context, stops, and renders a clean report with
an empty console. The GPU-present path is unexercised until it runs on the
reference platform — that is the whole point of it.

Delete this directory once the answers are recorded in the Plan 2 spec.
