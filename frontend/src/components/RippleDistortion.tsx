import { useEffect, useRef, type CSSProperties } from "react";
import { Renderer, Program, Mesh, Geometry, Triangle, Texture, RenderTarget } from "ogl";
import "./RippleDistortion.css";

const MAX_WAVES = 100;
const QUALITY_SCALE = { low: 0.4, medium: 0.7, high: 1 } as const;
const START_SCALE = 1.5;
const LIFE_CONSTANT = Math.log(500);

const waveVertex = `
precision highp float;

attribute vec2 position;
attribute vec2 uv;
attribute vec2 iOffset;
attribute vec2 iScale;
attribute float iOpacity;

varying vec2 vUv;
varying float vOpacity;

void main() {
  vUv = uv;
  vOpacity = iOpacity;
  gl_Position = vec4(iOffset + position * iScale, 0.0, 1.0);
}
`;

const waveFragment = `
precision highp float;

varying vec2 vUv;
varying float vOpacity;

uniform float uRings;

const float PI = 3.141592653589793;
const float EDGE = 0.006737947;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;

  float brush = (exp(-r * 5.0) - EDGE) / (1.0 - EDGE);

  brush *= 0.55 + 0.45 * cos(sqrt(r) * PI * 2.0 * uRings);

  gl_FragColor = vec4(vec3(brush * vOpacity * vOpacity), 1.0);
}
`;

const screenVertex = `
precision highp float;
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const compositeFragment = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTexture;
uniform sampler2D uDisplacement;
uniform vec2 uResolution;
uniform vec2 uTextureSize;
uniform vec2 uTexel;
uniform vec3 uTint;
uniform vec3 uHighlight;
uniform float uStrength;
uniform float uSwirl;
uniform float uDispersion;
uniform float uGlint;
uniform float uTintAmount;
uniform float uGrayscale;
uniform float uOverlay;

const float TAU = 6.283185307179586;

vec2 coverUV(vec2 uv) {
  vec2 safe = max(uTextureSize, vec2(1.0));
  vec2 s = uResolution / safe;
  vec2 scaledSize = safe * max(s.x, s.y);
  vec2 offset = (uResolution - scaledSize) * 0.5;
  return (uv * uResolution - offset) / scaledSize;
}

void main() {
  float amount = texture2D(uDisplacement, vUv).r;
  vec2 base = coverUV(vUv);

  float theta = amount * uSwirl * TAU;
  vec2 dir = vec2(sin(theta), cos(theta));
  vec2 push = dir * amount * uStrength;

  vec3 color;
  if (uDispersion > 0.001) {
    float split = uDispersion * 0.25;
    color.r = texture2D(uTexture, base + push * (1.0 + split)).r;
    color.g = texture2D(uTexture, base + push).g;
    color.b = texture2D(uTexture, base + push * (1.0 - split)).b;
  } else {
    color = texture2D(uTexture, base + push).rgb;
  }

  if (uGrayscale > 0.001) {
    color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), uGrayscale);
  }

  if (uTintAmount > 0.001) {
    color = mix(color, color * uTint * 1.9, clamp(amount * 1.6, 0.0, 1.0) * uTintAmount);
  }

  if (uGlint > 0.001) {
    float ex = texture2D(uDisplacement, vUv + vec2(uTexel.x, 0.0)).r - texture2D(uDisplacement, vUv - vec2(uTexel.x, 0.0)).r;
    float ey = texture2D(uDisplacement, vUv + vec2(0.0, uTexel.y)).r - texture2D(uDisplacement, vUv - vec2(0.0, uTexel.y)).r;
    vec3 normal = normalize(vec3(-ex * 26.0, -ey * 26.0, 1.0));
    vec3 light = normalize(vec3(-0.35, 0.55, 1.0));
    float raw = pow(max(dot(normal, light), 0.0), 22.0);
    float flatSpec = pow(max(light.z, 0.0), 22.0);
    color += uHighlight * clamp((raw - flatSpec) / max(1.0 - flatSpec, 0.0001), 0.0, 1.0) * uGlint;
  }

  float alpha = 1.0;
  if (uOverlay > 0.001) {
    // Translucent water overlay: only the disturbed spots are visible — the
    // rest stays transparent so the container's own background shows through.
    // Pull the ripple toward mid-grey so it reads on both light & dark themes.
    color = mix(color, vec3(0.55), clamp(amount * 0.8, 0.0, 1.0) * 0.45);
    alpha = clamp(amount * 0.75, 0.0, 1.0);
  }
  gl_FragColor = vec4(color, alpha);
}
`;

