import React, { useEffect, useRef, useState } from 'react';

// ── CSS-only scroll reveal ────────────────────────────────────────────────
function useScrollReveal(containerRef) {
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { root: container, threshold: 0.1 }
    );
    setTimeout(() => {
      container.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    }, 100);
    return () => observer.disconnect();
  }, [containerRef]);
}

// ── CountUp — pure JS, no framer-motion ──────────────────────────────────
function CountUp({ target, prefix = '', suffix = '', duration = 2000 }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.round(eased * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{prefix}{value}{suffix}</span>;
}

// ── Gradient text — pure CSS ──────────────────────────────────────────────
function GradientText({ children }) {
  return <span className="gradient-text">{children}</span>;
}

const PROCESS = [
  { num:'01', icon:'♻', title:'Collect',          desc:'Bottle caps and PET containers are collected from local communities, schools, and recycling partners across Southeast Asia.' },
  { num:'02', icon:'⚙', title:'Shred & Clean',    desc:'Collected plastic is sorted by type, shredded into flakes, thoroughly washed, and dried to remove contaminants.' },
  { num:'03', icon:'◎', title:'Extrude Filament', desc:'Clean plastic flakes are melted and extruded into 3D printing filament, with colour pigment mixed in at this stage.' },
  { num:'04', icon:'◈', title:'3D Print',          desc:"Each pair is printed to order using the customer's exact specifications from our configurator. No waste, no overstock." },
  { num:'05', icon:'→', title:'Assemble & Ship',  desc:'Lenses are fitted, hinges attached, and quality checked before shipping directly to the customer.' },
];

export default function ImpactPage() {
  const scrollRef = useRef(null);
  useScrollReveal(scrollRef);

  return (
    <div className="impact-page" ref={scrollRef}>
      <div style={{ padding:'0 22px 60px' }}>

        {/* Mission */}
        <section style={{ paddingTop:48, paddingBottom:48, textAlign:'center' }}>
          <p className="reveal i-eyebrow">Our Mission</p>
          <div className="reveal reveal-d1 i-h1" style={{ textAlign:'center', marginBottom:20 }}>
            Affordable support for <em style={{ fontStyle:'italic' }}>everyone.</em>
          </div>
          <p className="reveal reveal-d2 i-body" style={{ maxWidth:500, margin:'0 auto 12px', textAlign:'center' }}>
            OPTIQ turns post-consumer plastic into custom eyewear using 3D printing. But glasses are just the beginning.
          </p>
          <p className="reveal reveal-d3 i-body" style={{ maxWidth:480, margin:'0 auto', textAlign:'center' }}>
            We believe access to prosthetics and assistive devices shouldn't depend on your income. By proving that{' '}
            <GradientText>recycled materials + digital fabrication</GradientText>{' '}
            can produce reliable eyewear at a fraction of the cost, we're building the foundation for affordable prosthetics for all.
          </p>
        </section>

        {/* Stats */}
        <div className="stats-grid" style={{ marginBottom:60 }}>
          {[
            { target:82,  prefix:'',  suffix:'%',    label:'Less CO2 vs virgin plastic', color:'#6fcf97' },
            { target:12,  prefix:'',  suffix:' caps',label:'Recycled per pair',           color:'#4ecdc4' },
            { target:300, prefix:'₱', suffix:'',     label:'Average pair cost',           color:'#a8edea' },
            { target:15,  prefix:'',  suffix:'g',    label:'Plastic per frame',           color:'#6fcf97' },
          ].map((s, i) => (
            <div key={i} className={`stat-tile reveal reveal-d${i + 1}`}>
              <div className="stat-num" style={{ color:s.color }}>
                <CountUp target={s.target} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Bigger picture */}
        <section style={{ marginBottom:60, textAlign:'center' }}>
          <p className="reveal i-eyebrow">The Bigger Picture</p>
          <h2 className="reveal reveal-d1 i-h2">
            Glasses are our first step.<br />
            <GradientText>Prosthetics are the destination.</GradientText>
          </h2>
          {[
            "2.7 billion people worldwide need glasses but can't access or afford them. In Southeast Asia alone, millions of students struggle in school because of uncorrected vision.",
            "OPTIQ's approach changes that equation entirely. By 3D printing from recycled plastic, we eliminate traditional manufacturing overhead, reduce cost by over 80%, and produce on-demand with zero waste.",
            "The same technology, materials, and supply chain we're building for eyewear scales directly into prosthetic limbs, hearing aids, orthotics, and other assistive devices.",
          ].map((text, i) => (
            <p key={i} className={`reveal reveal-d${i + 1} i-body`} style={{ maxWidth:600, margin:'0 auto 12px', textAlign:'center' }}>{text}</p>
          ))}
        </section>

        {/* Cost */}
        <section style={{ marginBottom:60 }}>
          <p className="reveal i-eyebrow">Cost Breakdown</p>
          <h2 className="reveal reveal-d1 i-h2">Traditional vs OPTIQ</h2>
          <div className="cost-grid">
            <div className="cost-block trad reveal reveal-d2">
              <p className="cost-block-label">Traditional Eyewear</p>
              {[['Frame manufacturing','₱2,500'],['Lens grinding','₱3,500'],['Retail markup','₱4,500'],['Optician visit','₱1,000'],['Total','₱11,500']].map(([l,v],i) => (
                <div key={l} className={`cost-line${i===4?' last':''}`}><span>{l}</span><span className="mono">{v}</span></div>
              ))}
            </div>
            <div className="cost-block optiq reveal reveal-d3">
              <p className="cost-block-label">OPTIQ (3D Printed)</p>
              {[['Recycled filament','₱25'],['3D print time','₱100'],['Prescription Lenses','₱175'],['AI fitting (no optician)','₱0'],['Total','₱300']].map(([l,v],i) => (
                <div key={l} className={`cost-line${i===4?' last':''}`}><span>{l}</span><span className="mono">{v}</span></div>
              ))}
            </div>
          </div>
          <p className="reveal cost-note">Up to 93% cost reduction. No middlemen, no retail markup, no waste.</p>
        </section>

        {/* How it works */}
        <section style={{ marginBottom:60 }}>
          <p className="reveal i-eyebrow">From Waste to Wear</p>
          <h2 className="reveal reveal-d1 i-h2">How it works</h2>
          <div className="steps-list">
            {PROCESS.map((s, i) => (
              <div key={i} className={`step-item-row reveal reveal-d${(i % 4) + 1}`}>
                <div className="step-icon-box">{s.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:4 }}>
                    <span className="step-num-mono">{s.num}</span>
                    <span className="step-title-row">{s.title}</span>
                  </div>
                  <p className="step-desc-row">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Community */}
        <section style={{ marginBottom:60 }}>
          <p className="reveal i-eyebrow">Community Impact</p>
          <h2 className="reveal reveal-d1 i-h2">Built for Southeast Asia, designed for the world</h2>
          <div className="community-grid" style={{ padding:0 }}>
            {[
              { target:120, suffix:'+', statLabel:'schools targeted',         title:'Schools Partnership', desc:"Collection drives at local schools teach recycling while sourcing raw materials. Students see their bottle caps become someone's glasses." },
              { target:5,   suffix:'',  statLabel:'fabrication hubs planned', title:'Local Fabrication',   desc:'3D printers deployed in community centres enable local production, reducing shipping costs and creating skilled jobs.' },
              { target:0,   suffix:'',  statLabel:'optician visits needed',   title:'Accessibility First', desc:'AI-powered face scanning removes the need for optician visits. Anyone with a smartphone can get properly fitted glasses.' },
            ].map((card, i) => (
              <div key={i} className={`community-card reveal reveal-d${i + 1}`}>
                <div className="community-stat"><CountUp target={card.target} suffix={card.suffix} /></div>
                <p className="community-stat-label">{card.statLabel}</p>
                <p className="community-title">{card.title}</p>
                <p className="community-desc">{card.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Vision */}
        <div className="vision-box reveal">
          <p className="vision-eyebrow">Our Vision</p>
          <div className="vision-title">
            Today, glasses.<br />
            Tomorrow, <GradientText>prosthetics for everyone.</GradientText>
          </div>
          <p className="vision-body">
            Team Quincers and OPTIQ are proving that recycled materials and digital fabrication can make assistive devices accessible to all. Glasses are our proof of concept. The technology, supply chain, and community partnerships we build here scale directly into prosthetic limbs, orthotics, hearing aids, and beyond.
          </p>
        </div>

      </div>
    </div>
  );
}
