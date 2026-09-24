# Portfolio 2026 — context for AI agents

Read this before changing anything. It's the brief: what this site is, the
feel it's going for, how it's built, and what has already been tried and
rejected. The code comments carry the detail; this carries the intent.

## What this is

Aditya Dave's personal portfolio — a frontend engineer who sits between
design and code. The site is itself the main portfolio piece: it has to feel
crafted, unreal, and effortless, the kind of thing people scroll twice.

**The ambition:** one continuous, cinematic journey through space, driven
entirely by scroll. Not a page of sections — a single camera flight where
each section is a place you pass through and every hand-off feels like the
same motion carrying on. Jaw-dropping, but never busy.

## The journey (page order, `src/App.jsx`)

1. **SunHero** (`sections/SunHero.jsx`) — a dithered pixel sun made of
   chunky square blocks with hairline gaps, six-step heat palette. Scroll
   flies the camera into it until the blocks fall away. A few pixel comets
   drift behind.
2. **Projects** (`sections/Projects.jsx`) — three.js "space flight gallery".
   Project cards alternate left/right of a straight camera path, spaced in
   depth; scrolling flies forward through them. Mono HUD along the bottom
   (VEL / Z / SCRL). Cards link to `/work/:slug` (`pages/ProjectDetail.jsx`).
3. **Experience** (`sections/Experience.jsx`) — company names spelled in the
   sun's blocks, hung like stars along a zig-zag corridor (same left/right
   rhythm as Projects). A dotted line draws from one company to the next and
   a doodled stick figure travels it — **run → cycle → surf → fly
   (Superman, red cape)** — ending at Juspay, arms up. The camera then
   carries straight on toward About's globe.
4. **About** (`sections/About.jsx`) — a dust globe that comes up out of the
   dark as Experience flies toward it, then the camera dives in; photos bloom
   into a ring, the story plays one paragraph at a time with hand-drawn inline
   effects, and it ends on a contact screen.

`Hero.jsx` and `PalaceHero.jsx` are older hero experiments, currently unused.

## Visual language

- **Ground:** warm near-black `#0b0705` with a faint 44px grid
  (`.space-ground` in `index.css`, `GROUND` in `theme.js`). Every section sits
  on it so crossfades between sections are invisible.
- **Accent:** one red, `#ff3b30` (`ACCENT` in `theme.js`). Used sparingly —
  eyebrow labels, role titles, markers, the flyer's cape.
- **The sun palette** (SunHero, reused by Experience's block text):
  `#ffe800 #ffc400 #ff8a00 #ff4d0d #b33100 #6b1d00`, hot core to cold rim.
- **About's palette** is cool: periwinkle / ice blue / white / a little mint.
  The page moves from warm (sun) to cool (About's globe).
- **Type:** HUD and metadata in `'Courier New', monospace`, small, uppercase,
  wide letter-spacing. Display copy in Geist/Helvetica. Pixel-block text is
  sampled from Arial Black onto a block grid.
- **The doodle character** (`components/runner.js`): a hand-drawn cream
  (`#f4ede4`) stick figure with an SVG turbulence "line boil" so it jitters
  like flipbook frames. Shared by About (the chase under "feeling") and
  Experience (the journey). All poses live in that file.
- **Shapes:** square blocks, hairline gaps, specks of dust. No rounded
  glassy UI, no gradients-for-decoration.

Note: `design.md` is a style reference taken from another site (Tableland —
Poppins, teal/mint). It is **not** this project's theme; don't apply it.

## Motion principles (the feel)

- **Scroll is the only timeline.** Every section reads real document scroll
  via `useScrollProgressRef` (`hooks/useScrollProgress.js`). Never hijack the
  wheel or `preventDefault` scroll; never run an independent virtual scroll.
- **The camera always moves forward.** Transitions between sections are
  camera moves, not cuts or plain fades. The next section should already be
  in motion (or already visible ahead) when it takes over.
- **Hold to read.** Wherever there's text, give it a dwell in the scroll
  mapping (see `DWELL` in Experience) so it's not always mid-transition.
- **One focal thing at a time.** Things further ahead fade out of the dark
  (fog) instead of piling up in perspective.
- **Restraint.** Wow comes from one strong idea executed smoothly, not from
  many effects stacked. Keep ambient detail sparse and dim.
- **Mobile is first-class.** Portrait screens get their own framing (e.g.
  Experience's path climbs upward on phones, distant names shrink).
- Respect `prefers-reduced-motion`.

## How sections are built (conventions)

- **Pinned sections:** each section is a tall `<section>` (height in `vh`)
  with a `position: fixed` stack inside. Every section after the first has
  `marginTop: -100vh` so hand-offs have no gap. Stacks are layered by
  `zIndex` (Projects 5 → Experience 6 → About 7); the later section fades in
  over the earlier via `entryRef` and the earlier one never fades out.
  About uses a longer fade (`ARRIVAL`) so its globe can approach.
- **Render loops start lazily:** an `IntersectionObserver` with
  `rootMargin: "50% 0px"` gates setup and the rAF loop per section.
- **Per-frame work goes through refs,** never React state — state only for
  things that change rarely (e.g. the active company).
- **Performance:** batch canvas draws by colour (one path per palette step);
  one draw call for particle systems; cap `devicePixelRatio` at 2 (lower on
  weak devices); cull off-screen work.
- **Touch:** full-viewport canvases use `touch-action: pan-y`, never `none`.
- **Comments explain *why*,** in full sentences, generously — match that
  density and voice when editing.
- Plain JS/JSX (no TypeScript), inline style objects or a section CSS file
  (`about.css`, `experience.css`, `sun-hero.css`). React 19, Vite, three.js
  for Projects/About, canvas 2D for SunHero/Experience.

## Content lives in `src/data/`

- `experience.js` — roles, oldest first (Juspay, current, last). Company
  names are rendered as block text; `role`, `period`, `blurb` are shown
  underneath. Keep facts as the owner wrote them; polishing wording is fine.
- `projects.js` — project cards (currently placeholders).
- `about.js` — About copy (with inline effect markup, documented there),
  the photo manifest, and contact links.

## What's been tried and rejected — don't bring these back

- A busy galaxy with many star shades and effects for Experience ("too
  preachy").
- A glass/goo WebGL card carousel — didn't fit the theme.
- Words exploding and re-forming in place (changing "fonts") — replaced by
  the journey between fixed stars.
- A second copy of About's globe drawn inside Experience — keep one globe.
- The character jumping into the globe, and hyperspace streak lines — the
  transition should be the camera alone.
- "SCROLL" hint text between Projects and Experience.
- Hard fades where one section just replaces another.

## Working on it

- `npm run dev` to run; `npm run build` must pass. `npm run lint` has a few
  known older errors in `Projects.jsx`, `Astronaut.jsx` and
  `ProjectDetail.jsx`; don't add new ones, and lint the files you touch.
- Visual checks: screenshot key scroll positions at desktop (1440×900) and
  phone (390×844) — e.g. with Playwright, scrolling to computed positions
  within a section's height — before calling a visual change done.
- The owner judges by feel: smooth, natural, "unreal". When unsure between
  more and less, choose less, done better.
