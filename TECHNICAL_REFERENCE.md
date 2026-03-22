# OPTIQ App - Technical Architecture Reference

## 🏗️ App Components Hierarchy

```
App.jsx (Main)
├── 🖼️ ModelViewer.jsx
│   └── GlassesModel.jsx (3D model loader)
├── 🎨 UIOverlay.jsx (Configurator)
│   ├── Frame selector
│   ├── Material picker
│   ├── Lens picker
│   ├── Color picker
│   └── Size picker
├── 🧭 BottomNav.jsx (Navigation)
│   ├── Tab 1: Configurator
│   ├── Tab 2: AR Try-On ← NEW ARTryOn_Enhanced
│   ├── Tab 3: AI Scanner ← NEW FitScanner_Enhanced
│   └── Tab 4: Impact
├── 📊 ImpactPage.jsx
└── 💬 AIChatbot_Enhanced.jsx ← NEW (Floating widget)
```

---

## 📡 Data Flow Architecture

### **Configuration State** (Shared via App.jsx)
```
App State
├── frameIdx ──→ UIOverlay, ARTryOn, ModelViewer
├── matIdx ────→ UIOverlay, ModelViewer
├── lensIdx ───→ UIOverlay, ModelViewer
├── colorIdx ──→ UIOverlay, ARTryOn
├── sizeIdx ───→ UIOverlay
└── step ──────→ UIOverlay (6-step flow)
```

### **AR Try-On Flow**
```
VideoInput
    ↓
MediaPipeDetector
    ↓
FacePose(468 landmarks)
    ↓
OneEuroFilter (smooth)
    ↓
GlassesModel Transform
    ↓
Three.js Render
    ↓
VideoOutput (overlay)
```

### **Fit Scanner Flow**
```
VideoInput
    ↓
MediaPipeDetector (Face Mesh)
    ↓
Measurement Calculation
    ├── Face width (temple to temple)
    ├── Face height (forehead to chin)
    ├── Bridge width (inner eyes)
    └── Cheek width (outer cheeks)
    ↓
Size Recommendation (S/M/L)
    ↓
Frame Suggestion (based on face shape)
    ↓
Return { measurements, recommendation }
    ↓
onApplyFit callback (update configurator)
```

### **Chatbot Flow**
```
User Input
    ↓
Generate Response (mock or API)
    ↓
Add to Message History
    ↓
Display in Chat Window
    ↓
Store Session State
```

---

## 🔄 State Management Pattern

### **App.jsx Manages**:
- `frameIdx`, `matIdx`, `lensIdx`, `colorIdx`, `sizeIdx` → Configuration state
- `step` → UI flow state
- Pass down as props to children

### **Each Component Manages**:
- **ARTryOn**: `frameIdx`, `colorIdx`, `faceDetected`, `cameraError`, `status`
- **FitScanner**: `status`, `measurements`, `recommendation`, `countdownValue`
- **AIChatbot**: `isOpen`, `messages`, `input`, `isLoading`

### **Cross-Component Communication**:
```jsx
// FitScanner → App → UIOverlay/ModelViewer
const onApplyFit = (fitData) => {
  setSizeIdx(fitData.recommendation.sizeIdx);
  setFrameIdx(fitData.recommendation.frameIdx);
};

// ARTryOn → keeps local state, but could update App via callback
const handleFrameChange = (frameIdx) => {
  // Option: Pass up to parent if needed
  // For now, updates locally only (independent AR experience)
};
```

---

## 🧮 MediaPipe Face Landmarks Map

### **What FitScanner Uses**:
```
Landmark #6    (nose bridge)
Landmark #10   (forehead top)
Landmark #33   (left eye outer)
Landmark #46   (left brow outer)
Landmark #127  (left cheek)
Landmark #133  (left eye inner)
Landmark #152  (chin bottom)
Landmark #234  (left temple)
Landmark #263  (right eye outer)
Landmark #276  (right brow outer)
Landmark #356  (right cheek)
Landmark #362  (right eye inner)
Landmark #454  (right temple)

+ Iris landmarks [468-477] (auto-calibration)
```

