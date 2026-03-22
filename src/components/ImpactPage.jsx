import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate } from 'framer-motion';

function BlurText({ text, delay = 80 }) {
  const words = text.split(' ');
  return (
    <span style={{ display:'flex', flexWrap:'wrap', gap:'0.3em', justifyContent:'center' }}>
      {words.map((word, i) => (
        <motion.span key={i}
          initial={{ filter:'blur(12px)', opacity:0, y:12 }}
          whileInView={{ filter:'blur(0px)', opacity:1, y:0 }}
          viewport={{ once:true, margin:'-50px' }}
          transition={{ duration:0.6, delay: i * (delay / 1000), ease:'easeOut' }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

function GradientText({ children, colors = ['#6fcf97','#4ecdc4','#a8edea'] }) {
  return (
    <span style={{
      background:`linear-gradient(90deg, ${colors.join(', ')}, ${colors[0]})`,
      backgroundSize:'200% 100%',
      WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
      backgroundClip:'text',
      animation:'gvGradientSweep 4s linear infinite',
    }}>
      {children}
    </span>
  );
}

function CountUp({ target, duration = 2, prefix = '', suffix = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once:true, margin:'-80px' });
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const ctrl = animate(0, target, { duration, ease:'easeOut', onUpdate: v => setValue(v) });
    return () => ctrl.stop();
  }, [inView, target, duration]);
  return <span ref={ref}>{prefix}{Math.round(value)}{suffix}</span>;
}

function Reveal({ children, direction = 'up', delay = 0 }) {
  const y = direction === 'up' ? 40 : direction === 'down' ? -40 : 0;
  const x = direction === 'left' ? 40 : direction === 'right' ? -40 : 0;
  return (
    <motion.div
      initial={{ opacity:0, y, x }}
      whileInView={{ opacity:1, y:0, x:0 }}
      viewport={{ once:true, margin:'-60px' }}
      transition={{ duration:0.7, delay, ease:[0.23,1,0.32,1] }}
    >
      {children}
    </motion.div>
  );
}

const PROCESS = [
  { num:'01', icon:'♻', title:'Collect',          desc:'Bottle caps and PET containers are collected from local communities, schools, and recycling partners across Southeast Asia.' },
  { num:'02', icon:'⚙', title:'Shred & Clean',    desc:'Collected plastic is sorted by type, shredded into flakes, thoroughly washed, and dried to remove contaminants.' },
  { num:'03', icon:'◎', title:'Extrude Filament', desc:'Clean plastic flakes are melted and extruded into 3D printing filament, with colour pigment mixed in at this stage.' },
  { num:'04', icon:'◈', title:'3D Print',          desc:"Each pair is printed to order using the customer's exact specifications from our configurator. No waste, no overstock." },
  { num:'05', icon:'→', title:'Assemble & Ship',  desc:'Lenses are fitted, hinges attached, and quality checked before shipping directly to the customer.' },
];

export default function ImpactPage() {
  return (
    <div className="impact-page">
      <div style={{ padding:'0 22px 60px' }}>

        {/* Mission */}
        <section style={{ paddingTop:48, paddingBottom:48, textAlign:'center' }}>
          <Reveal><p className="i-eyebrow">Our Mission</p></Reveal>
          <div className="i-h1" style={{ textAlign:'center', marginBottom:20 }}>
            <BlurText text="Affordable support for everyone." delay={100} />
          </div>
          <Reveal delay={0.3}>
            <p className="i-body" style={{ maxWidth:500, margin:'0 auto 12px', textAlign:'center' }}>
              OPTIQ turns post-consumer plastic into custom eyewear using 3D printing. But glasses are just the beginning.
            </p>
          </Reveal>
          <Reveal delay={0.5}>
            <p className="i-body" style={{ maxWidth:480, margin:'0 auto', textAlign:'center' }}>
              We believe access to prosthetics and assistive devices shouldn't depend on your income. By proving that{' '}
              <GradientText>recycled materials + digital fabrication</GradientText>{' '}
              can produce reliable eyewear at a fraction of the cost, we're building the foundation for affordable prosthetics for all.
            </p>
          </Reveal>
        </section>

        {/* Stats */}
        <div className="stats-grid" style={{ marginBottom:60 }}>
          {[
            { target:82,  prefix:'',  suffix:'%',    label:'Less CO2 vs virgin plastic', color:'#6fcf97' },
            { target:12,  prefix:'',  suffix:' caps',label:'Recycled per pair',           color:'#4ecdc4' },
            { target:300, prefix:'₱', suffix:'',     label:'Average pair cost',           color:'#a8edea' },
            { target:15,  prefix:'',  suffix:'g',    label:'Plastic per frame',           color:'#6fcf97' },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 0.1}>
              <div className="stat-tile">
                <div className="stat-num" style={{ color:s.color }}>
                  <CountUp target={s.target} prefix={s.prefix} suffix={s.suffix} duration={2.5} />
                </div>
                <div className="stat-label">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Bigger picture */}
        <section style={{ marginBottom:60, textAlign:'center' }}>
          <Reveal>
            <p className="i-eyebrow">The Bigger Picture</p>
            <h2 className="i-h2">
              Glasses are our first step.<br />
              <GradientText colors={['#6fcf97','#4ecdc4','#88d8c0']}>Prosthetics are the destination.</GradientText>
            </h2>
          </Reveal>
          {[
            "2.7 billion people worldwide need glasses but can't access or afford them. In Southeast Asia alone, millions of students struggle in school because of uncorrected vision.",
            "OPTIQ's approach changes that equation entirely. By 3D printing from recycled plastic, we eliminate traditional manufacturing overhead, reduce cost by over 80%, and produce on-demand with zero waste.",
            "The same technology, materials, and supply chain we're building for eyewear scales directly into prosthetic limbs, hearing aids, orthotics, and other assistive devices.",
          ].map((text, i) => (
            <Reveal key={i} delay={0.1 + i * 0.08}>
              <p className="i-body" style={{ maxWidth:600, margin:'0 auto 12px', textAlign:'center' }}>{text}</p>
            </Reveal>
          ))}
        </section>

        {/* Cost */}
        <section style={{ marginBottom:60 }}>
          <Reveal>
            <p className="i-eyebrow">Cost Breakdown</p>
            <h2 className="i-h2">Traditional vs OPTIQ</h2>
          </Reveal>
          <div className="cost-grid">
            <Reveal direction="left" delay={0.1}>
              <div className="cost-block trad">
                <p className="cost-block-label">Traditional Eyewear</p>
                {[['Frame manufacturing','₱2,500'],['Lens grinding','₱3,500'],['Retail markup','₱4,500'],['Optician visit','₱1,000'],['Total','₱11,500']].map(([l,v],i) => (
                  <div key={l} className={`cost-line${i===4?' last':''}`}>
                    <span>{l}</span><span className="mono">{v}</span>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal direction="right" delay={0.2}>
              <div className="cost-block optiq">
                <p className="cost-block-label">OPTIQ (3D Printed)</p>
                {[['Recycled filament','₱25'],['3D print time','₱100'],['Prescription Lenses','₱175'],['AI fitting (no optician)','₱0'],['Total','₱300']].map(([l,v],i) => (
                  <div key={l} className={`cost-line${i===4?' last':''}`}>
                    <span>{l}</span><span className="mono">{v}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.3}>
            <p className="cost-note">Up to 93% cost reduction. No middlemen, no retail markup, no waste.</p>
          </Reveal>
        </section>

        {/* How it works */}
        <section style={{ marginBottom:60 }}>
          <Reveal>
            <p className="i-eyebrow">From Waste to Wear</p>
            <h2 className="i-h2">How it works</h2>
          </Reveal>
          <div className="steps-list">
            {PROCESS.map((s, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div className="step-item-row">
                  <div className="step-icon-box">{s.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:4 }}>
                      <span className="step-num-mono">{s.num}</span>
                      <span className="step-title-row">{s.title}</span>
                    </div>
                    <p className="step-desc-row">{s.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Community */}
        <section style={{ marginBottom:60 }}>
          <Reveal>
            <p className="i-eyebrow">Community Impact</p>
            <h2 className="i-h2">Built for Southeast Asia, designed for the world</h2>
          </Reveal>
          <div className="community-grid" style={{ padding:0 }}>
            {[
              { stat:120, suffix:'+', statLabel:'schools targeted',         title:'Schools Partnership', desc:"Collection drives at local schools teach recycling while sourcing raw materials. Students see their bottle caps become someone's glasses." },
              { stat:5,   suffix:'',  statLabel:'fabrication hubs planned', title:'Local Fabrication',   desc:'3D printers deployed in community centres enable local production, reducing shipping costs and creating skilled jobs.' },
              { stat:0,   suffix:'',  statLabel:'optician visits needed',   title:'Accessibility First', desc:'AI-powered face scanning removes the need for optician visits. Anyone with a smartphone can get properly fitted glasses.' },
            ].map((card, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="community-card">
                  <div className="community-stat"><CountUp target={card.stat} suffix={card.suffix} duration={2} /></div>
                  <p className="community-stat-label">{card.statLabel}</p>
                  <p className="community-title">{card.title}</p>
                  <p className="community-desc">{card.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Vision */}
        <Reveal>
          <div className="vision-box">
            <p className="vision-eyebrow">Our Vision</p>
            <div className="vision-title">
              Today, glasses.<br />
              Tomorrow, <GradientText colors={['#6fcf97','#4ecdc4','#a8edea']}>prosthetics for everyone.</GradientText>
            </div>
            <p className="vision-body">
              Team Quincers and OPTIQ are proving that recycled materials and digital fabrication can make assistive devices accessible to all. Glasses are our proof of concept. The technology, supply chain, and community partnerships we build here scale directly into prosthetic limbs, orthotics, hearing aids, and beyond.
            </p>
          </div>
        </Reveal>

      </div>
    </div>
  );
}
