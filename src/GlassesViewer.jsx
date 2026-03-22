import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import ImpactPage from "./ImpactPage";
import LensRecycle from "./LensRecycle";
import FitScanner from "./FitScanner";
import ARTryOn from "./ARTryOn";
import LensPicker from "./LensPicker";
import ColorPicker from "./ColorPicker";

import FlowingMenu from "./FlowingMenu";
import useFrameThumbnails from "./useFrameThumbnails";
import InfiniteMenu from "./InfiniteMenu";
import { generateLensImages } from "./lensImages";


const lerp = (a, b, t) => a + (b - a) * t;
const deg = (d) => (d * Math.PI) / 180;
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

// Each step: { x, y, z } — z is camera distance
const STEP_ANGLES = [
  { x: deg(5),   y: deg(15),  z: 3.2  }, // 0 Fit Scan — wide establishing shot
  { x: deg(8),   y: deg(25),  z: 2.85 }, // 1 Frame    — classic 3/4, temples visible
  { x: deg(12),  y: deg(-18), z: 3.0  }, // 2 Material — slight top-left, rim texture catches light
  { x: deg(0),   y: deg(4),   z: 2.55 }, // 3 Lens     — nearly face-on, lens occupies frame
  { x: deg(3),   y: deg(10),  z: 2.65 }, // 4 Prescription — gentle angle, lens detail visible
  { x: deg(6),   y: deg(-38), z: 2.75 }, // 5 Colour   — wide swing right, side profile, pigment shows
  { x: deg(-8),  y: deg(18),  z: 3.1  }, // 6 Size     — low angle, full silhouette readable
  { x: deg(10),  y: deg(10),  z: 2.45 }, // 7 Summary  — tight close hero, symmetrical and confident
];

if (typeof document !== "undefined") {
  const fl = document.createElement("link"); fl.rel = "stylesheet";
  fl.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(fl);
}

/* ═══════════════════════════════════════════════════════════
   CONFIGURATOR DATA
   ═══════════════════════════════════════════════════════════ */
const MATERIALS = [
  { id: "rhdpe", name: "Recycled HDPE", tag: "Bottle Caps", price: 0, desc: "Made from post-consumer bottle caps. Durable, lightweight, water-resistant.", co2: "82% less CO2 vs virgin plastic", icon: "♻",
    pbr: { metalness: 0.05, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 } },
  { id: "rpet", name: "Recycled PET", tag: "Bottles", price: 49, desc: "Sourced from recycled PET drink bottles. Slightly translucent finish with a smooth feel.", co2: "75% less CO2 vs virgin plastic", icon: "♻",
    pbr: { metalness: 0.02, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.15 } },
  { id: "biopla", name: "Bio-PLA", tag: "Plant-based", price: 99, desc: "Derived from cornstarch and sugarcane. Fully biodegradable and compostable.", co2: "68% less CO2 vs virgin plastic", icon: "☘",
    pbr: { metalness: 0.0, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.08 } },
];

const LENS_TYPES = [
  { id: "clear", name: "Clear", price: 0, desc: "Standard optical lens. Scratch-resistant polycarbonate.",
    tint: { color: 0xeeeeff, transmission: 0.95, opacity: 0.15 } },
  { id: "bluelight", name: "Blue Light Filter", price: 199, desc: "Blocks 40% of blue light. Reduces eye strain from screens.",
    tint: { color: 0xffe8a0, transmission: 0.88, opacity: 0.2 } },
  { id: "polarised", name: "Polarised", price: 349, desc: "Reduces glare from water and roads. UV400 protection.",
    tint: { color: 0x556655, transmission: 0.6, opacity: 0.55 } },
  { id: "tinted", name: "Gradient Tint", price: 249, desc: "Fashion-forward gradient tint. Darker at top, clear at bottom.",
    tint: { color: 0x665566, transmission: 0.7, opacity: 0.45 } },
  { id: "photochromic", name: "Photochromic", price: 449, desc: "Automatically darkens in sunlight, clears indoors. UV100 block.",
    tint: { color: 0x886644, transmission: 0.75, opacity: 0.30 } },
];

const SIZES = [
  { id: "sm", name: "Small", fit: "Narrow face", width: "126mm" },
  { id: "md", name: "Medium", fit: "Average face", width: "134mm" },
  { id: "lg", name: "Large", fit: "Wide face", width: "142mm" },
];

/* ═══════════════════════════════════════════════════════════
   PART LABELS
   ═══════════════════════════════════════════════════════════ */
const PART_INFO = {
  "left-rim": { label: "Frame Rim", detail: "3D printed, 0.8mm" }, "right-rim": { label: "Frame Rim", detail: "3D printed, 0.8mm" },
  "left-lens": { label: "Lens", detail: "Polycarbonate" }, "right-lens": { label: "Lens", detail: "Polycarbonate" },
  "bridge": { label: "Bridge", detail: "Ergonomic arch" }, "bridge-upper": { label: "Upper Bridge", detail: "Reinforced" }, "bridge-lower": { label: "Lower Bridge", detail: "Flex support" },
  "left-temple": { label: "Temple Arm", detail: "Memory flex" }, "right-temple": { label: "Temple Arm", detail: "Memory flex" },
  "left-hinge": { label: "Spring Hinge", detail: "5-barrel" }, "right-hinge": { label: "Spring Hinge", detail: "5-barrel" },
  "left-pad": { label: "Nose Pad", detail: "Silicone" }, "right-pad": { label: "Nose Pad", detail: "Silicone" },
  "top-bar": { label: "Top Bar", detail: "Structural" },
};
const EXPLODE_DIR = {
  "left-rim": new THREE.Vector3(-0.6,0.1,0.3), "right-rim": new THREE.Vector3(0.6,0.1,0.3),
  "left-lens": new THREE.Vector3(-0.5,0,0.8), "right-lens": new THREE.Vector3(0.5,0,0.8),
  "bridge": new THREE.Vector3(0,0.5,0.2), "bridge-upper": new THREE.Vector3(0,0.55,0.2), "bridge-lower": new THREE.Vector3(0,0.35,0.2),
  "left-temple": new THREE.Vector3(-0.5,-0.1,-0.7), "right-temple": new THREE.Vector3(0.5,-0.1,-0.7),
  "left-hinge": new THREE.Vector3(-0.8,0.3,-0.1), "right-hinge": new THREE.Vector3(0.8,0.3,-0.1),
  "left-pad": new THREE.Vector3(-0.2,-0.7,0.4), "right-pad": new THREE.Vector3(0.2,-0.7,0.4),
  "top-bar": new THREE.Vector3(0,0.6,0.15),
};
const LABEL_PARTS = ["right-lens","bridge","right-temple","right-hinge","right-pad"];
const LABEL_PARTS_W = ["right-lens","bridge","right-temple","right-hinge","right-pad","top-bar"];

/* ═══════════════════════════════════════════════════════════
   FRAMES — custom now has multiple color tints
   ═══════════════════════════════════════════════════════════ */
const FRAMES = [
  { id:"cat-eye", name:"Cat-Eye Luxe", category:"Statement", basePrice:249, tagline:"Lead, never follow", labelParts:LABEL_PARTS,
    dimensions:{lens:"55mm",bridge:"16mm",temple:"138mm",height:"46mm"},
    description:"A high-index frame utilizing an upswept outer browline to comfortably accommodate wider pupillary distances and progressive lens fittings.",
    colors:[
      {name:"Burgundy",frame:0x6b2040,lens:0x553344,accent:0x8a3050,bg:["#14080e","#221018","#1a0c14"],particle:"#8a3050"},
      {name:"Ivory",frame:0xd4c8b0,lens:0x998877,accent:0xe8dcc0,bg:["#18160e","#28241a","#201c14"],particle:"#e8dcc0"},
      {name:"Emerald",frame:0x1a5c3a,lens:0x2a4a3a,accent:0x2a7a50,bg:["#081410","#102a1c","#0c2018"],particle:"#2a7a50"},
    ], build:buildCatEye },
  { id:"aviator", name:"Aviator Classic", category:"Sunglasses", basePrice:199, tagline:"Born to fly", labelParts:LABEL_PARTS,
    dimensions:{lens:"58mm",bridge:"14mm",temple:"140mm",height:"50mm"},
    description:"A dual bridge structural wireframe built with teardrop geometry to maximize the user's field of vision and peripheral lens coverage.",
    colors:[
      {name:"Charcoal",frame:0x3a3a3a,lens:0x556b2f,accent:0x777777,bg:["#0f1114","#1a1d23","#12141a"],particle:"#666"},
      {name:"Sand",frame:0xc8a84e,lens:0x5a4a2a,accent:0xd4af37,bg:["#1a1508","#2a2010","#1e1a0c"],particle:"#c8a84e"},
      {name:"Blush",frame:0xb76e79,lens:0x6b4a52,accent:0xd4a0a0,bg:["#1a1015","#2a1520","#1e1018"],particle:"#d4a0a0"},
    ], build:buildAviator },
  { id:"wayfarer", name:"Wayfarer Bold", category:"Everyday", basePrice:149, tagline:"Unapologetically bold", labelParts:LABEL_PARTS_W,
    dimensions:{lens:"54mm",bridge:"18mm",temple:"145mm",height:"42mm"},
    description:"A heavy gauge trapezoidal frame constructed with wide temples to provide excellent optical stability and overall durability.",
    colors:[
      {name:"Matte Black",frame:0x1a1a1a,lens:0x333344,accent:0x444444,bg:["#08080a","#141418","#0c0c10"],particle:"#444"},
      {name:"Tortoise",frame:0x8b5e3c,lens:0x5a4530,accent:0xa0724a,bg:["#1a1008","#2a1d10","#1e140c"],particle:"#a0724a"},
      {name:"Navy",frame:0x1a2744,lens:0x334466,accent:0x3a5580,bg:["#080c14","#101828","#0c1420"],particle:"#3a5580"},
    ], build:buildWayfarer },
  { id:"round", name:"Round Wire", category:"Optical", basePrice:249, tagline:"Less is everything", labelParts:LABEL_PARTS,
    dimensions:{lens:"49mm",bridge:"20mm",temple:"135mm",height:"49mm"},
    description:"A symmetric circular aperture design that distributes structural tension evenly across the lens axis to maintain a lightweight profile.",
    colors:[
      {name:"Silver",frame:0xc0c0c0,lens:0x99bbdd,accent:0xe0e0e0,bg:["#0e1018","#181c28","#121620"],particle:"#c0c0c0"},
      {name:"Black",frame:0x222222,lens:0x445566,accent:0x555555,bg:["#0a0a0c","#141416","#0e0e12"],particle:"#555"},
      {name:"Copper",frame:0xb87333,lens:0x88775a,accent:0xcc8844,bg:["#1a1208","#2a1e10","#1e160c"],particle:"#cc8844"},
    ], build:buildRound },
  { id:"custom", name:"Eza's", category:"Custom", basePrice:449, tagline:"Your unique vision", labelParts:[],
    dimensions:{lens:"Custom",bridge:"Custom",temple:"Custom",height:"Custom"},
    description:"Utilizing a robust, classic trapezoidal architecture, Eza's is a signature model focused on maximized durability, comfort, and custom-mapped personalization.",
    url: "/models/glasses.glb",
    colors:[
      {name:"Original",frame:0xffffff,lens:0xffffff,accent:0xffffff,bg:["#0a0a0c","#141418","#0c0c10"],particle:"#fff"},
      {name:"Midnight",frame:0x3a3a4a,lens:0x445566,accent:0x6a6a7a,bg:["#08080e","#101020","#0c0c18"],particle:"#6a6a7a"},
      {name:"Rose Gold",frame:0xc08070,lens:0x997777,accent:0xd4a0a0,bg:["#1a100e","#2a1818","#1e1214"],particle:"#d4a0a0"},
      {name:"Forest",frame:0x4a6a4a,lens:0x3a5a3a,accent:0x6a8a6a,bg:["#0a120a","#142014","#0e180e"],particle:"#6a8a6a"},
    ], build:null },
];

