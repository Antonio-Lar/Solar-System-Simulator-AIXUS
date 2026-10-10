import { useState, useRef, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Html, Trail } from "@react-three/drei";
import * as THREE from "three";
import { a, useTransition } from "@react-spring/web";
import {
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Ruler,
  Grid as GridIcon,
  Orbit,
  Sun as SunIcon,
  X,
  ChevronDown,
  ChevronUp,
  Rocket,
  Star as StarIcon,
  Compass,
  Info,
  Eye,
  EyeOff,
  FlaskConical,
  Flame
} from "lucide-react";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import {
  planetsData,
  PlanetItem,
  nearbyStarsData,
  NearbyStarItem,
  calculateKeplerPosition,
  calculateStarPosition,
  getScaledRadius,
  trivia,
  AtmosphereConfig,
  PLANET_ATMOSPHERE_CONFIGS,
  STAR_POSITIONS_BUFFER,
  STAR_SIZES_BUFFER,
  STAR_COLORS_BUFFER,
  DEFAULT_GPU_STARS,
  MAX_GPU_STARS,
  getStarItemByIndex
} from "./solarData";
import {
  generatePlanetTexture,
  generateSaturnRingTexture,
  generateEarthCloudsTexture,
  generateStarHDTexture
} from "./textureEngine";
import {
  PLANET_EXTENDED_DATABASE,
  MOON_SCIENTIFIC_DATABASE,
  getStarAstrophysicsProfile
} from "./astronomicalDatabase";
import {
  ExplosionEffects3D,
  CollisionPhysicsEngine,
  PhysicsLabDrawer,
  computeLabBodyPosition,
  ExplosionEvent,
  CollisionLogEntry,
  LabBodyCustomMeta
} from "./PhysicsLaboratory";
import SandboxLaboratoryView from "./SandboxLaboratory";

const IS_MOBILE_VIEWPORT =
  typeof window !== "undefined" &&
  (window.innerWidth < 1024 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

// ==========================================
// DYNAMIC ADAPTIVE ZOOM-SCALING GRID (LOD)
// ==========================================

function AdaptiveSpaceGrid({ visible }: { visible: boolean }) {
  const { camera, controls } = useThree();
  const [gridConfig, setGridConfig] = useState({
    cellSize: 10,
    sectionSize: 50,
    fadeDistance: 2000
  });

  const lastDistRef = useRef(0);

  useFrame(() => {
    if (!visible) return;

    const target = (controls as any)?.target || new THREE.Vector3(0, 0, 0);
    const dist = camera.position.distanceTo(target);

    if (Math.abs(dist - lastDistRef.current) / (lastDistRef.current || 1) > 0.12) {
      lastDistRef.current = dist;

      let cellSize = 1;
      if (dist < 15) cellSize = 0.2;
      else if (dist < 60) cellSize = 1;
      else if (dist < 200) cellSize = 5;
      else if (dist < 800) cellSize = 20;
      else if (dist < 2500) cellSize = 80;
      else if (dist < 8000) cellSize = 350;
      else if (dist < 25000) cellSize = 1200;
      else if (dist < 80000) cellSize = 4500;
      else if (dist < 250000) cellSize = 16000;
      else if (dist < 800000) cellSize = 55000;
      else if (dist < 2200000) cellSize = 180000;
      else if (dist < 5000000) cellSize = 450000;
      else cellSize = 1000000;

      const sectionSize = cellSize * 5;
      const fadeDistance = Math.max(120, dist * 4.8);

      setGridConfig({
        cellSize,
        sectionSize,
        fadeDistance
      });
    }
  });

  if (!visible) return null;

  return (
    <Grid
      infiniteGrid
      position={[0, -0.01, 0]}
      cellSize={gridConfig.cellSize}
      sectionSize={gridConfig.sectionSize}
      fadeDistance={gridConfig.fadeDistance}
      fadeStrength={1.6}
      cellThickness={0.45}
      sectionThickness={0.8}
      cellColor="#18202d"
      sectionColor="#475569"
    />
  );
}

// ==========================================
// 3D KEPLERIAN ORBIT LINE COMPONENT
// ==========================================

function KeplerOrbitLine({
  planet,
  isRealisticOrbits,
  color
}: {
  planet: PlanetItem;
  isRealisticOrbits: boolean;
  color: string;
}) {
  const lineRef = useRef<any>(null);

  const flatPositions = useMemo(() => {
    if (planet.semiMajorAU === 0) return null;
    const segments = IS_MOBILE_VIEWPORT ? 128 : 200;
    const arr = new Float32Array((segments + 1) * 3);
    const a = getScaledRadius(planet.semiMajorAU, isRealisticOrbits);
    const e = isRealisticOrbits ? planet.eccentricity : planet.eccentricity * 0.75;
    const iRad = THREE.MathUtils.degToRad(isRealisticOrbits ? planet.inclination : planet.inclination * 0.35);
    const omegaRad = THREE.MathUtils.degToRad(planet.argPerihelion);
    const nodeRad = THREE.MathUtils.degToRad(planet.longNode);

    const cosNode = Math.cos(nodeRad);
    const sinNode = Math.sin(nodeRad);
    const cosI = Math.cos(iRad);
    const sinI = Math.sin(iRad);
    const sqrtOneMinusE2 = Math.sqrt(Math.max(0, 1 - e * e));

    for (let j = 0; j <= segments; j++) {
      const E = (j / segments) * Math.PI * 2;
      const cosE = Math.cos(E);
      const sinE = Math.sin(E);
      const denom = 1 - e * cosE;
      const sinNu = (sqrtOneMinusE2 * sinE) / denom;
      const cosNu = (cosE - e) / denom;
      const nu = Math.atan2(sinNu, cosNu);
      const r = a * denom;

      const xOrb = r * Math.cos(nu + omegaRad);
      const zOrb = r * Math.sin(nu + omegaRad);

      arr[j * 3] = xOrb * cosNode - zOrb * sinNode * cosI;
      arr[j * 3 + 1] = zOrb * sinI;
      arr[j * 3 + 2] = xOrb * sinNode + zOrb * cosNode * cosI;
    }
    return { arr, count: segments + 1 };
  }, [
    planet.semiMajorAU,
    planet.eccentricity,
    planet.inclination,
    planet.argPerihelion,
    planet.longNode,
    isRealisticOrbits
  ]);

  useFrame((state) => {
    if (lineRef.current) {
      const camDist = state.camera.position.length();
      lineRef.current.visible = camDist < 1400;
    }
  });

  if (!flatPositions) return null;

  return (
    <line ref={lineRef}>
      <bufferGeometry
        key={`${planet.semiMajorAU}-${planet.eccentricity}-${planet.inclination}-${isRealisticOrbits}`}
      >
        <bufferAttribute
          attach="attributes-position"
          count={flatPositions.count}
          array={flatPositions.arr}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color || "#38bdf8"}
        transparent
        opacity={isRealisticOrbits ? 0.45 : 0.35}
      />
    </line>
  );
}

// ==========================================
// CONSTANT SCREEN-SPACE 52PX HUD SELECTION BRACKETS MARKER
// ==========================================

function SelectionHUDMarker({
  displayName,
  color = "#ffffff",
  showTextLabel = true
}: {
  displayName: string;
  color?: string;
  radius?: number;
  showTextLabel?: boolean;
}) {
  const cleanName = displayName.split("(")[0].trim().toUpperCase();

  return (
    <Html center zIndexRange={[100, 0]} className="pointer-events-none select-none">
      <div className="relative flex items-center justify-center pointer-events-none w-[52px] h-[52px]">
        <div className="absolute inset-0 pointer-events-none">
          <span
            className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2"
            style={{ borderColor: color || "#ffffff" }}
          />
          <span
            className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2"
            style={{ borderColor: color || "#ffffff" }}
          />
          <span
            className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2"
            style={{ borderColor: color || "#ffffff" }}
          />
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2"
            style={{ borderColor: color || "#ffffff" }}
          />
        </div>

        <div
          className="w-[42px] h-[42px] rounded-full border border-white/90 transition-all duration-300 animate-pulse"
          style={{
            boxShadow: `0 0 8px rgba(255, 255, 255, 0.7), inset 0 0 6px ${color || "#38bdf8"}`
          }}
        />

        <div
          className="absolute inset-1 rounded-full border border-dashed opacity-30 animate-spin-slow"
          style={{ borderColor: color || "#38bdf8", animationDuration: "16s" }}
        />

        <div className="absolute w-1.5 h-1.5 rounded-full bg-white animate-ping" />

        {showTextLabel && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none">
            <span className="font-mono text-[11px] font-black tracking-wider uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
              {cleanName}
            </span>
          </div>
        )}
      </div>
    </Html>
  );
}

// ==========================================
// ULTRA-LIGHTWEIGHT GPU POINT-SPRITE STARFIELD (1 VERTEX PER STAR = 0 LAG ON MOBILE & TABLET)
// ==========================================

