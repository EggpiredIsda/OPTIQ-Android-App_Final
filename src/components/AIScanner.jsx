import React, { useState } from 'react';

export default function AIScanner({ displayToast }) {
  const [scanning, setScanning] = useState(false);

  const handleScan = () => {
    displayToast('Camera access required');
    setScanning(true);
    setTimeout(() => setScanning(false), 3000);
  };

  return (
    <div className="feature-page">
      <p className="feature-eyebrow">AI-Powered</p>
      <div className="feature-title">Face Fit Scanner</div>
      <p className="feature-desc">
        Our AI measures your face in real-time using MediaPipe Iris detection to recommend the perfect frame size and style. No optician visit needed.
      </p>

      <div className="camera-frame">
        <div style={{
          width:56, height:56, borderRadius:'50%',
          border:'1.5px solid rgba(111,207,151,0.3)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6fcf97" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="7" strokeDasharray="2 4" />
          </svg>
        </div>
        <p className="camera-label">
          {scanning ? 'Scanning…' : 'Position your face in front of the camera'}
        </p>
      </div>

      <div className="scan-btn-wrap">
        <button
          style={{
            width:'100%', padding:'16px 0',
            background:'rgba(255,255,255,0.85)', color:'#111',
            border:'none', borderRadius:10,
            fontFamily:'var(--font-body)', fontSize:12, fontWeight:600,
            letterSpacing:'1.5px', textTransform:'uppercase', cursor:'pointer',
          }}
          onClick={handleScan}
        >
          {scanning ? 'Scanning…' : 'Start Scan'}
        </button>
      </div>

      <p style={{ fontSize:11, opacity:0.25, textAlign:'center', lineHeight:1.6 }}>
        Measurement accuracy ±1mm · Works in good lighting.<br />
        No images are stored or transmitted.
      </p>
    </div>
  );
}