/* ═══════════════════════════════════════════════════════════
   GEOMETRY BUILDERS
   ═══════════════════════════════════════════════════════════ */
function makeMaterials(color, matPbr) {
  const p = matPbr || { metalness:0.6, roughness:0.28, clearcoat:1, clearcoatRoughness:0.1 };
  return {
    frame: new THREE.MeshPhysicalMaterial({ color:color.frame, ...p, side:THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color:color.lens, metalness:0, roughness:0.05, transmission:0.8, thickness:0.3, ior:1.5, transparent:true, opacity:0.45, side:THREE.DoubleSide }),
    hinge: new THREE.MeshPhysicalMaterial({ color:color.accent, metalness:0.9, roughness:0.12, clearcoat:0.5, side:THREE.DoubleSide }),
  };
}
function tag(m,n){ m.userData.partName=n; return m; }
function addTemples(g,mat,xs,yS=0){
  xs.forEach(({x,sign})=>{const c=new THREE.CatmullRomCurve3([new THREE.Vector3(x,yS,0),new THREE.Vector3(x+sign*0.04,yS,-0.3),new THREE.Vector3(x+sign*0.04,yS-0.04,-0.9),new THREE.Vector3(x+sign*0.02,yS-0.14,-1.05)]);const m=new THREE.Mesh(new THREE.TubeGeometry(c,32,0.02,8,false),mat);m.castShadow=true;tag(m,x<0?"left-temple":"right-temple");g.add(m);});
}
function addHinges(g,mat,ps){const geo=new THREE.CylinderGeometry(0.028,0.028,0.055,12);ps.forEach(([x,y],i)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,-0.01);m.rotation.z=Math.PI/2;m.castShadow=true;tag(m,i===0?"left-hinge":"right-hinge");g.add(m);});}
function addNosePads(g,mat,ps){const geo=new THREE.SphereGeometry(0.025,12,12);ps.forEach(([x,y,z],i)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(1,1.3,0.6);tag(m,i===0?"left-pad":"right-pad");g.add(m);});}

function buildAviator(color,matPbr){
  const g=new THREE.Group(),m=makeMaterials(color,matPbr);
  const s=new THREE.Shape();s.moveTo(0,0.38);s.quadraticCurveTo(0.42,0.38,0.44,0);s.quadraticCurveTo(0.42,-0.42,0,-0.44);s.quadraticCurveTo(-0.42,-0.42,-0.44,0);s.quadraticCurveTo(-0.42,0.38,0,0.38);
  const pts=s.getPoints(64),rG=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p.x,p.y,0)),true),64,0.03,8,true),dG=new THREE.ShapeGeometry(s,64);
  [-0.54,0.54].forEach((x,i)=>{const r=tag(new THREE.Mesh(rG,m.frame),i===0?"left-rim":"right-rim");r.position.x=x;r.castShadow=true;g.add(r);const d=tag(new THREE.Mesh(dG,m.lens),i===0?"left-lens":"right-lens");d.position.set(x,0,0.005);g.add(d);});
  [0.08,-0.02].forEach((y,i)=>{const c=new THREE.CatmullRomCurve3([new THREE.Vector3(-0.12,y,0),new THREE.Vector3(0,y+0.04,0.02),new THREE.Vector3(0.12,y,0)]);g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(c,16,0.018,8,false),m.frame),i===0?"bridge-upper":"bridge-lower"));});
  addTemples(g,m.frame,[{x:-0.96,sign:-1},{x:0.96,sign:1}]);addHinges(g,m.hinge,[[-0.96,0],[0.96,0]]);addNosePads(g,m.hinge,[[-0.16,-0.28,0.08],[0.16,-0.28,0.08]]);return g;
}
function buildWayfarer(color,matPbr){
  const g=new THREE.Group(),m=makeMaterials(color,matPbr);m.frame.metalness=Math.min(m.frame.metalness,0.1);
  const s=new THREE.Shape();s.moveTo(-0.38,0.24);s.lineTo(0.4,0.28);s.quadraticCurveTo(0.44,0,0.38,-0.24);s.lineTo(-0.36,-0.22);s.quadraticCurveTo(-0.42,0,-0.38,0.24);
  const pts=s.getPoints(64),rG=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p.x,p.y,0)),true),64,0.04,8,true),dG=new THREE.ShapeGeometry(s,64);
  const tb=new THREE.Shape();tb.moveTo(-1.02,0.22);tb.lineTo(1.02,0.22);tb.lineTo(1.02,0.36);tb.quadraticCurveTo(0,0.40,-1.02,0.36);tb.lineTo(-1.02,0.22);
  const t=tag(new THREE.Mesh(new THREE.ExtrudeGeometry(tb,{depth:0.06,bevelEnabled:true,bevelThickness:0.01,bevelSize:0.01,bevelSegments:3}),m.frame),"top-bar");t.position.z=-0.03;t.castShadow=true;g.add(t);
  [-0.52,0.52].forEach((x,i)=>{const r=tag(new THREE.Mesh(rG,m.frame),i===0?"left-rim":"right-rim");r.position.x=x;r.castShadow=true;g.add(r);const d=tag(new THREE.Mesh(dG,m.lens),i===0?"left-lens":"right-lens");d.position.set(x,0,0.005);g.add(d);});
  const bc=new THREE.CatmullRomCurve3([new THREE.Vector3(-0.14,0.04,0),new THREE.Vector3(0,0.10,0.02),new THREE.Vector3(0.14,0.04,0)]);g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(bc,16,0.028,8,false),m.frame),"bridge"));
  addTemples(g,m.frame,[{x:-0.94,sign:-1},{x:0.94,sign:1}]);addHinges(g,m.hinge,[[-0.94,0.05],[0.94,0.05]]);addNosePads(g,m.hinge,[[-0.16,-0.18,0.08],[0.16,-0.18,0.08]]);return g;
}
function buildRound(color,matPbr){
  const g=new THREE.Group(),m=makeMaterials(color,matPbr);const rG=new THREE.TorusGeometry(0.38,0.022,16,64),dG=new THREE.CircleGeometry(0.38,64);
  [-0.48,0.48].forEach((x,i)=>{const r=tag(new THREE.Mesh(rG,m.frame),i===0?"left-rim":"right-rim");r.position.x=x;r.castShadow=true;g.add(r);const d=tag(new THREE.Mesh(dG,m.lens),i===0?"left-lens":"right-lens");d.position.set(x,0,0.005);g.add(d);});
  const bc=new THREE.CatmullRomCurve3([new THREE.Vector3(-0.10,0.06,0),new THREE.Vector3(-0.04,0.14,0.03),new THREE.Vector3(0.04,0.14,0.03),new THREE.Vector3(0.10,0.06,0)]);g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(bc,20,0.018,8,false),m.frame),"bridge"));
  addTemples(g,m.frame,[{x:-0.86,sign:-1},{x:0.86,sign:1}]);addHinges(g,m.hinge,[[-0.86,0],[0.86,0]]);addNosePads(g,m.hinge,[[-0.14,-0.22,0.08],[0.14,-0.22,0.08]]);return g;
}
function buildCatEye(color,matPbr){
  const g=new THREE.Group(),m=makeMaterials(color,matPbr);
  const s=new THREE.Shape();s.moveTo(-0.36,0.18);s.quadraticCurveTo(-0.10,0.30,0.20,0.34);s.quadraticCurveTo(0.46,0.30,0.44,0.08);s.quadraticCurveTo(0.42,-0.22,0.10,-0.26);s.quadraticCurveTo(-0.24,-0.26,-0.38,-0.10);s.quadraticCurveTo(-0.42,0.04,-0.36,0.18);
  const pts=s.getPoints(64),rG=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p.x,p.y,0)),true),64,0.035,8,true),dG=new THREE.ShapeGeometry(s,64);
  [-0.52,0.52].forEach((x,i)=>{const r=tag(new THREE.Mesh(rG,m.frame),i===0?"left-rim":"right-rim");r.position.x=x;if(i===0)r.scale.x=-1;r.castShadow=true;g.add(r);const d=tag(new THREE.Mesh(dG,m.lens),i===0?"left-lens":"right-lens");d.position.set(x,0,0.005);if(i===0)d.scale.x=-1;g.add(d);});
  const bc=new THREE.CatmullRomCurve3([new THREE.Vector3(-0.14,0.10,0),new THREE.Vector3(0,0.16,0.02),new THREE.Vector3(0.14,0.10,0)]);g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(bc,16,0.025,8,false),m.frame),"bridge"));
  addTemples(g,m.frame,[{x:-0.92,sign:-1},{x:0.92,sign:1}],0.12);addHinges(g,m.hinge,[[-0.92,0.12],[0.92,0.12]]);addNosePads(g,m.hinge,[[-0.16,-0.16,0.08],[0.16,-0.16,0.08]]);return g;
}

