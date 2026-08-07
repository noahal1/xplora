import { useEffect, useRef, useState, useCallback, type HTMLAttributes } from "react";
import { Renderer, Triangle, Program, Mesh, Texture, type OGLRenderingContext } from "ogl";
import { gsap } from "gsap";

import "./MorphSlider.css";

export interface MorphSliderItem {
  image: string;
  caption?: string;
  [key: string]: unknown;
}

export interface MorphSliderProps extends HTMLAttributes<HTMLDivElement> {
  items?: MorphSliderItem[];
  startIndex?: number;
  transition?: "melt" | "ripple" | "shear" | "swirl";
  duration?: number;
  ease?: string;
  intensity?: number;
  scale?: number;
  aberration?: number;
  drift?: number;
  autoplay?: boolean;
  autoplayDelay?: number;
  loop?: boolean;
  radius?: number;
  overlayColor?: string;
  showCaptions?: boolean;
  showControls?: boolean;
  showIndicators?: boolean;
  /** Fired whenever the active slide changes (including during drags). */
  onIndexChange?: (index: number) => void;
  className?: string;
}

const TRANSITIONS: Record<string, number> = { melt: 0, ripple: 1, shear: 2, swirl: 3 };

const DEFAULT_ITEMS: MorphSliderItem[] = [
  {
    image: "https://images.unsplash.com/photo-1782977389500-dd7adad33ebe?q=80&w=1600&auto=format&fit=crop",
    caption: "One",
  },
  {
    image: "https://images.unsplash.com/photo-1781499455083-6ccc3beb20cd?q=80&w=1600&auto=format&fit=crop",
    caption: "Two",
  },
  {
    image: "https://images.unsplash.com/photo-1776394254711-4a0d7345269a?q=80&w=1600&auto=format&fit=crop",
    caption: "Three",
  },
  {
    image: "https://images.unsplash.com/photo-1781242629922-6f39cc3671cd?q=80&w=1600&auto=format&fit=crop",
    caption: "Four",
  },
];

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform sampler2D tCurrent;
uniform sampler2D tNext;
uniform vec2 uResolution;
uniform vec2 uCurrentSize;
uniform vec2 uNextSize;
uniform float uProgress;
uniform float uDir;
uniform int uMode;
uniform float uIntensity;
uniform float uScale;
uniform float uAberration;
uniform float uDrift;
uniform float uTime;
uniform float uReduce;
uniform vec2 uPointer;
uniform vec3 uOverlay;

varying vec2 vUv;

const float PI = 3.14159265359;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

// Aspect-correct fit sampling. contain=false crop-fills the container
// (cover, used for the blurred backdrop); contain=true shows the ENTIRE
// image letterboxed without cropping (used for the sharp foreground poster,
// so portrait movie posters render fully with the blurred backdrop around).
vec2 fitUV(vec2 uv, vec2 res, vec2 img, bool contain) {
  float rA = res.x / max(res.y, 1.0);
  float iA = img.x / max(img.y, 1.0);
  float ratio = rA / max(iA, 0.0001);
  vec2 s = vec2(1.0);
  if (ratio > 1.0) {
    if (contain) {
      s.x = ratio;
    } else {
      s.y = 1.0 / ratio;
    }
  } else {
    if (contain) {
      s.y = 1.0 / ratio;
    } else {
      s.x = ratio;
    }
  }
  return (uv - 0.5) * s + 0.5;
}

// 1 inside the poster rect, 0 outside, with a soft feathered edge
float maskRect(vec2 p) {
  vec2 lo = smoothstep(vec2(0.0), vec2(0.018), p);
  vec2 hi = 1.0 - smoothstep(vec2(0.982), vec2(1.0), p);
  return lo.x * lo.y * hi.x * hi.y;
}

