import React, { useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export default function GlassesModel({ url }) {
  const { scene } = useGLTF(url);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    clone.position.sub(center);
    return clone;
  }, [scene, url]);

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
