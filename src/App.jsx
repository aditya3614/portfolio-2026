import { BrowserRouter, Routes, Route } from "react-router-dom";
import RingHero from "./sections/RingHero";
import Projects from "./sections/Projects";
import ExperienceWheel from "./sections/ExperienceWheel";
import About from "./sections/About";
import ProjectDetail from "./pages/ProjectDetail";

// One continuous scroll: each section is pinned for its own stretch and hands
// off to the next. Every section after the first pulls itself up by one
// viewport (see the -100vh in each) so the hand-offs have no gap.
function Home() {
  return (
    <>
      <RingHero />
      <Projects />
      <ExperienceWheel />
      <About />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/work/:slug" element={<ProjectDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
