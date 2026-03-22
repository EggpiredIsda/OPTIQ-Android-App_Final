import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

const META = [
  { tag: "Everyday",      accent: "#a8c4e0", uv: 99, blueLight: 5,  glare: 12, features: ["UV400 Protection", "Scratch Resistant", "Impact Grade"],        use: "Office · Reading · Daily wear"   },
  { tag: "Digital",       accent: "#f0c060", uv: 99, blueLight: 40, glare: 22, features: ["40% Blue Light Block", "Eye Strain Relief", "Sleep Friendly"],    use: "Screens · Gaming · Long hours"   },
  { tag: "Outdoor",       accent: "#80c896", uv:100, blueLight: 0,  glare: 92, features: ["Polarised Filter", "UV400 Block", "Glare Eliminated"],            use: "Driving · Water · Sports"        },
  { tag: "Fashion",       accent: "#c4a0e0", uv: 99, blueLight: 0,  glare: 44, features: ["Gradient Effect", "UV Protection", "Statement Style"],            use: "Style · Casual · Events"         },
  { tag: "Photochromic",  accent: "#f08060", uv:100, blueLight: 15, glare: 65, features: ["Auto-Darkening", "UV100 Block", "Indoor & Outdoor"],              use: "All-day · Mixed environments"    },
];

/* ── Build a THREE.Shape matching the selected frame ── */
function makeLensShape(frameId) {
  const s = new THREE.Shape();
  switch (frameId) {
    case "aviator":
      s.moveTo(0, 0.62);
      s.quadraticCurveTo(0.68, 0.62, 0.70, 0);
      s.quadraticCurveTo(0.68, -0.68, 0, -0.70);
      s.quadraticCurveTo(-0.68, -0.68, -0.70, 0);
      s.quadraticCurveTo(-0.68, 0.62, 0, 0.62);
      break;
    case "wayfarer":
      s.moveTo(-0.60, 0.38);
      s.lineTo(0.62, 0.44);
      s.quadraticCurveTo(0.70, 0, 0.60, -0.38);
      s.lineTo(-0.58, -0.35);
      s.quadraticCurveTo(-0.68, 0, -0.60, 0.38);
      break;
    case "cat-eye":
      s.moveTo(-0.58, 0.28);
      s.quadraticCurveTo(-0.16, 0.48, 0.32, 0.54);
      s.quadraticCurveTo(0.74, 0.48, 0.70, 0.12);
      s.quadraticCurveTo(0.68, -0.35, 0.16, -0.42);
      s.quadraticCurveTo(-0.38, -0.42, -0.60, -0.16);
      s.quadraticCurveTo(-0.68, 0.06, -0.58, 0.28);
      break;
    case "custom": {
      const w = 0.66, h = 0.44, r = 0.14;
      s.moveTo(-w + r, -h);
      s.lineTo(w - r, -h);
      s.quadraticCurveTo(w, -h, w, -h + r);
      s.lineTo(w, h - r);
      s.quadraticCurveTo(w, h, w - r, h);
      s.lineTo(-w + r, h);
      s.quadraticCurveTo(-w, h, -w, h - r);
      s.lineTo(-w, -h + r);
      s.quadraticCurveTo(-w, -h, -w + r, -h);
      break;
    }
    default: // round
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        if (i === 0) s.moveTo(Math.cos(a) * 0.62, Math.sin(a) * 0.62);
        else         s.lineTo(Math.cos(a) * 0.62, Math.sin(a) * 0.62);
      }
  }
  return s;
}

/* ── Build one lens mesh group ── */
function makeLensDisc(tint, accentHex, frameId) {
  const group = new THREE.Group();
  const shape = makeLensShape(frameId);

  /* Glass face — ExtrudeGeometry gives it real depth */
  const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.10,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 4,
  });
  extrudeGeo.center();

  const mat = new THREE.MeshPhysicalMaterial({
    color: tint.color,
    metalness: 0,
    roughness: 0,
    transmission: tint.transmission,
    thickness: 1.0,
    ior: 1.52,
    transparent: true,
    opacity: Math.max(tint.opacity, 0.38),
    side: THREE.DoubleSide,
    envMapIntensity: 1.4,
  });
  mat.userData._baseOpacity = Math.max(tint.opacity, 0.42);
  group.add(new THREE.Mesh(extrudeGeo, mat));

  /* Rim — tube following the shape outline */
  const pts2d = shape.getPoints(80);
  const pts3d = pts2d.map(p => new THREE.Vector3(p.x, p.y, 0));
  const rimGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts3d, true), 80, 0.030, 10, true
  );
  const rimMat = new THREE.MeshPhysicalMaterial({
    color: 0x181828,
    metalness: 0.65,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  group.add(new THREE.Mesh(rimGeo, rimMat));

  /* Inner glow ring — also shape-following, slightly inset */
  const glowPts = pts2d.map(p => new THREE.Vector3(p.x * 0.92, p.y * 0.92, 0));
  const glowGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(glowPts, true), 80, 0.022, 8, true
  );
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(accentHex),
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(glowGeo, glowMat));

  return { group, mat, glowMat };
}

