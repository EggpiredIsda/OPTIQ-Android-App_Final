import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

/* ═══════════════════════════════════════════════════════════
   1. ONE EURO FILTER & MATH
   ═══════════════════════════════════════════════════════════ */
class LowPassFilter {
  constructor(alpha) {
    this.y = null;
    this.s = null;
    this.setAlpha(alpha);
  }
  setAlpha(alpha) {
    this.alpha = Math.max(0.0001, Math.min(1, alpha));
  }
  filter(value) {
    if (this.y === null) {
      this.s = value;
    } else {
      this.s = this.alpha * value + (1 - this.alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }
  lastValue() { return this.y; }
  reset() { this.y = null; this.s = null; }
}

class OneEuroFilter {
  constructor(freq = 30, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPassFilter(this._alpha(minCutoff));
    this.dx = new LowPassFilter(this._alpha(dCutoff));
    this.lastTime = null;
  }

  _alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(value, timestamp) {
    if (this.lastTime !== null && timestamp !== this.lastTime) {
      this.freq = 1.0 / ((timestamp - this.lastTime) / 1000);
    }
    this.lastTime = timestamp;

    const prev = this.x.lastValue();
    const dx = prev === null ? 0 : (value - prev) * this.freq;

    const edx = this.dx.filter(dx);
    this.dx.setAlpha(this._alpha(this.dCutoff));

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    this.x.setAlpha(this._alpha(cutoff));

    return this.x.filter(value);
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}

class FilterBank {
  constructor(config) {
    this.filters = {};
    this.config = config;
  }

  filter(key, value, timestamp) {
    if (!this.filters[key]) {
      const c = this.config[key] || this.config._default;
      this.filters[key] = new OneEuroFilter(c.freq, c.minCutoff, c.beta, c.dCutoff);
    }
    return this.filters[key].filter(value, timestamp);
  }

  reset() {
    Object.values(this.filters).forEach(f => f.reset());
  }
}

const FILTER_CONFIG = {
  px:    { freq: 30, minCutoff: 1.5,  beta: 0.5,  dCutoff: 1.0 },
  py:    { freq: 30, minCutoff: 1.5,  beta: 0.5,  dCutoff: 1.0 },
  scale: { freq: 30, minCutoff: 0.3,  beta: 0.01, dCutoff: 1.0 },
  roll:  { freq: 30, minCutoff: 0.8,  beta: 0.2,  dCutoff: 1.0 },
  yaw:   { freq: 30, minCutoff: 0.6,  beta: 0.15, dCutoff: 1.0 },
  pitch: { freq: 30, minCutoff: 0.6,  beta: 0.1,  dCutoff: 1.0 },
  depth: { freq: 30, minCutoff: 0.2,  beta: 0.01, dCutoff: 1.0 },
  _default: { freq: 30, minCutoff: 1.0, beta: 0.1, dCutoff: 1.0 },
};

/* ═══════════════════════════════════════════════════════════
   2. POSE ESTIMATION
   ═══════════════════════════════════════════════════════════ */
const LM = {
  leftEyeOuter: 33, rightEyeOuter: 263,
  leftEyeInner: 133, rightEyeInner: 362,
  leftTemple: 234, rightTemple: 454,
  noseBridge: 6, noseBridgeTop: 168, noseTip: 1,
  foreHead: 10, chin: 152,
  leftCheek: 234, rightCheek: 454,
  leftBrowOuter: 46, rightBrowOuter: 276,
  leftIris: [468, 469, 470, 471, 472],
  rightIris: [473, 474, 475, 476, 477],
};

function avgLandmark(...lms) {
  const n = lms.length;
  return {
    x: lms.reduce((s, l) => s + l.x, 0) / n,
    y: lms.reduce((s, l) => s + l.y, 0) / n,
    z: lms.reduce((s, l) => s + (l.z || 0), 0) / n,
  };
}

function extractFacePose(landmarks, vWidth, vHeight, facialMatrix, calibratedFaceWidth = null) {
  const bridge = landmarks[LM.noseBridge];
  const bridgeTop = landmarks[LM.noseBridgeTop];
  const leftEyeO = landmarks[LM.leftEyeOuter];
  const rightEyeO = landmarks[LM.rightEyeOuter];
  const leftEyeI = landmarks[LM.leftEyeInner];
  const rightEyeI = landmarks[LM.rightEyeInner];
  const leftTemple = landmarks[LM.leftTemple];
  const rightTemple = landmarks[LM.rightTemple];

  const aspect = vWidth / vHeight;
  const normDist = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + ((p1.y - p2.y) / aspect) ** 2);

  const eyeOuterW = normDist(leftEyeO, rightEyeO);
  const lIrisH = normDist(landmarks[LM.leftIris[1]], landmarks[LM.leftIris[2]]);
  const rIrisH = normDist(landmarks[LM.rightIris[1]], landmarks[LM.rightIris[2]]);
  const avgIrisH = (lIrisH + rIrisH) / 2;

  const modelWidth = 1.92;
  let scale;

  const templeW = normDist(leftTemple, rightTemple);
  const faceW = (templeW * 0.4 + eyeOuterW * 0.6) * vWidth;
  const standardScale = (faceW / modelWidth) * 1.6;

  if (calibratedFaceWidth) {
    const baseScale = (calibratedFaceWidth / 192);
    scale = baseScale * (eyeOuterW / 0.085) * 1.5;
  } else if (avgIrisH > 0.015) {
    const unitsPerMm = avgIrisH / 11.7;
    const targetWInUnits = (145 * unitsPerMm) * vWidth;
    scale = (targetWInUnits / modelWidth) * 1.8;
  } else {
    scale = standardScale;
  }

  // Prevent extreme over/under-sizing across different face shapes
  const minScale = standardScale * 0.7;
  const maxScale = standardScale * 1.3;
  scale = Math.max(minScale, Math.min(maxScale, scale));

  let roll = 0, yaw = 0, pitch = 0;

  if (facialMatrix && facialMatrix.data && facialMatrix.data.length >= 12) {
    const d = facialMatrix.data;
    const R00 = d[0] || 1, R02 = d[8]  || 0;
    const R10 = d[1] || 0, R11 = d[5] || 1, R12 = d[9]  || 0;

    yaw = Math.atan2(R02, d[10] || 1);
    pitch = Math.asin(Math.max(-1, Math.min(1, -R12)));
    roll = Math.atan2(R10, R11);

    if (isNaN(yaw)) yaw = 0;
    if (isNaN(pitch)) pitch = 0;
    if (isNaN(roll)) roll = 0;

    yaw = -yaw;
    roll = -roll;
    
    pitch = Math.max(-0.8, Math.min(0.8, pitch));
    yaw   = Math.max(-1.0, Math.min(1.0, yaw));
    roll  = Math.max(-0.6, Math.min(0.6, roll));
  } else {
    roll = -Math.atan2(rightEyeO.y - leftEyeO.y, rightEyeO.x - leftEyeO.x);
    const leftDist = Math.abs(bridge.x - leftTemple.x);
    const rightDist = Math.abs(bridge.x - rightTemple.x);
    const totalDist = leftDist + rightDist;
    const yawNorm = totalDist > 0.001 ? ((leftDist / totalDist) - 0.5) * 2.0 : 0;
    yaw = Math.asin(Math.max(-0.95, Math.min(0.95, yawNorm * 0.9)));
    pitch = 0;
  }

  const innerMid = avgLandmark(leftEyeI, rightEyeI);
  const anchor = avgLandmark(bridge, bridgeTop, innerMid);

  const pxBase = (0.5 - bridge.x) * vWidth;
  const noseProtrusionScale = faceW * 0.1; 
  const yawCorr = Math.sin(yaw) * noseProtrusionScale;
  const px = pxBase + (yawCorr * vWidth) - (vWidth * 0.005);
  const py = -(anchor.y - 0.5) * vHeight - vHeight * 0.03;

  const depthScale = (0.085 / eyeOuterW) * 1.15;
  const depthFromZ = (anchor.z * 0.5) + (depthScale * -1.02);

  return { px, py, scale, roll, yaw, pitch, depthOffset: depthFromZ };
}

/* ═══════════════════════════════════════════════════════════
   3. AR GEOMETRY & FRAMES
   ═══════════════════════════════════════════════════════════ */
const MATERIAL_PBR = { metalness: 0.05, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 };
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

function makeMaterials(color, matPbr) {
  const p = matPbr || { metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 };
  return {
    frame: new THREE.MeshPhysicalMaterial({ color: color.frame, ...p, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: color.lens, metalness: 0, roughness: 0.05, transmission: 0.8, thickness: 0.3, ior: 1.5, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    hinge: new THREE.MeshPhysicalMaterial({ color: color.accent, metalness: 0.9, roughness: 0.12, clearcoat: 0.5, side: THREE.DoubleSide }),
  };
}

function tag(m, n) { m.userData.partName = n; return m; }

function addTemples(g, mat, xs, yS = 0) {
  xs.forEach(({ x, sign }) => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x, yS, 0), new THREE.Vector3(x + sign * 0.04, yS, -0.3), new THREE.Vector3(x + sign * 0.04, yS - 0.04, -0.9), new THREE.Vector3(x + sign * 0.02, yS - 0.14, -1.05)]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, 32, 0.02, 8, false), mat); m.castShadow = true; tag(m, x < 0 ? "left-temple" : "right-temple"); g.add(m);
  });
}

