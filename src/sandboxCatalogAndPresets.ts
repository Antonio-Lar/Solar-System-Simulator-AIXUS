export type CelestialTextureKey =
  | "Sun"
  | "Mercury"
  | "Venus"
  | "Earth"
  | "Moon"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune"
  | "Pluto"
  | "Ceres"
  | "Eris"
  | "RedStar"
  | "BlueStar"
  | "WhiteDwarf"
  | "NeutronStar"
  | "BlackHole";

export interface SandboxBody {
  id: string;
  name: string;
  type: "star" | "rocky" | "gas_giant" | "dwarf" | "neutron_star" | "black_hole" | "debris";
  textureKey: CelestialTextureKey;
  mass: number; // Calibrated N-body mass so mutual planet-planet & star-planet perturbations are visible
  baseMass?: number; // Reference base mass for the manual Mass Multiplier
  massMultiplier?: number; // Manual multiplier (e.g., 0.1x to 20x)
  radius: number; // 3D visual radius
  density: number; // g/cm³ (affects Roche limit, volume & surface gravity)
  baseDensity?: number; // Reference base density for the manual Density Multiplier
  densityMultiplier?: number; // Manual multiplier (e.g., 0.2x to 10x)
  color: string;
  glowColor?: string;
  pos: [number, number, number];
  vel: [number, number, number];
  tempK: number;
  impactHeat?: number; // 0 to 1 incandescent thermal glow after a collision
  hasAtmosphere?: boolean;
  atmosphereColor?: string;
  hasClouds?: boolean;
  hasRings?: boolean;
  ringColor?: string;
  hasRelativisticJets?: boolean; // For Pulsars / Neutron Stars & Active Black Holes
  axialTilt?: number;
  rotationSpeed?: number;
  fixedPosition?: boolean;
}

export interface ExplosionParticle {
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: string;
}

export interface SandboxExplosion {
  id: string;
  pos: [number, number, number];
  radius: number;
  colorA: string;
  colorB: string;
  createdMs: number;
  energyDesc: string;
  title: string;
  subtitle: string;
  isSupernova?: boolean;
  particles: ExplosionParticle[];
}

export interface SandboxCollisionLog {
  id: string;
  nameA: string;
  nameB: string;
  velKms: string;
  energy: string;
  outcome: string;
  massRetained: string;
  massEjected: string;
  time: string;
}

export interface CatalogTemplate {
  id: string;
  name: string;
  subtitle: string;
  category: "star" | "rocky" | "gas_giant" | "compact" | "small";
  type: SandboxBody["type"];
  textureKey: CelestialTextureKey;
  mass: number;
  radius: number;
  density: number;
  color: string;
  glowColor?: string;
  tempK: number;
  hasAtmosphere?: boolean;
  atmosphereColor?: string;
  hasClouds?: boolean;
  hasRings?: boolean;
  ringColor?: string;
  hasRelativisticJets?: boolean;
  axialTilt?: number;
  rotationSpeed?: number;
}

// ==========================================
// COMPREHENSIVE ASTROPHYSICAL CATALOG
// ==========================================

