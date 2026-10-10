import { useState, useRef, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Html } from "@react-three/drei";
import * as THREE from "three";
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Sliders,
  X,
  Globe,
  Grid as GridIcon,
  Activity,
  Search,
  Sparkles,
  FastForward,
  Crosshair,
  Compass,
  Flame,
  Zap,
  Orbit,
  Scale,
  Gauge
} from "lucide-react";
import {
  generatePlanetTexture,
  generateSaturnRingTexture,
  generateEarthCloudsTexture,
  generateStarHDTexture
} from "./textureEngine";
import {
  SandboxBody,
  SandboxExplosion,
  SandboxCollisionLog,
  CatalogTemplate,
  CELESTIAL_CATALOG,
  SANDBOX_PRESETS,
  ExplosionParticle
} from "./sandboxCatalogAndPresets";

// ==========================================
// SHADERS FOR STARS & NEUTRON STARS
// ==========================================

const starSurfaceVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starSurfaceFragmentShader = `
  uniform float uTime;
  uniform sampler2D uStarTexture;
  uniform vec3 uBaseColor;
  uniform vec3 uHotColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }

  void main() {
    vec3 p1 = vPosition * 1.4 + vec3(uTime * 0.16, -uTime * 0.12, uTime * 0.09);
    vec3 p2 = vPosition * 3.2 - vec3(uTime * 0.25, uTime * 0.2, -uTime * 0.18);
    float n = noise(p1) * 0.65 + noise(p2) * 0.35;

    vec4 texCol = texture2D(uStarTexture, vUv + vec2(uTime * 0.012, 0.0));
    vec3 col = mix(uBaseColor * 0.52, uBaseColor * 1.18, smoothstep(0.18, 0.65, n));
    col = mix(col, uHotColor, smoothstep(0.52, 0.9, n));
    col = mix(col, texCol.rgb * uHotColor, 0.42);

    float fresnel = pow(max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 0.55);
    col *= (0.42 + 0.58 * fresnel);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ==========================================
// ASTROPHYSICS, THERMODYNAMICS & WIEN'S LAW
// ==========================================

export function temperatureToBlackbodyColor(tempK: number): {
  baseColor: string;
  hotColor: string;
  glowColor: string;
  threeBaseColor: THREE.Color;
  threeHotColor: THREE.Color;
  threeGlowColor: THREE.Color;
} {
  // Approximate CIE/sRGB chromaticity for blackbody radiator from 1,000 K to 60,000 K
  let r = 1.0;
  let g = 1.0;
  let b = 1.0;

  if (tempK < 2000) {
    r = 0.85;
    g = 0.12;
    b = 0.05;
  } else if (tempK < 3500) {
    // M class (Deep Crimson Red)
    r = 1.0;
    g = 0.28 + ((tempK - 2000) / 1500) * 0.28;
    b = 0.08;
  } else if (tempK < 5000) {
    // K class (Warm Amber Orange)
    r = 1.0;
    g = 0.56 + ((tempK - 3500) / 1500) * 0.24;
    b = 0.18 + ((tempK - 3500) / 1500) * 0.22;
  } else if (tempK < 6200) {
    // G class (Solar Yellow-White)
    r = 1.0;
    g = 0.88 + ((tempK - 5000) / 1200) * 0.1;
    b = 0.45 + ((tempK - 5000) / 1200) * 0.45;
  } else if (tempK < 7500) {
    // F class (Yellow-White)
    r = 0.98;
    g = 0.98;
    b = 0.9 + ((tempK - 6200) / 1300) * 0.08;
  } else if (tempK < 10000) {
    // A class (Diamond White)
    r = 0.94 - ((tempK - 7500) / 2500) * 0.08;
    g = 0.96;
    b = 1.0;
  } else if (tempK < 30000) {
    // B class (Electric Cyan-Blue)
    r = 0.55 - ((tempK - 10000) / 20000) * 0.22;
    g = 0.78 + ((tempK - 10000) / 20000) * 0.12;
    b = 1.0;
  } else {
    // O class (Intense Ultraviolet Blue)
    r = 0.38;
    g = 0.62;
    b = 1.0;
  }

  const baseCol = new THREE.Color(r, g, b);
  const hotCol = new THREE.Color(1.0, 1.0, 1.0).lerp(baseCol, 0.28);
  const glowCol = baseCol.clone().offsetHSL(0, 0.05, 0.08);

  return {
    baseColor: `#${baseCol.getHexString()}`,
    hotColor: `#${hotCol.getHexString()}`,
    glowColor: `#${glowCol.getHexString()}`,
    threeBaseColor: baseCol,
    threeHotColor: hotCol,
    threeGlowColor: glowCol
  };
}

export function computeStarAstrophysics(tempK: number, mass: number, radius: number) {
  const sunTemp = 5778;
  const sunMass = 2000;
  const sunRadius = 4.0;

  // Stefan-Boltzmann Luminosity: L / L_sun = (R/R_sun)^2 * (T/T_sun)^4
  const radiusRatio = Math.max(0.05, radius / sunRadius);
  const tempRatio = Math.max(0.05, tempK / sunTemp);
  const luminositySun = Math.pow(radiusRatio, 2) * Math.pow(tempRatio, 4);

  // Wien's Displacement Law: lambda_max (nm) = 2,898,000 / T (Kelvin)
  const peakWavelengthNm = Math.round(2898000 / Math.max(200, tempK));
  let spectralBand = "Luz Visible (Amarillo/Blanco)";
  if (peakWavelengthNm > 750) spectralBand = "Infrarrojo Térmico";
  else if (peakWavelengthNm < 380) spectralBand = "Ultravioleta Extremo";
  else if (peakWavelengthNm < 450) spectralBand = "Visible (Azul/Violeta)";
  else if (peakWavelengthNm < 500) spectralBand = "Visible (Cyan/Verde)";
  else if (peakWavelengthNm < 600) spectralBand = "Visible (Amarillo)";
  else spectralBand = "Visible (Naranja/Rojo)";

  // Morgan-Keenan Spectral Type
  let spectralClass = "G2V";
  let spectralName = "Enana Amarilla Tipo Solar";
  if (tempK < 2400) {
    spectralClass = "L/T";
    spectralName = "Enana Marrón Subestelar";
  } else if (tempK < 3700) {
    spectralClass = "M2V";
    spectralName = "Enana/Gigante Roja Fría";
  } else if (tempK < 5200) {
    spectralClass = "K0V";
    spectralName = "Enana Naranja Moderada";
  } else if (tempK < 6000) {
    spectralClass = "G2V";
    spectralName = "Enana Amarilla Tipo Solar";
  } else if (tempK < 7500) {
    spectralClass = "F5V";
    spectralName = "Estrella Blanco-Amarilla";
  } else if (tempK < 10000) {
    spectralClass = "A0V";
    spectralName = "Estrella Blanca (Tipo Sirio / Vega)";
  } else if (tempK < 30000) {
    spectralClass = "B2Ia";
    spectralName = "Supergigante Azul (Tipo Rígel)";
  } else {
    spectralClass = "O5V";
    spectralName = "Estrella Azul Hipermasiva Ultravioleta";
  }

  // Goldilocks Habitable Zone bounds (in simulation units)
  const hzInner = Number((11.5 * Math.sqrt(Math.max(0.001, luminositySun))).toFixed(1));
  const hzOuter = Number((18.5 * Math.sqrt(Math.max(0.001, luminositySun))).toFixed(1));

  // Main-sequence lifespan expectancy: tau ~ 10 * (M/M_sun) / (L/L_sun) Gyr
  const massRatio = Math.max(0.01, mass / sunMass);
  const lifetimeGyr = (10.0 * massRatio) / Math.max(0.0001, luminositySun);
  let lifetimeStr = "";
  if (lifetimeGyr > 1000) {
    lifetimeStr = `${(lifetimeGyr / 1000).toFixed(1)} Billones de Años`;
  } else if (lifetimeGyr >= 1) {
    lifetimeStr = `${lifetimeGyr.toFixed(1)} Mil Millones de Años`;
  } else {
    lifetimeStr = `${(lifetimeGyr * 1000).toFixed(0)} Millones de Años`;
  }

  const { baseColor, hotColor, glowColor } = temperatureToBlackbodyColor(tempK);

  return {
    luminositySun,
    peakWavelengthNm,
    spectralBand,
    spectralClass,
    spectralName,
    hzInner,
    hzOuter,
    lifetimeStr,
    baseColor,
    hotColor,
    glowColor
  };
}

// ==========================================
// REAL-TIME SURFACE GRAVITY & ESCAPE VELOCITY CALCULATOR
// ==========================================

function computeBodySurfacePhysics(body: SandboxBody) {
  // Earth reference in our sandbox: mass = 8, density = 5.51 g/cm³ => g = 9.81 m/s², v_esc = 11.19 km/s
  const earthRefMass = 8.0;
  const earthRefDensity = 5.51;

  const massRatio = Math.max(0.001, body.mass / earthRefMass);
  const densityRatio = Math.max(0.01, body.density / earthRefDensity);

  // Physical relation: R ~ (M / rho)^(1/3), and g = G*M / R^2 ~ M^(1/3) * rho^(2/3)
  const gEarths = Math.pow(massRatio, 1 / 3) * Math.pow(densityRatio, 2 / 3);
  const gravityMs2 = gEarths * 9.81;

  // Base gravity before manual multipliers
  const baseMass = body.baseMass ?? body.mass;
  const baseDensity = body.baseDensity ?? body.density;
  const baseMassRatio = Math.max(0.001, baseMass / earthRefMass);
  const baseDensityRatio = Math.max(0.01, baseDensity / earthRefDensity);
  const baseGEarths = Math.pow(baseMassRatio, 1 / 3) * Math.pow(baseDensityRatio, 2 / 3);
  const baseGravityMs2 = baseGEarths * 9.81;
  const gravityDeltaPct =
    baseGravityMs2 > 0 ? ((gravityMs2 - baseGravityMs2) / baseGravityMs2) * 100 : 0;

  // Escape velocity: v_esc ~ sqrt(M / R) ~ M^(1/3) * rho^(1/6)
  const escapeVelKms = 11.19 * Math.pow(massRatio, 1 / 3) * Math.pow(densityRatio, 1 / 6);

  return {
    gEarths,
    gravityMs2,
    baseGravityMs2,
    gravityDeltaPct,
    escapeVelKms
  };
}

// ==========================================
// LIVE MINI 2D CANVAS SIMULATOR PREVIEW FOR CARDS
// ==========================================

function CelestialMiniPreview({ template }: { template: CatalogTemplate }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angle = Math.random() * Math.PI * 2;

    const renderPreview = () => {
      angle += 0.03;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const r = template.hasRings || template.hasRelativisticJets ? 13 : 17;

      ctx.clearRect(0, 0, w, h);

      if (template.hasRelativisticJets) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(0.45);
        const jetGrad = ctx.createLinearGradient(0, -25, 0, 25);
        jetGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
        jetGrad.addColorStop(0.5, template.glowColor || "#38bdf8");
        jetGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.strokeStyle = jetGrad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(0, 25);
        ctx.stroke();
        ctx.restore();
      }

      if (
        template.type === "star" ||
        template.type === "black_hole" ||
        template.type === "neutron_star" ||
        template.hasAtmosphere
      ) {
        const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.7);
        const gCol = template.glowColor || template.atmosphereColor || template.color;
        glowGrad.addColorStop(0, gCol + "99");
        glowGrad.addColorStop(0.6, gCol + "33");
        glowGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
        ctx.fill();
      }

      if (template.hasRings) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.32);
        ctx.scale(1, 0.34);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.85, Math.PI, Math.PI * 2);
        ctx.strokeStyle = template.ringColor || "#dec484";
        ctx.lineWidth = 4.2;
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      if (template.type === "black_hole") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.strokeStyle = template.glowColor || "#a855f7";
        ctx.lineWidth = 2.2;
        ctx.stroke();
      } else if (template.type === "star" || template.type === "neutron_star") {
        const starGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 1.5, cx, cy, r);
        starGrad.addColorStop(0, "#ffffff");
        starGrad.addColorStop(0.45, template.color);
        starGrad.addColorStop(1, template.glowColor || "#991b1b");
        ctx.fillStyle = starGrad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      } else {
        const planetGrad = ctx.createRadialGradient(
          cx - r * 0.35,
          cy - r * 0.35,
          2,
          cx + r * 0.2,
          cy + r * 0.2,
          r * 1.25
        );
        planetGrad.addColorStop(0, template.color);
        planetGrad.addColorStop(0.7, template.color);
        planetGrad.addColorStop(1, "#020617");
        ctx.fillStyle = planetGrad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        const offset = (angle * 8) % (r * 2);
        if (template.type === "gas_giant") {
          ctx.fillStyle = "rgba(255,255,255,0.24)";
          ctx.fillRect(cx - r, cy - r * 0.45, r * 2, 3);
          ctx.fillRect(cx - r, cy + r * 0.15, r * 2, 3.5);
        } else if (template.textureKey === "Earth") {
          ctx.fillStyle = "rgba(34, 197, 94, 0.55)";
          ctx.beginPath();
          ctx.arc(cx - r + offset, cy - 3, 5.5, 0, Math.PI * 2);
          ctx.arc(cx + offset - r * 0.3, cy + 4, 4.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
          ctx.beginPath();
          ctx.arc(cx - r + offset, cy - 2, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      if (template.hasRings) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.32);
        ctx.scale(1, 0.34);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.85, 0, Math.PI);
        ctx.strokeStyle = template.ringColor || "#dec484";
        ctx.lineWidth = 4.2;
        ctx.stroke();
        ctx.restore();
      }

      animId = requestAnimationFrame(renderPreview);
    };

    animId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(animId);
  }, [template]);

  return (
    <canvas
      ref={canvasRef}
      width={54}
      height={54}
      className="w-12 h-12 shrink-0 rounded-xl bg-[#050811] border border-slate-800/90 shadow-inner"
    />
  );
}

// ==========================================
// UNIFIED CONTINUOUS EINSTEIN SPACETIME CURVATURE GRID
// ==========================================

