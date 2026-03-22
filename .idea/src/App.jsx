import React, { useState, useEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import ModelViewer from './components/ModelViewer';
import UIOverlay from './components/UIOverlay';
import ARTryOn from './components/ARTryOn';
import AIScanner from './components/AIScanner';
import ImpactPage from './components/ImpactPage';
import './index.css';

export const MATERIALS = [
  { id:'rhdpe',  name:'Recycled HDPE', tag:'Bottle Caps', price:0,   desc:'Made from post-consumer bottle caps. Durable, lightweight, water-resistant.', co2:'82% less CO2 vs virgin plastic', icon:'♻' },
  { id:'rpet',   name:'Recycled PET',  tag:'Bottles',     price:49,  desc:'Sourced from recycled PET drink bottles. Slightly translucent finish.',        co2:'75% less CO2 vs virgin plastic', icon:'♻' },
  { id:'biopla', name:'Bio-PLA',       tag:'Plant-based', price:99,  desc:'Derived from cornstarch and sugarcane. Fully biodegradable and compostable.',   co2:'68% less CO2 vs virgin plastic', icon:'☘' },
];

export const LENS_TYPES = [
  { id:'clear',        name:'Clear',             price:0,   desc:'Standard optical lens. Scratch-resistant polycarbonate.' },
  { id:'bluelight',    name:'Blue Light Filter', price:199, desc:'Blocks 40% of blue light. Reduces eye strain from screens.' },
  { id:'polarised',    name:'Polarised',         price:349, desc:'Reduces glare from water and roads. UV400 protection.' },
  { id:'tinted',       name:'Gradient Tint',     price:249, desc:'Fashion-forward gradient tint. Darker at top, clear at bottom.' },
  { id:'photochromic', name:'Photochromic',      price:449, desc:'Automatically darkens in sunlight, clears indoors. UV100 block.' },
];

export const SIZES = [
  { id:'sm', name:'Small',  fit:'Narrow face',  width:'126mm' },
  { id:'md', name:'Medium', fit:'Average face', width:'134mm' },
  { id:'lg', name:'Large',  fit:'Wide face',    width:'142mm' },
];

export const FRAMES = [
  { id:'cat-eye',  name:'Cat-Eye Luxe',    category:'Statement',  basePrice:249,
    colors:[
      { name:'Burgundy', hex:'#6b2040', bg:['#14080e','#221018','#1a0c14'], particle:'#8a3050' },
      { name:'Ivory',    hex:'#d4c8b0', bg:['#18160e','#28241a','#201c14'], particle:'#e8dcc0' },
      { name:'Emerald',  hex:'#1a5c3a', bg:['#081410','#102a1c','#0c2018'], particle:'#2a7a50' },
    ], file:'/models/AlbertVictory glasses.glb' },
  { id:'aviator',  name:'Aviator Classic', category:'Sunglasses', basePrice:199,
    colors:[
      { name:'Charcoal', hex:'#3a3a3a', bg:['#0f1114','#1a1d23','#12141a'], particle:'#666' },
      { name:'Sand',     hex:'#c8a84e', bg:['#1a1508','#2a2010','#1e1a0c'], particle:'#c8a84e' },
      { name:'Blush',    hex:'#b76e79', bg:['#1a1015','#2a1520','#1e1018'], particle:'#d4a0a0' },
    ], file:'/models/Nazarchi091 black_glasses.glb' },
  { id:'wayfarer', name:'Wayfarer Bold',   category:'Everyday',   basePrice:149,
    colors:[
      { name:'Matte Black', hex:'#1a1a1a', bg:['#08080a','#141418','#0c0c10'], particle:'#444' },
      { name:'Tortoise',    hex:'#8b5e3c', bg:['#1a1008','#2a1d10','#1e140c'], particle:'#a0724a' },
      { name:'Navy',        hex:'#1a2744', bg:['#080c14','#101828','#0c1420'], particle:'#3a5580' },
    ], file:'/models/Marius.Eder glasses.glb' },
  { id:'round',    name:'Round Wire',      category:'Optical',    basePrice:249,
    colors:[
      { name:'Silver', hex:'#c0c0c0', bg:['#0e1018','#181c28','#121620'], particle:'#c0c0c0' },
      { name:'Black',  hex:'#222222', bg:['#0a0a0c','#141416','#0e0e12'], particle:'#555' },
      { name:'Copper', hex:'#b87333', bg:['#1a1208','#2a1e10','#1e160c'], particle:'#cc8844' },
    ], file:'/models/Nattsol glasses_3d_model.glb' },
  { id:'oni',   name:'OniGraphics', category:'Futuristic', basePrice:199,
    colors:[
      { name:'Black',  hex:'#1a1a2e', bg:['#080810','#10102a','#0c0c1e'], particle:'#4444aa' },
      { name:'Chrome', hex:'#888899', bg:['#0e0e14','#181820','#121218'], particle:'#9999cc' },
    ], file:'/models/OniGraphics glasses.glb' },
  { id:'ezas',  name:"Eza's",       category:'Custom',     basePrice:449,
    colors:[
      { name:'Original',  hex:'#ffffff', bg:['#0a0a0c','#141418','#0c0c10'], particle:'#fff' },
      { name:'Midnight',  hex:'#3a3a4a', bg:['#08080e','#101020','#0c0c18'], particle:'#6a6a7a' },
      { name:'Rose Gold', hex:'#c08070', bg:['#1a100e','#2a1818','#1e1214'], particle:'#d4a0a0' },
    ], file:'/models/Eza.3D_ glasses.glb' },
];

FRAMES.forEach((f) => useGLTF.preload(f.file));

const PAGES = [
  { label:'Configurator', icon:'◈' },
  { label:'AR Try-On',    icon:'◉' },
  { label:'AI Scanner',   icon:'⬡' },
  { label:'Our Impact',   icon:'✦' },
];

function useParticles(canvasRef, particleColor) {
  const colorRef = useRef(particleColor);
  colorRef.current = particleColor;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h;
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const P = Array.from({ length: 50 }, () => ({
      x: Math.random() * 2000, y: Math.random() * 2000,
      vx: (Math.random() - 0.5) * 0.3, vy: -Math.random() * 0.35 - 0.1,
      r: Math.random() * 2.5 + 0.5, a: Math.random() * 0.4 + 0.08,
      p: Math.random() * Math.PI * 2,
    }));
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);
      P.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.p += 0.015;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = colorRef.current;
        ctx.globalAlpha = p.a * (0.5 + 0.5 * Math.sin(p.p));
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [canvasRef]);
}

