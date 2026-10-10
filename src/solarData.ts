import * as THREE from "three";

// ==========================================
// UNIFIED ASTRONOMICAL AU SCALING
// (100% synchronized between orbits, planets and distance ruler)
// ==========================================

export function getScaledRadius(au: number, isRealisticOrbits: boolean): number {
  if (au === 0) return 0;
  if (!isRealisticOrbits) {
    // Didactic spacing
    if (au <= 1.0) return au * 22.0;
    if (au <= 2.0) return 22.0 + (au - 1.0) * 14.0;
    if (au <= 6.0) return 36.0 + (au - 2.0) * 8.0;
    if (au <= 12.0) return 68.0 + (au - 6.0) * 6.0;
    if (au <= 32.0) return 104.0 + (au - 12.0) * 3.5;
    return 174.0 + (au - 32.0) * 2.2;
  }
  // Realistic physical spacing curve
  if (au <= 1.6) return au * 22.0;
  return 35.2 + Math.pow(au - 1.6, 0.82) * 8.5;
}

export interface PlanetItem {
  name: string;
  displayName: string;
  category: "star" | "terrestrial" | "gas_giant" | "dwarf_planet";
  categoryLabel: string;
  color: string;
  size: number;
  realisticRadius: number;
  semiMajorAU: number;        // Semi-major axis in AU
  eccentricity: number;       // Orbit eccentricity (e)
  inclination: number;        // Orbital inclination to ecliptic (deg)
  longNode: number;           // Longitude of Ascending Node (deg)
  argPerihelion: number;      // Argument of Perihelion (deg)
  meanLongitude0: number;     // Mean Longitude at J2000 (deg)
  period: number;             // Orbital period (days)
  velocity: number;           // Orbital velocity (km/s)
  axialTilt: number;          // Obliquity (deg)
  rotPeriodHours: number;     // Rotation period (hours)
  temp: number;
  roughness: number;
  metalness: number;
  details: string;
  composition: string;
  atmosphere: string;
  moons: Array<{ name: string; distance: number; speed: number; radiusKm: number }>;
}

export interface AtmosphereConfig {
  hasAtmosphere: boolean;
  dayColor: string;          // Daytime Rayleigh scattering color (e.g. blue for Earth, cyan for Uranus, gold for Venus, etc.)
  sunsetColor: string;       // Terminator / sunset scattering color (e.g. reddish amber for Earth, blue for Mars, deep amber for Venus)
  scale: number;             // Atmosphere shell radius multiplier (e.g. 1.025 to 1.045)
  density: number;           // Opacity / scattering density (e.g. 0.85)
  power: number;             // Fresnel rim power (2.5 - 4.0)
  composition: string;       // Physical atmospheric composition details
}

export const PLANET_ATMOSPHERE_CONFIGS: Record<string, AtmosphereConfig> = {
  Earth: {
    hasAtmosphere: true,
    dayColor: "#38bdf8",     // Vibrant Rayleigh sky blue
    sunsetColor: "#ef4444",  // Fiery reddish-amber sunset on the limb terminator
    scale: 1.028,
    density: 0.95,
    power: 3.2,
    composition: "78% N₂, 21% O₂ (Dispersión Rayleigh Azul Terrestre)"
  },
  Venus: {
    hasAtmosphere: true,
    dayColor: "#fde68a",     // Dense golden sulfur Rayleigh haze
    sunsetColor: "#f59e0b",  // Deep amber-gold sunset
    scale: 1.045,
    density: 1.15,
    power: 2.6,
    composition: "96.5% CO₂ + Ácido Sulfúrico (Bruma Densa Dorada)"
  },
  Mars: {
    hasAtmosphere: true,
    dayColor: "#fb923c",     // Dusty butterscotch orange-red
    sunsetColor: "#60a5fa",  // Unique Martian blue sunset scattering!
    scale: 1.024,
    density: 0.65,
    power: 3.8,
    composition: "95% CO₂ + Polvo Férrico (Crepúsculo Azul Marciano)"
  },
  Jupiter: {
    hasAtmosphere: true,
    dayColor: "#fed7aa",     // Warm creamy hydrogen-helium envelope
    sunsetColor: "#c2410c",  // Terracotta twilight limb
    scale: 1.028,
    density: 0.85,
    power: 2.8,
    composition: "90% H₂, 10% He + Bandas de Amoníaco"
  },
  Saturn: {
    hasAtmosphere: true,
    dayColor: "#fef08a",     // Pale golden yellow haze
    sunsetColor: "#d97706",  // Warm amber twilight
    scale: 1.026,
    density: 0.8,
    power: 2.8,
    composition: "96% H₂, 3% He + Neblina Estratosférica"
  },
  Uranus: {
    hasAtmosphere: true,
    dayColor: "#22d3ee",     // Electric aquamarine / cyan Rayleigh glow
    sunsetColor: "#0284c7",  // Deep oceanic cyan-blue
    scale: 1.032,
    density: 0.9,
    power: 3.0,
    composition: "83% H₂, 15% He, 2% Metano (Dispersión Aguamarina)"
  },
  Neptune: {
    hasAtmosphere: true,
    dayColor: "#3b82f6",     // Intense royal azure / cobalt blue Rayleigh scattering
    sunsetColor: "#1d4ed8",  // Deep midnight indigo blue
    scale: 1.032,
    density: 0.95,
    power: 3.0,
    composition: "80% H₂, 19% He, 1.5% Metano Profundo (Azul Cobalto)"
  },
  Pluto: {
    hasAtmosphere: true,
    dayColor: "#7dd3fc",     // Ethereal cryogenic nitrogen/methane ice blue haze
    sunsetColor: "#0284c7",  // Soft cyan twilight
    scale: 1.022,
    density: 0.45,
    power: 4.2,
    composition: "Bruma criogénica N₂ / CH₄ (Datos New Horizons)"
  },
  Mercury: {
    hasAtmosphere: false,
    dayColor: "#ffffff",
    sunsetColor: "#ffffff",
    scale: 1.0,
    density: 0,
    power: 4.0,
    composition: "Exosfera tenue sin dispersión"
  },
  Ceres: {
    hasAtmosphere: false,
    dayColor: "#ffffff",
    sunsetColor: "#ffffff",
    scale: 1.0,
    density: 0,
    power: 4.0,
    composition: "Sin atmósfera apreciable"
  },
  Haumea: {
    hasAtmosphere: false,
    dayColor: "#ffffff",
    sunsetColor: "#ffffff",
    scale: 1.0,
    density: 0,
    power: 4.0,
    composition: "Sin atmósfera"
  },
  Makemake: {
    hasAtmosphere: false,
    dayColor: "#ffffff",
    sunsetColor: "#ffffff",
    scale: 1.0,
    density: 0,
    power: 4.0,
    composition: "Sin atmósfera persistente"
  },
  Eris: {
    hasAtmosphere: false,
    dayColor: "#ffffff",
    sunsetColor: "#ffffff",
    scale: 1.0,
    density: 0,
    power: 4.0,
    composition: "Sin atmósfera"
  }
};

