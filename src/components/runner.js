// The doodled stick figure for About's chase under "feeling". All paths are
// in a 24 x 32 viewBox, facing right, feet at y ≈ 29.4; the head is a circle at
// (13.4, 5.2) r 3.1 drawn separately.

// Mid-run, in two frames that alternate — the classic two-drawing run
// cycle. Drawn leaning forward.
export const RUNNER_FRAMES = [
  // stride: right leg reaching forward, left kicked back; arms opposite
  "M12.8 8.6 10.6 18M12 11.5 16.2 13.6 18.6 11.2M12 11.5 8.6 13.4 6.4 16.8M10.6 18 15 22.4 15.6 29.4M10.6 18 7.2 22.6 3 23.6",
  // the other stride: legs and arms trade places
  "M12.8 8.6 10.6 18M12 11.5 8.8 14.6 7.2 12M12 11.5 15.8 14.6 15.2 18M10.6 18 13.6 23.2 11.6 29.4M10.6 18 8.4 23.4 4.6 26.6",
];
