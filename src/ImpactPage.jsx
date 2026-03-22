import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useInView, animate } from "framer-motion";

/* ── BlurText: words animate from blurred to focused ────── */
function BlurText({ text, delay = 80, className = "", style = {} }) {
  const words = text.split(" ");
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: "0.3em", justifyContent: "center", ...style }} className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ filter: "blur(12px)", opacity: 0, y: 12 }}
          whileInView={{ filter: "blur(0px)", opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, delay: i * (delay / 1000), ease: "easeOut" }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

/* ── GradientText: animated gradient sweep ──────────────── */
function GradientText({ children, colors = ["#6fcf97", "#4ecdc4", "#a8edea"], speed = 4, style = {} }) {
  const gradient = `linear-gradient(90deg, ${colors.join(", ")}, ${colors[0]})`;
  return (
    <span style={{
      background: gradient,
      backgroundSize: "200% 100%",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      animation: `gvGradientSweep ${speed}s linear infinite`,
      ...style,
    }}>
      {children}
    </span>
  );
}

/* ── CountUp: animate a number from 0 ──────────────────── */
function CountUp({ target, duration = 2, prefix = "", suffix = "", decimals = 0, style = {} }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const ctrl = animate(0, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setValue(v),
    });
    return () => ctrl.stop();
  }, [inView, target, duration]);

  return (
    <span ref={ref} style={style}>
      {prefix}{decimals > 0 ? value.toFixed(decimals) : Math.round(value)}{suffix}
    </span>
  );
}

/* ── AnimatedContent: scroll-triggered fade/slide ───────── */
function AnimatedContent({ children, direction = "up", delay = 0, className = "", style = {} }) {
  const yMap = { up: 40, down: -40 };
  const xMap = { left: 40, right: -40 };
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: yMap[direction] || 0,
        x: xMap[direction] || 0,
      }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.23, 1, 0.32, 1] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

const PROCESS = [
  { num: "01", title: "Collect", desc: "Bottle caps and PET containers are collected from local communities, schools, and recycling partners across Southeast Asia.", icon: "♻" },
  { num: "02", title: "Shred & Clean", desc: "Collected plastic is sorted by type, shredded into flakes, thoroughly washed, and dried to remove contaminants.", icon: "⚙" },
  { num: "03", title: "Extrude Filament", desc: "Clean plastic flakes are melted and extruded into 3D printing filament, with colour pigment mixed in at this stage.", icon: "◎" },
  { num: "04", title: "3D Print", desc: "Each pair is printed to order using the customer's exact specifications from our configurator. No waste, no overstock.", icon: "◈" },
  { num: "05", title: "Assemble & Ship", desc: "Lenses are fitted, hinges attached, and quality checked before shipping directly to the customer.", icon: "→" },
];

