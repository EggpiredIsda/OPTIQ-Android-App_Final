import React, { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import GlassesModel from './GlassesModel';

function LoadingRing() {
  return (
    <mesh>
      <torusGeometry args={[0.5, 0.03, 16, 64]} />
      <meshStandardMaterial color="#6fcf97" emissive="#6fcf97" emissiveIntensity={0.4} />
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

export default function ModelViewer({ modelUrl }) {
  const orbitRef    = useRef();
  const spinRef     = useRef(false);
  const [exploded,   setExploded]   = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const handleExplode = () => setExploded(v => !v);

  const handleSpin = () => {
    const next = !spinRef.current;
    spinRef.current = next;
    setIsSpinning(next);
    if (orbitRef.current) {
      orbitRef.current.autoRotate = next;
      if (next) {
        orbitRef.current.autoRotateSpeed = 4;
        setTimeout(() => { if (orbitRef.current) orbitRef.current.autoRotateSpeed = 1.5; }, 1500);
      }
    }
  };

  return (
    <div className="canvas-container">
      <Canvas
        camera={{ position: [0, 0.15, 4.5], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        frameloop="always"
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 5]} intensity={1.8} castShadow />
        <directionalLight position={[-4, 2, 3]} color="#8888ff" intensity={0.5} />
        <directionalLight position={[0, 3, -4]} intensity={0.9} />
        <Environment preset="city" />

        <Suspense fallback={<LoadingRing />}>
          <ErrorBoundary FallbackComponent={ModelErrorFallback}>
            <ExplodingGroup exploding={exploded}>
              <GlassesModel url={modelUrl} />
            </ExplodingGroup>
          </ErrorBoundary>
          <ContactShadows position={[0, -0.7, 0]} opacity={0.12} scale={8} blur={2} far={4} color="#000" />
        </Suspense>

        <OrbitControls
          ref={orbitRef}
          enablePan={false}
          enableZoom
          minDistance={2}
          maxDistance={8}
          autoRotate
          autoRotateSpeed={1.0}
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