/* ═══════════════════════════════════════════════════════════
   GLB MESH AUTO-TAGGER
   ═══════════════════════════════════════════════════════════ */
function autoTagGLBMeshes(model) {
  model.traverse(ch => {
    if (!ch.isMesh) return;
    const name = (ch.name || "").toLowerCase();
    const mats = Array.isArray(ch.material) ? ch.material : [ch.material];

    mats.forEach(mat => {
      if (mat && mat.color) {
        mat.userData._origColor = mat.color.clone();
        mat.userData._origMetalness = mat.metalness;
        mat.userData._origRoughness = mat.roughness;
        mat.userData._origOpacity = mat.opacity !== undefined ? mat.opacity : 1;
        mat.userData._origTransmission = mat.transmission !== undefined ? mat.transmission : 0;
        mat.userData._isGLB = true;
      }
    });

    if (!ch.userData.partName) {
      const mat = mats[0];
      const isTransparent = mat && (
        mat.transparent ||
        (mat.transmission !== undefined && mat.transmission > 0.3) ||
        (mat.opacity !== undefined && mat.opacity < 0.8)
      );
      const isLensName = name.includes("lens") || name.includes("glass") || name.includes("lense");
      const isHingeName = name.includes("hinge") || name.includes("screw") || name.includes("rivet");
      const isPadName = name.includes("pad") || name.includes("nose");
      const isTempleName = name.includes("temple") || name.includes("arm") || name.includes("ear");

      if (isTransparent || isLensName) {
        ch.userData.partName = name.includes("left") ? "left-lens" : "right-lens";
      } else if (isHingeName) {
        ch.userData.partName = name.includes("left") ? "left-hinge" : "right-hinge";
      } else if (isPadName) {
        ch.userData.partName = name.includes("left") ? "left-pad" : "right-pad";
      } else if (isTempleName) {
        ch.userData.partName = name.includes("left") ? "left-temple" : "right-temple";
      } else {
        ch.userData.partName = "glb-frame";
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   PARTICLES
   ═══════════════════════════════════════════════════════════ */
function useParticles(ref,c){const cr=useRef(c);cr.current=c;useEffect(()=>{const cv=ref.current;if(!cv)return;const ctx=cv.getContext("2d");let w,h;const rs=()=>{w=cv.width=window.innerWidth;h=cv.height=window.innerHeight};rs();window.addEventListener("resize",rs);const P=[];for(let i=0;i<50;i++)P.push({x:Math.random()*2000,y:Math.random()*2000,vx:(Math.random()-0.5)*0.3,vy:-Math.random()*0.35-0.1,r:Math.random()*2.5+0.5,a:Math.random()*0.4+0.08,p:Math.random()*Math.PI*2});let raf;const draw=()=>{raf=requestAnimationFrame(draw);ctx.clearRect(0,0,w,h);P.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.p+=0.015;if(p.y<-10){p.y=h+10;p.x=Math.random()*w;}if(p.x<-10)p.x=w+10;if(p.x>w+10)p.x=-10;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=cr.current;ctx.globalAlpha=p.a*(0.5+0.5*Math.sin(p.p));ctx.fill();});ctx.globalAlpha=1;};draw();return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",rs);};},[ref]);}

const SIZE_SCALES = [0.940, 1.0, 1.060]; // Small=126mm / Medium=134mm / Large=142mm

const STEPS = ["Fit Scan","Frame","Material","Lens","Prescription","Colour","Size","Summary"];

const VISION_TYPES_CFG = ["Nearsighted (Myopia)", "Farsighted (Hyperopia)", "Both / Unsure"];
const GRADE_OPTIONS_CFG = ["Mild (up to -/+2.00)", "Moderate (-/+2.25 to -/+5.00)", "High (-/+5.25 to -/+8.00)", "Very High (over -/+8.00)", "Unsure"];
const ASTIGMATISM_OPTIONS_CFG = ["None", "Mild", "Moderate", "Severe", "Unsure"];
const INITIAL_RX_CFG = { visionType: "", grade: "", astigmatism: "", sph: "", cyl: "", axis: "" };

function OptCard({ selected, onClick, children, style = {} }) {
  return (
    <button className="gv-frame-card" onClick={onClick} style={{
      padding:"14px 16px", borderRadius:12, cursor:"pointer", textAlign:"left", width:"100%",
      display:"flex", flexDirection:"column", gap:4, transition:"all 0.35s cubic-bezier(0.23,1,0.32,1)",
      border: selected ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.06)",
      background: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", ...style,
    }}>
      {children}
    </button>
  );
}

function useViewportWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function GlassesViewer() {
  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const sceneRef = useRef({});
  const reqIdRef = useRef(0);
  const particleCanvasRef = useRef(null);
  const gltfLoader = useMemo(() => new GLTFLoader(), []);
  const glbCacheRef = useRef({}); // { url: processedSceneClone }
  const swapRef = useRef(null); // Current transition interval
  const spinRef = useRef(false);
  const sizeScaleRef = useRef(1.0);
  const skipAnimRef = useRef(false);

  const vw = useViewportWidth();
  const isMobile = vw <= 840;
  const isSmall = vw <= 480;

  const [step, setStep] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [matIdx, setMatIdx] = useState(0);
  const [lensIdx, setLensIdx] = useState(0);
  const [colorIdx, setColorIdx] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [differentPerEye, setDifferentPerEye] = useState(false);
  const [rxBoth, setRxBoth] = useState({ ...INITIAL_RX_CFG });
  const [rxOD, setRxOD] = useState({ ...INITIAL_RX_CFG });
  const [rxOS, setRxOS] = useState({ ...INITIAL_RX_CFG });
  const [calibratedFaceWidth, setCalibratedFaceWidth] = useState(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [scanReturnStep, setScanReturnStep] = useState(null);

  useEffect(() => {
    const handleNav = (e) => {
      const targetPage = e.detail;
      if (['configurator', 'ar', 'scanner', 'impact', 'recycle'].includes(targetPage)) {
        if (targetPage === 'configurator') setStep(0);
        setPage(targetPage);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener('ai-navigate', handleNav);
    return () => window.removeEventListener('ai-navigate', handleNav);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState("configurator");
  const [loaded, setLoaded] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [introPlayed, setIntroPlayed] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [labelPositions, setLabelPositions] = useState([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [diagramDataUrl, setDiagramDataUrl] = useState(null);

  const frame = FRAMES[frameIdx];
  const color = frame.colors[colorIdx];
  const material = MATERIALS[matIdx];
  const lens = LENS_TYPES[lensIdx];
  const size = SIZES[sizeIdx];

  const totalPrice = useMemo(() => frame.basePrice + material.price + lens.price, [frame, material, lens]);

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    try {
      const response = await fetch("https://optiq.lloydthomas54321.workers.dev/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${frame.name} (${material.name}, ${lens.name})`,
          description: frame.description,
          price: totalPrice
        })
      });
      const session = await response.json();
      if (session.error) throw new Error(session.error.message || session.error);
      
      if (session.url) {
        window.location.href = session.url;
      } else {
        throw new Error("No checkout URL returned from worker.");
      }
    } catch (err) {
      console.error(err);
      alert("Checkout error: " + err.message);
      setIsCheckingOut(false);
    }
  };

  /* ── Rx field renderer for the prescription step ── */
  const rxInputBase = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13,
    outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
  };
  const rxLabelStyle = { display: "block", fontSize: 11, fontWeight: 500, letterSpacing: 0.4, opacity: 0.65, marginBottom: 5 };

  const renderRxBlock = (rx, setRxFn) => {
    const updateField = (field) => (e) => setRxFn((prev) => ({ ...prev, [field]: e.target.value }));
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={rxLabelStyle}>Vision Type</label>
          <select className="gv-rx-select" value={rx.visionType} onChange={updateField("visionType")} style={{ ...rxInputBase, cursor: "pointer", ...(!rx.visionType ? { opacity: 0.4 } : {}) }}>
            <option value="">Select...</option>
            {VISION_TYPES_CFG.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={rxLabelStyle}>Grade / Severity</label>
          <select className="gv-rx-select" value={rx.grade} onChange={updateField("grade")} style={{ ...rxInputBase, cursor: "pointer", ...(!rx.grade ? { opacity: 0.4 } : {}) }}>
            <option value="">Select...</option>
            {GRADE_OPTIONS_CFG.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={rxLabelStyle}>Astigmatism</label>
          <select className="gv-rx-select" value={rx.astigmatism} onChange={updateField("astigmatism")} style={{ ...rxInputBase, cursor: "pointer", ...(!rx.astigmatism ? { opacity: 0.4 } : {}) }}>
            <option value="">Select...</option>
            {ASTIGMATISM_OPTIONS_CFG.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={rxLabelStyle}>Sphere (SPH) <span style={{ opacity: 0.5, fontWeight: 400 }}>e.g. -2.50</span></label>
          <input className="gv-rx-input" type="text" value={rx.sph} onChange={updateField("sph")} placeholder="-2.50" style={rxInputBase} />
        </div>
        {rx.astigmatism && rx.astigmatism !== "None" && (<>
          <div>
            <label style={rxLabelStyle}>Cylinder (CYL) <span style={{ opacity: 0.5, fontWeight: 400 }}>e.g. -1.25</span></label>
            <input className="gv-rx-input" type="text" value={rx.cyl} onChange={updateField("cyl")} placeholder="-1.25" style={rxInputBase} />
          </div>
          <div>
            <label style={rxLabelStyle}>Axis <span style={{ opacity: 0.5, fontWeight: 400 }}>e.g. 180</span></label>
            <input className="gv-rx-input" type="text" value={rx.axis} onChange={updateField("axis")} placeholder="180" style={rxInputBase} />
          </div>
        </>)}
      </div>
    );
  };

  const frameThumbnails = useFrameThumbnails(FRAMES, MATERIALS[0].pbr);

  const flowingMenuItems = useMemo(() =>
    FRAMES.map((f, i) => ({
      link: "#",
      text: f.name,
      subtitle: f.category,
      price: f.basePrice,
      image: frameThumbnails[i] || "",
      isCustom: !!f.url,
    })),
    [frameThumbnails]
  );

  const lensImages = useMemo(() => generateLensImages(LENS_TYPES, frame.id), [frame.id]);
  const infiniteMenuLensItems = useMemo(() =>
    LENS_TYPES.map((lt, i) => ({
      image: lensImages[i],
      title: lt.name,
      description: lt.desc,
    })),
    [lensImages]
  );

  useParticles(particleCanvasRef, color.particle);

  /* ── build glasses ── */
  const buildGlasses = useCallback(async (fIdx, cIdx, mIdx, animate = true, justCache = false) => {
    const { scene, state } = sceneRef.current; if (!scene) return;
    
    if (swapRef.current) { clearInterval(swapRef.current); swapRef.current = null; }
    const reqId = ++reqIdRef.current;
    
    const oldPivot = sceneRef.current.pivot;
    const f = FRAMES[fIdx], c = f.colors[cIdx], mt = MATERIALS[mIdx];

    let model;
    if (f.url) {
      try {
        if (glbCacheRef.current[f.url]) {
          model = glbCacheRef.current[f.url].clone();
        } else {
          const gltf = await new Promise((resolve, reject) => {
            gltfLoader.load(f.url, resolve, undefined, reject);
          });
          if (reqId !== reqIdRef.current) return;
          
          const loadedModel = gltf.scene;
          loadedModel.rotation.y = -Math.PI / 2;
          loadedModel.updateMatrixWorld(true);

          let minZ = Infinity, maxZ = -Infinity;
          loadedModel.traverse(ch => {
            if (ch.isMesh) {
              ch.geometry.computeBoundingBox();
              const bbox = ch.geometry.boundingBox.clone().applyMatrix4(ch.matrixWorld);
              minZ = Math.min(minZ, bbox.min.z);
              maxZ = Math.max(maxZ, bbox.max.z);
            }
          });

          const depth = maxZ - minZ;
          const frontThreshold = maxZ - (depth * 0.1); 
          const frontBox = new THREE.Box3();
          loadedModel.traverse(ch => {
            if (ch.isMesh) {
              const pos = ch.geometry.attributes.position;
              const mat = ch.matrixWorld;
              for (let i = 0; i < pos.count; i++) {
                const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mat);
                if (v.z >= frontThreshold) frontBox.expandByPoint(v);
              }
            }
          });

          const center = frontBox.getCenter(new THREE.Vector3());
          const sz = frontBox.getSize(new THREE.Vector3());
          const targetWidth = 1.9;
          const scaleFac = targetWidth / Math.max(sz.x, 0.1);
          loadedModel.scale.setScalar(scaleFac);
          loadedModel.position.set(-center.x * scaleFac, -center.y * scaleFac, -maxZ * scaleFac);

          loadedModel.traverse(ch => {
            if (ch.isMesh) {
              const name = ch.name.toLowerCase();
              if (name.includes("temple") || name.includes("arm")) {
                const weight = ch.position.x < 0 ? -1 : 1;
                ch.rotation.y += 0.08 * weight;
              }
            }
          });

          autoTagGLBMeshes(loadedModel);
          glbCacheRef.current[f.url] = loadedModel;
          model = loadedModel.clone();
        }
        if (justCache) return;
      } catch (err) {
        console.error("GLB Load Error:", err);
        if (reqId === reqIdRef.current) setTransitioning(false);
        return;
      }
    } else {
      if (reqId !== reqIdRef.current) return;
      model = f.build(c, mt.pbr);
    }

    if (reqId !== reqIdRef.current) {
      if (model) { model.traverse(ch => { if (ch.geometry) ch.geometry.dispose(); }); }
      return;
    }

    const pivotsToFade = scene.children.filter(c => c.userData.isGlasses);
    const pivot = new THREE.Group();
    pivot.userData.isGlasses = true;
    pivot.add(model);
    pivot.rotation.set(deg(8), deg(0), 0);
    if (animate) pivot.scale.setScalar(0.01);
    
    scene.add(pivot);
    sceneRef.current.pivot = pivot;
    sceneRef.current.glasses = model;

    if (state) { state.targetRotX = deg(8); state.targetRotY = deg(0); }
    if (animate) {
      setTransitioning(true);
      let t = 0;
      swapRef.current = setInterval(() => {
        t += 0.04;
        pivotsToFade.forEach(oldPivot => {
          const s = Math.max(0, 1 - t * 2.5); 
          oldPivot.scale.setScalar(s); 
          oldPivot.rotation.y += 0.04; 
          if (s <= 0 && oldPivot.parent) { 
            scene.remove(oldPivot); 
            oldPivot.traverse(ch => { if (ch.geometry) ch.geometry.dispose(); if (ch.material) ch.material.dispose(); }); 
          } 
        });
        const sIn = Math.min(1, Math.max(0, (t - 0.2) * 2)); 
        const ease = 1 - Math.pow(1 - sIn, 3);
        pivot.scale.setScalar(ease * sizeScaleRef.current);
        
        if (t >= 1) { 
          clearInterval(swapRef.current); 
          swapRef.current = null;
          setTransitioning(false); 
          pivot.scale.setScalar(sizeScaleRef.current);
        }
      }, 16);
    } else {
      pivotsToFade.forEach(oldPivot => {
        if (oldPivot.parent) { 
          scene.remove(oldPivot); 
          oldPivot.traverse(ch => { if (ch.geometry) ch.geometry.dispose(); if (ch.material) ch.material.dispose(); }); 
        }
      });
      setTransitioning(false);
    }
  }, [gltfLoader]);

  /* ── apply material/colour/lens changes in-place (with GLB tinting) ── */
  const applyMaterials = useCallback(() => {
    const glasses = sceneRef.current.glasses; if (!glasses) return;
    const f = FRAMES[frameIdx];
    const c = f.colors[colorIdx];
    const mt = MATERIALS[matIdx];
    const lt = LENS_TYPES[lensIdx];

    glasses.traverse(child => {
      if (!child.isMesh) return;
      const name = child.userData.partName || "";
      const mats = Array.isArray(child.material) ? child.material : [child.material];

      mats.forEach(mat => {
        if (!mat || !mat.color) return;
        const isGLB = mat.userData._isGLB;
        const orig = mat.userData._origColor;

        if (name.includes("lens")) {
          if (isGLB && orig) {
            if (c.lens === 0xffffff) { mat.color.copy(orig); }
            else { mat.color.copy(orig).multiply(new THREE.Color(c.lens)); }
          } else {
            mat.color.setHex(lt.tint.color);
            mat.transmission = lt.tint.transmission;
            mat.opacity = lt.tint.opacity;
          }
        } else if (!isGLB && mat.metalness > 0.8) {
          mat.color.setHex(c.accent);
        } else if (isGLB && orig) {
          if (c.frame === 0xffffff) { mat.color.copy(orig); }
          else { mat.color.copy(orig).multiply(new THREE.Color(c.frame)); }
        } else {
          mat.color.setHex(c.frame);
          mat.metalness = mt.pbr.metalness;
          mat.roughness = mt.pbr.roughness;
          mat.clearcoat = mt.pbr.clearcoat;
          mat.clearcoatRoughness = mt.pbr.clearcoatRoughness;
        }
      });
    });
  }, [frameIdx, colorIdx, matIdx, lensIdx]);

  /* ── exploded view ── */
  useEffect(() => {
    const glasses = sceneRef.current.glasses;
    if (!glasses) return;
    const { state } = sceneRef.current;
    if (state) state.targetZ = exploded ? 4.2 : (STEP_ANGLES[step]?.z ?? 2.8);
    let t = 0;
    const id = setInterval(() => {
      t += 0.04; if (t > 1) { clearInterval(id); t = 1; }
      const ease = 1 - Math.pow(1 - t, 3);
      const progress = exploded ? ease : 1 - ease;
      glasses.children.forEach(child => {
        const name = child.userData.partName;
        if (!child._origPos) child._origPos = child.position.clone();
        const dir = EXPLODE_DIR[name] || new THREE.Vector3(0, 0, 0);
        child.position.lerpVectors(child._origPos, child._origPos.clone().add(dir.clone().multiplyScalar(0.6)), progress);
      });
    }, 16);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploded]);

  /* ── label projection ── */
  useEffect(() => {
    if (!exploded) { setLabelPositions([]); return; }
    const update = () => {
      const { glasses, camera } = sceneRef.current; const mount = mountRef.current;
      if (!glasses || !camera || !mount) return;
      const rect = mount.getBoundingClientRect(); const labels = [];
      const activeParts = FRAMES[frameIdx].labelParts;
      glasses.children.forEach(child => {
        const name = child.userData.partName;
        if (!name || !activeParts.includes(name)) return;
        const info = PART_INFO[name]; if (!info) return;
        const wp = new THREE.Vector3(); child.getWorldPosition(wp);
        const ndc = wp.clone().project(camera);
        const sx = (ndc.x * 0.5 + 0.5) * rect.width;
        const sy = (-ndc.y * 0.5 + 0.5) * rect.height;
        if (ndc.z > 0 && ndc.z < 1) labels.push({ name, x: sx, y: sy, label: info.label, detail: info.detail });
      });
      setLabelPositions(labels);
    };
    const id = setInterval(update, 50);
    return () => clearInterval(id);
  }, [exploded, frameIdx]);

  /* ── Three.js init ── */
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    const W = mount.clientWidth, H = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(W, H);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100); camera.position.set(0, 0.15, 4.5);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(3, 4, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
    scene.add(new THREE.DirectionalLight(0x8888ff, 0.5).translateX(-4).translateY(2).translateZ(3));
    scene.add(new THREE.DirectionalLight(0xffffff, 0.9).translateY(3).translateZ(-4));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.12 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.55; ground.receiveShadow = true; scene.add(ground);
    const state = { isDragging: false, prevX: 0, prevY: 0, velX: 0, velY: 0, targetRotX: deg(8), targetRotY: deg(0), targetZ: 2.8, mouseNX: 0, mouseNY: 0, introT: 0 };
    sceneRef.current = { renderer, scene, camera, state, mount };
    buildGlasses(0, 0, 0, false);
    setTimeout(() => { setLoaded(true); setIntroPlayed(true); }, 100);

    const canvas = renderer.domElement;
    const onDown = e => { state.isDragging = true; state.prevX = e.clientX; state.prevY = e.clientY; };
    const onMove = e => { const rect = mount.getBoundingClientRect(); state.mouseNX = ((e.clientX - rect.left) / rect.width) * 2 - 1; state.mouseNY = ((e.clientY - rect.top) / rect.height) * 2 - 1; if (!state.isDragging) return; const dx = e.clientX - state.prevX, dy = e.clientY - state.prevY; state.prevX = e.clientX; state.prevY = e.clientY; state.velX = dx * 0.006; state.velY = dy * 0.006; state.targetRotY += dx * 0.006; state.targetRotX += dy * 0.006; };
    const onUp = () => { state.isDragging = false; };
    const onWheel = e => { e.preventDefault(); camera.position.z = Math.max(1.5, Math.min(6, camera.position.z + e.deltaY * 0.003)); };
    canvas.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp); canvas.addEventListener("wheel", onWheel, { passive: false });

    let lastPinchDist = 0;
    const onTouchStart = (e) => { if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; lastPinchDist = Math.sqrt(dx * dx + dy * dy); } };
    const onTouchMove = (e) => { if (e.touches.length === 2) { e.preventDefault(); const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; const dist = Math.sqrt(dx * dx + dy * dy); if (lastPinchDist > 0) { const delta = (lastPinchDist - dist) * 0.01; camera.position.z = Math.max(1.5, Math.min(6, camera.position.z + delta)); } lastPinchDist = dist; } };
    const onTouchEnd = () => { lastPinchDist = 0; };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    let raf;
    let spinT = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const pivot = sceneRef.current.pivot; if (!pivot) return;
      if (state.introT < 1) { state.introT += 0.012; camera.position.z = lerp(4.5, 2.8, 1 - Math.pow(1 - Math.min(state.introT, 1), 4)); }
      if (!state.isDragging) { state.velX *= 0.92; state.velY *= 0.92; state.targetRotY += state.velX; state.targetRotX += state.velY; }
      if (spinRef.current) {
        spinT += 0.003;
        state.targetRotY += 0.005;
        state.targetRotX = Math.sin(spinT * 0.6) * 0.14;
        state.velX = 0;
        state.velY = 0;
      }
      const lerpSpeed = spinRef.current ? 0.025 : 0.09;
      pivot.rotation.y = lerp(pivot.rotation.y, state.targetRotY, lerpSpeed);
      pivot.rotation.x = lerp(pivot.rotation.x, state.targetRotX, spinRef.current ? 0.02 : lerpSpeed);
      camera.position.z = lerp(camera.position.z, state.targetZ ?? 2.8, 0.06);
      camera.position.x = lerp(camera.position.x, state.mouseNX * 0.1, 0.05);
      camera.position.y = lerp(camera.position.y, 0.15 - state.mouseNY * 0.06, 0.05);
      camera.lookAt(0, 0, 0); renderer.render(scene, camera);
    };
    animate();

    const doResize = () => { const w = mount.clientWidth, h = mount.clientHeight; if (w === 0 || h === 0) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") { resizeObserver = new ResizeObserver(() => doResize()); resizeObserver.observe(mount); }
    window.addEventListener("resize", doResize);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp); canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart); canvas.removeEventListener("touchmove", onTouchMove); canvas.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", doResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [buildGlasses]);

  /* ── Pre-load custom GLBs on mount ── */
  useEffect(() => {
    FRAMES.forEach(f => {
      if (f.url && !glbCacheRef.current[f.url]) {
        buildGlasses(FRAMES.indexOf(f), 0, 0, false, true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── reactivity ── */
  const prevFrameRef = useRef(0);
  useEffect(() => {
    if (!sceneRef.current.scene || !introPlayed) return;
    if (frameIdx !== prevFrameRef.current) {
      setExploded(false);
      const shouldAnimate = !skipAnimRef.current;
      skipAnimRef.current = false;
      buildGlasses(frameIdx, colorIdx, matIdx, shouldAnimate);
    } else { 
      applyMaterials(); 
    }
    prevFrameRef.current = frameIdx;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameIdx, colorIdx, matIdx, lensIdx]);

  /* ── Silhouette diagram renderer ── */
  useEffect(() => {
    let cancelled = false;

    const renderSilhouette = async () => {
      const W = 560, H = 200;
      const offR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      offR.setSize(W, H);
      offR.setPixelRatio(2);
      offR.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const aspect = W / H;
      const fH = 0.82;
      const camera = new THREE.OrthographicCamera(-fH * aspect, fH * aspect, fH, -fH, 0.1, 20);
      camera.position.set(0, 0, 5);
      camera.lookAt(0, 0, 0);

      const silMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

      const f = FRAMES[frameIdx];
      let model;
      try {
        if (f.url) {
          let cached = glbCacheRef.current[f.url];
          if (!cached) {
            const gltf = await new Promise((res, rej) => gltfLoader.load(f.url, res, undefined, rej));
            if (cancelled) { offR.dispose(); return; }
            const lm = gltf.scene;
            lm.rotation.y = -Math.PI / 2;
            lm.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(lm);
            const sz = box.getSize(new THREE.Vector3());
            const sc = 1.9 / Math.max(sz.x, 0.1);
            const ctr = box.getCenter(new THREE.Vector3());
            lm.scale.setScalar(sc);
            lm.position.set(-ctr.x * sc, -ctr.y * sc, -ctr.z * sc);
            glbCacheRef.current[f.url] = lm;
            cached = lm;
          }
          model = cached.clone();
        } else {
          model = f.build(f.colors[colorIdx], MATERIALS[matIdx].pbr);
        }
      } catch (e) {
        offR.dispose();
        return;
      }

      if (cancelled) { offR.dispose(); return; }

      model.traverse(ch => { if (ch.isMesh) ch.material = silMat; });
      scene.add(model);
      offR.render(scene, camera);

      if (!cancelled) {
        setDiagramDataUrl(offR.domElement.toDataURL("image/png"));
      }

      offR.dispose();
      scene.traverse(ch => { if (ch.geometry) ch.geometry.dispose(); });
    };

    setDiagramDataUrl(null);
    renderSilhouette();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameIdx, gltfLoader]);

  /* ── Size scale animation ── */
  useEffect(() => {
    sizeScaleRef.current = SIZE_SCALES[sizeIdx];
    const pivot = sceneRef.current.pivot;
    if (!pivot) return;
    const startScale = pivot.scale.x;
    const targetScale = SIZE_SCALES[sizeIdx];
    let t = 0;
    const id = setInterval(() => {
      t += 0.05;
      if (t >= 1) { t = 1; clearInterval(id); }
      const eased = 1 - Math.pow(1 - t, 3);
      if (sceneRef.current.pivot) {
        sceneRef.current.pivot.scale.setScalar(startScale + (targetScale - startScale) * eased);
      }
    }, 16);
    return () => clearInterval(id);
  }, [sizeIdx]);

  /* ── Cinematic step transitions ── */
  useEffect(() => {
    const { state } = sceneRef.current;
    if (!state || !introPlayed) return;
    const angle = STEP_ANGLES[step];
    state.targetRotX = angle.x;
    state.targetRotY = angle.y;
    state.targetZ    = angle.z;
    state.velX = 0;
    state.velY = 0;
    setExploded(false);
  }, [step, introPlayed]);

  /* ── inject CSS ── */
  useEffect(() => {
    const id = "gv-styles"; if (document.getElementById(id)) return;
    const s = document.createElement("style"); s.id = id;
    s.textContent = `
      @keyframes gvFadeUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
      @keyframes gvFadeIn { from { opacity:0 } to { opacity:1 } }
      @keyframes gvSlideIn { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }
      @keyframes gvShine { 0% { left:-100% } 100% { left:200% } }
      @keyframes gvSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      @keyframes gvLabelIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
      @keyframes gvScanPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(111,207,151,0.4) } 50% { box-shadow: 0 0 0 8px rgba(111,207,151,0) } }
      .gv-nav-links { display: flex; gap: 32px; }
      .gv-hamburger { display: none !important; }
      .gv-main { flex-direction: row !important; }
      .gv-cta { position:relative; overflow:hidden; }
      .gv-cta::after { content:''; position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent); animation: gvShine 3s ease-in-out infinite; }
      .gv-cta:hover { background: #fff !important; transform: translateY(-2px); box-shadow: 0 12px 40px rgba(255,255,255,0.2); }
      .gv-frame-card { transition: all 0.35s cubic-bezier(0.23,1,0.32,1) !important; }
      .gv-frame-card:hover { border-color: rgba(255,255,255,0.3) !important; transform: translateY(-2px); background: rgba(255,255,255,0.06) !important; }
      .gv-swatch { transition: all 0.35s cubic-bezier(0.23,1,0.32,1) !important; }
      .gv-swatch:hover { transform: scale(1.3) !important; }
      .gv-explode { transition: all 0.3s !important; }
      .gv-explode:hover { background: rgba(255,255,255,0.12) !important; }
      .gv-nav-link { transition: all 0.3s !important; }
      .gv-nav-link:hover { opacity: 1 !important; }
      .gv-label-line { stroke-dasharray:200; stroke-dashoffset:200; animation: gvDrawLine 0.6s ease forwards; }
      @keyframes gvDrawLine { to { stroke-dashoffset: 0 } }
      .gv-next:hover { background: #fff !important; color: #000 !important; }
      .gv-back:hover { background: rgba(255,255,255,0.1) !important; }
      .gv-scan-cta { transition: all 0.4s cubic-bezier(0.23,1,0.32,1) !important; }
      .gv-scan-cta:hover { transform: translateY(-3px) !important; box-shadow: 0 8px 32px rgba(111,207,151,0.25) !important; border-color: rgba(111,207,151,0.5) !important; }
      .gv-ar-cta { transition: all 0.4s cubic-bezier(0.23,1,0.32,1) !important; }
      .gv-ar-cta:hover { transform: translateY(-3px) !important; box-shadow: 0 8px 32px rgba(78,205,196,0.2) !important; border-color: rgba(78,205,196,0.4) !important; }
      @media (max-width: 840px) {
        .gv-nav-links { display: none !important; }
        .gv-hamburger { display: flex !important; }
        .gv-main { flex-direction: column !important; }
        .gv-viewport-wrap { min-width: 0 !important; flex: 1 1 auto !important; }
        .gv-panel-wrap { min-width: 0 !important; flex: 1 1 auto !important; max-width: 100% !important; width: 100% !important; }
      }
      @media (max-width: 480px) {
        .gv-main { padding: 12px 12px !important; gap: 20px !important; }
        .gv-frame-card { padding: 10px 12px !important; }
        .gv-price-ticker { flex-direction: column !important; gap: 10px !important; text-align: center !important; }
        .gv-price-ticker > div { text-align: center !important; }
      }
      .gv-rx-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23ffffff' opacity='0.5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; }
      .gv-rx-select option { background: #1a1a2e; color: #fff; }
      .gv-rx-select:focus, .gv-rx-input:focus { border-color: rgba(111,207,151,0.5) !important; }
      .gv-currency { font-weight: 500; font-size: 0.85em; vertical-align: baseline; position: relative; top: -0.05em; margin-right: 2px; }
      .gv-price-val { font-variant-numeric: lining-nums; font-feature-settings: "lnum"; display: inline-flex; align-items: baseline; }
    `;
    document.head.appendChild(s);
  }, []);

  const bg = color.bg;
  const nextStep = () => setStep(Math.min(step + 1, STEPS.length - 1));
  const prevStep = () => setStep(Math.max(step - 1, 0));
  const labelOffset = isMobile ? 60 : 100;
  const menuHeight = isSmall ? Math.max(240, FRAMES.length * 56) : isMobile ? Math.max(280, FRAMES.length * 64) : Math.max(320, FRAMES.length * 76);

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ width: "100%", minHeight: "100vh", background: `linear-gradient(135deg, ${bg[0]} 0%, ${bg[1]} 50%, ${bg[2]} 100%)`, display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", color: "#fff", transition: "background 1s cubic-bezier(0.4,0,0.2,1)", overflowX: "hidden", position: "relative" }}>
      <canvas ref={particleCanvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }} />

      <div style={{ height: 56 }} />

      {/* MAIN */}
      <div className="gv-main" style={{ flex: page === "configurator" ? 1 : "0 0 0px", maxWidth: 1200, width: "100%", margin: "0 auto", padding: isSmall ? "12px 12px" : "24px 24px", display: "flex", height: page === "configurator" ? "auto" : 0, overflow: page === "configurator" ? "visible" : "hidden", visibility: page === "configurator" ? "visible" : "hidden", pointerEvents: page === "configurator" ? "auto" : "none", gap: isMobile ? 20 : 40, alignItems: "flex-start", flexWrap: "wrap", boxSizing: "border-box" }}>
        {/* 3D VIEWPORT */}
        <div className="gv-viewport-wrap" style={{ flex: "1 1 480px", minWidth: 0, position: "relative", width: "100%" }}>
          <div style={{ position: "relative", overflow: "hidden", borderRadius: isMobile ? 14 : 20 }}>
            <div ref={mountRef} style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: isMobile ? 14 : 20, overflow: "hidden", cursor: "grab", opacity: loaded ? 1 : 0, transition: "opacity 1.2s cubic-bezier(0.4,0,0.2,1)", boxShadow: "0 0 80px rgba(0,0,0,0.3)", touchAction: "none", background: "radial-gradient(ellipse at 40% 35%, rgba(28,28,52,0.95) 0%, rgba(5,5,14,1) 100%)" }} />
            {exploded && labelPositions.length > 0 && (
              <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden" }}>
                {labelPositions.map((lp, i) => {
                  const containerW = mountRef.current?.clientWidth || 600;
                  const containerH = mountRef.current?.clientHeight || 450;
                  const cx = containerW / 2;
                  const cy = containerH / 2;
                  const angle = Math.atan2(lp.y - cy, lp.x - cx);
                  const rawLx = lp.x + Math.cos(angle) * labelOffset;
                  const rawLy = lp.y + Math.sin(angle) * labelOffset;
                  const edgePad = 8;
                  const lx = Math.max(edgePad, Math.min(containerW - edgePad, rawLx));
                  const ly = Math.max(edgePad, Math.min(containerH - edgePad, rawLy));
                  const approxTextW = 115;
                  const ta = (containerW - lx < approxTextW) ? "end"
                           : (lx < approxTextW)              ? "start"
                           : (rawLx > cx ? "start" : "end");
                  const tx = lx + (ta === "start" ? 10 : -10);
                  return (
                    <g key={lp.name} style={{ animation: `gvLabelIn 0.5s ease ${0.1 * i}s both` }}>
                      <line className="gv-label-line" x1={lp.x} y1={lp.y} x2={lx} y2={ly} stroke="rgba(255,255,255,0.4)" strokeWidth="1" style={{ animationDelay: `${0.1 * i}s` }} />
                      <circle cx={lp.x} cy={lp.y} r="3" fill="rgba(255,255,255,0.9)" />
                      <text x={tx} y={ly - 6} fill="white" fontSize={isSmall ? "9" : "11"} fontWeight="600" fontFamily="DM Sans" textAnchor={ta} letterSpacing="1" style={{ textTransform: "uppercase" }}>{lp.label}</text>
                      <text x={tx} y={ly + 9} fill="rgba(255,255,255,0.4)" fontSize={isSmall ? "8" : "9"} fontFamily="DM Sans" textAnchor={ta}>{lp.detail}</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
            <button className="gv-explode" onClick={() => setExploded(!exploded)} style={{ background: exploded ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "7px 18px", borderRadius: 8, cursor: "pointer", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>
              {exploded ? "◇ Assemble" : "◈ Explode"}
            </button>
            <button className="gv-explode" onClick={() => { const next = !spinRef.current; spinRef.current = next; setIsSpinning(next); }} style={{ background: isSpinning ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "7px 18px", borderRadius: 8, cursor: "pointer", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>
              ↻ {isSpinning ? "Stop" : "Spin"}
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 10, opacity: 0.4, marginTop: 8, letterSpacing: 1 }}>
            {isMobile ? "Drag to rotate · Pinch to zoom" : "Drag to rotate · Scroll to zoom"}
          </p>

          <div className="gv-price-ticker" style={{ marginTop: 20, padding: isSmall ? "12px 14px" : "16px 20px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 10, opacity: 0.55, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>Your Build</p>
              <p style={{ margin: "4px 0 0", fontSize: isSmall ? 11 : 13, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{frame.name} · {material.name} · {lens.name}</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 28, fontWeight: 600 }} className="gv-price-val"><span className="gv-currency">₱</span>{totalPrice.toLocaleString()}</p>
              <p style={{ margin: 0, fontSize: 10, opacity: 0.5 }}>estimated</p>
            </div>
          </div>
        </div>

        {/* CONFIGURATOR PANEL */}
        <div className="gv-panel-wrap" style={{ flex: "1 1 340px", minWidth: 0, maxWidth: "100%", display: "flex", flexDirection: "column", paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, animation: "gvFadeUp 0.4s ease both" }}>
            <span style={{ fontSize: 10, opacity: 0.5, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>Step {step + 1} of {STEPS.length}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {STEPS.map((_, i) => (
                <button key={i} onClick={() => setStep(i)} style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 4, background: i === step ? "rgba(255,255,255,0.8)" : i < step ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", transition: "all 0.4s cubic-bezier(0.23,1,0.32,1)", padding: 0 }} />
              ))}
            </div>
          </div>

          <div key={step} style={{ animation: "gvFadeUp 0.35s ease both", flex: 1 }}>

            {step === 0 && (<>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 26, fontWeight: 500, margin: "0 0 6px" }}>Let's find your perfect fit</h2>
              <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 24px", lineHeight: 1.6 }}>Our AI measures your face in seconds and recommends the ideal frame style and size. No optician needed.</p>

              {/* ── AI Face Scan CTA ── */}
              <button
                className="gv-scan-cta"
                onClick={() => {
                  setScanReturnStep(1);
                  setPage("scanner");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                style={{
                  width: "100%", padding: "28px 24px", borderRadius: 20, cursor: "pointer",
                  background: "linear-gradient(135deg, rgba(111,207,151,0.1) 0%, rgba(78,205,196,0.06) 100%)",
                  border: "1px solid rgba(111,207,151,0.25)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center",
                  marginBottom: 20, position: "relative", overflow: "hidden",
                }}
              >
                <div style={{
                  width: 72, height: 72, borderRadius: 20, flexShrink: 0,
                  background: "rgba(111,207,151,0.1)", border: "1px solid rgba(111,207,151,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  animation: "gvScanPulse 2.5s ease-in-out infinite",
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6fcf97" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 3H5a2 2 0 0 0-2 2v2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M17 21h2a2 2 0 0 0 2-2v-2" />
                    <circle cx="12" cy="10" r="3" /><path d="M12 13c-3 0-5 1.5-5 3v1h10v-1c0-1.5-2-3-5-3z" />
                  </svg>
                </div>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "#fff", display: "block", marginBottom: 6 }}>Scan Your Face</span>
                  <p style={{ margin: 0, fontSize: 12, opacity: 0.65, lineHeight: 1.5, color: "#fff", maxWidth: 280 }}>
                    10-second AI scan using MediaPipe. Recommends the best frame shape and size for your face.
                  </p>
                </div>
                {calibratedFaceWidth && (
                  <div style={{
                    position: "absolute", top: 12, right: 14,
                    fontSize: 9, padding: "3px 10px", borderRadius: 6,
                    background: "rgba(111,207,151,0.15)", border: "1px solid rgba(111,207,151,0.25)",
                    color: "#6fcf97", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                  }}>
                    Scanned: {calibratedFaceWidth}mm
                  </div>
                )}
              </button>

              {/* How it works */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                  { icon: "◎", title: "Detect", desc: "468 facial landmarks tracked in real-time" },
                  { icon: "⊡", title: "Measure", desc: "Face width, bridge, and proportions calculated" },
                  { icon: "◈", title: "Match", desc: "AI picks the best frame and size for you" },
                ].map((s, i) => (
                  <div key={i} style={{
                    padding: "14px 12px", borderRadius: 12, textAlign: "center",
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <span style={{ fontSize: 18, display: "block", marginBottom: 6, opacity: 0.5 }}>{s.icon}</span>
                    <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600 }}>{s.title}</p>
                    <p style={{ margin: 0, fontSize: 10, opacity: 0.55, lineHeight: 1.4 }}>{s.desc}</p>
                  </div>
                ))}
              </div>

              {/* Skip option */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                <span style={{ fontSize: 10, opacity: 0.45, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, flexShrink: 0 }}>or</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              </div>
              <button
                onClick={() => setStep(1)}
                style={{
                  width: "100%", padding: "14px 0", borderRadius: 10, cursor: "pointer",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12, fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase",
                }}
              >
                Skip, choose manually
              </button>
            </>)}

            {step === 1 && (<>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 26, fontWeight: 500, margin: "0 0 6px" }}>Choose your frame</h2>
              <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 16px" }}>Each frame is 3D printed from recycled materials to your exact specs.</p>
              <div style={{ height: menuHeight, maxHeight: isSmall ? 320 : 460, position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
                <FlowingMenu items={flowingMenuItems} speed={18} textColor="rgba(255,255,255,0.85)" bgColor="rgba(255,255,255,0.02)" marqueeBgColor="rgba(255,255,255,0.95)" marqueeTextColor="#060010" borderColor="rgba(255,255,255,0.06)" selectedIndex={frameIdx} onItemClick={(i) => { setFrameIdx(i); setColorIdx(0); }} />
              </div>
              <p style={{ fontSize: 10, opacity: 0.4, marginTop: 10, textAlign: "center", letterSpacing: 1.5, textTransform: "uppercase" }}>{isMobile ? "Tap to select" : "Hover to preview · Click to select"}</p>
            </>)}

            {step === 2 && (<>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 26, fontWeight: 500, margin: "0 0 6px" }}>Pick your material</h2>
              <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 20px" }}>All materials are sourced from post-consumer waste. Zero virgin plastic.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {MATERIALS.map((mt, i) => (
                  <OptCard key={mt.id} selected={matIdx === i} onClick={() => setMatIdx(i)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 16 }}>{mt.icon}</span>
                          <span style={{ fontSize: isSmall ? 13 : 15, fontWeight: 500 }}>{mt.name}</span>
                          <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>{mt.tag}</span>
                        </div>
                        <p style={{ margin: "0 0 4px", fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>{mt.desc}</p>
                        <p style={{ margin: 0, fontSize: 10, opacity: 0.5, color: "#6fcf97" }}>{mt.co2}</p>
                      </div>
                      <span style={{ fontSize: 14, opacity: 0.5, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", marginLeft: 12, flexShrink: 0 }} className="gv-price-val">{mt.price === 0 ? "included" : <><span className="gv-currency" style={{ fontSize: "0.9em", top: "-0.02em" }}>+₱</span>{mt.price}</>}</span>
                    </div>
                  </OptCard>
                ))}
              </div>
            </>)}

{step === 3 && (<>
  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 26, fontWeight: 500, margin: "0 0 6px" }}>Select your lens</h2>
  <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 14px" }}>All lenses are scratch-resistant polycarbonate with UV400 protection.</p>
  <LensPicker
    lensTypes={LENS_TYPES}
    lensIdx={lensIdx}
    onSelect={(i) => setLensIdx(i)}
    frameId={frame.id}
  />
</>)}

            {/* STEP 4: PRESCRIPTION */}
            {step === 4 && (<>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 26, fontWeight: 500, margin: "0 0 6px" }}>Enter your prescription</h2>
              <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 20px", lineHeight: 1.6 }}>So we can cut the right lenses for your pair. Skip if you'll provide later.</p>

              {/* Toggle: same vs different per eye */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                <button
                  type="button"
                  onClick={() => setDifferentPerEye(!differentPerEye)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                    background: differentPerEye ? "linear-gradient(135deg, #6fcf97, #4ecdc4)" : "rgba(255,255,255,0.12)",
                    position: "relative", transition: "background 0.3s", flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3,
                    left: differentPerEye ? 21 : 3,
                    transition: "left 0.25s cubic-bezier(0.23,1,0.32,1)",
                  }} />
                </button>
                <span style={{ fontSize: 13, opacity: 0.7 }}>My eyes have different grades</span>
              </div>

              {!differentPerEye ? (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.5, margin: "0 0 10px" }}>Both Eyes</p>
                  {renderRxBlock(rxBoth, setRxBoth)}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.5, margin: "0 0 10px" }}>Right Eye <span style={{ opacity: 0.7 }}>(OD)</span></p>
                    {renderRxBlock(rxOD, setRxOD)}
                  </div>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.5, margin: "0 0 10px" }}>Left Eye <span style={{ opacity: 0.7 }}>(OS)</span></p>
                    {renderRxBlock(rxOS, setRxOS)}
                  </div>
                </div>
              )}

              <p style={{ fontSize: 11, opacity: 0.45, margin: "16px 0 0", lineHeight: 1.6, textAlign: "center" }}>
                Don't know your prescription? No worries — you can skip this step and provide it later.
              </p>
            </>)}

            {step === 5 && (<>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 26, fontWeight: 500, margin: "0 0 6px" }}>Choose your colour</h2>
              <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 14px" }}>
                {frame.url ? "Tints applied over the original design." : "Pigment mixed into the filament before printing."}
              </p>
              <ColorPicker
                colors={frame.colors}
                colorIdx={colorIdx}
                onSelect={(i) => setColorIdx(i)}
                frameIsGLB={!!frame.url}
                matIdx={matIdx}
              />
            </>)}

            {/* STEP 6: SIZE */}
            {step === 6 && (<>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 26, fontWeight: 500, margin: "0 0 6px" }}>Select your size</h2>
              <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 16px" }}>3D printing means every pair can be made to measure.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {SIZES.map((sz, i) => (
                  <OptCard key={sz.id} selected={sizeIdx === i} onClick={() => setSizeIdx(i)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 500 }}>{sz.name}</span>
                        <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.6 }}>{sz.fit} · Total width: {sz.width}</p>
                      </div>
                    </div>
                  </OptCard>
                ))}
              </div>
              {/* ── Silhouette diagram ── */}
              <div style={{ marginTop: 16, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", overflow: "hidden" }}>
                <div style={{ position: "relative", padding: "12px 0 4px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 110 }}>
                  {diagramDataUrl ? (
                    <img
                      src={diagramDataUrl}
                      alt="Frame silhouette"
                      style={{
                        width: "90%",
                        height: "auto",
                        display: "block",
                        opacity: 0.38,
                        transform: `scale(${SIZE_SCALES[sizeIdx]})`,
                        transformOrigin: "center center",
                        transition: "transform 0.45s cubic-bezier(0.23,1,0.32,1)",
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.25, fontSize: 11 }}>
                      <div style={{ width: 14, height: 14, border: "1.5px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "gvSpin 0.8s linear infinite" }} />
                      Rendering diagram...
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: "1px solid rgba(255,255,255,0.04)", padding: "10px 0" }}>
                  {[
                    { label: "Lens", val: frame.dimensions.lens },
                    { label: "Bridge", val: frame.dimensions.bridge },
                    { label: "Total Width", val: size.width },
                  ].map((d, i) => (
                    <div key={i} style={{ textAlign: "center", padding: "0 8px", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <p style={{ margin: 0, fontSize: 9, opacity: 0.5, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>{d.label}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{d.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* STEP 7: SUMMARY — with AR Try-On CTA */}
            {step === 7 && (<>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 22 : 26, fontWeight: 500, margin: "0 0 6px" }}>Your custom pair</h2>
              <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 16px" }}>Review your configuration before ordering.</p>

              {/* ── Compact build summary ── */}
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "6px 14px", padding: "14px 18px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14, alignItems: "baseline" }}>
                {[
                  ["Frame", <>{frame.name} <span style={{ opacity: 0.55, fontSize: 11 }}>{color.name}</span></>, <span className="gv-price-val" style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.7, fontSize: 11 }}><span className="gv-currency" style={{ fontSize: "0.85em" }}>₱</span>{frame.basePrice.toLocaleString()}</span>],
                  ["Material", <>{material.name} <span style={{ opacity: 0.55, fontSize: 11 }}>{material.tag}</span></>, <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.7, fontSize: 11 }}>{material.price === 0 ? "incl." : `+₱${material.price}`}</span>],
                  ["Lens", <>{lens.name}</>, <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.7, fontSize: 11 }}>{lens.price === 0 ? "incl." : `+₱${lens.price}`}</span>],
                  ["Rx", (differentPerEye ? rxOD : rxBoth).visionType
                    ? <>{(differentPerEye ? rxOD : rxBoth).visionType.split(" (")[0]} <span style={{ opacity: 0.55, fontSize: 11 }}>{(differentPerEye ? rxOD : rxBoth).grade ? (differentPerEye ? rxOD : rxBoth).grade.split(" (")[0] : ""}{(differentPerEye ? rxOD : rxBoth).astigmatism && (differentPerEye ? rxOD : rxBoth).astigmatism !== "None" ? " · Astig." : ""}</span></>
                    : <span style={{ opacity: 0.55 }}>Not provided</span>,
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.7, fontSize: 11 }}>{differentPerEye ? "OD/OS" : "—"}</span>],
                  ["Size", <>{size.name} <span style={{ opacity: 0.55, fontSize: 11 }}>{size.width}</span></>, <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.7, fontSize: 11 }}>incl.</span>],
                ].map(([label, value, price], i) => (
                  <div key={i} style={{ display: "contents" }}>
                    <span style={{ fontSize: 10, opacity: 0.5, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap", paddingTop: 1 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
                    <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>{price}</span>
                  </div>
                ))}
              </div>

              {/* ── Environmental + total row ── */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: "rgba(111,207,151,0.05)", border: "1px solid rgba(111,207,151,0.12)" }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#6fcf97", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Impact</p>
                  <p style={{ margin: 0, fontSize: 11, opacity: 0.65, lineHeight: 1.5 }}>~15g recycled plastic, 12 bottle caps diverted. {material.co2}.</p>
                </div>
                <div style={{ flexShrink: 0, padding: "12px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ margin: 0, fontSize: 10, opacity: 0.5 }}>Total</p>
                  <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 24 : 28, fontWeight: 600 }} className="gv-price-val"><span className="gv-currency">₱</span>{totalPrice.toLocaleString()}</p>
                </div>
              </div>

              {/* ── AR Try-On — prominent ── */}
              <button
                className="gv-ar-cta"
                onClick={() => {
                  setPage("ar");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                style={{
                  width: "100%", padding: "18px 20px", borderRadius: 14, cursor: "pointer",
                  background: "linear-gradient(135deg, rgba(78,205,196,0.12) 0%, rgba(111,207,151,0.08) 100%)",
                  border: "1.5px solid rgba(78,205,196,0.3)",
                  display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                  marginBottom: 14, position: "relative", overflow: "hidden",
                }}
              >
                {/* Shimmer sweep */}
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: "linear-gradient(105deg, transparent 40%, rgba(78,205,196,0.08) 50%, transparent 60%)",
                  backgroundSize: "200% 100%",
                  animation: "gvShine 4s ease-in-out infinite",
                }} />
                <div style={{
                  width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                  background: "rgba(78,205,196,0.15)", border: "1px solid rgba(78,205,196,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                    <circle cx="9" cy="10" r="2" /><circle cx="15" cy="10" r="2" /><line x1="11" y1="10" x2="13" y2="10" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Try on with AR</span>
                    <span style={{
                      fontSize: 8, padding: "2px 8px", borderRadius: 4,
                      background: "rgba(78,205,196,0.15)", border: "1px solid rgba(78,205,196,0.3)",
                      color: "#4ecdc4", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
                    }}>Live</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11, opacity: 0.6, color: "#fff" }}>
                    See how they look on your face before you buy
                  </p>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(78,205,196,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, position: "relative", zIndex: 1 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <button className="gv-cta" style={{ width: "100%", padding: "18px 0", background: "rgba(255,255,255,0.92)", color: "#000", border: "none", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", cursor: isCheckingOut ? "wait" : "pointer", transition: "all 0.4s cubic-bezier(0.23,1,0.32,1)", opacity: isCheckingOut ? 0.7 : 1 }} onClick={handleCheckout} disabled={isCheckingOut}>{isCheckingOut ? "Preparing Checkout..." : "Order Custom Pair"}</button>
            </>)}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            {step > 0 && (
              <button className="gv-back" onClick={prevStep} style={{ flex: 1, padding: "14px 0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer", transition: "all 0.3s" }}>Back</button>
            )}
            {step < STEPS.length - 1 && (
              <button className="gv-next" onClick={nextStep} style={{ flex: 2, padding: "14px 0", background: "rgba(255,255,255,0.85)", color: "#111", border: "none", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer", transition: "all 0.3s" }}>Next: {STEPS[step + 1]}</button>
            )}
          </div>
        </div>
      </div>

      {page === "impact" && (<div style={{ position: "relative", zIndex: 2, flex: 1, width: "100%" }}><ImpactPage /></div>)}
      {page === "recycle" && (<div style={{ position: "relative", zIndex: 2, flex: 1, width: "100%" }}><LensRecycle /></div>)}
      {page === "scanner" && (<div style={{ position: "relative", zIndex: 2, flex: 1, width: "100%" }}><FitScanner onApplyFit={({ frameIdx: fIdx, sizeIdx: sIdx, faceWidth }) => { skipAnimRef.current = true; setFrameIdx(fIdx); setColorIdx(0); setSizeIdx(sIdx); setCalibratedFaceWidth(faceWidth); setStep(scanReturnStep != null ? scanReturnStep : 1); setScanReturnStep(null); setPage("configurator"); window.scrollTo({ top: 0, behavior: "smooth" }); }} /></div>)}
      {page === "ar" && (<div style={{ position: "relative", zIndex: 2, flex: 1, width: "100%" }}><ARTryOn faceWidth={calibratedFaceWidth} initialFrameId={frame.id} initialColorIdx={colorIdx} onBack={() => { setPage("configurator"); setStep(7); window.scrollTo({ top: 0, behavior: "smooth" }); }} /></div>)}

      <footer style={{ padding: isSmall ? "16px 12px" : 20, textAlign: "center", fontSize: 10, letterSpacing: 3, opacity: 0.4, textTransform: "uppercase", display: "flex", gap: isSmall ? 8 : 16, justifyContent: "center", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.03)", marginTop: "auto", position: "relative", zIndex: 2 }}>
        <span>OPTIQ © 2026</span><span>·</span><span>Recycled eyewear, 3D printed for you</span>
      </footer>
    </div>
  );
}