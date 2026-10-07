// Copy + photo manifest for the About section.

export const ABOUT = {
  eyebrow: "ABOUT",

  // Sits above the dust sphere before the dive. Gone as soon as the
  // camera starts moving, so it only has to hold a beat.
  heading: "A little peek\ninto my life.",

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
    "I believe there’s magic in software the kind that only happens when {mark|product}, {mark|design}, and {mark|engineering} work as one.",
    "I’m a {underline|frontend engineer} who sits somewhere between design and code",
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
// To add one: drop the original in src/assets/photos/, then convert it to the
// next free number (say 16) here:
//
//   ffmpeg -v error -y -i "src/assets/photos/<file>" \
//     -vf "crop='min(iw,ih*0.8)':'min(ih,iw/0.8)',scale=512:640:flags=lanczos" \
//     -q:v 4 src/assets/photos-web/photo-16.jpg
//
// ...and add 16 to FEATURED below, with a label if you like.
// ---------------------------------------------------------------------------
const files = import.meta.glob("../assets/photos-web/*.jpg", {
  eager: true,
  import: "default",
});

// photo-07.jpg -> 7
const byNumber = Object.fromEntries(
  Object.entries(files).map(([path, src]) => [Number(path.match(/photo-(\d+)\.jpg$/)?.[1]), src])
);

// Hover labels, by file number. Shown in the pill above a bubble and under
// the photo when it's opened. Leave one out and that bubble has no label.
// Empty for now: the photos run without captions.
const LABELS = {};

// Which photos make the cut, by file number, in order round the ring. Kept to
// a handful on purpose: the constellation reads as a few chosen moments, and
// each bubble can be big enough to actually see. Edit freely.
const FEATURED = [1, 13, 2, 14, 4, 15, 12];

const featured = FEATURED.filter((n) => byNumber[n]).map((n) => ({
  src: byNumber[n],
  label: LABELS[n] || "",
}));

export const PHOTOS = featured.length
  ? featured
  : // Nothing in photos-web/ yet: coloured bubbles with no image, so the
    // constellation still forms.
    Array.from({ length: 7 }, () => ({ src: null, label: "" }));

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
    { id: "instagram", label: "Instagram", href: "https://www.instagram.com/aditya_dave89/" },
    { id: "x", label: "Twitter /X ", href: "https://x.com/adityadave89" },
    { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/aditya-dave-aa68961b9/" },
    { id: "substack", label: "Substack", href: "https://substack.com/@adityadavee" },
    { id: "github", label: "GitHub", href: "https://github.com/aditya3614" },
    { id: "email", label: "Email", href: "mailto:adityadave992@gmail.com" },
  ],
};
