// ---------------------------------------------------------------------------
// Card previews: one small, quiet animation per project, taken from the
// project itself. A project opts in with `preview: "<key>"` in
// data/projects.js; cards without one keep the placeholder pixel pet.
//
// There are two kinds. A drawn preview's factory takes a canvas resolution
// and returns:
//   canvas     a square canvas the card uploads as a texture
//   draw(s)    repaints it for a moment in time, in seconds
//   size, y    the square's side and centre height, in card units (the card
//              is 340×212 at desktop; the image area is its top 60%) — or
//              width/height/y for a non-square inset, or fill + aspect +
//              focusY to cover the whole image area
//   additive   optional: blend as light, for glowing previews
//   pixelated  optional: nearest-neighbour when magnified, for pixel art
// A video preview (videoPreview.js) returns a looping <video> instead, either
// inset (width, height, y) or full bleed across the card's image area. Either way the gallery owns playback, so it can
// pause previews that are out of view and hold a still for reduced motion.
// ---------------------------------------------------------------------------
import { createRepoAtlasGlobe } from "./repoAtlasGlobe";
import { createFlowJsMascot } from "./flowJsMascot";
import { createPerfLabChart } from "./perfLabChart";
import { createGlazeIcon } from "./glazeIcon";
import { videoPreview } from "./videoPreview";
import harwariumIntro from "../../assets/previews/harwarium-intro.mp4";

export const PREVIEWS = {
  "repo-atlas-globe": createRepoAtlasGlobe,
  "flowjs-mascot": createFlowJsMascot,
  // The landing intro, captured from the live site at 1440×900. Full bleed,
  // cropped to the top of the page, where the nav and headline animate in.
  "hardwarium-intro": videoPreview(harwariumIntro, { aspect: 16 / 10, still: 3, fill: true, focusY: 0 }),
  "perf-lab-chart": createPerfLabChart,
  "glaze-icon": createGlazeIcon,
};