export const CELESTIAL_CATALOG: CatalogTemplate[] = [
  // --- COMPACT & RELATIVISTIC OBJECTS ---
  {
    id: "tpl_black_hole",
    name: "Agujero Negro Estelar",
    subtitle: "Singularidad · Lente gravitacional y disco",
    category: "compact",
    type: "black_hole",
    textureKey: "BlackHole",
    mass: 4200,
    radius: 2.1,
    density: 9999,
    color: "#000000",
    glowColor: "#a855f7",
    tempK: 1200000,
    hasRings: true,
    ringColor: "#f97316",
    hasRelativisticJets: true,
    axialTilt: 14,
    rotationSpeed: 2.5
  },
  {
    id: "tpl_smbh",
    name: "Agujero Negro Supermasivo",
    subtitle: "Tipo Gargantúa · Pozo relativista extremo",
    category: "compact",
    type: "black_hole",
    textureKey: "BlackHole",
    mass: 9500,
    radius: 3.1,
    density: 9999,
    color: "#000000",
    glowColor: "#f97316",
    tempK: 4500000,
    hasRings: true,
    ringColor: "#fb923c",
    hasRelativisticJets: true,
    axialTilt: 8,
    rotationSpeed: 3.2
  },
  {
    id: "tpl_pulsar",
    name: "Estrella de Neutrones (Púlsar)",
    subtitle: "Núcleo degenerado · Jets relativistas",
    category: "compact",
    type: "neutron_star",
    textureKey: "NeutronStar",
    mass: 2400,
    radius: 1.15,
    density: 5000,
    color: "#38bdf8",
    glowColor: "#06b6d4",
    tempK: 600000,
    hasRelativisticJets: true,
    axialTilt: 28,
    rotationSpeed: 8.5
  },
  {
    id: "tpl_white_dwarf",
    name: "Enana Blanca (Sirius B)",
    subtitle: "Remanente estelar denso · 25,000 K",
    category: "compact",
    type: "star",
    textureKey: "WhiteDwarf",
    mass: 1100,
    radius: 1.25,
    density: 800,
    color: "#e0f2fe",
    glowColor: "#7dd3fc",
    tempK: 25200,
    axialTilt: 5,
    rotationSpeed: 1.8
  },

  // --- STARS ---
  {
    id: "tpl_sun",
    name: "Sol (Enana Amarilla G2V)",
    subtitle: "Estrella secuencia principal · 5,778 K",
    category: "star",
    type: "star",
    textureKey: "Sun",
    mass: 1600,
    radius: 2.8,
    density: 1.41,
    color: "#ffaa00",
    glowColor: "#ff6a00",
    tempK: 5778,
    axialTilt: 7.25,
    rotationSpeed: 0.45
  },
  {
    id: "tpl_red_dwarf",
    name: "Enana Roja (Próxima Centauri)",
    subtitle: "Estrella ligera M5.5 · Interactúa fácil",
    category: "star",
    type: "star",
    textureKey: "RedStar",
    mass: 420,
    radius: 1.85,
    density: 12.5,
    color: "#ff4500",
    glowColor: "#dc2626",
    tempK: 3042,
    axialTilt: 4,
    rotationSpeed: 0.35
  },
  {
    id: "tpl_red_supergiant",
    name: "Supergigante Roja (Betelgeuse)",
    subtitle: "Envoltura difusa colosal · 3,500 K",
    category: "star",
    type: "star",
    textureKey: "RedStar",
    mass: 2600,
    radius: 3.9,
    density: 0.25,
    color: "#ff2e17",
    glowColor: "#b91c1c",
    tempK: 3500,
    axialTilt: 10,
    rotationSpeed: 0.2
  },
  {
    id: "tpl_blue_giant",
    name: "Supergigante Azul (Rigel O5)",
    subtitle: "Estrella masiva hipercaliente · 28,000 K",
    category: "star",
    type: "star",
    textureKey: "BlueStar",
    mass: 3600,
    radius: 3.3,
    density: 2.2,
    color: "#38bdf8",
    glowColor: "#0284c7",
    tempK: 28000,
    axialTilt: 12,
    rotationSpeed: 0.75
  },

  // --- GAS & ICE GIANTS ---
  {
    id: "tpl_brown_dwarf",
    name: "Enana Marrón (Sub-Estelar)",
    subtitle: "Entre gigante gaseoso y estrella · 1,400 K",
    category: "gas_giant",
    type: "gas_giant",
    textureKey: "Jupiter",
    mass: 240,
    radius: 2.15,
    density: 18.0,
    color: "#9a3412",
    glowColor: "#ea580c",
    tempK: 1400,
    hasAtmosphere: true,
    atmosphereColor: "#f97316",
    axialTilt: 9
  },
  {
    id: "tpl_jupiter",
    name: "Júpiter",
    subtitle: "Gigante gaseoso masivo · Perturba órbitas",
    category: "gas_giant",
    type: "gas_giant",
    textureKey: "Jupiter",
    mass: 95,
    radius: 2.15,
    density: 1.33,
    color: "#d97706",
    tempK: 165,
    hasAtmosphere: true,
    atmosphereColor: "#fde68a",
    axialTilt: 3.13
  },
  {
    id: "tpl_saturn",
    name: "Saturno",
    subtitle: "Gigante gaseoso con sistema de anillos HD",
    category: "gas_giant",
    type: "gas_giant",
    textureKey: "Saturn",
    mass: 58,
    radius: 1.9,
    density: 0.69,
    color: "#eab308",
    tempK: 134,
    hasAtmosphere: true,
    atmosphereColor: "#fef08a",
    hasRings: true,
    ringColor: "#dec484",
    axialTilt: 26.73
  },
  {
    id: "tpl_uranus",
    name: "Urano",
    subtitle: "Gigante de hielo cian con anillos polares",
    category: "gas_giant",
    type: "gas_giant",
    textureKey: "Uranus",
    mass: 28,
    radius: 1.6,
    density: 1.27,
    color: "#22d3ee",
    tempK: 76,
    hasAtmosphere: true,
    atmosphereColor: "#67e8f9",
    hasRings: true,
    ringColor: "#a5f3fc",
    axialTilt: 97.77
  },
  {
    id: "tpl_neptune",
    name: "Neptuno",
    subtitle: "Gigante de hielo azul supersónico",
    category: "gas_giant",
    type: "gas_giant",
    textureKey: "Neptune",
    mass: 32,
    radius: 1.58,
    density: 1.64,
    color: "#2563eb",
    tempK: 72,
    hasAtmosphere: true,
    atmosphereColor: "#60a5fa",
    axialTilt: 28.32
  },

  // --- ROCKY PLANETS & EXOPLANETS ---
  {
    id: "tpl_super_earth",
    name: "Súper-Tierra (Kepler-452b)",
    subtitle: "Planeta rocoso masivo de alta gravedad",
    category: "rocky",
    type: "rocky",
    textureKey: "Earth",
    mass: 18,
    radius: 1.48,
    density: 6.8,
    color: "#10b981",
    tempK: 265,
    hasAtmosphere: true,
    atmosphereColor: "#34d399",
    hasClouds: true,
    axialTilt: 18
  },
  {
    id: "tpl_earth",
    name: "Tierra",
    subtitle: "Mundo oceánico con nubes y atmósfera",
    category: "rocky",
    type: "rocky",
    textureKey: "Earth",
    mass: 8,
    radius: 1.25,
    density: 5.51,
    color: "#3b82f6",
    tempK: 288,
    hasAtmosphere: true,
    atmosphereColor: "#38bdf8",
    hasClouds: true,
    axialTilt: 23.44
  },
  {
    id: "tpl_venus",
    name: "Venus",
    subtitle: "Atmósfera densa sulfúrica · 737 K",
    category: "rocky",
    type: "rocky",
    textureKey: "Venus",
    mass: 7,
    radius: 1.2,
    density: 5.24,
    color: "#f59e0b",
    tempK: 737,
    hasAtmosphere: true,
    atmosphereColor: "#fbbf24",
    axialTilt: 177.3
  },
  {
    id: "tpl_mars",
    name: "Marte",
    subtitle: "Planeta rocoso de óxido de hierro",
    category: "rocky",
    type: "rocky",
    textureKey: "Mars",
    mass: 3.5,
    radius: 0.98,
    density: 3.93,
    color: "#ef4444",
    tempK: 210,
    hasAtmosphere: true,
    atmosphereColor: "#f97316",
    axialTilt: 25.19
  },
  {
    id: "tpl_lava_world",
    name: "Mundo de Magma (55 Cancri e)",
    subtitle: "Océanos de lava incandescente · 2,400 K",
    category: "rocky",
    type: "rocky",
    textureKey: "Mars",
    mass: 14,
    radius: 1.38,
    density: 5.9,
    color: "#f97316",
    glowColor: "#ea580c",
    tempK: 2400,
    hasAtmosphere: true,
    atmosphereColor: "#ef4444",
    axialTilt: 6
  },
  {
    id: "tpl_mercury",
    name: "Mercurio",
    subtitle: "Núcleo de hierro denso craterizado",
    category: "rocky",
    type: "rocky",
    textureKey: "Mercury",
    mass: 2.0,
    radius: 0.82,
    density: 5.43,
    color: "#94a3b8",
    tempK: 440,
    axialTilt: 0.03
  },

  // --- MOONS, DWARF PLANETS & SMALL BODIES ---
  {
    id: "tpl_moon",
    name: "Luna / Satélite Natural",
    subtitle: "Cuerpo craterizado para sistemas planeta-luna",
    category: "small",
    type: "dwarf",
    textureKey: "Moon",
    mass: 0.8,
    radius: 0.65,
    density: 3.34,
    color: "#cbd5e1",
    tempK: 250,
    axialTilt: 6.68
  },
  {
    id: "tpl_pluto",
    name: "Plutón",
    subtitle: "Planeta enano helado de nitrógeno",
    category: "small",
    type: "dwarf",
    textureKey: "Pluto",
    mass: 1.1,
    radius: 0.72,
    density: 1.85,
    color: "#d6b89c",
    tempK: 44,
    axialTilt: 122.5
  },
  {
    id: "tpl_ceres",
    name: "Asteroide Masivo (Ceres)",
    subtitle: "Cuerpo rocoso para pruebas de impacto",
    category: "small",
    type: "dwarf",
    textureKey: "Ceres",
    mass: 0.5,
    radius: 0.58,
    density: 2.16,
    color: "#a8a29e",
    tempK: 168,
    axialTilt: 4
  }
];