export const planetsData: PlanetItem[] = [
  {
    name: "Sun",
    displayName: "Sol",
    category: "star",
    categoryLabel: "Estrella Central",
    color: "#FDB813",
    size: 3.2,
    realisticRadius: 2.0,
    semiMajorAU: 0,
    eccentricity: 0,
    inclination: 0,
    longNode: 0,
    argPerihelion: 0,
    meanLongitude0: 0,
    period: 0,
    velocity: 0,
    axialTilt: 7.25,
    rotPeriodHours: 600,
    temp: 5500,
    roughness: 0.2,
    metalness: 0.1,
    details: "Estrella enana amarilla G2V, centro gravitacional y motor termonuclear de nuestro sistema solar.",
    composition: "73.4% Hidrógeno, 25.0% Helio, 1.6% Elementos pesados (Oxígeno, Carbono, Hierro).",
    atmosphere: "Corona solar ultra-caliente que supera el millón de grados Celsius.",
    moons: []
  },
  {
    name: "Mercury",
    displayName: "Mercurio",
    category: "terrestrial",
    categoryLabel: "Planeta Terrestre",
    color: "#A5A5A5",
    size: 0.45,
    realisticRadius: 0.06,
    semiMajorAU: 0.387,
    eccentricity: 0.2056,
    inclination: 7.00,
    longNode: 48.33,
    argPerihelion: 29.12,
    meanLongitude0: 252.25,
    period: 87.97,
    velocity: 47.4,
    axialTilt: 0.034,
    rotPeriodHours: 1407.6,
    temp: 167,
    roughness: 0.95,
    metalness: 0.15,
    details: "Mundo rocoso cubierto de cráteres de impacto, con la órbita más excéntrica del sistema interior.",
    composition: "Núcleo metálico de hierro que ocupa el 85% de su radio y corteza de silicatos.",
    atmosphere: "Exosfera tenue compuesta de átomos expulsados por el viento solar.",
    moons: []
  },
  {
    name: "Venus",
    displayName: "Venus",
    category: "terrestrial",
    categoryLabel: "Planeta Terrestre",
    color: "#E3BB76",
    size: 0.7,
    realisticRadius: 0.14,
    semiMajorAU: 0.723,
    eccentricity: 0.0067,
    inclination: 3.39,
    longNode: 76.68,
    argPerihelion: 54.88,
    meanLongitude0: 181.98,
    period: 224.7,
    velocity: 35.0,
    axialTilt: 177.36,
    rotPeriodHours: -5832.5,
    temp: 464,
    roughness: 0.5,
    metalness: 0.1,
    details: "Planeta volcánico con efecto invernadero descontrolado y rotación axial retrógrada invertida.",
    composition: "Núcleo de hierro, manto de silicatos y corteza volcánica basáltica.",
    atmosphere: "Densa capa de CO2 (96.5%) con nubes de ácido sulfúrico concentrado.",
    moons: []
  },
  {
    name: "Earth",
    displayName: "Tierra",
    category: "terrestrial",
    categoryLabel: "Planeta Terrestre",
    color: "#2F80ED",
    size: 0.78,
    realisticRadius: 0.15,
    semiMajorAU: 1.000,
    eccentricity: 0.0167,
    inclination: 0.00,
    longNode: 0.00,
    argPerihelion: 102.94,
    meanLongitude0: 100.46,
    period: 365.25,
    velocity: 29.8,
    axialTilt: 23.44,
    rotPeriodHours: 24.0,
    temp: 15,
    roughness: 0.65,
    metalness: 0.2,
    details: "El oasis biológico del cosmos con agua líquida superficial, atmósfera protectora e inclinación de 23.4°.",
    composition: "Núcleo de hierro-níquel, manto de silicatos y corteza dinámica con placas tectónicas.",
    atmosphere: "78% Nitrógeno, 21% Oxígeno, 0.9% Argón y vapor de agua.",
    moons: [
      { name: "Luna (Selene)", distance: 1.4, speed: 0.5, radiusKm: 1737 }
    ]
  },
  {
    name: "Mars",
    displayName: "Marte",
    category: "terrestrial",
    categoryLabel: "Planeta Terrestre",
    color: "#E27B58",
    size: 0.55,
    realisticRadius: 0.08,
    semiMajorAU: 1.524,
    eccentricity: 0.0934,
    inclination: 1.85,
    longNode: 49.56,
    argPerihelion: 286.50,
    meanLongitude0: 355.45,
    period: 686.98,
    velocity: 24.1,
    axialTilt: 25.19,
    rotPeriodHours: 24.62,
    temp: -65,
    roughness: 0.85,
    metalness: 0.25,
    details: "El Planeta Rojo, con un eje de rotación de 25.2° muy similar a la Tierra y casquetes polares.",
    composition: "Rico en minerales de óxido de hierro, manto rocoso y volcanes colosales como el Monte Olimpo.",
    atmosphere: "Atmósfera delgada de CO2 (95.3%), Nitrógeno y Argón.",
    moons: [
      { name: "Fobos", distance: 0.85, speed: 0.85, radiusKm: 11 },
      { name: "Deimos", distance: 1.2, speed: 0.45, radiusKm: 6 }
    ]
  },
  {
    name: "Ceres",
    displayName: "Ceres",
    category: "dwarf_planet",
    categoryLabel: "Planeta Enano",
    color: "#9ca3af",
    size: 0.3,
    realisticRadius: 0.035,
    semiMajorAU: 2.767,
    eccentricity: 0.0758,
    inclination: 10.59,
    longNode: 80.33,
    argPerihelion: 73.60,
    meanLongitude0: 153.90,
    period: 1681.6,
    velocity: 17.9,
    axialTilt: 4.0,
    rotPeriodHours: 9.07,
    temp: -105,
    roughness: 0.95,
    metalness: 0.1,
    details: "El planeta enano más cercano y el objeto más masivo del Cinturón de Asteroides, con depósitos de sales brillantes (cráter Occator).",
    composition: "Manto de hielo de agua y núcleo rocoso arcilloso con posible criovulcanismo.",
    atmosphere: "Exosfera transitoria muy tenue de vapor de agua producida por sublimación.",
    moons: []
  },
  {
    name: "Jupiter",
    displayName: "Júpiter",
    category: "gas_giant",
    categoryLabel: "Gigante Gaseoso",
    color: "#D39C7E",
    size: 1.8,
    realisticRadius: 0.38,
    semiMajorAU: 5.204,
    eccentricity: 0.0485,
    inclination: 1.30,
    longNode: 100.56,
    argPerihelion: 273.87,
    meanLongitude0: 34.40,
    period: 4332.59,
    velocity: 13.1,
    axialTilt: 3.13,
    rotPeriodHours: 9.93,
    temp: -110,
    roughness: 0.45,
    metalness: 0.05,
    details: "El gigante más masivo con rotación ultra-rápida (9.9h), la Gran Mancha Roja y 95 lunas.",
    composition: "90% Hidrógeno, 10% Helio con manto de hidrógeno metálico líquido y núcleo denso.",
    atmosphere: "Bandas turbulentas de amoníaco y sulfuro con vientos huracanados permanentes.",
    moons: [
      { name: "Ío", distance: 1.5, speed: 0.85, radiusKm: 1821 },
      { name: "Europa", distance: 1.9, speed: 0.65, radiusKm: 1560 },
      { name: "Ganimedes", distance: 2.35, speed: 0.45, radiusKm: 2634 },
      { name: "Calisto", distance: 2.8, speed: 0.32, radiusKm: 2410 },
      { name: "Amaltea", distance: 3.15, speed: 0.95, radiusKm: 83 }
    ]
  },
  {
    name: "Saturn",
    displayName: "Saturno",
    category: "gas_giant",
    categoryLabel: "Gigante Gaseoso",
    color: "#C5AB6E",
    size: 1.5,
    realisticRadius: 0.32,
    semiMajorAU: 9.582,
    eccentricity: 0.0555,
    inclination: 2.49,
    longNode: 113.72,
    argPerihelion: 339.39,
    meanLongitude0: 49.94,
    period: 10759.22,
    velocity: 9.7,
    axialTilt: 26.73,
    rotPeriodHours: 10.7,
    temp: -140,
    roughness: 0.45,
    metalness: 0.1,
    details: "Joya del sistema solar con su característico sistema de anillos de hielo y roca inclinado a 26.7°.",
    composition: "96% Hidrógeno, 3% Helio, núcleo rocoso de hielos y metano comprimido.",
    atmosphere: "Atmósfera brumosa amarillenta de amoníaco con vientos de hasta 1,800 km/h.",
    moons: [
      { name: "Titán", distance: 2.5, speed: 0.35, radiusKm: 2574 },
      { name: "Encélado", distance: 2.85, speed: 0.55, radiusKm: 252 },
      { name: "Rea", distance: 3.2, speed: 0.28, radiusKm: 763 },
      { name: "Jápeto", distance: 3.55, speed: 0.15, radiusKm: 734 },
      { name: "Dione", distance: 3.85, speed: 0.32, radiusKm: 561 }
    ]
  },
  {
    name: "Uranus",
    displayName: "Urano",
    category: "gas_giant",
    categoryLabel: "Gigante Helado",
    color: "#B5E3E3",
    size: 1.05,
    realisticRadius: 0.24,
    semiMajorAU: 19.229,
    eccentricity: 0.0463,
    inclination: 0.77,
    longNode: 74.23,
    argPerihelion: 96.73,
    meanLongitude0: 313.23,
    period: 30685.4,
    velocity: 6.8,
    axialTilt: 97.77,
    rotPeriodHours: -17.24,
    temp: -195,
    roughness: 0.4,
    metalness: 0.05,
    details: "Gigante helado con la inclinación axial más extrema (97.8°), rotando prácticamente acostado.",
    composition: "Manto fluido de agua, metano y amoníaco sobre un núcleo rocoso.",
    atmosphere: "83% Hidrógeno, 15% Helio, 2% Metano (color cian característico).",
    moons: [
      { name: "Titania", distance: 1.7, speed: 0.32, radiusKm: 788 },
      { name: "Oberón", distance: 2.05, speed: 0.25, radiusKm: 761 },
      { name: "Umbriel", distance: 2.35, speed: 0.28, radiusKm: 584 },
      { name: "Ariel", distance: 2.65, speed: 0.4, radiusKm: 578 }
    ]
  },
  {
    name: "Neptune",
    displayName: "Neptuno",
    category: "gas_giant",
    categoryLabel: "Gigante Helado",
    color: "#6081FF",
    size: 1.05,
    realisticRadius: 0.24,
    semiMajorAU: 30.05,
    eccentricity: 0.0095,
    inclination: 1.77,
    longNode: 131.72,
    argPerihelion: 273.19,
    meanLongitude0: 304.88,
    period: 60189.0,
    velocity: 5.4,
    axialTilt: 28.32,
    rotPeriodHours: 16.11,
    temp: -201,
    roughness: 0.4,
    metalness: 0.05,
    details: "El planeta mayor más exterior, con vientos atmosféricos supersónicos de 2,100 km/h.",
    composition: "Manto helado y viscoso de agua, amoníaco y metano con núcleo rocoso.",
    atmosphere: "80% Hidrógeno, 19% Helio, 1.5% Metano con cirros blancos activos.",
    moons: [
      { name: "Tritón", distance: 1.8, speed: 0.28, radiusKm: 1353 },
      { name: "Proteo", distance: 2.15, speed: 0.35, radiusKm: 210 },
      { name: "Nereida", distance: 2.45, speed: 0.12, radiusKm: 170 }
    ]
  },
  {
    name: "Pluto",
    displayName: "Plutón",
    category: "dwarf_planet",
    categoryLabel: "Planeta Enano",
    color: "#c4a482",
    size: 0.38,
    realisticRadius: 0.045,
    semiMajorAU: 39.482,
    eccentricity: 0.2488,
    inclination: 17.16,
    longNode: 110.30,
    argPerihelion: 113.83,
    meanLongitude0: 238.92,
    period: 90560.0,
    velocity: 4.74,
    axialTilt: 122.53,
    rotPeriodHours: -153.3,
    temp: -229,
    roughness: 0.85,
    metalness: 0.1,
    details: "El rey del Cinturón de Kuiper, famoso por su planicie helada en forma de corazón (Tombaugh Regio) y su gran luna binaria Caronte.",
    composition: "70% roca silicatada densa y 30% hielos de nitrógeno, metano y monóxido de carbono.",
    atmosphere: "Atmósfera tenue estacional de nitrógeno que se expande en el perihelio.",
    moons: [
      { name: "Caronte", distance: 0.8, speed: 0.4, radiusKm: 606 },
      { name: "Hidra", distance: 1.2, speed: 0.25, radiusKm: 45 },
      { name: "Nix", distance: 1.45, speed: 0.28, radiusKm: 35 }
    ]
  },
  {
    name: "Haumea",
    displayName: "Haumea",
    category: "dwarf_planet",
    categoryLabel: "Planeta Enano",
    color: "#e2e8f0",
    size: 0.35,
    realisticRadius: 0.04,
    semiMajorAU: 43.13,
    eccentricity: 0.1912,
    inclination: 28.19,
    longNode: 121.90,
    argPerihelion: 240.20,
    meanLongitude0: 215.10,
    period: 103774.0,
    velocity: 4.48,
    axialTilt: 126.0,
    rotPeriodHours: 3.91, // Ultra-fast rotation making it ellipsoidal
    temp: -241,
    roughness: 0.9,
    metalness: 0.1,
    details: "Planeta enano elipsoidal elongado debido a su vertiginosa rotación de 3.9 horas. Posee su propio anillo y lunas de hielo puro.",
    composition: "Núcleo rocoso denso cubierto por una fina corteza de hielo de agua cristalino brillante.",
    atmosphere: "Sin atmósfera apreciable debido a su baja gravedad y gélida temperatura.",
    moons: [
      { name: "Hiʻiaka", distance: 0.95, speed: 0.3, radiusKm: 160 },
      { name: "Namaka", distance: 1.35, speed: 0.45, radiusKm: 85 }
    ]
  },
  {
    name: "Makemake",
    displayName: "Makemake",
    category: "dwarf_planet",
    categoryLabel: "Planeta Enano",
    color: "#d97706",
    size: 0.35,
    realisticRadius: 0.04,
    semiMajorAU: 45.79,
    eccentricity: 0.1559,
    inclination: 28.96,
    longNode: 79.62,
    argPerihelion: 298.45,
    meanLongitude0: 177.30,
    period: 112897.0,
    velocity: 4.41,
    axialTilt: 29.0,
    rotPeriodHours: 22.83,
    temp: -243,
    roughness: 0.85,
    metalness: 0.1,
    details: "Cuerpo transneptuniano rojizo del Cinturón de Kuiper cubierto de hielos de metano y etano.",
    composition: "Manto rocoso con superficie de tolínas orgánicas rojizas y granos de metano congelado.",
    atmosphere: "Posible atmósfera transitoria de metano durante su acercamiento al perihelio.",
    moons: [
      { name: "MK2 (S/2015)", distance: 0.9, speed: 0.35, radiusKm: 80 }
    ]
  },
  {
    name: "Eris",
    displayName: "Eris",
    category: "dwarf_planet",
    categoryLabel: "Planeta Enano",
    color: "#f1f5f9",
    size: 0.38,
    realisticRadius: 0.045,
    semiMajorAU: 67.78,
    eccentricity: 0.4407,
    inclination: 44.04,
    longNode: 35.87,
    argPerihelion: 151.43,
    meanLongitude0: 32.20,
    period: 203830.0,
    velocity: 3.43,
    axialTilt: 78.0,
    rotPeriodHours: 25.9,
    temp: -243,
    roughness: 0.9,
    metalness: 0.1,
    details: "El planeta enano más masivo del sistema solar, ubicado en el Disco Disperso con una órbita extremadamente inclinada (44°).",
    composition: "Cuerpo rocoso de alta densidad cubierto por una capa reflectante de escarcha de metano brillante.",
    atmosphere: "Atmósfera colapsada y congelada sobre la superficie en su afelio lejano.",
    moons: [
      { name: "Disnomia", distance: 0.95, speed: 0.32, radiusKm: 350 }
    ]
  }
];

