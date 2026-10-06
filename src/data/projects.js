// ---------------------------------------------------------------------------
// Project data: the real projects, in the order the gallery flies past them.
//
// `preview` names the card's animation in components/previews — something
// small taken from the project itself. Cards without one show a pixel pet.
// `links` are shown on the project's detail page.
// ---------------------------------------------------------------------------
export { ACCENT } from "../theme";

export const PROJECTS = [
  {
    id: "01", year: "2026", title: "Glaze", tag: "Screenshot Tool",
    // Its icon blue into the deep navy at the foot of its aurora.
    colors: ["#3b74d1", "#0b2447"], slug: "glaze",
    preview: "glaze-hero",
    client: "Self-Initiated", role: "Product Design, Front-End Engineering",
    description: "Screenshots, glazed to perfection. Glaze turns a raw screenshot into a share-ready image: drop, paste or pick one, then set it on a background preset or your own colour, frame it, tune the padding, roundness and shadow, add a touch of film grain, and hide anything private with one-drag redaction. Export at the scale you need, or copy straight to the clipboard. It all runs in the browser — nothing is ever uploaded. Built with React, TypeScript and Tailwind CSS.",
    links: [
      { label: "LIVE SITE", href: "https://www.glazed.website/" },
      { label: "SOURCE", href: "https://github.com/aditya3614/glaze" },
    ],
  },
  {
    id: "02", year: "2026", title: "Repo Atlas", tag: "Data Visualisation",
    // Its own night palette: the globe's pink over the map's near-black.
    colors: ["#f0518f", "#050205"], slug: "repo-atlas",
    preview: "repo-atlas-hero",
    client: "Self-Initiated", role: "Product Design, Front-End Engineering",
    description: "Paste one git log and Repo Atlas draws every file in a codebase as territory on a map, then plays the whole history back — who built what, what keeps changing, and which corners only one person understands. It runs entirely in the browser tab: a streaming parser and a columnar history model in a web worker read even a 100 MB log without freezing the page, and nothing is ever uploaded — it only sees commit metadata, never file contents.",
    links: [
      { label: "LIVE SITE", href: "https://repo-atlas-inky.vercel.app/" },
      { label: "SOURCE", href: "https://github.com/aditya3614/repo-atlas" },
    ],
  },
  {
    id: "03", year: "2026", title: "Shipped", tag: "GitHub Wrapped",
    // Its crimson over the darkest of its contribution squares.
    colors: ["#a52a3c", "#3a0f18"], slug: "shipped",
    preview: "shipped-hero",
    client: "Self-Initiated", role: "Product Design, Front-End Engineering",
    description: "Your code year, beautifully shipped. Type a GitHub username and Shipped wraps that person's year into a card worth posting: contributions, longest streak, rest days, stars and a coding persona, laid out over the year's own contribution squares. No sign-in and nothing stored — it reads public GitHub data and builds the card in the browser. Built with React, TypeScript and Tailwind CSS.",
    links: [
      { label: "LIVE SITE", href: "https://shippedv2.vercel.app/" },
      { label: "SOURCE", href: "https://github.com/aditya3614/shipped" },
    ],
  },
  {
    id: "04", year: "2026", title: "FlowJS", tag: "Learning Tool",
    // The mascot's red over FlowJS's near-black ink.
    colors: ["#E4483F", "#141413"], slug: "flowjs",
    preview: "flowjs-hero",
    client: "Self-Initiated", role: "Product Design, Front-End Engineering",
    description: "Write JavaScript and watch it run, one plain-English step at a time. Press Run and FlowJS replays your code: each step shows the line that's running, one sentence about what just happened, and a picture of that moment — variables, the call stack, loops and array pipelines — which you can play, scrub back and forth, or have read aloud. It records first and replays later: the code is parsed with acorn, instrumented with a note-taker at every step, and run in a sandboxed worker, all in the browser. No server, no login, and your code never leaves your machine.",
    links: [
      { label: "LIVE SITE", href: "https://flow-js-lovat.vercel.app/" },
      { label: "SOURCE", href: "https://github.com/aditya3614/flowJs--javascript-simulator" },
    ],
  },
  {
    id: "05", year: "2026", title: "Performance Lab", tag: "Monitoring Dashboard",
    // Its chart terracotta over near-black.
    colors: ["#cf6a43", "#14110f"], slug: "frontend-performance-lab",
    preview: "perf-lab-chart",
    client: "Self-Initiated", role: "Product Design, Front-End Engineering",
    description: "Frontend performance monitoring for web teams, built around one question: what became slower, why did it become slower, and exactly what changed? Frontend Performance Lab analyses monitored pages, stores every run, compares each one with a baseline, flags regressions against explicit thresholds and gathers the evidence — changed resources, new requests, long tasks, commits — then tracks the investigation until it's fixed. Evidence is labelled as a potential contributor or a correlated change, never presented as the cause. It runs entirely in demo mode on a seeded, deterministic history, so every screen is useful on first load. Built with Next.js and TypeScript.",
    links: [
      { label: "LIVE SITE", href: "https://frontend-performance-lab-six.vercel.app/" },
      { label: "SOURCE", href: "https://github.com/aditya3614/frontend-performance-lab" },
    ],
  },
  {
    id: "06", year: "2026", title: "Hardwarium", tag: "Studio Website",
    // The warm lamplight of its hero photo, over near-black.
    colors: ["#8a5a2b", "#0d0906"], slug: "hardwarium",
    preview: "hardwarium-intro",
    client: "Hardwarium", role: "Front-End Development",
    description: "A website for Hardwarium, a boutique interior design studio creating light-filled, emotionally resonant spaces — and a showroom for the hardware and surfaces it works with, from door handles, drawer channels and wardrobe fittings to PVC panels, plywood and laminates. It opens on a dim, lamplit room as the studio's three-word motto rises in line by line, with the navigation settling in after it. Built with React and Framer Motion.",
    links: [
      { label: "LIVE SITE", href: "https://harwarium.vercel.app/" },
    ],
  },
];
