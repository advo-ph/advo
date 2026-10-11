import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * The 3D devices behind the portfolio: a MacBook Pro 14" and an iPhone 15
 * Pro, built to their real proportions (1 unit = 10 cm). The scene reads two
 * numbers: `turn`, the scroll through the section, and `pos`, the project in
 * front as a fraction, which holds still a while at each project. From them it:
 *  - turns the device in one slow sweep off `turn`, so the turn
 *    never resets between projects,
 *  - wipes the next screenshot up over the current one on the screen,
 *  - hands over from the laptop to the phone where the project type changes:
 *    the lid closes as the MacBook slides off past the left edge, and the
 *    iPhone swings in from past the right edge.
 * It draws only when something changed and only while it is on screen.
 */
export interface DeviceShot {
  url: string;
  phone: boolean;
}

// MacBook Pro 14"
const MAC_W = 3.126;
const MAC_D = 2.212;
const MAC_BASE_H = 0.105;
const MAC_LID_T = 0.048;
const MAC_OPEN = THREE.MathUtils.degToRad(-14); // lid leaned back past upright
const MAC_SHUT = THREE.MathUtils.degToRad(90);
const DISPLAY_W = MAC_W - 0.11;
const DISPLAY_H = 1.96;
const DISPLAY_BOTTOM = 0.2;

// iPhone 15 Pro
const PHONE_W = 0.709;
const PHONE_H = 1.467;
const PHONE_T = 0.0825;
const PHONE_R = 0.11;
const PHONE_SCREEN_W = PHONE_W - 0.046;
const PHONE_SCREEN_H = PHONE_H - 0.046;

/** The turn across the whole section, in radians, first project to last. */
const SWEEP_FROM = 0.34;
const SWEEP_TO = -0.34;
const FOV = 26;
const CAMERA_TILT = THREE.MathUtils.degToRad(9);
/**
 * How much larger than its frame box the MacBook shows. On a phone it may run
 * past the sides; on a wide screen the heading and caption bound it instead.
 */
const MAC_ZOOM_NARROW = 1.35;
const MAC_ZOOM_WIDE = 1.04;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = THREE.MathUtils.lerp;

function roundedRect(w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A flat rounded-rect panel in the XY plane with UVs that span 0 to 1. */
function panel(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 24);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / w + 0.5;
    uv[i * 2 + 1] = p.getY(i) / h + 0.5;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** A rounded slab: shape in XY, thickness along Z, centered on z = 0. */
function slab(w: number, h: number, t: number, r: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel)), {
    depth: t - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 28,
  });
  g.translate(0, 0, -(t - bevel * 2) / 2);
  return g;
}

const SCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Two screenshots, cover-fit to the top of the screen. B wipes up from the
// bottom over A as uWipe goes 0 to 1, rising a little as it comes, and A
// dims under it.
const SCREEN_FRAG = /* glsl */ `
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uAspA;
  uniform float uAspB;
  uniform float uHasA;
  uniform float uHasB;
  uniform float uAsp;
  uniform float uWipe;
  varying vec2 vUv;

  vec2 cover(vec2 uv, float ia) {
    if (ia > uAsp) uv.x = 0.5 + (uv.x - 0.5) * uAsp / ia;
    else uv.y = 1.0 - (1.0 - uv.y) * ia / uAsp;
    return uv;
  }

  void main() {
    vec3 blank = vec3(0.07);
    vec3 a = mix(blank, texture2D(uA, cover(vUv, uAspA)).rgb, uHasA);
    vec2 bUv = vUv;
    bUv.y = clamp(bUv.y + (1.0 - uWipe) * 0.12, 0.0, 1.0);
    vec3 b = mix(blank, texture2D(uB, cover(bUv, uAspB)).rgb, uHasB);
    a *= 1.0 - 0.2 * uWipe;
    float edge = uWipe * 1.002;
    float showB = step(vUv.y, edge) * step(0.0005, uWipe);
    // A soft shade on A right above the rising edge.
    float shade = (1.0 - smoothstep(0.0, 0.05, vUv.y - edge)) * step(edge, vUv.y) * step(0.0005, uWipe);
    a *= 1.0 - 0.25 * shade;
    vec3 col = mix(a, b, showB);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function screenMaterial(aspect: number) {
  return new THREE.ShaderMaterial({
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
    uniforms: {
      uA: { value: null },
      uB: { value: null },
      uAspA: { value: 1 },
      uAspB: { value: 1 },
      uHasA: { value: 0 },
      uHasB: { value: 0 },
      uAsp: { value: aspect },
      uWipe: { value: 0 },
    },
    toneMapped: false,
  });
}

interface KeyRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** The 14" keyboard: a short function row, then five full rows, 14.5 keys wide. */
function keyboardLayout(u: number, z0: number) {
  const rows: { h: number; keys: number[] }[] = [
    { h: 0.55, keys: Array.from({ length: 14 }, () => 14.5 / 14) },
    { h: 1, keys: [...Array(13).fill(1), 1.5] },
    { h: 1, keys: [1.5, ...Array(13).fill(1)] },
    { h: 1, keys: [1.75, ...Array(11).fill(1), 1.75] },
    { h: 1, keys: [2.25, ...Array(10).fill(1), 2.25] },
    { h: 1, keys: [1, 1, 1, 1.25, 5, 1.25, 1, 1, 1, 1] },
  ];
  const gap = 0.024;
  const keys: KeyRect[] = [];
  let z = z0;
  for (const [r, row] of rows.entries()) {
    let x = (-14.5 * u) / 2;
    const d = row.h * u;
    for (const [k, w] of row.keys.entries()) {
      const width = w * u;
      // The up and down arrows share one key slot, each half height.
      if (r === 5 && k === 8) {
        keys.push({ x: x + width / 2, z: z + d * 0.25, w: width - gap, d: d / 2 - gap });
        keys.push({ x: x + width / 2, z: z + d * 0.75, w: width - gap, d: d / 2 - gap });
      } else if (r === 5 && (k === 7 || k === 9)) {
        keys.push({ x: x + width / 2, z: z + d * 0.75, w: width - gap, d: d / 2 - gap });
      } else {
        keys.push({ x: x + width / 2, z: z + d / 2, w: width - gap, d: d - gap });
      }
      x += width;
    }
    z += d;
  }
  return { keys, zEnd: z, width: 14.5 * u };
}

/** The top of the base: keyboard well, speaker grilles and the trackpad. */
function deckTexture(kb: { zEnd: number; width: number }, z0: number, pad: { z: number; w: number; d: number }) {
  const cw = 2048;
  const ch = Math.round((cw * MAC_D) / MAC_W);
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const g = c.getContext("2d")!;
  const px = (x: number) => ((x + MAC_W / 2) / MAC_W) * cw;
  const pz = (z: number) => ((z + MAC_D / 2) / MAC_D) * ch;
  const k = cw / MAC_W;

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, cw, ch);
  // The map multiplies the dark base colour, so these greys stay dark.

  // Keyboard well
  const m = 0.035;
  g.fillStyle = "#26272a";
  g.beginPath();
  g.roundRect(px(-kb.width / 2 - m), pz(z0 - m), (kb.width + m * 2) * k, (kb.zEnd - z0 + m * 2) * k, 0.03 * k);
  g.fill();

  // Speaker grilles either side of the keyboard
  g.fillStyle = "#3a3b3e";
  const gx0 = kb.width / 2 + m + 0.05;
  const gx1 = MAC_W / 2 - 0.11;
  const step = 0.0165;
  for (const side of [-1, 1]) {
    for (let x = gx0; x <= gx1; x += step) {
      for (let z = z0; z <= kb.zEnd; z += step) {
        g.beginPath();
        g.arc(px(side * x), pz(z), 0.0042 * k, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // Trackpad: a hair lighter, with a fine edge
  g.fillStyle = "#f2f2f3";
  g.strokeStyle = "#8c8e92";
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(px(-pad.w / 2), pz(pad.z - pad.d / 2), pad.w * k, pad.d * k, 0.04 * k);
  g.fill();
  g.stroke();

  // The finger scoop on the front edge
  const scoop = g.createLinearGradient(0, ch - 0.06 * k, 0, ch);
  scoop.addColorStop(0, "rgba(0,0,0,0)");
  scoop.addColorStop(1, "rgba(0,0,0,0.28)");
  g.fillStyle = scoop;
  g.beginPath();
  g.ellipse(cw / 2, ch, 0.36 * k, 0.05 * k, 0, Math.PI, 0);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "rgba(0,0,0,0.55)");
  r.addColorStop(0.55, "rgba(0,0,0,0.22)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function buildMacBook(aluminum: THREE.Material, darkMetal: THREE.Material, blackGlass: THREE.Material) {
  const mac = new THREE.Group();

  // Base, lying in XZ with its bottom at y = 0
  const baseGeo = slab(MAC_W, MAC_D, MAC_BASE_H, 0.12, 0.022);
  baseGeo.rotateX(-Math.PI / 2);
  baseGeo.translate(0, MAC_BASE_H / 2, 0);
  mac.add(new THREE.Mesh(baseGeo, aluminum));

  const u = 0.18;
  const z0 = -MAC_D / 2 + 0.2;
  const kb = keyboardLayout(u, z0);
  const pad = { w: 1.5, d: 0.8, z: MAC_D / 2 - 0.08 - 0.4 };

  const deckGeo = panel(MAC_W - 0.05, MAC_D - 0.05, 0.1);
  deckGeo.rotateX(-Math.PI / 2);
  const deckMat = (aluminum as THREE.MeshPhysicalMaterial).clone();
  deckMat.map = deckTexture(kb, z0, pad);
  deckMat.polygonOffset = true;
  deckMat.polygonOffsetFactor = -1;
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = MAC_BASE_H + 0.0004;
  mac.add(deck);

  const keyGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.62, metalness: 0.05 });
  const keys = new THREE.InstancedMesh(keyGeo, keyMat, kb.keys.length);
  const m4 = new THREE.Matrix4();
  kb.keys.forEach((key, i) => {
    m4.compose(
      new THREE.Vector3(key.x, MAC_BASE_H + 0.006, key.z),
      new THREE.Quaternion(),
      new THREE.Vector3(key.w, 0.014, key.d),
    );
    keys.setMatrixAt(i, m4);
  });
  mac.add(keys);

  // Hinge barrel along the back edge
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, MAC_W * 0.8, 32), darkMetal);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, MAC_BASE_H * 0.55, -MAC_D / 2 + 0.035);
  mac.add(hinge);

  // Lid, hinged on the back edge. Built upright: bottom at y = 0, screen
  // facing +z with its face at z = 0.
  const lid = new THREE.Group();
  lid.position.set(0, MAC_BASE_H + 0.012, -MAC_D / 2 + 0.03);
  mac.add(lid);

  const shellGeo = slab(MAC_W, MAC_D, MAC_LID_T, 0.12, 0.016);
  shellGeo.translate(0, MAC_D / 2, -MAC_LID_T / 2);
  lid.add(new THREE.Mesh(shellGeo, aluminum));

  const bezelGeo = panel(MAC_W - 0.034, MAC_D - 0.034, 0.105);
  bezelGeo.translate(0, MAC_D / 2, 0.0006);
  lid.add(new THREE.Mesh(bezelGeo, blackGlass));

  const screenMat = screenMaterial(DISPLAY_W / DISPLAY_H);
  const displayGeo = panel(DISPLAY_W, DISPLAY_H, 0.035);
  displayGeo.translate(0, DISPLAY_BOTTOM + DISPLAY_H / 2, 0.0012);
  lid.add(new THREE.Mesh(displayGeo, screenMat));

  return { mac, lid, screenMat };
}

function buildIPhone(titanium: THREE.Material, blackGlass: THREE.Material) {
  const phone = new THREE.Group();

  const body = new THREE.Mesh(slab(PHONE_W, PHONE_H, PHONE_T, PHONE_R, 0.02), [blackGlass, titanium]);
  phone.add(body);

  // Frosted glass back
  const backMat = new THREE.MeshPhysicalMaterial({ color: 0xbdb8ae, roughness: 0.55, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.6 });
  const back = new THREE.Mesh(panel(PHONE_W - 0.04, PHONE_H - 0.04, PHONE_R - 0.02), backMat);
  back.rotation.y = Math.PI;
  back.position.z = -PHONE_T / 2 - 0.0006;
  phone.add(back);

  // Camera plateau with three lenses, the flash and the LiDAR
  const plateau = new THREE.Group();
  plateau.position.set(PHONE_W / 2 - 0.22, PHONE_H / 2 - 0.22, -PHONE_T / 2);
  plateau.rotation.y = Math.PI;
  phone.add(plateau);
  const bump = new THREE.Mesh(slab(0.37, 0.37, 0.024, 0.085, 0.008), backMat);
  bump.position.z = 0.006;
  plateau.add(bump);
  const ringGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.03, 40);
  ringGeo.rotateX(Math.PI / 2);
  const lensGeo = new THREE.CircleGeometry(0.05, 40);
  const pupilGeo = new THREE.CircleGeometry(0.022, 32);
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x07080c, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  const pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x1b2440, roughness: 0.1, metalness: 0.4, clearcoat: 1 });
  for (const [x, y] of [[-0.085, 0.085], [-0.085, -0.085], [0.088, 0]]) {
    const ring = new THREE.Mesh(ringGeo, titanium);
    ring.position.set(x, y, 0.028);
    plateau.add(ring);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(x, y, 0.0435);
    plateau.add(lens);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(x, y, 0.044);
    plateau.add(pupil);
  }
  const flash = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.3 }));
  flash.position.set(0.09, 0.115, 0.0185);
  plateau.add(flash);
  const lidar = new THREE.Mesh(new THREE.CircleGeometry(0.02, 24), lensMat);
  lidar.position.set(0.09, -0.115, 0.0185);
  plateau.add(lidar);

  // Side buttons: action and volume on the left, power on the right
  const buttonGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.4);
  const button = (x: number, y: number, len: number) => {
    const b = new THREE.Mesh(buttonGeo, titanium);
    b.scale.set(0.016, len, 0.03);
    b.position.set(x, y, 0);
    phone.add(b);
  };
  const left = -PHONE_W / 2 - 0.002;
  button(left, PHONE_H / 2 - 0.27, 0.07);
  button(left, PHONE_H / 2 - 0.42, 0.13);
  button(left, PHONE_H / 2 - 0.58, 0.13);
  button(PHONE_W / 2 + 0.002, PHONE_H / 2 - 0.48, 0.2);

  // The display runs nearly edge to edge with no island over the picture.
  // No glass layer over either screen: its reflection of the key light washed
  // the whole picture out at some angles.
  const screenMat = screenMaterial(PHONE_SCREEN_W / PHONE_SCREEN_H);
  const display = new THREE.Mesh(panel(PHONE_SCREEN_W, PHONE_SCREEN_H, 0.088), screenMat);
  display.position.z = PHONE_T / 2 + 0.0008;
  phone.add(display);

  return { phone, screenMat };
}

/**
 * `canvas` covers the whole stage, so a device may run past the box it is
 * framed in. `frameBox` is that box: the device is sized and centered to it,
 * so the screen itself always shows in full.
 */
export function createDevicesScene(canvas: HTMLCanvasElement, frameBox: HTMLElement, shots: DeviceShot[]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.035);
  scene.environment = envTarget.texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-3, 6, 5);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0xd8d8dc, 0.4));

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  // Space black aluminium: a soft satin with a little sheen. The room lights
  // sit right behind the camera, so much shinier flares white when the
  // MacBook faces front.
  const aluminum = new THREE.MeshPhysicalMaterial({ color: 0x3b3c40, metalness: 0.72, roughness: 0.52, envMapIntensity: 0.55 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.8, roughness: 0.45 });
  const titanium = new THREE.MeshPhysicalMaterial({ color: 0xa9a59d, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
  // The black frame round each screen: a faint gloss, never a mirror.
  const blackGlass = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.72, metalness: 0, envMapIntensity: 0.22 });

  const { mac, lid, screenMat: macScreen } = buildMacBook(aluminum, darkMetal, blackGlass);
  const { phone, screenMat: phoneScreen } = buildIPhone(titanium, blackGlass);

  // Each device turns about its own visual center.
  const macPivot = new THREE.Group();
  mac.position.set(0, -0.92, 0.2);
  macPivot.add(mac);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(MAC_W * 1.35, MAC_D * 1.45),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.002;
  mac.add(shadow);
  const phonePivot = new THREE.Group();
  phonePivot.add(phone);
  scene.add(macPivot, phonePivot);

  // Screenshots
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures: (THREE.Texture | null)[] = shots.map(() => null);
  let dirty = true;
  shots.forEach((shot, i) => {
    loader.load(
      shot.url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        tex.generateMipmaps = true;
        textures[i] = tex;
        dirty = true;
      },
      undefined,
      () => {
        // A missing picture leaves that screen dark; the text still reads.
      },
    );
  });

  const count = shots.length;
  const isPhone = shots.map((s) => (s.phone ? 1 : 0));

  function setScreen(mat: THREE.ShaderMaterial, a: number, b: number, wipe: number) {
    const ta = textures[a] ?? null;
    const tb = textures[b] ?? null;
    const u = mat.uniforms;
    u.uA.value = ta;
    u.uB.value = tb;
    u.uHasA.value = ta ? 1 : 0;
    u.uHasB.value = tb ? 1 : 0;
    const img = (t: THREE.Texture | null) => t?.image as { width: number; height: number } | undefined;
    u.uAspA.value = img(ta) ? img(ta)!.width / img(ta)!.height : 1;
    u.uAspB.value = img(tb) ? img(tb)!.width / img(tb)!.height : 1;
    u.uWipe.value = wipe;
  }

  /** The screens for one device type: the two shots either side of `sp`. */
  function pairFor(type: number, sp: number) {
    const i = Math.min(count - 1, Math.floor(sp));
    const j = Math.min(count - 1, i + 1);
    const f = sp - i;
    const iOk = isPhone[i] === type;
    const jOk = isPhone[j] === type;
    if (iOk && jOk) return [i, j, j === i ? 0 : f] as const;
    if (iOk) return [i, i, 0] as const;
    if (jOk) return [j, j, 0] as const;
    // Neither neighbour is this type: show the nearest one of it.
    let best = 0;
    let dist = Infinity;
    for (let k = 0; k < count; k++) {
      if (isPhone[k] === type && Math.abs(k - sp) < dist) {
        dist = Math.abs(k - sp);
        best = k;
      }
    }
    return [best, best, 0] as const;
  }

  let pos = 0;
  let turn = 0;
  let width = 0;
  let height = 0;

  function frame() {
    const sp = Math.min(count - 1, Math.max(0, pos));
    const i = Math.min(count - 1, Math.floor(sp));
    const j = Math.min(count - 1, i + 1);
    const f = sp - i;
    const q = lerp(isPhone[i], isPhone[j], f); // 0 = laptop, 1 = phone

    const progress = count > 1 ? turn / (count - 1) : 0;
    const sweep = lerp(SWEEP_FROM, SWEEP_TO, progress);

    // Frame whichever device is in front; blend the framing between them.
    // Each one fills the frame box: the MacBook by its lid, scaled up so
    // it may run past the box, and the iPhone whole, since it is
    // nearly all screen.
    const aspect = width / height;
    const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const boxShare = boxH / height; // the frame box's share of the view height
    const roomShare = roomH / height; // the same, with the box's margins
    const macFill = Math.min(width < 760 ? 0.8 : 0.9, 1240 / width);
    const macDist = (Math.max(MAC_W / macFill / (2 * tanH * aspect), 2.7 / (2 * tanH * boxShare)) + 0.6) / (width < 760 ? MAC_ZOOM_NARROW : MAC_ZOOM_WIDE);
    const phoneDist = Math.max(PHONE_W / 0.8 / (2 * tanH * aspect), (PHONE_H * 1.1) / (2 * tanH * roomShare));
    const dist = lerp(macDist, phoneDist, smooth(0.15, 0.9, q));
    camera.position.set(0, Math.sin(CAMERA_TILT) * dist, Math.cos(CAMERA_TILT) * dist);
    camera.lookAt(0, 0, 0);
    /** Half the view width at depth z, plus `pad`: past here is off screen. */
    const offscreen = (z: number, pad: number) => (dist - z) * tanH * aspect + pad;

    // MacBook: the lid closes, then it slides off past the left edge and back.
    const shut = smooth(0, 0.55, q);
    const away = smooth(0.2, 1, q);
    lid.rotation.x = lerp(MAC_OPEN, MAC_SHUT, shut);
    macPivot.visible = q < 0.999;
    macPivot.rotation.set(0, sweep + away * 0.7, 0);
    macPivot.position.set(-away * offscreen(-1.6, MAC_W * 0.75), -away * 0.25, -away * 1.6);

    // iPhone: swings in from past the right edge, turned edge-on at first.
    const come = smooth(0.25, 1, q);
    phonePivot.visible = q > 0.001;
    phonePivot.rotation.set(0.04, sweep - (1 - come) * 1.25, (1 - come) * -0.12);
    phonePivot.position.set((1 - come) * offscreen(-1.2, PHONE_H), 0, -(1 - come) * 1.2);

    const [ma, mb, mw] = pairFor(0, sp);
    setScreen(macScreen, ma, mb, mw);
    const [pa, pb, pw] = pairFor(1, sp);
    setScreen(phoneScreen, pa, pb, pw);

    renderer.render(scene, camera);
  }

  let boxH = 1;
  let roomH = 1;
  let boxShift = 0;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const c = canvas.getBoundingClientRect();
    const b = frameBox.getBoundingClientRect();
    const nextBoxH = Math.max(1, b.height);
    const style = getComputedStyle(frameBox);
    // The iPhone is nearly all screen, so it may also use the box's margins.
    roomH = nextBoxH + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    // How far the frame box's middle sits below the canvas middle.
    const shift = b.top + b.height / 2 - (c.top + c.height / 2);
    if (w === width && h === height && nextBoxH === boxH && shift === boxShift) return;
    width = w;
    height = h;
    boxH = nextBoxH;
    boxShift = shift;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Slide the view so the device centers on the frame box, not the canvas.
    camera.setViewOffset(w, h, 0, -shift, w, h);
    camera.updateProjectionMatrix();
    dirty = true;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  ro.observe(frameBox);
  resize();

  let running = false;
  let raf = 0;
  const tick = () => {
    raf = 0;
    if (!running) return;
    if (dirty && width && height) {
      dirty = false;
      frame();
    }
    raf = requestAnimationFrame(tick);
  };

  return {
    /** `value`: the project in front. `turnValue`: the same, with no holds. */
    setPos(value: number, turnValue: number) {
      if (value === pos && turnValue === turn) return;
      pos = value;
      turn = turnValue;
      dirty = true;
    },
    setRunning(value: boolean) {
      running = value;
      if (running && !raf) raf = requestAnimationFrame(tick);
    },
    dispose() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) {
          for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
          m.dispose();
        }
      });
      textures.forEach((t) => t?.dispose());
      envTarget.dispose();
      renderer.dispose();
    },
  };
}