const hexToRGB = (hex: string): number[] => {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

type Quality = "low" | "medium" | "high";
type Trigger = "hover" | "click" | "both";

interface RippleDistortionProps {
  src?: string;
  brushSize?: number;
  strength?: number;
  swirl?: number;
  rings?: number;
  spread?: number;
  fade?: number;
  spacing?: number;
  dispersion?: number;
  glint?: number;
  tint?: string;
  tintAmount?: number;
  highlightColor?: string;
  grayscale?: boolean;
  trigger?: Trigger;
  clickStrength?: number;
  quality?: Quality;
  enabled?: boolean;
  /** Render as a translucent water overlay (alpha < 1 where ripples are).
   *  Untouched areas stay transparent so the container's own background shows
   *  through — the effect fuses with the surface instead of covering it. */
  overlay?: boolean;
  className?: string;
  style?: CSSProperties;
}

// Light mist (SVG data URI) used as the default image so the effect renders
// against a white background — no network image required. Soft grey clouds
// and small mist particles give the ripple displacement tonal detail to fold
// while keeping the overall canvas white.
const DEFAULT_SRC = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900' viewBox='0 0 1600 900'>
  <defs>
    <radialGradient id='a' cx='50%' cy='50%' r='50%'>
      <stop offset='0%' stop-color='#cfcfcf'/>
      <stop offset='100%' stop-color='#ffffff'/>
    </radialGradient>
    <radialGradient id='b' cx='50%' cy='50%' r='50%'>
      <stop offset='0%' stop-color='#bdbdbd'/>
      <stop offset='100%' stop-color='#f4f4f4'/>
    </radialGradient>
    <radialGradient id='c' cx='50%' cy='50%' r='50%'>
      <stop offset='0%' stop-color='#d8d8d8'/>
      <stop offset='100%' stop-color='#fafafa'/>
    </radialGradient>
  </defs>
  <rect width='1600' height='900' fill='#ffffff'/>
  <ellipse cx='300' cy='260' rx='560' ry='420' fill='url(#a)'/>
  <ellipse cx='1300' cy='640' rx='640' ry='460' fill='url(#b)'/>
  <ellipse cx='880' cy='160' rx='460' ry='300' fill='url(#c)'/>
  <g fill='#b5b5b5'>
    <circle cx='130' cy='150' r='2.4' opacity='0.5'/>
    <circle cx='420' cy='80' r='1.6' opacity='0.4'/>
    <circle cx='700' cy='210' r='2' opacity='0.45'/>
    <circle cx='1050' cy='100' r='1.4' opacity='0.35'/>
    <circle cx='1420' cy='190' r='2.2' opacity='0.45'/>
    <circle cx='1560' cy='430' r='1.6' opacity='0.4'/>
    <circle cx='60' cy='520' r='1.8' opacity='0.45'/>
    <circle cx='280' cy='720' r='2' opacity='0.5'/>
    <circle cx='560' cy='840' r='1.5' opacity='0.4'/>
    <circle cx='860' cy='700' r='1.9' opacity='0.45'/>
    <circle cx='1150' cy='820' r='2.2' opacity='0.5'/>
    <circle cx='1380' cy='560' r='1.6' opacity='0.4'/>
  </g>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
})();

interface WaveState {
  x: number;
  y: number;
  scale: number;
  target: number;
  size: number;
  opacity: number;
}

interface Config {
  brushSize: number;
  spread: number;
  fade: number;
  spacing: number;
  clickStrength: number;
  trigger: Trigger;
  enabled: boolean;
}

interface UniformMap {
  wave: Record<string, { value: unknown }>;
  composite: Record<string, { value: unknown }>;
}