const lerp = (a, b, t) => a + (b - a) * t;

export default function LensPicker({ lensTypes, lensIdx, onSelect, frameId }) {
  const mountRef   = useRef(null);
  const sceneRef   = useRef({});
  const lensIdxRef = useRef(lensIdx);
  const barKey     = `bars-${lensIdx}`;

  /* ── Build / rebuild scene when frameId changes ── */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || 500;
    const H = 240;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.8;
    while (mount.firstChild) mount.removeChild(mount.firstChild);
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 50);
    camera.position.set(0, 0, 5.8);
    camera.lookAt(0, 0, 0);

    const scene = new THREE.Scene();

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const key = new THREE.DirectionalLight(0xffffff, 3.5);
    key.position.set(3, 4, 3); scene.add(key);
    const fill = new THREE.PointLight(0x4466ff, 4, 12);
    fill.position.set(-3, 1, 2); scene.add(fill);
    const back = new THREE.DirectionalLight(0xffffff, 1.2);
    back.position.set(0, -2, -4); scene.add(back);
    const top = new THREE.PointLight(0xffeedd, 2, 8);
    top.position.set(0, 5, 1); scene.add(top);

    const N = lensTypes.length;
    const discs = lensTypes.map((lt, i) => {
      const m = META[i];
      const { group, mat, glowMat } = makeLensDisc(lt.tint, m.accent, frameId);
      scene.add(group);
      return { group, mat, glowMat, idx: i };
    });

    sceneRef.current = { renderer, scene, camera, discs, lensIdx: lensIdxRef.current };

    let t = 0, raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 0.012;

      const sel = sceneRef.current.lensIdx;

      discs.forEach((d, i) => {
        // Relative slot: how far is this disc from the selected one, wrapping around
        let offset = ((i - sel) + N) % N;
        if (offset > N / 2) offset -= N; // map to range -2..2
        const isSel   = offset === 0;
        const sideSign = offset < 0 ? -1 : 1;
        const absDist  = Math.abs(offset);

        const tx = isSel ? 0 : sideSign * (2.0 + (absDist - 1) * 0.55);
        const tz = isSel ? 0.8 : -1.8 - (absDist - 1) * 0.3;
        const ts = isSel ? 1.05 : absDist === 1 ? 0.42 : 0.28;

        d.group.position.x = lerp(d.group.position.x, tx, 0.075);
        d.group.position.z = lerp(d.group.position.z, tz, 0.075);
        d.group.position.y = lerp(d.group.position.y, 0, 0.075);
        d.group.scale.setScalar(lerp(d.group.scale.x, ts, 0.075));

        const targetRotY = isSel ? Math.sin(t * 0.35) * 0.18 : sideSign * 0.48;
        d.group.rotation.y = lerp(d.group.rotation.y, targetRotY, 0.06);
        d.group.rotation.x = lerp(d.group.rotation.x, isSel ? 0.04 : 0.08, 0.05);

        const targetOpacity = isSel ? (d.mat.userData._baseOpacity || 0.42) : 0.16;
        d.mat.opacity = lerp(d.mat.opacity, targetOpacity, 0.06);
        d.mat.needsUpdate = true;
        d.glowMat.opacity = lerp(d.glowMat.opacity, isSel ? 0.32 : 0.03, 0.08);
      });

      renderer.render(scene, camera);
    };
    loop();

    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      if (!hits.length) return;
      for (const disc of discs) {
        let o = hits[0].object;
        while (o) {
          if (o === disc.group) { onSelect(disc.idx); return; }
          o = o.parent;
        }
      }
    };
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.style.cursor = "pointer";

    const doResize = () => {
      const w = mount.clientWidth;
      if (!w) return;
      renderer.setSize(w, H);
      camera.aspect = w / H;
      camera.updateProjectionMatrix();
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(doResize) : null;
    ro?.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      renderer.domElement.removeEventListener("click", onClick);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameId]);

  /* ── Sync lensIdx into running scene ── */
  useEffect(() => {
    lensIdxRef.current = lensIdx;
    if (sceneRef.current) sceneRef.current.lensIdx = lensIdx;
  }, [lensIdx]);

  const navigate = useCallback((dir) => {
    const next = (lensIdx + dir + lensTypes.length) % lensTypes.length;
    onSelect(next);
  }, [lensIdx, lensTypes.length, onSelect]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft")  navigate(-1);
      if (e.key === "ArrowRight") navigate(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const meta = META[lensIdx];
  const lt   = lensTypes[lensIdx];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes lpFill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .lp-bar-fill { transform-origin: left; animation: lpFill 0.65s cubic-bezier(0.23,1,0.32,1) both; }
      `}</style>

      {/* ── 3D lens stage ── */}
      <div style={{ position: "relative" }}>
        <div ref={mountRef} style={{
          width: "100%", height: 240, borderRadius: 16, overflow: "hidden",
          background: "radial-gradient(ellipse at 50% 60%, rgba(20,20,40,0.95) 0%, rgba(4,4,12,1) 100%)",
          border: "1px solid rgba(255,255,255,0.055)",
        }} />

        {/* Spotlight bloom */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 240, height: 240, borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${meta.accent}26 0%, ${meta.accent}0a 45%, transparent 70%)`,
          pointerEvents: "none", transition: "background 0.5s ease", filter: "blur(14px)",
        }} />

        {/* Tag */}
        <div style={{
          position: "absolute", top: 11, left: 11,
          padding: "3px 10px", borderRadius: 6,
          background: `${meta.accent}18`, border: `1px solid ${meta.accent}35`,
          fontSize: 9, fontWeight: 700, letterSpacing: 2,
          textTransform: "uppercase", color: meta.accent, transition: "all 0.3s",
        }}>{meta.tag}</div>

        {/* Left arrow */}
        <button onClick={() => navigate(-1)} style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
          color: "rgba(255,255,255,0.7)", fontSize: 14, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s", lineHeight: 1,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.45)";       e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}>
          ‹
        </button>

        {/* Right arrow */}
        <button onClick={() => navigate(1)} style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
          color: "rgba(255,255,255,0.7)", fontSize: 14, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s", lineHeight: 1,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.45)";       e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}>
          ›
        </button>

        {/* Floating label */}
        <div style={{
          position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
          padding: "4px 14px", borderRadius: 20,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
          border: `1px solid ${meta.accent}30`,
          fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
          color: meta.accent, whiteSpace: "nowrap", transition: "color 0.3s",
        }}>
          {lt.name}
          <span style={{ marginLeft: 10, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", opacity: 0.55, color: "#fff" }}>
            {lt.price === 0 ? "included" : `+₱${lt.price}`}
          </span>
        </div>

        {/* Dot indicators */}
        <div style={{
          position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 5, alignItems: "center",
        }}>
          {lensTypes.map((_, i) => (
            <button key={i} onClick={() => onSelect(i)} style={{
              width: lensIdx === i ? 18 : 6, height: 6, borderRadius: 3,
              border: "none", padding: 0, cursor: "pointer",
              background: lensIdx === i ? meta.accent : "rgba(255,255,255,0.18)",
              transition: "all 0.35s cubic-bezier(0.23,1,0.32,1)",
              boxShadow: lensIdx === i ? `0 0 8px ${meta.accent}66` : "none",
            }} />
          ))}
        </div>
      </div>

      {/* ── Spec + detail panel ── */}
      <div style={{
        marginTop: 10, padding: "16px 18px", borderRadius: 14,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.055)",
      }}>
        <div key={barKey} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {[
            { label: "UV Protection",    val: meta.uv },
            { label: "Blue Light Block", val: meta.blueLight },
            { label: "Glare Reduction",  val: meta.glare },
          ].map((spec, si) => (
            <div key={si}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 9, opacity: 0.55, textTransform: "uppercase", letterSpacing: 1.3, fontWeight: 700 }}>{spec.label}</span>
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", opacity: 0.7 }}>{spec.val}%</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div className="lp-bar-fill" style={{
                  height: "100%", borderRadius: 2, width: `${spec.val}%`,
                  background: `linear-gradient(90deg, ${meta.accent}55, ${meta.accent})`,
                  animationDelay: `${si * 0.08}s`,
                }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {meta.features.map((f, fi) => (
            <span key={fi} style={{
              fontSize: 10, padding: "4px 10px", borderRadius: 20,
              background: `${meta.accent}14`, border: `1px solid ${meta.accent}28`,
              color: meta.accent, fontWeight: 600, letterSpacing: 0.3,
            }}>{f}</span>
          ))}
        </div>

        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
          <span style={{ fontSize: 8, opacity: 0.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginRight: 7 }}>Best for</span>
          <span style={{ opacity: 0.6 }}>{meta.use}</span>
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.48, lineHeight: 1.55 }}>{lt.desc}</p>
      </div>
    </div>
  );
}