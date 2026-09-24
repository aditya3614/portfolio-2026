// Copy + photo manifest for the About section.

export const ABOUT = {
  eyebrow: "ABOUT",

  // Sits above the dust sphere before the dive. Gone as soon as the
  // camera starts moving, so it only has to hold a beat.
  heading: "A world built out of\nthe places I've been.",
  meta: ["BASED IN BANGALORE", "AVAILABLE FOR WORK"],

  // Centred in the photo constellation after the burst, one paragraph at a
  // time — each gets its own stretch of scroll; the current one lifts away
  // upward as the next rises in from below. Add or remove freely — the
  // scroll is divided up evenly between however many there are.
  // Keep each under ~28 words to get the large type; longer ones step down
  // to body size (see .about-para--long).
  // Inline effects, written into the copy:
  //   {Aditya Dave}       name — coral gradient with a passing shine
  //   {magic|word}        the word condenses out of stardust
  //   {mark|word}         highlighter swipe (several in a row go in turn)
  //   {underline|words}   hand-drawn sketchy underline
  //   {circle|words}      hand-drawn loop circling the words
  //   {chase|words}       sketchy underline with two doodles running along it
  // Each one plays as its paragraph comes in.
  story: [
    "Hi, I’m {Aditya Dave}.",
    "I believe there’s {magic|magic} in software—the kind that only happens when {mark|product}, {mark|design}, and {mark|engineering} work as one.",
    "I’m a {underline|frontend engineer} who sits somewhere between design and code.",
    "I take rough ideas, figure out how they should feel, and obsess over the details until it actually {circle|feels right}.",
    "This portfolio is basically a collection of things I’ve built {chase|while chasing that feeling}." 
    
  ],
};

// ---------------------------------------------------------------------------
// The photos that bloom out of the burst in About, as round bubbles.
//
// Sourced from src/assets/photos-web/ — web-sized derivatives (512x640, centre
// cropped to 4:5) of the originals in src/assets/photos/. The originals are
// 3-4k phone photos; a 3024x4032 JPEG costs ~48MB of GPU memory once decoded,
// on a print that never renders more than a few hundred pixels across.
//
// To regenerate after adding to src/assets/photos/:
//
//   i=0; for f in src/assets/photos/*; do i=$((i+1)); \
//     ffmpeg -v error -y -i "$f" \
//       -vf "crop='min(iw,ih*0.8)':'min(ih,iw/0.8)',scale=512:640:flags=lanczos" \
//       -q:v 4 "$(printf 'src/assets/photos-web/photo-%02d.jpg' $i)"; done
//
// Globbed rather than imported one by one, so dropping more files in and
// re-running the command above is the whole workflow. Each photo becomes one
// bubble; the layout spreads itself over however many there are.
// ---------------------------------------------------------------------------
const files = import.meta.glob("../assets/photos-web/*.jpg", {
  eager: true,
  import: "default",
});

// Sorted by path: import.meta.glob's key order isn't guaranteed, and an
// unstable order would reshuffle the photos between builds.
const sources = Object.keys(files)
  .sort()
  .map((k) => files[k]);

// Hover labels, by position in the sorted list above (photo-01 first). Shown
// in the pill above a bubble and under the photo when it's opened. Leave an
// entry empty and that bubble simply has no label.
const LABELS = [
  "the dalmatian",
  "friday night",
  "friday night, again",
  "boats at dusk",
  "golden hour",
  "sun through the trees",
  "last light",
  "boatyard",
  "road trip",
  "beach sunset",
  "birthday",
  "the horse",
  "under the canopy",
  "dessert first",
  "canopy, again",
  "photobooth strips",
  "festival day",
  "mirror selfie",
  "bollywood night",
  "good company",
];

// Which photos make the cut, by file number (photo-01 = 1). Kept to a
// handful on purpose: the constellation reads as a few chosen moments, and
// each bubble can be big enough to actually see. Edit freely.
const FEATURED = [1, 2, 5, 9, 11, 14, 19, 20];

const all = sources.map((src, i) => ({ src, label: LABELS[i] || "" }));
const featured = FEATURED.map((n) => all[n - 1]).filter(Boolean);

export const PHOTOS = sources.length
  ? featured.length ? featured : all
  : // Nothing in photos-web/ yet: coloured bubbles with no image, so the
    // constellation still forms.
    Array.from({ length: 10 }, () => ({ src: null, label: "" }));

// ---------------------------------------------------------------------------
// The last screen of the page. Fill in each href; one left empty still shows
// its circle (so the row keeps its shape while you're filling these in) but
// goes nowhere. Delete an entry to drop it entirely.
// ---------------------------------------------------------------------------
export const CONTACT = {
  // The pill above the heading, with a live "available" dot.
  badge: "Open to work",
  heading: "Let's build something\nthat feels right.",
  links: [
    { id: "instagram", label: "Instagram", href: "" },
    { id: "x", label: "Twitter / X", href: "" },
    { id: "linkedin", label: "LinkedIn", href: "" },
    { id: "substack", label: "Substack", href: "" },
    { id: "github", label: "GitHub", href: "" },
    { id: "email", label: "Email", href: "" }, // "mailto:you@example.com"
  ],
};