const RippleDistortion = ({
  src = DEFAULT_SRC,
  brushSize = 150,
  strength = 0.2,
  swirl = 1,
  rings = 4,
  spread = 5,
  fade = 3,
  spacing = 15,
  dispersion = 0,
  glint = 0,
  tint = "#b3b3b3",
  tintAmount = 0.1,
  grayscale = true,
  highlightColor = "#ffffff",
  trigger = "hover",
  clickStrength = 2,
  quality = "low",
  enabled = true,
  overlay = false,
  className = "",
  style,
}: RippleDistortionProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef<Config>({ brushSize, spread, fade, spacing, clickStrength, trigger, enabled });
  const uniformsRef = useRef<UniformMap | null>(null);

  configRef.current = { brushSize, spread, fade, spacing, clickStrength, trigger, enabled };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: Renderer;
    const isOverlay = overlay;
    try {
      renderer = new Renderer({
        // overlay mode needs a transparent drawing buffer so the container's
        // own background shows through the untouched (alpha 0) areas
        alpha: isOverlay,
        premultipliedAlpha: false,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      // WebGL unavailable (disabled, headless, or context limit reached) —
      // fall back to a static gradient so the effect never breaks the UI.
      if (!isOverlay) {
        mount.style.background =
          "radial-gradient(120% 120% at 30% 20%, #ececec 0%, #f7f7f7 45%, #ffffff 100%)";
      }
      return;
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, isOverlay ? 0 : 1);
    const canvas = gl.canvas;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    mount.appendChild(canvas);

    const imageTexture = new Texture(gl, {
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });

    let disposed = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      imageTexture.image = image;
      compositeUniforms.uTextureSize.value = [image.naturalWidth || 1, image.naturalHeight || 1];
    };
    image.src = src;

    const offsets = new Float32Array(MAX_WAVES * 2);
    const scales = new Float32Array(MAX_WAVES * 2);
    const opacities = new Float32Array(MAX_WAVES);

    const waves: WaveState[] = Array.from({ length: MAX_WAVES }, () => ({
      x: 0,
      y: 0,
      scale: START_SCALE,
      target: START_SCALE,
      size: 1,
      opacity: 0,
    }));
    let current = 0;

    const geometry = new Geometry(gl, {
      position: { size: 2, data: new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]) },
      uv: { size: 2, data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]) },
      iOffset: { instanced: 1, size: 2, data: offsets },
      iScale: { instanced: 1, size: 2, data: scales },
      iOpacity: { instanced: 1, size: 1, data: opacities },
    });

    const waveUniforms = { uRings: { value: rings } };
    const waveProgram = new Program(gl, {
      vertex: waveVertex,
      fragment: waveFragment,
      uniforms: waveUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    });
    waveProgram.setBlendFunc(gl.ONE, gl.ONE);
    const waveMesh = new Mesh(gl, { geometry, program: waveProgram, frustumCulled: false });

    const displacementTarget = new RenderTarget(gl, {
      width: 2,
      height: 2,
      depth: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });

    const compositeUniforms = {
      uTexture: { value: imageTexture },
      uDisplacement: { value: displacementTarget.texture },
      uResolution: { value: [1, 1] },
      uTextureSize: { value: [1, 1] },
      uTexel: { value: [1, 1] },
      uTint: { value: hexToRGB(tint) },
      uHighlight: { value: hexToRGB(highlightColor) },
      uStrength: { value: strength },
      uSwirl: { value: swirl },
      uDispersion: { value: dispersion },
      uGlint: { value: glint },
      uTintAmount: { value: tintAmount },
      uGrayscale: { value: grayscale ? 1 : 0 },
      uOverlay: { value: overlay ? 1 : 0 },
    };

    const compositeMesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program: new Program(gl, {
        vertex: screenVertex,
        fragment: compositeFragment,
        uniforms: compositeUniforms,
        depthTest: false,
        depthWrite: false,
      }),
    });

    uniformsRef.current = { wave: waveUniforms, composite: compositeUniforms };

    let width = 1;
    let height = 1;

    const resize = () => {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height);
      compositeUniforms.uResolution.value = [width, height];

      const scale = QUALITY_SCALE[quality] || QUALITY_SCALE.high;
      const fieldW = Math.max(2, Math.round(width * scale));
      const fieldH = Math.max(2, Math.round(height * scale));
      displacementTarget.setSize(fieldW, fieldH);
      compositeUniforms.uTexel.value = [1 / fieldW, 1 / fieldH];
    };

    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const setNewWave = (x: number, y: number, power: number) => {
      const cfg = configRef.current;
      const wave = waves[current];
      current = (current + 1) % MAX_WAVES;
      wave.x = x;
      wave.y = y;
      wave.scale = START_SCALE * power;
      wave.target = START_SCALE * Math.max(1, cfg.spread) * power;
      wave.size = Math.max(1, cfg.brushSize);
      wave.opacity = 1;
    };

    const localPoint = (clientX: number, clientY: number): [number, number] | null => {
      const rect = mount.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return null;
      }
      return [clientX - rect.left, rect.height - (clientY - rect.top)];
    };

    let previousX = 0;
    let previousY = 0;

    const onMove = (event: PointerEvent) => {
      const cfg = configRef.current;
      if (!cfg.enabled || reduceMotion || cfg.trigger === "click") return;
      const point = localPoint(event.clientX, event.clientY);
      if (!point) return;
      const step = Math.max(1, cfg.spacing);
      if (Math.abs(point[0] - previousX) > step || Math.abs(point[1] - previousY) > step) {
        setNewWave(point[0], point[1], 1);
        previousX = point[0];
        previousY = point[1];
      }
    };

    const onDown = (event: PointerEvent) => {
      const cfg = configRef.current;
      if (!cfg.enabled || reduceMotion || cfg.trigger === "hover") return;
      const point = localPoint(event.clientX, event.clientY);
      if (!point) return;
      setNewWave(point[0], point[1], Math.max(1, cfg.clickStrength));
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    let raf = 0;
    let previousTime = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const delta = previousTime ? Math.min(0.05, (now - previousTime) / 1000) : 0;
      previousTime = now;
      const cfg = configRef.current;

      const growth = reduceMotion ? 0 : 1 - Math.exp(-delta * 1.09);
      const decay = reduceMotion ? 1 : Math.exp((-delta * LIFE_CONSTANT) / Math.max(0.15, cfg.fade));

      for (let i = 0; i < MAX_WAVES; i += 1) {
        const wave = waves[i];
        if (wave.opacity <= 0) {
          opacities[i] = 0;
          continue;
        }

        wave.opacity *= decay;
        wave.scale += (wave.target - wave.scale) * growth;

        if (wave.opacity < 0.002) {
          wave.opacity = 0;
          opacities[i] = 0;
          continue;
        }

        const half = (wave.scale * wave.size) / 2;
        offsets[i * 2] = (wave.x / width) * 2 - 1;
        offsets[i * 2 + 1] = (wave.y / height) * 2 - 1;
        scales[i * 2] = (half / width) * 2;
        scales[i * 2 + 1] = (half / height) * 2;
        opacities[i] = wave.opacity;
      }

      geometry.attributes.iOffset.needsUpdate = true;
      geometry.attributes.iScale.needsUpdate = true;
      geometry.attributes.iOpacity.needsUpdate = true;

      renderer.render({ scene: waveMesh, target: displacementTarget, clear: true });
      renderer.render({ scene: compositeMesh });
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      uniformsRef.current = null;
      if (canvas.parentNode === mount) mount.removeChild(canvas);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, quality, overlay]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    u.wave.uRings.value = rings;
    u.composite.uStrength.value = strength;
    u.composite.uSwirl.value = swirl;
    u.composite.uDispersion.value = dispersion;
    u.composite.uGlint.value = glint;
    u.composite.uTintAmount.value = tintAmount;
    u.composite.uGrayscale.value = grayscale ? 1 : 0;
    u.composite.uHighlight.value = hexToRGB(highlightColor);
    u.composite.uTint.value = hexToRGB(tint);
    u.composite.uOverlay.value = overlay ? 1 : 0;
  }, [rings, strength, swirl, dispersion, glint, tintAmount, grayscale, highlightColor, tint, overlay]);

  return <div ref={mountRef} className={`ripple-distortion ${className}`.trim()} style={style} />;
};

export default RippleDistortion;
