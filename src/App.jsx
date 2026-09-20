import { BrowserRouter, Routes, Route } from "react-router-dom";
// import Hero from "./sections/Hero";
// import PalaceHero from "./sections/PalaceHero";
import SunHero from "./sections/SunHero";
import Projects from "./sections/Projects";
import Experience from "./sections/Experience";
import About from "./sections/About";
import ProjectDetail from "./pages/ProjectDetail";

// One continuous scroll: each section is pinned for its own stretch and hands
// off to the next. Every section after the first pulls itself up by one
// viewport (see the -100vh in each) so the hand-offs have no gap.
function Home() {
  return (
    <>
      {/* <Hero /> */}
      {/* <PalaceHero /> */}
      <SunHero />
      <Projects />
      <Experience />
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
