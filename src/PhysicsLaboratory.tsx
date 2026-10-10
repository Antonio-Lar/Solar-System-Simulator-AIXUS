import { useState, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  Flame,
  Plus,
  Trash2,
  FlaskConical,
  Zap,
  RefreshCw,
  X,
  Sliders,
  Sparkles,
  Rocket
} from "lucide-react";
import { PlanetItem, calculateKeplerPosition } from "./solarData";

export interface InterceptTrajectory {
  startPos: [number, number, number];
  targetBodyName: string;
  startSimDays: number;
  impactSimDays: number;
}

export interface LabBodyCustomMeta {
  massEarths: number;
  gravityMs2: number;
  escapeVelocityKms: number;
  densityGcm3: number;
  isCustom?: boolean;
  intercept?: InterceptTrajectory;
}

export interface ExplosionEvent {
  id: string;
  position: [number, number, number];
  radius: number;
  colorA: string;
  colorB: string;
  createdAtMs: number;
  label: string;
  energyTeratons: string;
}

export interface CollisionLogEntry {
  id: string;
  bodyA: string;
  bodyB: string;
  impactVelKms: string;
  energyTeratons: string;
  distanceAU: string;
  outcome: string;
  timestamp: string;
}

/**
 * Computes the 3D position of any planet or custom lab body, supporting both
 * standard Keplerian elliptical orbits AND active collision intercept trajectories.
 */
export function computeLabBodyPosition(
  planet: PlanetItem,
  simTimeDays: number,
  isRealisticOrbits: boolean,
  allPlanets: PlanetItem[],
  customMetaMap: Record<string, LabBodyCustomMeta>
): { x: number; y: number; z: number; rAU: number; trueAnomalyDeg: number } {
  const meta = customMetaMap[planet.name];
  if (meta?.intercept) {
    const { startPos, targetBodyName, startSimDays, impactSimDays } = meta.intercept;
    const targetBody = allPlanets.find((p) => p.name === targetBodyName);
    if (targetBody) {
      const targetPos = calculateKeplerPosition(targetBody, simTimeDays, isRealisticOrbits);
      const totalSpan = Math.max(0.0001, impactSimDays - startSimDays);
      const progress = THREE.MathUtils.clamp((simTimeDays - startSimDays) / totalSpan, 0, 1.05);
      // Smooth gravitational acceleration curve toward target
      const eased = progress * progress * (3 - 2 * progress);
      // Slight orbital arc curvature
      const arcOffset = Math.sin(progress * Math.PI) * 3.2;
      const x = THREE.MathUtils.lerp(startPos[0], targetPos.x, eased) + arcOffset * 0.4;
      const y = THREE.MathUtils.lerp(startPos[1], targetPos.y, eased) + arcOffset * 0.25;
      const z = THREE.MathUtils.lerp(startPos[2], targetPos.z, eased) - arcOffset * 0.4;
      const rAU = Math.sqrt(x * x + y * y + z * z) / 22.0;
      return { x, y, z, rAU, trueAnomalyDeg: progress * 180 };
    }
  }
  return calculateKeplerPosition(planet, simTimeDays, isRealisticOrbits);
}

// ==========================================
// 3D VISUAL EXPLOSION SYSTEM (FIREBALL + SHOCKWAVES + DEBRIS)
// ==========================================

