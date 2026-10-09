import * as THREE from "three";

/**
 * The 3D model behind the services chapters: one field of glowing points
 * that changes shape with scroll. It starts as one glowing dot under the
 * intro title, which bursts into loose dust. The dust pulls into a globe (Connect),
 * the globe unwinds into a looping knot with light running through it
 * (Automate), then the points land on a floor grid and the bars of a chart
 * step up from smallest to biggest, then all grow taller, on a loop (Grow).
 * anime.js writes `state` from scroll; the scene only reads it. Every shape
 * is computed in the vertex shader, so a frame costs one draw call.
 */
export interface SceneState {
  burst: number;
  join: number;
  flow: number;
  settle: number;
  spin: number;
}

const FLOOR = -1.9;
const GROW_CYCLE = 7; // seconds per build, grow, hold, sink loop
const INTRO_Y = -2.2; // where the dot sits, below the intro title
const BAR_HEIGHTS = [0.7, 1.1, 1.6, 2.2, 2.9];
const BAR_W = 0.56;
const BAR_GAP = 0.86;
const FLOOR_SHARE = 0.14; // points that form the floor grid in Grow
const FLOOR_COLS = 26;
const FLOOR_ROWS = 9;

// Seeded so the scatter is identical on every visit.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildGeometry(count: number) {
  const rand = seeded(11);
  const scatter = new Float32Array(count * 3);
  const sphere = new Float32Array(count * 3);
  const bar = new Float32Array(count * 4);
  const seed = new Float32Array(count * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const o = i * 3;

    // Scatter: a wide, flat-ish cloud so it reads as dust, not a ball.
    const r = 3 + rand() * 6;
    const a = rand() * Math.PI * 2;
    scatter[o] = Math.cos(a) * r;
    scatter[o + 1] = (rand() - 0.5) * 7;
    scatter[o + 2] = Math.sin(a) * r * 0.6 - 1;

    // Globe: even Fibonacci spacing on the surface.
    const y = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(1 - y * y);
    sphere[o] = Math.cos(i * golden) * ring * 2.2;
    sphere[o + 1] = y * 2.2;
    sphere[o + 2] = Math.sin(i * golden) * ring * 2.2;

    // Bars: x, height share (0 to 1), z, bar index. Height is applied in the
    // shader so each bar can rise on its own and keep growing.
    // Index -1 marks the floor grid under the chart.
    const b4 = i * 4;
    if (rand() < FLOOR_SHARE) {
      const col = Math.floor(rand() * FLOOR_COLS);
      const row = Math.floor(rand() * FLOOR_ROWS);
      bar[b4] = (col / (FLOOR_COLS - 1) - 0.5) * BAR_GAP * BAR_HEIGHTS.length * 1.05;
      bar[b4 + 1] = 0;
      bar[b4 + 2] = (row / (FLOOR_ROWS - 1) - 0.5) * 1.5;
      bar[b4 + 3] = -1;
    } else {
      const b = Math.floor(rand() * BAR_HEIGHTS.length);
      const half = BAR_W * 0.5;
      const cx = (b - (BAR_HEIGHTS.length - 1) / 2) * BAR_GAP;
      const face = rand();
      let px = (rand() - 0.5) * BAR_W;
      let pz = (rand() - 0.5) * BAR_W;
      let py = rand();
      // Most points sit on edges and faces, so each bar reads as a clean solid.
      if (face < 0.18) py = 1;
      else if (face < 0.42) {
        px = (rand() < 0.5 ? -1 : 1) * half;
        pz = (rand() < 0.5 ? -1 : 1) * half;
      } else if (face < 0.71) px = (rand() < 0.5 ? -1 : 1) * half;
      else pz = (rand() < 0.5 ? -1 : 1) * half;
      bar[b4] = cx + px;
      bar[b4 + 1] = py;
      bar[b4 + 2] = pz;
      bar[b4 + 3] = b;
    }

    seed[i * 4] = rand(); // morph stagger
    seed[i * 4 + 1] = rand(); // place along the knot
    seed[i * 4 + 2] = rand(); // size and knot thickness
    seed[i * 4 + 3] = rand(); // color pick
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(sphere, 3));
  geo.setAttribute("aScatter", new THREE.BufferAttribute(scatter, 3));
  geo.setAttribute("aSphere", new THREE.BufferAttribute(sphere, 3));
  geo.setAttribute("aBar", new THREE.BufferAttribute(bar, 4));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
  return geo;
}