// ==========================================
// PRESET SCENARIOS (ALL FREE TO MOVE & INTERACT GRAVITATIONALLY!)
// ==========================================

export const SANDBOX_PRESETS: {
  id: string;
  name: string;
  desc: string;
  bodies: SandboxBody[];
}[] = [
  {
    id: "lagrange_points",
    name: "Puntos de Lagrange (L4 y L5)",
    desc: "Estrella enana roja (se bambolea por el tirón del planeta gigante) y asteroides troyanos en L4 y L5.",
    bodies: [
      {
        id: "lg_sun",
        name: "Enana Roja Central",
        type: "star",
        textureKey: "RedStar",
        mass: 1800,
        radius: 2.7,
        density: 8.0,
        color: "#ff4500",
        glowColor: "#ff2200",
        pos: [0, 0, 0],
        vel: [0.095, 0, -0.068], // Counter-velocity so total momentum is zero & star wobbles around barycenter!
        tempK: 3900
      },
      {
        id: "lg_planet",
        name: "Gigante Primario",
        type: "gas_giant",
        textureKey: "Uranus",
        mass: 75,
        radius: 1.95,
        density: 1.6,
        color: "#22d3ee",
        pos: [-16, 0, 22],
        vel: [-1.85, 0, -1.34],
        tempK: 120,
        hasAtmosphere: true,
        atmosphereColor: "#38bdf8"
      },
      {
        id: "lg_l4",
        name: "Troyano L4 (+60°)",
        type: "dwarf",
        textureKey: "Moon",
        mass: 0.8,
        radius: 0.65,
        density: 3.3,
        color: "#cbd5e1",
        pos: [-27.05, 0, -2.86],
        vel: [0.24, 0, -2.28],
        tempK: 200
      },
      {
        id: "lg_l5",
        name: "Troyano L5 (-60°)",
        type: "dwarf",
        textureKey: "Pluto",
        mass: 0.8,
        radius: 0.65,
        density: 2.5,
        color: "#e2e8f0",
        pos: [11.05, 0, 24.86],
        vel: [-2.09, 0, 0.93],
        tempK: 200
      }
    ]
  },
  {
    id: "figure_eight",
    name: "Figura en 8 (Chenciner & Montgomery)",
    desc: "Coreografía periódica exacta de 3 estrellas de igual masa persiguiéndose mutuamente.",
    bodies: [
      {
        id: "f8_1",
        name: "Alfa (Sol G2V)",
        type: "star",
        textureKey: "Sun",
        mass: 1500,
        radius: 2.0,
        density: 1.4,
        color: "#fbbf24",
        glowColor: "#f59e0b",
        pos: [-19.4, 0, 4.86],
        vel: [0.932, 0, 0.864],
        tempK: 5778
      },
      {
        id: "f8_2",
        name: "Beta (Gigante Azul)",
        type: "star",
        textureKey: "BlueStar",
        mass: 1500,
        radius: 2.0,
        density: 2.2,
        color: "#38bdf8",
        glowColor: "#0284c7",
        pos: [19.4, 0, -4.86],
        vel: [0.932, 0, 0.864],
        tempK: 18000
      },
      {
        id: "f8_3",
        name: "Gamma (Enana Roja)",
        type: "star",
        textureKey: "RedStar",
        mass: 1500,
        radius: 2.0,
        density: 3.1,
        color: "#f43f5e",
        glowColor: "#e11d48",
        pos: [0, 0, 0],
        vel: [-1.864, 0, -1.728],
        tempK: 3600
      }
    ]
  },
  {
    id: "three_body_chaos",
    name: "Caos Gravitacional (3 Cuerpos)",
    desc: "Tres estrellas de diferente masa y dos planetas interactuando caóticamente.",
    bodies: [
      {
        id: "c_star1",
        name: "Solaris A",
        type: "star",
        textureKey: "Sun",
        mass: 1650,
        radius: 2.35,
        density: 1.4,
        color: "#fbbf24",
        glowColor: "#f59e0b",
        pos: [-16, 0, -10],
        vel: [0.65, 0, -1.05],
        tempK: 5800
      },
      {
        id: "c_star2",
        name: "Púlsar B",
        type: "neutron_star",
        textureKey: "NeutronStar",
        mass: 1850,
        radius: 1.35,
        density: 5000,
        color: "#38bdf8",
        glowColor: "#06b6d4",
        pos: [16, 0, -8],
        vel: [-0.58, 0, 1.15],
        tempK: 450000,
        hasRelativisticJets: true
      },
      {
        id: "c_star3",
        name: "Antares C",
        type: "star",
        textureKey: "RedStar",
        mass: 1150,
        radius: 2.25,
        density: 0.9,
        color: "#ef4444",
        glowColor: "#dc2626",
        pos: [0, 0, 18],
        vel: [-0.08, 0, -0.1],
        tempK: 3500
      },
      {
        id: "c_planet",
        name: "Tierra Errante",
        type: "rocky",
        textureKey: "Earth",
        mass: 12,
        radius: 1.25,
        density: 5.5,
        color: "#3b82f6",
        pos: [0, 0, -2],
        vel: [2.45, 0, 0.45],
        tempK: 288,
        hasAtmosphere: true,
        atmosphereColor: "#38bdf8",
        hasClouds: true
      }
    ]
  },
  {
    id: "inner_solar",
    name: "Sistema Solar y Perturbación Planetaria",
    desc: "Sol libre en el baricentro con Tierra, Marte, Júpiter y Saturno perturbándose mutuamente.",
    bodies: [
      {
        id: "ss_sun",
        name: "Sol",
        type: "star",
        textureKey: "Sun",
        mass: 2400,
        radius: 3.1,
        density: 1.41,
        color: "#ffaa00",
        glowColor: "#ff6600",
        pos: [0, 0, 0],
        vel: [0, 0, -0.18], // Recoil velocity from Jupiter & Saturn!
        tempK: 5778
      },
      {
        id: "ss_earth",
        name: "Tierra",
        type: "rocky",
        textureKey: "Earth",
        mass: 12,
        radius: 1.25,
        density: 5.51,
        color: "#3b82f6",
        pos: [14, 0, 0],
        vel: [0, 0, 3.65],
        tempK: 288,
        hasAtmosphere: true,
        atmosphereColor: "#38bdf8",
        hasClouds: true
      },
      {
        id: "ss_mars",
        name: "Marte",
        type: "rocky",
        textureKey: "Mars",
        mass: 6,
        radius: 1.0,
        density: 3.93,
        color: "#ef4444",
        pos: [21, 0, 0],
        vel: [0, 0, 2.98],
        tempK: 210,
        hasAtmosphere: true,
        atmosphereColor: "#f97316"
      },
      {
        id: "ss_jupiter",
        name: "Júpiter",
        type: "gas_giant",
        textureKey: "Jupiter",
        mass: 115,
        radius: 2.2,
        density: 1.33,
        color: "#d97706",
        pos: [31, 0, 0],
        vel: [0, 0, 2.48],
        tempK: 165,
        hasAtmosphere: true,
        atmosphereColor: "#fde68a"
      },
      {
        id: "ss_saturn",
        name: "Saturno",
        type: "gas_giant",
        textureKey: "Saturn",
        mass: 65,
        radius: 1.9,
        density: 0.69,
        color: "#eab308",
        pos: [44, 0, 0],
        vel: [0, 0, 2.08],
        tempK: 134,
        hasAtmosphere: true,
        atmosphereColor: "#fef08a",
        hasRings: true,
        ringColor: "#dec484",
        axialTilt: 26.7
      }
    ]
  },
  {
    id: "binary_circumbinary",
    name: "Estrella Binaria y Planeta Circumbinario",
    desc: "Dos soles orbitando su baricentro común mientras perturban a planetas circumbinarios.",
    bodies: [
      {
        id: "bin_a",
        name: "Helios A (G2V)",
        type: "star",
        textureKey: "Sun",
        mass: 1800,
        radius: 2.35,
        density: 1.4,
        color: "#fbbf24",
        glowColor: "#f59e0b",
        pos: [-7.0, 0, 0],
        vel: [0, 0, -1.58],
        tempK: 5778
      },
      {
        id: "bin_b",
        name: "Helios B (Enana Roja)",
        type: "star",
        textureKey: "RedStar",
        mass: 1400,
        radius: 2.05,
        density: 2.8,
        color: "#f97316",
        glowColor: "#ea580c",
        pos: [9.0, 0, 0],
        vel: [0, 0, 2.03],
        tempK: 3900
      },
      {
        id: "bin_p1",
        name: "Kepler-16b (Saturno)",
        type: "gas_giant",
        textureKey: "Saturn",
        mass: 55,
        radius: 1.9,
        density: 0.9,
        color: "#eab308",
        pos: [0, 0, 29],
        vel: [-2.95, 0, 0],
        tempK: 260,
        hasAtmosphere: true,
        atmosphereColor: "#fde047",
        hasRings: true,
        ringColor: "#dec484",
        axialTilt: 24
      },
      {
        id: "bin_p2",
        name: "Súper-Tierra Circumbinaria",
        type: "rocky",
        textureKey: "Earth",
        mass: 15,
        radius: 1.35,
        density: 5.5,
        color: "#3b82f6",
        pos: [0, 0, -40],
        vel: [2.52, 0, 0],
        tempK: 285,
        hasAtmosphere: true,
        atmosphereColor: "#38bdf8",
        hasClouds: true
      }
    ]
  },
  {
    id: "black_hole_collision",
    name: "Colisión con Agujero Negro y Límite de Roche",
    desc: "Agujero negro y Púlsar desgarrando una estrella por fuerzas de marea (Espaguetificación) y colisionando.",
    bodies: [
      {
        id: "bh_core",
        name: "Gargantúa (Agujero Negro)",
        type: "black_hole",
        textureKey: "BlackHole",
        mass: 5200,
        radius: 2.45,
        density: 9999,
        color: "#000000",
        glowColor: "#a855f7",
        pos: [-3, 0, 0],
        vel: [0, 0, -0.45],
        tempK: 1500000,
        hasRings: true,
        ringColor: "#f97316",
        hasRelativisticJets: true
      },
      {
        id: "bh_pulsar",
        name: "Púlsar Compañero",
        type: "neutron_star",
        textureKey: "NeutronStar",
        mass: 1800,
        radius: 1.25,
        density: 5000,
        color: "#38bdf8",
        glowColor: "#06b6d4",
        pos: [18, 0, 0],
        vel: [-0.6, 0, 3.8],
        tempK: 600000,
        hasRelativisticJets: true
      },
      {
        id: "bh_star",
        name: "Gigante Roja Condenada",
        type: "star",
        textureKey: "RedStar",
        mass: 850,
        radius: 2.6,
        density: 0.3, // Low density -> will undergo Roche tidal disruption near the Black Hole!
        color: "#ff3b1f",
        glowColor: "#dc2626",
        pos: [-24, 0, 10],
        vel: [1.6, 0, 2.3],
        tempK: 3400
      },
      {
        id: "bh_jup",
        name: "Júpiter Caliente",
        type: "gas_giant",
        textureKey: "Jupiter",
        mass: 90,
        radius: 2.0,
        density: 1.1,
        color: "#d97706",
        pos: [0, 0, -28],
        vel: [3.6, 0, 0.4],
        tempK: 850,
        hasAtmosphere: true,
        atmosphereColor: "#fbbf24"
      }
    ]
  },
  {
    id: "kilonova_merger",
    name: "Fusión de Estrellas de Neutrones (Kilonova)",
    desc: "Espiral relativista de dos Púlsares y planetas cercanos que culmina en una explosión de Kilonova.",
    bodies: [
      {
        id: "kn_1",
        name: "Púlsar Alfa",
        type: "neutron_star",
        textureKey: "NeutronStar",
        mass: 2200,
        radius: 1.35,
        density: 5000,
        color: "#38bdf8",
        glowColor: "#06b6d4",
        pos: [-6.5, 0, 0],
        vel: [0.35, 0, -2.15],
        tempK: 650000,
        hasRelativisticJets: true
      },
      {
        id: "kn_2",
        name: "Magnetar Beta",
        type: "neutron_star",
        textureKey: "NeutronStar",
        mass: 2200,
        radius: 1.35,
        density: 5000,
        color: "#c084fc",
        glowColor: "#a855f7",
        pos: [6.5, 0, 0],
        vel: [-0.35, 0, 2.15],
        tempK: 750000,
        hasRelativisticJets: true
      },
      {
        id: "kn_p1",
        name: "Planeta de Hierro",
        type: "rocky",
        textureKey: "Mercury",
        mass: 10,
        radius: 1.1,
        density: 7.5,
        color: "#94a3b8",
        pos: [0, 0, 24],
        vel: [-3.4, 0, 0],
        tempK: 500
      }
    ]
  },
  {
    id: "empty",
    name: "🧹 Espacio Limpio",
    desc: "Lienzo vacío libre de cuerpos celestes para construir y experimentar desde cero.",
    bodies: []
  }
];