### **Measurement Calculations**:
```javascript
faceWidth = distance(leftTemple, rightTemple) × mmPerUnit
faceHeight = distance(forehead, chin) × mmPerUnit
bridgeWidth = distance(leftEyeInner, rightEyeInner) × mmPerUnit
cheekWidth = distance(leftCheek, rightCheek) × mmPerUnit
```

### **mmPerUnit Calibration**:
```
Option 1: avgIrisDiameter = 11.7mm (reliable)
Option 2: manualIPD input (most accurate)
Option 3: eyeOuterDistance = 85mm (fallback)
```

---

## 🎨 Three.js Rendering Pipeline

### **ARTryOn Rendering**:
```
Setup
├── Canvas (DOM insertion)
├── WebGLRenderer (alpha, antialias)
├── PerspectiveCamera (60° FOV)
├── Scene
│   ├── AmbientLight (1.2x)
│   ├── DirectionalLight (1.5x from 5,5,5)
│   └── GlassesModel (procedural)
└── requestAnimationFrame loop

Per Frame
├── Detect face landmarks
├── Apply One Euro Filter smoothing
├── Update glasses transform
│   ├── Position (px, py)
│   ├── Scale (based on face width)
│   ├── Rotation (yaw, pitch, roll)
│   └── Depth (z-offset)
└── render(scene, camera)
```

### **Glasses Model Creation**:
```
buildWayfarer() / buildAviator()
├── Linear paths (curves, tubes, geometries)
├── Materials
│   ├── Frame: MeshPhysicalMaterial (metallic)
│   ├── Lens: MeshPhysicalMaterial (transparent, IOR 1.5)
│   └── Hinges: MeshPhysicalMaterial (shiny accent)
├── Mesh creation (TubeGeometry, ShapeGeometry, ExtrudeGeometry)
├── Tagging (userData.partName for future modifications)
└── Grouping (THREE.Group for unified transform)
```

---

## 🎬 Face Detection Pipeline

### **MediaPipe Initialization**:
```javascript
FilesetResolver.forVisionTasks(WASM_URL)
    ↓
FaceLandmarker.createFromOptions({
  baseOptions: { modelAssetPath, delegate: "GPU" },
  runningMode: "VIDEO",
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
  numFaces: 1,
})
```

### **Per Video Frame Detection**:
```
video element (HTML5 video)
    ↓
faceLandmarker.detectForVideo(video, timestamp)
    ↓
results = {
  faceLandmarks: [[x,y,z], ...],           // 468 points
  facialTransformationMatrixes: [4x4 matrix],
  faceBlendshapes: [...],                  // Facial expressions
}
    ↓
Extract pose from landmarks + matrix
```

---

## 📊 Performance Considerations

### **Memory Usage**:
```
MediaPipe Model:  ~50 MB (downloaded once, cached)
Three.js Scene:   ~5-10 MB (models, textures)
Video Buffer:     ~2-4 MB (local processing only)
React State:      ~1 MB (all states)
─────────────────
Total:            ~60-65 MB initial, ~10 MB steady
```

### **CPU/GPU Usage**:
```
Face Detection:   ~30-50 ms per frame (mostly GPU)
Three.js Render:  ~15-30 ms per frame (GPU)
React Re-renders: ~5-10 ms (occasional)
─────────────────
Target:           60 FPS (~16.67 ms budget)
```

### **Network**:
```
MediaPipe WASM:   ~15 MB (first load, cached)
Google CDN:       Fast + auto-caching
Per-session:      0 KB (client-side only)
```

---

## 🎯 Browser API Requirements

### **ARTryOn_Enhanced**:
- ✅ `getUserMedia()` (camera permission)
- ✅ `requestAnimationFrame()` (animation loop)
- ✅ `WebGL2` (Three.js rendering)
- ✅ `Worker` (optional, for MediaPipe)

### **FitScanner_Enhanced**:
- ✅ `getUserMedia()` (camera)
- ✅ `requestAnimationFrame()`
- ✅ `SVG` (scan ring animation)
- ✅ Canvas (optional, for visualization)