function addHinges(g, mat, ps) {
  const geo = new THREE.CylinderGeometry(0.028, 0.028, 0.055, 12);
  ps.forEach(([x, y], i) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, -0.01); m.rotation.z = Math.PI / 2; m.castShadow = true; tag(m, i === 0 ? "left-hinge" : "right-hinge"); g.add(m); });
}

function addNosePads(g, mat, ps) {
  const geo = new THREE.SphereGeometry(0.025, 12, 12);
  ps.forEach(([x, y, z], i) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(1, 1.3, 0.6); tag(m, i === 0 ? "left-pad" : "right-pad"); g.add(m); });
}

function buildAviator(color, matPbr) {
  const g = new THREE.Group(), m = makeMaterials(color, matPbr);
  const s = new THREE.Shape(); s.moveTo(0, 0.38); s.quadraticCurveTo(0.42, 0.38, 0.44, 0); s.quadraticCurveTo(0.42, -0.42, 0, -0.44); s.quadraticCurveTo(-0.42, -0.42, -0.44, 0); s.quadraticCurveTo(-0.42, 0.38, 0, 0.38);
  const pts = s.getPoints(64), rG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, 0)), true), 64, 0.03, 8, true), dG = new THREE.ShapeGeometry(s, 64);
  [-0.54, 0.54].forEach((x, i) => { const r = tag(new THREE.Mesh(rG, m.frame), i === 0 ? "left-rim" : "right-rim"); r.position.x = x; r.castShadow = true; g.add(r); const d = tag(new THREE.Mesh(dG, m.lens), i === 0 ? "left-lens" : "right-lens"); d.position.set(x, 0, 0.005); g.add(d); });
  [0.08, -0.02].forEach((y, i) => { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.12, y, 0), new THREE.Vector3(0, y + 0.04, 0.02), new THREE.Vector3(0.12, y, 0)]); g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.018, 8, false), m.frame), i === 0 ? "bridge-upper" : "bridge-lower")); });
  addTemples(g, m.frame, [{ x: -0.96, sign: -1 }, { x: 0.96, sign: 1 }]); addHinges(g, m.hinge, [[-0.96, 0], [0.96, 0]]); addNosePads(g, m.hinge, [[-0.16, -0.28, 0.08], [0.16, -0.28, 0.08]]); return g;
}