export default function ImpactPage() {
  useEffect(() => {
    const id = "gv-impact-styles";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      * { box-sizing: border-box; }
      @keyframes gvGradientSweep { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
      @media (max-width: 480px) {
        .impact-cost-grid { grid-template-columns: 1fr !important; }
        .impact-stats-grid { grid-template-columns: 1fr 1fr !important; }
      }
    `;
    document.head.appendChild(s);
  }, []);

  return (
    <div style={{ width: "100%", maxWidth: 900, margin: "0 auto", padding: "0 24px 80px", textAlign: "left", boxSizing: "border-box", overflowX: "hidden" }}>

      {/* HERO */}
      <section style={{ paddingTop: 60, paddingBottom: 60, textAlign: "center" }}>
        <AnimatedContent>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.55, marginBottom: 20, fontWeight: 600 }}>
            Our Mission
          </p>
        </AnimatedContent>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 500, lineHeight: 1.15, margin: "0 0 24px" }}>
          <BlurText text="Affordable support for everyone." delay={100} />
        </h1>

        <AnimatedContent delay={0.3}>
          <p style={{ fontSize: 16, lineHeight: 1.8, opacity: 0.7, maxWidth: 600, margin: "0 auto 16px" }}>
            OPTIQ turns post-consumer plastic into custom eyewear using 3D printing.
            But glasses are just the beginning.
          </p>
        </AnimatedContent>

        <AnimatedContent delay={0.5}>
          <p style={{ fontSize: 15, lineHeight: 1.8, opacity: 0.6, maxWidth: 580, margin: "0 auto" }}>
            We believe access to prosthetics and assistive devices shouldn't depend on your income.
            By proving that <GradientText>recycled materials + digital fabrication</GradientText> can produce reliable, comfortable eyewear at a fraction of the cost, we're building the foundation for affordable prosthetics for all.
          </p>
        </AnimatedContent>
      </section>

      {/* STATS */}
      <section className="impact-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, marginBottom: 80 }}>
        {[
          { target: 82, suffix: "%", label: "Less CO2 vs virgin plastic", color: "#6fcf97" },
          { target: 12, suffix: " caps", label: "Recycled per pair", color: "#4ecdc4" },
          { target: 500, prefix: "₱", suffix: "", label: "Average pair cost", color: "#a8edea" },
          { target: 24, suffix: "g", label: "Plastic per frame", color: "#6fcf97" },
        ].map((stat, i) => (
          <AnimatedContent key={i} delay={i * 0.1} style={{ display: "flex", height: "100%" }}>
            <div style={{
              flex: 1, padding: "28px 16px", borderRadius: 16, textAlign: "center",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              display: "flex", flexDirection: "column", justifyContent: "center"
            }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(28px, 6vw, 40px)", fontWeight: 600, margin: "0 0 4px", color: stat.color }}>
                <CountUp target={stat.target} prefix={stat.prefix || ""} suffix={stat.suffix} duration={2.5} />
              </p>
              <p style={{ fontSize: 11, opacity: 0.6, margin: 0, letterSpacing: 0.5 }}>{stat.label}</p>
            </div>
          </AnimatedContent>
        ))}
      </section>

      {/* THE BIGGER PICTURE */}
      <section style={{ marginBottom: 80, textAlign: "center" }}>
        <AnimatedContent>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.5, marginBottom: 12, fontWeight: 600 }}>
            The Bigger Picture
          </p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 500, margin: "0 0 20px", lineHeight: 1.2 }}>
            Glasses are our first step.<br />
            <GradientText colors={["#6fcf97", "#4ecdc4", "#88d8c0"]}>Prosthetics are the destination.</GradientText>
          </h2>
        </AnimatedContent>

        <AnimatedContent delay={0.15}>
          <p style={{ fontSize: 15, lineHeight: 1.9, opacity: 0.65, maxWidth: 650, margin: "0 auto 16px" }}>
            2.7 billion people worldwide need glasses but can't access or afford them. In Southeast Asia alone, millions of students struggle in school because of uncorrected vision. Traditional eyewear supply chains are expensive, slow, and designed for wealthy markets.
          </p>
        </AnimatedContent>

        <AnimatedContent delay={0.2}>
          <p style={{ fontSize: 15, lineHeight: 1.9, opacity: 0.65, maxWidth: 650, margin: "0 auto 16px" }}>
            OPTIQ's approach changes that equation entirely. By 3D printing from recycled plastic, we eliminate traditional manufacturing overhead, reduce cost by over 80%, and produce on-demand with zero waste. Every pair is custom-fitted.
          </p>
        </AnimatedContent>

        <AnimatedContent delay={0.25}>
          <p style={{ fontSize: 15, lineHeight: 1.9, opacity: 0.65, maxWidth: 650, margin: "0 auto" }}>
            The same technology, materials, and supply chain we're building for eyewear scales directly into prosthetic limbs, hearing aids, orthotics, and other assistive devices. Team Quincers and OPTIQ are committed to making reliable support affordable for everyone who needs it.
          </p>
        </AnimatedContent>
      </section>

      {/* COST COMPARISON */}
      <section style={{ marginBottom: 80, textAlign: "left" }}>
        <AnimatedContent>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.5, marginBottom: 12, fontWeight: 600 }}>
            Cost Breakdown
          </p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, margin: "0 0 24px" }}>
            Traditional vs OPTIQ
          </h2>
        </AnimatedContent>

        <div className="impact-cost-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <AnimatedContent direction="left" delay={0.1} style={{ display: "flex", height: "100%" }}>
            <div style={{
              flex: 1, padding: "28px 24px", borderRadius: 16,
              background: "rgba(255,80,80,0.04)", border: "1px solid rgba(255,80,80,0.1)",
            }}>
              <p style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.6, margin: "0 0 16px", fontWeight: 600, color: "#ff6b6b" }}>Traditional Eyewear</p>
              {[
                ["Frame manufacturing", "₱800"],
                ["Lens grinding", "₱500"],
                ["Retail markup", "₱400"],
                ["Optician visit", "₱300"],
                ["Total", "₱2,000"],
              ].map(([label, cost], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none", opacity: i === 4 ? 1 : 0.5 }}>
                  <span style={{ fontSize: 13, fontWeight: i === 4 ? 600 : 400 }}>{label}</span>
                  <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: i === 4 ? 600 : 400 }}>{cost}</span>
                </div>
              ))}
            </div>
          </AnimatedContent>

          <AnimatedContent direction="right" delay={0.2} style={{ display: "flex", height: "100%" }}>
            <div style={{
              flex: 1, padding: "28px 24px", borderRadius: 16,
              background: "rgba(111,207,151,0.04)", border: "1px solid rgba(111,207,151,0.12)",
            }}>
              <p style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7, margin: "0 0 16px", fontWeight: 600, color: "#6fcf97" }}>OPTIQ (3D Printed)</p>
              {[
                ["Recycled filament", "₱25"],
                ["3D print time", "₱100"],
                ["Prescription Lenses", "₱175"],
                ["AI fitting (no optician)", "₱0"],
                ["Total", "₱300"],
              ].map(([label, cost], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none", opacity: i === 4 ? 1 : 0.5 }}>
                  <span style={{ fontSize: 13, fontWeight: i === 4 ? 600 : 400 }}>{label}</span>
                  <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: i === 4 ? 600 : 400, color: i === 4 ? "#6fcf97" : "inherit" }}>{cost}</span>
                </div>
              ))}
            </div>
          </AnimatedContent>
        </div>

        <AnimatedContent delay={0.35}>
          <p style={{ fontSize: 13, opacity: 0.5, marginTop: 16, textAlign: "center" }}>
            Up to 85% cost reduction. No middlemen, no retail markup, no waste.
          </p>
        </AnimatedContent>
      </section>

      {/* PROCESS TIMELINE */}
      <section style={{ marginBottom: 80, textAlign: "left" }}>
        <AnimatedContent>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.5, marginBottom: 12, fontWeight: 600 }}>
            From Waste to Wear
          </p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, margin: "0 0 32px" }}>
            How it works
          </h2>
        </AnimatedContent>

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {PROCESS.map((step, i) => (
            <AnimatedContent key={i} delay={i * 0.1}>
              <div style={{
                display: "flex", gap: 20, padding: "24px 0",
                borderBottom: i < PROCESS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                alignItems: "flex-start",
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: "rgba(111,207,151,0.06)", border: "1px solid rgba(111,207,151,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20,
                }}>
                  {step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, opacity: 0.25, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>{step.num}</span>
                    <span style={{ fontSize: "clamp(14px, 4vw, 16px)", fontWeight: 600 }}>{step.title}</span>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.7, opacity: 0.6, margin: 0 }}>{step.desc}</p>
                </div>
              </div>
            </AnimatedContent>
          ))}
        </div>
      </section>

      {/* COMMUNITY IMPACT */}
      <section style={{ marginBottom: 80, textAlign: "left" }}>
        <AnimatedContent>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.5, marginBottom: 12, fontWeight: 600 }}>
            Community Impact
          </p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, margin: "0 0 20px" }}>
            Built for Southeast Asia, designed for the world
          </h2>
        </AnimatedContent>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {[
            { title: "Schools Partnership", desc: "Collection drives at local schools teach recycling while sourcing raw materials. Students see their bottle caps become someone's glasses.", stat: "120+", statLabel: "schools targeted" },
            { title: "Local Fabrication", desc: "3D printers deployed in community centres enable local production, reducing shipping costs and creating skilled jobs.", stat: "5", statLabel: "fabrication hubs planned" },
            { title: "Accessibility First", desc: "AI-powered face scanning removes the need for optician visits. Anyone with a smartphone can get properly fitted glasses.", stat: "0", statLabel: "optician visits needed" },
          ].map((card, i) => (
            <AnimatedContent key={i} delay={i * 0.12} style={{ display: "flex", height: "100%" }}>
              <div style={{
                flex: 1, padding: "24px", borderRadius: 16,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                display: "flex", flexDirection: "column"
              }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 600, margin: "0 0 2px", color: "#6fcf97" }}>
                  <CountUp target={parseInt(card.stat) || 0} suffix={card.stat.includes("+") ? "+" : ""} />
                </p>
                <p style={{ fontSize: 10, opacity: 0.5, margin: "0 0 14px", letterSpacing: 1, textTransform: "uppercase" }}>{card.statLabel}</p>
                <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>{card.title}</p>
                <p style={{ fontSize: 13, lineHeight: 1.7, opacity: 0.6, margin: 0 }}>{card.desc}</p>
              </div>
            </AnimatedContent>
          ))}
        </div>
      </section>

      {/* CLOSING / VISION */}
      <section style={{ textAlign: "center", paddingBottom: 40 }}>
        <AnimatedContent>
          <div style={{
            padding: "48px 24px", borderRadius: 20,
            background: "rgba(111,207,151,0.03)", border: "1px solid rgba(111,207,151,0.08)",
          }}>
            <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.5, marginBottom: 16, fontWeight: 600 }}>
              Our Vision
            </p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 500, margin: "0 0 20px", lineHeight: 1.3 }}>
              Today, glasses.<br />
              Tomorrow, <GradientText colors={["#6fcf97", "#4ecdc4", "#a8edea"]}>prosthetics for everyone.</GradientText>
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.8, opacity: 0.6, maxWidth: 520, margin: "0 auto" }}>
              Team Quincers and OPTIQ are proving that recycled materials and digital fabrication can make assistive devices accessible to all. Glasses are our proof of concept. The technology, supply chain, and community partnerships we build here scale directly into prosthetic limbs, orthotics, hearing aids, and beyond.
            </p>
          </div>
        </AnimatedContent>
      </section>

    </div>
  );
}