function SingleExplosionMesh({ event }: { event: ExplosionEvent }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shockwave1Ref = useRef<THREE.Mesh>(null);
  const shockwave2Ref = useRef<THREE.Mesh>(null);
  const debrisRef = useRef<THREE.Points>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const [isExpired, setIsExpired] = useState(false);

  const particleCount = 240;
  const debrisData = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colA = new THREE.Color(event.colorA || "#ff6b00");
    const colB = new THREE.Color(event.colorB || "#38bdf8");
    const colHot = new THREE.Color("#fef08a");

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = (1.5 + Math.random() * 5.5) * Math.max(1.2, event.radius * 0.85);

      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;

      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const mixChoice = Math.random();
      const chosen = mixChoice < 0.4 ? colA : mixChoice < 0.8 ? colB : colHot;
      colors[i * 3] = chosen.r;
      colors[i * 3 + 1] = chosen.g;
      colors[i * 3 + 2] = chosen.b;
    }

    return { positions, velocities, colors };
  }, [event.colorA, event.colorB, event.radius]);

  useFrame(() => {
    const elapsedSec = (performance.now() - event.createdAtMs) / 1000;
    const durationSec = 4.0;
    if (elapsedSec > durationSec) {
      if (!isExpired) setIsExpired(true);
      return;
    }

    const t = elapsedSec / durationSec; // 0 to 1
    const fade = Math.max(0, 1 - t);

    if (coreRef.current) {
      const coreScale = event.radius * (0.8 + Math.pow(t, 0.45) * 4.8);
      coreRef.current.scale.setScalar(coreScale);
      const mat = coreRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, Math.pow(1 - t, 1.8) * 0.95);
    }

    if (shockwave1Ref.current) {
      const ringScale = event.radius * (1.0 + t * 11.5);
      shockwave1Ref.current.scale.setScalar(ringScale);
      const mat = shockwave1Ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, Math.pow(1 - t, 1.5) * 0.85);
    }

    if (shockwave2Ref.current) {
      const ringScale2 = event.radius * (0.9 + Math.pow(t, 0.7) * 9.0);
      shockwave2Ref.current.scale.setScalar(ringScale2);
      const mat = shockwave2Ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, Math.pow(1 - t, 1.6) * 0.7);
    }

    if (debrisRef.current) {
      const posAttr = debrisRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        // Decelerating expansion in 3D space
        const drag = Math.pow(elapsedSec, 0.78);
        arr[i * 3] = debrisData.velocities[i * 3] * drag;
        arr[i * 3 + 1] = debrisData.velocities[i * 3 + 1] * drag;
        arr[i * 3 + 2] = debrisData.velocities[i * 3 + 2] * drag;
      }
      posAttr.needsUpdate = true;
      const pMat = debrisRef.current.material as THREE.PointsMaterial;
      pMat.opacity = fade;
    }

    if (lightRef.current) {
      lightRef.current.intensity = Math.max(0, (1 - t * 1.2) * 18.0);
    }
  });

  if (isExpired) return null;

  return (
    <group ref={groupRef} position={event.position}>
      {/* Flash PointLight */}
      <pointLight ref={lightRef} color="#ff9933" distance={180} decay={1.2} intensity={16} />

      {/* Core Incandescent Plasma Fireball */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color="#ffaa22"
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Primary Ecliptic Shockwave Ring */}
      <mesh ref={shockwave1Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.78, 1.0, 48]} />
        <meshBasicMaterial
          color="#fef08a"
          side={THREE.DoubleSide}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Secondary Tilted Shockwave Ring */}
      <mesh ref={shockwave2Ref} rotation={[Math.PI / 4, Math.PI / 5, 0]}>
        <ringGeometry args={[0.82, 1.0, 48]} />
        <meshBasicMaterial
          color="#f97316"
          side={THREE.DoubleSide}
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 240 Ejected Planetary Fragment Particles */}
      <points ref={debrisRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particleCount}
            array={debrisData.positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={particleCount}
            array={debrisData.colors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.55}
          vertexColors
          transparent
          opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Floating 3D Impact Telemetry Banner */}
      <Html position={[0, event.radius * 2.5 + 3.5, 0]} center distanceFactor={110}>
        <div className="pointer-events-none select-none bg-rose-950/90 border border-rose-400/80 px-3 py-1.5 rounded-xl shadow-2xl backdrop-blur-md flex flex-col items-center whitespace-nowrap animate-bounce">
          <span className="text-[11px] font-mono font-bold text-rose-200 tracking-wide">
            {event.label}
          </span>
          <span className="text-[9px] font-mono text-amber-300">
            Energía Liberada: {event.energyTeratons}
          </span>
        </div>
      </Html>
    </group>
  );
}

export function ExplosionEffects3D({ explosions }: { explosions: ExplosionEvent[] }) {
  return (
    <group>
      {explosions.map((ev) => (
        <SingleExplosionMesh key={ev.id} event={ev} />
      ))}
    </group>
  );
}

// ==========================================
// REAL-TIME KEPLERIAN COLLISION ENGINE
// ==========================================