function buildWayfarer(color, matPbr) {
  const g = new THREE.Group(), m = makeMaterials(color, matPbr); m.frame.metalness = Math.min(m.frame.metalness, 0.1);
  const s = new THREE.Shape(); s.moveTo(-0.38, 0.24); s.lineTo(0.4, 0.28); s.quadraticCurveTo(0.44, 0, 0.38, -0.24); s.lineTo(-0.36, -0.22); s.quadraticCurveTo(-0.42, 0, -0.38, 0.24);
  const pts = s.getPoints(64), rG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, 0)), true), 64, 0.04, 8, true), dG = new THREE.ShapeGeometry(s, 64);
  const tb = new THREE.Shape(); tb.moveTo(-1.02, 0.22); tb.lineTo(1.02, 0.22); tb.lineTo(1.02, 0.36); tb.quadraticCurveTo(0, 0.40, -1.02, 0.36); tb.lineTo(-1.02, 0.22);
  const t = tag(new THREE.Mesh(new THREE.ExtrudeGeometry(tb, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3 }), m.frame), "top-bar"); t.position.z = -0.03; t.castShadow = true; g.add(t);
  [-0.52, 0.52].forEach((x, i) => { const r = tag(new THREE.Mesh(rG, m.frame), i === 0 ? "left-rim" : "right-rim"); r.position.x = x; r.castShadow = true; g.add(r); const d = tag(new THREE.Mesh(dG, m.lens), i === 0 ? "left-lens" : "right-lens"); d.position.set(x, 0, 0.005); g.add(d); });
  const bc = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.14, 0.04, 0), new THREE.Vector3(0, 0.10, 0.02), new THREE.Vector3(0.14, 0.04, 0)]); g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(bc, 16, 0.028, 8, false), m.frame), "bridge"));
  addTemples(g, m.frame, [{ x: -0.94, sign: -1 }, { x: 0.94, sign: 1 }]); addHinges(g, m.hinge, [[-0.94, 0.05], [0.94, 0.05]]); addNosePads(g, m.hinge, [[-0.16, -0.18, 0.08], [0.16, -0.18, 0.08]]); return g;
}

function buildRound(color, matPbr) {
  const g = new THREE.Group(), m = makeMaterials(color, matPbr); const rG = new THREE.TorusGeometry(0.38, 0.022, 16, 64), dG = new THREE.CircleGeometry(0.38, 64);
  [-0.48, 0.48].forEach((x, i) => { const r = tag(new THREE.Mesh(rG, m.frame), i === 0 ? "left-rim" : "right-rim"); r.position.x = x; r.castShadow = true; g.add(r); const d = tag(new THREE.Mesh(dG, m.lens), i === 0 ? "left-lens" : "right-lens"); d.position.set(x, 0, 0.005); g.add(d); });
  const bc = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.10, 0.06, 0), new THREE.Vector3(-0.04, 0.14, 0.03), new THREE.Vector3(0.04, 0.14, 0.03), new THREE.Vector3(0.10, 0.06, 0)]); g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(bc, 20, 0.018, 8, false), m.frame), "bridge"));
  addTemples(g, m.frame, [{ x: -0.86, sign: -1 }, { x: 0.86, sign: 1 }]); addHinges(g, m.hinge, [[-0.86, 0], [0.86, 0]]); addNosePads(g, m.hinge, [[-0.14, -0.22, 0.08], [0.14, -0.22, 0.08]]); return g;
}

function buildCatEye(color, matPbr) {
  const g = new THREE.Group(), m = makeMaterials(color, matPbr);
  const s = new THREE.Shape(); s.moveTo(-0.36, 0.18); s.quadraticCurveTo(-0.10, 0.30, 0.20, 0.34); s.quadraticCurveTo(0.46, 0.30, 0.44, 0.08); s.quadraticCurveTo(0.42, -0.22, 0.10, -0.26); s.quadraticCurveTo(-0.24, -0.26, -0.38, -0.10); s.quadraticCurveTo(-0.42, 0.04, -0.36, 0.18);
  const pts = s.getPoints(64), rG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, 0)), true), 64, 0.035, 8, true), dG = new THREE.ShapeGeometry(s, 64);
  [-0.52, 0.52].forEach((x, i) => { const r = tag(new THREE.Mesh(rG, m.frame), i === 0 ? "left-rim" : "right-rim"); r.position.x = x; if (i === 0) r.scale.x = -1; r.castShadow = true; g.add(r); const d = tag(new THREE.Mesh(dG, m.lens), i === 0 ? "left-lens" : "right-lens"); d.position.set(x, 0, 0.005); if (i === 0) d.scale.x = -1; g.add(d); });
  const bc = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.14, 0.10, 0), new THREE.Vector3(0, 0.16, 0.02), new THREE.Vector3(0.14, 0.10, 0)]); g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(bc, 16, 0.025, 8, false), m.frame), "bridge"));
  addTemples(g, m.frame, [{ x: -0.92, sign: -1 }, { x: 0.92, sign: 1 }], 0.12); addHinges(g, m.hinge, [[-0.92, 0.12], [0.92, 0.12]]); addNosePads(g, m.hinge, [[-0.16, -0.16, 0.08], [0.16, -0.16, 0.08]]); return g;
}

