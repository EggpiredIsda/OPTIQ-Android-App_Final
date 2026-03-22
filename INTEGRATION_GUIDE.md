# OPTIQ Android App - Integration Guide

## 📦 New Enhanced Components (Steps 1-3)

This guide shows how to integrate the three new enhanced components into your existing OPTIQ Android App.

---

## **Step 1: Install Dependencies**

✅ Already done in `package.json`. Run:

```bash
npm install
```

New dependencies added:
- `@mediapipe/tasks-vision` (Face detection & tracking)
- `groq-sdk` (AI chatbot - future backend integration)

---

## **Step 2: Replace Components in App.jsx**

Update your `src/App.jsx` to use the new enhanced components:

### **Before:**
```jsx
import ARTryOn from './components/ARTryOn';
import AIScanner from './components/AIScanner';
// ...
<ARTryOn displayToast={displayToast} />
<AIScanner displayToast={displayToast} />
```

### **After:**
```jsx
import ARTryOn from './components/ARTryOn_Enhanced';
import FitScanner from './components/FitScanner_Enhanced';
import AIChatbot from './components/AIChatbot_Enhanced';
// ...
<ARTryOn displayToast={displayToast} initialFrameId="wayfarer" initialColorIdx={0} />
<FitScanner displayToast={displayToast} onApplyFit={handleApplyFit} />
<AIChatbot />
```

---

## **Component Details**

### 🎬 **1. ARTryOn_Enhanced.jsx** (Real-time AR Try-On)

**What it does:**
- Real-time face detection using MediaPipe Face Landmarker
- 3D glasses rendering on detected face
- One Euro Filter for smooth motion tracking
- Frame & color selection
- Three.js rendering

**Features:**
- ✅ Procedurally generated glasses (Wayfarer & Aviator)
- ✅ Smooth face pose estimation (roll, yaw, pitch, scale, position)
- ✅ Real-time video feed with glasses overlay
- ✅ Frame & color chooser UI

**Props:**
```jsx
<ARTryOn 
  displayToast={fn}           // Toast notification callback
  initialFrameId="wayfarer"   // Starting frame ("wayfarer" | "aviator")
  initialColorIdx={0}         // Starting color index (0-2)
/>
```

**Status Flow:**
```
loading → ready → (camera active, face detected) → rendering glasses
```

---

### 📏 **2. FitScanner_Enhanced.jsx** (AI Face Measurement)

**What it does:**
- Precise facial measurement using MediaPipe Face Mesh
- Automatic size recommendation (Small/Medium/Large)
- Face shape detection (round/square/oval/oblong)
- Frame style recommendations
- Manual IPD calibration option

**Features:**
- ✅ Real-time face measurements (width, height, bridge, cheek)
- ✅ Automatic scaling using iris diameter (~11.7mm reference)
- ✅ Face shape classification
- ✅ Smart frame recommendations based on face shape
- ✅ Countdown animation before scanning
- ✅ Progress ring animation

**Props:**
```jsx
<FitScanner 
  displayToast={fn}                // Toast callback
  onApplyFit={(data) => {
    // data = { measurements, recommendation, manualIPD }
    console.log(data.recommendation.size); // "Small" | "Medium" | "Large"
    console.log(data.measurements.faceWidth); // mm
  }}
/>
```

**Status Flow:**
```
idle → loading → ready → countdown (3...2...1) → scanning → complete
```

**Measurements Output:**
```javascript
{
  faceWidth: 142,      // temple to temple (mm)
  faceHeight: 205,     // forehead to chin (mm)
  bridgeWidth: 34,     // inner eye corner to inner eye corner (mm)
  cheekWidth: 156,     // cheekbone to cheekbone (mm)
  faceShape: "square", // "round" | "square" | "oval" | "oblong"
  ratio: "0.69",       // width / height
  mmPerUnit: 0.23      // conversion factor
}
```

---

### 💬 **3. AIChatbot_Enhanced.jsx** (AI Assistant)

**What it does:**
- Floating chat widget with OPTI-BOT personality
- 3D animated glasses icon
- Message history
- Mock responses (ready for Groq/API integration)
- Smooth animations with Framer Motion

**Features:**
- ✅ Floating toggle button with 3D glasses animation
- ✅ Chat window with message history
- ✅ Typing indicators
- ✅ Mobile responsive
- ✅ Keyboard support (Enter to send)

**Props:**
```jsx
<AIChatbot />
```