export default function App() {
  const [activePage,  setActivePage]  = useState(0);
  const [frameIdx,    setFrameIdx]    = useState(0);
  const [matIdx,      setMatIdx]      = useState(0);
  const [lensIdx,     setLensIdx]     = useState(0);
  const [colorIdx,    setColorIdx]    = useState(0);
  const [sizeIdx,     setSizeIdx]     = useState(1);
  const [step,        setStep]        = useState(0);
  const [toastMsg,    setToastMsg]    = useState('');
  const [showToast,   setShowToast]   = useState(false);
  const particleCanvasRef = useRef(null);

  const frame      = FRAMES[frameIdx];
  const color      = frame.colors[colorIdx];
  const material   = MATERIALS[matIdx];
  const lens       = LENS_TYPES[lensIdx];
  const size       = SIZES[sizeIdx];
  const totalPrice = frame.basePrice + material.price + lens.price;

  useParticles(particleCanvasRef, color.particle);

  const displayToast = (msg) => { setToastMsg(msg); setShowToast(true); };
  useEffect(() => {
    if (!showToast) return;
    const id = setTimeout(() => setShowToast(false), 2800);
    return () => clearTimeout(id);
  }, [showToast]);

  const bg = color.bg;
  const bgStyle = `linear-gradient(135deg, ${bg[0]} 0%, ${bg[1]} 50%, ${bg[2]} 100%)`;

  return (
    <div className="app-container" style={{ background: bgStyle }}>
      <canvas ref={particleCanvasRef} className="particle-canvas" />
      <div className={`toast ${showToast ? 'show' : ''}`}>{toastMsg}</div>

      {/* Top bar */}
      <div className="top-bar">
        <div className="nav-logo">
          <span className="nav-logo-icon">◈</span>
          <span className="nav-logo-text">OPTIQ</span>
        </div>
      </div>

      {/* Pages */}
      {activePage === 0 && (
        <div className="page">
          <ModelViewer modelUrl={frame.file} />
          <UIOverlay
            frames={FRAMES}     frameIdx={frameIdx}
            setFrameIdx={(i) => { setFrameIdx(i); setColorIdx(0); }}
            matIdx={matIdx}     setMatIdx={setMatIdx}
            lensIdx={lensIdx}   setLensIdx={setLensIdx}
            colorIdx={colorIdx} setColorIdx={setColorIdx}
            sizeIdx={sizeIdx}   setSizeIdx={setSizeIdx}
            step={step}         setStep={setStep}
            materials={MATERIALS} lensTypes={LENS_TYPES} sizes={SIZES}
            totalPrice={totalPrice}
            frame={frame} material={material} lens={lens} color={color} size={size}
            displayToast={displayToast}
          />
        </div>
      )}
      {activePage === 1 && <ARTryOn displayToast={displayToast} />}
      {activePage === 2 && <AIScanner displayToast={displayToast} />}
      {activePage === 3 && <ImpactPage />}

      {/* Simple bottom nav */}
      <nav className="bottom-nav">
        {PAGES.map((p, i) => (
          <button
            key={p.label}
            className={`bottom-nav-btn ${activePage === i ? 'active' : ''}`}
            onClick={() => setActivePage(i)}
          >
            <span className="bottom-nav-icon">{p.icon}</span>
            {p.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