export function CollisionPhysicsEngine({
  enabled,
  isPaused,
  planets,
  simTimeRef,
  isRealisticOrbits,
  isRealisticSize,
  collisionSensitivity,
  customMetaMap,
  onCollisionDetected
}: {
  enabled: boolean;
  isPaused: boolean;
  planets: PlanetItem[];
  simTimeRef: React.MutableRefObject<number>;
  isRealisticOrbits: boolean;
  isRealisticSize: boolean;
  collisionSensitivity: number;
  customMetaMap: Record<string, LabBodyCustomMeta>;
  onCollisionDetected: (
    bodyA: PlanetItem,
    bodyB: PlanetItem,
    midpoint: [number, number, number],
    distAU: number
  ) => void;
}) {
  const recentPairsRef = useRef<Set<string>>(new Set());

  useFrame(() => {
    if (!enabled || isPaused || planets.length < 2) return;

    const currentSimDays = simTimeRef.current;
    const len = planets.length;
    const coords: Array<{ x: number; y: number; z: number; rAU: number; rad: number }> = new Array(len);

    for (let i = 0; i < len; i++) {
      const p = planets[i];
      const pos = computeLabBodyPosition(p, currentSimDays, isRealisticOrbits, planets, customMetaMap);
      const baseRad = isRealisticSize ? p.realisticRadius : p.size;
      // Sun has a larger visual mesh at center, scale its collision envelope appropriately
      const effectiveRad = p.name === "Sun" ? baseRad * 0.92 : baseRad * collisionSensitivity;
      coords[i] = { x: pos.x, y: pos.y, z: pos.z, rAU: pos.rAU, rad: effectiveRad };
    }

    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const a = coords[i];
        const b = coords[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const minDist = a.rad + b.rad;

        if (dist <= minDist) {
          const pA = planets[i];
          const pB = planets[j];
          const pairKey = [pA.name, pB.name].sort().join("::");
          if (recentPairsRef.current.has(pairKey)) continue;
          recentPairsRef.current.add(pairKey);
          setTimeout(() => {
            recentPairsRef.current.delete(pairKey);
          }, 1500);

          const mid: [number, number, number] = [
            (a.x + b.x) * 0.5,
            (a.y + b.y) * 0.5,
            (a.z + b.z) * 0.5
          ];
          onCollisionDetected(pA, pB, mid, (a.rAU + b.rAU) * 0.5);
          return;
        }
      }
    }
  });

  return null;
}

// ==========================================
// INTERACTIVE ASTROPHYSICAL & COLLISION LABORATORY PANEL
// ==========================================

