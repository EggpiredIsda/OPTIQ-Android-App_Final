import React, { useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export default function GlassesModel({ url, frameColor, accentColor, matPbr, lensTint }) {
  const { scene } = useGLTF(url);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    clone.position.sub(center);

    // Normalize scale across different GLB models so they look consistent.
    // Increase model size by ~15% to improve visibility while keeping it in bounds.
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    if (maxDimension > 0) {
      const targetSize = 1; // Set a common normalized model size
      const uniformScale = targetSize / maxDimension;
      const finalScale = uniformScale * 1.15; // ~15% larger globally
      clone.scale.setScalar(finalScale);
    }

    if (frameColor || matPbr || lensTint) {
      clone.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;

        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((mat) => {
          if (frameColor && mat.color) mat.color = new THREE.Color(frameColor);
          if (matPbr) {
            if (matPbr.metalness !== undefined) mat.metalness = matPbr.metalness;
            if (matPbr.roughness !== undefined) mat.roughness = matPbr.roughness;
            if (matPbr.clearcoat !== undefined) mat.clearcoat = matPbr.clearcoat;
            if (matPbr.clearcoatRoughness !== undefined) mat.clearcoatRoughness = matPbr.clearcoatRoughness;
          }
          if (lensTint && mat.tint) {
            mat.tint = lensTint;
          }
        });
      });
    }

    return clone;
  }, [scene, url, frameColor, matPbr, lensTint]);

  useEffect(() => {
    return () => {
      clonedScene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m?.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
    };
  }, [clonedScene]);

  return <primitive object={clonedScene} />;
}
