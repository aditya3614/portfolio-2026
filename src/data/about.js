// Copy + photo manifest for the About section.

export const ABOUT = {
  eyebrow: "ABOUT",

  // Sits in the lower left while the planet is whole. Deliberately short —
  // it shares the screen with the globe, so it can only be a caption.
  heading: "A world built out of\nthe places I've been.",
  meta: ["BASED IN BANGALORE", "AVAILABLE FOR WORK"],

  // What's left once the planet bursts. This owns the whole screen with
  // nothing to compete against, so it's the one place on the page that can
  // afford actual prose. Paragraphs resolve one after another.
  story: [
    "I believe there‘s magic in software—the kind that only happens when product, design, and engineering work as one. " +
      "" +
      "",
    "I’m a frontend engineer who sits somewhere between design and code. I enjoy taking a rough idea, figuring out how it should feel, and then obsessing over the little details until it actually feels right " +
      "Good interactions. Smooth animations. Thoughtful interfaces. Code that doesn’t fight the design. " +
      "surprises you. You only notice any of it when it's missing.",
    "This portfolio is basically a collection of things I’ve built while chasing that feeling." 
    
  ],
};

// ---------------------------------------------------------------------------
// The crust of the planet.
//
// Sourced from src/assets/photos-web/ — web-sized derivatives (512x640, centre
// cropped to the tile's 4:5) of the originals in src/assets/photos/. The
// originals are 3-4k phone photos, and the size that matters isn't the
// download: a 3024x4032 JPEG costs ~48MB of GPU memory once decoded, on a tile
// that never renders more than a few hundred pixels across. Twenty of those
// would cost more texture memory than the whole rest of the page.
//
// To regenerate after adding to src/assets/photos/:
//
//   i=0; for f in src/assets/photos/*; do i=$((i+1)); \
//     ffmpeg -v error -y -i "$f" \
//       -vf "crop='min(iw,ih*0.8)':'min(ih,iw/0.8)',scale=512:640:flags=lanczos" \
//       -q:v 4 "$(printf 'src/assets/photos-web/photo-%02d.jpg' $i)"; done
//
// Globbed rather than imported one by one, so dropping more files in and
// re-running the command above is the whole workflow — nothing here changes.
// ---------------------------------------------------------------------------
const files = import.meta.glob("../assets/photos-web/*.jpg", {
  eager: true,
  import: "default",
});

// Sorted by path: import.meta.glob's key order isn't guaranteed, and an
// unstable order would reshuffle the whole globe between builds.
const sources = Object.keys(files)
  .sort()
  .map((k) => files[k]);

// Tiles wanted on the sphere. Tile size is derived from the count in
// About.jsx (surface area / count), so this is what sets how fine-grained the
// crust looks — not how many photos you happen to have.
const TARGET_TILES = 76;

// With fewer photos than tiles, each photo is used more than once. That's on
// purpose: a planet needs a closed surface, and twenty tiles at this radius is
// a handful of billboards in a ring, not a world. Repeats aren't visible as
// repeats because the Fibonacci lattice places consecutive indices a golden
// angle apart — tiles that end up physically adjacent are dozens of indices
// apart, so the same photo never lands next to itself.
const reps = sources.length ? Math.max(1, Math.round(TARGET_TILES / sources.length)) : 0;

export const PHOTOS = sources.length
  ? Array.from({ length: sources.length * reps }, (_, i) => ({
      src: sources[i % sources.length],
      caption: `IMG ${String((i % sources.length) + 1).padStart(2, "0")}`,
    }))
  : // Nothing in photos-web/ yet: fall back to generated placeholders so the
    // section still builds a planet rather than rendering an empty core.
    Array.from({ length: TARGET_TILES }, (_, i) => ({
      src: null,
      caption: `IMG ${String(i + 1).padStart(2, "0")}`,
    }));
