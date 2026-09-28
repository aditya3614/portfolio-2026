// ---------------------------------------------------------------------------
// Video card previews — for projects whose signature motion is easier to
// show than to rebuild: a short screen capture of the real thing, looped.
//
// Clips live in src/assets/previews. Keep them small (a few seconds, ~960px
// wide, H.264 MP4 so Safari plays them, no audio) and have them fade in from
// and out to black, so the loop point lands on the card's own dark panel
// instead of cutting.
// ---------------------------------------------------------------------------

/**
 * Returns a preview factory for one clip.
 *
 *   aspect   the clip's width / height
 *   still    the time, in seconds, to hold on for reduced motion — pick a
 *            moment after the clip's intro has settled
 *   fill     true: cover the card's whole image area, edge to edge from the
 *            top down to the title band, cropping the clip to fit
 *   focusY   with fill, which part of the clip survives the crop: 0 keeps
 *            its top, 0.5 its middle, 1 its bottom
 *   width, y without fill, an inset of that width (card units; the card is
 *            340 wide) centred at that height, at the clip's own aspect
 */
export function videoPreview(src, { aspect, still, fill = false, focusY = 0.5, width, y }) {
  return () => {
    const video = document.createElement("video");
    video.src = src;
    // Muted + playsInline is what lets it play without a user gesture,
    // including on iOS.
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "auto";
    return fill
      ? { video, aspect, still, fill, focusY }
      : { video, aspect, still, width, height: width / aspect, y };
  };
}
