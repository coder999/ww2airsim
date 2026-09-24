# Self-hosted fonts

Two fonts back the Naval Communications design system's
`--font-display`/`--font-body` custom properties
(`src/render/ui/naval-comms.css`), replacing the design prototype's runtime
`fonts.googleapis.com` fetch with files committed at `content/fonts/`. Both
are served in only the single weight/style the CSS actually references
(regular, no bold/italic).

Retrieved 2026-09-24 from Google Fonts' CDN
(`fonts.googleapis.com/css2?family=...`), which resolves to the `.woff2`
files below on `fonts.gstatic.com`. Licenses were verified against each
font's own metadata in the `google/fonts` GitHub repository, not assumed —
the two fonts turned out to carry **different** licenses:

## `special-elite.woff2`

- **Font:** Special Elite Regular, by Astigmatic (Brian J. Bonislawsky).
- **Source:** `https://fonts.gstatic.com/s/specialelite/v20/XLYgIZbkc4JPUL5CVArUVL0ntnAOSA.woff2`
- **License: Apache License, Version 2.0** — confirmed 2026-09-24 via
  `google/fonts`' `apache/specialelite/METADATA.pb` (`license: "APACHE2"`)
  and the accompanying `apache/specialelite/LICENSE.txt`
  (`https://github.com/google/fonts/blob/main/apache/specialelite/LICENSE.txt`).
  Apache-2.0 permits self-hosting and redistribution and is in this repo's
  AGPL-compatible list (`ASSETS.md`). This font is **not** OFL, despite
  sharing a Google Fonts listing page with one that is (below) — do not
  assume every Google Fonts entry is OFL.

## `stardos-stencil.woff2`

- **Font:** Stardos Stencil Regular, by Vernon Adams.
- **Source:** `https://fonts.gstatic.com/s/stardosstencil/v15/X7n94bcuGPC8hrvEOHXOgaKCc2Th6F52.woff2`
- **License: SIL Open Font License, Version 1.1** — confirmed 2026-09-24 via
  `google/fonts`' `ofl/stardosstencil/METADATA.pb` (`license: "OFL"`) and
  `ofl/stardosstencil/OFL.txt`
  (`https://github.com/google/fonts/blob/main/ofl/stardosstencil/OFL.txt`).
  OFL-1.1 explicitly permits embedding/self-hosting; the Reserved Font Name
  "Stardos"/"Stardos Stencil" restricts renaming modified versions, not
  unmodified redistribution as used here.

Neither font is re-encoded from what Google Fonts serves; each file is the
`.woff2` Google's own CDN returns for the regular weight. If a byte count in
`ASSETS.md` ever changes, something re-encoded a committed asset and that is
a defect, not an optimization.