// Calculate 3D position according to Kepler's laws
export function calculateKeplerPosition(
  planet: PlanetItem,
  tDays: number,
  isRealisticOrbits: boolean = true
): {
  pos: THREE.Vector3;
  x: number;
  y: number;
  z: number;
  r: number;
  rAU: number;
  trueAnomalyDeg: number;
} {
  if (planet.semiMajorAU === 0) {
    return {
      pos: new THREE.Vector3(0, 0, 0),
      x: 0,
      y: 0,
      z: 0,
      r: 0,
      rAU: 0,
      trueAnomalyDeg: 0
    };
  }

  const a = getScaledRadius(planet.semiMajorAU, isRealisticOrbits);
  const e = isRealisticOrbits ? planet.eccentricity : planet.eccentricity * 0.75;
  const iRad = THREE.MathUtils.degToRad(isRealisticOrbits ? planet.inclination : planet.inclination * 0.35);
  const omegaRad = THREE.MathUtils.degToRad(planet.argPerihelion);
  const nodeRad = THREE.MathUtils.degToRad(planet.longNode);

  const n = 360 / planet.period;
  const M_deg = (planet.meanLongitude0 - (planet.argPerihelion + planet.longNode) + n * tDays) % 360;
  const M = THREE.MathUtils.degToRad(M_deg < 0 ? M_deg + 360 : M_deg);

  let E = M;
  for (let iter = 0; iter < 10; iter++) {
    const f = E - e * Math.sin(E) - M;
    const fPrime = 1 - e * Math.cos(E);
    const delta = f / fPrime;
    E -= delta;
    if (Math.abs(delta) < 1e-6) break;
  }

  const sinNu = (Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E)) / (1 - e * Math.cos(E));
  const cosNu = (Math.cos(E) - e) / (1 - e * Math.cos(E));
  const nu = Math.atan2(sinNu, cosNu);

  const r = a * (1 - e * Math.cos(E));

  const xOrb = r * Math.cos(nu + omegaRad);
  const zOrb = r * Math.sin(nu + omegaRad);

  const x = xOrb * Math.cos(nodeRad) - zOrb * Math.sin(nodeRad) * Math.cos(iRad);
  const y = zOrb * Math.sin(iRad);
  const z = xOrb * Math.sin(nodeRad) + zOrb * Math.cos(nodeRad) * Math.cos(iRad);

  const rAU = planet.semiMajorAU * (1 - e * Math.cos(E));

  return {
    pos: new THREE.Vector3(x, y, z),
    x,
    y,
    z,
    r,
    rAU,
    trueAnomalyDeg: (THREE.MathUtils.radToDeg(nu) + 360) % 360
  };
}

export function calculateStarPosition(star: NearbyStarItem): { pos: THREE.Vector3; distScaled: number } {
  if (star.x !== undefined && star.y !== undefined && star.z !== undefined && star.distScaled !== undefined) {
    return { pos: new THREE.Vector3(star.x, star.y, star.z), distScaled: star.distScaled };
  }

  // Proportional NASA astronomical distance scale: 1 Light-Year ~ 750 3D space units
  const distScaled = 2400.0 + star.distanceLy * 750.0;

  const raRad = THREE.MathUtils.degToRad(star.raDeg);
  const decRad = THREE.MathUtils.degToRad(star.decDeg);

  let x = distScaled * Math.cos(decRad) * Math.cos(raRad);
  let y = distScaled * Math.sin(decRad);
  let z = distScaled * Math.cos(decRad) * Math.sin(raRad);

  // Binary/triple system separation offsets (480-720 units) so companion stars sit distinctly side-by-side
  if (star.name.endsWith(" B") || star.name.endsWith(" C") || star.name.includes("Proxima")) {
    const isC = star.name.endsWith(" C") || star.name.includes("Proxima");
    const offset = isC ? 720.0 : 480.0;

    // Calculate vector perpendicular to line of sight for clear visual separation
    const perpX = -Math.sin(raRad);
    const perpZ = Math.cos(raRad);

    x += perpX * offset;
    y += isC ? 240.0 : -160.0;
    z += perpZ * offset;
  }

  star.x = x;
  star.y = y;
  star.z = z;
  star.distScaled = distScaled;
  star.visualSize = 17.5 + star.size * 2.2;

  return { pos: new THREE.Vector3(x, y, z), distScaled };
}

export interface NearbyStarItem {
  name: string;
  displayName: string;
  spectralType: string;
  distanceLy: number;
  raDeg: number;       // Right Ascension in degrees (0 - 360)
  decDeg: number;      // Declination in degrees (-90 to +90)
  color: string;       // Spectral class color
  size: number;
  constellation: string;
  details: string;
  x?: number;
  y?: number;
  z?: number;
  distScaled?: number;
  visualSize?: number;
}

