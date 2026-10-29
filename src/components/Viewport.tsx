import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildExtrusionGeometry, buildTravelGeometry } from '../render/buildGeometry';
import type { GenBounds, GenResult } from '../core/types';

interface ViewportProps {
  result: GenResult | null;
  visibleLayer: number;
  layerHeight: number;
  bedX: number;
  bedY: number;
  showTravel: boolean;
  onToggleTravel: () => void;
}

interface StageState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  meshMaterial: THREE.MeshStandardMaterial;
  travelMaterial: THREE.LineBasicMaterial;
}

export default function Viewport({
  result,
  visibleLayer,
  layerHeight,
  bedX,
  bedY,
  showTravel,
  onToggleTravel,
}: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<StageState | null>(null);
  const bedGroupRef = useRef<THREE.Group | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const travelRef = useRef<THREE.LineSegments | null>(null);
  const boundsRef = useRef<GenBounds | null>(null);
  const framedRef = useRef(false);
  const showTravelRef = useRef(showTravel);
  const [sceneReady, setSceneReady] = useState(false);

  const frameBounds = useCallback((bounds: GenBounds) => {
    const s = stateRef.current;
    if (!s) return;
    const center = new THREE.Vector3(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minZ + bounds.maxZ) / 2,
      (bounds.minY + bounds.maxY) / 2,
    );
    const size = Math.max(
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
      bounds.maxZ - bounds.minZ,
      30,
    );
    // Leave breathing room for the bottom HUD by aiming slightly below center.
    center.y -= size * 0.035;
    const dist = (size / 2 / Math.tan((s.camera.fov * Math.PI) / 360)) * 1.62;
    const dir = new THREE.Vector3(0.72, 0.42, 0.95).normalize();
    s.camera.position.copy(center).addScaledVector(dir, dist);
    s.camera.near = Math.max(0.5, dist / 100);
    s.camera.far = Math.max(2000, dist * 12);
    s.camera.updateProjectionMatrix();
    s.controls.target.copy(center);
    s.controls.update();
  }, []);

  const resetView = useCallback(() => {
    const bounds = boundsRef.current;
    if (bounds) {
      frameBounds(bounds);
      return;
    }
    const s = stateRef.current;
    if (!s) return;
    s.controls.target.set(bedX / 2, 40, bedY / 2);
    s.camera.position.set(bedX * 1.05, 150, bedY * 1.45);
    s.controls.update();
  }, [bedX, bedY, frameBounds]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, host.clientWidth / Math.max(1, host.clientHeight), 0.5, 3000);
    camera.position.set(200, 170, 260);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 20;
    controls.maxDistance = 1200;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(110, 45, 110);

    scene.add(new THREE.HemisphereLight(0xb9ddff, 0x0a1119, 1.15));

    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(0.7, 1, 0.5).multiplyScalar(300);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x6ee7ff, 1.9);
    rim.position.set(-1, 0.55, -0.8).multiplyScalar(280);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0xa78bfa, 0.9);
    fill.position.set(-0.4, 0.2, 1).multiplyScalar(240);
    scene.add(fill);

    const meshMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.56,
      metalness: 0.18,
      side: THREE.DoubleSide,
    });

    const travelMaterial = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });

    stateRef.current = { scene, camera, controls, renderer, meshMaterial, travelMaterial };
    setSceneReady(true);

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const resize = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      meshRef.current?.geometry.dispose();
      travelRef.current?.geometry.dispose();
      meshMaterial.dispose();
      travelMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stateRef.current = null;
      setSceneReady(false);
    };
  }, []);

  // Build / rebuild the build plate when the bed size changes.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !sceneReady) return;

    if (bedGroupRef.current) {
      s.scene.remove(bedGroupRef.current);
      bedGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    }

    const group = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(bedX, bedY),
      new THREE.MeshStandardMaterial({ color: 0x0b1521, roughness: 0.96, metalness: 0.12 }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(bedX / 2, 0, bedY / 2);
    group.add(plate);

    const minorPts: number[] = [];
    const majorPts: number[] = [];
    const step = 10;
    for (let x = 0; x <= bedX + 0.001; x += step) {
      const target = x % 50 === 0 ? majorPts : minorPts;
      target.push(x, 0.02, 0, x, 0.02, bedY);
    }
    for (let y = 0; y <= bedY + 0.001; y += step) {
      const target = y % 50 === 0 ? majorPts : minorPts;
      target.push(0, 0.02, y, bedX, 0.02, y);
    }
    const minorGeo = new THREE.BufferGeometry();
    minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPts, 3));
    group.add(
      new THREE.LineSegments(
        minorGeo,
        new THREE.LineBasicMaterial({ color: 0x1e3d55, transparent: true, opacity: 0.75 }),
      ),
    );
    const majorGeo = new THREE.BufferGeometry();
    majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPts, 3));
    group.add(
      new THREE.LineSegments(
        majorGeo,
        new THREE.LineBasicMaterial({ color: 0x2f6383, transparent: true, opacity: 0.8 }),
      ),
    );

    const borderPts = [
      0, 0.04, 0, bedX, 0.04, 0, bedX, 0.04, 0, bedX, 0.04, bedY, bedX, 0.04, bedY, 0, 0.04, bedY, 0, 0.04, bedY, 0, 0.04, 0,
    ];
    const borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderPts, 3));
    const border = new THREE.LineSegments(
      borderGeo,
      new THREE.LineBasicMaterial({ color: 0x3a6684, transparent: true, opacity: 0.8 }),
    );
    group.add(border);

    s.scene.add(group);
    bedGroupRef.current = group;
  }, [bedX, bedY, sceneReady]);

  // Build the extrusion mesh from the latest generation result.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !sceneReady) return;

    if (meshRef.current) {
      s.scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      meshRef.current = null;
    }
    if (travelRef.current) {
      s.scene.remove(travelRef.current);
      travelRef.current.geometry.dispose();
      travelRef.current = null;
    }

    if (!result) {
      boundsRef.current = null;
      return;
    }

    boundsRef.current = result.bounds;
    const geometry = buildExtrusionGeometry(result, layerHeight);
    const mesh = new THREE.Mesh(geometry, s.meshMaterial);
    mesh.frustumCulled = false;
    s.scene.add(mesh);
    meshRef.current = mesh;

    const travelGeometry = buildTravelGeometry(result);
    if (travelGeometry) {
      const travels = new THREE.LineSegments(travelGeometry, s.travelMaterial);
      travels.visible = showTravelRef.current;
      travels.frustumCulled = false;
      s.scene.add(travels);
      travelRef.current = travels;
    }

    if (!framedRef.current) {
      frameBounds(result.bounds);
      framedRef.current = true;
    }
  }, [result, layerHeight, sceneReady, frameBounds]);

  // Layer scrubbing uses the draw range — no geometry rebuild needed.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !result) return;
    const layer = THREE.MathUtils.clamp(visibleLayer, 0, result.maxLayer);
    mesh.geometry.setDrawRange(0, result.layerEnds[layer] * 6);
  }, [visibleLayer, result]);

  useEffect(() => {
    showTravelRef.current = showTravel;
    if (travelRef.current) travelRef.current.visible = showTravel;
  }, [showTravel]);

  return (
    <>
      <div className="canvas-host" ref={hostRef} />
      <div className="stage-tools">
        <button
          type="button"
          className={`icon-btn ${showTravel ? 'active' : ''}`}
          onClick={onToggleTravel}
          title="显示旅行路径"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="3 3">
            <path d="M4 19 C 8 19, 8 5, 12 5 S 16 19, 20 19" />
          </svg>
        </button>
        <button type="button" className="icon-btn" onClick={resetView} title="重置视角">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
            <circle cx="12" cy="12" r="3.2" />
          </svg>
        </button>
      </div>
    </>
  );
}
