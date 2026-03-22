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

function extractFacePose(landmarks, vWidth, vHeight, facialMatrix) {
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
  const templeW = normDist(leftTemple, rightTemple);
  const faceW = (templeW * 0.4 + eyeOuterW * 0.6) * vWidth;
  const standardScale = (faceW / modelWidth) * 1.6;

  let scale = standardScale;
  if (avgIrisH > 0.015) {
    const unitsPerMm = avgIrisH / 11.7;
    const targetWInUnits = (145 * unitsPerMm) * vWidth;
    scale = (targetWInUnits / modelWidth) * 1.8;
  }

  const minScale = standardScale * 0.7;
  const maxScale = standardScale * 1.3;
  scale = Math.max(minScale, Math.min(maxScale, scale));

  let roll = 0, yaw = 0, pitch = 0;

  if (facialMatrix && facialMatrix.data && facialMatrix.data.length >= 12) {
    const d = facialMatrix.data;
    const R10 = d[1] || 0, R11 = d[5] || 1, R12 = d[9] || 0;
    const R02 = d[8] || 0;

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
   3. PROCEDURAL FRAME BUILDERS
   ═══════════════════════════════════════════════════════════ */
function makeMaterials(color, matPbr) {
  const p = matPbr || { metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 };
  return {
    frame: new THREE.MeshPhysicalMaterial({ color: color.frame, ...p, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ 
      color: color.lens, metalness: 0, roughness: 0.05, transmission: 0.8, 
      thickness: 0.3, ior: 1.5, transparent: true, opacity: 0.45, side: THREE.DoubleSide 
    }),
    hinge: new THREE.MeshPhysicalMaterial({ color: color.accent, metalness: 0.9, roughness: 0.12, clearcoat: 0.5, side: THREE.DoubleSide }),
  };
}

function tag(m, n) { m.userData.partName = n; return m; }

function buildWayfarer(color, matPbr) {
  const g = new THREE.Group(), m = makeMaterials(color, matPbr);
  const s = new THREE.Shape();
  s.moveTo(-0.38, 0.24);
  s.lineTo(0.4, 0.28);
  s.quadraticCurveTo(0.44, 0, 0.38, -0.24);
  s.lineTo(-0.36, -0.22);
  s.quadraticCurveTo(-0.42, 0, -0.38, 0.24);
  
  const pts = s.getPoints(64);
  const rG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, 0)), true), 64, 0.04, 8, true);
  const dG = new THREE.ShapeGeometry(s, 64);
  
  const tb = new THREE.Shape();
  tb.moveTo(-1.02, 0.22);
  tb.lineTo(1.02, 0.22);
  tb.lineTo(1.02, 0.36);
  tb.quadraticCurveTo(0, 0.40, -1.02, 0.36);
  tb.lineTo(-1.02, 0.22);
  
  const t = tag(new THREE.Mesh(new THREE.ExtrudeGeometry(tb, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3 }), m.frame), "top-bar");
  t.position.z = -0.03;
  g.add(t);
  
  [-0.52, 0.52].forEach((x, i) => {
    const r = tag(new THREE.Mesh(rG, m.frame), i === 0 ? "left-rim" : "right-rim");
    r.position.x = x;
    g.add(r);
    const d = tag(new THREE.Mesh(dG, m.lens), i === 0 ? "left-lens" : "right-lens");
    d.position.set(x, 0, 0.005);
    g.add(d);
  });
  
  const bc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.14, 0.04, 0),
    new THREE.Vector3(0, 0.10, 0.02),
    new THREE.Vector3(0.14, 0.04, 0)
  ]);
  g.add(tag(new THREE.Mesh(new THREE.TubeGeometry(bc, 16, 0.028, 8, false), m.frame), "bridge"));
  
  return g;
}

function buildAviator(color, matPbr) {
  const g = new THREE.Group(), m = makeMaterials(color, matPbr);
  const s = new THREE.Shape();
  s.moveTo(0, 0.38);
  s.quadraticCurveTo(0.42, 0.38, 0.44, 0);
  s.quadraticCurveTo(0.42, -0.42, 0, -0.44);
  s.quadraticCurveTo(-0.42, -0.42, -0.44, 0);
  s.quadraticCurveTo(-0.42, 0.38, 0, 0.38);
  
  const pts = s.getPoints(64);
  const rG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, 0)), true), 64, 0.03, 8, true);
  const dG = new THREE.ShapeGeometry(s, 64);
  
  [-0.54, 0.54].forEach((x, i) => {
    const r = tag(new THREE.Mesh(rG, m.frame), i === 0 ? "left-rim" : "right-rim");
    r.position.x = x;
    g.add(r);
    const d = tag(new THREE.Mesh(dG, m.lens), i === 0 ? "left-lens" : "right-lens");
    d.position.set(x, 0, 0.005);
    g.add(d);
  });
  
  return g;
}

/* ═══════════════════════════════════════════════════════════
   4. AR FRAMES & COLORS
   ═══════════════════════════════════════════════════════════ */