export function PhysicsLabDrawer({
  isOpen,
  onClose,
  allPlanets,
  destroyedNames,
  customMetaMap,
  isCollisionEnabled,
  setIsCollisionEnabled,
  collisionMode,
  setCollisionMode,
  collisionSensitivity,
  setCollisionSensitivity,
  collisionLogs,
  onSpawnBody,
  onUpdatePlanet,
  onUpdateMeta,
  onDeleteBody,
  onRestoreAll,
  onTriggerScenario,
  onLaunchIntercept,
  selectedPlanetName,
  onSelectPlanetByName
}: {
  isOpen: boolean;
  onClose: () => void;
  allPlanets: PlanetItem[];
  destroyedNames: string[];
  customMetaMap: Record<string, LabBodyCustomMeta>;
  isCollisionEnabled: boolean;
  setIsCollisionEnabled: (v: boolean) => void;
  collisionMode: "destroy_both" | "merge_larger";
  setCollisionMode: (m: "destroy_both" | "merge_larger") => void;
  collisionSensitivity: number;
  setCollisionSensitivity: (v: number) => void;
  collisionLogs: CollisionLogEntry[];
  onSpawnBody: (newPlanet: PlanetItem, meta: LabBodyCustomMeta, launchAsInterceptTarget?: string) => void;
  onUpdatePlanet: (name: string, patch: Partial<PlanetItem>) => void;
  onUpdateMeta: (name: string, patch: Partial<LabBodyCustomMeta>) => void;
  onDeleteBody: (name: string) => void;
  onRestoreAll: () => void;
  onTriggerScenario: (scenarioId: "theia_earth" | "asteroid_impact" | "inner_chaos" | "binary_star") => void;
  onLaunchIntercept: (sourceName: string, targetName: string) => void;
  selectedPlanetName: string | null;
  onSelectPlanetByName: (name: string) => void;
}) {
  const [labTab, setLabTab] = useState<"collisions" | "create" | "modify">("collisions");

  // New Custom Body Form State
  const [newName, setNewName] = useState("Theia Proto-X");
  const [newCategory, setNewCategory] = useState<"terrestrial" | "gas_giant" | "dwarf_planet" | "star">("terrestrial");
  const [newColor, setNewColor] = useState("#f97316");
  const [newSize, setNewSize] = useState(1.15);
  const [newMassEarths, setNewMassEarths] = useState(0.45);
  const [newGravity, setNewGravity] = useState(5.4);
  const [newTemp, setNewTemp] = useState(180);
  const [newSemiMajorAU, setNewSemiMajorAU] = useState(1.02);
  const [newEccentricity, setNewEccentricity] = useState(0.32);
  const [newInclination, setNewInclination] = useState(2.5);
  const [newVelocity, setNewVelocity] = useState(31.5);
  const [targetForIntercept, setTargetForIntercept] = useState("Earth");

  // Modify Existing Body State
  const [editTargetName, setEditTargetName] = useState<string>(selectedPlanetName || "Earth");
  const activeEditPlanet = useMemo(() => {
    return (
      allPlanets.find((p) => p.name === (selectedPlanetName || editTargetName)) ||
      allPlanets.find((p) => p.name === "Earth") ||
      allPlanets[0]
    );
  }, [allPlanets, selectedPlanetName, editTargetName]);

  const activeEditMeta = activeEditPlanet
    ? customMetaMap[activeEditPlanet.name] || {
        massEarths: 1.0,
        gravityMs2: 9.8,
        escapeVelocityKms: 11.2,
        densityGcm3: 5.51
      }
    : null;

  if (!isOpen) return null;

  const applyCreatePreset = (preset: "super_earth" | "hot_jupiter" | "ice_rogue" | "red_dwarf" | "blue_giant") => {
    if (preset === "super_earth") {
      setNewName("Kepler-452X");
      setNewCategory("terrestrial");
      setNewColor("#06b6d4");
      setNewSize(1.55);
      setNewMassEarths(4.8);
      setNewGravity(18.6);
      setNewTemp(28);
      setNewSemiMajorAU(1.05);
      setNewEccentricity(0.18);
      setNewInclination(1.5);
      setNewVelocity(30.2);
    } else if (preset === "hot_jupiter") {
      setNewName("Osiris HD-209");
      setNewCategory("gas_giant");
      setNewColor("#a855f7");
      setNewSize(3.4);
      setNewMassEarths(318);
      setNewGravity(24.8);
      setNewTemp(1150);
      setNewSemiMajorAU(0.65);
      setNewEccentricity(0.42);
      setNewInclination(4.0);
      setNewVelocity(42.0);
    } else if (preset === "ice_rogue") {
      setNewName("Sedna-Prime");
      setNewCategory("dwarf_planet");
      setNewColor("#38bdf8");
      setNewSize(0.85);
      setNewMassEarths(0.08);
      setNewGravity(1.4);
      setNewTemp(-210);
      setNewSemiMajorAU(1.52);
      setNewEccentricity(0.65);
      setNewInclination(8.0);
      setNewVelocity(26.5);
    } else if (preset === "red_dwarf") {
      setNewName("Némesis (Enana Roja)");
      setNewCategory("star");
      setNewColor("#ef4444");
      setNewSize(4.2);
      setNewMassEarths(45000);
      setNewGravity(145.0);
      setNewTemp(3200);
      setNewSemiMajorAU(2.1);
      setNewEccentricity(0.28);
      setNewInclination(3.2);
      setNewVelocity(21.0);
    } else if (preset === "blue_giant") {
      setNewName("Hyperion B (Estrella Azul)");
      setNewCategory("star");
      setNewColor("#60a5fa");
      setNewSize(5.8);
      setNewMassEarths(180000);
      setNewGravity(220.0);
      setNewTemp(12500);
      setNewSemiMajorAU(3.8);
      setNewEccentricity(0.15);
      setNewInclination(5.0);
      setNewVelocity(16.5);
    }
  };

  const handleCreateSubmit = (asCollisionIntercept: boolean) => {
    const cleanTitle = newName.trim() || `Astro-${Math.floor(Math.random() * 900 + 100)}`;
    const uniqueId = `${cleanTitle.replace(/\s+/g, "_")}_${Date.now().toString().slice(-4)}`;
    const catLabels: Record<string, string> = {
      terrestrial: "Planeta Rocoso de Laboratorio",
      gas_giant: "Gigante Gaseoso de Laboratorio",
      dwarf_planet: "Cuerpo Helado / Protoplaneta",
      star: "Estrella Compañera de Prueba"
    };

    const periodDays = Math.max(15, Math.round(Math.pow(newSemiMajorAU, 1.5) * 365.25));

    const createdPlanet: PlanetItem = {
      name: uniqueId,
      displayName: cleanTitle,
      category: newCategory,
      categoryLabel: catLabels[newCategory],
      color: newColor,
      size: newSize,
      realisticRadius: Math.max(0.25, newSize * 0.45),
      semiMajorAU: newSemiMajorAU,
      eccentricity: newEccentricity,
      inclination: newInclination,
      longNode: Math.round(Math.random() * 360),
      argPerihelion: Math.round(Math.random() * 360),
      meanLongitude0: Math.round(Math.random() * 360),
      period: periodDays,
      velocity: newVelocity,
      axialTilt: 15,
      rotPeriodHours: 18,
      temp: newTemp,
      roughness: newCategory === "star" ? 0.1 : 0.75,
      metalness: 0.1,
      details: `Cuerpo celeste experimental creado en el Laboratorio Orbital (${catLabels[newCategory]}). Masa: ${newMassEarths} M⊕, Gravedad: ${newGravity} m/s², Temperatura: ${newTemp} °C.`,
      composition:
        newCategory === "star"
          ? "Plasma termonuclear de Hidrógeno y Helio en convección."
          : "Núcleo sintético configurado en el Laboratorio Astrofísico.",
      atmosphere:
        newCategory === "star"
          ? "Corona estelar de alta temperatura."
          : `Atmósfera experimental a ${newTemp} °C con gravedad superficial de ${newGravity} m/s².`,
      moons: []
    };

    const meta: LabBodyCustomMeta = {
      massEarths: newMassEarths,
      gravityMs2: newGravity,
      escapeVelocityKms: Number((Math.sqrt(newGravity * newSize * 1.2) * 3.1).toFixed(1)),
      densityGcm3: newCategory === "gas_giant" ? 1.35 : newCategory === "star" ? 1.45 : 5.2,
      isCustom: true
    };

    onSpawnBody(createdPlanet, meta, asCollisionIntercept ? targetForIntercept : undefined);
  };

  return (
    <div className="fixed top-14 left-2.5 sm:left-5 z-30 w-[calc(100vw-20px)] sm:w-[430px] max-h-[calc(100dvh-8.5rem)] bg-slate-950/95 text-slate-100 rounded-2xl border border-rose-500/40 shadow-2xl backdrop-blur-2xl flex flex-col overflow-hidden animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/90 bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400">
            <FlaskConical size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white">
              Laboratorio de Colisiones & Astrofísica
            </h2>
            <p className="text-[10px] font-mono text-rose-300/90">
              Motor Kepleriano de Impactos · Creador & Editor de Astros
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 p-1.5 rounded-xl border border-slate-700/60 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-1 px-3 pt-2.5 pb-2 border-b border-slate-800/80 bg-slate-950">
        <button
          onClick={() => setLabTab("collisions")}
          className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-mono font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
            labTab === "collisions"
              ? "bg-rose-500 text-slate-950 font-bold shadow-md shadow-rose-500/20"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Flame size={13} />
          <span>Colisiones</span>
        </button>
        <button
          onClick={() => setLabTab("create")}
          className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-mono font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
            labTab === "create"
              ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Plus size={13} />
          <span>Crear Astro</span>
        </button>
        <button
          onClick={() => setLabTab("modify")}
          className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-mono font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
            labTab === "modify"
              ? "bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Sliders size={13} />
          <span>Modificar Variables</span>
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar text-xs">
        {/* ==========================================
            TAB 1: COLLISIONS & QUICK EXPERIMENTS
           ========================================== */}
        {labTab === "collisions" && (
          <div className="space-y-3 animate-fadeIn">
            {/* Engine Status & Mode */}
            <div className="bg-slate-900/85 p-3 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-rose-300">
                  Detector Físico de Colisiones (Kepler)
                </span>
                <input
                  type="checkbox"
                  checked={isCollisionEnabled}
                  onChange={(e) => setIsCollisionEnabled(e.target.checked)}
                  className="rounded accent-rose-500 cursor-pointer w-4 h-4"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() => setCollisionMode("destroy_both")}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-mono border transition-all ${
                    collisionMode === "destroy_both"
                      ? "bg-rose-500/25 border-rose-400 text-rose-200 font-bold"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  💥 Destruir Ambos Cuerpos
                </button>
                <button
                  onClick={() => setCollisionMode("merge_larger")}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-mono border transition-all ${
                    collisionMode === "merge_larger"
                      ? "bg-amber-500/25 border-amber-400 text-amber-200 font-bold"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🪐 Fusión / Absorción Mayor
                </button>
              </div>

              <label className="block pt-1">
                <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>Radio de Sensibilidad de Impacto</span>
                  <span className="text-rose-300 font-bold">{collisionSensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="3.5"
                  step="0.1"
                  value={collisionSensitivity}
                  onChange={(e) => setCollisionSensitivity(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </label>
            </div>

            {/* 1-Click Collision Experiments */}
            <div className="bg-slate-900/85 p-3 rounded-xl border border-slate-800 space-y-2">
              <span className="text-[10px] font-mono text-cyan-300 font-bold block">
                Experimentos de Impacto Instantáneo (1-Clic)
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  onClick={() => onTriggerScenario("theia_earth")}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-rose-600/80 to-orange-600/80 hover:from-rose-500 hover:to-orange-500 text-white font-mono font-bold text-[11px] flex items-center justify-between shadow-lg transition-all active:scale-98"
                >
                  <span>💥 Impacto Protoplaneta Theia vs Tierra</span>
                  <Zap size={14} />
                </button>
                <button
                  onClick={() => onTriggerScenario("asteroid_impact")}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-amber-500/40 text-amber-200 font-mono font-semibold text-[11px] flex items-center justify-between transition-all active:scale-98"
                >
                  <span>☄️ Lanzar Impactor contra Astro Seleccionado</span>
                  <Rocket size={13} className="text-amber-400" />
                </button>
                <button
                  onClick={() => onTriggerScenario("inner_chaos")}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-purple-500/40 text-purple-200 font-mono font-semibold text-[11px] flex items-center justify-between transition-all active:scale-98"
                >
                  <span>🌀 Caos Orbital (Cruzar Órbitas Interiores)</span>
                  <Sparkles size={13} className="text-purple-400" />
                </button>
                <button
                  onClick={() => onTriggerScenario("binary_star")}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-cyan-500/40 text-cyan-200 font-mono font-semibold text-[11px] flex items-center justify-between transition-all active:scale-98"
                >
                  <span>☀️ Simular Sistema Binario (Agregar Estrella)</span>
                  <Plus size={13} className="text-cyan-400" />
                </button>
              </div>
            </div>

            {/* Restore / Reset Solar System Button */}
            <div className="flex items-center justify-between bg-slate-900/80 px-3 py-2.5 rounded-xl border border-slate-800">
              <div className="text-[11px] font-mono">
                <span className="text-slate-400 block">Cuerpos Eliminados:</span>
                <span className="text-rose-300 font-bold">
                  {destroyedNames.length > 0 ? `${destroyedNames.length} destruidos` : "Ninguno (Sistema Intacto)"}
                </span>
              </div>
              <button
                onClick={onRestoreAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 font-mono font-bold text-[11px] transition-all active:scale-95"
              >
                <RefreshCw size={12} />
                <span>Restaurar Todo</span>
              </button>
            </div>

            {/* Live Collision Log */}
            <div className="bg-slate-900/85 p-3 rounded-xl border border-slate-800 space-y-2">
              <span className="text-[10px] font-mono text-slate-400 font-bold block">
                Bitácora de Colisiones Detectadas ({collisionLogs.length})
              </span>
              {collisionLogs.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic py-2 text-center">
                  No se han registrado colisiones aún. Usa un experimento de 1-clic arriba o cruza las órbitas de dos planetas.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                  {collisionLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-950/80 p-2 rounded-lg border border-rose-500/30 text-[10px] font-mono space-y-0.5"
                    >
                      <div className="flex justify-between text-rose-300 font-bold">
                        <span>💥 {log.bodyA} × {log.bodyB}</span>
                        <span className="text-slate-400">{log.distanceAU} UA</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Vel. Impacto: {log.impactVelKms}</span>
                        <span className="text-amber-300">{log.energyTeratons}</span>
                      </div>
                      <div className="text-slate-400 text-[9px]">{log.outcome}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==========================================
            TAB 2: CREATE CUSTOM PLANET OR STAR
           ========================================== */}
        {labTab === "create" && (
          <div className="space-y-3 animate-fadeIn">
            {/* Quick Templates */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-slate-400 block">
                Plantillas Rápidas de Astros:
              </span>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => applyCreatePreset("super_earth")}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-cyan-300"
                >
                  🌍 Súper-Tierra
                </button>
                <button
                  onClick={() => applyCreatePreset("hot_jupiter")}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-purple-300"
                >
                  🪐 Júpiter Caliente
                </button>
                <button
                  onClick={() => applyCreatePreset("ice_rogue")}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-sky-300"
                >
                  ❄️ Mundo Helado
                </button>
                <button
                  onClick={() => applyCreatePreset("red_dwarf")}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-rose-300"
                >
                  🔴 Enana Roja
                </button>
                <button
                  onClick={() => applyCreatePreset("blue_giant")}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-blue-300"
                >
                  🔵 Estrella Azul
                </button>
              </div>
            </div>

            <div className="bg-slate-900/85 p-3 rounded-xl border border-slate-800 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">Nombre del Astro</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">Color</label>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-full h-8 bg-slate-950 border border-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">Categoría Física</label>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                  {(
                    [
                      ["terrestrial", "🪨 Planeta Rocoso"],
                      ["gas_giant", "🪐 Gigante Gaseoso"],
                      ["dwarf_planet", "❄️ Planeta Enano"],
                      ["star", "☀️ Estrella (Plasma)"]
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setNewCategory(val)}
                      className={`py-1.5 px-2 rounded-lg border text-left transition-all ${
                        newCategory === val
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders for Physical & Orbital Variables */}
              <div className="grid grid-cols-2 gap-2.5 pt-1 font-mono text-[10px]">
                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Tamaño / Radio</span>
                    <span className="text-cyan-300 font-bold">{newSize} u</span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="9.0"
                    step="0.1"
                    value={newSize}
                    onChange={(e) => setNewSize(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Masa (M⊕)</span>
                    <span className="text-emerald-300 font-bold">{newMassEarths} M⊕</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max={newCategory === "star" ? "250000" : "500"}
                    step={newCategory === "star" ? "1000" : "0.5"}
                    value={newMassEarths}
                    onChange={(e) => setNewMassEarths(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Gravedad</span>
                    <span className="text-emerald-300 font-bold">{newGravity} m/s²</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="280"
                    step="0.5"
                    value={newGravity}
                    onChange={(e) => setNewGravity(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Temperatura</span>
                    <span className="text-amber-300 font-bold">{newTemp} °C</span>
                  </div>
                  <input
                    type="range"
                    min="-240"
                    max={newCategory === "star" ? "15000" : "2500"}
                    step="10"
                    value={newTemp}
                    onChange={(e) => setNewTemp(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Distancia (UA)</span>
                    <span className="text-cyan-300 font-bold">{newSemiMajorAU} UA</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="42.0"
                    step="0.05"
                    value={newSemiMajorAU}
                    onChange={(e) => setNewSemiMajorAU(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Excentricidad (e)</span>
                    <span className="text-purple-300 font-bold">{newEccentricity}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.88"
                    step="0.02"
                    value={newEccentricity}
                    onChange={(e) => setNewEccentricity(Number(e.target.value))}
                    className="w-full accent-purple-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Inclinación (°)</span>
                    <span className="text-slate-200 font-bold">{newInclination}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="0.5"
                    value={newInclination}
                    onChange={(e) => setNewInclination(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Vel. Orbital</span>
                    <span className="text-amber-300 font-bold">{newVelocity} km/s</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="75"
                    step="0.5"
                    value={newVelocity}
                    onChange={(e) => setNewVelocity(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2 border-t border-slate-800">
                <button
                  onClick={() => handleCreateSubmit(false)}
                  className="w-full py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all active:scale-98"
                >
                  <Plus size={14} />
                  <span>Agregar Astro en Órbita Kepleriana</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <select
                    value={targetForIntercept}
                    onChange={(e) => setTargetForIntercept(e.target.value)}
                    className="bg-slate-950 border border-rose-500/40 rounded-xl px-2 py-2 text-[11px] font-mono text-slate-200"
                  >
                    {allPlanets
                      .filter((p) => p.name !== "Sun")
                      .map((p) => (
                        <option key={p.name} value={p.name}>
                          Objetivo: {p.displayName || p.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => handleCreateSubmit(true)}
                    className="flex-1 py-2 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-[11px] flex items-center justify-center gap-1 shadow-lg transition-all active:scale-98"
                  >
                    <Flame size={13} />
                    <span>Lanzar a Colisionar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB 3: MODIFY EXISTING PLANET / STAR VARIABLES
           ========================================== */}
        {labTab === "modify" && activeEditPlanet && activeEditMeta && (
          <div className="space-y-3 animate-fadeIn">
            {/* Selector of active planet/star */}
            <div className="bg-slate-900/85 p-3 rounded-xl border border-slate-800 space-y-2">
              <label className="text-[10px] font-mono text-amber-300 font-bold block">
                Seleccionar Cuerpo Celeste a Modificar:
              </label>
              <select
                value={activeEditPlanet.name}
                onChange={(e) => {
                  setEditTargetName(e.target.value);
                  onSelectPlanetByName(e.target.value);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
              >
                {allPlanets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name} ({p.categoryLabel})
                  </option>
                ))}
              </select>
            </div>

            {/* Live Sliders for the Selected Body */}
            <div className="bg-slate-900/85 p-3 rounded-xl border border-slate-800 space-y-2.5 font-mono text-[10px]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={activeEditPlanet.color}
                    onChange={(e) => onUpdatePlanet(activeEditPlanet.name, { color: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                  />
                  <span className="text-xs font-bold text-white">
                    {activeEditPlanet.displayName || activeEditPlanet.name}
                  </span>
                </div>
                {activeEditPlanet.name !== "Sun" && (
                  <button
                    onClick={() => onDeleteBody(activeEditPlanet.name)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px]"
                  >
                    <Trash2 size={11} />
                    <span>Eliminar</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Tamaño / Radio</span>
                    <span className="text-cyan-300 font-bold">{activeEditPlanet.size.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="18.0"
                    step="0.1"
                    value={activeEditPlanet.size}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdatePlanet(activeEditPlanet.name, {
                        size: val,
                        realisticRadius: Math.max(0.1, val * 0.45)
                      });
                    }}
                    className="w-full accent-cyan-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Temperatura</span>
                    <span className="text-amber-300 font-bold">{activeEditPlanet.temp} °C</span>
                  </div>
                  <input
                    type="range"
                    min="-250"
                    max={activeEditPlanet.category === "star" ? "20000" : "4500"}
                    step="15"
                    value={activeEditPlanet.temp}
                    onChange={(e) =>
                      onUpdatePlanet(activeEditPlanet.name, { temp: Number(e.target.value) })
                    }
                    className="w-full accent-amber-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Masa (M⊕)</span>
                    <span className="text-emerald-300 font-bold">{activeEditMeta.massEarths} M⊕</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max={activeEditPlanet.category === "star" ? "500000" : "1000"}
                    step={activeEditPlanet.category === "star" ? "2000" : "0.5"}
                    value={activeEditMeta.massEarths}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      const newG = Number((9.8 * (m / Math.max(0.2, activeEditPlanet.size * activeEditPlanet.size))).toFixed(1));
                      onUpdateMeta(activeEditPlanet.name, {
                        massEarths: m,
                        gravityMs2: newG
                      });
                    }}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Gravedad</span>
                    <span className="text-emerald-300 font-bold">{activeEditMeta.gravityMs2} m/s²</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="400"
                    step="0.5"
                    value={activeEditMeta.gravityMs2}
                    onChange={(e) =>
                      onUpdateMeta(activeEditPlanet.name, { gravityMs2: Number(e.target.value) })
                    }
                    className="w-full accent-emerald-400"
                  />
                </label>

                {activeEditPlanet.semiMajorAU > 0 && (
                  <>
                    <label className="block">
                      <div className="flex justify-between text-slate-400 mb-0.5">
                        <span>Distancia (UA)</span>
                        <span className="text-cyan-300 font-bold">{activeEditPlanet.semiMajorAU} UA</span>
                      </div>
                      <input
                        type="range"
                        min="0.25"
                        max="70.0"
                        step="0.05"
                        value={activeEditPlanet.semiMajorAU}
                        onChange={(e) =>
                          onUpdatePlanet(activeEditPlanet.name, { semiMajorAU: Number(e.target.value) })
                        }
                        className="w-full accent-cyan-400"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-slate-400 mb-0.5">
                        <span>Excentricidad (e)</span>
                        <span className="text-purple-300 font-bold">{activeEditPlanet.eccentricity}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="0.90"
                        step="0.02"
                        value={activeEditPlanet.eccentricity}
                        onChange={(e) =>
                          onUpdatePlanet(activeEditPlanet.name, { eccentricity: Number(e.target.value) })
                        }
                        className="w-full accent-purple-400"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-slate-400 mb-0.5">
                        <span>Inclinación (°)</span>
                        <span className="text-slate-200 font-bold">{activeEditPlanet.inclination}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="75"
                        step="0.5"
                        value={activeEditPlanet.inclination}
                        onChange={(e) =>
                          onUpdatePlanet(activeEditPlanet.name, { inclination: Number(e.target.value) })
                        }
                        className="w-full accent-cyan-400"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-slate-400 mb-0.5">
                        <span>Período Orbital</span>
                        <span className="text-amber-300 font-bold">{Math.round(activeEditPlanet.period)} d</span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="10000"
                        step="10"
                        value={activeEditPlanet.period}
                        onChange={(e) =>
                          onUpdatePlanet(activeEditPlanet.name, { period: Number(e.target.value) })
                        }
                        className="w-full accent-amber-400"
                      />
                    </label>
                  </>
                )}
              </div>

              {/* Direct Collision Trigger for this Planet */}
              {activeEditPlanet.name !== "Sun" && (
                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <span className="text-[10px] text-rose-300 font-bold block">
                    💥 Lanzar {activeEditPlanet.displayName} en Curso de Colisión contra:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={targetForIntercept}
                      onChange={(e) => setTargetForIntercept(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-2 py-1.5 text-[11px] text-slate-200"
                    >
                      {allPlanets
                        .filter((p) => p.name !== activeEditPlanet.name)
                        .map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.displayName || p.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => onLaunchIntercept(activeEditPlanet.name, targetForIntercept)}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1"
                    >
                      <Zap size={12} />
                      <span>Impactar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