const vertexShader = /* glsl */ `
  attribute vec3 aScatter;
  attribute vec3 aSphere;
  attribute vec4 aBar;
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uBurst;
  uniform float uJoin;
  uniform float uFlow;
  uniform float uSettle;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uFloor;
  uniform float uGrow;
  uniform float uHeights[${BAR_HEIGHTS.length}];
  varying float vOrange;
  varying float vGlow;
  varying float vAlpha;

  // Each point starts its move a little later than the last: a swarm, not a tween.
  float stage(float v, float s) {
    float t = clamp(v * 1.6 - s * 0.6, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  // A (2,3) torus knot: one unbroken loop, read as "always running".
  vec3 knot(float t) {
    float a = t * 6.2831853;
    float r = 1.6 + 0.62 * cos(3.0 * a);
    return vec3(r * cos(2.0 * a), 0.85 * sin(3.0 * a), r * sin(2.0 * a));
  }

  void main() {
    float s = aSeed.x;
    float b = stage(uBurst, s);
    float j = stage(uJoin, s);
    float f = stage(uFlow, s);
    float g = stage(uSettle, s);

    vec3 drift = vec3(sin(uTime * 0.5 + s * 40.0), cos(uTime * 0.4 + s * 31.0), sin(uTime * 0.3 + s * 17.0));
    // Before the burst every point sits in one small, breathing dot.
    vec3 dot = normalize(aSphere) * 0.05 * aSeed.z * (1.0 + 0.3 * sin(uTime * 2.0));
    vec3 dust = mix(dot, aScatter + drift * 0.3, b);
    vec3 globe = aSphere * (1.0 + 0.025 * sin(uTime * 1.4 + aSphere.y * 2.5));
    // Points stream along the knot over time.
    float kt = fract(aSeed.y + uTime * 0.035);
    vec3 loop = knot(kt) + normalize(aSphere) * 0.16 * aSeed.z;
    // Grow: points land flat on the floor first. Then, on a loop, the bars
    // step up one at a time from smallest to biggest, all grow taller
    // together, hold, and sink back to start again.
    float idx = aBar.w;
    float isBar = step(0.0, idx);
    float bi = max(idx, 0.0);
    float c = mod(uGrow, ${GROW_CYCLE.toFixed(1)});
    float rise = clamp((c - bi * 0.35) / 0.8, 0.0, 1.0);
    rise = 1.0 - pow(1.0 - rise, 3.0);
    float boost = smoothstep(2.6, 4.2, c) * (0.15 + 0.07 * bi);
    float sink = 1.0 - smoothstep(6.3, 7.0, c);
    float h = uHeights[int(bi)] * rise * (1.0 + boost) * sink * isBar;
    vec3 chart = vec3(aBar.x, uFloor + aBar.y * h, aBar.z);

    vec3 pos = mix(dust, globe, j);
    pos = mix(pos, loop, f);
    pos = mix(pos, chart, g);

    // Bright pulses travel around the knot.
    float wave = pow(0.5 + 0.5 * sin((aSeed.y - uTime * 0.22) * 6.2831853 * 3.0), 10.0);
    vGlow = wave * f * (1.0 - g);
    // Bars glow orange, brightest on the top face. The floor stays white.
    float top = step(0.999, aBar.y) * rise;
    vOrange = mix(1.0, step(aSeed.w, 0.2), b) * (1.0 - g) + g * isBar * (step(aSeed.w, 0.55) + top);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.55 + aSeed.z * 0.9) * (1.0 + vGlow * 1.4) / -mv.z;
    // Far points fade so the shape has depth without fog.
    vAlpha = smoothstep(19.0, 7.0, -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vOrange;
  varying float vGlow;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float a = core * core;
    vec3 white = vec3(0.96, 0.94, 0.91);
    vec3 orange = vec3(0.98, 0.52, 0.24);
    vec3 col = mix(white, orange, clamp(vOrange + vGlow, 0.0, 1.0)) + orange * vGlow * 0.6;
    gl_FragColor = vec4(col, a * vAlpha * (0.9 + vGlow * 0.1));
  }
`;

