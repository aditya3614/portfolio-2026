import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PROJECTS, ACCENT } from "../data/projects";

const mono = "'Courier New', monospace";

export default function ProjectDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const index = PROJECTS.findIndex((p) => p.slug === slug);
  const project = PROJECTS[index];

  if (!project) {
    return (
      <div className="space-ground" style={styles.root}>
        <div style={styles.notFound}>
          <p>PROJECT NOT FOUND</p>
          <Link to="/" style={styles.backLink}>‹ BACK TO WORK</Link>
        </div>
      </div>
    );
  }

  const prev = PROJECTS[(index - 1 + PROJECTS.length) % PROJECTS.length];
  const next = PROJECTS[(index + 1) % PROJECTS.length];

  return (
    <div className="space-ground" style={styles.root}>
      <div style={styles.topBar}>
        <span onClick={() => navigate("/")} style={styles.backLink}>‹ BACK TO WORK</span>
        <span style={styles.counter}>{project.id} / {String(PROJECTS.length).padStart(2, "0")}</span>
      </div>

      <div
        style={{
          ...styles.hero,
          background: `linear-gradient(135deg, ${project.colors[0]}, ${project.colors[1]})`,
        }}
      />

      <div style={styles.body}>
        <div style={styles.meta}>{project.year} — {project.tag}</div>
        <h1 style={styles.title}>{project.title}</h1>

        <div style={styles.infoGrid}>
          <div>
            <div style={styles.infoLabel}>CLIENT</div>
            <div style={styles.infoValue}>{project.client}</div>
          </div>
          <div>
            <div style={styles.infoLabel}>ROLE</div>
            <div style={styles.infoValue}>{project.role}</div>
          </div>
          <div>
            <div style={styles.infoLabel}>YEAR</div>
            <div style={styles.infoValue}>{project.year}</div>
          </div>
        </div>

        <p style={styles.description}>{project.description}</p>

        {project.links?.length > 0 && (
          <div style={styles.links}>
            {project.links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" style={styles.link}>
                {l.label} ↗
              </a>
            ))}
          </div>
        )}
      </div>

      <div style={styles.footerNav}>
        <Link to={`/work/${prev.slug}`} style={styles.navLink}>
          <div style={styles.navLabel}>‹ PREV</div>
          <div style={styles.navTitle}>{prev.title}</div>
        </Link>
        <Link to={`/work/${next.slug}`} style={{ ...styles.navLink, textAlign: "right" }}>
          <div style={styles.navLabel}>NEXT ›</div>
          <div style={styles.navTitle}>{next.title}</div>
        </Link>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    color: "#fff",
    fontFamily: mono,
  },
  topBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "22px 32px", borderBottom: "1px solid rgba(255,255,255,0.08)",
    fontSize: 12, letterSpacing: 1,
  },
  backLink: { color: ACCENT, cursor: "pointer", textDecoration: "none" },
  counter: { color: "rgba(255,255,255,0.4)" },
  hero: { width: "100%", height: "42vh", minHeight: 280 },
  body: { maxWidth: 760, margin: "0 auto", padding: "48px 32px" },
  meta: { fontSize: 12, letterSpacing: 1, color: "rgba(255,255,255,0.5)", marginBottom: 12 },
  title: { fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 600, fontFamily: "Helvetica, Arial, sans-serif", margin: "0 0 32px" },
  infoGrid: { display: "flex", gap: 40, flexWrap: "wrap", padding: "24px 0", borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 32 },
  infoLabel: { fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.4)", marginBottom: 6 },
  infoValue: { fontSize: 14, color: "rgba(255,255,255,0.9)" },
  description: { fontSize: 16, lineHeight: 1.7, color: "rgba(255,255,255,0.75)", fontFamily: "Helvetica, Arial, sans-serif" },
  links: { display: "flex", gap: 28, flexWrap: "wrap", marginTop: 32, fontSize: 12, letterSpacing: 1 },
  link: { color: ACCENT, textDecoration: "none" },
  footerNav: {
    display: "flex", justifyContent: "space-between", padding: "24px 32px",
    borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 13,
  },
  navLink: { color: "#fff", textDecoration: "none" },
  navLabel: { fontSize: 11, letterSpacing: 1, color: ACCENT, marginBottom: 4 },
  navTitle: { fontFamily: "Helvetica, Arial, sans-serif" },
  notFound: {
    minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 16, fontSize: 12, letterSpacing: 1,
  },
};