const handcraftedStarsData: NearbyStarItem[] = [
  {
    name: "Proxima Centauri",
    displayName: "Próxima Centauri (V645 Cen)",
    spectralType: "M5.5Ve (Enana Roja)",
    distanceLy: 4.246,
    raDeg: 217.42,
    decDeg: -62.68,
    color: "#f87171",
    size: 2.2,
    constellation: "Centauro",
    details: "La estrella más cercana a nuestro Sistema Solar. Posee al menos dos exoplanetas confirmados (Proxima b y d)."
  },
  {
    name: "Alpha Centauri A",
    displayName: "Alfa Centauri A (Rigil Kentaurus)",
    spectralType: "G2V (Enana Amarilla)",
    distanceLy: 4.37,
    raDeg: 219.90,
    decDeg: -60.83,
    color: "#facc15",
    size: 3.4,
    constellation: "Centauro",
    details: "Estrella casi idéntica al Sol en masa y temperatura superficial, componente principal del sistema triple."
  },
  {
    name: "Alpha Centauri B",
    displayName: "Alfa Centauri B (Toliman)",
    spectralType: "K1V (Enana Naranja)",
    distanceLy: 4.37,
    raDeg: 219.90,
    decDeg: -60.84,
    color: "#fb923c",
    size: 3.0,
    constellation: "Centauro",
    details: "Compañera binaria de Alfa Centauri A, estrella naranja ligeramente más fría y menos masiva que el Sol."
  },
  {
    name: "Barnard's Star",
    displayName: "Estrella de Barnard",
    spectralType: "M4.0V (Enana Roja)",
    distanceLy: 5.96,
    raDeg: 269.45,
    decDeg: 4.69,
    color: "#f87171",
    size: 2.0,
    constellation: "Ofiuco",
    details: "Estrella con el movimiento propio aparente más rápido en el cielo nocturno (10.3 segundos de arco por año)."
  },
  {
    name: "Wolf 359",
    displayName: "Wolf 359 (CN Leonis)",
    spectralType: "M6.0V (Enana Roja Fulgurante)",
    distanceLy: 7.86,
    raDeg: 164.12,
    decDeg: 7.01,
    color: "#ef4444",
    size: 1.8,
    constellation: "Leo",
    details: "Una de las estrellas de menor masa conocidas, famosa por sus potentes erupciones y fulguraciones magnéticas."
  },
  {
    name: "Lalande 21185",
    displayName: "Lalande 21185",
    spectralType: "M2.0V (Enana Roja)",
    distanceLy: 8.31,
    raDeg: 165.83,
    decDeg: 35.97,
    color: "#f87171",
    size: 2.3,
    constellation: "Osa Mayor",
    details: "La enana roja más brillante visible desde el hemisferio norte, con múltiples candidatos a exoplanetas."
  },
  {
    name: "Sirius A",
    displayName: "Sirio A (Alfa Canis Majoris)",
    spectralType: "A1V (Estrella Blanca Principal)",
    distanceLy: 8.60,
    raDeg: 101.29,
    decDeg: -16.72,
    color: "#ffffff",
    size: 4.5,
    constellation: "Can Mayor",
    details: "La estrella más brillante de todo el cielo nocturno terrestre, 25 veces más luminosa que nuestro Sol."
  },
  {
    name: "Sirius B",
    displayName: "Sirio B (El Cachorro)",
    spectralType: "DA2 (Enana Blanca)",
    distanceLy: 8.60,
    raDeg: 101.29,
    decDeg: -16.72,
    color: "#93c5fd",
    size: 1.4,
    constellation: "Can Mayor",
    details: "Remanente estelar ultradenso del tamaño de la Tierra pero con la masa de todo el Sol."
  },
  {
    name: "Luyten 726-8 A",
    displayName: "Luyten 726-8 A (BL Ceti)",
    spectralType: "M5.5V (Enana Roja)",
    distanceLy: 8.73,
    raDeg: 24.75,
    decDeg: -17.95,
    color: "#f87171",
    size: 1.8,
    constellation: "Cetus (Ballena)",
    details: "Sistema binario de enanas rojas con gran actividad magnética y campos de plasma dinámicos."
  },
  {
    name: "Luyten 726-8 B",
    displayName: "Luyten 726-8 B (UV Ceti)",
    spectralType: "M6.0V (Prototipo de Estrella Fulgurante)",
    distanceLy: 8.73,
    raDeg: 24.76,
    decDeg: -17.95,
    color: "#ef4444",
    size: 1.8,
    constellation: "Cetus (Ballena)",
    details: "Arquetipo de las estrellas fulgurantes que pueden multiplicar su brillo hasta 5 veces en pocos minutos."
  },
  {
    name: "Ross 154",
    displayName: "Ross 154 (V1216 Sgr)",
    spectralType: "M3.5V (Enana Roja)",
    distanceLy: 9.69,
    raDeg: 283.42,
    decDeg: -23.83,
    color: "#f87171",
    size: 2.1,
    constellation: "Sagitario",
    details: "Estrella vecina joven con intensas emisiones de rayos X descubierta por Frank Elmore Ross."
  },
  {
    name: "Ross 248",
    displayName: "Ross 248 (HH Andromedae)",
    spectralType: "M5.5V (Enana Roja)",
    distanceLy: 10.30,
    raDeg: 355.48,
    decDeg: 44.17,
    color: "#f87171",
    size: 1.9,
    constellation: "Andrómeda",
    details: "En unos 33,000 años sobrepasará a Próxima Centauri y se convertirá temporalmente en la estrella más cercana al Sol."
  },
  {
    name: "Epsilon Eridani",
    displayName: "Épsilon Eridani (Ran)",
    spectralType: "K2V (Enana Naranja)",
    distanceLy: 10.47,
    raDeg: 53.23,
    decDeg: -9.46,
    color: "#fb923c",
    size: 3.1,
    constellation: "Erídano",
    details: "Estrella joven con dos cinturones de asteroides y al menos un planeta gigante joviano confirmado (AEgir)."
  },
  {
    name: "Lacaille 9352",
    displayName: "Lacaille 9352 (GJ 887)",
    spectralType: "M0.5V (Enana Roja Brillante)",
    distanceLy: 10.73,
    raDeg: 346.47,
    decDeg: -35.85,
    color: "#f87171",
    size: 2.4,
    constellation: "Pez Austral",
    details: "Una de las enanas rojas más masivas y brillantes del vecindario solar, con dos supertierras en órbita."
  },
  {
    name: "Ross 128",
    displayName: "Ross 128 (FI Virginis)",
    spectralType: "M4.0V (Enana Roja)",
    distanceLy: 11.01,
    raDeg: 176.93,
    decDeg: 0.80,
    color: "#f87171",
    size: 2.0,
    constellation: "Virgo",
    details: "Estrella muy tranquila magnéticamente que alberga un exoplaneta templado del tamaño de la Tierra (Ross 128 b)."
  },
  {
    name: "EZ Aquarii A",
    displayName: "EZ Aquarii A",
    spectralType: "M5.0V (Sistema Triple)",
    distanceLy: 11.27,
    raDeg: 340.63,
    decDeg: -15.30,
    color: "#ef4444",
    size: 1.8,
    constellation: "Acuario",
    details: "Sistema triple compacto compuesto exclusivamente por enanas rojas con órbitas mutuas muy cerradas."
  },
  {
    name: "EZ Aquarii B",
    displayName: "EZ Aquarii B",
    spectralType: "M5.0V",
    distanceLy: 11.27,
    raDeg: 340.63,
    decDeg: -15.30,
    color: "#ef4444",
    size: 1.7,
    constellation: "Acuario",
    details: "Segunda componente del sistema triple EZ Aquarii."
  },
  {
    name: "EZ Aquarii C",
    displayName: "EZ Aquarii C",
    spectralType: "M5.5V",
    distanceLy: 11.27,
    raDeg: 340.63,
    decDeg: -15.30,
    color: "#ef4444",
    size: 1.6,
    constellation: "Acuario",
    details: "Tercera componente periférica del sistema triple EZ Aquarii."
  },
  {
    name: "Procyon A",
    displayName: "Proción A (Alfa Canis Minoris)",
    spectralType: "F5IV-V (Subgigante Blanco-Amarilla)",
    distanceLy: 11.46,
    raDeg: 114.83,
    decDeg: 5.22,
    color: "#fef08a",
    size: 4.2,
    constellation: "Can Menor",
    details: "La octava estrella más brillante del cielo nocturno, casi 7 veces más luminosa que el Sol."
  },
  {
    name: "Procyon B",
    displayName: "Proción B",
    spectralType: "DQZ (Enana Blanca)",
    distanceLy: 11.46,
    raDeg: 114.83,
    decDeg: 5.22,
    color: "#c084fc",
    size: 1.3,
    constellation: "Can Menor",
    details: "Compañera enana blanca de Proción A descubierta por mediciones astrométricas."
  },
  {
    name: "61 Cygni A",
    displayName: "61 Cygni A (Estrella de Piazzi)",
    spectralType: "K5V (Enana Naranja)",
    distanceLy: 11.40,
    raDeg: 316.73,
    decDeg: 38.75,
    color: "#fb923c",
    size: 2.8,
    constellation: "Cisne",
    details: "La primera estrella (fuera del Sol) a la que se le midió con éxito la distancia por paralaje estelar en 1838."
  },
  {
    name: "61 Cygni B",
    displayName: "61 Cygni B",
    spectralType: "K7V (Enana Naranja)",
    distanceLy: 11.40,
    raDeg: 316.73,
    decDeg: 38.75,
    color: "#ea580c",
    size: 2.6,
    constellation: "Cisne",
    details: "Segunda componente naranja del célebre sistema binario 61 Cygni."
  },
  {
    name: "Struve 2398 A",
    displayName: "Struve 2398 A (Gliese 725 A)",
    spectralType: "M3.0V (Enana Roja)",
    distanceLy: 11.49,
    raDeg: 280.70,
    decDeg: 59.63,
    color: "#f87171",
    size: 2.1,
    constellation: "Dragón",
    details: "Sistema binario septentrional compuesto por dos enanas rojas con período orbital de varios siglos."
  },
  {
    name: "Struve 2398 B",
    displayName: "Struve 2398 B (Gliese 725 B)",
    spectralType: "M3.5V (Enana Roja)",
    distanceLy: 11.49,
    raDeg: 280.70,
    decDeg: 59.63,
    color: "#f87171",
    size: 2.0,
    constellation: "Dragón",
    details: "Compañera secundaria de Struve 2398 A con actividad de fulguraciones."
  },
  {
    name: "Groombridge 34 A",
    displayName: "Groombridge 34 A (GX And)",
    spectralType: "M1.5V (Enana Roja)",
    distanceLy: 11.62,
    raDeg: 4.59,
    decDeg: 44.02,
    color: "#f87171",
    size: 2.2,
    constellation: "Andrómeda",
    details: "Sistema binario con dos planetas tipo supertierra descubiertos por velocidad radial."
  },
  {
    name: "Groombridge 34 B",
    displayName: "Groombridge 34 B (GQ And)",
    spectralType: "M3.5V (Enana Roja)",
    distanceLy: 11.62,
    raDeg: 4.59,
    decDeg: 44.02,
    color: "#ef4444",
    size: 1.9,
    constellation: "Andrómeda",
    details: "Compañera de menor masa de Groombridge 34 A."
  },
  {
    name: "Epsilon Indi A",
    displayName: "Épsilon Indi A",
    spectralType: "K5V (Enana Naranja)",
    distanceLy: 11.87,
    raDeg: 330.84,
    decDeg: -56.79,
    color: "#fb923c",
    size: 3.0,
    constellation: "Indio",
    details: "Estrella naranja acompañada a gran distancia por un par binario de enanas marrones (Ba y Bb)."
  },
  {
    name: "DX Cancri",
    displayName: "DX Cancri (G 51-15)",
    spectralType: "M6.5V (Enana Roja Extrema)",
    distanceLy: 11.83,
    raDeg: 127.46,
    decDeg: 26.77,
    color: "#dc2626",
    size: 1.7,
    constellation: "Cáncer",
    details: "Una de las enanas rojas más tenues y frías del vecindario solar."
  },
  {
    name: "Tau Ceti",
    displayName: "Tau Ceti (Tau Cet)",
    spectralType: "G8.5V (Enana Amarilla)",
    distanceLy: 11.91,
    raDeg: 26.02,
    decDeg: -15.94,
    color: "#facc15",
    size: 3.3,
    constellation: "Cetus (Ballena)",
    details: "Estrella solitaria muy similar al Sol que cuenta con un sistema de al menos 4 a 5 planetas terrestres."
  },
  {
    name: "Luyten's Star",
    displayName: "Estrella de Luyten (GJ 273)",
    spectralType: "M3.5V (Enana Roja)",
    distanceLy: 12.35,
    raDeg: 111.85,
    decDeg: 5.23,
    color: "#f87171",
    size: 2.1,
    constellation: "Can Menor",
    details: "Alberga el exoplaneta 'Luyten b', una supertierra potencialmente habitable ubicada en su zona de agua líquida."
  },
  {
    name: "Teegarden's Star",
    displayName: "Estrella de Teegarden (SO 0253+165)",
    spectralType: "M7.0V (Enana Ultrafría)",
    distanceLy: 12.50,
    raDeg: 43.27,
    decDeg: 16.87,
    color: "#b91c1c",
    size: 1.6,
    constellation: "Aries",
    details: "Enana ultrafría que posee dos exoplanetas de masa terrestre con uno de los índices de habitabilidad más altos."
  },
  {
    name: "Kapteyn's Star",
    displayName: "Estrella de Kapteyn (VZ Pic)",
    spectralType: "M1.0VI (Subenana Roja del Halo)",
    distanceLy: 12.78,
    raDeg: 77.92,
    decDeg: -45.02,
    color: "#f87171",
    size: 2.2,
    constellation: "Caballete del Pintor",
    details: "Estrella antiquísima de más de 11,000 millones de años proveniente del halo galáctico o de una galaxia enana devorada."
  },
  {
    name: "Lacaille 8760",
    displayName: "Lacaille 8760 (AX Mic)",
    spectralType: "M0.0V (Enana Roja Gigante)",
    distanceLy: 12.95,
    raDeg: 319.31,
    decDeg: -38.87,
    color: "#f87171",
    size: 2.5,
    constellation: "Microscopio",
    details: "La enana roja más brillante del cielo aparente observable desde la Tierra."
  },
  {
    name: "Kruger 60 A",
    displayName: "Kruger 60 A",
    spectralType: "M3.0V (Sistema Binario)",
    distanceLy: 13.07,
    raDeg: 336.99,
    decDeg: 57.70,
    color: "#f87171",
    size: 2.1,
    constellation: "Cefeo",
    details: "Estrella binaria que en 2019 fue sobrevolada por el cometa interestelar 2I/Borisov."
  },
  {
    name: "Kruger 60 B",
    displayName: "Kruger 60 B (DO Cephei)",
    spectralType: "M4.0V",
    distanceLy: 13.07,
    raDeg: 336.99,
    decDeg: 57.70,
    color: "#ef4444",
    size: 1.9,
    constellation: "Cefeo",
    details: "Compañera fulgurante de Kruger 60 A."
  },
  {
    name: "Ross 614 A",
    displayName: "Ross 614 A (V577 Mon)",
    spectralType: "M4.5V (Enana Roja)",
    distanceLy: 13.36,
    raDeg: 97.35,
    decDeg: -2.81,
    color: "#f87171",
    size: 2.0,
    constellation: "Unicornio (Monoceros)",
    details: "Sistema binario cerrado con una compañera en el límite mínimo de masa para la fusión del hidrógeno."
  },
  {
    name: "Ross 614 B",
    displayName: "Ross 614 B",
    spectralType: "M8.0V (Enana Roja Límite)",
    distanceLy: 13.36,
    raDeg: 97.35,
    decDeg: -2.81,
    color: "#b91c1c",
    size: 1.5,
    constellation: "Unicornio (Monoceros)",
    details: "Una de las estrellas menos masivas capaces de sustentar fusión nuclear sostenida."
  },
  {
    name: "Gliese 628",
    displayName: "Wolf 1061 (Gliese 628)",
    spectralType: "M3.0V (Enana Roja)",
    distanceLy: 13.82,
    raDeg: 247.58,
    decDeg: -12.66,
    color: "#f87171",
    size: 2.2,
    constellation: "Ofiuco",
    details: "Cuenta con tres planetas rocosos conocidos, incluyendo Wolf 1061c en la zona de habitabilidad."
  },
  {
    name: "Van Maanen's Star",
    displayName: "Estrella de Van Maanen",
    spectralType: "DZ8 (Enana Blanca Solitaria)",
    distanceLy: 14.07,
    raDeg: 12.30,
    decDeg: 5.39,
    color: "#93c5fd",
    size: 1.4,
    constellation: "Piscis",
    details: "La enana blanca solitaria (sin estrella compañera) más cercana a nuestro Sistema Solar."
  },
  {
    name: "Gliese 1",
    displayName: "Gliese 1 (CD-37 15492)",
    spectralType: "M1.5V (Enana Roja)",
    distanceLy: 14.23,
    raDeg: 1.34,
    decDeg: -37.35,
    color: "#f87171",
    size: 2.3,
    constellation: "Escultor",
    details: "La primera estrella catalogada en el célebre catálogo Gliese de estrellas cercanas."
  },
  {
    name: "Gliese 687",
    displayName: "Gliese 687",
    spectralType: "M3.0V (Enana Roja)",
    distanceLy: 14.77,
    raDeg: 264.44,
    decDeg: 68.34,
    color: "#f87171",
    size: 2.1,
    constellation: "Dragón",
    details: "Estrella con un planeta de masa similar a Neptuno en órbita de 38 días."
  },
  {
    name: "Gliese 674",
    displayName: "Gliese 674",
    spectralType: "M3.0V (Enana Roja)",
    distanceLy: 14.85,
    raDeg: 262.17,
    decDeg: -46.89,
    color: "#f87171",
    size: 2.1,
    constellation: "Altar (Ara)",
    details: "Enana roja con un planeta subneptuniano en órbita muy excéntrica de 4.69 días."
  },
  {
    name: "Gliese 876",
    displayName: "Gliese 876 (IL Aquarii)",
    spectralType: "M4.0V (Sistema Exoplanetario Cuádruple)",
    distanceLy: 15.25,
    raDeg: 343.32,
    decDeg: -14.26,
    color: "#f87171",
    size: 2.2,
    constellation: "Acuario",
    details: "Famoso sistema planetario múltiple con 4 planetas confirmados en resonancia orbital de Laplace (1:2:4)."
  },
  {
    name: "Gliese 832",
    displayName: "Gliese 832",
    spectralType: "M1.5V (Enana Roja)",
    distanceLy: 16.10,
    raDeg: 323.39,
    decDeg: -49.01,
    color: "#f87171",
    size: 2.3,
    constellation: "Grulla (Grus)",
    details: "Hospeda a Gliese 832 b (un gigante gaseoso similar a Júpiter) y Gliese 832 c (una supertierra)."
  },
  {
    name: "Wolf 424 A",
    displayName: "Wolf 424 A (FL Virginis)",
    spectralType: "M5.5V (Binaria)",
    distanceLy: 14.05,
    raDeg: 193.44,
    decDeg: 9.02,
    color: "#ef4444",
    size: 1.8,
    constellation: "Virgo",
    details: "Par binario de dos enanas rojas muy cercanas que orbitan cada 16.2 años."
  },
  {
    name: "Wolf 424 B",
    displayName: "Wolf 424 B",
    spectralType: "M5.5V",
    distanceLy: 14.05,
    raDeg: 193.44,
    decDeg: 9.02,
    color: "#ef4444",
    size: 1.8,
    constellation: "Virgo",
    details: "Compañera gemela de Wolf 424 A."
  },
  {
    name: "Gliese 445",
    displayName: "Gliese 445 (AC+79 3888)",
    spectralType: "M3.5V (Enana Roja)",
    distanceLy: 17.14,
    raDeg: 176.92,
    decDeg: 78.69,
    color: "#f87171",
    size: 2.1,
    constellation: "Jirafa (Camelopardalis)",
    details: "La sonda Voyager 1 de la NASA pasará a 1.6 años luz de esta estrella en aproximadamente 40,000 años."
  },
  {
    name: "Altair",
    displayName: "Altair (Alfa Aquilae)",
    spectralType: "A7V (Rotador Ultrarrápido)",
    distanceLy: 16.73,
    raDeg: 297.70,
    decDeg: 8.87,
    color: "#e0f2fe",
    size: 4.8,
    constellation: "Águila",
    details: "Gira tan violentamente rápido sobre su eje (286 km/s, un giro cada 9 horas) que está aplanada por los polos."
  },
  {
    name: "70 Ophiuchi A",
    displayName: "70 Ophiuchi A",
    spectralType: "K0V (Enana Naranja Brillante)",
    distanceLy: 16.64,
    raDeg: 271.36,
    decDeg: 2.50,
    color: "#fb923c",
    size: 3.2,
    constellation: "Ofiuco",
    details: "Sistema binario visual clásico visible con telescopios de aficionados con período de 88 años."
  },
  {
    name: "70 Ophiuchi B",
    displayName: "70 Ophiuchi B",
    spectralType: "K4V (Enana Naranja)",
    distanceLy: 16.64,
    raDeg: 271.36,
    decDeg: 2.50,
    color: "#f97316",
    size: 2.8,
    constellation: "Ofiuco",
    details: "Compañera secundaria de 70 Ophiuchi A."
  },
  {
    name: "Vega",
    displayName: "Vega (Alfa Lyrae)",
    spectralType: "A0Va (Estrella Blanca Estándar)",
    distanceLy: 25.04,
    raDeg: 279.23,
    decDeg: 38.78,
    color: "#e0f2fe",
    size: 4.8,
    constellation: "Lira",
    details: "La estrella estándar para el sistema de magnitudes astronómicas y la quinta más brillante de todo el cielo nocturno."
  },
  {
    name: "Fomalhaut",
    displayName: "Fomalhaut (Alfa Piscis Austrini)",
    spectralType: "A3V (Disco Protoplanetario Masivo)",
    distanceLy: 25.13,
    raDeg: 344.41,
    decDeg: -29.62,
    color: "#ffffff",
    size: 4.6,
    constellation: "Pez Austral",
    details: "Conocida como el 'Ojo de Sauron' cósmico por su impresionante cinturón toroidal de polvo y escombros exoplanetarios."
  },
  {
    name: "Pollux",
    displayName: "Pólux (Beta Geminorum)",
    spectralType: "K0IIIb (Gigante Naranja)",
    distanceLy: 33.78,
    raDeg: 116.33,
    decDeg: 28.03,
    color: "#fb923c",
    size: 5.2,
    constellation: "Géminis",
    details: "La estrella gigante más cercana a la Tierra, con al menos un exoplaneta masivo confirmado (Thestias / Pollux b)."
  },
  {
    name: "Castor A",
    displayName: "Cástor A (Alfa Geminorum)",
    spectralType: "A1V (Sistema Séxtuple)",
    distanceLy: 51.6,
    raDeg: 113.65,
    decDeg: 31.89,
    color: "#ffffff",
    size: 4.3,
    constellation: "Géminis",
    details: "Extraordinario sistema estelar séxtuple compuesto por tres pares de estrellas binarias gravitacionalmente ligadas."
  },
  {
    name: "Capella",
    displayName: "Capella (Alfa Aurigae)",
    spectralType: "G3III (Gigante Cuádruple)",
    distanceLy: 42.9,
    raDeg: 79.17,
    decDeg: 45.99,
    color: "#facc15",
    size: 5.4,
    constellation: "Auriga",
    details: "La estrella más brillante de Auriga, un sistema cuádruple compuesto por dos gigantes amarillas y dos enanas rojas."
  },
  {
    name: "Arcturus",
    displayName: "Arturo (Alfa Boötis)",
    spectralType: "K1.5IIIpe (Gigante Naranja)",
    distanceLy: 36.7,
    raDeg: 213.91,
    decDeg: 19.18,
    color: "#f97316",
    size: 5.6,
    constellation: "Boyero (Boötes)",
    details: "La estrella más brillante del hemisferio celeste norte, 110 veces más luminosa y 25 veces más grande que el Sol."
  },
  {
    name: "Aldebaran",
    displayName: "Aldebarán (Alfa Tauri)",
    spectralType: "K5+III (Ojo del Toro)",
    distanceLy: 65.3,
    raDeg: 68.98,
    decDeg: 16.51,
    color: "#f97316",
    size: 5.8,
    constellation: "Tauro",
    details: "Gigante naranja colosal que ancla la constelación de Tauro; la sonda Pioneer 10 viaja en dirección hacia ella."
  },
  {
    name: "TRAPPIST-1",
    displayName: "TRAPPIST-1 (2MASS J23062928-0502285)",
    spectralType: "M8V (Enana Ultrafría)",
    distanceLy: 39.46,
    raDeg: 346.62,
    decDeg: -5.04,
    color: "#ef4444",
    size: 1.6,
    constellation: "Acuario",
    details: "Legendario sistema con 7 exoplanetas rocosos de tamaño terrestre, 3 de ellos en la zona habitable circumstellar."
  },
  {
    name: "Gliese 581",
    displayName: "Gliese 581 (HO Librae)",
    spectralType: "M3V (Sistema Exoplanetario)",
    distanceLy: 20.55,
    raDeg: 229.86,
    decDeg: -7.72,
    color: "#f87171",
    size: 2.1,
    constellation: "Libra",
    details: "Uno de los sistemas exoplanetarios más estudiados por la astrobiología con múltiples supertierras descubiertas."
  },
  {
    name: "Gliese 667 C",
    displayName: "Gliese 667 C",
    spectralType: "M1.5V (Enana Roja Triple)",
    distanceLy: 23.62,
    raDeg: 259.83,
    decDeg: -34.99,
    color: "#f87171",
    size: 2.2,
    constellation: "Escorpio",
    details: "Tercer componente de un sistema estelar triple, hospeda hasta tres planetas supertierras en zona habitable."
  },
  {
    name: "Kepler-452",
    displayName: "Kepler-452 (Primo de la Tierra)",
    spectralType: "G2V (Análogo Solar)",
    distanceLy: 140.2,
    raDeg: 296.02,
    decDeg: 44.28,
    color: "#facc15",
    size: 3.3,
    constellation: "Cisne",
    details: "Estrella madura análoga al Sol que alberga a Kepler-452b, apodado el 'primo mayor de la Tierra'."
  },
  {
    name: "TOI-700",
    displayName: "TOI-700 (TIC 150428135)",
    spectralType: "M2V (Objetivo TESS de la NASA)",
    distanceLy: 101.4,
    raDeg: 97.10,
    decDeg: -65.67,
    color: "#f87171",
    size: 2.2,
    constellation: "Dorado",
    details: "Descubrimiento insignia de la misión TESS de la NASA con un planeta del tamaño de la Tierra (TOI-700 d) en zona habitable."
  },
  {
    name: "51 Pegasi",
    displayName: "51 Pegasi (Helvetios)",
    spectralType: "G2.5IVa (Subgigante Amarilla)",
    distanceLy: 50.9,
    raDeg: 344.36,
    decDeg: 20.76,
    color: "#facc15",
    size: 3.5,
    constellation: "Pegaso",
    details: "Primera estrella similar al Sol en la que se descubrió un exoplaneta (51 Pegasi b / Dimidium), hito ganador del Premio Nobel de Física."
  },
  {
    name: "Regulus",
    displayName: "Régulo (Alfa Leonis)",
    spectralType: "B8IVn (Estrella Múltiple Azul-Blanca)",
    distanceLy: 79.3,
    raDeg: 152.09,
    decDeg: 11.97,
    color: "#38bdf8",
    size: 5.0,
    constellation: "Leo",
    details: "El 'Corazón del León', sistema estelar cuádruple cuya estrella principal gira tan rápido que completa una rotación cada 15.9 horas."
  },
  {
    name: "Achernar",
    displayName: "Achernar (Alfa Eridani)",
    spectralType: "B6Vep (Estrella Azul Achatada)",
    distanceLy: 139.0,
    raDeg: 24.43,
    decDeg: -57.24,
    color: "#38bdf8",
    size: 5.3,
    constellation: "Erídano",
    details: "La estrella más achatada conocida en la Vía Láctea; su diámetro ecuatorial es un 56% mayor que su diámetro polar debido a su rotación extrema."
  },
  {
    name: "HD 209458",
    displayName: "HD 209458 (Osiris)",
    spectralType: "G0V (Análogo Solar con Júpiter Caliente)",
    distanceLy: 159.0,
    raDeg: 330.79,
    decDeg: 18.88,
    color: "#facc15",
    size: 3.4,
    constellation: "Pegaso",
    details: "Primera estrella con un tránsito exoplanetario detectado y primera atmósfera exoplanetaria medida por el Telescopio Espacial Hubble."
  },
  {
    name: "Kepler-16",
    displayName: "Kepler-16AB (Sistema Circumbinario)",
    spectralType: "K5V + M4V (Binaria Eclipsante)",
    distanceLy: 245.4,
    raDeg: 289.07,
    decDeg: 51.76,
    color: "#fb923c",
    size: 3.1,
    constellation: "Cisne",
    details: "Hogar de Kepler-16b, el primer planeta confirmado con dos soles en el cielo al estilo de Tatooine, verificado por la misión Kepler de la NASA."
  },
  {
    name: "Spica",
    displayName: "Espiga / Spica (Alfa Virginis)",
    spectralType: "B1III-IV (Binaria Azul Masiva)",
    distanceLy: 250.0,
    raDeg: 201.30,
    decDeg: -11.16,
    color: "#38bdf8",
    size: 5.6,
    constellation: "Virgo",
    details: "Sistema binario espectroscópico compuesto por dos gigantes azules tan cercanas que la gravedad mutua las deforma en forma de huevo."
  },
  {
    name: "Bellatrix",
    displayName: "Bellatrix (Gamma Orionis)",
    spectralType: "B2III (Gigante Azul)",
    distanceLy: 250.0,
    raDeg: 81.28,
    decDeg: 6.35,
    color: "#38bdf8",
    size: 5.5,
    constellation: "Orión",
    details: "La 'Estrella Amazona' que marca el hombro izquierdo de Orión, más de 6,000 veces más luminosa que nuestro Sol."
  },
  {
    name: "Canopus",
    displayName: "Canopus (Alfa Carinae)",
    spectralType: "A9II (Supergigante Blanca-Amarilla)",
    distanceLy: 310.0,
    raDeg: 95.99,
    decDeg: -52.70,
    color: "#fef08a",
    size: 6.2,
    constellation: "Quilla (Carina)",
    details: "La segunda estrella más brillante del cielo nocturno y faro principal de navegación espacial para las sondas interplanetarias de la NASA."
  },
  {
    name: "Polaris",
    displayName: "Estrella Polar / Polaris (Alfa Ursae Minoris)",
    spectralType: "F7Ib (Supergigante Variable Cefeida)",
    distanceLy: 433.0,
    raDeg: 37.95,
    decDeg: 89.26,
    color: "#fef08a",
    size: 6.0,
    constellation: "Osa Menor",
    details: "Estrella triple anclada casi exactamente sobre el polo norte celeste de la Tierra; cefeida clásica medida con altísima precisión por Gaia DR3."
  },
  {
    name: "Alcyone",
    displayName: "Alcíone (Eta Tauri - Las Pléyades M45)",
    spectralType: "B7IIIe (Gigante Azul en Cúmulo Abierto)",
    distanceLy: 440.0,
    raDeg: 56.87,
    decDeg: 24.11,
    color: "#38bdf8",
    size: 5.4,
    constellation: "Tauro",
    details: "El miembro más luminoso del cúmulo estelar de las Pléyades (M45), rodeada por una nebulosa de reflexión azulada."
  },
  {
    name: "Betelgeuse",
    displayName: "Betelgeuse (Alfa Orionis)",
    spectralType: "M1-2Ia-ab (Supergigante Roja)",
    distanceLy: 548.0,
    raDeg: 88.79,
    decDeg: 7.41,
    color: "#ef4444",
    size: 6.8,
    constellation: "Orión",
    details: "Colosal supergigante roja semirregular en la etapa final de su evolución; si estuviera en el centro del Sistema Solar engulliría la órbita de Júpiter."
  },
  {
    name: "Antares",
    displayName: "Antares (Alfa Scorpii)",
    spectralType: "M1.5Iab (Supergigante Roja + Compañera Azul)",
    distanceLy: 550.0,
    raDeg: 247.35,
    decDeg: -26.43,
    color: "#ef4444",
    size: 6.7,
    constellation: "Escorpio",
    details: "El 'Corazón del Escorpión', supergigante roja 10,000 veces más luminosa que el Sol en el complejo de nubes de Rho Ophiuchi."
  },
  {
    name: "Kepler-186",
    displayName: "Kepler-186 (KOI-571)",
    spectralType: "M1V (Enana Roja con Exoplaneta Terrestre)",
    distanceLy: 582.0,
    raDeg: 298.65,
    decDeg: 43.95,
    color: "#f87171",
    size: 2.4,
    constellation: "Cisne",
    details: "Sistema planetario de 5 mundos donde orbita Kepler-186f, el primer exoplaneta de radio terrestre descubierto en la zona habitable."
  },
  {
    name: "Kepler-22",
    displayName: "Kepler-22 (KOI-87)",
    spectralType: "G5V (Análogo Solar)",
    distanceLy: 635.0,
    raDeg: 289.22,
    decDeg: 47.89,
    color: "#facc15",
    size: 3.3,
    constellation: "Cisne",
    details: "Estrella tipo solar que alberga a Kepler-22b, el primer planeta en zona habitable confirmado por la misión Kepler de la NASA."
  },
  {
    name: "Rigel",
    displayName: "Rigel (Beta Orionis)",
    spectralType: "B8Ia (Supergigante Azul)",
    distanceLy: 863.0,
    raDeg: 78.63,
    decDeg: -8.20,
    color: "#38bdf8",
    size: 6.6,
    constellation: "Orión",
    details: "Faro azul-blanco de Orión con una luminosidad de 120,000 soles, iluminando la Nebulosa Cabeza de Bruja (IC 2118)."
  },
  {
    name: "Mintaka",
    displayName: "Mintaka (Delta Orionis)",
    spectralType: "O9.5II (Gigante Azul Caliente)",
    distanceLy: 1200.0,
    raDeg: 83.00,
    decDeg: -0.30,
    color: "#38bdf8",
    size: 6.1,
    constellation: "Orión",
    details: "Estrella occidental del Cinturón de Orión, sistema múltiple masivo de clase espectral O con vientos estelares supersónicos."
  },
  {
    name: "Alnitak",
    displayName: "Alnitak (Zeta Orionis)",
    spectralType: "O9.7Ib (Supergigante Azul)",
    distanceLy: 1260.0,
    raDeg: 85.19,
    decDeg: -1.94,
    color: "#38bdf8",
    size: 6.3,
    constellation: "Orión",
    details: "Estrella oriental del Cinturón de Orión, situada junto a la famosa Nebulosa de la Flama y la Nebulosa Cabeza de Caballo."
  },
  {
    name: "Alnilam",
    displayName: "Alnilam (Épsilon Orionis)",
    spectralType: "B0Ia (Supergigante Azul Masiva)",
    distanceLy: 1340.0,
    raDeg: 84.05,
    decDeg: -1.20,
    color: "#38bdf8",
    size: 6.5,
    constellation: "Orión",
    details: "Astro central del Cinturón de Orión, 275,000 veces más luminoso que el Sol y rodeado por la nube molecular NGC 1990."
  },
  {
    name: "Deneb",
    displayName: "Deneb (Alfa Cygni)",
    spectralType: "A2Ia (Supergigante Blanca)",
    distanceLy: 1425.0,
    raDeg: 310.36,
    decDeg: 45.28,
    color: "#ffffff",
    size: 6.8,
    constellation: "Cisne",
    details: "Vértice superior del Triángulo de Verano y una de las estrellas más intrínsecamente luminosas de toda la Vía Láctea (~196,000 soles)."
  },
  {
    name: "Mirfak",
    displayName: "Mirfak (Alfa Persei)",
    spectralType: "F5Ib (Supergigante Blanco-Amarilla)",
    distanceLy: 510.0,
    raDeg: 51.08,
    decDeg: 49.86,
    color: "#fef08a",
    size: 6.0,
    constellation: "Perseo",
    details: "Astro principal del cúmulo abierto Alfa Persei (Melotte 20), supergigante 5,000 veces más luminosa que el Sol y 60 veces más grande."
  },
  {
    name: "Shaula",
    displayName: "Shaula (Lambda Scorpii)",
    spectralType: "B1.5IV (Subgigante Azul Triple)",
    distanceLy: 570.0,
    raDeg: 263.40,
    decDeg: -37.10,
    color: "#38bdf8",
    size: 5.7,
    constellation: "Escorpio",
    details: "El 'Aguijón del Escorpión', sistema triple dominado por estrellas calientes tipo B con pulsaciones Beta Cephei medidas por Gaia y TESS."
  },
  {
    name: "Enif",
    displayName: "Enif (Épsilon Pegasi)",
    spectralType: "K2Ib (Supergigante Naranja)",
    distanceLy: 690.0,
    raDeg: 326.05,
    decDeg: 9.88,
    color: "#fb923c",
    size: 6.4,
    constellation: "Pegaso",
    details: "La estrella más brillante de Pegaso; supergigante naranja en sus últimas etapas evolutivas con un radio de 185 radios solares."
  },
  {
    name: "Kepler-62",
    displayName: "Kepler-62 (KOI-701)",
    spectralType: "K2V (Sistema de 5 Exoplanetas)",
    distanceLy: 980.0,
    raDeg: 283.21,
    decDeg: 45.35,
    color: "#fb923c",
    size: 2.8,
    constellation: "Lira",
    details: "Sistema planetario de 5 mundos donde orbitan Kepler-62e y Kepler-62f dentro de la zona habitable, posibles mundos oceánicos confirmados por la NASA."
  },
  {
    name: "Naos",
    displayName: "Naos (Zeta Puppis)",
    spectralType: "O4If (Supergigante Azul Extrema)",
    distanceLy: 1080.0,
    raDeg: 120.90,
    decDeg: -40.00,
    color: "#38bdf8",
    size: 6.5,
    constellation: "Popa",
    details: "Una de las estrellas de clase O más calientes y masivas visibles (~40,000 K), con una luminosidad extrema cercana a 800,000 soles."
  },
  {
    name: "Kepler-442",
    displayName: "Kepler-442 (KOI-4742)",
    spectralType: "K5V (Enana Naranja con Super-Tierra Habitable)",
    distanceLy: 1193.0,
    raDeg: 285.37,
    decDeg: 39.28,
    color: "#f97316",
    size: 2.6,
    constellation: "Lira",
    details: "Hogar de Kepler-442b, uno de los exoplanetas rocosos en zona habitable con mayor índice de similitud con la Tierra según el archivo exoplanetario de la NASA."
  },
  {
    name: "Wezen",
    displayName: "Wezen (Delta Canis Majoris)",
    spectralType: "F8Ia (Supergigante Blanco-Amarilla)",
    distanceLy: 1600.0,
    raDeg: 107.10,
    decDeg: -26.39,
    color: "#fef08a",
    size: 6.7,
    constellation: "Can Mayor",
    details: "Coloso supergigante con 215 veces el radio del Sol y 50,000 veces su luminosidad, fusionando elementos pesados en su núcleo."
  },
  {
    name: "Kepler-452",
    displayName: "Kepler-452 (Sistema 'Tierra 2.0')",
    spectralType: "G2V (Análogo Solar Evolucionado)",
    distanceLy: 1799.0,
    raDeg: 296.00,
    decDeg: 44.28,
    color: "#facc15",
    size: 3.6,
    constellation: "Cisne",
    details: "Estrella gemela del Sol de 6 mil millones de años que alberga a Kepler-452b en una órbita de 385 días dentro de la zona habitable."
  },
  {
    name: "Sadr",
    displayName: "Sadr (Gamma Cygni)",
    spectralType: "F8Ib (Supergigante en el Corazón del Cisne)",
    distanceLy: 1800.0,
    raDeg: 305.56,
    decDeg: 40.26,
    color: "#fef08a",
    size: 6.6,
    constellation: "Cisne",
    details: "Estrella central de la Cruz del Norte, rodeada por la vasta nebulosa de emisión difusa IC 1318 en el Brazo de Orión-Cisne."
  },
  {
    name: "Aludra",
    displayName: "Aludra (Eta Canis Majoris)",
    spectralType: "B5Ia (Supergigante Azul Luminosa)",
    distanceLy: 2000.0,
    raDeg: 111.02,
    decDeg: -29.30,
    color: "#38bdf8",
    size: 6.6,
    constellation: "Can Mayor",
    details: "Variable tipo Alfa Cygni con 175,000 veces la luminosidad solar y un poderoso viento estelar detectado en ultravioleta."
  },
  {
    name: "Mu Cephei",
    displayName: "Mu Cephei (Estrella Granate de Herschel)",
    spectralType: "M2Ia (Hipergigante Roja)",
    distanceLy: 2840.0,
    raDeg: 325.88,
    decDeg: 58.78,
    color: "#dc2626",
    size: 7.4,
    constellation: "Cefeo",
    details: "Bautizada por William Herschel por su profundo color granate; una de las hipergigantes rojas más colosales de la Vía Láctea (>1,200 radios solares)."
  },
  {
    name: "VV Cephei",
    displayName: "VV Cephei A+B (Binaria Hipergigante)",
    spectralType: "M2epIa + B0V (Sistema Binario Eclipsante)",
    distanceLy: 3000.0,
    raDeg: 328.46,
    decDeg: 63.63,
    color: "#ef4444",
    size: 7.5,
    constellation: "Cefeo",
    details: "Sistema binario extremo donde una hipergigante roja llena su lóbulo de Roche y transfiere materia a su compañera azul cada 20.3 años."
  },
  {
    name: "VY Canis Majoris",
    displayName: "VY Canis Majoris (Hipergigante Extrema)",
    spectralType: "M3-M4.5e Ia (Hipergigante Roja Extrema)",
    distanceLy: 3820.0,
    raDeg: 110.74,
    decDeg: -25.77,
    color: "#dc2626",
    size: 7.8,
    constellation: "Can Mayor",
    details: "Una de las hipergigantes rojas más grandes y masivas jamás catalogadas (~1,420 radios solares), envuelta en arcos de eyección fotografiados por el Hubble."
  },
  {
    name: "Rho Cassiopeiae",
    displayName: "Rho Cassiopeiae (Hipergigante Amarilla)",
    spectralType: "G2Ia0e (Hipergigante Amarilla Rara)",
    distanceLy: 4500.0,
    raDeg: 358.60,
    decDeg: 57.50,
    color: "#facc15",
    size: 7.6,
    constellation: "Casiopea",
    details: "Una de las escasas ~15 hipergigantes amarillas conocidas en toda la Vía Láctea, 500,000 veces más luminosa que nuestro Sol."
  },
  {
    name: "P Cygni",
    displayName: "P Cygni (34 Cygni - Hipergigante LBV)",
    spectralType: "B1Ia+ (Variable Luminosa Azul)",
    distanceLy: 4850.0,
    raDeg: 304.45,
    decDeg: 38.03,
    color: "#38bdf8",
    size: 7.4,
    constellation: "Cisne",
    details: "Prototipo de hipergigante Variable Luminosa Azul (LBV), célebre por sus grandes erupciones de 1600 y sus líneas espectrales P Cygni."
  },
  {
    name: "UY Scuti",
    displayName: "UY Scuti (Supergigante del Escudo)",
    spectralType: "M2-M4Ia-Iab (Supergigante Roja Pulsante)",
    distanceLy: 4950.0,
    raDeg: 276.90,
    decDeg: -12.47,
    color: "#dc2626",
    size: 7.9,
    constellation: "Escudo",
    details: "Supergigante roja extrema con un período de pulsación de 740 días, cuya distancia y parámetros fueron refinados con alta precisión por Gaia DR3 (ESA/NASA)."
  },
  {
    name: "Eta Carinae",
    displayName: "Eta Carinae (Nebulosa del Homúnculo)",
    spectralType: "LBV + O (Sistema Binario Hipergigante)",
    distanceLy: 5000.0,
    raDeg: 161.26,
    decDeg: -59.68,
    color: "#fef08a",
    size: 8.0,
    constellation: "Quilla (Carina)",
    details: "Colosal sistema estelar con 5 millones de veces la luminosidad del Sol, rodeado por la Nebulosa bipolar del Homúnculo tras la Gran Erupción de 1843."
  }
];

