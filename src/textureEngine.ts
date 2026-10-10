import * as THREE from "three";

// Detect mobile/tablet once to scale texture resolution appropriately for mobile VRAM
const IS_MOBILE_DEVICE =
  typeof window !== "undefined" &&
  (window.innerWidth < 1024 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

const TEX_WIDTH = IS_MOBILE_DEVICE ? 512 : 1024;
const TEX_HEIGHT = IS_MOBILE_DEVICE ? 256 : 512;

// Cached 128x128 noise tile pattern — 500x faster than running getImageData on 2048x1024 canvases
let cachedNoiseCanvas: HTMLCanvasElement | null = null;

function getNoiseTile(): HTMLCanvasElement {
  if (cachedNoiseCanvas) return cachedNoiseCanvas;
  const tile = document.createElement("canvas");
  tile.width = 128;
  tile.height = 128;
  const tCtx = tile.getContext("2d")!;
  const imgData = tCtx.createImageData(128, 128);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  tCtx.putImageData(imgData, 0, 0);
  cachedNoiseCanvas = tile;
  return tile;
}

function applyFastNoise(ctx: CanvasRenderingContext2D, width: number, height: number, opacity = 0.12) {
  const tile = getNoiseTile();
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = opacity * 0.45;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// 2K High-Definition NASA / Solar System Scope Astronomical Surface Maps
const PLANET_TEXTURE_URLS: Record<string, string> = {
  Sun: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_sun.jpg",
  Mercury: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_mercury.jpg",
  Venus: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_venus_atmosphere.jpg",
  Earth: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_earth_daymap.jpg",
  Moon: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_moon.jpg",
  Mars: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_mars.jpg",
  Jupiter: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_jupiter.jpg",
  Saturn: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_saturn.jpg",
  Uranus: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_uranus.jpg",
  Neptune: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_neptune.jpg",
  Ceres: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_ceres_fictional.jpg",
  Pluto: "https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/plutomap1k.jpg",
  Haumea: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_haumea_fictional.jpg",
  Makemake: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_makemake_fictional.jpg",
  Eris: "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_eris_fictional.jpg"
};

const imageLoader = new THREE.ImageLoader();
imageLoader.setCrossOrigin("anonymous");

const planetTextureCache: Record<string, THREE.CanvasTexture> = {};
const starTextureCache: Record<string, THREE.CanvasTexture> = {};

// Ultra HD Procedural Sun Texture
export function generateSunHDTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0.0, "#ffcf33");
  grad.addColorStop(0.2, "#ff9500");
  grad.addColorStop(0.5, "#ff6a00");
  grad.addColorStop(0.8, "#ff8c00");
  grad.addColorStop(1.0, "#ffb700");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cellCount = IS_MOBILE_DEVICE ? 160 : 320;
  for (let i = 0; i < cellCount; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = (2 + Math.random() * 12) * (canvas.width / 1024);
    ctx.fillStyle = i % 2 === 0 ? "rgba(255, 255, 220, 0.35)" : "rgba(255, 140, 0, 0.25)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  applyFastNoise(ctx, canvas.width, canvas.height, 0.16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const url = PLANET_TEXTURE_URLS["Sun"];
  if (url) {
    imageLoader.load(
      url,
      (img) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        texture.needsUpdate = true;
      },
      undefined,
      () => {}
    );
  }

  return texture;
}