function NearbyStarsField({
  visible,
  showLabels,
  showStarFlicker,
  selectedStar,
  starCount = DEFAULT_GPU_STARS
}: {
  visible: boolean;
  showLabels: boolean;
  showStarFlicker: boolean;
  onSelectStar: (star: NearbyStarItem) => void;
  selectedStar: NearbyStarItem | null;
  starCount?: number;
}) {
  const activeCount = Math.min(starCount, MAX_GPU_STARS);

  // Ultra-fast GPU Point Shader: renders crisp white starlight points with subtle celestial nuance (SSS2 style)
  const starPointMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnableFlicker: { value: showStarFlicker ? 1.0 : 0.0 },
        uPixelRatio: { value: Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2) }
      },
      vertexShader: `
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vWorldPos;
        varying vec3 vColor;
        uniform float uPixelRatio;

        void main() {
          vWorldPos = position;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float dist = max(1.0, -mvPosition.z);
          float pointSize = (aSize * 360.0 / dist) * uPixelRatio;
          gl_PointSize = clamp(pointSize, 1.1, 16.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uEnableFlicker;
        varying vec3 vWorldPos;
        varying vec3 vColor;

        void main() {
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r2 = dot(cxy, cxy);
          if (r2 > 1.0) discard;

          // Crisp starlight core with subtle soft halo (matching SSS2 reference)
          float core = exp(-r2 * 4.8);
          float halo = exp(-r2 * 1.9) * 0.38;
          float intensity = clamp(core + halo, 0.0, 1.0);

          // Predominantly luminous white starlight with a gentle 15% spectral tint
          vec3 starWhite = vec3(0.97, 0.98, 1.0);
          vec3 col = mix(starWhite, vColor, 0.15);
          col = mix(col, vec3(1.0, 1.0, 1.0), clamp(core * 1.25, 0.0, 1.0));

          if (uEnableFlicker > 0.5) {
            float wave = sin(uTime * 2.8 + vWorldPos.x * 0.04 + vWorldPos.z * 0.04);
            intensity *= (0.88 + 0.20 * wave);
          }

          gl_FragColor = vec4(col, intensity * 0.95);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }, []);

  useFrame((state) => {
    if (starPointMaterial && visible) {
      starPointMaterial.uniforms.uTime.value = state.clock.getElapsedTime();
      starPointMaterial.uniforms.uEnableFlicker.value = showStarFlicker ? 1.0 : 0.0;
    }
  });

  // Compute selected star 3D info & lazy texture on demand
  const selectedStarData = useMemo(() => {
    if (!selectedStar) return null;
    const { pos } = calculateStarPosition(selectedStar);
    const visualSize = selectedStar.visualSize || (17.5 + selectedStar.size * 2.2);
    const tex = generateStarHDTexture(selectedStar.color || "#ef4444");
    return {
      star: selectedStar,
      pos,
      visualSize,
      tex,
      color: new THREE.Color(selectedStar.color)
    };
  }, [selectedStar]);

  return (
    <group visible={visible}>
      {/* Single GPU Points Draw Call directly from pre-allocated Float32Array buffers */}
      <points frustumCulled={false} raycast={() => null} material={starPointMaterial}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={activeCount}
            array={STAR_POSITIONS_BUFFER}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-aSize"
            count={activeCount}
            array={STAR_SIZES_BUFFER}
            itemSize={1}
          />
          <bufferAttribute
            attach="attributes-aColor"
            count={activeCount}
            array={STAR_COLORS_BUFFER}
            itemSize={3}
          />
        </bufferGeometry>
      </points>

      {/* Detailed 3D Star Sphere Model for Selected Star */}
      {selectedStarData && (
        <group position={[selectedStarData.pos.x, selectedStarData.pos.y, selectedStarData.pos.z]}>
          <mesh>
            <sphereGeometry args={[selectedStarData.visualSize * 1.1, 24, 24]} />
            <meshBasicMaterial map={selectedStarData.tex} color="#ffffff" />
          </mesh>

          <mesh scale={[1.4, 1.4, 1.4]}>
            <sphereGeometry args={[selectedStarData.visualSize * 1.1, 24, 24]} />
            <shaderMaterial
              vertexShader={`
                varying vec3 vNormal;
                void main() {
                  vNormal = normalize(normalMatrix * normal);
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `}
              fragmentShader={`
                varying vec3 vNormal;
                uniform vec3 glowColor;
                void main() {
                  float intensity = pow(max(0.0, vNormal.z), 2.2);
                  gl_FragColor = vec4(glowColor, intensity * 0.85);
                }
              `}
              uniforms={{
                glowColor: { value: selectedStarData.color }
              }}
              transparent
              blending={THREE.AdditiveBlending}
              side={THREE.BackSide}
              depthWrite={false}
            />
          </mesh>

          <SelectionHUDMarker
            displayName={selectedStarData.star.displayName.split("(")[0].trim()}
            color={selectedStarData.star.color}
            radius={selectedStarData.visualSize}
          />
        </group>
      )}

      {showLabels && selectedStarData && (
        <Html
          position={[selectedStarData.pos.x, selectedStarData.pos.y, selectedStarData.pos.z]}
          center
          distanceFactor={1800}
        >
          <div className="pointer-events-none px-2 py-1 rounded-xl text-[10px] font-mono whitespace-nowrap bg-amber-500/90 text-slate-950 font-bold border border-amber-300 shadow-xl backdrop-blur-md flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedStarData.star.color }} />
            <span>{selectedStarData.star.displayName.split("(")[0].trim()}</span>
            <span className="text-[9px] opacity-75">({selectedStarData.star.distanceLy} al)</span>
          </div>
        </Html>
      )}
    </group>
  );
}

// ==========================================
// SMART PROXIMITY TOUCH/CLICK PICKER FOR CELESTIAL BODIES (2D SCREEN-SPACE PROJECTION)
// ==========================================

function ProximityRaycastPicker({
  planets,
  customMetaMap,
  showNearbyStars,
  starCount = DEFAULT_GPU_STARS,
  onSelectPlanet,
  onSelectStar,
  simTimeRef,
  isRealisticOrbits,
  isRealisticSize
}: {
  planets: PlanetItem[];
  customMetaMap: Record<string, LabBodyCustomMeta>;
  showNearbyStars: boolean;
  starCount?: number;
  onSelectPlanet: (p: PlanetItem) => void;
  onSelectStar: (s: NearbyStarItem) => void;
  simTimeRef: React.MutableRefObject<number>;
  isRealisticOrbits: boolean;
  isRealisticSize: boolean;
}) {
  const { camera, gl } = useThree();

  const orbitsRef = useRef(isRealisticOrbits);
  orbitsRef.current = isRealisticOrbits;

  const sizeRef = useRef(isRealisticSize);
  sizeRef.current = isRealisticSize;

  const starsVisibleRef = useRef(showNearbyStars);
  starsVisibleRef.current = showNearbyStars;

  const starCountRef = useRef(starCount);
  starCountRef.current = starCount;

  const pointerDownRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });

  useEffect(() => {
    const canvasEl = gl.domElement;
    if (!canvasEl) return;

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now()
      };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const { x: startX, y: startY, time: startTime } = pointerDownRef.current;
      const elapsed = Date.now() - startTime;
      const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY);

      if (moveDist > 35 || elapsed > 700) return;

      const rect = canvasEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const fov = (camera as THREE.PerspectiveCamera).fov || 50;
      const halfFovTan = Math.tan((fov * Math.PI) / 360);
      const projScale = rect.height / (2 * halfFovTan);

      const getApparentRadiusPx = (worldRadius: number, camDist: number) => {
        if (camDist <= 0.01) return 150;
        return (worldRadius / camDist) * projScale;
      };

      const UNIFORM_HITBOX_RADIUS_PX = 44;

      interface HitCandidate {
        type: "planet" | "star";
        planetItem?: PlanetItem;
        starIndex?: number;
        distPx: number;
        camDist: number;
      }

      const candidates: HitCandidate[] = [];
      const tempVec = new THREE.Vector3();
      const camX = camera.position.x;
      const camY = camera.position.y;
      const camZ = camera.position.z;

      const currentSimTime = simTimeRef.current;
      const currentOrbits = orbitsRef.current;
      const currentSize = sizeRef.current;

      // 1. Check Planets
      for (let i = 0; i < planets.length; i++) {
        const planet = planets[i];
        const { x: px, y: py, z: pz } = computeLabBodyPosition(
          planet,
          currentSimTime,
          currentOrbits,
          planets,
          customMetaMap
        );
        tempVec.set(px, py, pz);
        const camDist = camera.position.distanceTo(tempVec);
        tempVec.project(camera);

        if (tempVec.z > -1.0 && tempVec.z < 1.0) {
          const screenX = ((tempVec.x + 1) * rect.width) * 0.5;
          const screenY = ((-tempVec.y + 1) * rect.height) * 0.5;
          const distPx = Math.hypot(clickX - screenX, clickY - screenY);

          const planetRadius = currentSize ? planet.realisticRadius : planet.size;
          const apparentRadius = getApparentRadiusPx(planet.name === "Sun" ? 22 : planetRadius, camDist);

          let maxAllowedDist = Math.max(UNIFORM_HITBOX_RADIUS_PX, apparentRadius + 6);
          if (planet.name === "Sun" && camDist > 1400) {
            maxAllowedDist = 24;
          }

          if (distPx <= maxAllowedDist) {
            candidates.push({
              type: "planet",
              planetItem: planet,
              distPx,
              camDist
            });
          }
        }
      }

      // 2. Check Stars directly against contiguous STAR_POSITIONS_BUFFER (zero object overhead)
      if (starsVisibleRef.current) {
        const halfW = rect.width * 0.5;
        const halfH = rect.height * 0.5;
        const starLen = Math.min(starCountRef.current, MAX_GPU_STARS);

        const projViewMatrix = new THREE.Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse
        );
        const me = projViewMatrix.elements;
        const m0 = me[0], m1 = me[1], m3 = me[3];
        const m4 = me[4], m5 = me[5], m7 = me[7];
        const m8 = me[8], m9 = me[9], m11 = me[11];
        const m12 = me[12], m13 = me[13], m15 = me[15];

        const clickNdcX = (clickX / halfW) - 1.0;
        const clickNdcY = 1.0 - (clickY / halfH);
        const marginNdcX = 110.0 / halfW;
        const marginNdcY = 110.0 / halfH;
        const minNdcX = clickNdcX - marginNdcX;
        const maxNdcX = clickNdcX + marginNdcX;
        const minNdcY = clickNdcY - marginNdcY;
        const maxNdcY = clickNdcY + marginNdcY;

        for (let i = 0; i < starLen; i++) {
          const idx3 = i * 3;
          const sx = STAR_POSITIONS_BUFFER[idx3];
          const sy = STAR_POSITIONS_BUFFER[idx3 + 1];
          const sz = STAR_POSITIONS_BUFFER[idx3 + 2];

          const w = m3 * sx + m7 * sy + m11 * sz + m15;
          if (w <= 0.1) continue;

          const invW = 1.0 / w;
          const ndcX = (m0 * sx + m4 * sy + m8 * sz + m12) * invW;
          if (ndcX < minNdcX || ndcX > maxNdcX) continue;

          const ndcY = (m1 * sx + m5 * sy + m9 * sz + m13) * invW;
          if (ndcY < minNdcY || ndcY > maxNdcY) continue;

          const screenX = (ndcX + 1.0) * halfW;
          const screenY = (1.0 - ndcY) * halfH;
          const dScreenX = Math.abs(clickX - screenX);
          const dScreenY = Math.abs(clickY - screenY);

          const dx = sx - camX;
          const dy = sy - camY;
          const dz = sz - camZ;
          const camDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const visualSize = STAR_SIZES_BUFFER[i] || 22.0;
          const apparentRadius = (visualSize / camDist) * projScale;
          const maxAllowedDist = Math.max(UNIFORM_HITBOX_RADIUS_PX, apparentRadius + 6);

          if (dScreenX <= maxAllowedDist && dScreenY <= maxAllowedDist) {
            const distPx = Math.hypot(dScreenX, dScreenY);
            if (distPx <= maxAllowedDist) {
              candidates.push({
                type: "star",
                starIndex: i,
                distPx,
                camDist
              });
            }
          }
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          if (Math.abs(a.distPx - b.distPx) < 14) {
            return a.camDist - b.camDist;
          }
          return a.distPx - b.distPx;
        });

        const chosen = candidates[0];
        if (chosen.type === "planet" && chosen.planetItem) {
          onSelectPlanet(chosen.planetItem);
        } else if (chosen.type === "star" && chosen.starIndex !== undefined) {
          onSelectStar(getStarItemByIndex(chosen.starIndex));
        }
      }
    };

    canvasEl.addEventListener("pointerdown", handlePointerDown);
    canvasEl.addEventListener("pointerup", handlePointerUp);

    return () => {
      canvasEl.removeEventListener("pointerdown", handlePointerDown);
      canvasEl.removeEventListener("pointerup", handlePointerUp);
    };
  }, [camera, gl, planets, customMetaMap, onSelectPlanet, onSelectStar, simTimeRef]);

  return null;
}

// ==========================================
// ASTRONOMICAL DISTANCE RULER (GRADUATED LINE ON GRID - NO CIRCULAR RINGS)
// ==========================================

function AstronomicalDistanceRuler({
  visible,
  selectedPlanet,
  simTimeRef,
  isRealisticOrbits
}: {
  visible: boolean;
  selectedPlanet: PlanetItem | null;
  simTimeRef: React.MutableRefObject<number>;
  isRealisticOrbits: boolean;
}) {
  if (!visible) return null;

  const markers = [
    { au: 0.387, label: "0.39 UA (Mercurio)", color: "#94a3b8" },
    { au: 0.723, label: "0.72 UA (Venus)", color: "#f59e0b" },
    { au: 1.0, label: "1.00 UA (Tierra / 150M km)", color: "#06b6d4" },
    { au: 1.524, label: "1.52 UA (Marte)", color: "#ef4444" },
    { au: 2.77, label: "2.77 UA (Ceres)", color: "#a855f7" },
    { au: 5.204, label: "5.20 UA (Júpiter)", color: "#f97316" },
    { au: 9.582, label: "9.58 UA (Saturno)", color: "#fbbf24" },
    { au: 19.2, label: "19.2 UA (Urano)", color: "#22d3ee" },
    { au: 30.05, label: "30.0 UA (Neptuno)", color: "#6366f1" },
    { au: 39.48, label: "39.5 UA (Plutón)", color: "#c084fc" },
    { au: 67.78, label: "67.8 UA (Eris)", color: "#93c5fd" }
  ];

  const maxRadius = getScaledRadius(72.0, isRealisticOrbits);

  const targetCoords = useMemo(() => {
    if (!selectedPlanet || selectedPlanet.semiMajorAU === 0) return null;
    const { x, y, z, rAU } = calculateKeplerPosition(selectedPlanet, simTimeRef.current, isRealisticOrbits);
    return {
      vector: new THREE.Vector3(x, y, z),
      rAU,
      millionKm: (rAU * 149.6).toFixed(1),
      lightTime: rAU < 2 ? `${(rAU * 8.317).toFixed(1)} min` : `${(rAU * 0.1386).toFixed(2)} h`
    };
  }, [selectedPlanet, isRealisticOrbits, simTimeRef]);

  const groupRef = useRef<THREE.Group>(null);
  const lineGeomRef = useRef<THREE.BufferGeometry>(null);

  useFrame((state) => {
    if (groupRef.current) {
      const camDist = state.camera.position.length();
      groupRef.current.visible = camDist < 1400;
    }
    if (selectedPlanet && selectedPlanet.semiMajorAU > 0 && lineGeomRef.current) {
      const { x, y, z } = calculateKeplerPosition(selectedPlanet, simTimeRef.current, isRealisticOrbits);
      const posAttr = lineGeomRef.current.attributes.position as THREE.BufferAttribute;
      if (posAttr) {
        posAttr.setXYZ(1, x, y, z);
        posAttr.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([0, 0, 0, maxRadius, 0, 0])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.65} />
      </line>

      {markers.map((m) => {
        const radius = getScaledRadius(m.au, isRealisticOrbits);
        const tickHeight = 1.8;
        return (
          <group key={m.au}>
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={2}
                  array={new Float32Array([radius, 0, -tickHeight, radius, 0, tickHeight])}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color={m.color} transparent opacity={0.8} />
            </line>

            <Html position={[radius, 0, 2.5]} center distanceFactor={130}>
              <div className="pointer-events-none select-none bg-slate-950/90 border border-slate-700/80 px-2 py-0.5 rounded text-[9px] font-mono text-cyan-300 whitespace-nowrap backdrop-blur-md shadow-lg flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                <span>{m.label}</span>
              </div>
            </Html>
          </group>
        );
      })}

      {targetCoords && (
        <group>
          <line>
            <bufferGeometry ref={lineGeomRef}>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([0, 0, 0, targetCoords.vector.x, targetCoords.vector.y, targetCoords.vector.z])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineDashedMaterial
              color="#38bdf8"
              dashSize={1.5}
              gapSize={0.8}
              transparent
              opacity={0.85}
            />
          </line>
          <Html
            position={[
              targetCoords.vector.x * 0.5,
              targetCoords.vector.y * 0.5 + 1.2,
              targetCoords.vector.z * 0.5
            ]}
            center
            distanceFactor={110}
          >
            <div className="pointer-events-none select-none bg-cyan-950/90 border border-cyan-400/80 px-2.5 py-1 rounded-xl text-[10px] font-mono text-cyan-100 shadow-xl backdrop-blur-md flex flex-col items-center">
              <span className="font-bold text-white">
                {targetCoords.rAU.toFixed(2)} UA
              </span>
              <span className="text-[9px] text-cyan-300">
                {targetCoords.millionKm} M km • {targetCoords.lightTime} luz
              </span>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

// ==========================================
// ASTEROID & KUIPER BELTS COMPONENT
// ==========================================

function AsteroidAndKuiperBelts({
  isRealisticSize,
  isRealisticOrbits,
  showAsteroidBelt,
  showKuiperBelt
}: {
  isRealisticSize: boolean;
  isRealisticOrbits: boolean;
  showAsteroidBelt: boolean;
  showKuiperBelt: boolean;
}) {
  const asteroidParticles = useMemo(() => {
    if (!showAsteroidBelt) return null;
    const count = IS_MOBILE_VIEWPORT ? 900 : (isRealisticSize ? 2000 : 1400);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const minR = getScaledRadius(2.15, isRealisticOrbits);
    const maxR = getScaledRadius(3.3, isRealisticOrbits);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = minR + Math.random() * (maxR - minR);
      const height = (Math.random() - 0.5) * (isRealisticSize ? 2.5 : 1.5);

      positions[i * 3] = radius * Math.cos(angle);
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = radius * Math.sin(angle);

      const shade = 0.45 + Math.random() * 0.45;
      colors[i * 3] = shade * 0.9;
      colors[i * 3 + 1] = shade * 0.85;
      colors[i * 3 + 2] = shade * 0.8;
    }

    return { positions, colors, count };
  }, [isRealisticSize, isRealisticOrbits, showAsteroidBelt]);

  const kuiperParticles = useMemo(() => {
    if (!showKuiperBelt) return null;
    const count = IS_MOBILE_VIEWPORT ? 1500 : 2800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const minR = getScaledRadius(30.0, isRealisticOrbits);
    const maxR = getScaledRadius(52.0, isRealisticOrbits);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = minR + Math.random() * (maxR - minR);
      const height = (Math.random() - 0.5) * (isRealisticSize ? 10.0 : 6.0);

      positions[i * 3] = radius * Math.cos(angle);
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = radius * Math.sin(angle);

      const shade = 0.5 + Math.random() * 0.5;
      colors[i * 3] = shade * 0.7;
      colors[i * 3 + 1] = shade * 0.85;
      colors[i * 3 + 2] = shade * 1.0;
    }

    return { positions, colors, count };
  }, [isRealisticSize, isRealisticOrbits, showKuiperBelt]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      const camDist = state.camera.position.length();
      groupRef.current.visible = camDist < 1400;
    }
  });

  return (
    <group ref={groupRef}>
      {asteroidParticles && (
        <points>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={asteroidParticles.count}
              array={asteroidParticles.positions}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              count={asteroidParticles.count}
              array={asteroidParticles.colors}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            size={isRealisticSize ? 0.35 : 0.45}
            vertexColors
            transparent
            opacity={0.65}
            sizeAttenuation
          />
        </points>
      )}

      {kuiperParticles && (
        <points>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={kuiperParticles.count}
              array={kuiperParticles.positions}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              count={kuiperParticles.count}
              array={kuiperParticles.colors}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.6}
            vertexColors
            transparent
            opacity={0.55}
            sizeAttenuation
          />
        </points>
      )}
    </group>
  );
}

// ==========================================
// ELLIPTICAL ORBIT ADDITIVE PARTICLE TRAIL (TAIL)
// ==========================================

function ParticleTrail({
  planet,
  simTimeRef,
  isRealisticOrbits,
  color,
  showTrails,
  limit = 90
}: {
  planet: PlanetItem;
  simTimeRef: React.MutableRefObject<number>;
  isRealisticOrbits: boolean;
  color: string;
  showTrails: boolean;
  limit?: number;
}) {
  const history = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const positionsBuf = useMemo(() => new Float32Array(limit * 3), [limit]);
  const colorsBuf = useMemo(() => new Float32Array(limit * 3), [limit]);
  const baseColor = useMemo(() => new THREE.Color(color), [color]);

  const isEnabled = showTrails && planet.semiMajorAU > 0;

  useFrame(() => {
    if (!isEnabled || !geometryRef.current) return;

    const { x, y, z } = calculateKeplerPosition(planet, simTimeRef.current, isRealisticOrbits);

    history.current.push({ x, y, z });
    if (history.current.length > limit) {
      history.current.shift();
    }

    const len = history.current.length;
    for (let i = 0; i < limit; i++) {
      const p = history.current[i] || { x, y, z };
      positionsBuf[i * 3] = p.x;
      positionsBuf[i * 3 + 1] = p.y;
      positionsBuf[i * 3 + 2] = p.z;

      const ratio = len > 0 ? Math.max(0, i / len) : 0;
      const factor = Math.pow(ratio, 1.6) * 0.45;

      colorsBuf[i * 3] = baseColor.r * factor;
      colorsBuf[i * 3 + 1] = baseColor.g * factor;
      colorsBuf[i * 3 + 2] = baseColor.b * factor;
    }

    const posAttr = geometryRef.current.attributes.position as THREE.BufferAttribute;
    const colAttr = geometryRef.current.attributes.color as THREE.BufferAttribute;
    if (posAttr && colAttr) {
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  });

  if (!isEnabled) return null;

  return (
    <points>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={limit}
          array={positionsBuf}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={limit}
          array={colorsBuf}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={1.0}
        vertexColors
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation={true}
      />
    </points>
  );
}

// ==========================================
// 3D MOON ORBIT & MESH (REF-DRIVEN 60FPS WITHOUT REACT RE-RENDERS)
// ==========================================

function MoonOrbitAndMesh({
  moon,
  index,
  finalRadius,
  isRealisticSize,
  simTimeRef,
  moonTexture
}: {
  moon: any;
  index: number;
  finalRadius: number;
  isRealisticSize: boolean;
  simTimeRef: React.MutableRefObject<number>;
  moonTexture: THREE.CanvasTexture | null;
}) {
  const moonGroupRef = useRef<THREE.Group>(null);
  const moonDist = finalRadius + moon.distance * (isRealisticSize ? 1.4 : 1.1) + index * 0.45;
  const moonSize = Math.max(0.12, (moon.radiusKm / 6371) * (isRealisticSize ? 0.35 : 0.4));

  const orbitArray = useMemo(() => {
    const segments = 36;
    const arr = new Float32Array((segments + 1) * 3);
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      arr[s * 3] = Math.cos(theta) * moonDist;
      arr[s * 3 + 1] = 0;
      arr[s * 3 + 2] = Math.sin(theta) * moonDist;
    }
    return { arr, count: segments + 1 };
  }, [moonDist]);

  useFrame(() => {
    if (moonGroupRef.current) {
      const moonAngle = simTimeRef.current * moon.speed * 0.02 + index * 1.5;
      moonGroupRef.current.position.set(
        Math.cos(moonAngle) * moonDist,
        0,
        Math.sin(moonAngle) * moonDist
      );
    }
  });

  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={orbitArray.count}
            array={orbitArray.arr}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </line>

      <group ref={moonGroupRef}>
        <mesh>
          <sphereGeometry args={[moonSize, 12, 12]} />
          <meshStandardMaterial
            map={moonTexture}
            color="#e2e8f0"
            roughness={0.9}
          />
        </mesh>
      </group>
    </group>
  );
}

// ==========================================
// 3D PLANET MESH (WITH SELECTION RETICLES & ROTATIONS)
// ==========================================

function PlanetMesh({
  planet,
  allPlanets,
  customMetaMap,
  simTimeRef,
  onClick,
  showOrbits,
  isRealisticSize,
  isRealisticOrbits,
  axialSpeed,
  showTrails,
  textures,
  ringTexture,
  cloudsTexture,
  selectedPlanet,
  showStarLabels
}: {
  planet: PlanetItem;
  allPlanets: PlanetItem[];
  customMetaMap: Record<string, LabBodyCustomMeta>;
  simTimeRef: React.MutableRefObject<number>;
  onClick: (p: PlanetItem) => void;
  showOrbits: boolean;
  isRealisticSize: boolean;
  isRealisticOrbits: boolean;
  axialSpeed: number;
  showTrails: boolean;
  textures: Record<string, THREE.CanvasTexture>;
  ringTexture: THREE.CanvasTexture;
  cloudsTexture: THREE.CanvasTexture;
  selectedPlanet: PlanetItem | null;
  showStarLabels: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [isHovered] = useState(false);
  const [isInterstellar, setIsInterstellar] = useState(false);

  const finalRadius = isRealisticSize ? planet.realisticRadius : planet.size;
  const isSelected = selectedPlanet?.name === planet.name;
  const isSun = planet.name === "Sun";

  const frustum = useRef(new THREE.Frustum());
  const projScreenMatrix = useRef(new THREE.Matrix4());
  const boundingSphere = useRef(new THREE.Sphere());

  useFrame((state, delta) => {
    const { x, y, z } = computeLabBodyPosition(
      planet,
      simTimeRef.current,
      isRealisticOrbits,
      allPlanets,
      customMetaMap
    );

    if (groupRef.current) {
      groupRef.current.position.set(x, y, z);

      const { camera } = state;
      const camDist = camera.position.length();

      const interstellar = camDist >= 1400;
      if (interstellar !== isInterstellar) {
        setIsInterstellar(interstellar);
      }

      if (!isSun) {
        projScreenMatrix.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.current.setFromProjectionMatrix(projScreenMatrix.current);

        const checkRadius = finalRadius * 3.5 + 2.0;
        boundingSphere.current.set(groupRef.current.position, checkRadius);
        const isInside = frustum.current.intersectsSphere(boundingSphere.current);

        groupRef.current.visible = isInside && !interstellar;
        groupRef.current.scale.setScalar(1.0);
      } else {
        let scaleFactor = 1.0;
        if (camDist > 400 && camDist < 1400) {
          const targetMinRadius = isRealisticSize ? 2.0 : 3.5;
          const minScale = targetMinRadius / finalRadius;
          const t = (camDist - 400) / 1000;
          scaleFactor = THREE.MathUtils.lerp(1.0, minScale, t);
        } else if (camDist >= 1400) {
          scaleFactor = 19.0 / finalRadius;
        }

        groupRef.current.scale.setScalar(scaleFactor);
        groupRef.current.visible = true;
      }
    }

    if (meshRef.current && planet.rotPeriodHours !== 0) {
      const rotSign = planet.rotPeriodHours > 0 ? 1 : -1;
      const rotRate = (Math.PI * 2) / (Math.abs(planet.rotPeriodHours) * 3600);
      meshRef.current.rotation.y += rotRate * delta * 45000 * axialSpeed * rotSign;
    }

    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += 0.0035 * axialSpeed;
    }
  });

  const tiltRad = THREE.MathUtils.degToRad(planet.axialTilt);
  const hasActiveIntercept = Boolean(customMetaMap[planet.name]?.intercept);

  return (
    <>
      {showOrbits && !isInterstellar && !hasActiveIntercept && (
        <KeplerOrbitLine
          planet={planet}
          isRealisticOrbits={isRealisticOrbits}
          color={planet.color}
        />
      )}

      <group ref={groupRef}>
        {!isInterstellar && showTrails && (
          <ParticleTrail
            planet={planet}
            simTimeRef={simTimeRef}
            isRealisticOrbits={isRealisticOrbits}
            color={planet.color}
            showTrails={showTrails}
          />
        )}

        {!isInterstellar && (
          <DustRingParticles planet={planet} isRealisticSize={isRealisticSize} />
        )}

        {isHovered && isInterstellar && isSun && (
          <Html position={[0, finalRadius * 5.0 + 10.0, 0]} center distanceFactor={700}>
            <div className="pointer-events-none select-none bg-slate-950/95 border border-amber-500/50 text-white p-2.5 rounded-xl shadow-2xl backdrop-blur-md flex flex-col gap-1 min-w-[140px] transition-all">
              <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#FDB813]" />
                <span className="font-semibold text-xs tracking-tight">Sol (Nuestra Estrella)</span>
              </div>
              <div className="flex flex-col text-[10px] font-mono text-slate-300 gap-0.5">
                <div className="flex justify-between gap-4">
                  <span>Distancia:</span>
                  <span className="text-amber-400 font-bold">0.0 al</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Sistema:</span>
                  <span className="text-cyan-400">Sol (Origen)</span>
                </div>
              </div>
            </div>
          </Html>
        )}

        <PlanetSphere
          planet={planet}
          finalRadius={finalRadius}
          tiltRad={tiltRad}
          meshRef={meshRef}
          cloudsRef={cloudsRef}
          textures={textures}
          ringTexture={ringTexture}
          cloudsTexture={cloudsTexture}
          onClick={onClick}
          eclipseDarkening={0}
        />

        {isSelected && (
          <SelectionHUDMarker
            displayName={planet.displayName || planet.name}
            color={planet.color || "#06b6d4"}
            radius={isInterstellar && isSun ? finalRadius * 3.5 : finalRadius}
          />
        )}

        {isInterstellar && isSun && showStarLabels && (
          <Html center distanceFactor={1800}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick(planet);
              }}
              className={`pointer-events-auto px-2 py-1 rounded-xl text-[10px] font-mono whitespace-nowrap transition-all shadow-xl backdrop-blur-md flex items-center gap-1.5 border ${
                isSelected
                  ? "bg-amber-500/90 text-slate-950 font-bold border-amber-300 scale-110 shadow-amber-500/30"
                  : "bg-slate-950/85 hover:bg-slate-900 text-slate-200 border-slate-800 hover:border-slate-700"
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-[#FDB813]" />
              <span>Sol</span>
              <span className="text-[9px] opacity-75">(0 al)</span>
            </button>
          </Html>
        )}

        {!isInterstellar && planet.moons &&
          planet.moons.map((moon, index) => (
            <MoonOrbitAndMesh
              key={moon.name}
              moon={moon}
              index={index}
              finalRadius={finalRadius}
              isRealisticSize={isRealisticSize}
              simTimeRef={simTimeRef}
              moonTexture={textures["Moon"] || null}
            />
          ))}
      </group>
    </>
  );
}

