import { useEffect, useRef, useState, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/* ═══════════════════════════════════════════════════════════
   FACE MEASUREMENT HELPERS
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
  leftIris: [468, 469, 470, 471, 472],
  rightIris: [473, 474, 475, 476, 477],
};

function dist(a, b, aspect = 1.333) {
  return Math.sqrt(
    (a.x - b.x) ** 2 + ((a.y - b.y) / aspect) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2
  );
}

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

  /* Iris-based calibration */
  const lIris = LANDMARK.leftIris;
  const rIris = LANDMARK.rightIris;
  const lIrisDiam = dist(lm(lIris[1]), lm(lIris[2]), aspect);
  const rIrisDiam = dist(lm(rIris[1]), lm(rIris[2]), aspect);
  const avgIrisDiamUnits = (lIrisDiam + rIrisDiam) / 2;

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

function getRecommendation(m) {
  let size, sizeIdx;
  if (m.faceWidth < 130) {
    size = "Small";
    sizeIdx = 0;
  } else if (m.faceWidth < 140) {
    size = "Medium";
    sizeIdx = 1;
  } else {
    size = "Large";
    sizeIdx = 2;
  }

  const frameRecs = {
    round: { primary: 0, name: "Wayfarer Bold", reason: "Angular frames balance round features." },
    square: { primary: 1, name: "Aviator Classic", reason: "Curved shapes soften strong jawlines." },
    oval: { primary: 0, name: "Wayfarer Bold", reason: "Oval faces suit most frame styles." },
    oblong: { primary: 1, name: "Aviator Classic", reason: "Wider frames balance longer faces." },
  };

  const rec = frameRecs[m.faceShape] || frameRecs.oval;

  return { size, sizeIdx, frameIdx: rec.primary, frameName: rec.name, reason: rec.reason };
}

/* ═══════════════════════════════════════════════════════════
   SCANNING RING
   ═══════════════════════════════════════════════════════════ */
function ScanRing({ active, progress }) {
  const r = 120;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      width="280"
      height="280"
      viewBox="0 0 280 280"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        opacity: active ? 1 : 0,
        transition: "opacity 0.5s",
      }}
    >
      <circle cx="140" cy="140" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      <circle
        cx="140"
        cy="140"
        r={r}
        fill="none"
        stroke="#6fcf97"
        strokeWidth="2.5"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - progress)}
        strokeLinecap="round"
        transform="rotate(-90 140 140)"
        style={{ transition: "stroke-dashoffset 0.3s ease" }}
      />
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
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 5,
      }}
    >
      <div
        key={count}
        style={{
          width: 100,
          height: 100,
          borderRadius: "50%",
          border: "3px solid rgba(111,207,151,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "gvCountPulse 1s ease both",
        }}
      >
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 52,
            fontWeight: 600,
            color: "#6fcf97",
            lineHeight: 1,
          }}
        >
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
   ═══════════════════════════════════════════════════════════ */
