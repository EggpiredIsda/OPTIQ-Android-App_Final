import { useEffect, useRef, useState, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/* ═══════════════════════════════════════════════════════════
   FACE MEASUREMENT HELPERS

   MediaPipe Face Mesh landmarks we use:
   - 454/234: left/right temple (face width)
   - 6/168: nose bridge top area
   - 4: nose tip
   - 10/152: forehead top / chin bottom (face height)
   - 127/356: outer cheekbones
   - 46/276: inner eye corners (bridge width)

   Reference: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
   ═══════════════════════════════════════════════════════════ */

const LANDMARK = {
  leftTemple: 234,
  rightTemple: 454,
  leftCheek: 127,
  rightCheek: 356,
  leftEyeInner: 133,
  rightEyeInner: 362,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  foreheadTop: 10,
  chinBottom: 152,
  noseBridgeTop: 6,
  noseTip: 4,
  /* Iris landmarks (MediaPipe V2) */
  leftIris: [468, 469, 470, 471, 472],
  rightIris: [473, 474, 475, 476, 477],
};

function dist(a, b, aspect = 1.333) {
  return Math.sqrt((a.x - b.x) ** 2 + ((a.y - b.y) / aspect) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

/* convert normalized landmark distance to approximate mm using Iris or Manual IPD as reference */
/* average adult iris diameter is ~11.7mm */
function computeMeasurements(landmarks, options = {}, aspect = 1) {
  const lm = (idx) => landmarks[idx];
  const { manualIPD = null } = options;

  const leftEyeOuter = lm(LANDMARK.leftEyeOuter);
  const rightEyeOuter = lm(LANDMARK.rightEyeOuter);
  const leftEyeInner = lm(LANDMARK.leftEyeInner);
  const rightEyeInner = lm(LANDMARK.rightEyeInner);
  const leftTemple = lm(LANDMARK.leftTemple);
  const rightTemple = lm(LANDMARK.rightTemple);
  const foreheadTop = lm(LANDMARK.foreheadTop);
  const chinBottom = lm(LANDMARK.chinBottom);
  const leftCheek = lm(LANDMARK.leftCheek);
  const rightCheek = lm(LANDMARK.rightCheek);

  /* Iris-based calibration (Natural Ruler) */
  const lIris = LANDMARK.leftIris;
  const rIris = LANDMARK.rightIris;
  const lIrisDiam = dist(lm(lIris[1]), lm(lIris[2]), aspect);
  const rIrisDiam = dist(lm(rIris[1]), lm(rIris[2]), aspect);
  const avgIrisDiamUnits = (lIrisDiam + rIrisDiam) / 2;

  /* Calibration logic: Manual IPD > Iris Auto > Statistical fallback */
  let mmPerUnit;
  if (manualIPD && manualIPD > 0) {
    const ipdUnits = dist(lm(lIris[0]), lm(rIris[0]), aspect);
    mmPerUnit = manualIPD / ipdUnits;
  } else if (avgIrisDiamUnits > 0.001) {
    mmPerUnit = 11.7 / avgIrisDiamUnits;
  } else {
    const eyeOuterDist = dist(leftEyeOuter, rightEyeOuter, aspect);
    mmPerUnit = 85 / eyeOuterDist;
  }

  const faceWidth = dist(leftTemple, rightTemple, aspect) * mmPerUnit;
  const bridgeWidth = dist(leftEyeInner, rightEyeInner, aspect) * mmPerUnit;
  const faceHeight = dist(foreheadTop, chinBottom, aspect) * mmPerUnit;
  const cheekWidth = dist(leftCheek, rightCheek, aspect) * mmPerUnit;

  /* face shape classification */
  const ratio = faceWidth / faceHeight;
  let faceShape;
  if (ratio > 0.85) faceShape = "round";
  else if (ratio > 0.78) faceShape = "square";
  else if (ratio > 0.72) faceShape = "oval";
  else faceShape = "oblong";

  return {
    faceWidth: Math.round(faceWidth),
    bridgeWidth: Math.round(bridgeWidth),
    faceHeight: Math.round(faceHeight),
    cheekWidth: Math.round(cheekWidth),
    faceShape,
    ratio: ratio.toFixed(2),
    mmPerUnit,
  };
}

/* recommend size and frame based on measurements */
function getRecommendation(m) {
  let size, sizeIdx;
  if (m.faceWidth < 130) { size = "Small"; sizeIdx = 0; }
  else if (m.faceWidth < 140) { size = "Medium"; sizeIdx = 1; }
  else { size = "Large"; sizeIdx = 2; }

  /* frame style recommendation based on face shape */
 const frameRecs = {
    round: { primary: 2, name: "Wayfarer Bold", reason: "Angular frames balance round features and add definition." },
    square: { primary: 1, name: "Aviator Classic", reason: "Curved teardrop shape softens strong jawlines and angular features." },
    oval: { primary: 3, name: "Round Wire", reason: "Oval faces suit almost anything. Round frames complement your balanced proportions." },
    oblong: { primary: 0, name: "Cat-Eye Luxe", reason: "Wider frames with upswept corners add width and balance a longer face." },
  };

  const rec = frameRecs[m.faceShape] || frameRecs.oval;

  return { size, sizeIdx, frameIdx: rec.primary, frameName: rec.name, reason: rec.reason };
}

/* ═══════════════════════════════════════════════════════════
   SCANNING ANIMATION RING
   ═══════════════════════════════════════════════════════════ */
function ScanRing({ active, progress }) {
  const r = 120;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="280" height="280" viewBox="0 0 280 280" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none", opacity: active ? 1 : 0, transition: "opacity 0.5s" }}>
      {/* background ring */}
      <circle cx="140" cy="140" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      {/* progress ring */}
      <circle cx="140" cy="140" r={r} fill="none" stroke="#6fcf97" strokeWidth="2.5"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
        strokeLinecap="round" transform="rotate(-90 140 140)"
        style={{ transition: "stroke-dashoffset 0.3s ease" }} />
      {/* corner brackets */}
      {[
        "M60 85 L60 60 L85 60",
        "M195 60 L220 60 L220 85",
        "M220 195 L220 220 L195 220",
        "M85 220 L60 220 L60 195",
      ].map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(111,207,151,0.5)" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   COUNTDOWN OVERLAY
   ═══════════════════════════════════════════════════════════ */
function CountdownOverlay({ count }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 12,
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
      zIndex: 5,
    }}>
      <div key={count} style={{
        width: 100, height: 100, borderRadius: "50%",
        border: "3px solid rgba(111,207,151,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "gvCountPulse 1s ease both",
      }}>
        <span style={{
          fontFamily: "'Playfair Display', serif", fontSize: 52, fontWeight: 600,
          color: "#6fcf97", lineHeight: 1,
        }}>
          {count}
        </span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
        Hold still...
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT

   Flow: idle → loading → ready → countdown → scanning → complete
   ═══════════════════════════════════════════════════════════ */
export default function FitScanner({ onApplyFit }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const streamRef = useRef(null);
  const countdownRef = useRef(null);

  const [status, setStatus] = useState("idle"); /* idle | loading | ready | countdown | scanning | complete | error */
  const [measurements, setMeasurements] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [cameraError, setCameraError] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const [aspectRatio, setAspectRatio] = useState(4/3);
  const [manualIPD, setManualIPD] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const SAMPLES_NEEDED = 20;

  /* ── inject countdown animation ── */
  useEffect(() => {
    const id = "gv-countdown-styles";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes gvCountPulse {
        0% { transform: scale(0.6); opacity: 0; }
        30% { transform: scale(1.1); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(s);
  }, []);

  /* ── initialize MediaPipe ── */
  const initFaceLandmarker = useCallback(async () => {
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
        outputFacialTransformationMatrixes: false,
      });
      faceLandmarkerRef.current = fl;
      return true;
    } catch (err) {
      console.error("MediaPipe init error:", err);
      setStatus("error");
      setCameraError("Failed to load AI model. Check your internet connection or browser compatibility.");
      return false;
    }
  }, []);

  /* ── start camera ── */
  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setCameraError("Camera API not supported in this browser.");
      setStatus("error");
      return false;
    }

    try {
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
        console.warn("FitScanner: Preferred constraints failed, trying default...", e.name);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e2) {
          throw e2;
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          // Wait for metadata to get aspect ratio
          await new Promise((res) => {
            videoRef.current.onloadedmetadata = () => {
              setAspectRatio(videoRef.current.videoWidth / videoRef.current.videoHeight);
              res();
            };
            if (videoRef.current.videoWidth > 0) res(); // Backup if already loaded
          });
          await videoRef.current.play();
        } catch (playErr) {
          console.error("FitScanner: Play error:", playErr);
        }
      }
      return true;
    } catch (err) {
      console.error("FitScanner: Camera ultimately failed:", err);
      let msg = "Camera access denied. Please allow permissions and refresh.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Camera access denied. Click the 'lock' icon in your address bar to reset permissions.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No camera found. Please connect a webcam.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        msg = "Camera is being used by another application.";
      } else if (err.name === "OverconstrainedError") {
        msg = "Your camera doesn't support the requested resolution.";
      }
      setCameraError(msg);
      setStatus("error");
      return false;
    }
  }, []);

  /* ── stop camera ── */
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  /* ── run detection loop ── */
  const startDetection = useCallback(() => {
    const fl = faceLandmarkerRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!fl || !video || !canvas) return;

    const ctx = canvas.getContext("2d");
    const samples = [];
    let lastTimeVideo = -1;

    const detect = () => {
      animFrameRef.current = requestAnimationFrame(detect);
      if (video.readyState < 2) return;
      const videoTime = video.currentTime;
      if (videoTime === lastTimeVideo) return;
      lastTimeVideo = videoTime;
      const now = performance.now();

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const result = fl.detectForVideo(video, now);

      /* draw video */
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];

        /* draw mesh with subtle dots */
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);

        const drawLine = (idx1, idx2, color) => {
          const a = landmarks[idx1];
          const b = landmarks[idx2];
          ctx.beginPath();
          ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
          ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        };

        /* face width */
        drawLine(LANDMARK.leftTemple, LANDMARK.rightTemple, "rgba(111,207,151,0.7)");
        /* bridge width */
        drawLine(LANDMARK.leftEyeInner, LANDMARK.rightEyeInner, "rgba(78,205,196,0.7)");
        /* face height */
        drawLine(LANDMARK.foreheadTop, LANDMARK.chinBottom, "rgba(168,237,234,0.4)");

        /* subtle face mesh dots */
        landmarks.forEach((lm, i) => {
          if (i % 6 !== 0) return;
          ctx.beginPath();
          ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 1, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fill();
        });

        ctx.restore();

        const aspect = video.videoWidth / video.videoHeight;
        const m = computeMeasurements(landmarks, { manualIPD: parseFloat(manualIPD) }, aspect);
        samples.push(m);
        setScanProgress(Math.min(samples.length / SAMPLES_NEEDED, 1));

        if (samples.length >= SAMPLES_NEEDED) {
          /* average all samples for stability */
          const avg = {
            faceWidth: Math.round(samples.reduce((s, m) => s + m.faceWidth, 0) / samples.length),
            bridgeWidth: Math.round(samples.reduce((s, m) => s + m.bridgeWidth, 0) / samples.length),
            faceHeight: Math.round(samples.reduce((s, m) => s + m.faceHeight, 0) / samples.length),
            cheekWidth: Math.round(samples.reduce((s, m) => s + m.cheekWidth, 0) / samples.length),
            faceShape: samples[Math.floor(samples.length / 2)].faceShape,
            ratio: (samples.reduce((s, m) => s + parseFloat(m.ratio), 0) / samples.length).toFixed(2),
          };

          setMeasurements(avg);
          setRecommendation(getRecommendation(avg));
          setStatus("complete");
          cancelAnimationFrame(animFrameRef.current);
        }
      }
    };

    setStatus("scanning");
    detect();
  }, []);

  /* ── main start flow: load model + camera, then show "ready" screen ── */
  const handleStart = useCallback(async () => {
    setScanProgress(0);
    setMeasurements(null);
    setRecommendation(null);
    setCameraError(null);
    setConfirmed(false);
    setCountdownValue(3);
    setStatus("loading");

    const modelOk = faceLandmarkerRef.current || (await initFaceLandmarker());
    if (!modelOk) return;

    const camOk = await startCamera();
    if (!camOk) return;

    /* camera is live but we pause here — show the "ready" screen */
    setStatus("ready");
  }, [initFaceLandmarker, startCamera]);

  /* ── begin countdown (called when user confirms readiness) ── */
  const handleBeginCountdown = useCallback(() => {
    setStatus("countdown");
    setCountdownValue(3);

    let remaining = 3;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        startDetection();
      } else {
        setCountdownValue(remaining);
      }
    }, 1000);
  }, [startDetection]);

  /* cleanup on unmount */
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  /* ── rescan ── */
  const handleRescan = useCallback(() => {
    setStatus("idle");
    stopCamera();
    handleStart();
  }, [handleStart, stopCamera]);

  /* ── draw live camera preview during "ready" and "countdown" ── */
  useEffect(() => {
    if (status !== "ready" && status !== "countdown") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let raf;
    const drawPreview = () => {
      raf = requestAnimationFrame(drawPreview);
      if (video.readyState < 2) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      /* subtle face oval guide */
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, canvas.width * 0.18, canvas.height * 0.32, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(111,207,151,0.25)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawPreview();
    return () => cancelAnimationFrame(raf);
  }, [status]);

  return (
    <div style={{ width: "100%", maxWidth: 900, margin: "0 auto", padding: "0 24px 80px", textAlign: "left", boxSizing: "border-box" }}>

      {/* HEADER */}
      <section style={{ paddingTop: 48, paddingBottom: 32, textAlign: "center" }}>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.5, marginBottom: 12, fontWeight: 600 }}>
          AI-Powered
        </p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 500, margin: "0 0 12px", lineHeight: 1.2 }}>
          Face Fit Scanner
        </h1>
        <p style={{ fontSize: 14, opacity: 0.6, maxWidth: 480, margin: "0 auto" }}>
          Our AI measures your face in real-time using MediaPipe Iris detection to recommend the perfect frame size and style. No optician visit needed.
        </p>

        {/* SETTINGS TOGGLE */}
        <div style={{ marginTop: 20 }}>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, padding: "6px 16px", color: "rgba(255,255,255,0.5)",
              fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: 1,
              textTransform: "uppercase", transition: "all 0.3s"
            }}
          >
            {showSettings ? "✕ Close Settings" : "⚙ Accuracy Settings"}
          </button>
        </div>

        {showSettings && (
          <div style={{ 
            marginTop: 16, padding: 16, borderRadius: 12, 
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            maxWidth: 320, margin: "16px auto 0", textAlign: "left"
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: "#6fcf97" }}>Pinpoint Accuracy</p>
            <p style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.5, margin: "0 0 12px" }}>
              By default, we use <strong>Iris Auto-Calibration</strong> (11.7mm reference). If you know your exact Pupillary Distance (IPD), enter it below.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6 }}>Manual IPD (mm)</label>
              <input 
                type="number" 
                placeholder="e.g. 63"
                value={manualIPD}
                onChange={(e) => setManualIPD(e.target.value)}
                style={{
                  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13,
                  outline: "none", width: "100%", boxSizing: "border-box"
                }}
              />
              <p style={{ fontSize: 9, opacity: 0.5, margin: "4px 0 0" }}>Leave blank for Iris Auto-Mode</p>
            </div>
          </div>
        )}
      </section>

      {/* CAMERA VIEWPORT */}
      <div style={{ 
        position: "relative", width: "100%", maxWidth: 560, margin: "0 auto 32px", 
        aspectRatio: aspectRatio, borderRadius: 20, overflow: "hidden", 
        background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.06)" 
      }}>

        {/* video + canvas (hidden until camera is active) */}
        <video ref={videoRef} playsInline muted style={{ display: "none" }} />
        <canvas ref={canvasRef} style={{
          width: "100%", height: "100%", objectFit: "cover",
          display: (status === "ready" || status === "countdown" || status === "scanning" || status === "complete") ? "block" : "none",
        }} />

        {/* scan ring overlay */}
        {status === "scanning" && <ScanRing active={true} progress={scanProgress} />}

        {/* countdown overlay */}
        {status === "countdown" && <CountdownOverlay count={countdownValue} />}

        {/* ── IDLE STATE ── */}
        {status === "idle" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", border: "2px solid rgba(111,207,151,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
              ◎
            </div>
            <p style={{ fontSize: 14, opacity: 0.7, textAlign: "center" }}>Position your face in front of the camera</p>
            <button onClick={handleStart} style={{
              padding: "14px 36px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "rgba(111,207,151,0.9)", color: "#000",
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
              letterSpacing: 1.5, textTransform: "uppercase", transition: "all 0.3s",
            }}>
              Start Scan
            </button>
          </div>
        )}

        {/* ── LOADING STATE ── */}
        {status === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, border: "2px solid rgba(111,207,151,0.3)", borderTopColor: "#6fcf97", borderRadius: "50%", animation: "gvSpin 0.8s linear infinite" }} />
            <p style={{ fontSize: 13, opacity: 0.7 }}>Loading AI model & camera...</p>
          </div>
        )}

        {/* ── READY STATE: well-lit area prompt + confirmation ── */}
        {status === "ready" && (
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
              background: "rgba(255,200,50,0.12)", border: "1px solid rgba(255,200,50,0.3)",
            }}>
              <span style={{ fontSize: 14 }}>☀</span>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,220,100,0.9)" }}>
                Good Lighting Required
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
                  Before we scan
                </p>
                <p style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.55, margin: 0 }}>
                  For accurate measurements, make sure you're in a <strong style={{ color: "rgba(255,220,100,0.9)", fontWeight: 600 }}>well-lit area</strong> with
                  even lighting on your face. Avoid backlighting or harsh shadows. Position your face within the oval guide above.
                </p>
              </div>

              {/* checklist items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  "Face evenly lit (no harsh shadows)",
                  "Glasses or sunglasses removed",
                  "Face centred in the oval guide",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "#6fcf97", opacity: 0.8 }}>✓</span>
                    <span style={{ fontSize: 11, opacity: 0.65 }}>{item}</span>
                  </div>
                ))}
              </div>

              {/* confirmation checkbox */}
              <label style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "10px 14px", borderRadius: 10,
                background: confirmed ? "rgba(111,207,151,0.08)" : "rgba(255,255,255,0.03)",
                border: confirmed ? "1px solid rgba(111,207,151,0.25)" : "1px solid rgba(255,255,255,0.06)",
                transition: "all 0.3s",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: confirmed ? "2px solid #6fcf97" : "2px solid rgba(255,255,255,0.2)",
                  background: confirmed ? "rgba(111,207,151,0.2)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.3s",
                }}>
                  {confirmed && <span style={{ fontSize: 12, color: "#6fcf97", lineHeight: 1 }}>✓</span>}
                </div>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  style={{ display: "none" }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, opacity: confirmed ? 0.9 : 0.7 }}>
                  I'm in a well-lit area and ready to scan
                </span>
              </label>

              {/* begin scan button */}
              <button
                onClick={handleBeginCountdown}
                disabled={!confirmed}
                style={{
                  padding: "14px 0", borderRadius: 10, border: "none", cursor: confirmed ? "pointer" : "not-allowed",
                  background: confirmed ? "rgba(111,207,151,0.9)" : "rgba(111,207,151,0.2)",
                  color: confirmed ? "#000" : "rgba(0,0,0,0.3)",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                  letterSpacing: 1.5, textTransform: "uppercase",
                  transition: "all 0.3s", width: "100%",
                  opacity: confirmed ? 1 : 0.5,
                }}
              >
                Begin Scan
              </button>
            </div>
          </div>
        )}

        {/* ── ERROR STATE ── */}
        {status === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
            <p style={{ fontSize: 14, opacity: 0.6, textAlign: "center", color: "#ff6b6b" }}>{cameraError}</p>
            <button onClick={handleStart} style={{
              padding: "10px 24px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
              background: "rgba(255,255,255,0.06)", color: "#fff",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              Try Again
            </button>
          </div>
        )}

        {/* scanning status bar */}
        {status === "scanning" && (
          <div style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7, fontWeight: 600 }}>Analyzing face</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", opacity: 0.7 }}>{Math.round(scanProgress * 100)}%</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ height: "100%", borderRadius: 2, background: "#6fcf97", width: `${scanProgress * 100}%`, transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}

        {/* complete overlay */}
        {status === "complete" && (
          <div style={{ position: "absolute", top: 16, left: 16, display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 8, background: "rgba(111,207,151,0.15)", border: "1px solid rgba(111,207,151,0.3)" }}>
            <span style={{ color: "#6fcf97", fontSize: 14 }}>✓</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#6fcf97" }}>Scan Complete</span>
          </div>
        )}
      </div>

      {/* RESULTS */}
      {status === "complete" && measurements && recommendation && (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>

          {/* measurements grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
            {[
              { label: "Face Width", value: `${measurements.faceWidth}mm`, color: "rgba(111,207,151,0.7)" },
              { label: "Bridge", value: `${measurements.bridgeWidth}mm`, color: "rgba(78,205,196,0.7)" },
              { label: "Face Height", value: `${measurements.faceHeight}mm`, color: "rgba(168,237,234,0.5)" },
              { label: "Face Shape", value: measurements.faceShape, color: "rgba(255,255,255,0.4)" },
            ].map((m, i) => (
              <div key={i} style={{
                padding: "14px 12px", borderRadius: 12, textAlign: "center",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <p style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.55, margin: "0 0 6px", fontWeight: 600 }}>{m.label}</p>
                <p style={{ fontSize: 18, fontWeight: 600, margin: 0, fontFamily: "'Playfair Display', serif", color: m.color }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* recommendation card */}
          <div style={{
            padding: "24px", borderRadius: 16,
            background: "rgba(111,207,151,0.04)", border: "1px solid rgba(111,207,151,0.12)",
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.6, margin: "0 0 12px", fontWeight: 600, color: "#6fcf97" }}>
              AI Recommendation
            </p>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px", fontFamily: "'Playfair Display', serif" }}>
                  {recommendation.frameName}
                </p>
                <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 12px" }}>
                  Size: <strong style={{ opacity: 1 }}>{recommendation.size}</strong>
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.7, opacity: 0.65, margin: 0 }}>
                  {recommendation.reason}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <p style={{ fontSize: 9, opacity: 0.5, margin: "0 0 2px", letterSpacing: 1, textTransform: "uppercase" }}>Face shape</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, textTransform: "capitalize" }}>{measurements.faceShape}</p>
                </div>
                <div style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <p style={{ fontSize: 9, opacity: 0.5, margin: "0 0 2px", letterSpacing: 1, textTransform: "uppercase" }}>W/H Ratio</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{measurements.ratio}</p>
                </div>
              </div>
            </div>
          </div>

          {/* action buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleRescan} style={{
              flex: 1, padding: "14px 0", borderRadius: 10, cursor: "pointer",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              letterSpacing: 1.5, textTransform: "uppercase", transition: "all 0.3s",
            }}>
              Rescan
            </button>
            <button onClick={() => {
              stopCamera();
              if (onApplyFit) onApplyFit({ 
                frameIdx: recommendation.frameIdx, 
                sizeIdx: recommendation.sizeIdx, 
                faceWidth: measurements.faceWidth 
              });
            }} style={{
              flex: 2, padding: "14px 0", borderRadius: 10, cursor: "pointer",
              background: "rgba(111,207,151,0.9)", border: "none", color: "#000",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              letterSpacing: 1.5, textTransform: "uppercase", transition: "all 0.3s",
            }}>
              Use This Fit
            </button>
          </div>

          {/* how it works footer */}
          <div style={{ marginTop: 32, padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <p style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.45, margin: "0 0 10px", fontWeight: 600 }}>How This Works</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {[
                { step: "01", title: "Detect", desc: "MediaPipe Face Mesh identifies 468 facial landmarks in real-time" },
                { step: "02", title: "Measure", desc: "Key distances (face width, bridge, proportions) are calculated from landmark positions" },
                { step: "03", title: "Recommend", desc: "AI matches your measurements to the best frame size and style" },
              ].map((s, i) => (
                <div key={i}>
                  <p style={{ fontSize: 9, opacity: 0.4, fontFamily: "'JetBrains Mono', monospace", margin: "0 0 4px" }}>{s.step}</p>
                  <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 4px" }}>{s.title}</p>
                  <p style={{ fontSize: 11, opacity: 0.55, margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}