// ==========================================
// PHOTOREALISTIC PROCEDURAL PLASMA SUN SHADERS (3D FBM NOISE)
// ==========================================

const sunVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  uniform float uTime;
  uniform float uSunGlowFactor;
  uniform sampler2D uSunTexture;

  vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * n_);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 3; i++) {
      val += amp * snoise(p * freq);
      freq *= 2.05;
      amp *= 0.5;
    }
    return val;
  }

  void main() {
    // Turbulent 3D plasma noise animation
    vec3 noisePos = vPosition * 0.35 + vec3(uTime * 0.06, uTime * 0.04, -uTime * 0.05);
    float n1 = fbm(noisePos);

    vec3 noisePos2 = vPosition * 0.9 - vec3(-uTime * 0.1, uTime * 0.12, uTime * 0.08);
    float n2 = snoise(noisePos2);

    float combinedNoise = n1 * 0.7 + n2 * 0.3;

    // Solar plasma colors
    vec3 darkMaroon = vec3(0.35, 0.04, 0.01);
    vec3 brightOrange = vec3(1.0, 0.38, 0.02);
    vec3 hotYellow = vec3(1.0, 0.88, 0.28);
    vec3 whiteHot = vec3(1.0, 0.98, 0.88);

    vec3 color = mix(darkMaroon, brightOrange, smoothstep(-0.4, 0.1, combinedNoise));
    color = mix(color, hotYellow, smoothstep(0.1, 0.45, combinedNoise));
    color = mix(color, whiteHot, smoothstep(0.45, 0.85, combinedNoise));

    // Blend texture details for sunspots
    vec4 texColor = texture2D(uSunTexture, vUv);
    if (texColor.a > 0.0) {
      color = mix(color, texColor.rgb * color * 1.25, 0.35);
    }

    // Fresnel Limb Darkening
    float fresnel = dot(vNormal, vec3(0.0, 0.0, 1.0));
    float limbDarkening = pow(max(0.0, fresnel), 0.6);
    color *= (0.35 + 0.65 * limbDarkening);

    // Zoom-based camera distance decay factor
    color *= (0.25 + 0.75 * uSunGlowFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ==========================================
// PHOTOREALISTIC RAYLEIGH ATMOSPHERIC SCATTERING SHADERS
// ==========================================

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  uniform vec3 uSunPos;
  uniform vec3 uDayColor;
  uniform vec3 uSunsetColor;
  uniform float uDensity;
  uniform float uPower;
  uniform float uEclipseDarkening;

  void main() {
    // Vector towards Sun (origin [0,0,0] in world space)
    vec3 sunDir = normalize(uSunPos - vWorldPos);

    // Fresnel grazing angle for limb brightening
    float vDotN = max(0.0, dot(vNormal, vViewDir));
    float rim = pow(1.0 - vDotN, uPower);

    // Solar incidence: angle between surface normal and sunlight
    float sunDot = dot(vWorldNormal, sunDir);

    // Rayleigh daylight illumination: illuminated limb
    float dayIllumination = smoothstep(-0.25, 0.45, sunDot);

    // Rayleigh terminator / sunset twilight band (peaks when sun is grazing horizon: -0.35 to +0.35)
    float sunsetBand = smoothstep(-0.35, 0.02, sunDot) * smoothstep(0.42, 0.05, sunDot);

    // Optical depth accumulation at the limb
    float opticalDepth = rim * (dayIllumination * 0.95 + sunsetBand * 1.35 + 0.06);

    // Color gradient between daylight Rayleigh hue and sunset chromatic hue
    vec3 scatterColor = mix(uDayColor, uSunsetColor, sunsetBand);
    scatterColor += uSunsetColor * (sunsetBand * 0.45);

    float alpha = opticalDepth * uDensity * (1.0 - uEclipseDarkening);

    if (alpha <= 0.002) discard;

    gl_FragColor = vec4(scatterColor, clamp(alpha, 0.0, 1.0));
  }
`;

function AtmosphericScatteringSphere({
  radius,
  atmosphereConfig,
  eclipseDarkening = 0
}: {
  radius: number;
  atmosphereConfig: AtmosphereConfig;
  eclipseDarkening?: number;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const outerMatRef = useRef<THREE.ShaderMaterial>(null);

  const dayColor = useMemo(() => new THREE.Color(atmosphereConfig.dayColor), [atmosphereConfig.dayColor]);
  const sunsetColor = useMemo(() => new THREE.Color(atmosphereConfig.sunsetColor), [atmosphereConfig.sunsetColor]);

  useFrame(() => {
    if (matRef.current) {
      matRef.current.uniforms.uEclipseDarkening.value = eclipseDarkening;
    }
    if (outerMatRef.current) {
      outerMatRef.current.uniforms.uEclipseDarkening.value = eclipseDarkening;
    }
  });

  if (!atmosphereConfig.hasAtmosphere || atmosphereConfig.density <= 0) {
    return null;
  }

  const innerScale = atmosphereConfig.scale;
  const outerScale = atmosphereConfig.scale * 1.035;

  return (
    <group>
      {/* 1. Inner atmospheric Rayleigh mantle (FrontSide, hugging planetary surface) */}
      <mesh scale={[innerScale, innerScale, innerScale]}>
        <sphereGeometry args={[radius, 48, 48]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={{
            uSunPos: { value: new THREE.Vector3(0, 0, 0) },
            uDayColor: { value: dayColor },
            uSunsetColor: { value: sunsetColor },
            uDensity: { value: atmosphereConfig.density },
            uPower: { value: atmosphereConfig.power },
            uEclipseDarkening: { value: eclipseDarkening }
          }}
          transparent
          blending={THREE.AdditiveBlending}
          side={THREE.FrontSide}
          depthWrite={false}
        />
      </mesh>

      {/* 2. Outer atmospheric halo glow (BackSide, delicate celestial limb rim against space) */}
      <mesh scale={[outerScale, outerScale, outerScale]}>
        <sphereGeometry args={[radius, 48, 48]} />
        <shaderMaterial
          ref={outerMatRef}
          vertexShader={`
            varying vec3 vNormal;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPos;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              vec4 worldPos = modelMatrix * vec4(position, 1.0);
              vWorldPos = worldPos.xyz;
              vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            varying vec3 vNormal;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPos;
            uniform vec3 uSunPos;
            uniform vec3 uDayColor;
            uniform vec3 uSunsetColor;
            uniform float uDensity;
            uniform float uEclipseDarkening;

            void main() {
              vec3 sunDir = normalize(uSunPos - vWorldPos);
              float sunDot = dot(vWorldNormal, sunDir);
              float intensity = pow(max(0.0, vNormal.z), 3.2);
              float sunLit = smoothstep(-0.35, 0.45, sunDot);
              float sunsetFactor = smoothstep(-0.4, 0.05, sunDot) * smoothstep(0.45, 0.0, sunDot);

              vec3 col = mix(uDayColor, uSunsetColor, sunsetFactor);
              float alpha = intensity * (sunLit * 0.75 + 0.15) * uDensity * 0.65 * (1.0 - uEclipseDarkening);

              if (alpha <= 0.002) discard;
              gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
            }
          `}
          uniforms={{
            uSunPos: { value: new THREE.Vector3(0, 0, 0) },
            uDayColor: { value: dayColor },
            uSunsetColor: { value: sunsetColor },
            uDensity: { value: atmosphereConfig.density },
            uEclipseDarkening: { value: eclipseDarkening }
          }}
          transparent
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function PlanetSphere({
  planet,
  finalRadius,
  tiltRad,
  meshRef,
  cloudsRef,
  textures,
  ringTexture,
  cloudsTexture,
  onClick,
  eclipseDarkening = 0
}: any) {
  const isSun = planet.name === "Sun";
  const sunMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const coronaMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const atmosphereConfig = PLANET_ATMOSPHERE_CONFIGS[planet.name] || {
    hasAtmosphere: false,
    dayColor: "#ffffff",
    sunsetColor: "#ffffff",
    scale: 1.0,
    density: 0,
    power: 4.0,
    composition: "Sin atmósfera"
  };

  useFrame((state) => {
    if (isSun) {
      const time = state.clock.getElapsedTime();
      const camDist = state.camera.position.length();
      // Decay factor from 1.0 down as camera zooms out beyond 400
      const glowFactor = camDist > 400 ? Math.max(0.05, 1.0 - (camDist - 400) / 1000) : 1.0;

      if (sunMaterialRef.current) {
        sunMaterialRef.current.uniforms.uTime.value = time;
        sunMaterialRef.current.uniforms.uSunGlowFactor.value = glowFactor;
      }
      if (coronaMaterialRef.current) {
        coronaMaterialRef.current.uniforms.uGlowFactor.value = glowFactor;
      }
    }
  });

  // Dynamic diffuse color darkening during eclipses/transits
  const planetColor = useMemo(() => {
    const base = new THREE.Color(planet.color);
    return base.multiplyScalar(1.0 - eclipseDarkening);
  }, [planet.color, eclipseDarkening]);

  const isCustomStar = planet.category === "star" && planet.name !== "Sun";

  return (
    <group rotation={[0, 0, tiltRad]}>
      {isCustomStar && (
        <pointLight color={planet.color} intensity={3.2} distance={220} decay={1.2} />
      )}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick(planet);
        }}
        castShadow={!isSun && !isCustomStar}
        receiveShadow={!isSun && !isCustomStar}
      >
        <sphereGeometry args={[finalRadius, 48, 48]} />
        {isSun ? (
          <shaderMaterial
            ref={sunMaterialRef}
            vertexShader={sunVertexShader}
            fragmentShader={sunFragmentShader}
            uniforms={{
              uTime: { value: 0 },
              uSunGlowFactor: { value: 1.0 },
              uSunTexture: { value: textures[planet.name] || null }
            }}
          />
        ) : isCustomStar ? (
          <meshStandardMaterial
            color={planet.color}
            emissive={planet.color}
            emissiveIntensity={1.65}
            roughness={0.15}
          />
        ) : (
          <meshStandardMaterial
            map={textures[planet.name] || null}
            color={planetColor}
            roughness={planet.roughness}
            metalness={planet.metalness}
          />
        )}
      </mesh>
      {isCustomStar && (
        <mesh scale={[1.28, 1.28, 1.28]}>
          <sphereGeometry args={[finalRadius, 32, 32]} />
          <meshBasicMaterial
            color={planet.color}
            transparent
            opacity={0.32}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Atmospheric Rayleigh Limb & Sunset Scattering for Planets with Atmospheres */}
      {!isSun && atmosphereConfig.hasAtmosphere && (
        <AtmosphericScatteringSphere
          radius={finalRadius}
          atmosphereConfig={atmosphereConfig}
          eclipseDarkening={eclipseDarkening}
        />
      )}

      {/* Atmospheric Clouds for Earth - with real-time shadow darkening */}
      {planet.name === "Earth" && (
        <mesh ref={cloudsRef} scale={[1.02, 1.02, 1.02]}>
          <sphereGeometry args={[finalRadius, 48, 48]} />
          <meshStandardMaterial
            map={cloudsTexture}
            transparent
            opacity={0.65 * (1.0 - eclipseDarkening * 0.5)}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* Saturn Rings */}
      {planet.name === "Saturn" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[finalRadius * 1.35, finalRadius * 2.35, 64]} />
          <meshStandardMaterial
            map={ringTexture}
            side={THREE.DoubleSide}
            transparent
            opacity={0.92}
            roughness={0.7}
          />
        </mesh>
      )}

      {/* Sun Corona Glow (Soft volumetric Fresnel atmospheric corona with zoom decay) */}
      {isSun && (
        <mesh scale={[1.35, 1.35, 1.35]}>
          <sphereGeometry args={[finalRadius, 48, 48]} />
          <shaderMaterial
            ref={coronaMaterialRef}
            vertexShader={`
              varying vec3 vNormal;
              void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              varying vec3 vNormal;
              uniform vec3 glowColor;
              uniform float uGlowFactor;
              void main() {
                float intensity = pow(max(0.0, vNormal.z), 2.2);
                gl_FragColor = vec4(glowColor, intensity * 0.75 * uGlowFactor);
              }
            `}
            uniforms={{
              glowColor: { value: new THREE.Color("#ff7700") },
              uGlowFactor: { value: 1.0 }
            }}
            transparent
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ==========================================
// CAMERA CONTROLLER WITH DYNAMIC DISTANCE-BASED TRAVEL
// ==========================================

export interface FlightTarget {
  name: string;
  type: "planet" | "star";
  body: PlanetItem | NearbyStarItem;
  targetPos: THREE.Vector3;
  camOffset: THREE.Vector3;
  durationMs: number;
}

function CameraManager({
  controlsRef,
  selectedPlanet,
  selectedStar,
  isFollowing,
  simTimeRef,
  isRealisticOrbits,
  cameraResetKey,
  flightTarget,
  onFlightComplete,
  allPlanets,
  customMetaMap
}: {
  controlsRef: React.RefObject<any>;
  selectedPlanet: PlanetItem | null;
  selectedStar: NearbyStarItem | null;
  isFollowing: boolean;
  simTimeRef: React.MutableRefObject<number>;
  isRealisticOrbits: boolean;
  cameraResetKey: number;
  flightTarget: FlightTarget | null;
  onFlightComplete: () => void;
  allPlanets: PlanetItem[];
  customMetaMap: Record<string, LabBodyCustomMeta>;
}) {
  const { camera } = useThree();
  const currentTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const isResettingCameraRef = useRef(false);
  const resetTargetPosRef = useRef(new THREE.Vector3(0, 95, 220));
  const lastKeyRef = useRef(cameraResetKey);

  const flightStateRef = useRef<{
    active: boolean;
    startTime: number;
    body: PlanetItem | NearbyStarItem;
    type: "planet" | "star";
    camOffset: THREE.Vector3;
    startCamPos: THREE.Vector3;
    startLookAt: THREE.Vector3;
    endCamPos: THREE.Vector3;
    endLookAt: THREE.Vector3;
    duration: number;
  } | null>(null);

  useEffect(() => {
    if (cameraResetKey !== lastKeyRef.current) {
      lastKeyRef.current = cameraResetKey;
      isResettingCameraRef.current = true;
      resetTargetPosRef.current.set(0, 95, 220);
      flightStateRef.current = null;
    }
  }, [cameraResetKey]);

  useEffect(() => {
    const ctrl = controlsRef.current;
    if (flightTarget && ctrl) {
      const startCam = camera.position.clone();
      const startLook = ctrl.target.clone();

      const endLook = flightTarget.targetPos.clone();
      const endCam = endLook.clone().add(flightTarget.camOffset);

      flightStateRef.current = {
        active: true,
        startTime: performance.now(),
        body: flightTarget.body,
        type: flightTarget.type,
        camOffset: flightTarget.camOffset,
        startCamPos: startCam,
        startLookAt: startLook,
        endCamPos: endCam,
        endLookAt: endLook,
        duration: flightTarget.durationMs
      };
      isResettingCameraRef.current = false;
    }
  }, [flightTarget, camera, controlsRef]);

  useFrame(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const now = performance.now();

    if (flightStateRef.current && flightStateRef.current.active) {
      const fs = flightStateRef.current;
      const elapsed = now - fs.startTime;
      const progress = Math.min(1, elapsed / fs.duration);
      const ease = 1 - Math.pow(1 - progress, 2.8);

      let currentEndLook = fs.endLookAt;
      let currentEndCam = fs.endCamPos;

      if (fs.type === "planet") {
        const p = fs.body as PlanetItem;
        const { x, y, z } = computeLabBodyPosition(
          p,
          simTimeRef.current,
          isRealisticOrbits,
          allPlanets,
          customMetaMap
        );
        currentEndLook = new THREE.Vector3(x, y, z);
        currentEndCam = currentEndLook.clone().add(fs.camOffset);
      }

      camera.position.lerpVectors(fs.startCamPos, currentEndCam, ease);
      currentTargetRef.current.lerpVectors(fs.startLookAt, currentEndLook, ease);
      ctrl.target.copy(currentTargetRef.current);
      ctrl.update();

      if (progress >= 1) {
        flightStateRef.current.active = false;
        camera.position.copy(currentEndCam);
        ctrl.target.copy(currentEndLook);
        ctrl.update();
        onFlightComplete();
      }
      return;
    }

    if (isResettingCameraRef.current) {
      camera.position.lerp(resetTargetPosRef.current, 0.08);
      currentTargetRef.current.lerp(new THREE.Vector3(0, 0, 0), 0.08);
      ctrl.target.copy(currentTargetRef.current);
      ctrl.update();

      if (
        camera.position.distanceTo(resetTargetPosRef.current) < 2.0 &&
        currentTargetRef.current.length() < 0.2
      ) {
        camera.position.copy(resetTargetPosRef.current);
        ctrl.target.set(0, 0, 0);
        ctrl.update();
        isResettingCameraRef.current = false;
      }
      return;
    }

    if (selectedPlanet && isFollowing) {
      const { x, y, z } = computeLabBodyPosition(
        selectedPlanet,
        simTimeRef.current,
        isRealisticOrbits,
        allPlanets,
        customMetaMap
      );
      currentTargetRef.current.set(x, y, z);
      ctrl.target.lerp(currentTargetRef.current, 0.14);
      ctrl.update();
    } else if (selectedStar && isFollowing) {
      const { pos: targetVec } = calculateStarPosition(selectedStar);
      currentTargetRef.current.lerp(targetVec, 0.12);
      ctrl.target.copy(currentTargetRef.current);
      ctrl.update();
    }
  });

  return null;
}

// ==========================================
// TARGET SPATIAL RETICLE COMPASS (Project off-screen bodies on screen edges)
// ==========================================

function TargetCompass({
  selectedPlanet,
  selectedStar,
  simTimeRef,
  isRealisticOrbits
}: {
  selectedPlanet: PlanetItem | null;
  selectedStar: NearbyStarItem | null;
  simTimeRef: React.MutableRefObject<number>;
  isRealisticOrbits: boolean;
}) {
  const { camera } = useThree();
  const [arrowStyle, setArrowStyle] = useState<any>(null);
  const lastVisibleRef = useRef(false);
  const lastUpdateMsRef = useRef(0);
  const tempVRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!selectedPlanet && !selectedStar) {
      if (lastVisibleRef.current) {
        lastVisibleRef.current = false;
        setArrowStyle(null);
      }
      return;
    }

    const now = performance.now();
    if (now - lastUpdateMsRef.current < 50) return;
    lastUpdateMsRef.current = now;

    const targetPos = tempVRef.current;
    let name = "";
    let color = "#38bdf8";

    if (selectedPlanet) {
      const { x, y, z } = calculateKeplerPosition(selectedPlanet, simTimeRef.current, isRealisticOrbits);
      targetPos.set(x, y, z);
      name = selectedPlanet.displayName || selectedPlanet.name;
      color = selectedPlanet.color;
    } else if (selectedStar) {
      const { pos } = calculateStarPosition(selectedStar);
      targetPos.copy(pos);
      name = selectedStar.displayName.split("(")[0].trim();
      color = selectedStar.color;
    }

    targetPos.project(camera);

    const isBehind = targetPos.z > 1;
    const isOffScreen = isBehind || Math.abs(targetPos.x) > 0.95 || Math.abs(targetPos.y) > 0.95;

    if (isOffScreen) {
      let x2d = targetPos.x;
      let y2d = targetPos.y;

      if (isBehind) {
        x2d = -x2d;
        y2d = -y2d;
      }

      const angle = Math.atan2(y2d, x2d);
      const border = 0.88;

      let clampedX = x2d;
      let clampedY = y2d;

      const absX = Math.abs(x2d);
      const absY = Math.abs(y2d);

      if (absX > absY) {
        clampedX = x2d > 0 ? border : -border;
        clampedY = (y2d / absX) * border;
      } else {
        clampedY = y2d > 0 ? border : -border;
        clampedX = (x2d / absY) * border;
      }

      const leftPct = 50 + clampedX * 44;
      const topPct = 50 - clampedY * 44;

      lastVisibleRef.current = true;
      setArrowStyle({
        visible: true,
        left: `${leftPct.toFixed(1)}%`,
        top: `${topPct.toFixed(1)}%`,
        angleDeg: Math.round(THREE.MathUtils.radToDeg(angle) - 90),
        name,
        color
      });
    } else if (lastVisibleRef.current) {
      lastVisibleRef.current = false;
      setArrowStyle(null);
    }
  });

  if (!arrowStyle) return null;

  return (
    <Html fullscreen>
      <div
        className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 select-none flex flex-col items-center gap-1.5 z-40 transition-all duration-75"
        style={{ left: arrowStyle.left, top: arrowStyle.top }}
      >
        <div
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-950/95 border shadow-2xl backdrop-blur-md"
          style={{
            transform: `rotate(${arrowStyle.angleDeg}deg)`,
            borderColor: arrowStyle.color,
            boxShadow: `0 0 10px ${arrowStyle.color}40`
          }}
        >
          <div
            className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[9px]"
            style={{ borderBottomColor: arrowStyle.color }}
          />
        </div>
        <div
          className="bg-slate-950/95 border px-2.5 py-0.5 rounded-xl text-[10px] font-mono text-white shadow-2xl backdrop-blur-sm whitespace-nowrap flex items-center gap-1.5"
          style={{ borderColor: `${arrowStyle.color}60` }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: arrowStyle.color }} />
          <span>{arrowStyle.name}</span>
        </div>
      </div>
    </Html>
  );
}

// ==========================================
// DYNAMIC SUN LIGHT INTENSITY CONTROLLER
// ==========================================

function DynamicSunLight({ baseIntensity }: { baseIntensity: number }) {
  const lightRef = useRef<THREE.PointLight>(null);
  
  useFrame((state) => {
    if (lightRef.current) {
      const camDist = state.camera.position.length();
      // If camera zooms out beyond 400, smoothly fade out the point light's intensity
      // from baseIntensity to exactly 0.0 at 1400 units distance (interstellar scale).
      const factor = camDist > 400 
        ? Math.max(0.0, 1.0 - (camDist - 400) / 1000)
        : 1.0;
      
      lightRef.current.intensity = baseIntensity * factor;
    }
  });
  
  return <pointLight ref={lightRef} position={[0, 0, 0]} color="#fff6d6" distance={50000} decay={0.8} />;
}

// ==========================================
// DYNAMIC AMBIENT LIGHT CONTROLLER
// ==========================================

function DynamicAmbientLight({ enabled, baseIntensity }: { enabled: boolean; baseIntensity: number }) {
  const lightRef = useRef<THREE.AmbientLight>(null);
  
  useFrame((state) => {
    if (lightRef.current) {
      if (!enabled) {
        lightRef.current.intensity = 0;
        return;
      }
      const camDist = state.camera.position.length();
      // Smoothly fade out ambient light from baseIntensity to 0.0 once we zoom out beyond 400,
      // reaching exactly 0.0 at interstellar scale (1400 units) for a deep dark interstellar void.
      const factor = camDist > 400 
        ? Math.max(0.0, 1.0 - (camDist - 400) / 1000)
        : 1.0;
      
      lightRef.current.intensity = baseIntensity * factor;
    }
  });
  
  return <ambientLight ref={lightRef} color="#dbeafe" />;
}



// ==========================================
// DUST RING PARTICLES FOR GIANT PLANETS
// ==========================================

function DustRingParticles({ planet, isRealisticSize }: { planet: PlanetItem; isRealisticSize: boolean }) {
  const isGiant = ["Jupiter", "Saturn", "Uranus", "Neptune"].includes(planet.name);
  
  const particles = useMemo(() => {
    if (!isGiant) return null;
    const count = planet.name === "Saturn" ? 600 : 350;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    const finalRadius = isRealisticSize ? planet.realisticRadius : planet.size;
    const innerR = finalRadius * (planet.name === "Saturn" ? 1.35 : 1.5);
    const outerR = finalRadius * (planet.name === "Saturn" ? 2.5 : 2.2);
    const ringColor = new THREE.Color(planet.color).multiplyScalar(0.7); // slightly darker/toned
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = innerR + Math.random() * (outerR - innerR);
      
      // Orbit in the XZ plane with tiny vertical variance
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * (finalRadius * 0.06);
      positions[i * 3 + 2] = Math.sin(theta) * r;
      
      // Saturated ring coloring with particle variance
      const col = ringColor.clone().multiplyScalar(0.8 + Math.random() * 0.4);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    
    return { positions, colors, count };
  }, [planet, isGiant, isRealisticSize]);

  if (!isGiant || !particles) return null;

  return (
    <points rotation={[0, 0, THREE.MathUtils.degToRad(planet.axialTilt)]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.count}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particles.count}
          array={particles.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.35}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation={true}
      />
    </points>
  );
}

// ==========================================
// ZERO-ALLOCATION 60FPS SIMULATION CLOCK
// ==========================================

function SimulationClock({
  simTimeRef,
  isPaused,
  simSpeed,
  onSyncUiDays
}: {
  simTimeRef: React.MutableRefObject<number>;
  isPaused: boolean;
  simSpeed: number;
  onSyncUiDays: (days: number) => void;
}) {
  const lastUiSyncRef = useRef(0);

  useFrame((_, delta) => {
    if (!isPaused) {
      const clampedDelta = Math.min(delta, 0.1);
      simTimeRef.current += clampedDelta * simSpeed * 4.5;
    }
    const now = performance.now();
    if (now - lastUiSyncRef.current > 450) {
      lastUiSyncRef.current = now;
      onSyncUiDays(simTimeRef.current);
    }
  });

  return null;
}

// ==========================================
// MAIN SOLAR SYSTEM APP COMPONENT
// ==========================================

export default function App() {
  const controlsRef = useRef<any>(null);
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetItem | null>(null);
  const [selectedStar, setSelectedStar] = useState<NearbyStarItem | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [activePlanetTab, setActivePlanetTab] = useState<"summary" | "telemetry" | "moons" | "structure" | "missions">("summary");
  const [activeStarTab, setActiveStarTab] = useState<"astrophysics" | "gaia" | "exoplanets">("astrophysics");
  const [expandedMoonName, setExpandedMoonName] = useState<string | null>(null);

  // Section Switcher: "solar_system" vs "sandbox_lab" (Clean Space Physics Simulator)
  const [appSection, setAppSection] = useState<"solar_system" | "sandbox_lab">("solar_system");

  // Adaptive Graphics Quality Mode: auto-enable Fluidez on mobile/tablet so it never stutters
  const [performanceMode, setPerformanceMode] = useState<"performance" | "ultra">(
    IS_MOBILE_VIEWPORT ? "performance" : "ultra"
  );

  // ==========================================
  // PHYSICS & COLLISION LABORATORY STATE
  // ==========================================
  const [simPlanets, setSimPlanets] = useState<PlanetItem[]>(() =>
    planetsData.map((p) => ({ ...p, moons: p.moons ? [...p.moons] : [] }))
  );
  const [destroyedNames, setDestroyedNames] = useState<string[]>([]);
  const [isLabOpen, setIsLabOpen] = useState(false);
  const [isCollisionEnabled, setIsCollisionEnabled] = useState(true);
  const [collisionMode, setCollisionMode] = useState<"destroy_both" | "merge_larger">("destroy_both");
  const [collisionSensitivity, setCollisionSensitivity] = useState(1.3);
  const [explosions, setExplosions] = useState<ExplosionEvent[]>([]);
  const [collisionLogs, setCollisionLogs] = useState<CollisionLogEntry[]>([]);

  const initialCustomMetaMap = useMemo(() => {
    const map: Record<string, LabBodyCustomMeta> = {
      Sun: { massEarths: 332946, gravityMs2: 274.0, escapeVelocityKms: 617.7, densityGcm3: 1.408 },
      Mercury: { massEarths: 0.055, gravityMs2: 3.7, escapeVelocityKms: 4.25, densityGcm3: 5.427 },
      Venus: { massEarths: 0.815, gravityMs2: 8.87, escapeVelocityKms: 10.36, densityGcm3: 5.243 },
      Earth: { massEarths: 1.0, gravityMs2: 9.81, escapeVelocityKms: 11.19, densityGcm3: 5.514 },
      Mars: { massEarths: 0.107, gravityMs2: 3.72, escapeVelocityKms: 5.03, densityGcm3: 3.933 },
      Ceres: { massEarths: 0.00015, gravityMs2: 0.28, escapeVelocityKms: 0.51, densityGcm3: 2.162 },
      Jupiter: { massEarths: 317.8, gravityMs2: 24.79, escapeVelocityKms: 59.5, densityGcm3: 1.326 },
      Saturn: { massEarths: 95.16, gravityMs2: 10.44, escapeVelocityKms: 35.5, densityGcm3: 0.687 },
      Uranus: { massEarths: 14.54, gravityMs2: 8.69, escapeVelocityKms: 21.3, densityGcm3: 1.27 },
      Neptune: { massEarths: 17.15, gravityMs2: 11.15, escapeVelocityKms: 23.5, densityGcm3: 1.638 },
      Pluto: { massEarths: 0.0022, gravityMs2: 0.62, escapeVelocityKms: 1.21, densityGcm3: 1.854 },
      Haumea: { massEarths: 0.00067, gravityMs2: 0.4, escapeVelocityKms: 0.81, densityGcm3: 1.885 },
      Makemake: { massEarths: 0.0005, gravityMs2: 0.5, escapeVelocityKms: 0.74, densityGcm3: 1.7 },
      Eris: { massEarths: 0.0028, gravityMs2: 0.82, escapeVelocityKms: 1.38, densityGcm3: 2.52 }
    };
    return map;
  }, []);

  const [customMetaMap, setCustomMetaMap] = useState<Record<string, LabBodyCustomMeta>>(initialCustomMetaMap);

  // Visual & Physical Settings
  const [showOrbits, setShowOrbits] = useState(true);
  const [showGrid, setShowGrid] = useState(!IS_MOBILE_VIEWPORT);
  const [showDistanceRuler, setShowDistanceRuler] = useState(false);
  const [showNearbyStars, setShowNearbyStars] = useState(true);
  const [showStarLabels, setShowStarLabels] = useState(false);
  const [isRealisticSize, setIsRealisticSize] = useState(false);
  const [isRealisticOrbits, setIsRealisticOrbits] = useState(true);
  const [isAmbientLightEnabled, setIsAmbientLightEnabled] = useState(true);
  const [sunIntensity, setSunIntensity] = useState(2.8);
  const [simSpeed, setSimSpeed] = useState(1.0);
  const [axialSpeed, setAxialSpeed] = useState(1.0);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<"physics" | "sectors" | "visuals">("physics");
  const [isTriviaOpen, setIsTriviaOpen] = useState(false);
  const [isBottomDockExpanded, setIsBottomDockExpanded] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showTrails, setShowTrails] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCleanView, setIsCleanView] = useState(false);
  const [currentTrivia, setCurrentTrivia] = useState(trivia[0]);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [starSearchQuery, setStarSearchQuery] = useState("");

  const filteredStarsList = useMemo(() => {
    if (!starSearchQuery.trim()) {
      return nearbyStarsData.slice(0, 45);
    }
    const q = starSearchQuery.toLowerCase().trim();
    const matches: NearbyStarItem[] = [];
    const total = nearbyStarsData.length;
    for (let i = 0; i < total; i++) {
      const s = nearbyStarsData[i];
      if (
        s.name.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.constellation.toLowerCase().includes(q) ||
        s.spectralType.toLowerCase().includes(q)
      ) {
        matches.push(s);
        if (matches.length >= 60) break;
      }
    }
    return matches;
  }, [starSearchQuery]);

  // Space Travel State
  const [flightTarget, setFlightTarget] = useState<FlightTarget | null>(null);
  const [isTraveling, setIsTraveling] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);

  // Sector Visibility Filters
  const [showSun, setShowSun] = useState(true);
  const [showTerrestrial, setShowTerrestrial] = useState(true);
  const [showGasGiants, setShowGasGiants] = useState(true);
  const [showDwarfPlanets, setShowDwarfPlanets] = useState(true);
  const [showAsteroidBelt, setShowAsteroidBelt] = useState(true);
  const [showKuiperBelt, setShowKuiperBelt] = useState(true);
  const [showStarFlicker, setShowStarFlicker] = useState(true);
  const [activeSectorTab, setActiveSectorTab] = useState<"all" | "terrestrial" | "gas_giant" | "dwarf_planet" | "stars">("all");

  const initialDaysSinceJ2000 = useMemo(() => {
    return (Date.now() - Date.UTC(2000, 0, 1, 12, 0, 0)) / (1000 * 60 * 60 * 24);
  }, []);

  // High-frequency ref for 60fps 3D scene & low-frequency state (~2Hz) for UI labels
  const simTimeRef = useRef<number>(initialDaysSinceJ2000);
  const [uiTimeDays, setUiTimeDays] = useState<number>(initialDaysSinceJ2000);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isCleanView) {
          setIsCleanView(false);
          showToast("👁️ Interfaz Restaurada");
        } else if (isConfigOpen) {
          setIsConfigOpen(false);
        } else if (isInspectorOpen) {
          setIsInspectorOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCleanView, isConfigOpen, isInspectorOpen]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 2400);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const simulatedCalendarDate = useMemo(() => {
    const millis = Date.UTC(2000, 0, 1, 12, 0, 0) + uiTimeDays * 86400000;
    return new Date(millis).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }, [uiTimeDays]);

  const textures = useMemo(() => {
    const map: Record<string, THREE.CanvasTexture> = {};
    planetsData.forEach((p) => {
      map[p.name] = generatePlanetTexture(p.name);
    });
    map["Moon"] = generatePlanetTexture("Moon");
    return map;
  }, []);

  const ringTexture = useMemo(() => generateSaturnRingTexture(), []);
  const cloudsTexture = useMemo(() => generateEarthCloudsTexture(), []);

  const visiblePlanets = useMemo(() => {
    return simPlanets.filter((p) => {
      if (destroyedNames.includes(p.name)) return false;
      if (p.category === "star") return showSun;
      if (p.category === "terrestrial") return showTerrestrial;
      if (p.category === "gas_giant") return showGasGiants;
      if (p.category === "dwarf_planet") return showDwarfPlanets;
      return true;
    });
  }, [simPlanets, destroyedNames, showSun, showTerrestrial, showGasGiants, showDwarfPlanets]);

  useEffect(() => {
    if (selectedPlanet) {
      const updated = visiblePlanets.find((p) => p.name === selectedPlanet.name);
      if (!updated) {
        setSelectedPlanet(null);
        setIsFollowing(false);
      } else if (updated !== selectedPlanet) {
        setSelectedPlanet(updated);
      }
    }
  }, [visiblePlanets, selectedPlanet]);

  // ==========================================
  // LABORATORY COLLISION & MUTATION HANDLERS
  // ==========================================
  const handleCollisionDetected = (
    bodyA: PlanetItem,
    bodyB: PlanetItem,
    midpoint: [number, number, number],
    distAU: number
  ) => {
    const metaA = customMetaMap[bodyA.name] || { massEarths: 1, gravityMs2: 9.8, escapeVelocityKms: 11, densityGcm3: 5 };
    const metaB = customMetaMap[bodyB.name] || { massEarths: 1, gravityMs2: 9.8, escapeVelocityKms: 11, densityGcm3: 5 };

    const relVel = Math.abs(bodyA.velocity - bodyB.velocity) + 18.5;
    const reducedMass = (metaA.massEarths * metaB.massEarths) / Math.max(0.0001, metaA.massEarths + metaB.massEarths);
    const energyVal = (0.5 * reducedMass * relVel * relVel * 1.4e6).toExponential(2);
    const energyStr = `${energyVal} Teratones TNT`;

    const explosionRadius = Math.max(2.2, (bodyA.size + bodyB.size) * 0.95);
    const expId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const newExp: ExplosionEvent = {
      id: expId,
      position: midpoint,
      radius: explosionRadius,
      colorA: bodyA.color,
      colorB: bodyB.color,
      createdAtMs: performance.now(),
      label: `💥 COLISIÓN: ${bodyA.displayName} × ${bodyB.displayName}`,
      energyTeratons: energyStr
    };

    setExplosions((prev) => [...prev.slice(-6), newExp]);

    let outcomeText = "";
    if (collisionMode === "destroy_both" && bodyA.name !== "Sun" && bodyB.name !== "Sun") {
      setDestroyedNames((prev) => Array.from(new Set([...prev, bodyA.name, bodyB.name])));
      outcomeText = `Destrucción mutua total: ${bodyA.displayName} y ${bodyB.displayName} pulverizados en fragmentos.`;
      showToast(`💥 ¡Colisión Catastrófica! ${bodyA.displayName} y ${bodyB.displayName} destruidos.`);
    } else {
      const isALarger =
        bodyA.name === "Sun" ||
        (bodyB.name !== "Sun" && metaA.massEarths >= metaB.massEarths);
      const survivor = isALarger ? bodyA : bodyB;
      const absorbed = isALarger ? bodyB : bodyA;
      const survMeta = isALarger ? metaA : metaB;
      const absMeta = isALarger ? metaB : metaA;

      setDestroyedNames((prev) => Array.from(new Set([...prev, absorbed.name])));

      const combinedMass = Number((survMeta.massEarths + absMeta.massEarths).toFixed(3));
      const newSize = Number(Math.min(18, survivor.size * 1.12).toFixed(2));
      const newTemp = Math.min(18000, survivor.temp + 650);

      setSimPlanets((prev) =>
        prev.map((p) =>
          p.name === survivor.name
            ? { ...p, size: newSize, temp: newTemp }
            : p
        )
      );
      setCustomMetaMap((prev) => ({
        ...prev,
        [survivor.name]: {
          ...survMeta,
          massEarths: combinedMass,
          intercept: undefined
        }
      }));

      outcomeText = `Fusión planetaria: ${survivor.displayName} absorbió a ${absorbed.displayName} (+650 °C, masa: ${combinedMass} M⊕).`;
      showToast(`💥 ¡Impacto! ${survivor.displayName} absorbió a ${absorbed.displayName}`);
    }

    const logItem: CollisionLogEntry = {
      id: expId,
      bodyA: bodyA.displayName || bodyA.name,
      bodyB: bodyB.displayName || bodyB.name,
      impactVelKms: `${relVel.toFixed(1)} km/s`,
      energyTeratons: energyStr,
      distanceAU: distAU.toFixed(2),
      outcome: outcomeText,
      timestamp: new Date().toLocaleTimeString()
    };

    setCollisionLogs((prev) => [logItem, ...prev.slice(0, 24)]);
  };

  const handleLaunchIntercept = (sourceName: string, targetName: string) => {
    const sourceBody = simPlanets.find((p) => p.name === sourceName);
    const targetBody = simPlanets.find((p) => p.name === targetName);
    if (!sourceBody || !targetBody) return;

    setIsCollisionEnabled(true);
    setIsPaused(false);

    const nowSimDays = simTimeRef.current;
    const startCoords = computeLabBodyPosition(
      sourceBody,
      nowSimDays,
      isRealisticOrbits,
      simPlanets,
      customMetaMap
    );
    const durationSimDays = Math.max(4.5, simSpeed * 11.5);

    setCustomMetaMap((prev) => ({
      ...prev,
      [sourceName]: {
        ...(prev[sourceName] || {
          massEarths: 1.0,
          gravityMs2: 9.8,
          escapeVelocityKms: 11.2,
          densityGcm3: 5.0
        }),
        intercept: {
          startPos: [startCoords.x, startCoords.y, startCoords.z],
          targetBodyName: targetName,
          startSimDays: nowSimDays,
          impactSimDays: nowSimDays + durationSimDays
        }
      }
    }));

    showToast(`☄️ ${sourceBody.displayName} lanzado en curso de colisión hacia ${targetBody.displayName}!`);
  };

  const handleSpawnBody = (
    newPlanet: PlanetItem,
    meta: LabBodyCustomMeta,
    launchAsInterceptTarget?: string
  ) => {
    setIsCollisionEnabled(true);
    setIsPaused(false);

    const nowSimDays = simTimeRef.current;
    let finalMeta = { ...meta };
    if (launchAsInterceptTarget) {
      const targetBody =
        simPlanets.find((p) => p.name === launchAsInterceptTarget && !destroyedNames.includes(p.name)) ||
        simPlanets.find((p) => p.name !== "Sun" && !destroyedNames.includes(p.name));

      if (targetBody) {
        const tPos = computeLabBodyPosition(
          targetBody,
          nowSimDays,
          isRealisticOrbits,
          simPlanets,
          customMetaMap
        );
        const startPos: [number, number, number] = [
          tPos.x + (Math.random() > 0.5 ? 24 : -24),
          tPos.y + 8,
          tPos.z + (Math.random() > 0.5 ? 24 : -24)
        ];
        const durationSimDays = Math.max(4.2, simSpeed * 10.5);
        finalMeta.intercept = {
          startPos,
          targetBodyName: targetBody.name,
          startSimDays: nowSimDays,
          impactSimDays: nowSimDays + durationSimDays
        };
      }
    }

    setSimPlanets((prev) => [...prev, newPlanet]);
    setCustomMetaMap((prev) => ({
      ...prev,
      [newPlanet.name]: finalMeta
    }));
    setSelectedPlanet(newPlanet);
    setSelectedStar(null);

    if (launchAsInterceptTarget) {
      showToast(`💥 ${newPlanet.displayName} lanzado hacia impacto inminente!`);
    } else {
      showToast(`✨ Astro creado: ${newPlanet.displayName} en órbita (${newPlanet.semiMajorAU} UA)`);
    }
  };

  const handleUpdatePlanet = (name: string, patch: Partial<PlanetItem>) => {
    setSimPlanets((prev) =>
      prev.map((p) => (p.name === name ? { ...p, ...patch } : p))
    );
  };

  const handleUpdateMeta = (name: string, patch: Partial<LabBodyCustomMeta>) => {
    setCustomMetaMap((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || {
          massEarths: 1,
          gravityMs2: 9.8,
          escapeVelocityKms: 11.2,
          densityGcm3: 5.0
        }),
        ...patch
      }
    }));
  };

  const handleDeleteBody = (name: string) => {
    if (name === "Sun") return;
    setDestroyedNames((prev) => Array.from(new Set([...prev, name])));
    if (selectedPlanet?.name === name) {
      setSelectedPlanet(null);
    }
    showToast(`🗑️ Cuerpo eliminado de la escena`);
  };

  const handleRestoreAll = () => {
    setSimPlanets(planetsData.map((p) => ({ ...p, moons: p.moons ? [...p.moons] : [] })));
    setDestroyedNames([]);
    setCustomMetaMap(initialCustomMetaMap);
    setExplosions([]);
    showToast("🔄 Sistema Solar restaurado a su estado original (NASA)");
  };

  const handleTriggerScenario = (
    scenarioId: "theia_earth" | "asteroid_impact" | "inner_chaos" | "binary_star"
  ) => {
    setIsCollisionEnabled(true);
    setIsPaused(false);

    if (scenarioId === "theia_earth") {
      setDestroyedNames((prev) => prev.filter((n) => n !== "Earth"));
      const theiaId = `Theia_${Date.now().toString().slice(-4)}`;
      const theiaPlanet: PlanetItem = {
        name: theiaId,
        displayName: "Protoplaneta Theia",
        category: "terrestrial",
        categoryLabel: "Protoplaneta de Impacto",
        color: "#f97316",
        size: 0.95,
        realisticRadius: 0.45,
        semiMajorAU: 1.0,
        eccentricity: 0.25,
        inclination: 2.0,
        longNode: 45,
        argPerihelion: 90,
        meanLongitude0: 120,
        period: 365,
        velocity: 34.5,
        axialTilt: 12,
        rotPeriodHours: 14,
        temp: 620,
        roughness: 0.7,
        metalness: 0.2,
        details: "Protoplaneta del tamaño de Marte en curso de colisión directa con la Tierra primitiva.",
        composition: "Manto de silicatos fundidos y núcleo de hierro.",
        atmosphere: "Vapor de roca incandescente.",
        moons: []
      };
      handleSpawnBody(
        theiaPlanet,
        {
          massEarths: 0.15,
          gravityMs2: 4.2,
          escapeVelocityKms: 5.4,
          densityGcm3: 4.1,
          isCustom: true
        },
        "Earth"
      );
    } else if (scenarioId === "asteroid_impact") {
      const target =
        selectedPlanet && selectedPlanet.name !== "Sun" && !destroyedNames.includes(selectedPlanet.name)
          ? selectedPlanet.name
          : "Mars";
      setDestroyedNames((prev) => prev.filter((n) => n !== target));
      const impId = `Apophis_${Date.now().toString().slice(-4)}`;
      const impactor: PlanetItem = {
        name: impId,
        displayName: "Impactor Chicxulub-X",
        category: "dwarf_planet",
        categoryLabel: "Asteroide Hiperveloz",
        color: "#ef4444",
        size: 0.75,
        realisticRadius: 0.35,
        semiMajorAU: 1.35,
        eccentricity: 0.55,
        inclination: 6.5,
        longNode: 10,
        argPerihelion: 40,
        meanLongitude0: 25,
        period: 480,
        velocity: 48.0,
        axialTilt: 25,
        rotPeriodHours: 6,
        temp: 320,
        roughness: 0.85,
        metalness: 0.35,
        details: "Bólido hiperveloz lanzado en trayectoria de intercepción directa.",
        composition: "Níquel-hierro denso y condritas carbonáceas.",
        atmosphere: "Coma de plasma por fricción.",
        moons: []
      };
      handleSpawnBody(
        impactor,
        {
          massEarths: 0.04,
          gravityMs2: 1.8,
          escapeVelocityKms: 2.5,
          densityGcm3: 5.8,
          isCustom: true
        },
        target
      );
    } else if (scenarioId === "inner_chaos") {
      setDestroyedNames((prev) => prev.filter((n) => !["Mercury", "Venus", "Earth", "Mars"].includes(n)));
      setSimPlanets((prev) =>
        prev.map((p) => {
          if (p.name === "Mercury") return { ...p, semiMajorAU: 0.92, eccentricity: 0.65, inclination: 0 };
          if (p.name === "Venus") return { ...p, semiMajorAU: 1.0, eccentricity: 0.52, inclination: 0 };
          if (p.name === "Mars") return { ...p, semiMajorAU: 1.05, eccentricity: 0.58, inclination: 0 };
          if (p.name === "Earth") return { ...p, inclination: 0 };
          return p;
        })
      );
      handleLaunchIntercept("Venus", "Earth");
      showToast("🌀 ¡Caos Orbital Activado! Órbitas interiores cruzadas en el mismo plano.");
    } else if (scenarioId === "binary_star") {
      const starId = `Nemesis_${Date.now().toString().slice(-4)}`;
      const companionStar: PlanetItem = {
        name: starId,
        displayName: "Némesis (Estrella Binaria)",
        category: "star",
        categoryLabel: "Enana Roja Compañera (M4V)",
        color: "#ff4500",
        size: 4.5,
        realisticRadius: 2.2,
        semiMajorAU: 1.65,
        eccentricity: 0.38,
        inclination: 2.0,
        longNode: 20,
        argPerihelion: 60,
        meanLongitude0: 180,
        period: 680,
        velocity: 26.0,
        axialTilt: 5,
        rotPeriodHours: 48,
        temp: 3450,
        roughness: 0.1,
        metalness: 0.0,
        details: "Estrella compañera enana roja introducida en el Sistema Solar interior.",
        composition: "Plasma de Hidrógeno (74%) y Helio (25%) en fusión nuclear.",
        atmosphere: "Corona magnética activa con fulguraciones.",
        moons: []
      };
      handleSpawnBody(companionStar, {
        massEarths: 65000,
        gravityMs2: 160.0,
        escapeVelocityKms: 340.0,
        densityGcm3: 1.8,
        isCustom: true
      });
    }
  };

  const handleVisitBody = (body: PlanetItem | NearbyStarItem, type: "planet" | "star") => {
    setIsTraveling(true);
    setIsInspectorOpen(false);
    if (type === "planet") {
      const p = body as PlanetItem;
      setSelectedPlanet(p);
      setSelectedStar(null);
      const { x, y, z } = computeLabBodyPosition(p, simTimeRef.current, isRealisticOrbits, simPlanets, customMetaMap);
      const rad = isRealisticSize ? p.realisticRadius : p.size;
      const targetVec = new THREE.Vector3(x, y, z);

      let offsetDist = Math.max(14.0, rad * 5.2);
      if (p.name === "Sun") {
        offsetDist = Math.max(55.0, rad * 5.5);
      } else if (p.name === "Saturn") {
        offsetDist = rad * 7.5;
      }
      const camOffset = new THREE.Vector3(offsetDist * 0.7, offsetDist * 0.4, offsetDist * 0.7);

      const dist = targetVec.length();
      let durationMs = 1200;
      if (dist < 30) durationMs = 1200;
      else if (dist < 150) durationMs = 1800;
      else if (dist < 600) durationMs = 2600;
      else durationMs = 3800;

      setFlightTarget({
        name: p.displayName || p.name,
        type: "planet",
        body: p,
        targetPos: targetVec,
        camOffset,
        durationMs
      });
      showToast(`🚀 En viaje hacia ${p.displayName || p.name}...`);
    } else {
      const s = body as NearbyStarItem;
      setSelectedStar(s);
      setSelectedPlanet(null);

      const { pos: targetVec } = calculateStarPosition(s);
      const visualSize = s.visualSize || (17.5 + s.size * 2.2);
      const offsetDist = visualSize * 5.8;
      const camOffset = new THREE.Vector3(offsetDist * 0.7, offsetDist * 0.4, offsetDist * 0.7);

      const durationMs = Math.min(7200, 2600 + (Math.min(s.distanceLy, 5000.0) / 5000.0) * 4600);

      setFlightTarget({
        name: s.displayName.split("(")[0].trim(),
        type: "star",
        body: s,
        targetPos: targetVec,
        camOffset,
        durationMs
      });
      showToast(`🚀 Salto warp hacia ${s.displayName.split("(")[0].trim()} (${s.distanceLy} al)...`);
    }
  };

  const handleFlightComplete = () => {
    setIsTraveling(false);
    setIsFollowing(true);
    setFlightTarget(null);
    showToast(`✨ Llegada confirmada.`);
  };

  const inspectorPlanetTransitions = useTransition(selectedPlanet && isInspectorOpen ? selectedPlanet : null, {
    from: { opacity: 0, transform: "translate3d(30px, 0px, 0)" },
    enter: { opacity: 1, transform: "translate3d(0px, 0px, 0)" },
    leave: { opacity: 0, transform: "translate3d(30px, 0px, 0)" },
    config: { tension: 340, friction: 28 }
  });

  const inspectorStarTransitions = useTransition(selectedStar && isInspectorOpen ? selectedStar : null, {
    from: { opacity: 0, transform: "translate3d(30px, 0px, 0)" },
    enter: { opacity: 1, transform: "translate3d(0px, 0px, 0)" },
    leave: { opacity: 0, transform: "translate3d(30px, 0px, 0)" },
    config: { tension: 340, friction: 28 }
  });

  const configModalTransitions = useTransition(isConfigOpen, {
    from: { opacity: 0, transform: "scale(0.96)" },
    enter: { opacity: 1, transform: "scale(1)" },
    leave: { opacity: 0, transform: "scale(0.96)" },
    config: { tension: 340, friction: 28 }
  });

  const triviaModalTransitions = useTransition(isTriviaOpen, {
    from: { opacity: 0, transform: "translate3d(0px, -20px, 0)" },
    enter: { opacity: 1, transform: "translate3d(0px, 0px, 0)" },
    leave: { opacity: 0, transform: "translate3d(0px, -20px, 0)" },
    config: { tension: 340, friction: 28 }
  });

  const setFilterMode = (mode: "all" | "terrestrial" | "gas_giant" | "dwarf_planet" | "stars") => {
    setActiveSectorTab(mode);
    if (mode === "all") {
      setShowSun(true);
      setShowTerrestrial(true);
      setShowGasGiants(true);
      setShowDwarfPlanets(true);
      setShowAsteroidBelt(true);
      setShowKuiperBelt(true);
      setShowNearbyStars(true);
    } else if (mode === "terrestrial") {
      setShowSun(true);
      setShowTerrestrial(true);
      setShowGasGiants(false);
      setShowDwarfPlanets(false);
      setShowAsteroidBelt(true);
      setShowKuiperBelt(false);
    } else if (mode === "gas_giant") {
      setShowSun(true);
      setShowTerrestrial(false);
      setShowGasGiants(true);
      setShowDwarfPlanets(false);
      setShowAsteroidBelt(false);
      setShowKuiperBelt(true);
    } else if (mode === "dwarf_planet") {
      setShowSun(true);
      setShowTerrestrial(false);
      setShowGasGiants(false);
      setShowDwarfPlanets(true);
      setShowAsteroidBelt(true);
      setShowKuiperBelt(true);
    } else if (mode === "stars") {
      setShowNearbyStars(true);
    }
  };

  const selectedTelemetry = useMemo(() => {
    if (!selectedPlanet || !isInspectorOpen || activePlanetTab !== "telemetry") return null;
    return computeLabBodyPosition(
      selectedPlanet,
      uiTimeDays,
      isRealisticOrbits,
      simPlanets,
      customMetaMap
    );
  }, [selectedPlanet, isInspectorOpen, activePlanetTab, uiTimeDays, isRealisticOrbits, simPlanets, customMetaMap]);

  const dynamicMinDistance = useMemo(() => {
    if (selectedPlanet) {
      const rad = isRealisticSize ? selectedPlanet.realisticRadius : selectedPlanet.size;
      return Math.max(0.015, rad * 1.12);
    }
    if (selectedStar) {
      return Math.max(2.0, selectedStar.size * 2.5);
    }
    return 1.5;
  }, [selectedPlanet, selectedStar, isRealisticSize]);

  const dynamicMaxDistance = 8500000;

  // Sequential Auto-Tour list
  const tourTargets = useMemo(() => {
    const list: Array<{ body: any; type: "planet" | "star" }> = [];
    planetsData.forEach((p) => {
      list.push({ body: p, type: "planet" });
    });
    nearbyStarsData.slice(0, 4).forEach((s) => {
      list.push({ body: s, type: "star" });
    });
    return list;
  }, []);

  useEffect(() => {
    if (!isTourActive) return;

    const target = tourTargets[tourIndex];
    if (target) {
      handleVisitBody(target.body, target.type);
    }

    const interval = setInterval(() => {
      setTourIndex((prev) => (prev + 1) % tourTargets.length);
    }, 15000);

    return () => clearInterval(interval);
  }, [isTourActive, tourIndex, tourTargets]);

  if (appSection === "sandbox_lab") {
    return (
      <SandboxLaboratoryView
        onReturnToSolarSystem={() => {
          setAppSection("solar_system");
        }}
      />
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-[#020306] bg-[radial-gradient(ellipse_at_50%_45%,_#0f172a_0%,_#080c16_35%,_#03050a_70%,_#010204_100%)] overflow-hidden select-none font-sans">
      {/* ==========================================
          GLOBAL PREMIUM TRANSITION STYLES
         ========================================== */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* ==========================================
          UNIFIED ZERO-OVERLAP TOP BAR (MOBILE & DESKTOP SAFE)
         ========================================== */}
      {!isCleanView && (
        <header className="fixed top-2.5 left-2.5 right-2.5 md:left-5 md:right-5 z-30 pointer-events-none flex items-center justify-between gap-1.5">
          {/* Left Cluster: Brand + Date + Laboratorio Sandbox + Tour + Ver Datos */}
          <div className="flex items-center gap-1.5 pointer-events-auto flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800/90 px-2.5 py-1.5 rounded-xl shadow-xl backdrop-blur-xl">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-md shadow-cyan-400/50 shrink-0" />
              <span className="text-[11px] sm:text-xs font-mono font-bold text-white tracking-wider whitespace-nowrap">
                ORBITAL LAB
              </span>
              <span className="hidden sm:inline text-[10px] font-mono text-slate-400 border-l border-slate-800 pl-2 whitespace-nowrap">
                <span className="text-cyan-300 font-semibold">{simulatedCalendarDate}</span>
              </span>
            </div>

            {/* Standalone Clean Physics Sandbox Laboratory Mode Switcher */}
            <button
              onClick={() => {
                setAppSection("sandbox_lab");
                showToast("🧪 Entrando al Laboratorio Físico del Espacio");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-rose-500/60 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 hover:text-white text-[11px] sm:text-xs font-mono font-bold transition-all active:scale-95 shadow-xl backdrop-blur-xl whitespace-nowrap group"
              title="Abrir Laboratorio en una sección nueva del espacio limpio para experimentar con astros y física"
            >
              <FlaskConical size={14} className="text-rose-400 group-hover:rotate-12 transition-transform" />
              <span>🧪 Laboratorio Físico</span>
            </button>

            {/* Toggle Tour Automático Button */}
            <button
              onClick={() => {
                setIsTourActive(!isTourActive);
                if (!isTourActive) {
                  setTourIndex(0);
                  showToast("🎬 Tour Automático ACTIVADO");
                } else {
                  showToast("🎬 Tour Automático DESACTIVADO");
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] sm:text-xs font-mono font-bold transition-all active:scale-95 shadow-xl backdrop-blur-xl whitespace-nowrap ${
                isTourActive
                  ? "bg-purple-500/30 border-purple-400/60 text-purple-100 animate-pulse"
                  : "bg-slate-950/90 border-slate-800/90 text-slate-300 hover:text-white hover:border-slate-700"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isTourActive ? "bg-purple-400 animate-pulse" : "bg-slate-500"}`} />
              <span>Tour</span>
            </button>

            {/* Re-open Inspector Pill (integrated into top bar so it NEVER overlaps the right rail) */}
            {!isInspectorOpen && !isTraveling && (selectedPlanet || selectedStar) && (
              <button
                onClick={() => {
                  setIsInspectorOpen(true);
                  setIsLabOpen(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-950/90 hover:bg-slate-900 border border-cyan-500/50 text-cyan-200 rounded-xl shadow-xl backdrop-blur-xl transition-all active:scale-95 text-[11px] font-semibold font-mono whitespace-nowrap"
              >
                <Info size={13} className="text-cyan-400" />
                <span>Ver Ficha</span>
              </button>
            )}
          </div>

          {/* Right Cluster: Adaptive Performance Toggle + Settings Modal Trigger */}
          <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
            <button
              onClick={() => {
                const next = performanceMode === "performance" ? "ultra" : "performance";
                setPerformanceMode(next);
                showToast(
                  next === "performance"
                    ? "⚡ Modo Fluidez Activado (Optimizado para Teléfono y Tablet)"
                    : "✨ Modo Ultra Activado (Máxima Calidad + Bloom)"
                );
              }}
              title="Alternar entre Modo Fluidez (Móvil/Tablet 60 FPS) y Modo Ultra"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border shadow-xl backdrop-blur-xl transition-all active:scale-95 text-[11px] sm:text-xs font-semibold font-mono ${
                performanceMode === "performance"
                  ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
                  : "bg-slate-950/90 hover:bg-slate-900 border-amber-500/40 text-amber-200"
              }`}
            >
              <span>{performanceMode === "performance" ? "⚡ Fluidez" : "✨ Ultra"}</span>
            </button>

            <button
              onClick={() => {
                const next = !isConfigOpen;
                setIsConfigOpen(next);
                if (next) {
                  setIsLabOpen(false);
                  setIsInspectorOpen(false);
                }
              }}
              title="Ajustes de Simulación y Filtros"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border shadow-xl backdrop-blur-xl transition-all active:scale-95 text-[11px] sm:text-xs font-semibold font-mono ${
                isConfigOpen
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-cyan-500/25"
                  : "bg-slate-950/90 hover:bg-slate-900 border-slate-800/90 text-slate-200"
              }`}
            >
              <Sliders size={14} />
              <span className="hidden sm:inline">Ajustes</span>
            </button>
          </div>
        </header>
      )}

      {/* SPACE TRAVEL SLIM HUD PILL */}
      {isTraveling && flightTarget && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-fade-in-up">
          <div className="bg-slate-950/90 border border-cyan-400/80 text-cyan-200 px-4 py-1.5 rounded-xl shadow-2xl backdrop-blur-xl flex items-center gap-2 text-xs font-mono font-medium">
            <Rocket size={13} className="text-cyan-400 animate-bounce shrink-0" />
            <span>En viaje a: <strong className="text-white font-bold">{flightTarget.name}</strong></span>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION BADGE */}
      {toastMessage && !isTraveling && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-fadeIn max-w-[90vw]">
          <div className="bg-slate-950/95 border border-cyan-500/60 text-cyan-200 px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-mono font-medium shadow-2xl backdrop-blur-xl flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <span className="truncate">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* FLOATING RESTORE BUTTON IN CLEAN SPACE VIEW */}
      {isCleanView && (
        <div className="fixed top-3 right-3 md:right-6 z-50 animate-fade-in-up">
          <button
            onClick={() => {
              setIsCleanView(false);
              showToast("👁️ Interfaz Restaurada");
            }}
            title="Salir de Vista Limpia (Restaurar Interfaz) o presiona Esc"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-cyan-500/50 hover:border-cyan-400 text-cyan-300 hover:text-white shadow-2xl backdrop-blur-xl transition-all duration-200 active:scale-95 group"
          >
            <EyeOff size={15} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-mono font-medium tracking-wide">Restaurar Interfaz</span>
          </button>
        </div>
      )}

      {/* ==========================================
          LATERAL FLOATING TOOL RAIL (RIGHT SIDE - AUTO-HIDES ON MOBILE WHEN DRAWER OPEN)
         ========================================== */}
      {!isCleanView && (
        <aside
          className={`fixed top-14 right-2.5 md:right-5 z-20 flex-col items-end gap-1.5 pointer-events-auto animate-fadeIn ${
            isInspectorOpen || isLabOpen ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="flex flex-col items-center gap-1 p-1 rounded-2xl bg-slate-950/90 border border-slate-800/90 shadow-2xl backdrop-blur-xl">
            {/* Quick Toggle: Show / Hide Planetary Orbits */}
            <button
              onClick={() => {
                const next = !showOrbits;
                setShowOrbits(next);
                showToast(next ? "Órbitas Visibles" : "Órbitas Ocultas");
              }}
              title={showOrbits ? "Ocultar Líneas de Órbita" : "Mostrar Líneas de Órbita"}
              className={`p-1.5 sm:p-2 rounded-xl border transition-all active:scale-95 ${
                showOrbits
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-sm"
                  : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400"
              }`}
            >
              <Orbit size={15} />
            </button>

            {/* Quick Toggle: Clean Space View (Modo Zen / Vista Limpia) */}
            <button
              onClick={() => {
                setIsCleanView(true);
                showToast("👁️ Vista Limpia Activada (Espacio Completo)");
              }}
              title="Vista Limpia / Modo Zen"
              className="p-1.5 sm:p-2 rounded-xl border bg-slate-900/60 hover:bg-slate-900 hover:text-cyan-300 border-slate-800 text-slate-400 transition-all active:scale-95 hover:border-cyan-500/50"
            >
              <Eye size={15} />
            </button>

            {/* Quick Toggle: Distance Ruler */}
            <button
              onClick={() => {
                const next = !showDistanceRuler;
                setShowDistanceRuler(next);
                showToast(next ? "Regla de Distancia Astronómica Visible" : "Regla de Distancia Oculta");
              }}
              title={showDistanceRuler ? "Ocultar Regla UA" : "Mostrar Regla de Distancia Astronómica"}
              className={`p-1.5 sm:p-2 rounded-xl border transition-all active:scale-95 ${
                showDistanceRuler
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-sm"
                  : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400"
              }`}
            >
              <Ruler size={15} />
            </button>

            {/* Quick Toggle: 500,000 Gaia DR3 / NASA Stars Field */}
            <button
              onClick={() => {
                const next = !showNearbyStars;
                setShowNearbyStars(next);
                showToast(next ? "500,000 Estrellas (Gaia DR3 / NASA) Visibles" : "Catálogo de 500,000 Estrellas Oculto");
              }}
              title={showNearbyStars ? "Ocultar 500,000 Estrellas" : "Mostrar 500,000 Estrellas"}
              className={`p-1.5 sm:p-2 rounded-xl border transition-all active:scale-95 ${
                showNearbyStars
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm"
                  : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400"
              }`}
            >
              <StarIcon size={15} />
            </button>

            {/* Quick Toggle: Adaptive Grid */}
            <button
              onClick={() => {
                const next = !showGrid;
                setShowGrid(next);
                showToast(next ? "Cuadrícula Adaptable Visible" : "Cuadrícula Oculta");
              }}
              title={showGrid ? "Ocultar Cuadrícula Adaptable" : "Mostrar Cuadrícula Adaptable"}
              className={`p-1.5 sm:p-2 rounded-xl border transition-all active:scale-95 ${
                showGrid
                  ? "bg-sky-500/20 border-sky-500/50 text-sky-300 shadow-sm"
                  : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400"
              }`}
            >
              <GridIcon size={15} />
            </button>

            {/* Play / Pause Toggle */}
            <button
              onClick={() => {
                const next = !isPaused;
                setIsPaused(next);
                showToast(next ? "⏸️ Simulación Pausada" : "▶️ Simulación Reanudada");
              }}
              title={isPaused ? "Reanudar Simulación" : "Pausar Simulación"}
              className={`p-1.5 sm:p-2 rounded-xl border transition-all active:scale-95 ${
                isPaused
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                  : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-300"
              }`}
            >
              {isPaused ? <Play size={15} /> : <Pause size={15} />}
            </button>

            {/* Reset Date & Restore System */}
            <button
              onClick={() => {
                simTimeRef.current = initialDaysSinceJ2000;
                setUiTimeDays(initialDaysSinceJ2000);
                showToast("📅 Efemérides: Restablecido a fecha actual (NASA)");
              }}
              title="Restablecer Efemérides a Fecha Actual de la NASA"
              className="p-1.5 sm:p-2 rounded-xl border bg-slate-900/60 hover:bg-slate-900 hover:text-white border-slate-800 text-slate-400 transition-all active:scale-95"
            >
              <RotateCcw size={15} />
            </button>

            {/* Focus Sun & Smoothly Reset Camera View */}
            <button
              onClick={() => {
                setSelectedPlanet(null);
                setSelectedStar(null);
                setIsFollowing(false);
                setCameraResetKey((prev) => prev + 1);
                showToast("☀️ Vista y zoom centrados en el Sol");
              }}
              title="Centrar Vista y Restablecer Zoom al Sol"
              className="p-1.5 sm:p-2 rounded-xl border bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-amber-400/90 hover:text-amber-300 hover:border-amber-500/50 transition-all active:scale-95"
            >
              <SunIcon size={15} />
            </button>

            {/* Trivia facts */}
            <button
              onClick={() => {
                const next = !isTriviaOpen;
                setIsTriviaOpen(next);
                if (next) {
                  setIsLabOpen(false);
                  setIsInspectorOpen(false);
                }
              }}
              title="Dato Curioso Espacial"
              className={`p-1.5 sm:p-2 rounded-xl border transition-all active:scale-95 ${
                isTriviaOpen
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                  : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400"
              }`}
            >
              <Sparkles size={15} />
            </button>
          </div>
        </aside>
      )}

      {/* ==========================================
          INTERACTIVE ASTROPHYSICS & COLLISION LABORATORY DRAWER
         ========================================== */}
      {!isCleanView && (
        <PhysicsLabDrawer
          isOpen={isLabOpen}
          onClose={() => setIsLabOpen(false)}
          allPlanets={visiblePlanets}
          destroyedNames={destroyedNames}
          customMetaMap={customMetaMap}
          isCollisionEnabled={isCollisionEnabled}
          setIsCollisionEnabled={setIsCollisionEnabled}
          collisionMode={collisionMode}
          setCollisionMode={setCollisionMode}
          collisionSensitivity={collisionSensitivity}
          setCollisionSensitivity={setCollisionSensitivity}
          collisionLogs={collisionLogs}
          onSpawnBody={handleSpawnBody}
          onUpdatePlanet={handleUpdatePlanet}
          onUpdateMeta={handleUpdateMeta}
          onDeleteBody={handleDeleteBody}
          onRestoreAll={handleRestoreAll}
          onTriggerScenario={handleTriggerScenario}
          onLaunchIntercept={handleLaunchIntercept}
          selectedPlanetName={selectedPlanet?.name || null}
          onSelectPlanetByName={(name) => {
            const found = visiblePlanets.find((p) => p.name === name);
            if (found) {
              setSelectedPlanet(found);
              setSelectedStar(null);
            }
          }}
        />
      )}

      {/* ==========================================
          3D GRAPHICS ENGINE (ADAPTIVE DPR & ZERO-ALLOCATION 60FPS LOOP)
         ========================================== */}
      <Canvas
        dpr={performanceMode === "performance" ? [1, 1.25] : [1, 2]}
        gl={{
          powerPreference: "high-performance",
          antialias: performanceMode === "ultra"
        }}
        camera={{ position: [0, 95, 220], fov: 50, near: 0.1, far: 16000000 }}
        raycaster={{ far: 16000000 }}
      >
        <Suspense fallback={null}>
          <SimulationClock
            simTimeRef={simTimeRef}
            isPaused={isPaused}
            simSpeed={simSpeed}
            onSyncUiDays={setUiTimeDays}
          />
          <DynamicAmbientLight enabled={isAmbientLightEnabled} baseIntensity={0.45} />
          <DynamicSunLight baseIntensity={sunIntensity} />

          {/* REAL-TIME KEPLERIAN COLLISION DETECTOR */}
          <CollisionPhysicsEngine
            enabled={isCollisionEnabled}
            isPaused={isPaused}
            planets={visiblePlanets}
            simTimeRef={simTimeRef}
            isRealisticOrbits={isRealisticOrbits}
            isRealisticSize={isRealisticSize}
            collisionSensitivity={collisionSensitivity}
            customMetaMap={customMetaMap}
            onCollisionDetected={handleCollisionDetected}
          />

          {/* 3D FIREBALL, SHOCKWAVE RINGS & DEBRIS EXPLOSIONS */}
          <ExplosionEffects3D explosions={explosions} />

          {visiblePlanets.map((planet) => (
            <PlanetMesh
              key={planet.name}
              planet={planet}
              allPlanets={visiblePlanets}
              customMetaMap={customMetaMap}
              simTimeRef={simTimeRef}
              onClick={(p) => {
                setSelectedPlanet(p);
                setSelectedStar(null);
                setIsInspectorOpen(true);
                setIsLabOpen(false);
                setActivePlanetTab("summary");
              }}
              showOrbits={showOrbits}
              isRealisticSize={isRealisticSize}
              isRealisticOrbits={isRealisticOrbits}
              axialSpeed={isPaused ? 0 : axialSpeed}
              showTrails={showTrails}
              textures={textures}
              ringTexture={ringTexture}
              cloudsTexture={cloudsTexture}
              selectedPlanet={selectedPlanet}
              showStarLabels={showStarLabels}
            />
          ))}

          {/* 500,000 GAIA DR3 / NASA STARS (GPU POINT SPRITES) */}
          <NearbyStarsField
            visible={showNearbyStars}
            showLabels={showStarLabels}
            showStarFlicker={showStarFlicker}
            onSelectStar={(s) => {
              setSelectedStar(s);
              setSelectedPlanet(null);
              setIsInspectorOpen(true);
              setIsLabOpen(false);
            }}
            selectedStar={selectedStar}
          />

          <AstronomicalDistanceRuler
            visible={showDistanceRuler}
            selectedPlanet={selectedPlanet}
            simTimeRef={simTimeRef}
            isRealisticOrbits={isRealisticOrbits}
          />

          <AsteroidAndKuiperBelts
            isRealisticSize={isRealisticSize}
            isRealisticOrbits={isRealisticOrbits}
            showAsteroidBelt={showAsteroidBelt}
            showKuiperBelt={showKuiperBelt}
          />

          {/* DYNAMIC ZOOM-ADAPTIVE GRID */}
          <AdaptiveSpaceGrid visible={showGrid} />

          {/* SMART PROXIMITY TOUCH/CLICK PICKER */}
          <ProximityRaycastPicker
            planets={visiblePlanets}
            customMetaMap={customMetaMap}
            showNearbyStars={showNearbyStars}
            onSelectPlanet={(p) => {
              setSelectedPlanet(p);
              setSelectedStar(null);
              setIsInspectorOpen(true);
              setIsLabOpen(false);
              setActivePlanetTab("summary");
            }}
            onSelectStar={(s) => {
              setSelectedStar(s);
              setSelectedPlanet(null);
              setIsInspectorOpen(true);
              setIsLabOpen(false);
            }}
            simTimeRef={simTimeRef}
            isRealisticOrbits={isRealisticOrbits}
            isRealisticSize={isRealisticSize}
          />

          {/* SPATIAL DIRECTION RETICLE COMPASS */}
          <TargetCompass
            selectedPlanet={selectedPlanet}
            selectedStar={selectedStar}
            simTimeRef={simTimeRef}
            isRealisticOrbits={isRealisticOrbits}
          />

          <OrbitControls
            ref={controlsRef}
            enabled={!isTraveling}
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            enableDamping={true}
            dampingFactor={0.06}
            zoomSpeed={1.5}
            rotateSpeed={0.8}
            minDistance={dynamicMinDistance}
            maxDistance={dynamicMaxDistance}
          />

          <CameraManager
            controlsRef={controlsRef}
            selectedPlanet={selectedPlanet}
            selectedStar={selectedStar}
            isFollowing={isFollowing}
            simTimeRef={simTimeRef}
            isRealisticOrbits={isRealisticOrbits}
            cameraResetKey={cameraResetKey}
            flightTarget={flightTarget}
            onFlightComplete={handleFlightComplete}
            allPlanets={visiblePlanets}
            customMetaMap={customMetaMap}
          />

          {/* HIGH-FIDELITY ATMOSPHERIC GLOW EFFECTS (SKIPPED IN PERFORMANCE MODE FOR MOBILE GPU FLUIDITY) */}
          {performanceMode === "ultra" && (
            <EffectComposer>
              <Bloom
                intensity={1.25}
                luminanceThreshold={0.15}
                luminanceSmoothing={0.7}
                mipmapBlur
              />
            </EffectComposer>
          )}
        </Suspense>
      </Canvas>

      {inspectorPlanetTransitions((style, item) => {
        if (!item || isTraveling || isCleanView) return null;
        const dbRecord = PLANET_EXTENDED_DATABASE[item.name];
        const customMeta = customMetaMap[item.name];
        return (
          <a.div
            style={style}
            className="fixed top-14 left-2.5 sm:left-auto sm:right-16 bg-slate-950/95 text-slate-100 p-4 sm:p-5 rounded-2xl border border-slate-700/70 w-[calc(100vw-20px)] sm:w-[410px] max-h-[calc(100dvh-9rem)] overflow-hidden flex flex-col z-30 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full shadow-lg shrink-0" style={{ backgroundColor: item.color }} />
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white">{item.displayName || item.name}</h2>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-semibold">
                    {item.categoryLabel} • Base NASA/JPL
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlanet(null)}
                className="text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 p-1.5 rounded-xl border border-slate-700/50 transition-all text-xs"
              >
                <X size={16} />
              </button>
            </div>

            {/* VISITAR PROMINENT ACTION BUTTON */}
            <div className="pt-3 pb-1">
              <button
                onClick={() => handleVisitBody(item, "planet")}
                className="w-full py-2 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs font-mono flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
              >
                <Rocket size={15} />
                <span>Visitar</span>
              </button>
            </div>

            <div className="flex items-center gap-1 pt-2 pb-2 border-b border-slate-800/80 overflow-x-auto">
              <button
                onClick={() => setActivePlanetTab("summary")}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-medium rounded-xl whitespace-nowrap transition-all ${
                  activePlanetTab === "summary"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Ficha
              </button>
              <button
                onClick={() => setActivePlanetTab("telemetry")}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-medium rounded-xl whitespace-nowrap transition-all ${
                  activePlanetTab === "telemetry"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Órbita
              </button>
              <button
                onClick={() => setActivePlanetTab("structure")}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-medium rounded-xl whitespace-nowrap transition-all ${
                  activePlanetTab === "structure"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Geología
              </button>
              <button
                onClick={() => setActivePlanetTab("moons")}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-medium rounded-xl whitespace-nowrap transition-all ${
                  activePlanetTab === "moons"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Lunas ({item.moons?.length || 0})
              </button>
              <button
                onClick={() => setActivePlanetTab("missions")}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-medium rounded-xl whitespace-nowrap transition-all ${
                  activePlanetTab === "missions"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Misiones
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3 custom-scrollbar pr-1">
              {activePlanetTab === "summary" && (
                <div className="space-y-3 animate-fadeIn">
                  <p className="text-xs text-slate-300 leading-relaxed">{item.details}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">RADIO MEDIO</span>
                      <span className="text-cyan-300 font-bold">
                        {dbRecord?.meanRadiusKm || `${Math.round(item.size * 6371)} km`}
                      </span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">MASA RELATIVA / ABS</span>
                      <span className="text-cyan-300 font-bold">
                        {customMeta ? `${customMeta.massEarths} M⊕` : dbRecord?.massKg || "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">GRAVEDAD SUPERFICIAL</span>
                      <span className="text-emerald-300 font-bold">
                        {customMeta ? `${customMeta.gravityMs2} m/s²` : dbRecord?.gravityMs2 || "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">VELOCIDAD DE ESCAPE</span>
                      <span className="text-emerald-300 font-bold">
                        {dbRecord?.escapeVelocityKms || `${customMeta?.escapeVelocityKms || 11.2} km/s`}
                      </span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">DENSIDAD MEDIA</span>
                      <span className="text-amber-300 font-bold">
                        {dbRecord?.meanDensityGcm3 || `${customMeta?.densityGcm3 || 5.2} g/cm³`}
                      </span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">TEMPERATURA MEDIA</span>
                      <span className="text-amber-300 font-bold">{item.temp} °C</span>
                    </div>
                  </div>

                  {dbRecord && (
                    <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 space-y-1.5 text-[11px]">
                      <div className="flex justify-between font-mono gap-2">
                        <span className="text-slate-400 shrink-0">Albedo:</span>
                        <span className="text-cyan-300 font-semibold text-right">{dbRecord.albedo}</span>
                      </div>
                      <div className="flex justify-between font-mono gap-2">
                        <span className="text-slate-400 shrink-0">Presión Superficial:</span>
                        <span className="text-amber-300 font-semibold text-right">{dbRecord.surfacePressure}</span>
                      </div>
                      <div className="flex justify-between font-mono gap-2">
                        <span className="text-slate-400 shrink-0">Anillos:</span>
                        <span className="text-slate-200 font-semibold text-right">{dbRecord.ringSystem}</span>
                      </div>
                      <div className="pt-1 border-t border-slate-800/80 text-slate-300">
                        <span className="text-[9px] font-mono uppercase text-purple-300 block font-bold">
                          Campo Magnético / Magnetósfera
                        </span>
                        <p className="text-[11px] text-slate-300 leading-snug mt-0.5">{dbRecord.magneticField}</p>
                      </div>
                      <div className="pt-1 border-t border-slate-800/80 text-slate-400 text-[10px] font-mono">
                        Registro: <span className="text-slate-200">{dbRecord.discoveryInfo}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activePlanetTab === "telemetry" && (
                <div className="space-y-2.5 animate-fadeIn">
                  <div className="bg-slate-900/90 p-3 rounded-2xl border border-purple-500/30 space-y-2">
                    <span className="text-[10px] font-mono text-purple-300 font-bold uppercase tracking-wider block">
                      Efemérides Keplerianas (NASA JPL J2000)
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                      <div>
                        <span className="text-slate-400 block text-[9px]">SEMIEJE MAYOR (a)</span>
                        <span className="text-cyan-300 font-semibold">{item.semiMajorAU} UA</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">PERÍODO ORBITAL</span>
                        <span className="text-cyan-300 font-semibold">{item.period} Días</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">EXCENTRICIDAD (e)</span>
                        <span className="text-white font-semibold">{item.eccentricity}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">INCLINACIÓN ORBITAL</span>
                        <span className="text-white font-semibold">{item.inclination}°</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">PERIHELIO</span>
                        <span className="text-amber-300 font-semibold">{dbRecord?.perihelionAU || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">AFELIO</span>
                        <span className="text-amber-300 font-semibold">{dbRecord?.aphelionAU || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">VELOCIDAD ORBITAL</span>
                        <span className="text-emerald-300 font-semibold">{item.velocity} km/s</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">ROTACIÓN AXIAL ({item.axialTilt}°)</span>
                        <span className="text-cyan-300 font-semibold">
                          {Math.abs(item.rotPeriodHours)} h {item.rotPeriodHours < 0 ? "(Retróg.)" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedTelemetry && item.semiMajorAU > 0 && (
                    <div className="bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800 space-y-1 text-[11px] font-mono">
                      <div className="flex justify-between text-slate-400">
                        <span>Anomalía Verdadera (θ):</span>
                        <span className="text-purple-300 font-bold">{selectedTelemetry.trueAnomalyDeg.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Tiempo Luz desde el Sol:</span>
                        <span className="text-emerald-400 font-bold">{(item.semiMajorAU * 8.317).toFixed(1)} min</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Distancia Media al Sol:</span>
                        <span className="text-cyan-300 font-bold">{(item.semiMajorAU * 149.59787).toFixed(2)} M km</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activePlanetTab === "structure" && (
                <div className="space-y-2.5 animate-fadeIn text-xs">
                  <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">
                      Composición Interna y Manto
                    </span>
                    <p className="text-slate-300 leading-relaxed">{item.composition}</p>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-amber-400 font-bold uppercase block">
                      Atmósfera y Dinámica Climática
                    </span>
                    <p className="text-slate-300 leading-relaxed">{item.atmosphere}</p>
                  </div>

                  {dbRecord && dbRecord.chemicalBreakdown.length > 0 && (
                    <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">
                        Abundancia Química Principal (%)
                      </span>
                      <div className="space-y-1.5">
                        {dbRecord.chemicalBreakdown.map((c, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-[11px] font-mono">
                              <span className="text-slate-200">{c.element}</span>
                              <span className="text-amber-300 font-bold">{c.percentage}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(100, c.percentage)}%`, backgroundColor: c.color }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dbRecord && dbRecord.geologyHighlights.length > 0 && (
                    <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase block">
                        Rasgos Geológicos & Planetarios Destacados
                      </span>
                      <ul className="space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                        {dbRecord.geologyHighlights.map((h, i) => (
                          <li key={i} className="leading-snug">{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {activePlanetTab === "moons" && (
                <div className="space-y-2 animate-fadeIn">
                  {dbRecord && (
                    <div className="bg-slate-900/60 px-3 py-2 rounded-xl border border-slate-800 flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400">Satélites Confirmados (UAI/NASA):</span>
                      <span className="text-cyan-300 font-bold">{dbRecord.knownMoonsTotal}</span>
                    </div>
                  )}
                  {item.moons && item.moons.length > 0 ? (
                    item.moons.map((moon: any, idx: number) => {
                      const moonDb = MOON_SCIENTIFIC_DATABASE[moon.name];
                      const isExpanded = expandedMoonName === moon.name;
                      return (
                        <div
                          key={idx}
                          className="bg-slate-900/85 rounded-xl border border-slate-800 overflow-hidden transition-all"
                        >
                          <button
                            onClick={() => setExpandedMoonName(isExpanded ? null : moon.name)}
                            className="w-full flex items-center justify-between text-xs px-3 py-2.5 hover:bg-slate-800/60 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: moon.color || "#94a3b8" }}
                              />
                              <span className="text-slate-100 font-semibold">{moon.name}</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-[10px] font-mono text-slate-400">
                              <span>R: {moon.radiusKm} km</span>
                              <span className="text-cyan-400 font-semibold">{moon.distance} UA</span>
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </div>
                          </button>
                          {isExpanded && moonDb && (
                            <div className="px-3 pb-3 pt-1 border-t border-slate-800/80 bg-slate-950/60 space-y-1.5 text-[11px]">
                              <p className="text-slate-300 leading-snug">{moonDb.highlight}</p>
                              <div className="text-[10px] font-mono text-slate-400 pt-1">
                                <span className="text-cyan-300 font-semibold">Período Orbital:</span> {moonDb.periodDays}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">
                                <span className="text-emerald-300 font-semibold">Composición:</span> {moonDb.composition}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-500 italic py-4 text-center">
                      Este astro no posee satélites naturales confirmados.
                    </p>
                  )}
                </div>
              )}

              {activePlanetTab === "missions" && (
                <div className="space-y-2 animate-fadeIn">
                  {dbRecord && dbRecord.spaceMissions.length > 0 ? (
                    dbRecord.spaceMissions.map((m, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900/85 p-3 rounded-2xl border border-slate-800 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{m.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                            {m.year}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-amber-300 block">{m.agency}</span>
                        <p className="text-[11px] text-slate-300 leading-snug pt-0.5">{m.achievement}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic py-4 text-center">
                      Sin registros de misiones en la base local.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-mono">
                <input
                  type="checkbox"
                  checked={isFollowing}
                  onChange={(e) => setIsFollowing(e.target.checked)}
                  className="rounded accent-cyan-500 focus:ring-0 cursor-pointer"
                />
                Fijar Cámara
              </label>
              <button
                onClick={() => setIsInspectorOpen(false)}
                className="text-xs px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700/60 transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          </a.div>
        );
      })}

      {inspectorStarTransitions((style, star) => {
        if (!star || isTraveling || isCleanView) return null;
        const astro = getStarAstrophysicsProfile(star);
        return (
          <a.div
            style={style}
            className="fixed top-14 left-2.5 sm:left-auto sm:right-16 bg-slate-950/95 text-slate-100 p-4 sm:p-5 rounded-2xl border border-amber-500/50 w-[calc(100vw-20px)] sm:w-[410px] max-h-[calc(100dvh-9rem)] overflow-hidden flex flex-col z-30 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full shadow-lg shrink-0" style={{ backgroundColor: star.color }} />
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white">{star.displayName}</h2>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-semibold">
                    {astro.evolutionaryStage} • {star.constellation}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedStar(null)}
                className="text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 p-1.5 rounded-xl border border-slate-700/50 transition-all text-xs"
              >
                <X size={16} />
              </button>
            </div>

            {/* VISITAR ESTRELLA PROMINENT ACTION BUTTON */}
            <div className="pt-3 pb-2">
              <button
                onClick={() => handleVisitBody(star, "star")}
                className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs font-mono flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 active:scale-95 transition-all"
              >
                <Rocket size={16} />
                <span>Visitar</span>
              </button>
            </div>

            {/* STAR DATABASE TABS */}
            <div className="flex items-center gap-1 pt-1 pb-2 border-b border-slate-800/80">
              <button
                onClick={() => setActiveStarTab("astrophysics")}
                className={`flex-1 py-1.5 text-[11px] font-mono font-medium rounded-xl transition-all ${
                  activeStarTab === "astrophysics"
                    ? "bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Astrofísica
              </button>
              <button
                onClick={() => setActiveStarTab("gaia")}
                className={`flex-1 py-1.5 text-[11px] font-mono font-medium rounded-xl transition-all ${
                  activeStarTab === "gaia"
                    ? "bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Astrometría Gaia
              </button>
              <button
                onClick={() => setActiveStarTab("exoplanets")}
                className={`flex-1 py-1.5 text-[11px] font-mono font-medium rounded-xl transition-all ${
                  activeStarTab === "exoplanets"
                    ? "bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Zona Habitable
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3 custom-scrollbar pr-1">
              {activeStarTab === "astrophysics" && (
                <div className="space-y-3 animate-fadeIn">
                  <p className="text-xs text-slate-300 leading-relaxed">{star.details}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">TIPO ESPECTRAL MK</span>
                      <span className="text-cyan-300 font-bold">{star.spectralType}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">TEMPERATURA EFECTIVA</span>
                      <span className="text-amber-300 font-bold">{astro.effectiveTempK}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">LUMINOSIDAD BOLOMÉTRICA</span>
                      <span className="text-amber-300 font-bold">{astro.luminositySolar}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">MASA ESTELAR</span>
                      <span className="text-emerald-300 font-bold">{astro.massSolar}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">RADIO ESTELAR</span>
                      <span className="text-cyan-300 font-bold">{astro.radiusSolar}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">EDAD ESTIMADA</span>
                      <span className="text-slate-200 font-bold">{astro.ageGyr}</span>
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">Etapa Evolutiva:</span>
                      <span className="text-amber-300 font-semibold text-right">{astro.evolutionaryStage}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeStarTab === "gaia" && (
                <div className="space-y-2.5 animate-fadeIn text-xs font-mono">
                  <div className="bg-slate-900/90 p-3 rounded-2xl border border-amber-500/30 space-y-2">
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">
                      Parámetros Astrométricos (ESA Gaia DR3 / Hipparcos)
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[9px]">DISTANCIA (AÑOS LUZ)</span>
                        <span className="text-amber-300 font-bold">{star.distanceLy} al</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">DISTANCIA (PÁRSECS)</span>
                        <span className="text-cyan-300 font-bold">{astro.distanceParsecs}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">PARALAJE ESTELAR (ϖ)</span>
                        <span className="text-emerald-300 font-bold">{astro.parallaxMas}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">DISTANCIA EN KM</span>
                        <span className="text-slate-200 font-bold">{astro.distanceTrillionKm}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">ASCENSIÓN RECTA (α)</span>
                        <span className="text-white font-semibold">{star.raDeg.toFixed(4)}°</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">DECLINACIÓN (δ)</span>
                        <span className="text-white font-semibold">{star.decDeg.toFixed(4)}°</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">MAGNITUD APARENTE (m_V)</span>
                        <span className="text-amber-300 font-semibold">{astro.apparentMagnitude}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">MAGNITUD ABSOLUTA (M_V)</span>
                        <span className="text-purple-300 font-semibold">{astro.absoluteMagnitude}</span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px]">
                      <span className="text-slate-400">Velocidad Radial Heliocéntrica:</span>
                      <span className="text-cyan-300 font-bold">{astro.radialVelocityKms}</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[9px] text-slate-400 block mb-1">IDENTIFICADORES DE CATÁLOGO CRUZADOS</span>
                    <span className="text-[10px] text-slate-200 font-mono">{astro.catalogCrossRefs}</span>
                  </div>
                </div>
              )}

              {activeStarTab === "exoplanets" && (
                <div className="space-y-2.5 animate-fadeIn text-xs">
                  <div className="bg-slate-900/90 p-3 rounded-2xl border border-emerald-500/30 space-y-2">
                    <span className="text-[10px] font-mono text-emerald-300 font-bold uppercase tracking-wider block">
                      Zona Habitable Circunestelar (Kopparapu / NASA)
                    </span>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      Región orbital donde un planeta rocoso con atmósfera recibiría flujo estelar compatible con agua líquida superficial según la luminosidad de <span className="text-white font-semibold">{star.displayName}</span>:
                    </p>
                    <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 font-mono text-xs">
                      <span className="text-[9px] text-slate-400 block">RANGO DE ZONA HABITABLE ESTIMADA</span>
                      <span className="text-emerald-300 font-bold">{astro.habitableZoneAU}</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/85 p-3 rounded-2xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-purple-300 font-bold uppercase block">
                      Archivo Exoplanetario NASA/IPAC & TESS
                    </span>
                    <p className="text-[11px] text-slate-200 leading-relaxed">{astro.exoplanetSystem}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-mono">
                <input
                  type="checkbox"
                  checked={isFollowing}
                  onChange={(e) => setIsFollowing(e.target.checked)}
                  className="rounded accent-amber-500 focus:ring-0 cursor-pointer"
                />
                Fijar Cámara
              </label>
              <button
                onClick={() => setIsInspectorOpen(false)}
                className="text-xs px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700/60 transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          </a.div>
        );
      })}

      {/* ==========================================
          SETTINGS & FILTERS MODAL
         ========================================== */}
      {configModalTransitions((style, show) => show && !isCleanView && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
          <a.div
            style={style}
            className="bg-slate-950/95 text-slate-100 p-5 rounded-3xl border border-slate-800 w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-cyan-400" />
                <h3 className="font-bold text-sm tracking-wider text-white font-mono uppercase">
                  Centro de Control & Física
                </h3>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-1 pt-3 pb-2 border-b border-slate-800/80">
              <button
                onClick={() => setConfigTab("physics")}
                className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-xl transition-all ${
                  configTab === "physics"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Física & Órbitas
              </button>
              <button
                onClick={() => setConfigTab("sectors")}
                className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-xl transition-all ${
                  configTab === "sectors"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Filtros Sectores
              </button>
              <button
                onClick={() => setConfigTab("visuals")}
                className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-xl transition-all ${
                  configTab === "visuals"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Visualización
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3.5 custom-scrollbar pr-1 text-xs">
              {configTab === "physics" && (
                <div className="space-y-3.5 animate-fadeIn">
                  <div className="bg-slate-900/80 p-3 rounded-2xl border border-purple-900/40 space-y-2.5">
                    <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider block">
                      Dinámica Kepleriana
                    </span>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Órbitas Elípticas Reales (NASA)</span>
                      <input
                        type="checkbox"
                        checked={isRealisticOrbits}
                        onChange={(e) => setIsRealisticOrbits(e.target.checked)}
                        className="rounded accent-purple-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Escala de Tamaño Realista</span>
                      <input
                        type="checkbox"
                        checked={isRealisticSize}
                        onChange={(e) => setIsRealisticSize(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                  </div>

                  <div className="space-y-3">
                    <label className="block">
                      <div className="flex justify-between text-[11px] mb-1 text-slate-400">
                        <span>Velocidad de Simulación Temporal</span>
                        <span className="font-mono text-cyan-400">{simSpeed}x</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={simSpeed}
                        onChange={(e) => setSimSpeed(Number(e.target.value))}
                        className="w-full accent-cyan-500 cursor-pointer"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[11px] mb-1 text-slate-400">
                        <span>Multiplicador Rotación Axial</span>
                        <span className="font-mono text-cyan-400">{axialSpeed}x</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.1"
                        value={axialSpeed}
                        onChange={(e) => setAxialSpeed(Number(e.target.value))}
                        className="w-full accent-cyan-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              )}

              {configTab === "sectors" && (
                <div className="space-y-2.5 animate-fadeIn">
                  <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 space-y-2.5">
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        Planetas Terrestres (Rocosos)
                      </span>
                      <input
                        type="checkbox"
                        checked={showTerrestrial}
                        onChange={(e) => setShowTerrestrial(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400" />
                        Gigantes Gaseosos y Helados
                      </span>
                      <input
                        type="checkbox"
                        checked={showGasGiants}
                        onChange={(e) => setShowGasGiants(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        Planetas Enanos (Ceres, Plutón, Eris...)
                      </span>
                      <input
                        type="checkbox"
                        checked={showDwarfPlanets}
                        onChange={(e) => setShowDwarfPlanets(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-300" />
                        500,000 Estrellas (Catálogo Gaia DR3 / ESA / NASA)
                      </span>
                      <input
                        type="checkbox"
                        checked={showNearbyStars}
                        onChange={(e) => setShowNearbyStars(e.target.checked)}
                        className="rounded accent-amber-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-yellow-400" />
                        Sol (Estrella Central)
                      </span>
                      <input
                        type="checkbox"
                        checked={showSun}
                        onChange={(e) => setShowSun(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Cinturón de Asteroides (2.2 - 3.2 UA)
                      </span>
                      <input
                        type="checkbox"
                        checked={showAsteroidBelt}
                        onChange={(e) => setShowAsteroidBelt(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        Cinturón de Kuiper (30 - 55 UA)
                      </span>
                      <input
                        type="checkbox"
                        checked={showKuiperBelt}
                        onChange={(e) => setShowKuiperBelt(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              )}

              {configTab === "visuals" && (
                <div className="space-y-2.5 animate-fadeIn">
                  <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 space-y-2.5">
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Efecto Titileo Estelar (GPU)</span>
                      <input
                        type="checkbox"
                        checked={showStarFlicker}
                        onChange={(e) => setShowStarFlicker(e.target.checked)}
                        className="rounded accent-amber-400 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Cuadrícula Adaptable (Grid LOD)</span>
                      <input
                        type="checkbox"
                        checked={showGrid}
                        onChange={(e) => setShowGrid(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Nombres / Etiquetas de Estrellas</span>
                      <input
                        type="checkbox"
                        checked={showStarLabels}
                        onChange={(e) => setShowStarLabels(e.target.checked)}
                        className="rounded accent-amber-400 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Regla de Distancia Astronómica (UA)</span>
                      <input
                        type="checkbox"
                        checked={showDistanceRuler}
                        onChange={(e) => setShowDistanceRuler(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Líneas de Órbita</span>
                      <input
                        type="checkbox"
                        checked={showOrbits}
                        onChange={(e) => setShowOrbits(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Estelas Orbitales (Trails)</span>
                      <input
                        type="checkbox"
                        checked={showTrails}
                        onChange={(e) => setShowTrails(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-slate-200">
                      <span>Luz Ambiental</span>
                      <input
                        type="checkbox"
                        checked={isAmbientLightEnabled}
                        onChange={(e) => setIsAmbientLightEnabled(e.target.checked)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                    </label>
                  </div>

                  <label className="block pt-1">
                    <div className="flex justify-between text-[11px] mb-1 text-slate-400">
                      <span>Intensidad Solar</span>
                      <span className="font-mono text-amber-400">{sunIntensity}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="8"
                      step="0.2"
                      value={sunIntensity}
                      onChange={(e) => setSunIntensity(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsConfigOpen(false)}
                className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-cyan-400 transition-colors"
              >
                Listo
              </button>
            </div>
          </a.div>
        </div>
      ))}

      {/* TRIVIA MODAL */}
      {triviaModalTransitions((style, show) => show && !isCleanView && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
          <a.div style={style} className="bg-slate-950/95 text-slate-100 p-5 rounded-3xl border border-purple-500/40 w-full max-w-md shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-400" />
                <h3 className="font-bold text-xs tracking-wider text-purple-400 uppercase font-mono">Dato Curioso Espacial</h3>
              </div>
              <button onClick={() => setIsTriviaOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed py-2">
              "{currentTrivia}"
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={() => setCurrentTrivia(trivia[Math.floor(Math.random() * trivia.length)])}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-mono font-semibold"
              >
                Siguiente Dato ({trivia.length} registros) ↻
              </button>
              <button onClick={() => setIsTriviaOpen(false)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs">
                Cerrar
              </button>
            </div>
          </a.div>
        </div>
      ))}

      {/* ==========================================
          UNIFIED BOTTOM DOCK (ZERO-OVERLAP + NETLIFY BADGE SAFE CLEARANCE)
         ========================================== */}
      {!isTraveling && !isCleanView && (
        <footer className="fixed bottom-3.5 sm:bottom-5 left-0 w-full z-20 px-2.5 sm:px-6 pb-[env(safe-area-inset-bottom,0px)] flex justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-1.5 pointer-events-auto w-full max-w-[calc(100vw-20px)] sm:w-auto sm:max-w-[82vw]">
            {/* Top Bar of Dock: Integrated Scale Indicator + Expand/Collapse Toggle */}
            <div className="flex items-center gap-1.5 self-center">
              <button
                onClick={() => {
                  const next = !isRealisticSize;
                  setIsRealisticSize(next);
                  showToast(next ? "📏 Escala a Tamaño Real Activada" : "📏 Escala Didáctica Activada");
                }}
                title="Alternar entre Escala Didáctica y Escala de Tamaño Real"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-slate-800/90 text-[10px] font-mono text-slate-300 backdrop-blur-xl shadow-lg transition-all active:scale-95"
              >
                <span className="h-1.5 w-3.5 rounded bg-cyan-400" />
                <span>{isRealisticSize ? "Escala Real (1px≈1200km)" : "Escala Didáctica"}</span>
              </button>

              <button
                onClick={() => setIsBottomDockExpanded(!isBottomDockExpanded)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-slate-800/90 text-[10px] font-mono text-slate-300 hover:text-cyan-300 backdrop-blur-xl shadow-lg transition-all active:scale-95"
              >
                <span>{isBottomDockExpanded ? "Ocultar Barra" : "Mostrar Astros"}</span>
                {isBottomDockExpanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </button>
            </div>

            {isBottomDockExpanded && (
              <div className="flex flex-col items-center gap-1.5 bg-slate-950/90 border border-slate-800/90 p-1.5 sm:p-2 rounded-2xl shadow-2xl backdrop-blur-xl animate-fadeIn w-full overflow-hidden">
                {/* Sector Filters */}
                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900/70 border border-slate-800/70 overflow-x-auto w-full sm:w-auto custom-scrollbar">
                  <button
                    onClick={() => setFilterMode("all")}
                    className={`px-2.5 py-1 text-[10px] sm:text-[11px] rounded-lg font-medium whitespace-nowrap transition-all ${
                      activeSectorTab === "all"
                        ? "bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🌌 Sistema Solar ({visiblePlanets.length})
                  </button>
                  <button
                    onClick={() => setFilterMode("terrestrial")}
                    className={`px-2.5 py-1 text-[10px] sm:text-[11px] rounded-lg font-medium whitespace-nowrap transition-all ${
                      activeSectorTab === "terrestrial"
                        ? "bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🪨 Terrestres ({visiblePlanets.filter((p) => p.category === "terrestrial").length})
                  </button>
                  <button
                    onClick={() => setFilterMode("gas_giant")}
                    className={`px-2.5 py-1 text-[10px] sm:text-[11px] rounded-lg font-medium whitespace-nowrap transition-all ${
                      activeSectorTab === "gas_giant"
                        ? "bg-indigo-500 text-slate-950 font-bold shadow-sm shadow-indigo-500/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🪐 Gaseosos ({visiblePlanets.filter((p) => p.category === "gas_giant").length})
                  </button>
                  <button
                    onClick={() => setFilterMode("dwarf_planet")}
                    className={`px-2.5 py-1 text-[10px] sm:text-[11px] rounded-lg font-medium whitespace-nowrap transition-all ${
                      activeSectorTab === "dwarf_planet"
                        ? "bg-cyan-400 text-slate-950 font-bold shadow-sm shadow-cyan-400/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    ❄️ Enanos ({visiblePlanets.filter((p) => p.category === "dwarf_planet").length})
                  </button>
                  <button
                    onClick={() => setFilterMode("stars")}
                    className={`px-2.5 py-1 text-[10px] sm:text-[11px] rounded-lg font-medium whitespace-nowrap transition-all ${
                      activeSectorTab === "stars"
                        ? "bg-amber-400 text-slate-950 font-bold shadow-sm shadow-amber-400/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    ⭐ 500k Estrellas (Gaia DR3)
                  </button>
                </div>

                {/* Star Search Bar (Only visible when activeSectorTab === 'stars') */}
                {activeSectorTab === "stars" && (
                  <div className="w-full px-0.5">
                    <div className="relative w-full">
                      <input
                        type="text"
                        value={starSearchQuery}
                        onChange={(e) => setStarSearchQuery(e.target.value)}
                        placeholder="🔎 Buscar entre 500,000 estrellas (ej. Gaia DR3, Gliese, Kepler, Sirius, VY Canis Majoris)..."
                        className="w-full bg-slate-900/90 border border-slate-700/80 text-slate-200 text-xs px-3 py-1.5 rounded-xl focus:outline-none focus:border-amber-400 placeholder:text-slate-500 font-mono shadow-inner"
                      />
                      {starSearchQuery && (
                        <button
                          onClick={() => setStarSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-mono"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Compact Horizontal Selector */}
                <div className="flex items-center gap-1 w-full overflow-x-auto custom-scrollbar py-0.5">
                  {activeSectorTab === "stars" ? (
                    filteredStarsList.map((s) => {
                      const isSelected = selectedStar?.name === s.name;
                      return (
                        <button
                          key={s.name}
                          onClick={() => {
                            setSelectedStar(s);
                            setSelectedPlanet(null);
                            setIsInspectorOpen(true);
                            setIsLabOpen(false);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${
                            isSelected
                              ? "bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/30"
                              : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <span>{s.displayName.split("(")[0].trim()}</span>
                          <span className="text-[9px] opacity-75">({s.distanceLy} al)</span>
                        </button>
                      );
                    })
                  ) : (
                    visiblePlanets.map((p) => {
                      const isSelected = selectedPlanet?.name === p.name;
                      return (
                        <button
                          key={p.name}
                          onClick={() => {
                            setSelectedPlanet(p);
                            setSelectedStar(null);
                            setIsInspectorOpen(true);
                            setIsLabOpen(false);
                            setActivePlanetTab("summary");
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${
                            isSelected
                              ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30"
                              : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span>{p.displayName || p.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