const spacetimeCurvatureVertexShader = `
  uniform vec3 uBodyPositions[24];
  uniform float uBodyMasses[24];
  uniform float uBodyRadii[24];
  uniform int uBodyCount;
  uniform float uGravityConstant;
  uniform vec2 uCenterOffset;
  uniform float uMaxDepression;

  uniform vec3 uRippleCenters[6];
  uniform float uRippleAges[6];
  uniform float uRippleIntensities[6];
  uniform int uRippleCount;

  varying vec3 vWorldPosition;
  varying vec3 vNormalVec;
  varying float vTotalDepression;
  varying float vGravitationalPotential;
  varying float vDistToCenter;
  varying float vWaveHighlight;

  void main() {
    // Map plane local XY coordinates to world XZ
    vec3 worldPos = vec3(position.x + uCenterOffset.x, 0.0, position.y + uCenterOffset.y);
    float totalDepression = 0.0;
    float gravPotential = 0.0;
    vec2 dY_dXZ = vec2(0.0, 0.0);

    for (int i = 0; i < 24; i++) {
      if (i >= uBodyCount) break;
      float dx = worldPos.x - uBodyPositions[i].x;
      float dz = worldPos.z - uBodyPositions[i].z;
      float distSq = dx * dx + dz * dz;
      float mass = uBodyMasses[i];
      float rad = max(0.5, uBodyRadii[i]);

      // Physical surface gravity factor (mass / rad^2) to dictate steeper and deeper warping for dense objects like black holes
      float surfaceGravityFactor = mass / (rad * rad);
      // Combine mass and surface gravity to determine the depth and steepness of the well dynamically
      float depthScale = 0.45 * mass * (1.0 + min(12.0, surfaceGravityFactor * 0.08));

      // For compact objects, we want the well to be physically sharper and narrower near the center
      float aSq = pow(rad * 1.1 + 0.5, 2.0);
      float denom = sqrt(distSq + aSq);

      // Relativistic general relativity spacetime metric depression without flat artificial limit
      float well = (uGravityConstant * depthScale) / denom;
      totalDepression += well;
      gravPotential += well;

      // Analytical spatial gradient: dY/dx and dY/dz for silky smooth surface normals
      float dDenom = denom * denom * denom;
      float dFactor = (uGravityConstant * depthScale) / dDenom;
      dY_dXZ.x += dFactor * dx;
      dY_dXZ.y += dFactor * dz;
    }

    // Dynamic Gravitational Waves propagating across the Einstein spacetime fabric
    float waveDisplacement = 0.0;
    float waveGlow = 0.0;

    for (int r = 0; r < 6; r++) {
      if (r >= uRippleCount) break;
      float age = uRippleAges[r];
      if (age <= 0.0 || age > 3.5) continue;

      float distToCenter = length(worldPos.xz - uRippleCenters[r].xz);
      float waveRadius = age * 65.0; // Wave propagation speed across spacetime
      float deltaDist = abs(distToCenter - waveRadius);

      if (deltaDist < 26.0) {
        float wavePhase = (distToCenter - waveRadius) * 0.38;
        float spatialDecay = exp(-pow(deltaDist / 8.5, 2.0));
        float temporalDecay = exp(-age * 0.85);
        float amp = uRippleIntensities[r] * 8.5 * spatialDecay * temporalDecay;

        waveDisplacement += sin(wavePhase) * amp;
        waveGlow += spatialDecay * temporalDecay * uRippleIntensities[r];
      }
    }

    // Smooth asymptotic depth scaling that gracefully and continuously curves downwards without the harsh flat-bottom truncations of tanh(x)
    float smoothDepression = totalDepression / (1.0 + totalDepression * 0.0035);
    worldPos.y = -smoothDepression + waveDisplacement;

    // Correct derivative of the smooth algebraic function: d(smooth) / d(total) = 1 / (1 + k * total)^2
    float dSmooth = 1.0 / pow(1.0 + totalDepression * 0.0035, 2.0);
    // Correct surface normal pointing upwards
    vec3 norm = normalize(vec3(-dY_dXZ.x * dSmooth, 1.0, -dY_dXZ.y * dSmooth));

    vWorldPosition = worldPos;
    vNormalVec = norm;
    vTotalDepression = smoothDepression;
    vGravitationalPotential = gravPotential;
    vDistToCenter = length(position.xy);
    vWaveHighlight = clamp(waveGlow, 0.0, 1.0);

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

const spacetimeCurvatureFragmentShader = `
  uniform float uCellSize;
  uniform float uSectionSize;
  uniform float uFadeDistance;
  uniform vec3 uCellColor;
  uniform vec3 uSectionColor;
  uniform vec3 uGlowColor;

  varying vec3 vWorldPosition;
  varying vec3 vNormalVec;
  varying float vTotalDepression;
  varying float vGravitationalPotential;
  varying float vDistToCenter;
  varying float vWaveHighlight;

  void main() {
    // Continuous anti-aliased Cartesian grid
    vec2 coordCell = vWorldPosition.xz / uCellSize;
    vec2 gridCell = abs(fract(coordCell - 0.5) - 0.5) / fwidth(coordCell);
    float lineCell = 1.0 - min(min(gridCell.x, gridCell.y), 1.0);

    vec2 coordSection = vWorldPosition.xz / uSectionSize;
    vec2 gridSection = abs(fract(coordSection - 0.5) - 0.5) / fwidth(coordSection);
    float lineSection = 1.0 - min(min(gridSection.x, gridSection.y), 1.0);

    // Concentric Gravitational Equipotential Isolines (elevation contours on the warped fabric)
    float isoScale = 1.25;
    float isoCoord = vGravitationalPotential * isoScale;
    float isoLine = abs(fract(isoCoord - 0.5) - 0.5) / fwidth(isoCoord);
    float isoStrength = 1.0 - min(isoLine, 1.0);

    // Smooth circular distance fade towards horizon
    float distFade = 1.0 - smoothstep(uFadeDistance * 0.82, uFadeDistance, vDistToCenter);
    if (distFade <= 0.001) discard;

    // Gravitational tension and depth illumination
    float tension = clamp(vTotalDepression * 0.075, 0.0, 1.0);

    // Normal shading: soft top light + Fresnel edge glow for the 3D membrane look
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormalVec)), 2.8);
    float slope = 1.0 - vNormalVec.y; // 0 on flat, 1 on vertical wall

    // Line colors
    vec3 lineColor = mix(uCellColor, uSectionColor, lineSection * 0.75);
    lineColor = mix(lineColor, uGlowColor, tension * 0.88);
    lineColor = mix(lineColor, vec3(0.35, 0.85, 1.0), isoStrength * 0.65 * tension);

    // Gravitational Wave Ripple Luminous Color Integration
    vec3 gravWaveColor = vec3(0.22, 0.88, 1.0);
    lineColor = mix(lineColor, gravWaveColor * 2.2, vWaveHighlight * 0.85);

    // Sheet membrane base (translucent luminous plane surface)
    vec3 membraneColor = mix(vec3(0.012, 0.035, 0.08), vec3(0.025, 0.11, 0.26), tension * 0.9);
    membraneColor += vec3(0.12, 0.35, 0.65) * (fresnel * 0.45 + slope * 0.25);
    membraneColor += gravWaveColor * vWaveHighlight * 0.55;

    float lineAlpha = max(lineCell * 0.48, lineSection * 0.96) + isoStrength * 0.45 * tension + vWaveHighlight * 0.6;
    float membraneAlpha = (0.08 + tension * 0.28 + slope * 0.18 + fresnel * 0.22) * 0.85;

    float totalAlpha = max(lineAlpha, membraneAlpha) * distFade;
    if (totalAlpha < 0.01) discard;

    vec3 finalColor = mix(membraneColor, lineColor, clamp(lineAlpha * 1.5, 0.0, 1.0));

    gl_FragColor = vec4(finalColor, totalAlpha);
  }
