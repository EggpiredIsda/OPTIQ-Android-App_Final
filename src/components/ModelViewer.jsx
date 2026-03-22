import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import * as THREE from 'three';
import GlassesModel from './GlassesModel';

function LoadingRing() {
  return (
    <mesh>
      <torusGeometry args={[0.4, 0.025, 12, 48]} />
      <meshStandardMaterial color="#6fcf97" emissive="#6fcf97" emissiveIntensity={0.5} />
    </mesh>
  );
}

function ModelErrorFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 0.3, 0.1]} />
      <meshStandardMaterial color="#ff6b6b" wireframe />
    </mesh>
  );
}

/**
 * Ensures the glasses always fit within the screen.
 * Scales the model based on screen size and bounding box.
 */
function AutoFitCamera({ modelUrl, orbitRef }) {
  const { camera, scene, size: canvasSize } = useThree();
  const fitted = useRef(null);

  useEffect(() => {
    // Only re-fit if the model URL or canvas size changes
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Calculate aspect ratio
    const aspect = canvasSize.width / canvasSize.height;

    // Calculate required distance based on FOV and object size
    const fov = camera.fov * (Math.PI / 180);
    let dist = (maxDim / 2) / Math.tan(fov / 2);

    // Adjust distance for aspect ratio to prevent clipping on narrow screens
    if (aspect < 1) {
      dist = dist / aspect;
    }

    // Add 40% padding to ensure no overflow or clipping
    dist *= 1.4;

    camera.position.set(center.x, center.y, center.z + dist);
    camera.lookAt(center);

    if (orbitRef.current) {
      orbitRef.current.target.copy(center);
      orbitRef.current.update();
    }

    fitted.current = modelUrl;
  }, [modelUrl, camera, scene, orbitRef, canvasSize]);

  return null;
}

function ExplodingGroup({ children, exploding }) {
  const groupRef = useRef();
  const t = useRef(0);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (exploding) t.current = Math.min(t.current + delta * 3, 1);
    else           t.current = Math.max(t.current - delta * 3, 0);
    const burst = 1 + Math.sin(t.current * Math.PI) * 0.18;
    groupRef.current.scale.setScalar(burst);
  });
  return <group ref={groupRef}>{children}</group>;
}

export default function ModelViewer({ modelUrl, colorHex, accentHex, matPbr, lensTint, exploded: propExploded, onToggleExplode }) {
  const orbitRef  = useRef();
  const spinRef   = useRef(false);
  const [internalExploded, setInternalExploded] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const exploded = propExploded !== undefined ? propExploded : internalExploded;
  const handleExplode = onToggleExplode || (() => setInternalExploded(v => !v));

  const handleSpin = () => {
    const next = !spinRef.current;
    spinRef.current = next;
    setIsSpinning(next);
    if (orbitRef.current) {
      orbitRef.current.autoRotate = next;
      if (next) {
        orbitRef.current.autoRotateSpeed = 4;
        setTimeout(() => { if (orbitRef.current) orbitRef.current.autoRotateSpeed = 1.2; }, 1500);
      }
    }
  };

  return (
    <div className="canvas-container">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 44 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        dpr={Math.min(window.devicePixelRatio, 1.5)}
        frameloop="always"
        performance={{ min: 0.5 }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 5]}  intensity={1.6} castShadow shadow-mapSize={[512, 512]} />
        <directionalLight position={[-4, 2, 3]} color="#8888ff" intensity={0.4} />
        <directionalLight position={[0, 3, -4]} intensity={0.7} />
        <Environment preset="city" />

        <Suspense fallback={<LoadingRing />}>
          <ErrorBoundary FallbackComponent={ModelErrorFallback}>
            <ExplodingGroup exploding={exploded}>
              <GlassesModel url={modelUrl} />
            </ExplodingGroup>
          </ErrorBoundary>

          {/* Ensures glasses fit on screen and remain centered */}
          <AutoFitCamera modelUrl={modelUrl} orbitRef={orbitRef} />

          <ContactShadows position={[0, -1.2, 0]} opacity={0.1} scale={10} blur={2.5} far={3} color="#000" />
        </Suspense>

        <OrbitControls
          ref={orbitRef}
          enablePan={false}
          enableZoom
          minDistance={1}
          maxDistance={12}
          autoRotate
          autoRotateSpeed={1.0}
          enableDamping
          dampingFactor={0.08}
          onStart={() => { if (orbitRef.current && !spinRef.current) orbitRef.current.autoRotate = false; }}
          onEnd={() => { setTimeout(() => { if (orbitRef.current && !spinRef.current) orbitRef.current.autoRotate = true; }, 2000); }}
        />
      </Canvas>

      <div className="canvas-hint">Drag to rotate · Pinch to zoom</div>

      <div className="canvas-overlay-btns">
        <button className={`canvas-btn ${exploded ? 'active' : ''}`} onClick={handleExplode}>
          {exploded ? '◇ Assemble' : '◈ Explode'}
        </button>
        <button className={`canvas-btn ${isSpinning ? 'active' : ''}`} onClick={handleSpin}>
          ↻ {isSpinning ? 'Stop' : 'Spin'}
        </button>
      </div>
    </div>
  );
}
