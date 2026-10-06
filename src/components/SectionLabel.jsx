// The small label in the top-left of each section — Projects, Experience,
// About. One component so the three stay identical; the look lives in
// .section-label in index.css.
export default function SectionLabel({ children }) {
  return <span className="section-label">{children}</span>;
}