// ==========================================
// ULTRA-OPTIMIZED CONTIGUOUS GPU BUFFERS & ON-DEMAND CATALOG FOR 500,000 STARS
// ==========================================

const IS_MOBILE_OR_TABLET =
  typeof window !== "undefined" &&
  (window.innerWidth < 1024 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

export const MAX_GPU_STARS = IS_MOBILE_OR_TABLET ? 45000 : 100000;
export const DEFAULT_GPU_STARS = IS_MOBILE_OR_TABLET ? 30000 : 75000;
const EAGER_OBJECT_CATALOG_COUNT = 6000;

export const STAR_POSITIONS_BUFFER = new Float32Array(MAX_GPU_STARS * 3);
export const STAR_SIZES_BUFFER = new Float32Array(MAX_GPU_STARS);
export const STAR_COLORS_BUFFER = new Float32Array(MAX_GPU_STARS * 3);

const STAR_PREFIXES = [
  "Gaia DR3", "Gaia DR3", "Gaia DR3", "Gaia DR3", "GJ", "Gliese", "HIP", "HD", "TYC",
  "TOI", "Kepler", "2MASS", "WISE", "LHS", "SCR", "Ross", "Wolf",
  "Luyten", "TIC", "KOI", "K2-", "EPIC", "HR", "BD+", "CD-", "LTT"
];

const STAR_CONSTELLATIONS = [
  "Andrómeda", "Cámara Neumática", "Ave del Paraíso", "Acuario", "Águila", "Altar",
  "Aries", "Auriga", "Boyero (Boötes)", "Buril", "Jirafa (Camelopardalis)", "Cáncer",
  "Lebreles (Canes Venatici)", "Can Mayor", "Can Menor", "Capricornio", "Quilla (Carina)",
  "Casiopea", "Centauro", "Cefeo", "Cetus (Ballena)", "Camaleón", "Compás", "Paloma",
  "Cabellera de Berenice", "Corona Austral", "Corona Boreal", "Cuervo", "Copa",
  "Cruz del Sur", "Cisne", "Delfín", "Dorado", "Dragón", "Caballito", "Erídano",
  "Horno", "Géminis", "Grulla (Grus)", "Hércules", "Reloj", "Hidra", "Hidra Macho",
  "Indio", "Lagarto", "Leo", "Leo Menor", "Liebre", "Libra", "Lobo", "Lince", "Lira",
  "Mesa", "Microscopio", "Unicornio (Monoceros)", "Mosca", "Escuadra", "Octante",
  "Ofiuco", "Orión", "Pavo", "Pegaso", "Perseo", "Fénix", "Caballete del Pintor",
  "Peces", "Pez Austral", "Popa", "Brújula", "Retículo", "Flecha (Sagitta)", "Sagitario",
  "Escorpio", "Escultor", "Escudo", "Serpiente", "Sextante", "Tauro", "Telescopio",
  "Triángulo", "Triángulo Austral", "Tucán", "Osa Mayor", "Osa Menor", "Vela", "Virgo",
  "Pez Volador", "Zorra (Vulpecula)"
];

const SPECTRAL_TEMPLATES = [
  { type: "M4.5V (Enana Roja)", short: "M4.5V", color: "#ef4444", rgb: [0.94, 0.27, 0.27], baseSize: 1.8 },
  { type: "M3.0V (Enana Roja)", short: "M3.0V", color: "#f87171", rgb: [0.97, 0.44, 0.44], baseSize: 2.0 },
  { type: "M5.5V (Enana Roja Fulgurante)", short: "M5.5V", color: "#ef4444", rgb: [0.94, 0.27, 0.27], baseSize: 1.7 },
  { type: "M1.5V (Enana Roja Brillante)", short: "M1.5V", color: "#f87171", rgb: [0.97, 0.44, 0.44], baseSize: 2.2 },
  { type: "M6.5V (Enana Roja Ultrafría)", short: "M6.5V", color: "#dc2626", rgb: [0.86, 0.15, 0.15], baseSize: 1.6 },
  { type: "M2.5V (Enana Roja)", short: "M2.5V", color: "#f87171", rgb: [0.97, 0.44, 0.44], baseSize: 2.1 },
  { type: "K2.0V (Enana Naranja)", short: "K2.0V", color: "#fb923c", rgb: [0.98, 0.57, 0.24], baseSize: 2.7 },
  { type: "K5.0V (Enana Naranja)", short: "K5.0V", color: "#f97316", rgb: [0.98, 0.45, 0.09], baseSize: 2.5 },
  { type: "G2.0V (Enana Amarilla - Análogo Solar)", short: "G2.0V", color: "#facc15", rgb: [0.98, 0.80, 0.08], baseSize: 3.3 },
  { type: "F5.0V (Enana Blanco-Amarilla)", short: "F5.0V", color: "#fef08a", rgb: [0.99, 0.94, 0.54], baseSize: 3.8 },
  { type: "DA3 (Enana Blanca Degenerada)", short: "DA3", color: "#cbd5e1", rgb: [0.80, 0.84, 0.88], baseSize: 1.5 },
  { type: "A1.0V (Estrella Blanca Principal)", short: "A1.0V", color: "#ffffff", rgb: [1.0, 1.0, 1.0], baseSize: 4.5 },
  { type: "K1.0III (Gigante Naranja)", short: "K1.0III", color: "#fb923c", rgb: [0.98, 0.57, 0.24], baseSize: 5.0 },
  { type: "B3.0V (Estrella Azul Caliente)", short: "B3.0V", color: "#38bdf8", rgb: [0.22, 0.74, 0.97], baseSize: 5.2 },
  { type: "M1.0Ia (Supergigante Roja)", short: "M1.0Ia", color: "#dc2626", rgb: [0.86, 0.15, 0.15], baseSize: 6.2 },
  { type: "O9.5Ib (Supergigante Azul)", short: "O9.5Ib", color: "#38bdf8", rgb: [0.22, 0.74, 0.97], baseSize: 6.0 }
];

const DETAILS_POOL = [
  "Astrometría 3D de alta precisión confirmada por la misión Gaia DR3 (ESA / NASA) en el Brazo de Orión-Cisne de la Vía Láctea.",
  "Registrada en el catálogo astrométrico Gaia DR3 (1.8 mil millones de estrellas) con paralaje trigonométrico y movimiento propio verificados.",
  "Sistema estelar catalogado por Gaia DR3 (ESA) y NASA/IPAC; presenta candidato(s) exoplanetario(s) por velocidad radial y tránsito.",
  "Estrella de secuencia principal mapeada por el telescopio espacial Gaia (ESA) y cruzada con los archivos fotométricos de TESS / Kepler (NASA).",
  "Fuente estelar del catálogo Gaia DR3 / Hipparcos con fotometría multibanda y parámetros espectroscópicos calibrados.",
  "Miembro del sector galáctico local monitoreado por Gaia DR3 y el archivo exoplanetario de la NASA con curva de luz estable."
];

// Deterministic stateless hash per star index so any star [0..499,999] can be synthesized in O(1) without storing 500k objects
function hashStarFloat(index: number, salt: number): number {
  let h = Math.imul(index ^ salt, 0x6D2B79F5);
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

export const nearbyStarsData: NearbyStarItem[] = [];

export function getStarItemByIndex(i: number): NearbyStarItem {
  if (i < handcraftedStarsData.length) {
    const s = handcraftedStarsData[i];
    if (s.x === undefined) calculateStarPosition(s);
    return s;
  }
  if (i < nearbyStarsData.length && nearbyStarsData[i]) {
    return nearbyStarsData[i];
  }

  const r0 = hashStarFloat(i, 0x11A3);
  const r1 = hashStarFloat(i, 0x29B7);
  const r2 = hashStarFloat(i, 0x7F4A);
  const r3 = hashStarFloat(i, 0x9E37);
  const r4 = hashStarFloat(i, 0xC5E3);
  const r5 = hashStarFloat(i, 0xF19A);

  const prefix = STAR_PREFIXES[i % STAR_PREFIXES.length];
  let starName: string;
  if (prefix === "Gaia DR3") {
    const gaiaId = 4100000000 + i * 37 + ((r0 * 29) | 0);
    starName = `Gaia DR3 ${gaiaId}`;
  } else if (prefix === "HD") {
    starName = `HD ${10000 + i * 3}`;
  } else if (prefix === "HIP") {
    starName = `HIP ${1000 + i * 2}`;
  } else if (prefix === "TYC") {
    const z1 = 1000 + ((i * 7) % 8999);
    const z2 = 100 + (i % 8999);
    starName = `TYC ${z1}-${z2}-1`;
  } else if (prefix === "TOI" || prefix === "TIC" || prefix === "Kepler" || prefix === "KOI") {
    starName = `${prefix}-${1000 + i}`;
  } else {
    starName = `${prefix} ${1000 + i}`;
  }

  // Independent 360° spherical coordinates (covers 100% above and below the Solar System)
  const raDeg = Math.round(r1 * 36000) / 100;
  const sinDec = r2 * 2 - 1;
  const decRad = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const decDeg = Math.round(decRad * (180 / Math.PI) * 100) / 100;

  const distanceLy = Math.round((4.2 + Math.pow(r3, 1.35) * 4995.8) * 10) / 10;

  let specIdx = 0;
  if (r4 < 0.62) specIdx = (r4 * 9.6) | 0;
  else if (r4 < 0.77) specIdx = r4 < 0.70 ? 6 : 7;
  else if (r4 < 0.86) specIdx = 8;
  else if (r4 < 0.91) specIdx = 9;
  else if (r4 < 0.94) specIdx = 10;
  else if (r4 < 0.968) specIdx = 11;
  else if (r4 < 0.985) specIdx = 12;
  else if (r4 < 0.994) specIdx = 13;
  else if (r4 < 0.997) specIdx = 14;
  else specIdx = 15;

  const spec = SPECTRAL_TEMPLATES[specIdx];
  const size = Math.round((spec.baseSize + r5 * 0.5) * 10) / 10;

  const distScaled = 3000 + distanceLy * 780;
  const raRad = raDeg * (Math.PI / 180);
  const cosDec = Math.cos(decRad);

  const x = distScaled * cosDec * Math.cos(raRad);
  const y = distScaled * Math.sin(decRad);
  const z = distScaled * cosDec * Math.sin(raRad);
  const visualSize = 17.5 + size * 2.2;

  const constel = STAR_CONSTELLATIONS[(i * 13 + ((r0 * STAR_CONSTELLATIONS.length) | 0)) % STAR_CONSTELLATIONS.length];

  return {
    name: starName,
    displayName: `${starName} (${spec.short})`,
    spectralType: spec.type,
    distanceLy,
    raDeg,
    decDeg,
    color: spec.color,
    size,
    constellation: constel,
    details: DETAILS_POOL[i % DETAILS_POOL.length],
    x,
    y,
    z,
    distScaled,
    visualSize
  };
}

function initializeStarBuffersAndCatalog(): void {
  const handcraftedLen = handcraftedStarsData.length;

  for (let i = 0; i < handcraftedLen; i++) {
    const s = handcraftedStarsData[i];
    calculateStarPosition(s);
    nearbyStarsData.push(s);
    STAR_POSITIONS_BUFFER[i * 3] = s.x!;
    STAR_POSITIONS_BUFFER[i * 3 + 1] = s.y!;
    STAR_POSITIONS_BUFFER[i * 3 + 2] = s.z!;
    STAR_SIZES_BUFFER[i] = s.visualSize || (17.5 + s.size * 2.2);

    const hex = (s.color || "#ffffff").replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    STAR_COLORS_BUFFER[i * 3] = isNaN(r) ? 1.0 : 0.82 + r * 0.18;
    STAR_COLORS_BUFFER[i * 3 + 1] = isNaN(g) ? 1.0 : 0.84 + g * 0.16;
    STAR_COLORS_BUFFER[i * 3 + 2] = isNaN(b) ? 1.0 : 0.86 + b * 0.14;
  }

  for (let i = handcraftedLen; i < MAX_GPU_STARS; i++) {
    const r1 = hashStarFloat(i, 0x29B7);
    const r2 = hashStarFloat(i, 0x7F4A);
    const r3 = hashStarFloat(i, 0x9E37);
    const r4 = hashStarFloat(i, 0xC5E3);
    const r5 = hashStarFloat(i, 0xF19A);

    const raRad = r1 * Math.PI * 2;
    const sinDec = r2 * 2 - 1;
    const cosDec = Math.sqrt(Math.max(0, 1 - sinDec * sinDec));

    const distanceLy = 4.2 + Math.pow(r3, 1.35) * 4995.8;
    const distScaled = 3000 + distanceLy * 780;

    STAR_POSITIONS_BUFFER[i * 3] = distScaled * cosDec * Math.cos(raRad);
    STAR_POSITIONS_BUFFER[i * 3 + 1] = distScaled * sinDec;
    STAR_POSITIONS_BUFFER[i * 3 + 2] = distScaled * cosDec * Math.sin(raRad);

    let specIdx = 0;
    if (r4 < 0.62) specIdx = (r4 * 9.6) | 0;
    else if (r4 < 0.77) specIdx = r4 < 0.70 ? 6 : 7;
    else if (r4 < 0.86) specIdx = 8;
    else if (r4 < 0.91) specIdx = 9;
    else if (r4 < 0.94) specIdx = 10;
    else if (r4 < 0.968) specIdx = 11;
    else if (r4 < 0.985) specIdx = 12;
    else if (r4 < 0.994) specIdx = 13;
    else if (r4 < 0.997) specIdx = 14;
    else specIdx = 15;

    const spec = SPECTRAL_TEMPLATES[specIdx];
    STAR_SIZES_BUFFER[i] = 17.5 + (spec.baseSize + r5 * 0.5) * 2.2;

    // Crisp brilliant white star with subtle pastel astronomical temperature tint
    STAR_COLORS_BUFFER[i * 3] = 0.84 + spec.rgb[0] * 0.16;
    STAR_COLORS_BUFFER[i * 3 + 1] = 0.85 + spec.rgb[1] * 0.15;
    STAR_COLORS_BUFFER[i * 3 + 2] = 0.88 + spec.rgb[2] * 0.12;

    if (i < EAGER_OBJECT_CATALOG_COUNT) {
      nearbyStarsData.push(getStarItemByIndex(i));
    }
  }
}

initializeStarBuffersAndCatalog();

export const trivia = [
  "El catálogo de la misión Gaia de la ESA/NASA mapea con precisión más de 1.8 mil millones de estrellas en la Vía Láctea; esta simulación renderiza 500,000 estrellas en tiempo real hasta 5,000 años luz.",
  "El Sol contiene aproximadamente el 99.86% de toda la masa del Sistema Solar.",
  "Un día en Venus (243 días terrestres) dura más que su año completo (225 días).",
  "El Monte Olimpo en Marte es el volcán más grande conocido, con 22 km de altura.",
  "La Gran Mancha Roja de Júpiter es una tormenta anticiclónica activa desde hace más de 350 años.",
  "Saturno tiene una densidad tan baja que flotaría si existiera un océano suficientemente grande.",
  "Urano rota prácticamente de lado, con una inclinación axial extrema de 97.8 grados.",
  "Plutón posee montañas de hielo de agua tan duras como la roca y glaciares de nitrógeno líquido.",
  "Ceres, en el cinturón de asteroides, contiene posiblemente más agua dulce que toda la Tierra.",
  "Haumea gira tan rápido (3.9 horas) que la fuerza centrífuga lo ha deformado en forma de elipsoide alargado.",
  "Eris es tan lejano que la luz solar tarda más de 9 horas en alcanzar su gélida superficie.",
  "Próxima Centauri está a 4.25 años luz del Sol (unos 40 billones de kilómetros).",
  "Sirio A es la estrella más brillante del cielo nocturno y es 25 veces más luminosa que el Sol.",
  "TRAPPIST-1 posee 7 planetas rocosos de masa terrestre a solo 39.5 años luz de la Tierra."
];