### **AIChatbot_Enhanced**:
- ✅ `WebGL` (Three.js glasses icon)
- ✅ `requestAnimationFrame()` (rotation)
- ✅ `Fetch API` (future backend calls)

---

## 🔒 Privacy & Security

### **Data Processing**:
```
User's Face (video stream)
    ↓
Local MediaPipe Processing (in browser)
    ↓
Measurements (numbers only)
    ↓
Stored locally (Session/IndexedDB if desired)
    ✅ NOT sent to servers (client-side only)
    ✅ Face image NOT stored
    ✅ No analytics tracking (optional)
```

### **Permissions**:
- Camera access: User grants at browser level
- Microphone: NOT requested (chat uses text only)
- Location: NOT requested
- Storage: Optional (localStorage for preferences)

---

## 🚀 Build & Deployment

### **For Web**:
```bash
npm run build
# Creates dist/ folder (static files)
# Deploy to Vercel, AWS S3, GitHub Pages, etc.
```

### **For Capacitor/Android**:
```bash
npm run build
npx cap sync android
# Builds APK with embedded web app
# MediaPipe models loaded from CDN at runtime
```

### **Environment Variables** (if adding backend):
```env
VITE_WORKER_URL=https://your_worker.workers.dev
VITE_STRIPE_KEY=pk_test_...
VITE_GROQ_API_KEY=... (client-side, public key)
```

---

## 📝 Integration Checklist

### **Phase 1: Setup**
- [ ] `npm install` (install dependencies)
- [ ] Update imports in `App.jsx`
- [ ] Test each component individually

### **Phase 2: Testing**
- [ ] ARTryOn detects face correctly
- [ ] FitScanner produces accurate measurements
- [ ] AIChatbot opens/closes smoothly
- [ ] No console errors

### **Phase 3: Integration**
- [ ] Connect `onApplyFit` callback to update configurator
- [ ] Ensure state updates propagate correctly
- [ ] BottomNav tabs render all components

### **Phase 4: Optimization** (Optional)
- [ ] Lazy-load MediaPipe model on first use
- [ ] Implement service worker caching
- [ ] Add analytics (Vercel Analytics)
- [ ] Compress 3D model files

---

## 🔗 External Resources

### **MediaPipe**:
- Documentation: https://developers.google.com/mediapipe
- Face Landmarker: https://developers.google.com/mediapipe/solutions/vision/face_landmarker
- Models: https://storage.googleapis.com/mediapipe-models/

### **Three.js**:
- Documentation: https://threejs.org/docs
- Examples: https://threejs.org/examples
- Cookbook: https://threejs.org/manual/

### **React/Framer Motion**:
- React Hooks: https://react.dev/reference/react
- Framer Motion: https://www.framer.com/motion/

---

## 💡 Advanced Customization Examples

### **Add Custom Glasses Frame**:
```javascript
// Create geometry function
function buildCustomFrame(color, matPbr) {
  const g = new THREE.Group();
  // ... create meshes ...
  return g;
}

// Add to AR_FRAMES
AR_FRAMES.push({
  id: "custom",
  name: "My Custom Frame",
  build: buildCustomFrame,
  colors: [{ name: "Black", frame: 0x000000, ... }],
});
```

### **Extend FitScanner Recommendations**:
```javascript
function getRecommendation(m) {
  // m = { faceWidth, faceHeight, faceShape, bridgeWidth, cheekWidth }
  
  // Your custom logic
  const customRec = analyzeCustomMetrics(m);
  
  return { size, sizeIdx, frameIdx, frameName, reason };
}
```

### **Connect Real Chatbot API**:
```javascript
// In AIChatbot_Enhanced.jsx
const WORKER_URL = process.env.VITE_WORKER_URL;

const handleSendMessage = async (e) => {
  // ... existing code ...
  
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [...messages, userMessage] }),
  });
  
  const data = await res.json();
  setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
};
```

---

This is the complete technical architecture! 🎯