export function createServicesScene(canvas: HTMLCanvasElement, state: SceneState) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  camera.position.set(0, 0.6, 11);

  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const geometry = buildGeometry(small ? 4200 : 7500);
  const uniforms = {
    uTime: { value: 0 },
    uBurst: { value: 0 },
    uJoin: { value: 0 },
    uFlow: { value: 0 },
    uSettle: { value: 0 },
    uSize: { value: small ? 48 : 44 },
    uPixelRatio: { value: pixelRatio },
    uFloor: { value: FLOOR },
    uHeights: { value: BAR_HEIGHTS },
    uGrow: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const model = new THREE.Points(geometry, material);
  scene.add(model);

  // Smoothed copy of state, so fast scroll flicks still glide.
  const shown: SceneState = { ...state };
  const pointer = { x: 0, y: 0 };
  const layout = { x: 0, y: 0, scale: 1 };
  const clock = new THREE.Clock();
  // Seconds since the chart landed. Restarts when you scroll back up, so
  // the bars always build from the first step when Grow comes into view.
  let growTime = 0;
  let last = 0;
  let frame = 0;
  let running = false;

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Wide screens: model on the right half, text on the left.
    // Tall screens: model in the upper half, text below it.
    const wide = w / h > 1.1;
    layout.x = wide ? 2.9 : 0;
    layout.y = wide ? 0 : 1.9;
    layout.scale = wide ? 1 : 0.56;
  }

  function render() {
    const t = clock.getElapsedTime();
    const dt = Math.min(t - last, 0.1);
    last = t;
    growTime = shown.settle > 0.9 ? growTime + dt : shown.settle < 0.6 ? 0 : growTime;
    uniforms.uGrow.value = growTime;
    for (const k of Object.keys(shown) as (keyof SceneState)[]) shown[k] += (state[k] - shown[k]) * 0.08;
    const settle = shown.settle * shown.settle * (3 - 2 * shown.settle);

    uniforms.uTime.value = t;
    uniforms.uBurst.value = shown.burst;
    uniforms.uJoin.value = shown.join;
    uniforms.uFlow.value = shown.flow;
    uniforms.uSettle.value = shown.settle;

    // The dot starts centered under the title, then moves to its side.
    const x = layout.x * shown.join;
    const y = INTRO_Y + (layout.y - INTRO_Y) * shown.join;
    model.position.set(x, y, 0);
    model.scale.setScalar(layout.scale);
    // Free spin while forming, then ease to a fixed angle so the chart reads.
    const freeSpin = t * 0.1 + shown.spin * Math.PI * 1.2;
    model.rotation.y = freeSpin * (1 - settle) + (-0.32 + Math.sin(t * 0.35) * 0.06) * settle;
    model.rotation.x = 0.18 + settle * 0.04;

    camera.position.x += (pointer.x * 0.7 - camera.position.x) * 0.04;
    camera.position.y += (0.6 + pointer.y * 0.4 - camera.position.y) * 0.04;
    camera.lookAt(x * 0.55, y * 0.45, 0);

    renderer.render(scene, camera);
    if (running) frame = requestAnimationFrame(render);
  }

  function onPointer(e: PointerEvent) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  window.addEventListener("pointermove", onPointer, { passive: true });

  return {
    /** Render only while the section is on screen. */
    setRunning(next: boolean) {
      if (next === running) return;
      running = next;
      if (running) frame = requestAnimationFrame(render);
      else cancelAnimationFrame(frame);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
