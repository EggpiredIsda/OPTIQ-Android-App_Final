import { useState } from "react";

const hex = (n) =>
  n === 0xffffff
    ? null
    : `#${n.toString(16).padStart(6, "0")}`;

/* Given a frame hex color, derive a rich gradient for the panel */
function panelGradient(frameHex, accentHex, isOriginal) {
  if (isOriginal) {
    return "linear-gradient(135deg, #1a1a2e 0%, #2a2a3e 40%, #1a1a2e 100%)";
  }
  const f = frameHex;
  const a = accentHex;
  return `linear-gradient(135deg, ${f}ee 0%, ${f}cc 35%, ${a}88 65%, ${f}99 100%)`;
}

/* Sheen sweep — simulates light catching the material */
function sheenGradient(matIdx) {
  // matIdx: 0 = HDPE (matte), 1 = PET (semi-gloss), 2 = Bio-PLA (silky)
  const opacity = [0.06, 0.14, 0.22][matIdx] ?? 0.10;
  return `linear-gradient(105deg, transparent 30%, rgba(255,255,255,${opacity}) 50%, transparent 70%)`;
}

export default function ColorPicker({ colors, colorIdx, onSelect, frameIsGLB, matIdx = 0 }) {
  const [hoverId, setHoverId] = useState(null);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes cpSheen {
          0%   { background-position: -200% center; }
          100% { background-position:  300% center; }
        }
        @keyframes cpReveal {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .cp-sheen {
          background-size: 200% 100%;
          animation: cpSheen 3.2s ease-in-out infinite;
        }
        .cp-name-reveal {
          animation: cpReveal 0.35s cubic-bezier(0.23,1,0.32,1) both;
        }
      `}</style>

      <div style={{
        borderRadius: 16, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.07)",
        display: "flex", flexDirection: "column",
      }}>
        {colors.map((c, i) => {
          const isSel  = colorIdx === i;
          const isHov  = hoverId === i && !isSel;
          const isOrig = c.frame === 0xffffff;
          const fHex   = hex(c.frame) || "#e0e0e0";
          const aHex   = hex(c.accent) || "#ffffff";

          const panelH = isSel ? 148 : isHov ? 58 : 46;
          const bgGrad = panelGradient(fHex, aHex, isOrig);

          return (
            <button
              key={i}
              onMouseEnter={() => setHoverId(i)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onSelect(i)}
              style={{
                position: "relative", overflow: "hidden",
                height: panelH, minHeight: panelH,
                border: "none", cursor: "pointer",
                background: bgGrad,
                borderTop: i > 0 ? "1px solid rgba(0,0,0,0.25)" : "none",
                transition: "height 0.45s cubic-bezier(0.23,1,0.32,1), min-height 0.45s cubic-bezier(0.23,1,0.32,1)",
                display: "flex", flexDirection: "column",
                justifyContent: "flex-end", alignItems: "flex-start",
                padding: isSel ? "16px 20px" : "0 20px",
                textAlign: "left",
              }}
            >
              {/* Material sheen sweep — only on selected */}
              {isSel && (
                <div className="cp-sheen" style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  backgroundImage: sheenGradient(matIdx),
                }} />
              )}

              {/* Subtle noise texture overlay */}
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
                backgroundRepeat: "repeat", backgroundSize: "180px",
                opacity: 0.6,
              }} />

              {/* Selected indicator bar on left */}
              {isSel && (
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: 3, background: "rgba(255,255,255,0.7)",
                  borderRadius: "0 2px 2px 0",
                }} />
              )}

              {/* Collapsed: just color name inline */}
              {!isSel && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", height: "100%",
                  paddingTop: 0,
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)",
                    letterSpacing: 0.5, lineHeight: 1,
                  }}>{c.name}</span>
                  {isHov && (
                    <span style={{
                      fontSize: 9, opacity: 0.7, letterSpacing: 1.5,
                      textTransform: "uppercase", color: "#fff",
                    }}>Select</span>
                  )}
                </div>
              )}

              {/* Expanded: full color story */}
              {isSel && (
                <div className="cp-name-reveal" style={{ position: "relative", zIndex: 1, width: "100%" }}>
                  {/* Color name — big editorial type */}
                  <div style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 28, fontWeight: 600, lineHeight: 1,
                    color: "#fff",
                    textShadow: "0 2px 12px rgba(0,0,0,0.4)",
                    marginBottom: 10,
                    letterSpacing: "-0.02em",
                  }}>
                    {c.name}
                  </div>

                  {/* Bottom row: hex + material note */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Color dot */}
                      <div style={{
                        width: 12, height: 12, borderRadius: "50%",
                        background: isOrig
                          ? "linear-gradient(135deg, #ccc, #fff, #ddd)"
                          : fHex,
                        border: "1.5px solid rgba(255,255,255,0.3)",
                        flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                        opacity: 0.65, color: "#fff", letterSpacing: 0.5,
                      }}>
                        {isOrig ? "original" : fHex.toUpperCase()}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 9, opacity: 0.6, letterSpacing: 1.5,
                      textTransform: "uppercase", color: "#fff",
                    }}>
                      {isOrig ? "Design colours" : "No extra cost"}
                    </span>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Accent swatch strip below */}
      <div style={{
        marginTop: 8, display: "flex", gap: 4,
        justifyContent: "center", alignItems: "center",
      }}>
        {colors.map((c, i) => {
          const isSel = colorIdx === i;
          const fHex  = hex(c.frame) || "#e0e0e0";
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              style={{
                width: isSel ? 28 : 8, height: 8,
                borderRadius: 4, border: "none", padding: 0, cursor: "pointer",
                background: c.frame === 0xffffff
                  ? "linear-gradient(90deg, #ccc, #fff, #ddd)"
                  : fHex,
                transition: "all 0.4s cubic-bezier(0.23,1,0.32,1)",
                boxShadow: isSel ? `0 0 10px ${fHex}88` : "none",
                opacity: isSel ? 1 : 0.45,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