export default function FitScanner({ displayToast, onApplyFit }) {
  const videoRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | loading | ready | countdown | scanning | complete | error
  const [measurements, setMeasurements] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [cameraError, setCameraError] = useState(null);
  const [countdownValue, setCountdownValue] = useState(3);
  const [aspectRatio, setAspectRatio] = useState(4 / 3);
  const [manualIPD, setManualIPD] = useState("");

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

  /* Initialize camera */
  const startScan = useCallback(async () => {
    try {
      setCameraError(null);
      setStatus("loading");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        videoRef.current.onloadedmetadata = () => {
          setAspectRatio(videoRef.current.videoWidth / videoRef.current.videoHeight);
          videoRef.current.play();
          setStatus("ready");
        };
      }
    } catch (e) {
      console.error("Camera error:", e);
      setCameraError(e.message);
      setStatus("error");
    }
  }, []);

  /* Scanning animation loop */
  useEffect(() => {
    if (status !== "scanning" || !faceLandmarkerRef.current) return;

    let frames = 0;
    const SCAN_DURATION = 2000; // 2 seconds of scanning
    const startTime = Date.now();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (
        videoRef.current &&
        videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
      ) {
        try {
          const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, Date.now());

          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const landmarks = results.faceLandmarks[0];
            const meas = computeMeasurements(
              landmarks,
              { manualIPD: manualIPD ? parseFloat(manualIPD) : null },
              aspectRatio
            );

            setMeasurements(meas);
            setRecommendation(getRecommendation(meas));

            frames++;
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / SCAN_DURATION, 1);
            setScanProgress(progress);

            if (progress >= 1) {
              setStatus("complete");
              cancelAnimationFrame(animFrameRef.current);
            }
          }
        } catch (e) {
          console.error("Detection error:", e);
        }
      }
    };

    animate();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [status, manualIPD, aspectRatio]);

  /* Countdown logic */
  useEffect(() => {
    if (status !== "countdown") return;

    const interval = setInterval(() => {
      setCountdownValue(v => {
        if (v <= 1) {
          clearInterval(interval);
          setStatus("scanning");
          return 3;
        }
        return v - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  /* Cleanup on unmount */
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

  const handleApplyFit = () => {
    if (onApplyFit && recommendation) {
      onApplyFit({
        measurements,
        recommendation,
        manualIPD: manualIPD ? parseFloat(manualIPD) : null,
      });
    }
  };

  return (
    <div className="feature-page">
      <p className="feature-eyebrow">AI-Powered</p>
      <div className="feature-title">Face Fit Scanner</div>
      <p className="feature-desc">
        Our AI measures your face in real-time to recommend the perfect frame size and style. No optician visit needed.
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
          paddingBottom: "56.25%",
          background: "#000",
          borderRadius: 12,
          marginBottom: 16,
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: status !== "idle" ? "block" : "none",
          }}
        />

        <ScanRing active={status === "scanning"} progress={scanProgress} />

        {status === "countdown" && <CountdownOverlay count={countdownValue} />}

        {status === "ready" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 48 }}>👤</div>
            <p style={{ fontSize: 14, opacity: 0.7 }}>Position your face in frame</p>
          </div>
        )}

        {status === "idle" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
              <p style={{ opacity: 0.6 }}>Start scanning to begin</p>
            </div>
          </div>
        )}

        {status === "complete" && measurements && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 48 }}>✓</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>Scan Complete!</p>
          </div>
        )}
      </div>

      {/* Results */}
      {status === "complete" && measurements && recommendation && (
        <div style={{ marginBottom: 16, padding: 16, background: "rgba(111,207,151,0.1)", borderRadius: 10 }}>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>YOUR MEASUREMENTS</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <span style={{ opacity: 0.6 }}>Face Width</span>
                <p style={{ fontSize: 18, fontWeight: 600 }}>{measurements.faceWidth}mm</p>
              </div>
              <div>
                <span style={{ opacity: 0.6 }}>Face Height</span>
                <p style={{ fontSize: 18, fontWeight: 600 }}>{measurements.faceHeight}mm</p>
              </div>
              <div>
                <span style={{ opacity: 0.6 }}>Face Shape</span>
                <p style={{ fontSize: 18, fontWeight: 600, textTransform: "capitalize" }}>
                  {measurements.faceShape}
                </p>
              </div>
              <div>
                <span style={{ opacity: 0.6 }}>Bridge Width</span>
                <p style={{ fontSize: 18, fontWeight: 600 }}>{measurements.bridgeWidth}mm</p>
              </div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(111,207,151,0.2)", paddingTop: 12 }}>
            <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>RECOMMENDED SIZE</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: "#6fcf97", marginBottom: 8 }}>
              {recommendation.size}
            </p>
            <p style={{ fontSize: 14, marginBottom: 8 }}>{recommendation.frameName}</p>
            <p style={{ fontSize: 12, opacity: 0.6 }}>{recommendation.reason}</p>
          </div>
        </div>
      )}

      {/* Manual IPD input */}
      {status === "ready" && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, opacity: 0.6 }}>
            Manual IPD (optional, in mm):
            <input
              type="number"
              value={manualIPD}
              onChange={e => setManualIPD(e.target.value)}
              placeholder="63"
              style={{
                width: "100%",
                padding: "8px 12px",
                marginTop: 4,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(111,207,151,0.2)",
                borderRadius: 6,
                color: "#fff",
              }}
            />
          </label>
        </div>
      )}

      {/* Action buttons */}
      <div className="scan-btn-wrap" style={{ display: "flex", gap: 8 }}>
        {status === "idle" && (
          <button
            onClick={startScan}
            style={{
              flex: 1,
              padding: "16px 0",
              background: "rgba(255,255,255,0.85)",
              color: "#111",
              border: "none",
              borderRadius: 10,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Start Scan
          </button>
        )}

        {status === "ready" && (
          <button
            onClick={() => setStatus("countdown")}
            style={{
              flex: 1,
              padding: "16px 0",
              background: "rgba(111,207,151,0.2)",
              color: "#000",
              border: "1px solid rgba(111,207,151,0.5)",
              borderRadius: 10,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Begin Scan
          </button>
        )}

        {status === "complete" && (
          <>
            <button
              onClick={() => {
                setStatus("idle");
                setScanProgress(0);
                setMeasurements(null);
                setRecommendation(null);
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach(t => t.stop());
                }
              }}
              style={{
                flex: 1,
                padding: "16px 0",
                background: "transparent",
                color: "#fff",
                border: "1px solid rgba(111,207,151,0.2)",
                borderRadius: 10,
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Retake Scan
            </button>
            <button
              onClick={handleApplyFit}
              style={{
                flex: 1,
                padding: "16px 0",
                background: "rgba(255,255,255,0.85)",
                color: "#111",
                border: "none",
                borderRadius: 10,
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Apply Fit
            </button>
          </>
        )}

        {(status === "scanning" || status === "loading") && (
          <button
            disabled
            style={{
              flex: 1,
              padding: "16px 0",
              background: "rgba(111,207,151,0.1)",
              color: "#6fcf97",
              border: "none",
              borderRadius: 10,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              cursor: "not-allowed",
              opacity: 0.5,
            }}
          >
            {status === "loading" ? "Loading..." : "Scanning..."}
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, opacity: 0.25, textAlign: "center", lineHeight: 1.6, marginTop: 12 }}>
        Measurement accuracy ±1mm · Works in good lighting.
        <br />
        No images are stored or transmitted.
      </p>
    </div>
  );
}