// Ultra HD Earth Photorealistic Texture
export function generateEarthHDTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const sx = canvas.width / 2048;
  const sy = canvas.height / 1024;

  const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  oceanGrad.addColorStop(0, "#102a45");
  oceanGrad.addColorStop(0.5, "#081c30");
  oceanGrad.addColorStop(1, "#102a45");
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const continents = [
    { x: 520, y: 350, rx: 170, ry: 120, land: "#215329", desert: "#997d44" },
    { x: 670, y: 680, rx: 110, ry: 190, land: "#1d6127", desert: "#7d6837" },
    { x: 1340, y: 340, rx: 300, ry: 150, land: "#285c2d", desert: "#a88843" },
    { x: 1070, y: 550, rx: 150, ry: 170, land: "#245c29", desert: "#b08e42" },
    { x: 1660, y: 710, rx: 110, ry: 80, land: "#385827", desert: "#ad7036" },
    { x: 780, y: 180, rx: 70, ry: 50, land: "#dce8f0", desert: "#ffffff" }
  ];

  continents.forEach((c) => {
    ctx.fillStyle = "rgba(24, 130, 160, 0.38)";
    ctx.beginPath();
    ctx.ellipse(c.x * sx, c.y * sy, (c.rx + 24) * sx, (c.ry + 20) * sy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.land;
    ctx.beginPath();
    ctx.ellipse(c.x * sx, c.y * sy, c.rx * sx, c.ry * sy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.desert;
    ctx.beginPath();
    ctx.ellipse(c.x * sx, c.y * sy, c.rx * 0.45 * sx, c.ry * 0.35 * sy, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, 60 * sy);
  ctx.fillRect(0, canvas.height - 75 * sy, canvas.width, 75 * sy);

  applyFastNoise(ctx, canvas.width, canvas.height, 0.14);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const url = PLANET_TEXTURE_URLS["Earth"];
  if (url) {
    imageLoader.load(
      url,
      (img) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        texture.needsUpdate = true;
      },
      undefined,
      () => {}
    );
  }

  return texture;
}

// Photorealistic Earth Clouds
export function generateEarthCloudsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cloudPatches = IS_MOBILE_DEVICE ? 45 : 80;
  for (let i = 0; i < cloudPatches; i++) {
    const x = Math.random() * canvas.width;
    const y = canvas.height * 0.12 + Math.random() * (canvas.height * 0.76);
    const r = (20 + Math.random() * 55) * (canvas.width / 1024);
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r * 0.65, (Math.random() - 0.5) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.wrapS = THREE.RepeatWrapping;
  canvasTexture.wrapT = THREE.ClampToEdgeWrapping;
  canvasTexture.generateMipmaps = false;
  canvasTexture.minFilter = THREE.LinearFilter;

  const cloudUrl = "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_earth_clouds.jpg";
  imageLoader.load(
    cloudUrl,
    (img) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvasTexture.needsUpdate = true;
    },
    undefined,
    () => {}
  );

  return canvasTexture;
}

// Photorealistic Moon Surface
export function generateMoonHDTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const sx = canvas.width / 2048;
  const sy = canvas.height / 1024;

  ctx.fillStyle = "#8a8d92";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const maria = [
    { x: 760, y: 380, rx: 150, ry: 110 },
    { x: 1060, y: 440, rx: 130, ry: 100 },
    { x: 1240, y: 500, rx: 140, ry: 90 },
    { x: 520, y: 460, rx: 180, ry: 220 }
  ];

  maria.forEach((m) => {
    ctx.fillStyle = "#494e55";
    ctx.beginPath();
    ctx.ellipse(m.x * sx, m.y * sy, m.rx * sx, m.ry * sy, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  for (let i = 0; i < 90; i++) {
    const cx = Math.random() * canvas.width;
    const cy = Math.random() * canvas.height;
    const cr = (2 + Math.random() * 14) * sx;
    ctx.fillStyle = i % 3 === 0 ? "rgba(240, 245, 255, 0.5)" : "rgba(30, 30, 35, 0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  applyFastNoise(ctx, canvas.width, canvas.height, 0.22);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const url = PLANET_TEXTURE_URLS["Moon"];
  if (url) {
    imageLoader.load(
      url,
      (img) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        texture.needsUpdate = true;
      },
      undefined,
      () => {}
    );
  }

  return texture;
}

// Procedural generator for all celestial bodies
function generateProceduralPlanetCanvas(name: string, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const sx = canvas.width / 2048;
  const sy = canvas.height / 1024;

  if (name === "Mercury") {
    ctx.fillStyle = "#837f7a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 110; i++) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(30, 30, 30, 0.45)" : "rgba(225, 225, 225, 0.35)";
      ctx.beginPath();
      ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, (3 + Math.random() * 20) * sx, 0, Math.PI * 2);
      ctx.fill();
    }
    applyFastNoise(ctx, canvas.width, canvas.height, 0.25);
  } else if (name === "Venus") {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#e3bf88");
    grad.addColorStop(0.3, "#f2ddb3");
    grad.addColorStop(0.7, "#e8cb97");
    grad.addColorStop(1, "#dfb87c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 8) {
      ctx.fillStyle = "rgba(215, 160, 95, 0.22)";
      ctx.fillRect(0, y, canvas.width, 4 + Math.random() * 8);
    }
    applyFastNoise(ctx, canvas.width, canvas.height, 0.12);
  } else if (name === "Mars") {
    ctx.fillStyle = "#b84820";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = "rgba(70, 20, 8, 0.3)";
      ctx.beginPath();
      ctx.ellipse(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        (90 + Math.random() * 160) * sx,
        (40 + Math.random() * 80) * sy,
        Math.random(),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, 45 * sy);
    ctx.fillRect(0, canvas.height - 55 * sy, canvas.width, 55 * sy);
    applyFastNoise(ctx, canvas.width, canvas.height, 0.22);
  } else if (name === "Ceres") {
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(canvas.width * 0.45, canvas.height * 0.48, 14 * sx, 0, Math.PI * 2);
    ctx.fill();
    applyFastNoise(ctx, canvas.width, canvas.height, 0.28);
  } else if (name === "Jupiter") {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0.0, "#d8bda0");
    grad.addColorStop(0.24, "#f7ebd2");
    grad.addColorStop(0.48, "#e6cbb0");
    grad.addColorStop(0.72, "#eddcc5");
    grad.addColorStop(1.0, "#d5b89a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.fillStyle = "rgba(160, 85, 35, 0.32)";
      ctx.fillRect(0, y, canvas.width, 2 + Math.random() * 4);
    }
    ctx.fillStyle = "#b53515";
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.62, canvas.height * 0.64, 85 * sx, 45 * sy, -0.06, 0, Math.PI * 2);
    ctx.fill();
    applyFastNoise(ctx, canvas.width, canvas.height, 0.12);
  } else if (name === "Saturn") {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#e4d3a8");
    grad.addColorStop(0.4, "#eee0b8");
    grad.addColorStop(0.8, "#e2d2a2");
    grad.addColorStop(1, "#c8ad6f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 5) {
      ctx.fillStyle = "rgba(180, 150, 90, 0.25)";
      ctx.fillRect(0, y, canvas.width, 3 + Math.random() * 5);
    }
    applyFastNoise(ctx, canvas.width, canvas.height, 0.1);
  } else if (name === "Uranus") {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#a5ecea");
    grad.addColorStop(0.5, "#75d5d4");
    grad.addColorStop(1, "#8ee5e3");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    applyFastNoise(ctx, canvas.width, canvas.height, 0.06);
  } else if (name === "Neptune") {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#3248db");
    grad.addColorStop(0.65, "#4361fa");
    grad.addColorStop(1, "#1c2e9b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111b5e";
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.42, canvas.height * 0.46, 65 * sx, 32 * sy, 0, 0, Math.PI * 2);
    ctx.fill();
    applyFastNoise(ctx, canvas.width, canvas.height, 0.1);
  } else if (name === "Pluto") {
    ctx.fillStyle = "#8d7058";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f6eee0";
    ctx.beginPath();
    ctx.arc(canvas.width * 0.45, canvas.height * 0.52, 95 * sx, 0, Math.PI * 2);
    ctx.fill();
    applyFastNoise(ctx, canvas.width, canvas.height, 0.18);
  } else if (name === "Haumea") {
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#991b1b";
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.55, canvas.height * 0.45, 35 * sx, 20 * sy, 0, 0, Math.PI * 2);
    ctx.fill();
    applyFastNoise(ctx, canvas.width, canvas.height, 0.16);
  } else if (name === "Makemake") {
    ctx.fillStyle = "#b45309";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(canvas.width * 0.2, canvas.height * 0.3, canvas.width * 0.4, 70 * sy);
    applyFastNoise(ctx, canvas.width, canvas.height, 0.22);
  } else {
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 45; i++) {
      ctx.fillStyle = "rgba(203, 213, 225, 0.45)";
      ctx.beginPath();
      ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, (6 + Math.random() * 24) * sx, 0, Math.PI * 2);
      ctx.fill();
    }
    applyFastNoise(ctx, canvas.width, canvas.height, 0.14);
  }
}