/* ── GLB auto-tagger (shared with GlassesViewer) ── */
function autoTagGLBMeshes(model) {
  model.traverse(ch => {
    if (!ch.isMesh) return;
    const name = (ch.name || "").toLowerCase();
    const mats = Array.isArray(ch.material) ? ch.material : [ch.material];

    mats.forEach(mat => {
      if (mat && mat.color) {
        mat.userData._origColor = mat.color.clone();
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

      if (isTransparent || isLensName) {
        ch.userData.partName = name.includes("left") ? "left-lens" : "right-lens";
      } else {
        ch.userData.partName = "glb-frame";
      }
    }
  });
}

const AR_FRAMES = [
  {
    id: "custom", name: "Eza's Custom", url: "/models/glasses.glb",
    colors: [
      { name: "Original", frame: 0xffffff, lens: 0xffffff, accent: 0xffffff },
      { name: "Midnight", frame: 0x3a3a4a, lens: 0x445566, accent: 0x6a6a7a },
      { name: "Rose Gold", frame: 0xc08070, lens: 0x997777, accent: 0xd4a0a0 },
      { name: "Forest", frame: 0x4a6a4a, lens: 0x3a5a3a, accent: 0x6a8a6a },
    ],
  },
  {
    id: "aviator", name: "Aviator Classic", build: buildAviator,
    colors: [
      { name: "Charcoal", frame: 0x3a3a3a, lens: 0x556b2f, accent: 0x777777 },
      { name: "Sand", frame: 0xc8a84e, lens: 0x5a4a2a, accent: 0xd4af37 },
      { name: "Blush", frame: 0xb76e79, lens: 0x6b4a52, accent: 0xd4a0a0 },
    ],
  },
  {
    id: "wayfarer", name: "Wayfarer Bold", build: buildWayfarer,
    colors: [
      { name: "Matte Black", frame: 0x1a1a1a, lens: 0x333344, accent: 0x444444 },
      { name: "Tortoise", frame: 0x8b5e3c, lens: 0x5a4530, accent: 0xa0724a },
      { name: "Navy", frame: 0x1a2744, lens: 0x334466, accent: 0x3a5580 },
    ],
  },
  {
    id: "round", name: "Round Wire", build: buildRound,
    colors: [
      { name: "Silver", frame: 0xc0c0c0, lens: 0x99bbdd, accent: 0xe0e0e0 },
      { name: "Black", frame: 0x222222, lens: 0x445566, accent: 0x555555 },
      { name: "Copper", frame: 0xb87333, lens: 0x88775a, accent: 0xcc8844 },
    ],
  },
  {
    id: "cat-eye", name: "Cat-Eye Luxe", build: buildCatEye,
    colors: [
      { name: "Burgundy", frame: 0x6b2040, lens: 0x553344, accent: 0x8a3050 },
      { name: "Ivory", frame: 0xd4c8b0, lens: 0x998877, accent: 0xe8dcc0 },
      { name: "Emerald", frame: 0x1a5c3a, lens: 0x2a4a3a, accent: 0x2a7a50 },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════
   4. MAIN REACT COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function ARTryOn({ onBack, faceWidth, initialFrameId, initialColorIdx }) {
  const videoRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const threeContainerRef = useRef(null);
  const sceneRef = useRef({});
  const filterBankRef = useRef(new FilterBank(FILTER_CONFIG));
  const faceLandmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const initCalledRef = useRef(false);

  const glassesOpacityRef = useRef(0);
  const targetOpacityRef = useRef(0);
  const prevFrameIdxRef = useRef(-1);

  /* ── Resolve initial frame from configurator ── */
  const resolvedInitialFrameIdx = useMemo(() => {
    if (!initialFrameId) return 0;
    const idx = AR_FRAMES.findIndex(f => f.id === initialFrameId);
    return idx >= 0 ? idx : 0;
  }, [initialFrameId]);

  const resolvedInitialColorIdx = useMemo(() => {
    const maxColors = AR_FRAMES[resolvedInitialFrameIdx]?.colors?.length || 1;
    const idx = initialColorIdx ?? 0;
    return idx < maxColors ? idx : 0;
  }, [initialColorIdx, resolvedInitialFrameIdx]);

  const [status, setStatus] = useState("loading"); // Start loading immediately
  const [frameIdx, setFrameIdx] = useState(resolvedInitialFrameIdx);
  const [colorIdx, setColorIdx] = useState(resolvedInitialColorIdx);
  const [faceDetected, setFaceDetected] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [arConfirmed, setArConfirmed] = useState(false);
  const [showReadyOverlay, setShowReadyOverlay] = useState(true);

  /* ── Refs that always reflect current state (used in stable callbacks) ── */
  const frameIdxRef = useRef(frameIdx);
  const colorIdxRef = useRef(colorIdx);
  useEffect(() => { frameIdxRef.current = frameIdx; }, [frameIdx]);
  useEffect(() => { colorIdxRef.current = colorIdx; }, [colorIdx]);

  const frame = AR_FRAMES[frameIdx];
  const color = frame.colors[colorIdx];

  const gltfLoader = useMemo(() => new GLTFLoader(), []);
  const reqIdRef = useRef(0);
  const gltfCacheRef = useRef({});

  /* ── inject CSS ── */
  useEffect(() => {
    document.body.classList.add("ar-mode");

    const id = "ar-tryon-styles";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes arPulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
      @keyframes arFadeIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
      @keyframes arSlideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
      .ar-frame-btn { transition: all 0.3s cubic-bezier(0.23,1,0.32,1) !important; }
      .ar-frame-btn:hover { transform: translateY(-1px) !important; background: rgba(255,255,255,0.1) !important; }
      .ar-frame-btn:active { transform: scale(0.97) !important; }
      .ar-swatch { transition: all 0.25s !important; }
      .ar-swatch:hover { transform: scale(1.25) !important; }
      .ar-capture-btn { transition: all 0.3s !important; }
      .ar-capture-btn:hover { transform: scale(1.08) !important; box-shadow: 0 0 30px rgba(255,255,255,0.25) !important; }
      .ar-back-btn { transition: all 0.3s !important; }
      .ar-back-btn:hover { background: rgba(255,255,255,0.12) !important; }
    `;
      document.head.appendChild(s);
    }

    return () => {
      document.body.classList.remove("ar-mode");
    };
  }, []);

  /* ── build / rebuild glasses model ── */
  const buildGlasses = useCallback(async (fIdx, cIdx) => {
    const { scene, glassesParent } = sceneRef.current;
    if (!scene || !glassesParent) return;

    const f = AR_FRAMES[fIdx];
    const reqId = ++reqIdRef.current;

    let model;
    if (f.url) {
      try {
        let rawScene;
        if (gltfCacheRef.current[f.url]) {
          rawScene = gltfCacheRef.current[f.url];
        } else {
          const gltf = await new Promise((resolve, reject) => {
            gltfLoader.load(f.url, resolve, undefined, reject);
          });
          if (reqId !== reqIdRef.current) return;
          rawScene = gltf.scene;
          gltfCacheRef.current[f.url] = rawScene;
        }
        
        model = rawScene.clone();
        model.rotation.y = -Math.PI / 2;
        model.updateMatrixWorld(true);

        let minZ = Infinity, maxZ = -Infinity;
        model.traverse(ch => {
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
        model.traverse(ch => {
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
        const size = frontBox.getSize(new THREE.Vector3());
        const targetWidth = 1.9;
        const scaleFac = targetWidth / Math.max(size.x, 0.1);

        model.scale.setScalar(scaleFac);
        model.position.set(-center.x * scaleFac, -center.y * scaleFac, (-maxZ * scaleFac) + 0.05);

        model.traverse(ch => {
          if (ch.isMesh) {
            const name = ch.name.toLowerCase();
            if (name.includes("temple") || name.includes("arm")) {
              const weight = ch.position.x < 0 ? -1 : 1;
              ch.rotation.y += 0.08 * weight;
            }
          }
        });

        autoTagGLBMeshes(model);

      } catch (err) {
        console.error("GLB Load Error:", err);
        return;
      }
    } else {
      const c = f.colors[cIdx];
      model = f.build(c, MATERIAL_PBR);
      model.position.z += 0.05;
    }

    if (reqId !== reqIdRef.current) return;

    while (glassesParent.children.length > 0) {
      const ch = glassesParent.children[0];
      glassesParent.remove(ch);
      ch.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          const ms = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach(m => m.dispose());
        }
      });
    }

    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.visible = false;

    pivot.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.userData._baseOpacity = child.material.opacity !== undefined ? child.material.opacity : 1;
        child.castShadow = true;
      }
    });

    glassesParent.add(pivot);
    sceneRef.current.glasses = pivot;
    glassesOpacityRef.current = 0; // Reset opacity after new build
  }, [gltfLoader]);

  /* ── Update colors without rebuilding geometry ── */
  const updateGlassesColor = useCallback((fIdx, cIdx) => {
    const { glasses } = sceneRef.current;
    if (!glasses) return;

    const f = AR_FRAMES[fIdx];
    const color = f.colors[cIdx];
    if (!color) return;

    glasses.traverse((ch) => {
      if (!ch.isMesh || !ch.material) return;
      
      const part = ch.userData.partName || "";
      const materials = Array.isArray(ch.material) ? ch.material : [ch.material];

      materials.forEach(mat => {
        if (!mat.color) return;
        const isGLB = mat.userData._isGLB;
        const orig = mat.userData._origColor;

        if (part.includes("lens")) {
          if (isGLB && orig) {
            if (color.lens === 0xffffff) { mat.color.copy(orig); }
            else { mat.color.copy(orig).multiply(new THREE.Color(color.lens)); }
          } else {
            mat.color.setHex(color.lens);
          }
        } else if (part.includes("hinge") || part.includes("pad")) {
          mat.color.setHex(color.accent);
        } else if (isGLB && orig) {
          if (color.frame === 0xffffff) { mat.color.copy(orig); }
          else { mat.color.copy(orig).multiply(new THREE.Color(color.frame)); }
        } else if (part) {
          mat.color.setHex(color.frame);
        }
      });
    });
  }, []);

  /* ── Effect: build glasses when user dismisses the ready overlay ── */
  useEffect(() => {
    if (showReadyOverlay) return;
    if (status !== "live" && status !== "captured") return;
    if (!sceneRef.current.scene || !sceneRef.current.glassesParent) return;

    buildGlasses(frameIdxRef.current, colorIdxRef.current);
    prevFrameIdxRef.current = frameIdxRef.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReadyOverlay, status]);

  /* ── Effect: update model when frame/color changes ── */
  useEffect(() => {
    if (showReadyOverlay) return;
    if (status !== "live" && status !== "captured") return;
    if (!sceneRef.current.scene || !sceneRef.current.glassesParent) return;

    if (prevFrameIdxRef.current !== frameIdx) {
      buildGlasses(frameIdx, colorIdx);
      filterBankRef.current.reset();
      prevFrameIdxRef.current = frameIdx;
    } else {
      updateGlassesColor(frameIdx, colorIdx);
    }
  }, [frameIdx, colorIdx, buildGlasses, updateGlassesColor, status, showReadyOverlay]);

  /* ── initialize MediaPipe (only once, cached in ref) ── */
  const initFaceLandmarker = useCallback(async () => {
    if (faceLandmarkerRef.current) return true;
    try {
      const isMobile = window.matchMedia("(max-width: 840px)").matches || /Mobi|Android/i.test(navigator.userAgent);
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      const fl = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: isMobile ? "CPU" : "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });
      faceLandmarkerRef.current = fl;
      return true;
    } catch (err) {
      console.error("MediaPipe init error:", err);
      return false;
    }
  }, []);

  /* ── start camera ── */
  const startCamera = useCallback(async () => {
    if (streamRef.current) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      throw new Error("Camera API not supported in this browser.");
    }
    if (!window.isSecureContext) {
      throw new Error("AR requires a secure connection (HTTPS).");
    }

    const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 840;
    const constraints = {
      video: isMobile 
        ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
        : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }
    };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn("Camera: Preferred constraints failed, trying default...", e.name);
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try { await videoRef.current.play(); } catch (playErr) { console.error("Camera play error:", playErr); }
    }
    return true;
  }, []);

  /* ── stop everything ── */
  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const { renderer, scene, glassesParent } = sceneRef.current;
    if (glassesParent) {
      scene?.remove(glassesParent);
      glassesParent.traverse((ch) => { if (ch.geometry) ch.geometry.dispose(); if (ch.material) ch.material.dispose(); });
    }
    if (renderer) renderer.dispose();
    if (threeContainerRef.current && renderer?.domElement) {
      try { threeContainerRef.current.removeChild(renderer.domElement); } catch (e) { /* ok */ }
    }
    sceneRef.current = {};
    initCalledRef.current = false;
  }, []);

  /* ── Three.js setup ── */
  const initThreeJS = useCallback((width, height) => {
    const container = threeContainerRef.current;
    if (!container) return;

    const isMobile = window.matchMedia("(max-width: 840px)").matches || /Mobi|Android/i.test(navigator.userAgent);
    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";

    const fov = isMobile ? 55 : 75;
    const aspect = (width || 640) / (height || 480);
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 100);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(1, 2, 3); scene.add(key);
    const fill = new THREE.DirectionalLight(0x8888ff, 0.35); fill.position.set(-2, 1, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5); rim.position.set(0, 1, -3); scene.add(rim);

    const zDist = 2;
    const vHeight = 2 * zDist * Math.tan((fov * Math.PI / 180) / 2);
    const vWidth = vHeight * aspect;

    const glassesParent = new THREE.Group();
    scene.add(glassesParent);

    sceneRef.current = { renderer, scene, camera, glassesParent, fov, zDist, vWidth, vHeight };
  }, []);

  /* ── MAIN LOOP ── */
  const startLoop = useCallback(() => {
    const fl = faceLandmarkerRef.current;
    const video = videoRef.current;
    const vCanvas = videoCanvasRef.current;
    if (!fl || !video || !vCanvas) return;

    const vCtx = vCanvas.getContext("2d");
    let noFaceFrames = 0;

    const targetQuat = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, "ZYX");

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (video.readyState < 2) return;

      if (!sceneRef.current) return;

      const { renderer, scene, camera, zDist, glasses } = sceneRef.current;
      if (!renderer) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = vCanvas.clientWidth;
      const ch = vCanvas.clientHeight;

      if (!vw || !vh || !cw || !ch) return;
      
      if (vCanvas.width !== vw || vCanvas.height !== vh || sceneRef.current._lastCw !== cw || sceneRef.current._lastCh !== ch) {
        vCanvas.width = vw;
        vCanvas.height = vh;
        sceneRef.current._lastCw = cw;
        sceneRef.current._lastCh = ch;
        
        renderer.setSize(cw, ch);
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();
        const newVH = 2 * zDist * Math.tan((sceneRef.current.fov * Math.PI / 180) / 2);
        sceneRef.current.vHeight = newVH;
        sceneRef.current.vWidth = newVH * camera.aspect;
      }

      vCtx.save();
      vCtx.scale(-1, 1);
      vCtx.drawImage(video, -vw, 0, vw, vh);
      vCtx.restore();

      const now = performance.now();
      const videoTime = video.currentTime;
      
      if (sceneRef.current._lastVideoTime === videoTime) return;
      sceneRef.current._lastVideoTime = videoTime;

      if (!glasses) {
        renderer.render(scene, camera);
        return;
      }

      const result = fl.detectForVideo(video, now);
      const hasFace = result.faceLandmarks && result.faceLandmarks.length > 0;

      if (hasFace) {
        noFaceFrames = 0;
        targetOpacityRef.current = 1;
        setFaceDetected(true);

        const landmarks = result.faceLandmarks[0];
        const faceMatrix = result.facialTransformationMatrixes?.[0] || null;
        const pose = extractFacePose(landmarks, sceneRef.current.vWidth, sceneRef.current.vHeight, faceMatrix, faceWidth);
        const fb = filterBankRef.current;
        const t = now;

        const fpx    = fb.filter("px",    pose.px,          t);
        const fpy    = fb.filter("py",    pose.py,          t);
        const fscale = fb.filter("scale", pose.scale,       t);
        const froll  = fb.filter("roll",  pose.roll,        t);
        const fyaw   = fb.filter("yaw",   pose.yaw,         t);
        const fpitch = fb.filter("pitch", pose.pitch,       t);
        const fdepth = fb.filter("depth", pose.depthOffset, t);

        glasses.position.set(fpx, fpy, -zDist + fdepth - 0.05);
        glasses.scale.setScalar(fscale);

        euler.set(fpitch, fyaw, froll);
        targetQuat.setFromEuler(euler);

        if (glasses.quaternion.dot(targetQuat) < 0) {
          targetQuat.x *= -1; targetQuat.y *= -1; targetQuat.z *= -1; targetQuat.w *= -1;
        }
        glasses.quaternion.slerp(targetQuat, 0.85);

      } else {
        noFaceFrames++;
        if (noFaceFrames > 10) {
          targetOpacityRef.current = 0;
          if (noFaceFrames > 25) {
            setFaceDetected(false);
            filterBankRef.current.reset();
          }
        }
      }

      const opacitySpeed = targetOpacityRef.current > glassesOpacityRef.current ? 0.3 : 0.1;
      glassesOpacityRef.current += (targetOpacityRef.current - glassesOpacityRef.current) * opacitySpeed;

      if (glassesOpacityRef.current > 0.01) {
        glasses.visible = true;
        glasses.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = child.material.userData?._baseOpacity != null
              ? child.material.userData._baseOpacity * glassesOpacityRef.current
              : glassesOpacityRef.current;
            child.material.transparent = true;
          }
        });
      } else {
        glasses.visible = false;
      }

      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [faceWidth]);

  /* ══════════════════════════════════════════════════════════
     START — runs ONCE to init Engine/Camera
     ══════════════════════════════════════════════════════════ */
  useEffect(() => {
    let active = true;

    async function setup() {
      if (initCalledRef.current) return;
      initCalledRef.current = true;

      try {
        setStatus("loading");

        const okModel = await initFaceLandmarker();
        if (!active || !okModel) {
          throw new Error("Failed to load AI model.");
        }

        const okCam = await startCamera();
        if (!active || !okCam) return;

        const container = threeContainerRef.current;
        if (!container) return;

        const video = videoRef.current;
        const displayW = container.clientWidth || (video && video.videoWidth) || 640;
        const displayH = container.clientHeight || (video && video.videoHeight) || 480;

        initThreeJS(displayW, displayH);
        // Don't build glasses yet — wait until user dismisses the ready overlay

        if (active) {
          setStatus("live");
          startLoop();
        }
      } catch (err) {
        console.error("Setup failed:", err);
        if (active) {
          setCameraError(err.message || "Camera access denied or device not found.");
          setStatus("error");
        }
      }
    }

    setup();

    return () => {
      active = false;
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs exactly once on mount
  
  const handleCapture = useCallback(() => {
    const vCanvas = videoCanvasRef.current;
    const { renderer } = sceneRef.current;
    if (!vCanvas || !renderer) return;

    const cw = vCanvas.clientWidth;
    const ch = vCanvas.clientHeight;
    
    // We match the visible container proportions to avoid squashing
    const scale = window.devicePixelRatio || 2;
    const offscreen = document.createElement("canvas");
    offscreen.width = cw * scale;
    offscreen.height = ch * scale;
    const ctx = offscreen.getContext("2d");
    
    // Simulate 'object-fit: cover' for the video frame being drawn
    const vw = vCanvas.width;
    const vh = vCanvas.height;
    const containerAspect = cw / ch;
    const videoAspect = vw / vh;
    
    let sx, sy, sw, sh;
    if (videoAspect > containerAspect) {
      // Video is wider than container natively, crop sides
      sh = vh;
      sw = vh * containerAspect;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      // Video is taller than container natively, crop top/bottom
      sw = vw;
      sh = vw / containerAspect;
      sx = 0;
      sy = (vh - sh) / 2;
    }
    
    ctx.drawImage(vCanvas, sx, sy, sw, sh, 0, 0, offscreen.width, offscreen.height);
    // Draw the 3D scene overlay
    ctx.drawImage(renderer.domElement, 0, 0, offscreen.width, offscreen.height);

    ctx.font = `${offscreen.width * 0.018}px "DM Sans", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "right";
    ctx.fillText("OPTIQ AR Try-On", offscreen.width - 20, offscreen.height - 16);

    const dataUrl = offscreen.toDataURL("image/png");
    setCapturedImage(dataUrl);
    setStatus("captured");
  }, []);

  const handleDownload = useCallback(() => {
    if (!capturedImage) return;
    const a = document.createElement("a");
    a.href = capturedImage;
    a.download = `optiq-tryon-${AR_FRAMES[frameIdx].id}-${Date.now()}.png`;
    a.click();
  }, [capturedImage, frameIdx]);

  const handleDismissCapture = useCallback(() => {
    setCapturedImage(null);
    setStatus("live");
  }, []);

  useEffect(() => {
    const onResize = () => {
      const { renderer, camera, fov, zDist } = sceneRef.current;
      const container = threeContainerRef.current;
      if (!renderer || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      if (camera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const newVH = 2 * zDist * Math.tan((fov * Math.PI / 180) / 2);
        sceneRef.current.vHeight = newVH;
        sceneRef.current.vWidth = newVH * camera.aspect;
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     RENDER — improved UI
     ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ width: "100%", maxWidth: 900, margin: "0 auto", padding: "0 16px 80px" }}>
      {/* Header */}
      <section style={{ paddingTop: 36, paddingBottom: 20, textAlign: "center" }}>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.5, marginBottom: 10, fontWeight: 600 }}>
          Augmented Reality
        </p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 500, margin: "0 0 8px", lineHeight: 1.2 }}>
          Virtual Try-On
        </h1>
        <p style={{ fontSize: 13, opacity: 0.6, maxWidth: 460, margin: "0 auto" }}>
          See how each frame looks on your face in real-time.
        </p>
      </section>

      {/* Camera viewport */}
      <div style={{
        position: "relative", width: "100%", maxWidth: 640, margin: "0 auto",
        aspectRatio: "4/3", borderRadius: 20, overflow: "hidden",
        background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 8px 60px rgba(0,0,0,0.4)",
        display: "block",
      }}>
        <video ref={videoRef} playsInline muted style={{ display: "none" }} />

        <canvas ref={videoCanvasRef} style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover",
          display: (status === "live" || status === "captured") ? "block" : "none",
        }} />

        <div ref={threeContainerRef} style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
          pointerEvents: "none",
          display: status === "live" ? "block" : "none",
        }} />

        {status === "captured" && capturedImage && (
          <img src={capturedImage} alt="Captured" style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            objectFit: "cover",
          }} />
        )}

        {(status === "idle" || status === "loading") && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 16,
          }}>
            {status === "idle" && (
              <>
                <div style={{ width: 80, height: 80, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>◎</div>
                <p style={{ fontSize: 13, opacity: 0.6 }}>Initializing AR...</p>
              </>
            )}
            {status === "loading" && (
              <>
                <div style={{ width: 36, height: 36, border: "2px solid rgba(111,207,151,0.3)", borderTopColor: "#6fcf97", borderRadius: "50%", animation: "gvSpin 0.8s linear infinite" }} />
                <p style={{ fontSize: 13, opacity: 0.7 }}>Loading AR & Camera...</p>
              </>
            )}
          </div>
        )}

        {status === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
            <p style={{ fontSize: 14, opacity: 0.6, textAlign: "center", color: "#ff6b6b" }}>{cameraError}</p>
            <button onClick={() => window.location.reload()} style={{
              padding: "10px 24px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
              background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              fontWeight: 500, letterSpacing: 1, textTransform: "uppercase",
            }}>Try Again</button>
          </div>
        )}

        {/* ── READY OVERLAY: appears over camera feed, like FitScanner ── */}
        {status === "live" && showReadyOverlay && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "flex-end", padding: "24px 24px 28px",
            background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 100%)",
            zIndex: 5,
          }}>
            {/* top badge */}
            <div style={{
              position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 14px", borderRadius: 8,
              background: "rgba(78,205,196,0.12)", border: "1px solid rgba(78,205,196,0.3)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <circle cx="9" cy="10" r="2" /><circle cx="15" cy="10" r="2" /><line x1="11" y1="10" x2="13" y2="10" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "rgba(78,205,196,0.9)" }}>
                AR Try-On Ready
              </span>
            </div>

            <div style={{
              width: "100%", padding: "18px 20px", borderRadius: 14,
              background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex", flexDirection: "column", gap: 14,
            }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 6px", color: "rgba(255,255,255,0.9)" }}>
                  Before we start
                </p>
                <p style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.6, margin: 0 }}>
                  For the best experience, make sure you're in a <strong style={{ color: "rgba(78,205,196,0.9)", fontWeight: 600 }}>well-lit area</strong> with
                  even lighting on your face. Remove any glasses you're currently wearing.
                </p>
              </div>

              {/* checklist items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  "Good, even lighting (no harsh shadows)",
                  "Glasses or sunglasses removed",
                  "Face centred in the camera view",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "#4ecdc4", opacity: 0.8 }}>✓</span>
                    <span style={{ fontSize: 11, opacity: 0.65 }}>{item}</span>
                  </div>
                ))}
              </div>

              {/* confirmation checkbox */}
              <label style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "10px 14px", borderRadius: 10,
                background: arConfirmed ? "rgba(78,205,196,0.08)" : "rgba(255,255,255,0.03)",
                border: arConfirmed ? "1px solid rgba(78,205,196,0.25)" : "1px solid rgba(255,255,255,0.06)",
                transition: "all 0.3s",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: arConfirmed ? "2px solid #4ecdc4" : "2px solid rgba(255,255,255,0.2)",
                  background: arConfirmed ? "rgba(78,205,196,0.2)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.3s",
                }}>
                  {arConfirmed && <span style={{ fontSize: 12, color: "#4ecdc4", lineHeight: 1 }}>✓</span>}
                </div>
                <input
                  type="checkbox"
                  checked={arConfirmed}
                  onChange={(e) => setArConfirmed(e.target.checked)}
                  style={{ display: "none" }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, opacity: arConfirmed ? 0.9 : 0.7 }}>
                  I'm ready to try on glasses
                </span>
              </label>

              {/* begin button */}
              <button
                onClick={() => setShowReadyOverlay(false)}
                disabled={!arConfirmed}
                style={{
                  padding: "14px 0", borderRadius: 10, border: "none",
                  cursor: arConfirmed ? "pointer" : "not-allowed",
                  background: arConfirmed ? "rgba(78,205,196,0.9)" : "rgba(78,205,196,0.2)",
                  color: arConfirmed ? "#000" : "rgba(0,0,0,0.3)",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                  letterSpacing: 1.5, textTransform: "uppercase",
                  transition: "all 0.3s", width: "100%",
                  opacity: arConfirmed ? 1 : 0.5,
                }}
              >
                Begin Try-On
              </button>
            </div>
          </div>
        )}

        {/* Face guide */}
        {status === "live" && !showReadyOverlay && !faceDetected && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
            animation: "arFadeIn 0.5s ease both", pointerEvents: "none",
          }}>
            <svg width="160" height="220" viewBox="0 0 160 220" style={{ opacity: 0.3 }}>
              <ellipse cx="80" cy="110" rx="60" ry="90" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="8 6" />
              <circle cx="55" cy="90" r="6" fill="none" stroke="#fff" strokeWidth="1.2" />
              <circle cx="105" cy="90" r="6" fill="none" stroke="#fff" strokeWidth="1.2" />
              <path d="M70 130 Q80 140 90 130" fill="none" stroke="#fff" strokeWidth="1.2" />
            </svg>
            <p style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, animation: "arPulse 2s ease-in-out infinite" }}>
              Position your face in frame
            </p>
          </div>
        )}

        {/* Live indicator */}
        {status === "live" && !showReadyOverlay && faceDetected && (
          <div style={{
            position: "absolute", top: 14, left: 14,
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 8,
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
            animation: "arFadeIn 0.3s ease both",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6fcf97", animation: "arPulse 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.7 }}>LIVE</span>
          </div>
        )}

        {/* Current frame badge */}
        {status === "live" && !showReadyOverlay && faceDetected && (
          <div style={{
            position: "absolute", top: 14, right: 14,
            padding: "5px 12px", borderRadius: 8,
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
            animation: "arFadeIn 0.3s ease both",
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, opacity: 0.7 }}>
              {frame.name} — {color.name}
            </span>
          </div>
        )}

        {/* Captured overlay */}
        {status === "captured" && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "20px", display: "flex", gap: 10,
            background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)",
            animation: "arSlideUp 0.3s ease both",
          }}>
            <button onClick={handleDismissCapture} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, cursor: "pointer",
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              letterSpacing: 1.5, textTransform: "uppercase",
            }}>← Back</button>
            <button onClick={handleDownload} style={{
              flex: 2, padding: "12px 0", borderRadius: 10, cursor: "pointer",
              background: "rgba(111,207,151,0.9)", border: "none", color: "#000",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              letterSpacing: 1.5, textTransform: "uppercase",
            }}>Download Photo</button>
          </div>
        )}
      </div>

      {/* Controls below viewport */}
      {(status === "live" || status === "captured") && (
        <div style={{ maxWidth: 640, margin: "0 auto", animation: "arSlideUp 0.4s ease both" }}>

          {/* Capture button */}
          {status === "live" && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
              <button className="ar-capture-btn" onClick={handleCapture} style={{
                width: 64, height: 64, borderRadius: "50%", cursor: "pointer",
                background: "rgba(255,255,255,0.9)", border: "4px solid rgba(255,255,255,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 0 0 2px rgba(0,0,0,0.1)",
                padding: 0,
              }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff", border: "2px solid rgba(0,0,0,0.1)" }} />
              </button>
            </div>
          )}

          {/* ── Frame selector — horizontal scrollable pills ── */}
          <div style={{ marginTop: 24 }}>
            <p style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.5, marginBottom: 10, fontWeight: 600, textAlign: "center" }}>
              Frame Style
            </p>
            <div style={{
              display: "flex", gap: 6, overflowX: "auto", padding: "4px 16px 8px",
              scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
              justifyContent: "flex-start",
            }}>
              {AR_FRAMES.map((f, i) => {
                const isSelected = frameIdx === i;
                return (
                  <button
                    key={f.id}
                    className="ar-frame-btn"
                    onClick={() => { setFrameIdx(i); setColorIdx(0); }}
                    style={{
                      padding: "10px 16px", borderRadius: 10, cursor: "pointer",
                      border: isSelected ? "1.5px solid rgba(255,255,255,0.5)" : "1.5px solid rgba(255,255,255,0.08)",
                      background: isSelected ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.02)",
                      color: "#fff", fontFamily: "'DM Sans', sans-serif",
                      flexShrink: 0, whiteSpace: "nowrap",
                      boxShadow: isSelected ? "0 0 16px rgba(255,255,255,0.06)" : "none",
                    }}
                  >
                    <span style={{
                      fontSize: 12, fontWeight: isSelected ? 600 : 400,
                      letterSpacing: 0.5,
                      opacity: isSelected ? 1 : 0.6,
                    }}>
                      {f.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Colour swatches ── */}
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.5, marginBottom: 10, fontWeight: 600, textAlign: "center" }}>
              Colour — {color.name}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              {frame.colors.map((c, i) => (
                <button key={i} className="ar-swatch" onClick={() => setColorIdx(i)} style={{
                  width: 34, height: 34, borderRadius: "50%", cursor: "pointer", padding: 0,
                  background: c.frame === 0xffffff ? "linear-gradient(135deg, #ccc 0%, #fff 50%, #ddd 100%)" : hex(c.frame),
                  border: colorIdx === i ? "3px solid rgba(255,255,255,0.85)" : "3px solid rgba(255,255,255,0.15)",
                  boxShadow: colorIdx === i ? `0 0 14px ${c.frame === 0xffffff ? "rgba(255,255,255,0.2)" : hex(c.frame) + "55"}` : "none",
                }} />
              ))}
            </div>
          </div>

          {/* Back button */}
          {onBack && (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <button className="ar-back-btn" onClick={() => { cleanup(); onBack(); }} style={{
                padding: "12px 28px", borderRadius: 10, cursor: "pointer",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff",
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                letterSpacing: 1.5, textTransform: "uppercase",
              }}>
                ← Back to Configurator
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}