const AR_FRAMES = [
  {
    id: "cat-eye",
    name: "Cat-Eye Luxe",
    modelUrl: "/models/Nazarchi091 black_glasses.glb",
    colors: [
      { name: "Matte Black"},
      { name: "Tortoise"},
      { name: "Vanilla"},
    ],
  },
  {
    id: "wayfarer",
    name: "Wayfarer Bold",
    modelUrl: "/models/Marius.Eder glasses.glb",
    colors: [
      { name: "Matte Black"},
      { name: "Tortoise"},
      { name: "Navy"},
    ],
  },
  {
    id: "round",
    name: "Round Wire",
    modelUrl: "/models/Nattsol glasses_3d_model.glb",
    colors: [
      { name: "Silver"},
      { name: "Black"},
      { name: "Copper"},
    ],
  },
  {
    id: "oni",
    name: "OniGraphics",
    modelUrl: "/models/OniGraphics glasses.glb",
    colors: [
      { name: "Black"},
      { name: "Chrome"},
    ],
  },
  {
    id: "ezas",
    name: "Eza's",
    modelUrl: "/models/Eza.3D_ glasses.glb",
    colors: [
      { name: "Original"},
      { name: "Midnight"},
      { name: "Rose Gold"},
    ],
  },
  {
    id: "aviator",
    name: "Aviator Classic",
    modelUrl: "/models/OniGraphics glasses.glb",
    colors: [
      { name: "Charcoal"},
      { name: "Sand"},
      { name: "Blush"},
    ],
  },
];