// Master Ultra-Photorealistic Planet Texture Loader (Cached)
export function generatePlanetTexture(name: string): THREE.CanvasTexture {
  if (planetTextureCache[name]) return planetTextureCache[name];

  let tex: THREE.CanvasTexture;
  if (name === "Sun") {
    tex = generateSunHDTexture();
  } else if (name === "Earth") {
    tex = generateEarthHDTexture();
  } else if (name === "Moon") {
    tex = generateMoonHDTexture();
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_WIDTH;
    canvas.height = TEX_HEIGHT;
    generateProceduralPlanetCanvas(name, canvas);

    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;

    const cdnUrl = PLANET_TEXTURE_URLS[name];
    if (cdnUrl) {
      imageLoader.load(
        cdnUrl,
        (img) => {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            tex.needsUpdate = true;
          }
        },
        undefined,
        () => {}
      );
    }
  }

  planetTextureCache[name] = tex;
  return tex;
}

// Ultra HD Saturn Ring Texture
export function generateSaturnRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = IS_MOBILE_DEVICE ? 512 : 1024;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);

  grad.addColorStop(0, "rgba(160, 140, 100, 0.0)");
  grad.addColorStop(0.08, "rgba(180, 160, 120, 0.45)");
  grad.addColorStop(0.18, "rgba(215, 195, 150, 0.85)");
  grad.addColorStop(0.42, "rgba(235, 215, 170, 0.98)");
  grad.addColorStop(0.51, "rgba(10, 10, 10, 0.02)");
  grad.addColorStop(0.55, "rgba(10, 10, 10, 0.02)");
  grad.addColorStop(0.58, "rgba(225, 205, 160, 0.92)");
  grad.addColorStop(0.78, "rgba(210, 190, 145, 0.8)");
  grad.addColorStop(0.83, "rgba(20, 20, 20, 0.05)");
  grad.addColorStop(0.86, "rgba(205, 185, 140, 0.7)");
  grad.addColorStop(1.0, "rgba(120, 100, 80, 0.0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const ringUrl = "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/textures/2k_saturn_ring_alpha.png";
  imageLoader.load(
    ringUrl,
    (img) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      texture.needsUpdate = true;
    },
    undefined,
    () => {}
  );

  return texture;
}

// On-demand cached HD Star Texture generator (only generated when a star is inspected/visited)
export function generateStarHDTexture(starColor: string): THREE.CanvasTexture {
  if (starTextureCache[starColor]) return starTextureCache[starColor];

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  const baseColor = new THREE.Color(starColor);
  const hexColor = "#" + baseColor.getHexString();

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0.0, hexColor);
  grad.addColorStop(0.3, "rgba(255, 255, 255, 0.92)");
  grad.addColorStop(0.5, hexColor);
  grad.addColorStop(0.7, "rgba(255, 255, 255, 0.96)");
  grad.addColorStop(1.0, hexColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 160; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 2 + Math.random() * 7;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255, 255, 255, 0.65)" : hexColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  applyFastNoise(ctx, canvas.width, canvas.height, 0.18);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  starTextureCache[starColor] = texture;
  return texture;
}
