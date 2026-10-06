// Records real-time footage of the live site as timestamped screencast frames,
// then resamples each shot to constant 30fps JPEGs in clips/<name>/.
//   node capture.js [shotName ...]     (default: all shots)
const { chromium } = require("playwright-core");
const fs = require("fs");
const { execSync } = require("child_process");
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:5199";
const OUT = __dirname + "/clips";

// Scroll smoothly (in-page, per rAF) through a list of [progress-in-section, seconds, holdSeconds] keys.
// `sec` indexes document <section>s; progress p maps to that section's pinned scroll range.
async function glide(page, sec, keys) {
  await page.evaluate(async ({ sec, keys }) => {
    const s = document.querySelectorAll("section")[sec];
    const y = (p) => s.offsetTop + p * (s.offsetHeight - innerHeight);
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const lin = (p) => p;
    let from = scrollY;
    for (const [p, dur, hold = 0, curve = "io"] of keys) {
      const to = y(p), f = curve === "lin" ? lin : ease;
      const t0 = performance.now();
      await new Promise((res) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
          window.scrollTo(0, from + (to - from) * f(k));
          k < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
      from = to;
      if (hold) await new Promise((r) => setTimeout(r, hold * 1000));
    }
  }, { sec, keys });
}
async function pageGlide(page, to, dur) {
  await page.evaluate(async ({ to, dur }) => {
    const from = scrollY, max = document.documentElement.scrollHeight - innerHeight, target = Math.min(max, to * max);
    const t0 = performance.now();
    await new Promise((res) => { const st = () => { const k = Math.min(1, (performance.now() - t0) / (dur * 1000)); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; scrollTo(0, from + (target - from) * e); k < 1 ? requestAnimationFrame(st) : res(); }; requestAnimationFrame(st); });
  }, { to, dur });
}
const jump = (page, sec, p) => page.evaluate(({ sec, p }) => {
  const s = document.querySelectorAll("section")[sec];
  window.scrollTo(0, s.offsetTop + p * (s.offsetHeight - innerHeight));
}, { sec, p });

// About releases one paragraph at a time; keep leaning on the end of the
// scroll until every stage has played, stopping just before the last one.
async function pushThroughStory(p) {
  await jump(p, 3, 0.4); await p.waitForTimeout(2000);
  for (let i = 0; i < 58; i++) { await jump(p, 3, 1); await p.waitForTimeout(500); }
}
const DESK = { width: 1920, height: 1080, dpr: 1 };
const PHONE = { width: 390, height: 844, dpr: 3, mobile: true };

// ---- shot list ----
const SHOTS = {
  // Ring hero idle sway, then the dive into the ring and out into the card flight.
  hero: { vp: DESK, url: "/", prep: async (p) => { await jump(p, 0, 0); await p.waitForTimeout(3000); },
    run: async (p) => { await p.waitForTimeout(1500); await glide(p, 0, [[1, 4.5, 0, "io"]]); await glide(p, 1, [[0.08, 1.5, 0, "lin"]]); } },
  // Flight through the project cards.
  projects: { vp: DESK, url: "/", prep: async (p) => { await jump(p, 1, 0.02); await p.waitForTimeout(2500); },
    run: async (p) => { await glide(p, 1, [[1, 8, 0.3, "lin"]]); } },
  // Experience corridor with the runner, all the way to the globe coming up.
  experience: { vp: DESK, url: "/", prep: async (p) => { await jump(p, 2, 0); await p.waitForTimeout(2500); },
    run: async (p) => { await glide(p, 2, [[1, 10, 0, "lin"]]); await glide(p, 3, [[0.06, 2.5, 0, "io"]]); } },
  // About: globe dive, photo bloom, story paragraphs (hold for the CSS effects), contact.
  about: { vp: DESK, url: "/", prep: async (p) => { await jump(p, 2, 0.93); await p.waitForTimeout(2500); },
    run: async (p) => {
      await glide(p, 3, [[0.0, 1.5], [0.2, 4, 0, "io"]]);
      // step through remaining stages, dwelling at each
      for (const q of [0.3, 0.42, 0.54, 0.66, 0.78, 0.9, 1.0]) await glide(p, 3, [[q, 1.4, 3.2]]);
    } },
  // Contact screen: sit through the chase paragraph's scroll hold first.
  contact: { vp: DESK, url: "/", prep: pushThroughStory,
    run: async (p) => { await jump(p, 3, 1); await p.waitForTimeout(6500); } },
  "m-contact": { vp: PHONE, url: "/", prep: pushThroughStory,
    run: async (p) => { await jump(p, 3, 1); await p.waitForTimeout(6500); } },
  // Phone framing.
  "m-hero": { vp: PHONE, url: "/", prep: async (p) => { await jump(p, 0, 0); await p.waitForTimeout(3000); }, run: async (p) => { await p.waitForTimeout(1000); await glide(p, 0, [[1, 4, 0]]); await glide(p, 1, [[0.3, 3, 0, "lin"]]); } },
  "m-experience": { vp: PHONE, url: "/", prep: async (p) => { await jump(p, 2, 0); await p.waitForTimeout(2500); }, run: async (p) => { await glide(p, 2, [[1, 8, 0, "lin"]]); } },
  "m-about": { vp: PHONE, url: "/", prep: async (p) => { await jump(p, 3, 0.3); await p.waitForTimeout(2500); },
    run: async (p) => { for (const q of [0.42, 0.54, 0.9, 1.0]) await glide(p, 3, [[q, 1.2, 2.6]]); } },
};

async function record(browser, name, shot) {
  const ctx = await browser.newContext({ viewport: { width: shot.vp.width, height: shot.vp.height }, deviceScaleFactor: shot.vp.dpr, isMobile: !!shot.vp.mobile, hasTouch: !!shot.vp.mobile });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(name, "PAGE ERROR", e.message));
  await page.goto(BASE + shot.url, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "::-webkit-scrollbar{display:none} html{scrollbar-width:none}" });
  await shot.prep(page);
  const dir = `${OUT}/${name}`, raw = `${dir}/raw`;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(raw, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const i = frames.length;
    fs.writeFileSync(`${raw}/${String(i).padStart(5, "0")}.jpg`, Buffer.from(f.data, "base64"));
    frames.push(f.metadata.timestamp);
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: shot.vp.width * shot.vp.dpr, maxHeight: shot.vp.height * shot.vp.dpr, everyNthFrame: 1 });
  await shot.run(page);
  await page.waitForTimeout(300);
  await cdp.send("Page.stopScreencast");
  await ctx.close();
  // Resample to CFR 30fps using each frame's real timestamp.
  const t0 = frames[0], dur = frames[frames.length - 1] - t0;
  let lst = "";
  for (let i = 0; i < frames.length; i++) {
    const d = i < frames.length - 1 ? frames[i + 1] - frames[i] : 1 / 30;
    lst += `file 'raw/${String(i).padStart(5, "0")}.jpg'\nduration ${d.toFixed(5)}\n`;
  }
  lst += `file 'raw/${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
  fs.writeFileSync(`${dir}/list.txt`, lst);
  execSync(`cd "${dir}" && ffmpeg -v error -y -f concat -safe 0 -i list.txt -vf "fps=30" -q:v 3 f%04d.jpg && rm -rf raw list.txt`);
  const n = fs.readdirSync(dir).length;
  console.log(`${name}: ${frames.length} raw frames over ${dur.toFixed(2)}s (${(frames.length / dur).toFixed(1)} fps) → ${n} frames @30`);
}

// Detail pages are static — a still of each is all the edit needs.
async function details(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  fs.mkdirSync(`${OUT}/details`, { recursive: true });
  for (const slug of ["repo-atlas", "flowjs", "hardwarium", "frontend-performance-lab", "glaze"]) {
    await page.goto(`${BASE}/work/${slug}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const cdp = await ctx.newCDPSession(page);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
    fs.writeFileSync(`${OUT}/details/${slug}.jpg`, Buffer.from(data, "base64"));
    await cdp.detach();
  }
  await ctx.close();
  console.log("details: 5 stills");
}

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
  const browser = await chromium.launch({ executablePath: exe, headless: false,
    args: ["--window-position=0,0", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--hide-scrollbars"] });
  for (const n of names) {
    if (n === "details") { const hb = await chromium.launch({ executablePath: exe }); await details(hb); await hb.close(); continue; }
    await record(browser, n, SHOTS[n]);
  }
  await browser.close();
})();
