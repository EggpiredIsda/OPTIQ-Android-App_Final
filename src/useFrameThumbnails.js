import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

/**
 * useFrameThumbnails
 *
 * Pre-renders each glasses frame (procedural or GLB) into a small
 * thumbnail image using an offscreen WebGLRenderer.
 *
 * @param {Array} frames  – The FRAMES config array from GlassesViewer.
 *                          Each entry needs: build(color, pbr) OR url,
 *                          plus colors[0] with {frame, lens, accent}.
 * @param {Object} defaultPbr – Default PBR material config (optional).
 * @returns {string[]}    – Array of data-URL strings, one per frame.
 */
export default function useFrameThumbnails(frames, defaultPbr) {
  const [thumbnails, setThumbnails] = useState(() => frames.map(() => ""));
  const generatedRef = useRef(false);

  useEffect(() => {
    if (generatedRef.current) return;
    generatedRef.current = true;

    const WIDTH = 400;
    const HEIGHT = 200;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(WIDTH, HEIGHT);
    renderer.setPixelRatio(2);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;

    const gltfLoader = new GLTFLoader();

    async function renderFrame(frameConfig, isCustom) {
      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(32, WIDTH / HEIGHT, 0.1, 50);
      camera.position.set(0, 0.05, 3.2);
      camera.lookAt(0, 0, 0);

      // ── Lighting ──
      if (isCustom) {
        // Premium warm lighting for the custom GLB
        scene.add(new THREE.AmbientLight(0xfff4e0, 0.6));
        const key = new THREE.DirectionalLight(0xffd580, 1.6);
        key.position.set(2, 3, 4);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffe0a0, 0.5);
        fill.position.set(-3, 1, 2);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffc860, 0.7);
        rim.position.set(0, 2, -3);
        scene.add(rim);
      } else {
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(2, 3, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x8888ff, 0.35);
        fill.position.set(-3, 1, 2);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffff, 0.5);
        rim.position.set(0, 1.5, -3);
        scene.add(rim);
      }

      let model;
      const color = frameConfig.colors[0];

      if (frameConfig.url) {
        // GLB model
        try {
          const gltf = await new Promise((resolve, reject) => {
            gltfLoader.load(frameConfig.url, resolve, undefined, reject);
          });
          model = gltf.scene;
          model.rotation.y = -Math.PI / 2;
          model.updateMatrixWorld(true);

          // Compute bounding box and normalize
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1.7 / maxDim;

          model.scale.setScalar(scale);
          model.position.set(
            -center.x * scale,
            -center.y * scale,
            -center.z * scale
          );
        } catch (err) {
          console.warn("Thumbnail GLB load failed:", err);
          return "";
        }
      } else if (frameConfig.build) {
        // Procedural model
        const pbr = defaultPbr || {
          metalness: 0.6,
          roughness: 0.28,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
        };
        model = frameConfig.build(color, pbr);
      } else {
        return "";
      }

      // Slight artistic tilt
      const pivot = new THREE.Group();
      pivot.add(model);
      pivot.rotation.set(0.08, 0.35, 0);
      scene.add(pivot);

      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL("image/png");

      // Cleanup
      scene.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });

      return dataUrl;
    }

    async function generateAll() {
      const results = [];
      for (let i = 0; i < frames.length; i++) {
        const isCustom = !!frames[i].url;
        const url = await renderFrame(frames[i], isCustom);
        results.push(url);
      }
      setThumbnails(results);
      renderer.dispose();
    }

    generateAll();
  }, [frames, defaultPbr]);

  return thumbnails;
}
