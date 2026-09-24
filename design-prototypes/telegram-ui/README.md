# Naval Communications UI -- design prototype

Static HTML/CSS/JS mockups for a "WWII naval personnel record / after-action
report" visual redesign of the game's menu UI (roster, debrief, settings).
Nothing here is wired into `src/`; it exists to be reviewed, then hand-ported
into the real DOM-overlay code (`src/render/roster.ts`, `debrief.ts`, and a
future settings screen) file by file.

Open any `.html` file directly in a browser -- no build step.

- `index.html` -- links to everything below.
- `roster.html` -- squadron roster / personnel record.
- `debrief.html` -- after-action report; a switcher at the top flips between
  the landed / ditched / killed outcome variants.
- `settings.html` -- speculative "requisition form" take on an options
  screen (the game has no settings screen yet -- this is a starting point,
  not a spec).
- `styleguide.html` -- every stamp color/size, the seal, and the shared form
  controls in one place, including a couple of stamps (P.O.W.) that are
  decorative examples only and don't map to any real game state.
- `assets/telegram.css` -- the shared design system (palette, letterhead,
  ruled tables, stamps, form controls). Porting this design later is mostly
  porting this one file.
- `assets/navy-seal.svg` -- original line-art insignia, not a reproduction
  of any official seal.

Fonts are pulled from Google Fonts at runtime (Special Elite for body/
typewriter text, Stardos Stencil for headers and stamps) -- fine for review,
worth revisiting (self-host or swap) before any of this lands in the real
game.