`;

function ContinuousDeformedSpacetimeGrid({
  visible,
  bodies,
  showGravityWells,
  gravityConstant,
  explosions = [],
  onScaleChange
}: {
  visible: boolean;
  bodies: SandboxBody[];
  showGravityWells: boolean;
  gravityConstant: number;
  explosions?: SandboxExplosion[];
  onScaleChange?: (cellSize: number) => void;
}) {
  const { camera, controls } = useThree();
  const shaderMatRef = useRef<THREE.ShaderMaterial>(null);
  const [gridConfig, setGridConfig] = useState({
    cellSize: 5,
    sectionSize: 25,
    fadeDistance: 450,
    planeDim: 750,
    centerX: 0,
    centerZ: 0
  });

  const lastDistRef = useRef(0);
  const lastCenterRef = useRef({ x: 0, z: 0 });

  // Reusable body data buffers for shader uniforms
  const { bodyPositions, bodyMasses, bodyRadii, rippleCenters, rippleAges, rippleIntensities } =
    useMemo(() => {
      const posArr: THREE.Vector3[] = [];
      const mArr = new Float32Array(24);
      const rArr = new Float32Array(24);
      const ripCenters: THREE.Vector3[] = [];
      const ripAges = new Float32Array(6);
      const ripIntensities = new Float32Array(6);

      for (let i = 0; i < 24; i++) {
        posArr.push(new THREE.Vector3(0, 0, 0));
      }
      for (let j = 0; j < 6; j++) {
        ripCenters.push(new THREE.Vector3(0, 0, 0));
      }
      return {
        bodyPositions: posArr,
        bodyMasses: mArr,
        bodyRadii: rArr,
        rippleCenters: ripCenters,
        rippleAges: ripAges,
        rippleIntensities: ripIntensities
      };
    }, []);

  useFrame(() => {
    if (!visible) return;

    const target = (controls as any)?.target || new THREE.Vector3(0, 0, 0);
    const dist = camera.position.distanceTo(target);

    const distChanged = Math.abs(dist - lastDistRef.current) / (lastDistRef.current || 1) > 0.1;
    const centerMoved =
      Math.hypot(target.x - lastCenterRef.current.x, target.z - lastCenterRef.current.z) >
      gridConfig.sectionSize * 0.5;

    if (distChanged || centerMoved) {
      lastDistRef.current = dist;

      // Multi-scale LOD progression matching the Solar System Simulator
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
      else cellSize = 55000;

      const sectionSize = cellSize * 5;
      const snapX = Math.round(target.x / sectionSize) * sectionSize;
      const snapZ = Math.round(target.z / sectionSize) * sectionSize;
      lastCenterRef.current = { x: snapX, z: snapZ };

      // Grow the plane dimension dynamically to keep bodies from leaving the visible grid
      let maxBodyDist = 0;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.type !== "debris") {
          const d = Math.hypot(b.pos[0] - snapX, b.pos[2] - snapZ);
          if (d > maxBodyDist) maxBodyDist = d;
        }
      }

      // Dynamically expand the grid without a hard constraint so it accommodates arbitrary distances and zoom scales
      const planeDim = Math.max(1600, Math.max(dist * 5.0, maxBodyDist * 2.5 + 500));
      const fadeDistance = planeDim * 0.94;

      setGridConfig({
        cellSize,
        sectionSize,
        fadeDistance,
        planeDim,
        centerX: snapX,
        centerZ: snapZ
      });
      if (onScaleChange) onScaleChange(cellSize);
    }

    // Update uniform values every frame
    if (shaderMatRef.current) {
      const u = shaderMatRef.current.uniforms;
      u.uCellSize.value = gridConfig.cellSize;
      u.uSectionSize.value = gridConfig.sectionSize;
      u.uFadeDistance.value = gridConfig.fadeDistance;
      u.uCenterOffset.value.set(gridConfig.centerX, gridConfig.centerZ);
      u.uGravityConstant.value = showGravityWells ? gravityConstant : 0.0;

      let count = 0;
      for (let i = 0; i < bodies.length && count < 24; i++) {
        const b = bodies[i];
        if (b.type === "debris" && b.mass < 1.0) continue;
        bodyPositions[count].set(b.pos[0], b.pos[1], b.pos[2]);
        bodyMasses[count] = b.mass;
        bodyRadii[count] = b.radius;
        count++;
      }
      u.uBodyCount.value = count;

      // Update Gravitational Wave Ripple Uniforms
      const now = performance.now();
      const recentExplosions = explosions.slice(-6);
      let rCount = 0;
      for (let j = 0; j < recentExplosions.length && rCount < 6; j++) {
        const exp = recentExplosions[j];
        const age = (now - exp.createdMs) / 1000;
        if (age >= 0 && age <= 3.5) {
          rippleCenters[rCount].set(exp.pos[0], exp.pos[1], exp.pos[2]);
          rippleAges[rCount] = age;
          rippleIntensities[rCount] = exp.isSupernova ? 2.6 : 1.5;
          rCount++;
        }
      }
      u.uRippleCount.value = rCount;
    }
  });

  if (!visible) return null;

  return (
    <group position={[gridConfig.centerX, -0.01, gridConfig.centerZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[gridConfig.planeDim, gridConfig.planeDim, 260, 260]} />
        <shaderMaterial
          ref={shaderMatRef}
          vertexShader={spacetimeCurvatureVertexShader}
          fragmentShader={spacetimeCurvatureFragmentShader}
          uniforms={{
            uCellSize: { value: gridConfig.cellSize },
            uSectionSize: { value: gridConfig.sectionSize },
            uFadeDistance: { value: gridConfig.fadeDistance },
            uCenterOffset: { value: new THREE.Vector2(gridConfig.centerX, gridConfig.centerZ) },
            uGravityConstant: { value: showGravityWells ? gravityConstant : 0.0 },
            uMaxDepression: { value: 38.0 },
            uBodyPositions: { value: bodyPositions },
            uBodyMasses: { value: bodyMasses },
            uBodyRadii: { value: bodyRadii },
            uBodyCount: { value: 0 },
            uRippleCenters: { value: rippleCenters },
            uRippleAges: { value: rippleAges },
            uRippleIntensities: { value: rippleIntensities },
            uRippleCount: { value: 0 },
            uCellColor: { value: new THREE.Color("#182234") },
            uSectionColor: { value: new THREE.Color("#38bdf8") },
            uGlowColor: { value: new THREE.Color("#38bdf8") }
          }}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// ==========================================
// DYNAMIC HABITABLE ZONE (GOLDILOCKS DISK)
// ==========================================

function HabitableZoneRing({ star }: { star: SandboxBody }) {
  const astro = useMemo(
    () => computeStarAstrophysics(star.tempK || 5778, star.mass, star.radius),
    [star.tempK, star.mass, star.radius]
  );

  if (!star || (star.type !== "star" && star.type !== "neutron_star")) return null;

  return (
    <mesh position={[star.pos[0], -0.04, star.pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[astro.hzInner, astro.hzOuter, 64]} />
      <meshBasicMaterial
        color="#22c55e"
        transparent
        opacity={0.14}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ==========================================
// MODE 1: PERSISTENT SLOWLY-FADING TRAJECTORY HISTORY LINE
// ==========================================

function FadingTrajectoryHistoryLine({
  body,
  visible
}: {
  body: SandboxBody;
  visible: boolean;
}) {
  const maxPoints = body.type === "debris" ? 50 : 340;
  const historyRef = useRef<number[]>([]);
  const geomRef = useRef<THREE.BufferGeometry>(null);

  const { positionsArray, colorsArray } = useMemo(() => {
    return {
      positionsArray: new Float32Array(maxPoints * 3),
      colorsArray: new Float32Array(maxPoints * 3)
    };
  }, [maxPoints]);

  const baseColor = useMemo(() => new THREE.Color(body.color), [body.color]);

  useFrame(() => {
    if (!visible || !geomRef.current) return;
    const hist = historyRef.current;
    const lastIdx = hist.length - 3;

    if (
      lastIdx < 0 ||
      Math.hypot(
        body.pos[0] - hist[lastIdx],
        body.pos[1] - hist[lastIdx + 1],
        body.pos[2] - hist[lastIdx + 2]
      ) > 0.14
    ) {
      hist.push(body.pos[0], body.pos[1], body.pos[2]);
      if (hist.length > maxPoints * 3) {
        hist.splice(0, 3);
      }

      const ptCount = hist.length / 3;
      for (let i = 0; i < ptCount; i++) {
        const i3 = i * 3;
        positionsArray[i3] = hist[i3];
        positionsArray[i3 + 1] = hist[i3 + 1];
        positionsArray[i3 + 2] = hist[i3 + 2];

        // Smooth persistent tail fade: slowly fades from 0.0 at oldest point to 1.0 at current planet position
        const t = ptCount > 1 ? i / (ptCount - 1) : 1.0;
        const fade = Math.pow(t, 1.65);
        colorsArray[i3] = baseColor.r * fade;
        colorsArray[i3 + 1] = baseColor.g * fade;
        colorsArray[i3 + 2] = baseColor.b * fade;
      }

      geomRef.current.attributes.position.needsUpdate = true;
      geomRef.current.attributes.color.needsUpdate = true;
      geomRef.current.setDrawRange(0, ptCount);
    }
  });

  if (!visible) return null;

  return (
    <line>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          count={maxPoints}
          array={positionsArray}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={maxPoints}
          array={colorsArray}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.92}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </line>
  );
}

// ==========================================
// MODE 2: INSTANTANEOUS PREDICTED / KEPLERIAN ORBIT LINE
// ==========================================

function InstantaneousOrbitLine({
  body,
  allBodies,
  gravityConstant,
  visible
}: {
  body: SandboxBody;
  allBodies: SandboxBody[];
  gravityConstant: number;
  visible: boolean;
}) {
  const segments = 160;
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const positionsArray = useMemo(() => new Float32Array(segments * 3), [segments]);
  const colorsArray = useMemo(() => new Float32Array(segments * 3), [segments]);
  const baseColor = useMemo(() => new THREE.Color(body.color), [body.color]);

  useFrame(() => {
    if (!visible || !geomRef.current || body.type === "debris") return;

    // Forward-integrate the instantaneous trajectory of `body` in the gravitational field of all other bodies
    const G = 0.08 * gravityConstant;
    const softeningSq = 0.04; // Matches the physical engine perfectly for 100% trajectory accuracy
    let px = body.pos[0];
    let py = body.pos[1];
    let pz = body.pos[2];
    let vx = body.vel[0];
    let vy = body.vel[1];
    let vz = body.vel[2];

    const speed = Math.max(0.2, Math.hypot(vx, vy, vz));
    const dtStep = Math.min(0.45, Math.max(0.08, 0.85 / speed));

    for (let s = 0; s < segments; s++) {
      const s3 = s * 3;
      positionsArray[s3] = px;
      positionsArray[s3 + 1] = py;
      positionsArray[s3 + 2] = pz;

      // Subtle fade along the predicted instantaneous orbit loop
      const fade = 1.0 - (s / segments) * 0.72;
      colorsArray[s3] = baseColor.r * fade;
      colorsArray[s3 + 1] = baseColor.g * fade;
      colorsArray[s3 + 2] = baseColor.b * fade;

      let ax = 0;
      let ay = 0;
      let az = 0;
      for (let j = 0; j < allBodies.length; j++) {
        const other = allBodies[j];
        if (other.id === body.id || other.type === "debris") continue;
        const dx = other.pos[0] - px;
        const dy = other.pos[1] - py;
        const dz = other.pos[2] - pz;
        const distSq = dx * dx + dy * dy + dz * dz;
        const f = (G * other.mass) / Math.pow(distSq + softeningSq, 1.5);
        ax += f * dx;
        ay += f * dy;
        az += f * dz;
      }

      vx += ax * dtStep;
      vy += ay * dtStep;
      vz += az * dtStep;
      px += vx * dtStep;
      py += vy * dtStep;
      pz += vz * dtStep;
    }

    geomRef.current.attributes.position.needsUpdate = true;
    geomRef.current.attributes.color.needsUpdate = true;
    geomRef.current.setDrawRange(0, segments);
  });

  if (!visible || body.type === "debris") return null;

  return (
    <line>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          count={segments}
          array={positionsArray}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={segments}
          array={colorsArray}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.78}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </line>
  );
}

// ==========================================
// 3D HIGH-FIDELITY CELESTIAL BODY MESH
// ==========================================

function SandboxCelestialBodyMesh({
  body,
  allBodies,
  gravityConstant,
  isSelected,
  onSelect,
  showTrails,
  trajectoryMode,
  isPaused,
  texturesMap,
  ringTexture,
  cloudsTexture,
  draggingBodyId,
  setDraggingBodyId,
  draggingVelocityId,
  setDraggingVelocityId,
  handleUpdateSelected,
  setIsPaused
}: {
  body: SandboxBody;
  allBodies: SandboxBody[];
  gravityConstant: number;
  isSelected: boolean;
  onSelect: () => void;
  showTrails: boolean;
  trajectoryMode: "history" | "instant_orbit";
  isPaused: boolean;
  texturesMap: Record<string, THREE.CanvasTexture>;
  ringTexture: THREE.CanvasTexture;
  cloudsTexture: THREE.CanvasTexture;
  draggingBodyId: string | null;
  setDraggingBodyId: (id: string | null) => void;
  draggingVelocityId: string | null;
  setDraggingVelocityId: (id: string | null) => void;
  handleUpdateSelected: (patch: Partial<SandboxBody>) => void;
  setIsPaused: (paused: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const starShaderRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.position.set(body.pos[0], body.pos[1], body.pos[2]);
    }
    if (!isPaused) {
      if (sphereRef.current) {
        sphereRef.current.rotation.y += delta * (body.rotationSpeed || 0.55);
      }
      if (cloudsRef.current) {
        cloudsRef.current.rotation.y += delta * 0.65;
      }
      if (starShaderRef.current) {
        starShaderRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      }
    }
  });

  const surfaceTexture = useMemo(() => {
    if (body.type === "star" || body.type === "neutron_star") {
      if (body.textureKey === "Sun" && texturesMap["Sun"]) return texturesMap["Sun"];
      return generateStarHDTexture(body.color);
    }
    return texturesMap[body.textureKey] || texturesMap["Earth"];
  }, [body.type, body.textureKey, body.color, texturesMap]);

  const astro = useMemo(() => {
    if (body.type === "star" || body.type === "neutron_star") {
      return computeStarAstrophysics(body.tempK || 5778, body.mass, body.radius);
    }
    return null;
  }, [body.type, body.tempK, body.mass, body.radius]);

  const isHighTempPlanet = useMemo(() => {
    if (body.type === "star" || body.type === "black_hole") return false;
    if (body.tempK && body.tempK > 750) return true;
    const star = allBodies.find((b) => b.type === "star" || b.type === "neutron_star");
    if (!star) return false;
    const dist = Math.hypot(body.pos[0] - star.pos[0], body.pos[2] - star.pos[2]);
    const starTemp = star.tempK || 5778;
    const starRad = star.radius || 2.4;
    const tEq = starTemp * Math.sqrt(starRad / (2.0 * Math.max(0.5, dist))) * 0.95;
    return tEq > 750;
  }, [body.type, body.tempK, body.pos, allBodies]);

  const starColors = useMemo(() => {
    if (astro) {
      return { base: new THREE.Color(astro.baseColor), hot: new THREE.Color(astro.hotColor) };
    }
    const base = new THREE.Color(body.color);
    const hot = new THREE.Color("#ffffff").lerp(base, 0.22);
    return { base, hot };
  }, [astro, body.color]);

  const tiltRad = THREE.MathUtils.degToRad(body.axialTilt || 12);
  const impactHeat = body.impactHeat || 0;

  // Infinite Plane (y=0) intersection math for dragging elements in 3D Space
  const getPlaneIntersection = (e: any) => {
    const raycaster = e.raycaster;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, targetPoint)) {
      return targetPoint;
    }
    return null;
  };

  const handleBodyPointerDown = (e: any) => {
    e.stopPropagation();
    setDraggingBodyId(body.id);
    setIsPaused(true);
    onSelect();
  };

  const handleBodyPointerMove = (e: any) => {
    if (draggingBodyId === body.id) {
      e.stopPropagation();
      const intersection = getPlaneIntersection(e);
      if (intersection) {
        handleUpdateSelected({
          pos: [intersection.x, 0, intersection.z]
        });
      }
    }
  };

  const handleBodyPointerUp = (e: any) => {
    if (draggingBodyId === body.id) {
      e.stopPropagation();
      setDraggingBodyId(null);
    }
  };

  const velocityDrawScale = 1.6;

  const handleVelPointerDown = (e: any) => {
    e.stopPropagation();
    setDraggingVelocityId(body.id);
    setIsPaused(true);
  };

  const handleVelPointerMove = (e: any) => {
    if (draggingVelocityId === body.id) {
      e.stopPropagation();
      const intersection = getPlaneIntersection(e);
      if (intersection) {
        const dx = intersection.x - body.pos[0];
        const dz = intersection.z - body.pos[2];
        handleUpdateSelected({
          vel: [dx / velocityDrawScale, 0, dz / velocityDrawScale]
        });
      }
    }
  };

  const handleVelPointerUp = (e: any) => {
    if (draggingVelocityId === body.id) {
      e.stopPropagation();
      setDraggingVelocityId(null);
    }
  };

  return (
    <>
      {/* Trajectory Visualization: History Trail vs Instantaneous Orbit */}
      {showTrails && trajectoryMode === "history" && (
        <FadingTrajectoryHistoryLine body={body} visible={showTrails} />
      )}
      {showTrails && trajectoryMode === "instant_orbit" && (
        <InstantaneousOrbitLine
          body={body}
          allBodies={allBodies}
          gravityConstant={gravityConstant}
          visible={showTrails}
        />
      )}

      <group
        ref={groupRef}
        position={body.pos}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {(body.type === "star" || body.type === "neutron_star" || body.type === "black_hole") && (
          <pointLight
            color={astro ? astro.glowColor : body.glowColor || body.color}
            intensity={
              body.type === "star"
                ? Math.min(16.0, Math.max(2.4, 3.8 * Math.sqrt(astro?.luminositySun ?? 1)))
                : 2.6
            }
            distance={Math.max(320, Math.min(5000, 360 * Math.sqrt(astro?.luminositySun ?? 1)))}
            decay={0.85}
          />
        )}

        <group rotation={[0, 0, tiltRad]}>
          <mesh
            ref={sphereRef}
            castShadow={body.type !== "star" && body.type !== "neutron_star"}
            receiveShadow={body.type !== "star" && body.type !== "neutron_star"}
            onPointerDown={body.type !== "debris" ? handleBodyPointerDown : undefined}
            onPointerMove={body.type !== "debris" ? handleBodyPointerMove : undefined}
            onPointerUp={body.type !== "debris" ? handleBodyPointerUp : undefined}
          >
            <sphereGeometry
              args={[body.radius, body.type === "debris" ? 16 : 48, body.type === "debris" ? 16 : 48]}
            />
            {body.type === "black_hole" ? (
              <meshBasicMaterial color="#000000" />
            ) : body.type === "star" || body.type === "neutron_star" ? (
              <shaderMaterial
                ref={starShaderRef}
                vertexShader={starSurfaceVertexShader}
                fragmentShader={starSurfaceFragmentShader}
                uniforms={{
                  uTime: { value: 0 },
                  uStarTexture: { value: surfaceTexture },
                  uBaseColor: { value: starColors.base },
                  uHotColor: { value: starColors.hot }
                }}
              />
            ) : (
              <meshStandardMaterial
                map={surfaceTexture}
                roughness={body.type === "gas_giant" ? 0.42 : 0.68}
                metalness={0.1}
                emissive={
                  isHighTempPlanet || impactHeat > 0.02 || body.type === "debris"
                    ? new THREE.Color("#ff4500")
                    : new THREE.Color("#000000")
                }
                emissiveIntensity={
                  body.type === "debris"
                    ? 1.4
                    : isHighTempPlanet
                    ? 0.92
                    : impactHeat * 2.2
                }
              />
            )}
          </mesh>

          {/* Incandescent Magma Glow Shell (Post-Collision or Proximity Superheating) */}
          {(impactHeat > 0.05 || isHighTempPlanet) &&
            body.type !== "star" &&
            body.type !== "black_hole" && (
              <mesh scale={[1.09, 1.09, 1.09]}>
                <sphereGeometry args={[body.radius, 32, 32]} />
                <meshBasicMaterial
                  color="#ff5500"
                  transparent
                  opacity={isHighTempPlanet ? 0.42 : impactHeat * 0.55}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            )}

          {/* Star / Neutron Star Corona Volumetric Fresnel Halo */}
          {(body.type === "star" || body.type === "neutron_star") && (
            <mesh
              scale={[
                1.3 + Math.min(0.5, (astro?.luminositySun ?? 1) * 0.025),
                1.3 + Math.min(0.5, (astro?.luminositySun ?? 1) * 0.025),
                1.3 + Math.min(0.5, (astro?.luminositySun ?? 1) * 0.025)
              ]}
            >
              <sphereGeometry args={[body.radius, 36, 36]} />
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
                  uniform vec3 uGlowColor;
                  void main() {
                    float intensity = pow(max(0.0, vNormal.z), 2.3);
                    gl_FragColor = vec4(uGlowColor, intensity * 0.78);
                  }
                `}
                uniforms={{
                  uGlowColor: {
                    value: new THREE.Color(
                      astro ? astro.glowColor : body.glowColor || body.color
                    )
                  }
                }}
                transparent
                blending={THREE.AdditiveBlending}
                side={THREE.BackSide}
                depthWrite={false}
              />
            </mesh>
          )}

          {/* Relativistic Polar Bipolar Jets */}
          {body.hasRelativisticJets && (
            <group>
              <mesh position={[0, body.radius * 3.2, 0]}>
                <cylinderGeometry
                  args={[body.radius * 0.55, body.radius * 0.08, body.radius * 5.8, 24, 1, true]}
                />
                <meshBasicMaterial
                  color={body.glowColor || "#38bdf8"}
                  transparent
                  opacity={0.45}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0, -body.radius * 3.2, 0]} rotation={[Math.PI, 0, 0]}>
                <cylinderGeometry
                  args={[body.radius * 0.55, body.radius * 0.08, body.radius * 5.8, 24, 1, true]}
                />
                <meshBasicMaterial
                  color={body.glowColor || "#38bdf8"}
                  transparent
                  opacity={0.45}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            </group>
          )}

          {/* Black Hole Event Horizon Lensing Halo & Relativistic Accretion Disk */}
          {body.type === "black_hole" && (
            <>
              <mesh scale={[1.22, 1.22, 1.22]}>
                <sphereGeometry args={[body.radius, 36, 36]} />
                <meshBasicMaterial
                  color={body.glowColor || "#a855f7"}
                  transparent
                  opacity={0.45}
                  side={THREE.BackSide}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              <mesh rotation={[-Math.PI / 2.15, 0, 0]}>
                <ringGeometry args={[body.radius * 1.3, body.radius * 3.2, 64]} />
                <meshBasicMaterial
                  map={ringTexture}
                  color={body.ringColor || "#f97316"}
                  side={THREE.DoubleSide}
                  transparent
                  opacity={0.95}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            </>
          )}

          {/* Earth Cloud Layer */}
          {(body.hasClouds || body.textureKey === "Earth") && body.type === "rocky" && (
            <mesh ref={cloudsRef} scale={[1.022, 1.022, 1.022]}>
              <sphereGeometry args={[body.radius, 40, 40]} />
              <meshStandardMaterial
                map={cloudsTexture}
                transparent
                opacity={0.64}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          )}

          {/* Rayleigh Atmospheric Limb Glow */}
          {body.hasAtmosphere && body.type !== "star" && body.type !== "black_hole" && (
            <mesh scale={[1.065, 1.065, 1.065]}>
              <sphereGeometry args={[body.radius, 36, 36]} />
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
                  uniform vec3 uAtmoColor;
                  void main() {
                    float rim = 1.0 - max(0.0, vNormal.z);
                    float alpha = pow(rim, 2.7) * 0.72;
                    gl_FragColor = vec4(uAtmoColor, alpha);
                  }
                `}
                uniforms={{
                  uAtmoColor: { value: new THREE.Color(body.atmosphereColor || body.color) }
                }}
                transparent
                blending={THREE.AdditiveBlending}
                side={THREE.BackSide}
                depthWrite={false}
              />
            </mesh>
          )}

          {/* Planetary Rings */}
          {body.hasRings && body.type !== "black_hole" && (
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[body.radius * 1.35, body.radius * 2.38, 64]} />
              <meshStandardMaterial
                map={ringTexture}
                color={body.ringColor || "#e2c893"}
                side={THREE.DoubleSide}
                transparent
                opacity={0.92}
                roughness={0.55}
              />
            </mesh>
          )}
        </group>

        {/* Real-Time Interactive 3D Velocity Vector Slingshot Handle */}
        {isSelected && body.type !== "debris" && (
          <group position={[0, 0.05, 0]}>
            {/* Cylinder shaft pointing in direction of velocity */}
            {Math.hypot(body.vel[0], body.vel[2]) > 0.05 && (
              <mesh
                position={[
                  (body.vel[0] * velocityDrawScale) / 2,
                  0,
                  (body.vel[2] * velocityDrawScale) / 2
                ]}
                rotation={[
                  0,
                  -Math.atan2(body.vel[2], body.vel[0]) + Math.PI / 2,
                  Math.PI / 2
                ]}
              >
                <cylinderGeometry
                  args={[
                    0.08,
                    0.08,
                    Math.hypot(body.vel[0], body.vel[2]) * velocityDrawScale,
                    8
                  ]}
                />
                <meshBasicMaterial
                  color="#22d3ee"
                  transparent
                  opacity={0.8}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            )}

            {/* Glowing handle at the tip of the velocity vector */}
            <mesh
              position={[
                body.vel[0] * velocityDrawScale,
                0,
                body.vel[2] * velocityDrawScale
              ]}
              onPointerDown={handleVelPointerDown}
              onPointerMove={handleVelPointerMove}
              onPointerUp={handleVelPointerUp}
            >
              <sphereGeometry args={[0.35, 16, 16]} />
              <meshBasicMaterial
                color={draggingVelocityId === body.id ? "#f59e0b" : "#22d3ee"}
                transparent
                opacity={0.9}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
        )}

        {/* Selection HUD Reticle */}
        {isSelected && (
          <Html center zIndexRange={[80, 0]} className="pointer-events-none select-none">
            <div className="relative flex items-center justify-center w-12 h-12">
              <div className="w-11 h-11 rounded-full border border-cyan-400/90 animate-pulse shadow-[0_0_14px_rgba(34,211,238,0.6)]" />
              <div className="absolute -top-6 whitespace-nowrap px-2 py-0.5 rounded-md bg-[#060a14]/95 border border-cyan-500/40 text-[10px] font-mono font-bold text-cyan-200 shadow-lg">
                {body.name} ({body.mass.toFixed(1)} M)
              </div>
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

// ==========================================
// SPECTACULAR MULTI-LAYERED 3D EXPLOSIONS, RADIAL SHOCKWAVES & DEBRIS TRAILS
// ==========================================

const shockwaveVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const shockwaveFragmentShader = `
  uniform float uElapsed;
  uniform float uDuration;
  uniform float uMaxRadius;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    float p = clamp(uElapsed / uDuration, 0.0, 1.0);
    float currentRadiusNorm = pow(p, 0.62);

    float distNorm = length(vUv - vec2(0.5)) * 2.0;
    float delta = abs(distNorm - currentRadiusNorm);

    float ringWidthNorm = 0.08 + p * 0.12;
    if (delta > ringWidthNorm) discard;

    float ringIntensity = exp(-pow(delta / (ringWidthNorm * 0.45), 2.0));
    float fadeOut = pow(1.0 - p, 0.85);
    float alpha = ringIntensity * fadeOut * 0.88;

    if (alpha < 0.01) discard;

    vec3 finalCol = mix(uColor, vec3(1.0), ringIntensity * 0.7);
    gl_FragColor = vec4(finalCol, alpha);
  }
`;

function RadialShockwaveRing({ exp }: { exp: SandboxExplosion }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const duration = 2.0; // Exactly 2 seconds radial shockwave expansion
  const maxRadius = exp.isSupernova ? exp.radius * 28.0 : exp.radius * 18.0;

  useFrame(() => {
    if (matRef.current) {
      const elapsed = (performance.now() - exp.createdMs) / 1000;
      matRef.current.uniforms.uElapsed.value = elapsed;
    }
  });

  return (
    <mesh position={[exp.pos[0], 0.02, exp.pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[maxRadius * 2, maxRadius * 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={shockwaveVertexShader}
        fragmentShader={shockwaveFragmentShader}
        uniforms={{
          uElapsed: { value: 0 },
          uDuration: { value: duration },
          uMaxRadius: { value: maxRadius },
          uColor: { value: new THREE.Color(exp.isSupernova ? "#38bdf8" : exp.colorA) }
        }}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function SandboxExplosions3D({ explosions }: { explosions: SandboxExplosion[] }) {
  const [, setTick] = useState(0);

  useFrame(() => {
    if (explosions.length > 0) {
      setTick((t) => (t + 1) % 10000);
    }
  });

  const now = performance.now();

  return (
    <group>
      {explosions.map((exp) => {
        const duration = exp.isSupernova ? 4.2 : 3.0;
        const elapsed = (now - exp.createdMs) / 1000;
        if (elapsed > duration) return null;

        const p = Math.min(1, elapsed / duration);
        const speedMul = exp.isSupernova ? 1.65 : 1.0;
        const coreScale = exp.radius * (0.9 + Math.pow(p, 0.5) * 6.5 * speedMul);
        const outerFireballScale = exp.radius * (1.2 + Math.pow(p, 0.65) * 10.5 * speedMul);
        const primaryWaveScale = exp.radius * (1.4 + Math.pow(p, 0.45) * 18.0 * speedMul);
        const secondaryWaveScale = exp.radius * (1.1 + Math.pow(p, 0.6) * 13.0 * speedMul);
        const opacity = Math.max(0, 1 - Math.pow(p, 0.85));

        // Persistent 2-second trail fade factor for debris particles
        const trailOpacity = Math.max(0, 1 - elapsed / 2.0);

        return (
          <group key={exp.id} position={[exp.pos[0], 0, exp.pos[2]]}>
            <pointLight
              color={exp.isSupernova ? "#38bdf8" : exp.colorA}
              intensity={28 * opacity}
              distance={260}
            />

            {/* Radial Expanding Transparent ShaderMaterial Shockwave */}
            {elapsed <= 2.0 && <RadialShockwaveRing exp={exp} />}

            <mesh scale={[coreScale, coreScale, coreScale]}>
              <sphereGeometry args={[1, 28, 28]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={opacity * 0.95}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            <mesh scale={[outerFireballScale, outerFireballScale, outerFireballScale]}>
              <sphereGeometry args={[1, 28, 28]} />
              <meshBasicMaterial
                color={exp.isSupernova ? "#a855f7" : exp.colorA}
                transparent
                opacity={opacity * 0.58}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            <mesh
              scale={[primaryWaveScale, primaryWaveScale, primaryWaveScale]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[0.84, 1.0, 64]} />
              <meshBasicMaterial
                color={exp.isSupernova ? "#38bdf8" : exp.colorA}
                side={THREE.DoubleSide}
                transparent
                opacity={opacity * 0.85}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            <mesh
              scale={[secondaryWaveScale, secondaryWaveScale, secondaryWaveScale]}
              rotation={[Math.PI / 3, Math.PI / 5, 0]}
            >
              <ringGeometry args={[0.78, 0.96, 48]} />
              <meshBasicMaterial
                color={exp.colorB}
                side={THREE.DoubleSide}
                transparent
                opacity={opacity * 0.65}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            {/* Collision Debris Particles with Persistent 2-Second Trailing Vector Lines */}
            {exp.particles.map((pt, idx) => {
              const px = pt.vx * elapsed * 5.5;
              const py = 0; // Constrained to orbital plane y = 0
              const pz = pt.vz * elapsed * 5.5;
              const s = pt.size * Math.max(0.15, 1 - p * 0.85);

              // 2-second persistent motion vector tail
              const tailLength = Math.min(elapsed, 2.0) * 3.8;
              const tx = px - pt.vx * tailLength;
              const tz = pz - pt.vz * tailLength;

              return (
                <group key={idx}>
                  {/* Particle Mesh */}
                  <mesh position={[px, py, pz]} scale={[s, s, s]}>
                    <dodecahedronGeometry args={[1, 0]} />
                    <meshBasicMaterial
                      color={pt.color}
                      transparent
                      opacity={opacity * 0.92}
                      blending={THREE.AdditiveBlending}
                    />
                  </mesh>

                  {/* Persistent 2-Second Fading Impact Trail Line */}
                  {trailOpacity > 0.01 && (
                    <line>
                      <bufferGeometry>
                        <bufferAttribute
                          attach="attributes-position"
                          count={2}
                          array={new Float32Array([px, py, pz, tx, py, tz])}
                          itemSize={3}
                        />
                      </bufferGeometry>
                      <lineBasicMaterial
                        color={pt.color}
                        transparent
                        opacity={trailOpacity * 0.85}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                      />
                    </line>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

// ==========================================
// SYMPLECTIC ALL-PAIRS N-BODY + GENERAL RELATIVITY + ROCHE LIMIT TIDAL ENGINE
// ==========================================

function SymplecticNBodyEngine({
  bodies,
  setBodies,
  isPaused,
  simSpeed,
  gravityConstant,
  enableRelativity,
  enableTidalRoche,
  onCollision,
  onTidalDisruption
}: {
  bodies: SandboxBody[];
  setBodies: React.Dispatch<React.SetStateAction<SandboxBody[]>>;
  isPaused: boolean;
  simSpeed: number;
  gravityConstant: number;
  enableRelativity: boolean;
  enableTidalRoche: boolean;
  onCollision: (a: SandboxBody, b: SandboxBody, mid: [number, number, number]) => void;
  onTidalDisruption: (victim: SandboxBody, captor: SandboxBody) => void;
}) {
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;
  const lastEventMsRef = useRef(0);
  const lastTidalDisruptionTimeRef = useRef<Record<string, number>>({});

  useFrame((_, delta) => {
    if (isPaused || bodiesRef.current.length < 1) return;

    const dt = Math.min(delta, 0.032) * simSpeed * 1.4;
    const subSteps = 12; // Dramatically increased steps for supreme physical accuracy during high-speed swings
    const subDt = dt / subSteps;
    const G = 0.08 * gravityConstant;
    const softeningSq = 0.04; // Small, highly realistic softening so bodies accelerate and decelerate physically in close encounters
    const maxSpeed = 160.0;   // Increased velocity cap to allow spectacular relativistic slingshots
    const cSpeedSq = 1200.0;

    const current = bodiesRef.current.map((b) => ({
      ...b,
      pos: [b.pos[0], 0, b.pos[2]] as [number, number, number], // Strictly on orbital plane y = 0
      vel: [b.vel[0], 0, b.vel[2]] as [number, number, number],
      impactHeat: b.impactHeat ? Math.max(0, b.impactHeat - delta * 0.14) : 0
    }));

    for (let step = 0; step < subSteps; step++) {
      const n = current.length;
      const accX = new Float64Array(n);
      const accZ = new Float64Array(n);

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const bi = current[i];
          const bj = current[j];

          if (bi.type === "debris" && bj.type === "debris") continue;

          const dx = bj.pos[0] - bi.pos[0];
          const dz = bj.pos[2] - bi.pos[2];
          const distSq = dx * dx + dz * dz;
          const dist = Math.sqrt(distSq);

          const minRadiusSum = (bi.radius + bj.radius) * 0.76;
          if (dist < minRadiusSum && performance.now() - lastEventMsRef.current > 380) {
            lastEventMsRef.current = performance.now();
            const mid: [number, number, number] = [
              (bi.pos[0] + bj.pos[0]) * 0.5,
              0,
              (bi.pos[2] + bj.pos[2]) * 0.5
            ];
            onCollision(bi, bj, mid);
            return;
          }

          if (
            enableTidalRoche &&
            bi.type !== "debris" &&
            bj.type !== "debris" &&
            performance.now() - lastEventMsRef.current > 1400
          ) {
            const heavy = bi.mass >= bj.mass ? bi : bj;
            const light = bi.mass >= bj.mass ? bj : bi;
            const lastLightDisrupt = lastTidalDisruptionTimeRef.current[light.id] || 0;

            if (
              performance.now() - lastLightDisrupt > 2200 &&
              heavy.mass > light.mass * 3.2 &&
              light.radius > 0.75 &&
              (heavy.type === "black_hole" || heavy.type === "neutron_star" || heavy.mass > 2000)
            ) {
              const rocheDist =
                (heavy.radius + light.radius) *
                1.65 *
                Math.pow(heavy.mass / Math.max(1, light.mass * 12), 0.18);
              if (dist < rocheDist && dist > minRadiusSum * 1.05) {
                lastEventMsRef.current = performance.now();
                lastTidalDisruptionTimeRef.current[light.id] = performance.now();
                onTidalDisruption(light, heavy);
                return;
              }
            }
          }

          const invDist3 = 1.0 / Math.pow(distSq + softeningSq, 1.5);
          let f = G * invDist3;

          if (enableRelativity) {
            const relVelSq =
              Math.pow(bj.vel[0] - bi.vel[0], 2) + Math.pow(bj.vel[2] - bi.vel[2], 2);
            const schwarzschildFactor =
              (3.5 * G * (bi.mass + bj.mass)) / (dist * cSpeedSq) + relVelSq / cSpeedSq;
            f *= 1.0 + Math.min(0.85, schwarzschildFactor);
          }

          accX[i] += f * bj.mass * dx;
          accZ[i] += f * bj.mass * dz;

          accX[j] -= f * bi.mass * dx;
          accZ[j] -= f * bi.mass * dz;
        }
      }

      for (let i = 0; i < n; i++) {
        const b = current[i];
        if (b.fixedPosition) continue;
        b.vel[0] += accX[i] * subDt;
        b.vel[2] += accZ[i] * subDt;
        b.vel[1] = 0;

        // Speed limit to avoid numeric explosions
        const spd = Math.hypot(b.vel[0], b.vel[2]);
        if (spd > maxSpeed) {
          b.vel[0] = (b.vel[0] / spd) * maxSpeed;
          b.vel[2] = (b.vel[2] / spd) * maxSpeed;
        }

        b.pos[0] += b.vel[0] * subDt;
        b.pos[2] += b.vel[2] * subDt;
        b.pos[1] = 0;
      }
    }

    // Prune excessive or distant debris to maintain smooth performance
    const debrisList = current.filter((b) => b.type === "debris");
    if (debrisList.length > 10) {
      const keepIds = new Set(
        current
          .filter((b) => b.type !== "debris")
          .concat(debrisList.slice(-10))
          .map((b) => b.id)
      );
      setBodies(current.filter((b) => keepIds.has(b.id)));
    } else {
      setBodies(current);
    }
  });

  return null;
}

// ==========================================
// MAIN STANDALONE SANDBOX N-BODY LABORATORY
// ==========================================

export default function SandboxLaboratoryView({
  onReturnToSolarSystem
}: {
  onReturnToSolarSystem: () => void;
}) {
  const [activePresetId, setActivePresetId] = useState<string>("lagrange_points");
  const [bodies, setBodies] = useState<SandboxBody[]>(() =>
    SANDBOX_PRESETS[0].bodies.map((b) => ({
      ...b,
      baseMass: b.mass,
      massMultiplier: 1.0,
      baseDensity: b.density,
      densityMultiplier: 1.0,
      pos: [...b.pos],
      vel: [...b.vel]
    }))
  );
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [isInspectorMinimized, setIsInspectorMinimized] = useState(false);

  useEffect(() => {
    if (selectedBodyId) {
      setIsInspectorMinimized(false);
    }
  }, [selectedBodyId]);

  const [draggingBodyId, setDraggingBodyId] = useState<string | null>(null);
  const [draggingVelocityId, setDraggingVelocityId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<
    "general" | "mass_density" | "astrophysics"
  >("general");

  const [isPaused, setIsPaused] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1.0);
  const [gravityConstant, setGravityConstant] = useState(1.0);

  // Trajectory Visualization Selector: "history" vs "instant_orbit"
  const [trajectoryMode, setTrajectoryMode] = useState<"history" | "instant_orbit">("history");

  // Astrophysical Collision Modes
  const [collisionMode, setCollisionMode] = useState<
    "accretion_ejecta" | "supernova_destroy" | "elastic_bounce"
  >("accretion_ejecta");

  // Physics & Visual Toggles
  const [showTrails, setShowTrails] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showGravityWells, setShowGravityWells] = useState(true);
  const [showBarycenter, setShowBarycenter] = useState(true);
  const [enableRelativity, setEnableRelativity] = useState(true);
  const [enableTidalRoche, setEnableTidalRoche] = useState(true);

  // Bottom Celestial Catalog Spawner State
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState<
    "all" | "compact" | "star" | "gas_giant" | "rocky" | "small"
  >("all");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<CatalogTemplate>(CELESTIAL_CATALOG[0]);
  const [isPlaceOnClickMode, setIsPlaceOnClickMode] = useState(false);
  const [placementHoverPos, setPlacementHoverPos] = useState<[number, number, number] | null>(null);
  const [customSpawnName, setCustomSpawnName] = useState("");
  const [customSpawnVelMul, setCustomSpawnVelMul] = useState(1.0);

  // Adaptive Grid Scale Readout & Camera Controls Ref
  const [gridCellScale, setGridCellScale] = useState<number>(5);
  const orbitControlsRef = useRef<any>(null);

  // Floating Settings Drawer
  const [isPhysicsMenuOpen, setIsPhysicsMenuOpen] = useState(false);

  const [explosions, setExplosions] = useState<SandboxExplosion[]>([]);
  const [collisionLogs, setCollisionLogs] = useState<SandboxCollisionLog[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const texturesMap = useMemo(() => {
    const names = [
      "Sun",
      "Mercury",
      "Venus",
      "Earth",
      "Moon",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
      "Pluto",
      "Ceres",
      "Eris"
    ];
    const map: Record<string, THREE.CanvasTexture> = {};
    names.forEach((n) => {
      map[n] = generatePlanetTexture(n);
    });
    map["RedStar"] = generateStarHDTexture("#ff3b1f");
    map["BlueStar"] = generateStarHDTexture("#38bdf8");
    map["WhiteDwarf"] = generateStarHDTexture("#e0f2fe");
    map["NeutronStar"] = generateStarHDTexture("#06b6d4");
    return map;
  }, []);

  const ringTexture = useMemo(() => generateSaturnRingTexture(), []);
  const cloudsTexture = useMemo(() => generateEarthCloudsTexture(), []);

  const showToast = (msg: string) => setToastMessage(msg);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2800);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const selectedBody = useMemo(
    () => bodies.find((b) => b.id === selectedBodyId) || null,
    [bodies, selectedBodyId]
  );

  const selectedBodyPhysics = useMemo(() => {
    if (!selectedBody) return null;
    return computeBodySurfacePhysics(selectedBody);
  }, [selectedBody]);

  // Primary star in the system (for stellar illumination & planetary thermal physics)
  const primarySystemStar = useMemo(() => {
    return (
      bodies.find((b) => b.type === "star" || b.type === "neutron_star") ||
      bodies.reduce<SandboxBody | null>(
        (max, b) => (!max || b.mass > max.mass ? b : max),
        null
      )
    );
  }, [bodies]);

  // Star-specific astrophysical metrics (Stefan-Boltzmann, Wien's peak, Morgan-Keenan, etc.)
  const selectedStarAstrophysics = useMemo(() => {
    if (
      !selectedBody ||
      (selectedBody.type !== "star" && selectedBody.type !== "neutron_star")
    ) {
      return null;
    }
    return computeStarAstrophysics(
      selectedBody.tempK || 5778,
      selectedBody.mass,
      selectedBody.radius
    );
  }, [selectedBody]);

  // Planet/Moon thermodynamic equilibrium temperature relative to primary star
  const selectedPlanetThermal = useMemo(() => {
    if (
      !selectedBody ||
      selectedBody.type === "star" ||
      selectedBody.type === "black_hole" ||
      !primarySystemStar ||
      primarySystemStar.id === selectedBody.id
    ) {
      return null;
    }
    const dx = selectedBody.pos[0] - primarySystemStar.pos[0];
    const dy = selectedBody.pos[1] - primarySystemStar.pos[1];
    const dz = selectedBody.pos[2] - primarySystemStar.pos[2];
    const dist = Math.max(0.5, Math.hypot(dx, dy, dz));

    const starTemp = primarySystemStar.tempK || 5778;
    const starRad = primarySystemStar.radius || 2.4;
    const albedo =
      selectedBody.type === "gas_giant"
        ? 0.35
        : selectedBody.textureKey === "Earth"
        ? 0.3
        : 0.14;

    // Physical formula: T_eq = T_* * sqrt(R_* / (2*D)) * (1 - albedo)^0.25
    const tEq = Math.round(
      starTemp * Math.sqrt(starRad / (2.0 * dist)) * Math.pow(1.0 - albedo, 0.25)
    );
    const tEqCelsius = tEq - 273;

    const starAstro = computeStarAstrophysics(
      starTemp,
      primarySystemStar.mass,
      starRad
    );
    const inHabitableZone = dist >= starAstro.hzInner && dist <= starAstro.hzOuter;

    return {
      dist,
      tEq,
      tEqCelsius,
      starName: primarySystemStar.name,
      inHabitableZone,
      hzInner: starAstro.hzInner,
      hzOuter: starAstro.hzOuter,
      isMagmaWorld: tEq > 750,
      isCryoWorld: tEq < 180
    };
  }, [selectedBody, primarySystemStar]);

  const barycenterPos = useMemo((): [number, number, number] => {
    if (bodies.length === 0) return [0, 0, 0];
    let totalM = 0;
    let bx = 0;
    let by = 0;
    let bz = 0;
    for (const b of bodies) {
      totalM += b.mass;
      bx += b.pos[0] * b.mass;
      by += b.pos[1] * b.mass;
      bz += b.pos[2] * b.mass;
    }
    if (totalM <= 0) return [0, 0, 0];
    return [bx / totalM, by / totalM, bz / totalM];
  }, [bodies]);

  const focusCameraOnPosition = (pos: [number, number, number], label?: string) => {
    if (orbitControlsRef.current) {
      orbitControlsRef.current.target.set(pos[0], pos[1], pos[2]);
      orbitControlsRef.current.update();
      if (label) {
        showToast(`🎯 Cámara enfocada en: ${label}`);
      }
    }
  };

  const filteredCatalog = useMemo(() => {
    return CELESTIAL_CATALOG.filter((item) => {
      const matchCat = catalogCategory === "all" || item.category === catalogCategory;
      const q = catalogSearch.trim().toLowerCase();
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [catalogCategory, catalogSearch]);

  const buildExplosionParticles = (
    colorA: string,
    colorB: string,
    count = 42
  ): ExplosionParticle[] => {
    const list: ExplosionParticle[] = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 0.8 + Math.random() * 3.6;
      list.push({
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.cos(phi) * speed * 0.45,
        vz: Math.sin(phi) * Math.sin(theta) * speed,
        size: 0.14 + Math.random() * 0.28,
        color: i % 3 === 0 ? "#ffffff" : i % 2 === 0 ? colorA : colorB
      });
    }
    return list;
  };

  const handleSelectPreset = (presetId: string) => {
    const found = SANDBOX_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setActivePresetId(presetId);
    setBodies(
      found.bodies.map((b) => ({
        ...b,
        baseMass: b.mass,
        massMultiplier: 1.0,
        baseDensity: b.density,
        densityMultiplier: 1.0,
        pos: [...b.pos] as [number, number, number],
        vel: [...b.vel] as [number, number, number]
      }))
    );
    setExplosions([]);
    setSelectedBodyId(null);
    if (orbitControlsRef.current) {
      orbitControlsRef.current.target.set(0, 0, 0);
      orbitControlsRef.current.update();
    }
    showToast(`🌌 Escenario: ${found.name}`);
  };

  const spawnFromTemplate = (tpl: CatalogTemplate, customPos?: [number, number, number]) => {
    const primary = bodies.reduce<SandboxBody | null>(
      (best, b) => (!best || b.mass > best.mass ? b : best),
      null
    );

    let pos: [number, number, number];
    let vel: [number, number, number] = [0, 0, 0];

    if (customPos) {
      pos = customPos;
    } else if (primary) {
      const dist = 14 + Math.random() * 22;
      const angle = Math.random() * Math.PI * 2;
      pos = [
        primary.pos[0] + Math.cos(angle) * dist,
        0,
        primary.pos[2] + Math.sin(angle) * dist
      ];
    } else {
      pos = [0, 0, 0];
    }

    if (primary && (pos[0] !== primary.pos[0] || pos[2] !== primary.pos[2])) {
      const dx = pos[0] - primary.pos[0];
      const dz = pos[2] - primary.pos[2];
      const r = Math.hypot(dx, dz);
      const G = 0.08 * gravityConstant;
      const vRelative =
        Math.sqrt((G * (primary.mass + tpl.mass)) / Math.max(2.5, r)) * customSpawnVelMul;
      const tx = -dz / r;
      const tz = dx / r;

      const primaryShare = tpl.mass / (primary.mass + tpl.mass);
      const newBodyShare = primary.mass / (primary.mass + tpl.mass);

      vel = [
        primary.vel[0] + tx * vRelative * newBodyShare,
        0,
        primary.vel[2] + tz * vRelative * newBodyShare
      ];

      if (!primary.fixedPosition) {
        const recoilVx = primary.vel[0] - tx * vRelative * primaryShare;
        const recoilVz = primary.vel[2] - tz * vRelative * primaryShare;
        setBodies((prev) =>
          prev.map((b) =>
            b.id === primary.id ? { ...b, vel: [recoilVx, b.vel[1], recoilVz] } : b
          )
        );
      }
    }

    const finalName = customSpawnName.trim() ? customSpawnName.trim() : tpl.name;

    const newBody: SandboxBody = {
      id: `astro_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: finalName,
      type: tpl.type,
      textureKey: tpl.textureKey,
      mass: tpl.mass,
      baseMass: tpl.mass,
      massMultiplier: 1.0,
      radius: tpl.radius,
      density: tpl.density,
      baseDensity: tpl.density,
      densityMultiplier: 1.0,
      color: tpl.color,
      glowColor: tpl.glowColor,
      pos,
      vel,
      tempK: tpl.tempK,
      hasAtmosphere: tpl.hasAtmosphere,
      atmosphereColor: tpl.atmosphereColor,
      hasClouds: tpl.hasClouds,
      hasRings: tpl.hasRings,
      ringColor: tpl.ringColor,
      hasRelativisticJets: tpl.hasRelativisticJets,
      axialTilt: tpl.axialTilt,
      rotationSpeed: tpl.rotationSpeed
    };

    setBodies((prev) => [...prev, newBody]);
    setSelectedBodyId(newBody.id);
    if (customSpawnName.trim()) setCustomSpawnName("");
    showToast(`✨ Agregado: ${finalName} (${tpl.mass} M)`);
  };

  const handleTidalDisruption = (victim: SandboxBody, captor: SandboxBody) => {
    const lostMass = Number((victim.mass * 0.35).toFixed(2));
    const remainingMass = Number((victim.mass * 0.65).toFixed(2));
    const newRadius = Number((victim.radius * 0.82).toFixed(2));

    const fragments: SandboxBody[] = Array.from({ length: 3 }).map((_, idx) => {
      const spread = (idx - 1) * 0.9;
      return {
        id: `tidal_${Date.now()}_${idx}`,
        name: `Fragmento de ${victim.name}`,
        type: "debris",
        textureKey: "Mars",
        mass: Math.max(0.2, Number((lostMass / 3).toFixed(2))),
        radius: 0.35,
        density: 2.5,
        color: "#f97316",
        pos: [
          victim.pos[0] + (captor.pos[0] - victim.pos[0]) * 0.22 + spread,
          (Math.random() - 0.5) * 0.4,
          victim.pos[2] + (captor.pos[2] - victim.pos[2]) * 0.22 - spread
        ],
        vel: [
          victim.vel[0] * (0.9 + idx * 0.08),
          (Math.random() - 0.5) * 0.5,
          victim.vel[2] * (0.9 + idx * 0.08)
        ],
        tempK: 2600,
        impactHeat: 1.0
      };
    });

    setBodies((prev) => {
      const filtered =
        prev.filter((b) => b.type !== "debris").length > 24
          ? prev.filter((b) => b.type !== "debris")
          : prev;
      return [
        ...filtered.map((b) =>
          b.id === victim.id
            ? {
                ...b,
                mass: remainingMass,
                radius: newRadius,
                impactHeat: 0.95,
                hasRings: true,
                ringColor: victim.color
              }
            : b
        ),
        ...fragments
      ];
    });

    const exp: SandboxExplosion = {
      id: `tidal_exp_${Date.now()}`,
      pos: [...victim.pos],
      radius: victim.radius * 1.15,
      colorA: victim.color,
      colorB: captor.glowColor || "#f97316",
      createdMs: performance.now(),
      energyDesc: `Límite de Roche superado · -${lostMass} M arrancada`,
      title: `Desgarro de Marea en ${victim.name}`,
      subtitle: `Espaguetificación por ${captor.name}`,
      particles: buildExplosionParticles(victim.color, "#f97316", 24)
    };
    setExplosions((prev) => [...prev.slice(-8), exp]);
    showToast(`🌊 Límite de Roche: ${captor.name} desgarró ${lostMass} M de ${victim.name}`);
  };

  const handleCollision = (
    bodyA: SandboxBody,
    bodyB: SandboxBody,
    midPos: [number, number, number]
  ) => {
    if (bodyA.type === "debris" || bodyB.type === "debris") {
      const primary = bodyA.type !== "debris" ? bodyA : bodyB;
      const debris = bodyA.type === "debris" ? bodyA : bodyB;
      const totalM = Number((primary.mass + debris.mass).toFixed(2));
      setBodies((prev) =>
        prev
          .filter((b) => b.id !== debris.id)
          .map((b) =>
            b.id === primary.id
              ? { ...b, mass: totalM, impactHeat: Math.min(1, (b.impactHeat || 0) + 0.35) }
              : b
          )
      );
      return;
    }

    const relVel =
      Math.hypot(
        bodyA.vel[0] - bodyB.vel[0],
        bodyA.vel[1] - bodyB.vel[1],
        bodyA.vel[2] - bodyB.vel[2]
      ) * 12.0;

    const combinedMass = bodyA.mass + bodyB.mass;
    const reducedMass = (bodyA.mass * bodyB.mass) / Math.max(0.01, combinedMass);
    const energyVal = (0.5 * reducedMass * relVel * relVel * 2.4e6).toExponential(2);
    const energyDesc = `${energyVal} Teratones TNT (${relVel.toFixed(1)} km/s)`;

    const isKilonovaOrCollapse =
      (bodyA.type === "neutron_star" && bodyB.type === "neutron_star") ||
      (bodyA.type === "star" && bodyB.type === "star" && combinedMass >= 3800);

    let outcomeText = "";
    let subtitleText = "";
    let retainedMassVal = combinedMass;
    let ejectedMassVal = 0;

    if (collisionMode === "supernova_destroy") {
      ejectedMassVal = combinedMass;
      retainedMassVal = 0;
      outcomeText = "Aniquilación y fragmentación total en escombros";
      subtitleText = `100% masa eyectada (${combinedMass.toFixed(1)} M)`;

      const remnants: SandboxBody[] = Array.from({ length: 5 }).map((_, idx) => {
        const ang = (idx / 5) * Math.PI * 2 + Math.random() * 0.4;
        const spd = 2.2 + Math.random() * 2.0;
        return {
          id: `frag_${Date.now()}_${idx}`,
          name: `Escombro de ${bodyA.name}`,
          type: "debris",
          textureKey: "Mars",
          mass: Number((combinedMass * 0.08).toFixed(2)),
          radius: 0.42,
          density: 3.0,
          color: "#f97316",
          pos: [midPos[0] + Math.cos(ang) * 2.2, 0, midPos[2] + Math.sin(ang) * 2.2],
          vel: [Math.cos(ang) * spd, (Math.random() - 0.5) * 0.6, Math.sin(ang) * spd],
          tempK: 3200,
          impactHeat: 1.0
        };
      });

      setBodies((prev) => [
        ...prev.filter((b) => b.id !== bodyA.id && b.id !== bodyB.id),
        ...remnants
      ]);
    } else if (collisionMode === "elastic_bounce") {
      ejectedMassVal = Number((combinedMass * 0.06).toFixed(2));
      retainedMassVal = Number((combinedMass * 0.94).toFixed(2));
      outcomeText = "Choque e inversión de momento con pérdida superficial";
      subtitleText = `-6% masa eyectada en el rebote`;

      setBodies((prev) =>
        prev.map((b) => {
          if (b.id === bodyA.id || b.id === bodyB.id) {
            return {
              ...b,
              mass: Number((b.mass * 0.94).toFixed(2)),
              vel: [-b.vel[0] * 0.88, -b.vel[1] * 0.88, -b.vel[2] * 0.88],
              impactHeat: 0.95
            };
          }
          return b;
        })
      );
    } else {
      const survivor = bodyA.mass >= bodyB.mass ? bodyA : bodyB;
      const absorbed = bodyA.mass >= bodyB.mass ? bodyB : bodyA;

      const lossFraction =
        survivor.type === "black_hole" ? 0.04 : Math.min(0.18, 0.08 + relVel * 0.002);
      retainedMassVal = Number((combinedMass * (1 - lossFraction)).toFixed(2));
      ejectedMassVal = Number((combinedMass * lossFraction).toFixed(2));

      const vx =
        (survivor.vel[0] * survivor.mass + absorbed.vel[0] * absorbed.mass) / combinedMass;
      const vy =
        (survivor.vel[1] * survivor.mass + absorbed.vel[1] * absorbed.mass) / combinedMass;
      const vz =
        (survivor.vel[2] * survivor.mass + absorbed.vel[2] * absorbed.mass) / combinedMass;

      const newRadius = Math.min(
        5.2,
        Math.pow(
          Math.pow(survivor.radius, 3) + Math.pow(absorbed.radius, 3) * (1 - lossFraction),
          1 / 3
        )
      );

      const ejectaFragments: SandboxBody[] = Array.from({ length: 3 }).map((_, idx) => {
        const ang = Math.atan2(vz, vx) + (idx - 1) * 1.1 + (Math.random() - 0.5) * 0.5;
        const ejectSpeed = Math.max(2.6, Math.hypot(vx, vz) * 1.45 + 1.8);
        const startDist = newRadius + 1.4 + idx * 0.5;
        return {
          id: `ejecta_${Date.now()}_${idx}`,
          name: `Eyección de ${absorbed.name}`,
          type: "debris",
          textureKey: "Mars",
          mass: Math.max(0.25, Number((ejectedMassVal / 3).toFixed(2))),
          radius: 0.38,
          density: 3.2,
          color: "#fb923c",
          pos: [
            midPos[0] + Math.cos(ang) * startDist,
            (idx - 1) * 0.25,
            midPos[2] + Math.sin(ang) * startDist
          ],
          vel: [
            vx + Math.cos(ang) * ejectSpeed,
            (idx - 1) * 0.35,
            vz + Math.sin(ang) * ejectSpeed
          ],
          tempK: 2800,
          impactHeat: 1.0
        };
      });

      if (isKilonovaOrCollapse && survivor.type !== "black_hole") {
        outcomeText = `Colapso relativista a Agujero Negro (${retainedMassVal} M) + Kilonova`;
        subtitleText = `Masa final: ${retainedMassVal} M · Eyección: -${ejectedMassVal} M`;
        setBodies((prev) => [
          ...prev
            .filter((b) => b.id !== absorbed.id)
            .map((b) =>
              b.id === survivor.id
                ? {
                    ...b,
                    name: `Agujero Negro (${survivor.name})`,
                    type: "black_hole" as const,
                    textureKey: "BlackHole" as const,
                    mass: retainedMassVal,
                    baseMass: retainedMassVal,
                    massMultiplier: 1.0,
                    radius: 2.35,
                    color: "#000000",
                    glowColor: "#a855f7",
                    hasRings: true,
                    ringColor: "#f97316",
                    hasRelativisticJets: true,
                    vel: [vx, vy, vz] as [number, number, number],
                    tempK: 1800000,
                    impactHeat: 1.0
                  }
                : b
            ),
          ...ejectaFragments
        ]);
      } else {
        outcomeText = `${survivor.name} absorbió a ${absorbed.name} (+${(
          retainedMassVal - survivor.mass
        ).toFixed(1)} M neta)`;
        subtitleText = `Masa resultante: ${retainedMassVal} M · Pérdida explosiva: -${ejectedMassVal} M`;

        setBodies((prev) => [
          ...prev
            .filter((b) => b.id !== absorbed.id)
            .map((b) =>
              b.id === survivor.id
                ? {
                    ...b,
                    mass: retainedMassVal,
                    baseMass: retainedMassVal,
                    massMultiplier: 1.0,
                    radius: Number(newRadius.toFixed(2)),
                    vel: [vx, vy, vz] as [number, number, number],
                    tempK: b.tempK + 850,
                    impactHeat: 1.0
                  }
                : b
            ),
          ...ejectaFragments
        ]);
      }
    }

    const exp: SandboxExplosion = {
      id: `exp_${Date.now()}`,
      pos: midPos,
      radius: Math.max(bodyA.radius, bodyB.radius) * 1.45,
      colorA: bodyA.color,
      colorB: bodyB.color,
      createdMs: performance.now(),
      energyDesc,
      title: `${bodyA.name} × ${bodyB.name}`,
      subtitle: subtitleText,
      isSupernova: isKilonovaOrCollapse || collisionMode === "supernova_destroy",
      particles: buildExplosionParticles(bodyA.color, bodyB.color, isKilonovaOrCollapse ? 60 : 44)
    };
    setExplosions((prev) => [...prev.slice(-8), exp]);

    setCollisionLogs((prev) => [
      {
        id: `log_${Date.now()}`,
        nameA: bodyA.name,
        nameB: bodyB.name,
        velKms: `${relVel.toFixed(1)} km/s`,
        energy: energyDesc,
        outcome: outcomeText,
        massRetained: `${retainedMassVal} M`,
        massEjected: `${ejectedMassVal} M`,
        time: new Date().toLocaleTimeString()
      },
      ...prev.slice(0, 15)
    ]);
  };

  const handleUpdateSelected = (patch: Partial<SandboxBody>) => {
    if (!selectedBodyId) return;
    setBodies((prev) =>
      prev.map((b) => {
        if (b.id !== selectedBodyId) return b;
        let next = { ...b, ...patch };
        if (
          patch.tempK !== undefined &&
          (b.type === "star" || b.type === "neutron_star")
        ) {
          const { baseColor, glowColor } = temperatureToBlackbodyColor(patch.tempK);
          next.color = baseColor;
          next.glowColor = glowColor;
        }
        return next;
      })
    );
  };

  // Handler for Mass Multiplier and Density Multiplier changes in the new Inspector Tab
  const handleAdjustMassOrDensityMultiplier = (
    newMassMul: number,
    newDensityMul: number
  ) => {
    if (!selectedBody) return;
    const baseM = selectedBody.baseMass ?? selectedBody.mass;
    const baseD = selectedBody.baseDensity ?? selectedBody.density;

    const updatedMass = Number((baseM * newMassMul).toFixed(2));
    const updatedDensity = Number((baseD * newDensityMul).toFixed(2));

    // Physically scale radius according to R ~ (M_mul / rho_mul)^(1/3)
    const volumeScale = Math.pow(newMassMul / Math.max(0.05, newDensityMul), 1 / 3);
    const baseRadius =
      selectedBody.radius /
      Math.pow(
        (selectedBody.massMultiplier ?? 1) / Math.max(0.05, selectedBody.densityMultiplier ?? 1),
        1 / 3
      );
    const updatedRadius = Number(
      Math.min(5.8, Math.max(0.35, baseRadius * volumeScale)).toFixed(2)
    );

    handleUpdateSelected({
      baseMass: baseM,
      baseDensity: baseD,
      massMultiplier: newMassMul,
      densityMultiplier: newDensityMul,
      mass: updatedMass,
      density: updatedDensity,
      radius: updatedRadius
    });
  };

  // Helper to get infinite plane intersection in global canvas scope
  const getCanvasPlaneIntersection = (e: any) => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    if (e.raycaster.ray.intersectPlane(plane, targetPoint)) {
      return targetPoint;
    }
    return null;
  };

  return (
    <div className="relative w-full h-[100dvh] bg-[#02040a] overflow-hidden select-none font-sans text-slate-100">
      {/* Interactive Place Mode HUD overlay (Top-Center) */}
      {isPlaceOnClickMode && selectedTemplate && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-3 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-2.5 shadow-[0_12px_40px_rgba(245,158,11,0.22)] backdrop-blur-xl animate-fadeIn font-mono">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          <div className="text-xs text-amber-200 flex-1">
            <span className="font-bold text-amber-300 block uppercase tracking-wider text-[10px]">MODO COLOCACIÓN ACTIVO</span>
            <span>Haz clic en el plano del espacio-tiempo para situar a <strong>{selectedTemplate.name}</strong></span>
          </div>
          <button
            onClick={() => {
              setIsPlaceOnClickMode(false);
              setPlacementHoverPos(null);
              showToast("Modo colocación desactivado");
            }}
            className="ml-2 px-3 py-1 text-[11px] font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-colors rounded-lg active:scale-95 whitespace-nowrap"
          >
            Listo / Cancelar
          </button>
        </div>
      )}

      {/* ==========================================
          1. REDESIGNED SCIENTIFIC TOP NAVIGATION & SCENARIO CARDS
         ========================================== */}
      <header className="fixed top-0 left-0 right-0 z-30 pointer-events-none flex flex-col gap-2.5 px-3 pt-2.5 md:px-6">
        <div className="flex items-center justify-between gap-3 bg-[#060913]/92 border border-slate-800/85 rounded-2xl px-3.5 py-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_20px_45px_rgba(0,0,0,0.85)] backdrop-blur-2xl pointer-events-auto">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onReturnToSolarSystem}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-b from-slate-800/95 to-slate-900/95 hover:from-cyan-950/80 hover:to-slate-900 border border-slate-700/80 hover:border-cyan-400/60 text-xs font-semibold text-cyan-300 hover:text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-all active:scale-95 shrink-0"
              title="Volver al Simulador del Sistema Solar"
            >
              <Globe size={14} className="text-cyan-400" />
              <span>Sistema Solar</span>
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 min-w-0">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                Laboratorio N-Cuerpo Relativista
              </h1>
              <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-400 font-mono bg-[#03060c]/90 px-2.5 py-1 rounded-lg border border-slate-800/80">
                <span className="text-cyan-300 font-semibold">{bodies.length} Astros</span>
                <span className="text-slate-700">|</span>
                <span>
                  Recorrido:{" "}
                  <strong className="text-emerald-300">
                    {trajectoryMode === "history"
                      ? "Historial de Trayectorias"
                      : "Órbita Instantánea"}
                  </strong>
                </span>
                {showGrid && (
                  <>
                    <span className="text-slate-700">|</span>
                    <span className="text-amber-300/90">
                      Malla Continua: {gridCellScale} u/celda
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Controls in Header: Center Barycenter + Physics Config + Reset Scenario */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => focusCameraOnPosition(barycenterPos, "Baricentro del Sistema")}
              title="Centrar cámara en el Baricentro del sistema"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-b from-slate-800/90 to-slate-900/95 hover:from-slate-800 hover:to-slate-800 border border-slate-700/80 hover:border-emerald-400/50 text-xs font-medium text-emerald-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] transition-all active:scale-95"
            >
              <Compass size={14} />
              <span className="hidden md:inline">Baricentro</span>
            </button>

            <button
              onClick={() => setIsPhysicsMenuOpen(!isPhysicsMenuOpen)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] ${
                isPhysicsMenuOpen
                  ? "bg-gradient-to-b from-cyan-300 to-cyan-500 text-slate-950 border-cyan-300 shadow-lg shadow-cyan-500/25"
                  : "bg-gradient-to-b from-slate-800/95 to-slate-900/95 hover:from-slate-800 hover:to-slate-800 text-slate-100 border-slate-700/80 hover:border-cyan-400/50"
              }`}
            >
              <Sliders size={14} />
              <span className="hidden sm:inline">Configuración</span>
            </button>

            <button
              onClick={() => handleSelectPreset(activePresetId)}
              title="Reiniciar escenario actual"
              className="p-2 rounded-xl bg-gradient-to-b from-slate-800/95 to-slate-900/95 hover:from-amber-950/60 hover:to-slate-900 border border-slate-700/80 hover:border-amber-400/50 text-amber-400 hover:text-amber-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all active:scale-90"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Second Row: Redesigned Scenario Cards Strip */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
          {SANDBOX_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset.id)}
                className={`group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap border transition-all active:scale-95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] ${
                  isActive
                    ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 border-cyan-300 font-bold shadow-lg shadow-cyan-500/20"
                    : "bg-[#060913]/90 hover:bg-[#0c1326]/95 text-slate-300 hover:text-white border-slate-800/90 hover:border-cyan-500/40"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isActive
                      ? "bg-slate-950"
                      : "bg-cyan-400/70 group-hover:bg-cyan-300"
                  }`}
                />
                <span>{preset.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    isActive
                      ? "bg-slate-950/20 text-slate-950 font-bold"
                      : "bg-slate-900/90 text-slate-400 border border-slate-800"
                  }`}
                >
                  {preset.bodies.length}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ==========================================
          2. REDESIGNED CONFIGURATION & PHYSICS PANEL (TOP LEFT)
         ========================================== */}
      {isPhysicsMenuOpen && (
        <div className="fixed top-28 left-3 md:left-6 z-30 w-80 sm:w-96 rounded-2xl bg-[#03060c]/95 border border-slate-800/90 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl pointer-events-auto animate-fadeIn ring-1 ring-cyan-500/20">
          <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-cyan-400/20 to-sky-500/5 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shadow-inner">
                <Sliders size={14} />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-white block font-mono">
                  CONFIGURACIÓN DE FÍSICA
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Espacio-Tiempo Relativista 1PN
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsPhysicsMenuOpen(false)}
              className="p-1.5 rounded-xl bg-[#080d1a] border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all duration-150 active:scale-95"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-4 text-xs">
            {/* Selector: Órbita Instantánea vs Historial de Trayectorias */}
            <div className="p-3.5 rounded-xl bg-[#010408] border border-slate-800/70 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-300 font-mono uppercase tracking-wider">
                  Trazado de Órbita
                </span>
                <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded-md border border-cyan-500/20">
                  {trajectoryMode === "history" ? "Historial" : "Predicción"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#03060c] border border-slate-800/80">
                <button
                  onClick={() => {
                    setTrajectoryMode("history");
                    setShowTrails(true);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold tracking-wide transition-all duration-200 flex items-center justify-center gap-1.5 ${
                    trajectoryMode === "history"
                      ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 font-bold shadow-md shadow-cyan-500/15"
                      : "text-slate-400 hover:text-white hover:bg-[#080d1a]/50"
                  }`}
                >
                  <Activity size={12} />
                  <span>Trayectorias</span>
                </button>
                <button
                  onClick={() => {
                    setTrajectoryMode("instant_orbit");
                    setShowTrails(true);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold tracking-wide transition-all duration-200 flex items-center justify-center gap-1.5 ${
                    trajectoryMode === "instant_orbit"
                      ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 font-bold shadow-md shadow-cyan-500/15"
                      : "text-slate-400 hover:text-white hover:bg-[#080d1a]/50"
                  }`}
                >
                  <Orbit size={12} />
                  <span>Órbita Futura</span>
                </button>
              </div>
            </div>

            {/* Gravitational Constant Slider + Numeric Text Box */}
            <div className="p-3.5 rounded-xl bg-[#010408] border border-slate-800/70 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-300 font-mono uppercase tracking-wider">
                  Gravedad Constante (G)
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={gravityConstant}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isNaN(val)) {
                        setGravityConstant(Math.min(5.0, Math.max(0.1, val)));
                      }
                    }}
                    className="w-16 px-2.5 py-1 rounded-lg bg-[#03060c] border border-slate-800 hover:border-slate-700 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:outline-none text-right font-mono text-xs font-bold text-cyan-300 shadow-inner"
                  />
                  <span className="text-[10px] font-mono text-slate-400">× G₀</span>
                </div>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.5"
                step="0.1"
                value={gravityConstant}
                onChange={(e) => setGravityConstant(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer h-1 rounded-lg bg-slate-900 border border-slate-800"
              />
            </div>

            {/* Collision Mode Cards */}
            <div className="p-3.5 rounded-xl bg-[#010408] border border-slate-800/70">
              <span className="text-[11px] font-bold text-slate-300 font-mono uppercase tracking-wider block mb-2">
                Física de Impacto
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "accretion_ejecta", label: "Acreción" },
                    { id: "supernova_destroy", label: "Colapso" },
                    { id: "elastic_bounce", label: "Rebote" }
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCollisionMode(m.id)}
                    className={`py-2 px-1 rounded-xl text-[10px] font-mono font-bold border transition-all duration-200 active:scale-95 ${
                      collisionMode === m.id
                        ? "bg-cyan-400/10 border-cyan-400/60 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.15)]"
                        : "bg-[#03060c] border-slate-800/90 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Relativistic & Grid Toggles */}
            <div className="p-3.5 rounded-xl bg-[#010408] border border-slate-800/70 space-y-2.5">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-300 text-[11px]">
                  Precesión Relativista (Einstein 1PN)
                </span>
                <input
                  type="checkbox"
                  checked={enableRelativity}
                  onChange={(e) => setEnableRelativity(e.target.checked)}
                  className="accent-cyan-400 w-4 h-4 rounded cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-300 text-[11px]">
                  Desgarro de Marea (Límite de Roche)
                </span>
                <input
                  type="checkbox"
                  checked={enableTidalRoche}
                  onChange={(e) => setEnableTidalRoche(e.target.checked)}
                  className="accent-cyan-400 w-4 h-4 rounded cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-300 text-[11px]">
                  Cuadrícula Continua Adaptable + Pozos
                </span>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                  className="accent-cyan-400 w-4 h-4 rounded cursor-pointer"
                />
              </label>
            </div>

            {/* Collision History Cards */}
            {collisionLogs.length > 0 && (
              <div className="pt-2 border-t border-slate-800/90 max-h-32 overflow-y-auto space-y-1.5 custom-scrollbar">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                  Registro de Impactos Recientes:
                </span>
                {collisionLogs.slice(0, 4).map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-[#03060c] border border-amber-500/30 text-[10px]"
                  >
                    <div className="font-bold text-amber-300">
                      💥 {log.nameA} × {log.nameB}
                    </div>
                    <div className="text-cyan-200 mt-0.5">{log.outcome}</div>
                    <div className="text-slate-400 font-mono mt-0.5">
                      Final: {log.massRetained} · Eyección: -{log.massEjected}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          3. REDESIGNED PLANET INSPECTOR WITH "MASA Y DENSIDAD" TAB & REAL-TIME GRAVITY
         ========================================== */}
      {selectedBody && selectedBodyPhysics && (
        isInspectorMinimized ? (
          /* Minimized Panel */
          <div className="fixed top-28 right-3 md:right-6 z-30 flex items-center gap-2.5 bg-[#060913]/95 border border-slate-800/90 rounded-2xl px-3.5 py-2.5 shadow-lg backdrop-blur-2xl pointer-events-auto animate-fadeIn font-mono">
            <span
              className="w-3 h-3 rounded-full shrink-0 shadow-md"
              style={{
                backgroundColor: selectedBody.color,
                boxShadow: `0 0 10px ${selectedBody.color}`
              }}
            />
            <div className="text-xs font-bold text-white max-w-[120px] truncate">
              {selectedBody.name}
            </div>
            <div className="text-[10px] text-cyan-300">
              {selectedBodyPhysics.gravityMs2.toFixed(1)} m/s²
            </div>
            <div className="flex items-center gap-1.5 ml-2.5">
              <button
                onClick={() => setIsInspectorMinimized(false)}
                className="px-2.5 py-1 text-[10px] font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-all active:scale-95 whitespace-nowrap"
              >
                Expandir Detalles
              </button>
              <button
                onClick={() => setSelectedBodyId(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
                title="Cerrar inspector"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded Panel */
          <div className="fixed top-28 right-3 md:right-6 z-30 w-80 sm:w-96 rounded-2xl bg-[#060913]/95 border border-slate-800/90 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09),0_24px_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl pointer-events-auto animate-fadeIn">
            {/* Inspector Header with Editable Name Input Box & Focus Button */}
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800/90">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-md"
                  style={{
                    backgroundColor: selectedBody.color,
                    boxShadow: `0 0 12px ${selectedBody.color}`
                  }}
                />
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={selectedBody.name}
                    onChange={(e) => handleUpdateSelected({ name: e.target.value })}
                    aria-label="Nombre del cuerpo celeste"
                    className="w-full px-2 py-0.5 rounded-lg bg-[#03060c] border border-slate-800 hover:border-slate-700 focus:border-cyan-400 focus:outline-none text-sm font-bold text-white truncate transition-colors"
                  />
                  <p className="text-[11px] text-slate-400 font-mono mt-1 px-0.5">
                    {selectedBody.mass.toFixed(2)} M · {selectedBody.density.toFixed(2)} g/cm³ ·{" "}
                    <strong className="text-cyan-300">
                      {selectedBodyPhysics.gravityMs2.toFixed(2)} m/s²
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => focusCameraOnPosition(selectedBody.pos, selectedBody.name)}
                  title="Centrar cámara en este cuerpo celeste"
                  className="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-cyan-300 hover:text-white hover:border-cyan-400/50 transition-all"
                >
                  <Crosshair size={14} />
                </button>
                <button
                  onClick={() => setIsInspectorMinimized(true)}
                  title="Minimizar panel"
                  className="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-450 hover:text-white hover:border-cyan-400/50 transition-all"
                >
                  <Minus size={14} />
                </button>
                <button
                  onClick={() => setSelectedBodyId(null)}
                  className="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all"
                >
                  <X size={14} />
                </button>
            </div>
          </div>

          {/* Inspector Segmented Tabs: "General" vs "Masa y Densidad" vs "Astrofísica" */}
          <div className="grid grid-cols-3 gap-1 p-1 mb-3.5 rounded-xl bg-[#03060c] border border-slate-800/90">
            <button
              onClick={() => setInspectorTab("general")}
              className={`py-2 px-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                inspectorTab === "general"
                  ? "bg-gradient-to-b from-cyan-300 to-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <Orbit size={12} />
              <span>General</span>
            </button>
            <button
              onClick={() => setInspectorTab("mass_density")}
              className={`py-2 px-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                inspectorTab === "mass_density"
                  ? "bg-gradient-to-b from-cyan-300 to-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <Scale size={12} />
              <span>Masa/Dens.</span>
            </button>
            <button
              onClick={() => setInspectorTab("astrophysics")}
              className={`py-2 px-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                inspectorTab === "astrophysics"
                  ? "bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <Sparkles size={12} />
              <span>Astrofísica</span>
            </button>
          </div>

          {/* TAB 1: GENERAL Y ÓRBITA */}
          {inspectorTab === "general" && (
            <div className="space-y-3 text-xs">
              {/* Interactive Gameplay Instruction Tip */}
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-[11px] leading-relaxed text-cyan-200">
                <span className="font-semibold block text-cyan-300 mb-1">🎮 Interactúa con el Astro:</span>
                Mantén presionado el cuerpo celeste para <strong>desplazarlo</strong> o arrastra el <strong>tirador azul</strong> de su vector para ajustar su velocidad e iniciar órbitas personalizadas.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-[#03060c] border border-slate-800/90 shadow-inner">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Velocidad Orbital
                  </span>
                  <span className="text-sm font-mono font-bold text-cyan-300 mt-0.5 block">
                    {(
                      Math.hypot(
                        selectedBody.vel[0],
                        selectedBody.vel[1],
                        selectedBody.vel[2]
                      ) * 12.0
                    ).toFixed(1)}{" "}
                    km/s
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#03060c] border border-slate-800/90 shadow-inner">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Gravedad Superficial
                  </span>
                  <span className="text-sm font-mono font-bold text-emerald-300 mt-0.5 block">
                    {selectedBodyPhysics.gravityMs2.toFixed(2)} m/s²
                  </span>
                </div>
              </div>

              {/* Surface Temperature Slider + Numeric Text Input Box */}
              <div className="p-3 rounded-xl bg-[#03060c] border border-slate-800/90 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-200">
                    Temperatura Superficial (K)
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="10"
                      max="100000"
                      step="50"
                      value={selectedBody.tempK}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isNaN(val)) {
                          handleUpdateSelected({ tempK: Math.max(10, val) });
                        }
                      }}
                      className="w-20 px-2 py-1 rounded-lg bg-[#080d1a] border border-slate-700/90 focus:border-amber-400 focus:outline-none text-right font-mono text-xs font-bold text-amber-300"
                    />
                    <span className="text-[10px] font-mono text-slate-400">K</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="40"
                  max="45000"
                  step="50"
                  value={selectedBody.tempK}
                  onChange={(e) => handleUpdateSelected({ tempK: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    handleUpdateSelected({
                      vel: [
                        selectedBody.vel[0] * 1.25,
                        selectedBody.vel[1],
                        selectedBody.vel[2] * 1.25
                      ]
                    })
                  }
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-b from-slate-800/95 to-slate-900 hover:from-cyan-950/70 hover:to-slate-900 border border-slate-700/80 hover:border-cyan-400/50 text-xs font-semibold text-cyan-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all active:scale-95"
                >
                  🚀 +25% Velocidad
                </button>
                <button
                  onClick={() =>
                    handleUpdateSelected({
                      vel: [
                        selectedBody.vel[0] * 0.75,
                        selectedBody.vel[1],
                        selectedBody.vel[2] * 0.75
                      ]
                    })
                  }
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-b from-slate-800/95 to-slate-900 hover:from-amber-950/60 hover:to-slate-900 border border-slate-700/80 hover:border-amber-400/50 text-xs font-semibold text-amber-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all active:scale-95"
                >
                  ⏪ -25% Velocidad
                </button>
              </div>

              <button
                onClick={() => {
                  setBodies((prev) => prev.filter((b) => b.id !== selectedBody.id));
                  setSelectedBodyId(null);
                  showToast("🗑️ Astro eliminado del espacio");
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-b from-rose-950/70 to-rose-950/90 hover:from-rose-900/80 hover:to-rose-950 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all active:scale-95"
              >
                <Trash2 size={13} /> Eliminar Cuerpo Celeste
              </button>
            </div>
          )}

          {/* TAB 2: MASA Y DENSIDAD (WITH REAL-TIME SURFACE GRAVITY TELEMETRY & NUMERIC INPUTS) */}
          {inspectorTab === "mass_density" && (
            <div className="space-y-3 text-xs">
              {/* Real-Time Surface Gravity Telemetry Readout Card */}
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-950/55 via-[#060c1a] to-[#03060c] border border-cyan-500/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-cyan-200 flex items-center gap-1.5">
                    <Gauge size={14} className="text-cyan-400" />
                    Gravedad Superficial Calculada
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                      Math.abs(selectedBodyPhysics.gravityDeltaPct) < 0.5
                        ? "bg-slate-900/90 text-slate-300 border-slate-700"
                        : selectedBodyPhysics.gravityDeltaPct > 0
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                        : "bg-amber-950/80 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    {selectedBodyPhysics.gravityDeltaPct >= 0 ? "+" : ""}
                    {selectedBodyPhysics.gravityDeltaPct.toFixed(0)}% vs base
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-0.5">
                  <div>
                    <span className="text-xl font-mono font-extrabold text-white tracking-tight">
                      {selectedBodyPhysics.gravityMs2.toFixed(2)}
                    </span>
                    <span className="text-xs font-mono text-cyan-300 ml-1">m/s²</span>
                    <span className="text-[11px] font-mono text-amber-300 ml-2">
                      ({selectedBodyPhysics.gEarths.toFixed(2)} g⊕)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Vel. Escape</span>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {selectedBodyPhysics.escapeVelKms.toFixed(1)} km/s
                    </span>
                  </div>
                </div>

                {/* Gravity Intensity Bar */}
                <div className="w-full h-2 rounded-full bg-[#020409] overflow-hidden border border-slate-800/90">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-400 transition-all duration-150"
                    style={{
                      width: `${Math.min(100, Math.max(6, selectedBodyPhysics.gEarths * 18))}%`
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>Base: {selectedBodyPhysics.baseGravityMs2.toFixed(2)} m/s²</span>
                  <span>Radio Eq.: {selectedBody.radius.toFixed(2)} u</span>
                </div>
              </div>

              {/* Manual Mass Multiplier Control */}
              <div className="p-3 rounded-xl bg-[#03060c] border border-slate-800/90 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-200 block">
                      Multiplicador de Masa
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Masa actual: <strong className="text-cyan-300">{selectedBody.mass.toFixed(2)} M</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0.05"
                      max="50.0"
                      step="0.05"
                      value={Number((selectedBody.massMultiplier ?? 1.0).toFixed(2))}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isNaN(val) && val > 0) {
                          handleAdjustMassOrDensityMultiplier(
                            Math.min(50, Math.max(0.05, val)),
                            selectedBody.densityMultiplier ?? 1.0
                          );
                        }
                      }}
                      aria-label="Multiplicador de Masa"
                      className="w-18 px-2 py-1 rounded-lg bg-[#080d1a] border border-slate-700/90 focus:border-cyan-400 focus:outline-none text-right font-mono text-xs font-bold text-cyan-300 shadow-inner"
                    />
                    <span className="text-[10px] font-mono text-slate-400">×</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="15.0"
                  step="0.05"
                  value={selectedBody.massMultiplier ?? 1.0}
                  onChange={(e) =>
                    handleAdjustMassOrDensityMultiplier(
                      Number(e.target.value),
                      selectedBody.densityMultiplier ?? 1.0
                    )
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  {[0.5, 1.0, 2.0, 5.0, 10.0].map((mul) => (
                    <button
                      key={mul}
                      onClick={() =>
                        handleAdjustMassOrDensityMultiplier(
                          mul,
                          selectedBody.densityMultiplier ?? 1.0
                        )
                      }
                      className={`flex-1 py-1 rounded-lg text-[10px] font-mono border transition-all active:scale-95 ${
                        Math.abs((selectedBody.massMultiplier ?? 1.0) - mul) < 0.05
                          ? "bg-cyan-400 text-slate-950 border-cyan-300 font-bold shadow-sm"
                          : "bg-[#070b16] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      }`}
                    >
                      {mul}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual Density Multiplier Control */}
              <div className="p-3 rounded-xl bg-[#03060c] border border-slate-800/90 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-200 block">
                      Multiplicador de Densidad
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Densidad actual:{" "}
                      <strong className="text-emerald-300">
                        {selectedBody.density.toFixed(2)} g/cm³
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0.1"
                      max="30.0"
                      step="0.05"
                      value={Number((selectedBody.densityMultiplier ?? 1.0).toFixed(2))}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isNaN(val) && val > 0) {
                          handleAdjustMassOrDensityMultiplier(
                            selectedBody.massMultiplier ?? 1.0,
                            Math.min(30, Math.max(0.1, val))
                          );
                        }
                      }}
                      aria-label="Multiplicador de Densidad"
                      className="w-18 px-2 py-1 rounded-lg bg-[#080d1a] border border-slate-700/90 focus:border-emerald-400 focus:outline-none text-right font-mono text-xs font-bold text-emerald-300 shadow-inner"
                    />
                    <span className="text-[10px] font-mono text-slate-400">×</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="10.0"
                  step="0.05"
                  value={selectedBody.densityMultiplier ?? 1.0}
                  onChange={(e) =>
                    handleAdjustMassOrDensityMultiplier(
                      selectedBody.massMultiplier ?? 1.0,
                      Number(e.target.value)
                    )
                  }
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  {[0.5, 1.0, 2.0, 5.0, 10.0].map((mul) => (
                    <button
                      key={mul}
                      onClick={() =>
                        handleAdjustMassOrDensityMultiplier(
                          selectedBody.massMultiplier ?? 1.0,
                          mul
                        )
                      }
                      className={`flex-1 py-1 rounded-lg text-[10px] font-mono border transition-all active:scale-95 ${
                        Math.abs((selectedBody.densityMultiplier ?? 1.0) - mul) < 0.05
                          ? "bg-emerald-400 text-slate-950 border-emerald-300 font-bold shadow-sm"
                          : "bg-[#070b16] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      }`}
                    >
                      {mul}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset Multipliers Button */}
              <button
                onClick={() => handleAdjustMassOrDensityMultiplier(1.0, 1.0)}
                className="w-full py-2 rounded-xl bg-gradient-to-b from-slate-800/90 to-slate-900 hover:from-slate-800 hover:to-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-[11px] font-semibold transition-all active:scale-95"
              >
                Restaurar Masa y Densidad Base (1.00x)
              </button>
            </div>
          )}

          {/* TAB 3: ASTROFÍSICA, TERMODINÁMICA Y RADIACIÓN PLANCK/WIEN */}
          {inspectorTab === "astrophysics" && (
            <div className="space-y-3 text-xs">
              {/* STAR ASTROPHYSICS MODE */}
              {selectedStarAstrophysics ? (
                <>
                  {/* Spectral Type & Luminosity Card */}
                  <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-950/40 via-[#0a0d18] to-[#03060c] border border-amber-500/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full shadow-lg"
                          style={{
                            backgroundColor: selectedStarAstrophysics.baseColor,
                            boxShadow: `0 0 14px ${selectedStarAstrophysics.glowColor}`
                          }}
                        />
                        <span className="text-xs font-mono font-extrabold text-amber-300">
                          {selectedStarAstrophysics.spectralClass}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider">
                        {selectedStarAstrophysics.spectralName}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/90 text-[11px]">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Luminosidad (Stefan-B.)</span>
                        <span className="font-mono font-bold text-white text-xs">
                          {selectedStarAstrophysics.luminositySun >= 100
                            ? `${selectedStarAstrophysics.luminositySun.toFixed(0)} L☉`
                            : `${selectedStarAstrophysics.luminositySun.toFixed(2)} L☉`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Pico Wien (λ_max)</span>
                        <span className="font-mono font-bold text-amber-200 text-xs">
                          {selectedStarAstrophysics.peakWavelengthNm.toFixed(0)} nm
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-slate-800/90 text-[10px] text-slate-300 flex justify-between font-mono">
                      <span>Banda: <strong className="text-cyan-300">{selectedStarAstrophysics.spectralBand}</strong></span>
                      <span>Vida Sec. Pral: <strong className="text-emerald-300">{selectedStarAstrophysics.lifetimeStr}</strong></span>
                    </div>
                  </div>

                  {/* Habitable Zone Telemetry */}
                  <div className="p-3 rounded-xl bg-[#03060c] border border-emerald-500/40 space-y-1.5">
                    <div className="flex items-center justify-between text-emerald-300 font-bold text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={13} />
                        Zona de Habitabilidad (Goldilocks)
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">Anillo Verde 3D</span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-mono">
                      Radio Interior: <strong className="text-white">{selectedStarAstrophysics.hzInner} u</strong> ·
                      Radio Exterior: <strong className="text-white">{selectedStarAstrophysics.hzOuter} u</strong>
                    </p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      El anillo verde visible se expande con T⁴ y luminosidad en tiempo real.
                    </p>
                  </div>

                  {/* Quick Stellar Presets */}
                  <div className="p-3 rounded-xl bg-[#03060c] border border-slate-800/90 space-y-2">
                    <span className="text-[11px] font-semibold text-slate-200 block">
                      Presets Espectrales y Térmicos:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { name: "🔴 Próxima (M)", tempK: 3040 },
                        { name: "🟡 Sol (G2V)", tempK: 5778 },
                        { name: "⚪ Sirio A (A0)", tempK: 9940 },
                        { name: "🔵 Rígel (B8)", tempK: 12100 },
                        { name: "⚡ Hipermasiva O", tempK: 42000 }
                      ].map((starPreset) => (
                        <button
                          key={starPreset.name}
                          onClick={() => handleUpdateSelected({ tempK: starPreset.tempK })}
                          className={`p-2 rounded-xl text-[10px] font-mono border text-left transition-all active:scale-95 ${
                            Math.abs(selectedBody.tempK - starPreset.tempK) < 200
                              ? "bg-amber-500/20 border-amber-400 text-amber-200 font-bold shadow-sm"
                              : "bg-[#070b16] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                          }`}
                        >
                          <div>{starPreset.name}</div>
                          <div className="text-[9px] text-slate-400">{starPreset.tempK} K</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : selectedPlanetThermal ? (
                /* PLANET THERMODYNAMIC EQUILIBRIUM & HABITABILITY TELEMETRY */
                <>
                  <div
                    className={`p-3.5 rounded-xl border space-y-2 ${
                      selectedPlanetThermal.isMagmaWorld
                        ? "bg-gradient-to-br from-rose-950/60 via-[#120606] to-[#03060c] border-rose-500/50 text-rose-200"
                        : selectedPlanetThermal.inHabitableZone
                        ? "bg-gradient-to-br from-emerald-950/60 via-[#06120b] to-[#03060c] border-emerald-500/50 text-emerald-200"
                        : "bg-gradient-to-br from-cyan-950/40 via-[#060c18] to-[#03060c] border-cyan-500/40 text-cyan-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider">
                        Temperatura de Equilibrio Térmico
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                          selectedPlanetThermal.isMagmaWorld
                            ? "bg-rose-950 text-rose-300 border-rose-500/50"
                            : selectedPlanetThermal.inHabitableZone
                            ? "bg-emerald-950 text-emerald-300 border-emerald-500/50"
                            : "bg-slate-900 text-slate-300 border-slate-700"
                        }`}
                      >
                        {selectedPlanetThermal.isMagmaWorld
                          ? "🌋 Magma Incandescente"
                          : selectedPlanetThermal.inHabitableZone
                          ? "🌱 Zona Habitable Óptima"
                          : selectedPlanetThermal.isCryoWorld
                          ? "❄️ Mundo Criogénico"
                          : "🪐 Templado"}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <div>
                        <span className="text-2xl font-mono font-extrabold text-white">
                          {selectedPlanetThermal.tEq} K
                        </span>
                        <span className="text-xs font-mono text-slate-300 ml-2">
                          ({selectedPlanetThermal.tEqCelsius >= 0 ? "+" : ""}
                          {selectedPlanetThermal.tEqCelsius} °C)
                        </span>
                      </div>
                      <div className="text-right text-[10px] font-mono text-slate-400">
                        Dist. a {selectedPlanetThermal.starName}:{" "}
                        <strong className="text-white">{selectedPlanetThermal.dist.toFixed(1)} u</strong>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-300 pt-1 border-t border-slate-800/90 leading-relaxed">
                      {selectedPlanetThermal.isMagmaWorld
                        ? "La radiación estelar sobrecalienta la corteza. Se activa brillo de lava e incandescencia volcánica en el shader."
                        : selectedPlanetThermal.inHabitableZone
                        ? "Ubicado dentro del cinturón Goldilocks. Permite agua líquida y atmósfera estable."
                        : "Temperatura calculada según flujo incidente estelar y balance radiativo de albedo."}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#03060c] border border-slate-800/90 space-y-1 text-[11px] font-mono text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ancho Zona Habitable:</span>
                      <span>{selectedPlanetThermal.hzInner} — {selectedPlanetThermal.hzOuter} u</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Posición Relativa:</span>
                      <span className={selectedPlanetThermal.inHabitableZone ? "text-emerald-400 font-bold" : "text-slate-400"}>
                        {selectedPlanetThermal.inHabitableZone ? "Dentro del anillo verde" : "Fuera de la zona habitable"}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-[#03060c] border border-slate-800/90 text-center text-slate-400 text-[11px]">
                  Selecciona una estrella o un planeta en el espacio para examinar sus propiedades termodinámicas, radiación de Planck o habitabilidad.
                </div>
              )}
            </div>
          )}
        </div>
      )
    )}

      {/* CLEAN NON-INTRUSIVE EVENT TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-fadeIn max-w-[90vw]">
          <div className="bg-[#060913]/95 border border-cyan-500/40 text-cyan-200 px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium shadow-[0_8px_30px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-2 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
            <span className="truncate">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* ==========================================
          4. INTERACTIVE 3D SPACE CANVAS (UNIFIED CONTINUOUS SPACETIME CURVATURE FABRIC)
         ========================================== */}
      <Canvas
        camera={{ position: [0, 54, 70], fov: 46, near: 0.1, far: 2000000 }}
        dpr={[1, 1.75]}
        onPointerMissed={() => setSelectedBodyId(null)}
      >
        <color attach="background" args={["#02040a"]} />
        <ambientLight intensity={0.44} color="#dbeafe" />
        <directionalLight position={[40, 65, 35]} intensity={0.85} color="#fff7ed" />

        <Suspense fallback={null}>
          <SymplecticNBodyEngine
            bodies={bodies}
            setBodies={setBodies}
            isPaused={isPaused}
            simSpeed={simSpeed}
            gravityConstant={gravityConstant}
            enableRelativity={enableRelativity}
            enableTidalRoche={enableTidalRoche}
            onCollision={handleCollision}
            onTidalDisruption={handleTidalDisruption}
          />

          {/* Unified Continuous Einstein Spacetime Curvature Fabric */}
          <ContinuousDeformedSpacetimeGrid
            visible={showGrid}
            bodies={bodies}
            showGravityWells={showGravityWells}
            gravityConstant={gravityConstant}
            explosions={explosions}
            onScaleChange={setGridCellScale}
          />

          {/* Real-Time Habitable Zone (Goldilocks) Disks around Stars */}
          {bodies
            .filter((b) => b.type === "star" || b.type === "neutron_star")
            .map((star) => (
              <HabitableZoneRing key={`hz_${star.id}`} star={star} />
            ))}

          {/* Dynamic System Barycenter Marker */}
          {showBarycenter && bodies.length > 1 && (
            <group position={barycenterPos}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.45, 0.62, 24]} />
                <meshBasicMaterial
                  color="#10b981"
                  side={THREE.DoubleSide}
                  transparent
                  opacity={0.75}
                />
              </mesh>
              <Html center position={[0, -0.8, 0]} className="pointer-events-none select-none">
                <span className="text-[9px] font-mono text-emerald-400/80 whitespace-nowrap">
                  ⊕ Baricentro
                </span>
              </Html>
            </group>
          )}

          {/* Huge Click-to-Place Interactive Plane centered on Barycenter */}
          {isPlaceOnClickMode && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[barycenterPos[0], 0, barycenterPos[2]]}
              onPointerMove={(e) => {
                e.stopPropagation();
                setPlacementHoverPos([e.point.x, 0, e.point.z]);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setPlacementHoverPos([e.point.x, 0, e.point.z]);
              }}
              onPointerOut={() => {
                setPlacementHoverPos(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                spawnFromTemplate(selectedTemplate, [
                  Number(e.point.x.toFixed(2)),
                  0,
                  Number(e.point.z.toFixed(2))
                ]);
                setIsPlaceOnClickMode(false);
                setPlacementHoverPos(null);
              }}
            >
              <planeGeometry args={[1000000, 1000000]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}

          {/* Interactive Glowing Ghost Preview of the Selected Celestial Body */}
          {isPlaceOnClickMode && placementHoverPos && selectedTemplate && (
            <group position={placementHoverPos}>
              {/* Ghost Sphere showing exact scale */}
              <mesh>
                <sphereGeometry args={[selectedTemplate.radius, 32, 32]} />
                <meshBasicMaterial
                  color={selectedTemplate.color}
                  transparent
                  opacity={0.34}
                  wireframe={true}
                />
              </mesh>
              {/* Corona Glow ring */}
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[selectedTemplate.radius * 1.15, selectedTemplate.radius * 1.35, 36]} />
                <meshBasicMaterial
                  color={selectedTemplate.color}
                  transparent
                  opacity={0.48}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              {/* Outer dashed placement ring */}
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[selectedTemplate.radius * 2.0, selectedTemplate.radius * 2.1, 48]} />
                <meshBasicMaterial
                  color="#fbbf24"
                  transparent
                  opacity={0.55}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              {/* Precise 3D Position Crosshair lines on the plane */}
              <gridHelper args={[selectedTemplate.radius * 6, 6, "#fbbf24", "#fbbf24"]} position={[0, 0.01, 0]} />
              {/* Dynamic Billboarding Floating Info Label */}
              <Html center position={[0, selectedTemplate.radius + 1.8, 0]} className="pointer-events-none select-none">
                <div className="flex flex-col items-center gap-1 bg-[#060a14]/95 border border-amber-400 rounded-xl px-3 py-1.5 shadow-[0_10px_30px_rgba(245,158,11,0.25)] backdrop-blur-md">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400">
                    Clic para situar
                  </span>
                  <span className="text-xs font-bold text-white whitespace-nowrap">
                    {selectedTemplate.name} ({selectedTemplate.mass} M)
                  </span>
                </div>
              </Html>
            </group>
          )}

          {/* Butter-Smooth Global Tracking Plane for Dragging Celestial Bodies */}
          {draggingBodyId && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0, 0]}
              onPointerMove={(e) => {
                e.stopPropagation();
                const intersection = getCanvasPlaneIntersection(e);
                if (intersection) {
                  setBodies((prev) =>
                    prev.map((b) =>
                      b.id === draggingBodyId
                        ? { ...b, pos: [Number(intersection.x.toFixed(2)), 0, Number(intersection.z.toFixed(2))] }
                        : b
                    )
                  );
                }
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                setDraggingBodyId(null);
              }}
            >
              <planeGeometry args={[1000000, 1000000]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}

          {/* Butter-Smooth Global Tracking Plane for Dragging Velocity Handles */}
          {draggingVelocityId && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0, 0]}
              onPointerMove={(e) => {
                e.stopPropagation();
                const intersection = getCanvasPlaneIntersection(e);
                if (intersection) {
                  const bRef = bodies.find((b) => b.id === draggingVelocityId);
                  if (bRef) {
                    const dx = intersection.x - bRef.pos[0];
                    const dz = intersection.z - bRef.pos[2];
                    const velocityDrawScale = 1.6;
                    setBodies((prev) =>
                      prev.map((b) =>
                        b.id === draggingVelocityId
                          ? { ...b, vel: [Number((dx / velocityDrawScale).toFixed(2)), 0, Number((dz / velocityDrawScale).toFixed(2))] }
                          : b
                      )
                    );
                  }
                }
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                setDraggingVelocityId(null);
              }}
            >
              <planeGeometry args={[1000000, 1000000]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}

          {/* High-Fidelity Celestial Bodies */}
          {bodies.map((b) => (
            <SandboxCelestialBodyMesh
              key={b.id}
              body={b}
              allBodies={bodies}
              gravityConstant={gravityConstant}
              isSelected={b.id === selectedBodyId}
              onSelect={() => setSelectedBodyId(b.id)}
              showTrails={showTrails}
              trajectoryMode={trajectoryMode}
              isPaused={isPaused}
              texturesMap={texturesMap}
              ringTexture={ringTexture}
              cloudsTexture={cloudsTexture}
              draggingBodyId={draggingBodyId}
              setDraggingBodyId={setDraggingBodyId}
              draggingVelocityId={draggingVelocityId}
              setDraggingVelocityId={setDraggingVelocityId}
              handleUpdateSelected={handleUpdateSelected}
              setIsPaused={setIsPaused}
            />
          ))}

          {/* Multi-Stage Volumetric Explosions & Kilonovas */}
          <SandboxExplosions3D explosions={explosions} />

          <OrbitControls
            ref={orbitControlsRef}
            enabled={!draggingBodyId && !draggingVelocityId}
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            enableDamping={true}
            dampingFactor={0.06}
            maxDistance={500000}
            minDistance={1.5}
          />
        </Suspense>
      </Canvas>

      {/* ==========================================
          5. MINIMALIST, HIGH-PRECISION CELESTIAL CATALOG DOCK & CARDS
         ========================================== */}
      {isCatalogOpen && (
        <div className="fixed bottom-20 left-3 right-3 md:left-6 md:right-6 z-30 rounded-2xl bg-[#04060d]/96 border border-slate-800/90 p-4 shadow-[0_25px_65px_rgba(0,0,0,0.95)] backdrop-blur-2xl pointer-events-auto animate-fadeIn ring-1 ring-white/5">
          {/* Top Filter & Custom Launch Inputs Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3.5 border-b border-slate-800/70">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "compact", label: "🕳️ Compactos" },
                  { id: "star", label: "☀️ Estrellas" },
                  { id: "gas_giant", label: "🪐 Gigantes" },
                  { id: "rocky", label: "🌍 Rocosos" },
                  { id: "small", label: "☄️ Menores" }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCatalogCategory(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border active:scale-95 ${
                    catalogCategory === tab.id
                      ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-md shadow-cyan-500/10"
                      : "bg-[#0b0f19]/70 text-slate-300 hover:text-white border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Redesigned Text Boxes (Cuadros de Texto) for Custom Name, Launch Speed & Search */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3 ml-auto">
              {/* Custom Name Text Box */}
              <div className="hidden xl:flex items-center gap-2 bg-[#020409] border border-slate-800 rounded-lg px-2.5 py-1 focus-within:border-cyan-500/50 transition-colors shadow-inner">
                <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">Astro:</span>
                <input
                  type="text"
                  value={customSpawnName}
                  onChange={(e) => setCustomSpawnName(e.target.value)}
                  placeholder="Nombre..."
                  aria-label="Nombre personalizado"
                  className="bg-transparent text-xs text-white placeholder-slate-700 focus:outline-none w-24 font-mono font-medium"
                />
              </div>

              {/* Initial Orbital Velocity Multiplier Numeric Text Box */}
              <div className="hidden md:flex items-center gap-2 bg-[#020409] border border-slate-800 rounded-lg px-2.5 py-1 focus-within:border-cyan-500/50 transition-colors shadow-inner">
                <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">Vel:</span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={customSpawnVelMul}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!Number.isNaN(val) && val >= 0) {
                      setCustomSpawnVelMul(Math.min(5, val));
                    }
                  }}
                  aria-label="Multiplicador de velocidad inicial"
                  className="bg-transparent text-xs font-mono font-bold text-cyan-300 focus:outline-none w-8 text-right"
                />
                <span className="text-[10px] font-mono text-slate-600 font-bold">x</span>
              </div>

              <button
                onClick={() => {
                  const next = !isPlaceOnClickMode;
                  setIsPlaceOnClickMode(next);
                  if (next) {
                    showToast(
                      `🎯 Modo colocación: Haz clic en el espacio-tiempo para situar ${selectedTemplate.name}`
                    );
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 active:scale-95 shadow-sm ${
                  isPlaceOnClickMode
                    ? "bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-md shadow-amber-500/10"
                    : "bg-[#020409] text-amber-400 border-slate-800 hover:text-amber-300 hover:border-amber-500/30"
                }`}
              >
                <Crosshair size={13} className={isPlaceOnClickMode ? "animate-spin" : ""} />
                <span>
                  {isPlaceOnClickMode ? "Seleccionar: TOCAR" : "Colocar en Espacio"}
                </span>
              </button>

              {/* Search Filter Text Box */}
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"
                />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Buscar astro..."
                  aria-label="Buscar astro"
                  className="pl-7 pr-2.5 py-1 rounded-lg bg-[#020409] border border-slate-800 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-cyan-500/50 w-32 sm:w-40 transition-colors font-mono"
                />
              </div>

              <button
                onClick={() => setIsCatalogOpen(false)}
                className="p-1.5 rounded-lg bg-[#020409] border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-colors active:scale-95"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Redesigned High-Craft Celestial Catalog Cards */}
          <div className="flex items-stretch gap-3.5 overflow-x-auto pb-2 custom-scrollbar">
            {filteredCatalog.map((tpl) => {
              const isSelected = selectedTemplate.id === tpl.id;
              const previewGravityMs2 =
                Math.pow(Math.max(0.001, tpl.mass / 8.0), 1 / 3) *
                Math.pow(Math.max(0.01, tpl.density / 5.51), 2 / 3) *
                9.81;

              return (
                <div
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplate(tpl);
                    setIsPlaceOnClickMode(true);
                    showToast(`🎯 Modo colocación: Haz clic en el espacio-tiempo para situar ${tpl.name}`);
                  }}
                  className={`group flex flex-col justify-between p-3 rounded-xl border cursor-pointer transition-all shrink-0 w-[265px] sm:w-[280px] active:scale-[0.98] ${
                    isSelected
                      ? "bg-[#090f1a] border-cyan-500/80 shadow-md shadow-cyan-500/5"
                      : "bg-[#03060c] hover:bg-[#060a14] border-slate-850 hover:border-cyan-500/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CelestialMiniPreview template={tpl} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                          {tpl.name}
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation(); // Avoid triggering card onClick!
                            setSelectedTemplate(tpl);
                            spawnFromTemplate(tpl);
                          }}
                          className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/20 text-[10px] font-mono font-bold text-cyan-300 shrink-0 hover:bg-cyan-400 hover:text-slate-950 transition-colors"
                        >
                          + Lanzar
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{tpl.subtitle}</p>

                      <div className="grid grid-cols-3 gap-1 mt-2.5 pt-2 border-t border-slate-800/60 text-[10px] font-mono tabular-nums">
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Masa</span>
                          <span className="text-slate-200 font-semibold">{tpl.mass} M</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Dens.</span>
                          <span className="text-emerald-300 font-semibold">
                            {tpl.density}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Grav.</span>
                          <span className="text-amber-300 font-semibold">
                            {previewGravityMs2 > 999
                              ? `${(previewGravityMs2 / 1000).toFixed(1)}k`
                              : previewGravityMs2.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==========================================
          6. FLOATING `+` CATALOG TRIGGER BUTTON
         ========================================== */}
      <button
        onClick={() => setIsCatalogOpen(!isCatalogOpen)}
        title="Abrir Catálogo Visual de Cuerpos Celestes"
        className={`fixed bottom-20 right-4 md:right-7 z-30 w-13 h-13 rounded-2xl flex items-center justify-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_15px_35px_rgba(245,158,11,0.35)] border transition-all active:scale-90 pointer-events-auto ${
          isCatalogOpen
            ? "bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-amber-200 rotate-45"
            : "bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-slate-950 border-amber-200"
        }`}
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {/* ==========================================
          7. REDESIGNED BOTTOM CONTROL BAR
         ========================================== */}
      <div className="fixed bottom-3 left-3 right-3 md:left-6 md:right-6 z-30 h-14 rounded-2xl bg-[#060913]/95 border border-slate-800/90 px-3.5 flex items-center justify-between gap-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl pointer-events-auto">
        {/* Left: Play/Pause + Speed Step + Trajectory Mode Switcher */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="w-10 h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-500 hover:from-cyan-200 hover:to-cyan-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/25 transition-all active:scale-90"
            title={isPaused ? "Reanudar Simulación" : "Pausar Simulación"}
          >
            {isPaused ? (
              <Play size={18} fill="currentColor" />
            ) : (
              <Pause size={18} fill="currentColor" />
            )}
          </button>

          <button
            onClick={() => {
              const speeds = [0.25, 0.5, 1.0, 2.0, 4.0];
              const idx = speeds.indexOf(simSpeed);
              const next = speeds[(idx + 1) % speeds.length];
              setSimSpeed(next);
              showToast(`⏩ Velocidad Temporal: ${next}x`);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#03060c] hover:bg-slate-900 border border-slate-800 hover:border-amber-400/50 text-amber-300 text-xs font-mono font-bold transition-all active:scale-95"
            title="Cambiar Velocidad Temporal"
          >
            <FastForward size={14} />
            <span>{simSpeed}x</span>
          </button>

          {/* Direct Segmented Switcher: Historial de Trayectorias vs Órbita Instantánea */}
          <div className="hidden lg:flex items-center p-1 rounded-xl bg-[#03060c] border border-slate-800/90">
            <button
              onClick={() => {
                setTrajectoryMode("history");
                setShowTrails(true);
                showToast("📈 Modo: Historial de Trayectorias (Línea persistente con desvanecimiento)");
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                trajectoryMode === "history" && showTrails
                  ? "bg-cyan-400 text-slate-950 font-bold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Activity size={12} />
              <span>Historial de Trayectorias</span>
            </button>
            <button
              onClick={() => {
                setTrajectoryMode("instant_orbit");
                setShowTrails(true);
                showToast("🪐 Modo: Órbita Instantánea");
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                trajectoryMode === "instant_orbit" && showTrails
                  ? "bg-cyan-400 text-slate-950 font-bold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Orbit size={12} />
              <span>Órbita Instantánea</span>
            </button>
          </div>
        </div>

        {/* Center: Spawner Trigger */}
        <button
          onClick={() => setIsCatalogOpen(!isCatalogOpen)}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-b from-slate-800/90 to-slate-900/95 hover:from-slate-800 hover:to-slate-800 border border-slate-700/80 hover:border-cyan-400/50 text-xs font-semibold text-slate-200 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all active:scale-95"
        >
          <Sparkles size={14} className="text-amber-400" />
          <span>
            {isCatalogOpen
              ? "Ocultar Catálogo de Astros"
              : "Catálogo de Astros (Sol, Planetas 2K, Púlsares, Agujeros Negros...)"}
          </span>
        </button>

        {/* Right: Quick View Toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (!showTrails) {
                setShowTrails(true);
                showToast("Trazado de Trayectorias Activado");
              } else if (trajectoryMode === "history") {
                setTrajectoryMode("instant_orbit");
                showToast("🪐 Modo: Órbita Instantánea");
              } else {
                setTrajectoryMode("history");
                showToast("📈 Modo: Historial de Trayectorias");
              }
            }}
            title="Alternar entre Historial de Trayectorias y Órbita Instantánea"
            className={`p-2 rounded-xl border transition-all active:scale-90 ${
              showTrails
                ? "bg-cyan-400/15 border-cyan-500/40 text-cyan-300"
                : "bg-[#03060c] border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
          >
            {trajectoryMode === "history" ? <Activity size={17} /> : <Orbit size={17} />}
          </button>

          <button
            onClick={() => {
              setShowGravityWells(!showGravityWells);
              showToast(
                !showGravityWells
                  ? "Pozos Gravitacionales Activados"
                  : "Pozos Gravitacionales Ocultos"
              );
            }}
            title="Mostrar / Ocultar Pozos de Curvatura Gravitacional"
            className={`p-2 rounded-xl border transition-all active:scale-90 ${
              showGravityWells
                ? "bg-amber-400/15 border-amber-500/40 text-amber-300"
                : "bg-[#03060c] border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Flame size={17} />
          </button>

          <button
            onClick={() => {
              setShowBarycenter(!showBarycenter);
              showToast(!showBarycenter ? "Baricentro Visible" : "Baricentro Oculto");
            }}
            title="Mostrar / Ocultar Baricentro del Sistema"
            className={`p-2 rounded-xl border transition-all active:scale-90 ${
              showBarycenter
                ? "bg-emerald-400/15 border-emerald-500/40 text-emerald-300"
                : "bg-[#03060c] border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Compass size={17} />
          </button>

          <button
            onClick={() => {
              setShowGrid(!showGrid);
              showToast(
                !showGrid
                  ? "Cuadrícula Continua Adaptable Visible"
                  : "Cuadrícula Oculta"
              );
            }}
            title="Mostrar / Ocultar Cuadrícula Continua Adaptable"
            className={`p-2 rounded-xl border transition-all active:scale-90 ${
              showGrid
                ? "bg-cyan-400/15 border-cyan-500/40 text-cyan-300"
                : "bg-[#03060c] border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
          >
            <GridIcon size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