// Cheap cross-shaped blur (center + 4 axis taps / 8) for the backdrop.
// Fewer taps than a 3x3 but visually identical once the backdrop is
// desaturated and darkened — much cheaper on mobile GPUs.
vec3 blurCross(sampler2D t, vec2 uv, vec2 step) {
  vec3 c = texture2D(t, uv).rgb * 4.0;
  c += texture2D(t, uv + vec2(step.x, 0.0)).rgb;
  c += texture2D(t, uv - vec2(step.x, 0.0)).rgb;
  c += texture2D(t, uv + vec2(0.0, step.y)).rgb;
  c += texture2D(t, uv - vec2(0.0, step.y)).rgb;
  return c / 8.0;
}

// RGB-channel split for chromatic aberration
vec3 sampleRGB(sampler2D t, vec2 uv, float ca) {
  return vec3(
    texture2D(t, uv + vec2(ca, 0.0)).r,
    texture2D(t, uv).g,
    texture2D(t, uv - vec2(ca, 0.0)).b
  );
}

void main() {
  float p = clamp(uProgress, 0.0, 1.0);
  float env = sin(p * PI);

  vec2 uv = vUv;

  uv += vec2(sin(uTime * 0.25 + uv.y * 4.0), cos(uTime * 0.22 + uv.x * 4.0)) * uDrift * 0.008;
  uv = (uv - 0.5) * (1.0 - uDrift * 0.02 * sin(uTime * 0.4)) + 0.5;

  vec2 uvC = uv;
  vec2 uvN = uv;
  float m = smoothstep(0.0, 1.0, p);

  if (uReduce < 0.5) {
    if (uMode == 3) {
      vec2 c = uv - 0.5;
      float r = length(c);
      float ang = env * uIntensity * 3.5 * (1.0 - r);
      uvC = rot(ang) * c + 0.5;
      uvN = rot(-ang) * c + 0.5;
      m = smoothstep(0.0, 1.0, p);
    } else if (uMode == 1) {
      float d = distance(uv, uPointer);
      float ring = p * 1.6;
      float wave = sin((d - ring) * 30.0) * env;
      vec2 dir = normalize(uv - uPointer + 1e-4);
      vec2 disp = dir * wave * uIntensity * 0.25;
      uvC = uv + disp;
      uvN = uv + disp * 0.6;
      m = 1.0 - smoothstep(ring - 0.03, ring + 0.03, d);
    } else if (uMode == 2) {
      float slices = 14.0;
      float row = floor(uv.y * slices);
      float rnd = hash11(row);
      vec2 disp = vec2((rnd - 0.5) * env * uIntensity * 0.6, 0.0);
      uvC = uv + disp;
      uvN = uv + disp;
      float localX = uDir > 0.0 ? uv.x : 1.0 - uv.x;
      float th = p * 1.5 - 0.25 + (rnd - 0.5) * 0.25;
      m = 1.0 - smoothstep(th - 0.06, th + 0.06, localX);
    } else {
      float nn = fbm(uv * uScale + uTime * 0.03);
      float warp = fbm(uv * uScale * 1.7 - uTime * 0.02);
      vec2 g = vec2(nn, warp) - 0.5;
      uvC = uv + g * uIntensity * 0.5 * p;
      uvN = uv - g * uIntensity * 0.5 * (1.0 - p);
      m = smoothstep(nn - 0.15, nn + 0.15, p);
    }
  }

  // ── Backdrop: blurred, darkened, desaturated poster (cover-cropped) ──
  vec2 bC = fitUV(uvC, uResolution, uCurrentSize, false);
  vec2 bN = fitUV(uvN, uResolution, uNextSize, false);
  vec2 blurStep = vec2(26.0) / uResolution;
  vec3 bgC = blurCross(tCurrent, bC, blurStep);
  vec3 bgN = blurCross(tNext, bN, blurStep);
  vec3 bg = mix(bgC, bgN, m);
  float lum = dot(bg, vec3(0.299, 0.587, 0.114));
  bg = mix(vec3(lum), bg, 0.5) * 0.42;

  // ── Foreground: sharp, full, uncropped poster ──────────────────────
  vec2 fC = fitUV(uvC, uResolution, uCurrentSize, true);
  vec2 fN = fitUV(uvN, uResolution, uNextSize, true);
  float ca = uReduce < 0.5 ? uAberration * env * 0.03 : 0.0;
  vec3 fgC = sampleRGB(tCurrent, fC, ca);
  vec3 fgN = sampleRGB(tNext, fN, ca);
  vec3 fg = mix(fgC, fgN, m);
  float mask = mix(maskRect(fC), maskRect(fN), m);

  vec3 col = mix(bg, fg, mask);

  float vig = smoothstep(1.25, 0.25, length(uv - 0.5));
  col = mix(col, uOverlay, (1.0 - vig) * 0.28);

  gl_FragColor = vec4(col, 1.0);
}
`;

function makeFallbackTexture(gl: OGLRenderingContext) {
  const size = 4;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 24;
    data[i * 4 + 1] = 24;
    data[i * 4 + 2] = 28;
    data[i * 4 + 3] = 255;
  }
  return new Texture(gl, {
    image: data,
    width: size,
    height: size,
    generateMipmaps: false,
  });
}

function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || "#000000").replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface MorphOptions {
  transition: string;
  duration: number;
  ease: string;
  intensity: number;
  scale: number;
  aberration: number;
  drift: number;
  overlayColor: string;
  loop: boolean;
}

interface EngineOptions {
  items: MorphSliderItem[];
  startIndex: number;
  reducedMotion: boolean;
  dprCap: number;
  getOptions: () => MorphOptions;
  onIndexChange: (index: number) => void;
}

class MorphEngine {
  container: HTMLDivElement;
  items: MorphSliderItem[];
  getOptions: () => MorphOptions;
  onIndexChange: (index: number) => void;
  reducedMotion: boolean;

  current: number;
  animating: boolean;
  dragging: boolean;
  dragDir: number;
  shownIndex: number;
  tween: ReturnType<typeof gsap.fromTo> | null;
  /** True while the slider is on-screen — the render loop is skipped when off-screen. */
  visible = true;
  /** Set when the engine is destroyed so late image loads are ignored. */
  disposed = false;

  renderer: Renderer;
  gl: OGLRenderingContext;
  canvas: HTMLCanvasElement;
  geometry: Triangle;
  textures: Texture[];
  sizes: number[][];
  program: Program;
  mesh: Mesh;
  resizeObserver: ResizeObserver;
  visibilityObserver: IntersectionObserver;
  boundContextLost: (e: Event) => void;
  boundLoop: (t: number) => void;
  raf = 0;

  constructor(container: HTMLDivElement, options: EngineOptions) {
    this.container = container;
    this.items = options.items;
    this.getOptions = options.getOptions;
    this.onIndexChange = options.onIndexChange;
    this.reducedMotion = options.reducedMotion;

    this.current = options.startIndex;
    this.animating = false;
    this.dragging = false;
    this.dragDir = 0;
    this.shownIndex = options.startIndex;
    this.tween = null;

    this.renderer = new Renderer({
      alpha: false,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, options.dprCap),
    });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0.05, 0.05, 0.06, 1);

    this.canvas = this.gl.canvas as HTMLCanvasElement;
    this.canvas.className = "morph-slider-canvas";
    container.appendChild(this.canvas);

    this.geometry = new Triangle(this.gl);

    this.textures = this.items.map(() => makeFallbackTexture(this.gl));
    this.sizes = this.items.map(() => [1, 1]);

    const opts = this.getOptions();
    this.program = new Program(this.gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        tCurrent: { value: this.textures[this.current] },
        tNext: { value: this.textures[this.current] },
        uResolution: { value: [1, 1] },
        uCurrentSize: { value: this.sizes[this.current] },
        uNextSize: { value: this.sizes[this.current] },
        uProgress: { value: 0 },
        uDir: { value: 1 },
        uMode: { value: TRANSITIONS[opts.transition] ?? 0 },
        uIntensity: { value: opts.intensity },
        uScale: { value: opts.scale },
        uAberration: { value: opts.aberration },
        uDrift: { value: opts.drift },
        uTime: { value: 0 },
        uReduce: { value: this.reducedMotion ? 1 : 0 },
        uPointer: { value: [0.5, 0.5] },
        uOverlay: { value: hexToRgb(opts.overlayColor) },
      },
    });

    this.mesh = new Mesh(this.gl, { geometry: this.geometry, program: this.program });

    this.boundContextLost = this.onContextLost.bind(this);
    this.canvas.addEventListener("webglcontextlost", this.boundContextLost, false);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    // Pause the GPU render loop while the slider is scrolled out of view
    // (matches the Aurora component's off-screen pause pattern)
    this.visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    this.visibilityObserver.observe(container);

    this.loadTextures();

    this.boundLoop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.boundLoop);
  }

  loadTextures() {
    this.items.forEach((item, index) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = item.image;
      img.onload = () => {
        // Ignore loads that resolve after the engine was destroyed
        // (context is gone — touching it would raise WebGL errors)
        if (this.disposed) return;
        const texture = new Texture(this.gl, { generateMipmaps: false });
        texture.image = img;
        this.textures[index] = texture;
        this.sizes[index] = [img.naturalWidth || 1, img.naturalHeight || 1];
        if (index === this.current) {
          this.program.uniforms.tCurrent.value = texture;
          this.program.uniforms.uCurrentSize.value = this.sizes[index];
        }
      };
      img.onerror = () => {};
    });
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    this.renderer.setSize(w, h);
    this.program.uniforms.uResolution.value = [this.gl.canvas.width, this.gl.canvas.height];
  }

  syncOptions() {
    const opts = this.getOptions();
    this.program.uniforms.uMode.value = TRANSITIONS[opts.transition] ?? 0;
    this.program.uniforms.uIntensity.value = opts.intensity;
    this.program.uniforms.uScale.value = opts.scale;
    this.program.uniforms.uAberration.value = opts.aberration;
    this.program.uniforms.uDrift.value = opts.drift;
    this.program.uniforms.uOverlay.value = hexToRgb(opts.overlayColor);
  }

  loop(t: number) {
    // Keep the rAF loop running (for smooth resume) but skip rendering
    // while the slider is off-screen to save GPU/CPU work
    if (this.visible) {
      this.program.uniforms.uTime.value = t * 0.001;
      if (!this.dragging && !this.animating) this.syncOptions();
      this.renderer.render({ scene: this.mesh });
    }
    this.raf = requestAnimationFrame(this.boundLoop);
  }

  wrap(i: number) {
    const n = this.items.length;
    return ((i % n) + n) % n;
  }

  prepareNext(dir: number) {
    const target = this.wrap(this.current + dir);
    this.program.uniforms.tCurrent.value = this.textures[this.current];
    this.program.uniforms.uCurrentSize.value = this.sizes[this.current];
    this.program.uniforms.tNext.value = this.textures[target];
    this.program.uniforms.uNextSize.value = this.sizes[target];
    this.program.uniforms.uDir.value = dir;
    return target;
  }

  goTo(dir: number) {
    if (this.animating || this.dragging || this.items.length < 2) return;
    const opts = this.getOptions();
    if (!opts.loop) {
      const raw = this.current + dir;
      if (raw < 0 || raw > this.items.length - 1) return;
    }
    this.syncOptions();
    const target = this.prepareNext(dir);
    this.animating = true;
    this.announce(target);
    const duration = this.reducedMotion ? Math.min(opts.duration, 0.4) : opts.duration;
    this.tween = gsap.fromTo(
      this.program.uniforms.uProgress,
      { value: 0 },
      {
        value: 1,
        duration,
        ease: opts.ease,
        onComplete: () => this.commit(target),
      }
    );
  }

  announce(index: number) {
    if (index === this.shownIndex) return;
    this.shownIndex = index;
    if (this.onIndexChange) this.onIndexChange(index);
  }

  commit(target: number) {
    this.current = target;
    this.program.uniforms.tCurrent.value = this.textures[target];
    this.program.uniforms.uCurrentSize.value = this.sizes[target];
    this.program.uniforms.uProgress.value = 0;
    this.animating = false;
    this.tween = null;
    this.announce(target);
  }

  next() {
    this.goTo(1);
  }

  prev() {
    this.goTo(-1);
  }

  setPointer(x: number, y: number) {
    this.program.uniforms.uPointer.value = [x, y];
  }

  beginDrag() {
    if (this.animating || this.items.length < 2) return false;
    this.dragging = true;
    this.dragDir = 0;
    this.syncOptions();
    return true;
  }

  drag(ndx: number) {
    if (!this.dragging) return;
    const opts = this.getOptions();
    const dir = ndx < 0 ? 1 : -1;
    if (!opts.loop) {
      const raw = this.current + dir;
      if (raw < 0 || raw > this.items.length - 1) {
        this.program.uniforms.uProgress.value = 0;
        return;
      }
    }
    if (dir !== this.dragDir) {
      this.dragDir = dir;
      this.prepareNext(dir);
    }
    const progress = Math.min(Math.abs(ndx), 1);
    this.program.uniforms.uProgress.value = progress;
    this.announce(progress > 0.5 ? this.wrap(this.current + dir) : this.current);
  }

  endDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    const p = this.program.uniforms.uProgress.value;
    if (this.dragDir === 0) return;
    const target = this.wrap(this.current + this.dragDir);
    const duration = this.reducedMotion ? 0.3 : 0.5;
    this.animating = true;
    if (p > 0.4) {
      this.announce(target);
      this.tween = gsap.to(this.program.uniforms.uProgress, {
        value: 1,
        duration,
        ease: "power2.out",
        onComplete: () => this.commit(target),
      });
    } else {
      this.announce(this.current);
      this.tween = gsap.to(this.program.uniforms.uProgress, {
        value: 0,
        duration,
        ease: "power2.out",
        onComplete: () => {
          this.animating = false;
          this.tween = null;
        },
      });
    }
  }

  onContextLost(e: Event) {
    e.preventDefault();
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.tween) this.tween.kill();
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.boundContextLost);
    this.textures.forEach((tex) => {
      if (tex && tex.texture) this.gl.deleteTexture(tex.texture);
    });
    if (this.program && this.program.program) this.gl.deleteProgram(this.program.program);
    const ext = this.gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}

const wrapIndex = (i: number, n: number) => ((i % n) + n) % n;

export default function MorphSlider({
  items = DEFAULT_ITEMS,
  startIndex = 0,
  transition = "melt",
  duration = 1.1,
  ease = "power2.inOut",
  intensity = 0.55,
  scale = 2.4,
  aberration = 0.35,
  drift = 0.4,
  autoplay = false,
  autoplayDelay = 4,
  loop = true,
  radius = 16,
  overlayColor = "#000000",
  showCaptions = true,
  showControls = true,
  showIndicators = true,
  onIndexChange,
  className = "",
  ...props
}: MorphSliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MorphEngine | null>(null);
  const [index, setIndex] = useState(startIndex);
  const [hovering, setHovering] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let engine: MorphEngine | null = null;
    let rafId = 0;
    try {
      engine = new MorphEngine(containerRef.current, {
        items,
        startIndex,
        reducedMotion,
        dprCap: 2,
        getOptions: () => ({
          transition,
          duration,
          ease,
          intensity,
          scale,
          aberration,
          drift,
          overlayColor,
          loop,
        }),
        onIndexChange: (i) => {
          setIndex(i);
          onIndexChange?.(i);
        },
      });
      engineRef.current = engine;
      // Re-align the React index with the (recreated) engine's slide.
      // Deferred via rAF so it isn't a synchronous setState in the effect.
      rafId = requestAnimationFrame(() => setIndex(startIndex));
    } catch {
      // WebGL unavailable (disabled / headless / context limit reached) —
      // fall back to a static image slider so the page never breaks.
      engineRef.current = null;
      const timer = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(timer);
    }

    return () => {
      cancelAnimationFrame(rafId);
      engine?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, startIndex, transition, duration, ease, intensity, scale, aberration, drift, overlayColor, loop]);

  const goTo = useCallback(
    (dir: number) => {
      if (engineRef.current) {
        engineRef.current.goTo(dir);
        return;
      }
      // Static fallback: cycle the index manually
      if (items.length < 2) return;
      setIndex((i) => wrapIndex(i + dir, items.length));
    },
    [items.length]
  );

  const handleNext = useCallback(() => goTo(1), [goTo]);
  const handlePrev = useCallback(() => goTo(-1), [goTo]);

  useEffect(() => {
    if (!autoplay || hovering || items.length < 2) return undefined;
    const id = setTimeout(() => goTo(1), Math.max(autoplayDelay, 1) * 1000);
    return () => clearTimeout(id);
  }, [autoplay, autoplayDelay, hovering, index, goTo, items.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || failed) return undefined;
    let startX = 0;
    let width = 1;
    let active = false;

    const onDown = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      width = rect.width || 1;
      startX = e.clientX;
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      engineRef.current?.setPointer(px, 1 - py);
      active = engineRef.current?.beginDrag() ?? false;
      if (active && el.setPointerCapture) {
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!active) return;
      const ndx = (e.clientX - startX) / width;
      engineRef.current?.drag(ndx);
    };
    const onUp = () => {
      if (!active) return;
      active = false;
      engineRef.current?.endDrag();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [failed]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
    },
    [handleNext, handlePrev]
  );

  const hasCaptions = items.some((item) => item.caption);

  const slideStyle = {
    borderRadius: `${radius}px`,
    "--ms-swap": `${(duration * 0.66).toFixed(3)}s`,
    "--ms-dot": `${(duration * 0.45).toFixed(3)}s`,
  } as React.CSSProperties;

  return (
    <div
      className={`morph-slider ${className}`.trim()}
      style={slideStyle}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      {...props}
    >
      {failed ? (
        <div className="morph-slider-fallback">
          {items[index] && (
            <>
              {/* Blurred backdrop (CSS-only version of the shader hero) */}
              <img
                key={`bg-${items[index].image}`}
                className="morph-slider-fallback-bg"
                src={items[index].image}
                alt=""
                aria-hidden="true"
              />
              {/* Full, uncropped poster */}
              <img
                key={`fg-${items[index].image}`}
                className="morph-slider-fallback-fg"
                src={items[index].image}
                alt={items[index].caption || "slide"}
              />
            </>
          )}
          {showCaptions && items[index]?.caption && (
            <div className="morph-slider-caption">
              <span className="morph-slider-caption-text is-active">{items[index].caption}</span>
            </div>
          )}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="morph-slider-stage"
          role="group"
          aria-roledescription="carousel"
          aria-label="Image morph slider"
          tabIndex={0}
          onKeyDown={onKeyDown}
        />
      )}

      {showCaptions && hasCaptions && !failed && (
        <div className="morph-slider-caption" aria-live="polite">
          {items.map((item, i) =>
            item.caption ? (
              <span
                key={i}
                aria-hidden={i === index ? undefined : true}
                className={`morph-slider-caption-text ${i === index ? "is-active" : ""}`}
              >
                {item.caption}
              </span>
            ) : null
          )}
        </div>
      )}

      {showControls && (
        <div className="morph-slider-controls">
          <button type="button" className="morph-slider-btn" aria-label="Previous slide" onClick={handlePrev}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className="morph-slider-btn" aria-label="Next slide" onClick={handleNext}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M9 5l7 7-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      {showIndicators && (
        <div className="morph-slider-indicators" role="tablist" aria-label="Slides">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              className={`morph-slider-dot ${i === index ? "is-active" : ""}`}
              onClick={() => {
                const engine = engineRef.current;
                if (!engine) {
                  if (i !== index) setIndex(i);
                  return;
                }
                if (i === index) return;
                engine.goTo(i > index ? 1 : -1);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
