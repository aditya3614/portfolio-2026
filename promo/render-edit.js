// node render-edit.js stills 1.0 3.2 …  → stills/e-*.jpg
// node render-edit.js                   → out/*.jpg (600 frames @ 30fps)
const { chromium } = require("playwright-core");
const fs = require("fs");
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const counts = {};
for (const d of fs.readdirSync(__dirname + "/clips", { withFileTypes: true })) if (d.isDirectory()) counts[d.name] = fs.readdirSync(`${__dirname}/clips/${d.name}`).filter((f) => /^f\d+\.jpg$/.test(f)).length;

(async () => {
  const browser = await chromium.launch({ executablePath: exe, headless: false, args: ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--allow-file-access-from-files"] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript((c) => { window.COUNTS = c; }, counts);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
  await page.goto("file://" + __dirname + "/edit.html");
  const cdp = await ctx.newCDPSession(page);
  const grab = async (t, file) => {
    await page.evaluate((t) => window.render(t), t);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 94 });
    fs.writeFileSync(file, Buffer.from(data, "base64"));
  };
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "stills") {
    fs.mkdirSync(__dirname + "/stills", { recursive: true });
    for (const t of rest) await grab(parseFloat(t), `${__dirname}/stills/e-${t}.jpg`);
  } else {
    fs.rmSync(__dirname + "/out", { recursive: true, force: true });
    fs.mkdirSync(__dirname + "/out");
    for (let f = 0; f < 600; f++) {
      await grab(f / 30, `${__dirname}/out/${String(f).padStart(4, "0")}.jpg`);
      if (f % 100 === 0) console.log("frame", f);
    }
  }
  await browser.close();
})();