/* ═══════════════════════════════════════════════════════════
   5. MAIN REACT COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function ARTryOn({ displayToast, initialFrameId = "wayfarer", initialColorIdx = 0 }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const threeContainerRef = useRef(null);
  const sceneRef = useRef({
    renderer: null,
    camera: null,
    scene: null,
    glassesModel: null,
  });
  const filterBankRef = useRef(new FilterBank(FILTER_CONFIG));
  const faceLandmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const streamRef = useRef(null);
  const initCalledRef = useRef(false);

  const [status, setStatus] = useState("loading");
  const [frameIdx, setFrameIdx] = useState(
    AR_FRAMES.findIndex(f => f.id === initialFrameId) || 0
  );
  const [colorIdx, setColorIdx] = useState(initialColorIdx);
  const [faceDetected, setFaceDetected] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const frameIdxRef = useRef(frameIdx);
  const colorIdxRef = useRef(colorIdx);

  useEffect(() => {
    frameIdxRef.current = frameIdx;
  }, [frameIdx]);

  useEffect(() => {
    colorIdxRef.current = colorIdx;
  }, [colorIdx]);

  /* Initialize MediaPipe FaceLandmarker */
  useEffect(() => {
    let ignore = false;

    async function initMediaPipe() {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
        );

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          numFaces: 1,
        });

        if (!ignore) {
          faceLandmarkerRef.current = landmarker;
          setStatus("ready");
        }
      } catch (e) {
        console.error("MediaPipe init error:", e);
        if (!ignore) {
          setCameraError("Failed to load face detection model");
          setStatus("error");
        }
      }
    }

    initMediaPipe();
    return () => {
      ignore = true;
    };
  }, []);

  /* Initialize camera & Three.js */
  useEffect(() => {
    if (status !== "ready" || initCalledRef.current) return;
    initCalledRef.current = true;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }

        /* Setup Three.js */
        const container = threeContainerRef.current;
        if (!container) return;

        const w = container.clientWidth;
        const h = container.clientHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
        camera.position.z = 2;

        const scene = new THREE.Scene();
        scene.background = null;

        /* Lighting */
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
        keyLight.position.set(5, 5, 5);
        scene.add(keyLight);

        sceneRef.current = { renderer, camera, scene, glassesModel: null };

        /* Video playback setup */
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(e => console.warn("Play error:", e));
        };

        /* Animation loop */
        const animate = () => {
          animFrameRef.current = requestAnimationFrame(animate);

          if (
            faceLandmarkerRef.current &&
            videoRef.current &&
            videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
          ) {
            try {
              const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, Date.now());

              if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                setFaceDetected(true);

                const landmarks = results.faceLandmarks[0];
                const facialMatrix = results.facialTransformationMatrixes?.[0];

                const pose = extractFacePose(landmarks, w, h, facialMatrix);

                /* Apply One Euro Filter smoothing */
                const now = Date.now();
                const smoothPx = filterBankRef.current.filter("px", pose.px, now);
                const smoothPy = filterBankRef.current.filter("py", pose.py, now);
                const smoothScale = filterBankRef.current.filter("scale", pose.scale, now);
                const smoothRoll = filterBankRef.current.filter("roll", pose.roll, now);
                const smoothYaw = filterBankRef.current.filter("yaw", pose.yaw, now);
                const smoothPitch = filterBankRef.current.filter("pitch", pose.pitch, now);

                /* Update glasses model position/rotation */
                if (sceneRef.current.glassesModel) {
                  sceneRef.current.glassesModel.position.x = smoothPx / w;
                  sceneRef.current.glassesModel.position.y = smoothPy / h;

                  const baseScale = sceneRef.current.baseModelScale ?? AR_MODEL_BASE_SCALE;
                  let targetScale = smoothScale * baseScale * AR_MODEL_DYNAMIC_SCALE_MULT;
                  targetScale = Math.max(0.35, Math.min(1.15, targetScale));

                  sceneRef.current.glassesModel.scale.setScalar(targetScale);
                  sceneRef.current.glassesModel.rotation.z = smoothRoll;
                  sceneRef.current.glassesModel.rotation.y = smoothYaw;
                  sceneRef.current.glassesModel.rotation.x = smoothPitch;
                }
              } else {
                setFaceDetected(false);
              }
            } catch (e) {
              console.error("Detection error:", e);
            }
          }

          renderer.render(scene, camera);
        };

        animate();

        /* Handle resize */
        const handleResize = () => {
          const newW = container.clientWidth;
          const newH = container.clientHeight;
          renderer.setSize(newW, newH);
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();
        };

        window.addEventListener("resize", handleResize);

        return () => {
          window.removeEventListener("resize", handleResize);
          if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
          }
          renderer.dispose();
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
        };
      } catch (e) {
        console.error("Camera init error:", e);
        setCameraError(e.message);
        setStatus("error");
      }
    }

    initCamera();
  }, [status]);

  const AR_MODEL_BASE_SCALE = 0.65; // global scaling baseline for all AR frames
  const AR_MODEL_DYNAMIC_SCALE_MULT = 0.80; // reduction to avoid oversized models

  /* Create/update glasses model */
  useEffect(() => {
    if (!sceneRef.current.scene) return;

    const frame = AR_FRAMES[frameIdxRef.current];

    /* Remove old model */
    if (sceneRef.current.glassesModel) {
      sceneRef.current.scene.remove(sceneRef.current.glassesModel);
      sceneRef.current.glassesModel = null;
    }

    const placeholder = new THREE.Group();
    placeholder.scale.setScalar(AR_MODEL_BASE_SCALE);
    sceneRef.current.scene.add(placeholder);
    sceneRef.current.glassesModel = placeholder;
    sceneRef.current.baseModelScale = AR_MODEL_BASE_SCALE;

    if (frame.modelUrl) {
      const loader = new GLTFLoader();
      loader.load(
        frame.modelUrl,
        (gltf) => {
          placeholder.clear();
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
          }
          // In the AR view, provide slightly larger initial scale
          model.scale.setScalar(1.0);
          placeholder.add(model);
        },
        undefined,
        (error) => {
          console.error('GLTF loader error:', error);
        }
      );
    } else if (frame.build) {
      const newModel = frame.build(frame.colors[colorIdxRef.current]);
      placeholder.add(newModel);
    }
  }, [frameIdx, colorIdx]);

  /* Cleanup */
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="feature-page" style={{ position: "relative", overflow: "hidden" }}>
      <p className="feature-eyebrow">Augmented Reality</p>
      <div className="feature-title">Virtual Try-On</div>
      <p className="feature-desc">
        See each frame on your face in real-time. Powered by MediaPipe Face Mesh with 468-point tracking.
      </p>

      {cameraError && (
        <div style={{ padding: 16, background: "rgba(255,100,100,0.2)", borderRadius: 10, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "#ffcccc" }}>⚠️ {cameraError}</p>
        </div>
      )}

      <div
        style={{
          position: "relative",
          width: "100%",
          height: 400,
          background: "#000",
          borderRadius: 12,
          marginBottom: 16,
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 1,
            display: "block",
          }}
        />

        <div
          ref={threeContainerRef}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 2,
            pointerEvents: "none",
          }}
        />

        {!faceDetected && status === "ready" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 48 }}>👤</div>
            <p style={{ fontSize: 14, opacity: 0.7 }}>Position your face in frame</p>
          </div>
        )}
      </div>

      {/* Frame selector */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>FRAME</p>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {AR_FRAMES.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setFrameIdx(i)}
              style={{
                flex: "0 0 auto",
                padding: "8px 16px",
                borderRadius: 8,
                border: frameIdx === i ? "1px solid #6fcf97" : "1px solid rgba(111,207,151,0.2)",
                background: frameIdx === i ? "rgba(111,207,151,0.2)" : "transparent",
                color: frameIdx === i ? "#000" : "#fff",
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      {/* Color selector */}
      <div>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>COLOR</p>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {AR_FRAMES[frameIdx].colors.map((c, i) => (
            <button
              key={c.name}
              onClick={() => setColorIdx(i)}
              style={{
                flex: "0 0 auto",
                padding: "8px 16px",
                borderRadius: 8,
                border: colorIdx === i ? "1px solid #6fcf97" : "1px solid rgba(111,207,151,0.2)",
                background: colorIdx === i ? "rgba(111,207,151,0.2)" : "transparent",
                color: colorIdx === i ? "#000" : "#fff",
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" && (
        <div style={{ textAlign: "center", padding: 16, opacity: 0.6 }}>
          Loading face detector...
        </div>
      )}
    </div>
  );
}
