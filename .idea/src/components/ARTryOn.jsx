import React from 'react';

export default function ARTryOn({ displayToast }) {
  return (
    <div className="feature-page">
      <p className="feature-eyebrow">Augmented Reality</p>
      <div className="feature-title">Virtual Try-On</div>
      <p className="feature-desc">
        See each frame on your face in real-time. Powered by MediaPipe Face Mesh with 468-point tracking.
      </p>
      <div className="camera-frame">
        <div className="face-outline">
          <div className="eye-row">
            <div className="eye-dot" />
            <div className="eye-dot" />
          </div>
          <div className="mouth" />
        </div>
        <p className="camera-label">Position your face in frame</p>
      </div>
      <div className="scan-btn-wrap">
        <button
          style={{ width:'100%', padding:'16px 0', background:'rgba(255,255,255,0.85)', color:'#111', border:'none', borderRadius:10, fontFamily:'var(--font-body)', fontSize:12, fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase', cursor:'pointer' }}
          onClick={() => displayToast('Camera access required')}
        >
          Enable Camera
        </button>
      </div>
      <p style={{ fontSize:11, opacity:0.25, textAlign:'center', lineHeight:1.6 }}>
        AR Try-On requires camera permission.<br />No images are stored or transmitted.
      </p>
    </div>
  );
}