**Mock Response Categories:**
- Materials (eco-friendly options)
- Lens types (Clear, Blue Light Filter, etc.)
- Fit & sizing recommendations
- Pricing information
- Shipping & delivery

**To Connect Real API (Future Step 4):**
Replace the `generateResponse()` function with actual API call:

```jsx
const handleSendMessage = async (e) => {
  e.preventDefault();
  const userMessage = { role: 'user', content: input };
  setMessages(prev => [...prev, userMessage]);
  setInput('');
  setIsLoading(true);

  try {
    const res = await fetch('YOUR_CLOUDFLARE_WORKER_URL', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, userMessage }),
    });
    
    const data = await res.json();
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
  } catch (error) {
    console.error(error);
  } finally {
    setIsLoading(false);
  }
};
```

---

## **File Structure (After Integration)**

```
src/
├── components/
│   ├── ARTryOn_Enhanced.jsx         ← NEW (replaces ARTryOn.jsx)
│   ├── FitScanner_Enhanced.jsx      ← NEW (replaces AIScanner.jsx)
│   ├── AIChatbot_Enhanced.jsx       ← NEW (add to app root)
│   ├── AIChatbot.css                ← NEW (styles for chatbot)
│   ├── ModelViewer.jsx              (existing 3D viewer)
│   ├── GlassesModel.jsx             (existing model loader)
│   ├── BottomNav.jsx                (update tab labels)
│   ├── UIOverlay.jsx                (existing configurator)
│   └── ImpactPage.jsx               (existing)
├── App.jsx                          ← UPDATE imports
├── index.css                        (existing)
└── main.jsx                         (existing)
```

---

## **Integration Checklist**

- [ ] Run `npm install`
- [ ] Update `src/App.jsx` imports (switch to `_Enhanced` versions)
- [ ] Test **ARTryOn_Enhanced** with camera (Firefox/Edge recommended; Chrome requires HTTPS)
- [ ] Test **FitScanner_Enhanced** scanning workflow
- [ ] Test **AIChatbot_Enhanced** message sending
- [ ] Update BottomNav tab labels if needed
- [ ] Handle `onApplyFit` callback to populate frame/size recommendations
- [ ] (Optional) Update CSS variables if your app uses different theming

---

## **Performance Notes**

1. **MediaPipe Model Loading**: First load ~15-20MB (cached after)
2. **Face Detection**: 30-60 FPS on modern devices
3. **Three.js Rendering**: Optimized for mobile (60 FPS target)
4. **Bundle Size**: +~2MB with MediaPipe (versioned CDN, not bundled)

---

## **Browser Compatibility**

| Feature | Chrome | Firefox | Safari | Mobile |
|---------|--------|---------|--------|--------|
| MediaPipe | ✅ HTTPS | ✅ HTTPS | ✅ iOS 14+ | ✅ |
| Three.js | ✅ | ✅ | ✅ | ✅ |
| WebGL | ✅ | ✅ | ✅ | ✅ |
| Camera API | ✅ HTTPS | ✅ HTTPS | ✅ iOS 14.5+ | ⚠️ |

**Note:** Camera access requires HTTPS in production or localhost in development.

---

## **Common Issues & Solutions**

### ❌ "MediaPipe model failed to load"
- Check internet connection (model is ~50MB from CDN)
- Ensure HTTPS or localhost
- Check browser console for CORS errors

### ❌ "No face detected"
- Ensure good lighting
- Face should be centered in frame
- Device should have working camera
- Allow camera permissions

### ❌ "Three.js not rendering"
- Disable hardware acceleration temporarily
- Check browser console for WebGL errors
- Update graphics drivers

### ❌ "App crashes after frame selection"
- Ensure Three.js resources are disposed properly
- Check memory usage (might need garbage collection)

---

## **Next Steps (Beyond Scope)**

The following require additional setup:

1. **Backend API Integration** (Step 4)
   - Cloudflare Worker setup
   - Groq API key configuration
   - Database for user preferences

2. **Payment Integration**
   - Stripe configuration
   - Order management

3. **Analytics**
   - Vercel Analytics setup
   - Conversion tracking

---

## **Support**

For issues or questions about these components, refer to:
- MediaPipe Docs: https://developers.google.com/mediapipe
- Three.js Docs: https://threejs.org/docs
- Framer Motion: https://www.framer.com/motion/introduction/

Good luck with your OPTIQ app! 🎉
