// The doodled stick figure — drawn once, shared by About (the chase under
// "feeling") and Experience (the run between companies). All paths are in a
// 24 x 32 viewBox, facing right, feet at y ≈ 29.4; the head is a circle at
// (13.4, 5.2) r 3.1 drawn separately.

// Mid-run, in two frames that alternate — the classic two-drawing run
// cycle. Drawn leaning forward.
export const RUNNER_FRAMES = [
  // stride: right leg reaching forward, left kicked back; arms opposite
  "M12.8 8.6 10.6 18M12 11.5 16.2 13.6 18.6 11.2M12 11.5 8.6 13.4 6.4 16.8M10.6 18 15 22.4 15.6 29.4M10.6 18 7.2 22.6 3 23.6",
  // the other stride: legs and arms trade places
  "M12.8 8.6 10.6 18M12 11.5 8.8 14.6 7.2 12M12 11.5 15.8 14.6 15.2 18M10.6 18 13.6 23.2 11.6 29.4M10.6 18 8.4 23.4 4.6 26.6",
];

// Standing still, weight even, arms loose.
export const RUNNER_STAND =
  "M13.2 8.4 12.6 18.2M13 11.4 10.4 16.6M13 11.4 15.6 16.4M12.6 18.2 10.8 29.4M12.6 18.2 14.4 29.4";

// Arms thrown up — arrived.
export const RUNNER_CHEER =
  "M13.2 8.4 12.6 18.2M13 11.2 9.4 7.6 8.6 3.8M13 11.2 16.8 7.6 17.8 3.8M12.6 18.2 10.4 29.4M12.6 18.2 14.8 29.4";

// ---------------------------------------------------------------------------
// The journey poses used in Experience. These sit in a wider 48 x 32 viewBox
// (a bike or a flying figure is longer than it is tall), facing right, with
// the ground at y ≈ 29.4 and the figure centred on x = 24. Each pose is a
// list of parts; `kind` picks how a part is painted:
//   ink    the doodle line itself
//   faint  speed lines, drawn lighter
//   cape   filled red
//   wave   the water, in the comets' cool blue
// ---------------------------------------------------------------------------

const circle = (cx, cy, r) =>
  `M${+(cx - r).toFixed(2)} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

// The 24-wide paths above, moved to the middle of the 48-wide box. Every
// command in them is absolute with x,y pairs, so shifting every other
// number is enough.
const widen = (d) => {
  let n = 0;
  return d.replace(/-?\d+(\.\d+)?/g, (v) => (n++ % 2 === 0 ? String(+v + 12) : v));
};
const HEAD = circle(25.4, 5.2, 3.1);
const onFoot = (d) => [{ kind: "ink", d: HEAD + widen(d) }];

const WHEELS = circle(12, 24.2, 5.2) + circle(35, 24.2, 5.2);
const FRAME =
  "M12 24.2 22 24.2 19.5 14.5 12 24.2M19.5 14.5 32 14.5 22 24.2M32 14.5 35 24.2M32 14.5 31 11.5 34.5 11M17.8 14 21.4 14";
const RIDER = circle(29.4, 4, 2.9) + "M19.8 13.4 27 7.2M27 7.6 30.5 10 34 11.2";

const FLYER =
  circle(40.5, 13.6, 2.9) +
  "M36.5 15.8 24 18.2M36.5 15.8 41.5 11.8 46 10.6M35.5 16.6 30.5 19.4 27.2 20M24 18.2 15.5 18.6 7.5 18.2M24 18.6 16 20.6 8.2 21.4";

const SURFER =
  circle(26.6, 7, 2.8) +
  // board, then a low crouch across it, arms out for balance
  "M11 25.2C15 24 34 24 39.5 24.6 36 26.8 16 27.4 11 25.2Z" +
  "M19 24.8 20.5 19.5 24 17M29 24.8 27.5 20 24 17M24 17 25.5 10.5" +
  "M25.5 11 30 11.8 34 10.4M25.5 11 21 12.8 17 11.6";

export const JOURNEY_POSES = {
  run: RUNNER_FRAMES.map(onFoot),
  stand: onFoot(RUNNER_STAND),
  cheer: onFoot(RUNNER_CHEER),
  // Pedals half a turn apart between the two frames, spokes turning with them.
  cycle: [
    [
      {
        kind: "ink",
        d:
          WHEELS + FRAME + RIDER +
          "M6.8 24.2 17.2 24.2M29.8 24.2 40.2 24.2M25.2 22.4 18.8 26M19.8 13.4 25 16.6 25.2 22.4M19.8 13.4 23.5 19.5 18.8 26",
      },
    ],
    [
      {
        kind: "ink",
        d:
          WHEELS + FRAME + RIDER +
          "M12 19 12 29.4M35 19 35 29.4M21 27.7 23 20.7M19.8 13.4 24.4 19 21 27.7M19.8 13.4 25.4 15.2 23 20.7",
      },
    ],
  ],
  // Fist out front, cape streaming behind, in two flaps.
  fly: [
    [
      { kind: "cape", d: "M36 15C30 10.8 22 12.4 14.6 10.2 17 13 15.4 14.2 12.4 15.6 19 16.6 27 16.8 35.2 16.6Z" },
      { kind: "faint", d: "M2 12h6M0.5 16.5h5M3 23h5" },
      { kind: "ink", d: FLYER },
    ],
    [
      { kind: "cape", d: "M36 15C30 12.4 22 9.6 13.6 12.6 16.8 14.2 15 16.6 12.8 18.2 20 17.2 27.4 17.6 35.2 16.6Z" },
      { kind: "faint", d: "M1 13h5M2.5 18h6M0.5 22h4" },
      { kind: "ink", d: FLYER },
    ],
  ],
  // Riding a wave: the swell rolls under the board and the curl behind him
  // breaks, in two frames.
  surf: [
    [
      {
        kind: "wave",
        d: "M0 29C4 26.5 8 26.5 12 29S20 31.5 24 29 32 26.5 36 29 44 31.5 48 29M2 27C1 21 5 16.5 10 17 7 18.5 6.5 21.5 9 23",
      },
      { kind: "faint", d: "M40 22h1M43 20h1M42 24h1" },
      { kind: "ink", d: SURFER },
    ],
    [
      {
        kind: "wave",
        d: "M0 29C4 31.5 8 31.5 12 29S20 26.5 24 29 32 31.5 36 29 44 26.5 48 29M1 26.5C0.5 20.5 4.5 16 9.6 16.2 6.8 18 6 21 8.4 23",
      },
      { kind: "faint", d: "M41 21h1M44 23h1M39 19h1" },
      { kind: "ink", d: SURFER },
    ],
  ],
};
