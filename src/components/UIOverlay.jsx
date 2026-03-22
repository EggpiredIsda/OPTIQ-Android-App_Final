import React from 'react';

const STEPS = ['Frame', 'Material', 'Lens', 'Colour', 'Size', 'Summary'];

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((res, rej) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy') ? res() : rej(); }
    catch (e) { rej(e); }
    finally { document.body.removeChild(ta); }
  });
}

export default function UIOverlay({
  frames, frameIdx, setFrameIdx,
  matIdx, setMatIdx, lensIdx, setLensIdx,
  colorIdx, setColorIdx, sizeIdx, setSizeIdx,
  step, setStep,
  materials, lensTypes, sizes,
  totalPrice, frame, material, lens, color, size,
  displayToast,
}) {
  const nextStep = () => setStep(Math.min(step + 1, STEPS.length - 1));
  const prevStep = () => setStep(Math.max(step - 1, 0));

  const stepTitles    = ['Choose your frame','Pick your material','Select your lens','Choose your colour','Select your size','Your custom pair'];
  const stepSubtitles = [
    'Each frame is 3D printed from recycled materials to your exact specs.',
    'All materials are sourced from post-consumer waste. Zero virgin plastic.',
    'All lenses are scratch-resistant polycarbonate with UV400 protection.',
    'Pigment is mixed into the filament before printing.',
    '3D printing means every pair can be made to measure.',
    'Review your configuration before ordering.',
  ];

  return (
    <div className="ui-panel">
      <div className="ui-scroll">

        {/* Step header */}
        <div className="step-header">
          <div>
            <span className="step-num-label">Step {step + 1} of {STEPS.length}</span>
            <div className="step-title">{stepTitles[step]}</div>
            <div className="step-sub">{stepSubtitles[step]}</div>
          </div>
          <div className="step-right">
            <div className="step-dots">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  className={`step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
                  onClick={() => setStep(i)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="step-content" key={step}>

          {/* STEP 0 — Frame */}
          {step === 0 && (
            <>
              <div className="frame-list">
                {frames.map((f, i) => (
                  <div
                    key={f.id}
                    className={`frame-item ${frameIdx === i ? 'active' : ''}`}
                    onClick={() => setFrameIdx(i)}
                  >
                    <div className="frame-left">
                      <div className="frame-indicator" />
                      <div>
                        <span className="frame-name">{f.name}</span>
                        <span className="frame-tag">{f.category}</span>
                      </div>
                    </div>
                    <span className="frame-price">₱{f.basePrice}</span>
                  </div>
                ))}
              </div>
              <div className="frame-hint">Tap to select</div>
            </>
          )}

          {/* STEP 1 — Material */}
          {step === 1 && materials.map((mt, i) => (
            <button
              key={mt.id}
              className={`opt-card ${matIdx === i ? 'selected' : ''}`}
              onClick={() => setMatIdx(i)}
            >
              <div className="opt-card-top">
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:16 }}>{mt.icon}</span>
                  <span className="opt-card-name">{mt.name}</span>
                  <span className="opt-card-tag">{mt.tag}</span>
                </div>
                <span className="opt-card-price">{mt.price === 0 ? 'included' : `+₱${mt.price}`}</span>
              </div>
              <div className="opt-card-desc">{mt.desc}</div>
              <div className="opt-card-eco">{mt.co2}</div>
            </button>
          ))}

          {/* STEP 2 — Lens */}
          {step === 2 && lensTypes.map((lt, i) => (
            <button
              key={lt.id}
              className={`opt-card ${lensIdx === i ? 'selected' : ''}`}
              onClick={() => setLensIdx(i)}
            >
              <div className="opt-card-top">
                <span className="opt-card-name">{lt.name}</span>
                <span className="opt-card-price">{lt.price === 0 ? 'included' : `+₱${lt.price}`}</span>
              </div>
              <div className="opt-card-desc">{lt.desc}</div>
            </button>
          ))}

          {/* STEP 3 — Colour */}
          {step === 3 && (
            <>
              <div className="color-swatches">
                {frame.colors.map((c, i) => (
                  <div key={c.name} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                    <button
                      className={`color-swatch ${colorIdx === i ? 'selected' : ''}`}
                      style={{ background: c.hex }}
                      onClick={() => setColorIdx(i)}
                    />
                    <span style={{ fontSize:10, opacity:0.4 }}>{c.name}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:12, opacity:0.35, lineHeight:1.6 }}>
                Pigment is mixed into the filament before printing.
              </p>
            </>
          )}

          {/* STEP 4 — Size */}
          {step === 4 && (
            <div className="size-grid">
              {sizes.map((sz, i) => (
                <button
                  key={sz.id}
                  className={`opt-card ${sizeIdx === i ? 'selected' : ''}`}
                  onClick={() => setSizeIdx(i)}
                >
                  <div className="opt-card-top">
                    <span className="opt-card-name">{sz.name}</span>
                  </div>
                  <div className="opt-card-desc">{sz.fit} · Total width: {sz.width}</div>
                </button>
              ))}
              <p style={{ fontSize:11, opacity:0.25, lineHeight:1.6, textAlign:'center' }}>
                In a future update, our AI face scanner will recommend the perfect fit automatically.
              </p>
            </div>
          )}

          {/* STEP 5 — Summary */}
          {step === 5 && (
            <>
              <div className="summary-rows">
                {[
                  { label:'Frame',    val:frame.name,                           price:`₱${frame.basePrice}` },
                  { label:'Material', val:`${material.name} (${material.tag})`, price: material.price === 0 ? 'included' : `+₱${material.price}` },
                  { label:'Lens',     val:lens.name,                            price: lens.price === 0 ? 'included' : `+₱${lens.price}` },
                  { label:'Colour',   val:color.name,                           price:'included' },
                  { label:'Size',     val:`${size.name} (${size.width})`,       price:'included' },
                ].map((row) => (
                  <div key={row.label} className="summary-row">
                    <div className="summary-row-left">
                      <div className="summary-row-label">{row.label}</div>
                      <div className="summary-row-val">{row.val}</div>
                    </div>
                    <div className="summary-row-price">{row.price}</div>
                  </div>
                ))}
              </div>

              <div className="eco-box">
                <div className="eco-box-title">Environmental Impact</div>
                <div className="eco-box-text">
                  Your pair uses approximately 15g of recycled plastic, diverting ~12 bottle caps from landfill. {material.co2}.
                </div>
              </div>

              <div className="total-row">
                <span className="total-label">Total</span>
                <span className="total-price">₱{totalPrice.toLocaleString()}</span>
              </div>

              <button className="btn-order" onClick={() => displayToast('Preparing checkout…')}>
                Order Custom Pair
              </button>

              <button
                onClick={() => {
                  const txt = `${frame.name} | ${material.name} | ${lens.name} | ${color.name} | ${size.name} | ₱${totalPrice}`;
                  copyToClipboard(txt)
                    .then(() => displayToast('Specs copied'))
                    .catch(() => displayToast('Copy failed'));
                }}
                style={{
                  background:'none', border:'none',
                  color:'rgba(255,255,255,0.3)', fontSize:11,
                  cursor:'pointer', letterSpacing:1, textTransform:'uppercase',
                  fontFamily:'var(--font-body)', padding:'4px 0',
                }}
              >
                Copy Specs
              </button>
            </>
          )}

          {/* Back / Next */}
          <div className="step-nav">
            {step > 0 && (
              <button className="btn-back" onClick={prevStep}>Back</button>
            )}
            {step < STEPS.length - 1 && (
              <button className="btn-next" onClick={nextStep}>
                Next: {STEPS[step + 1]}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
