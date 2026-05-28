import * as THREE from "three";

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

/** Broken torus — energy lives in the shell, not the center. */
function sampleCloud(random: () => number, layer: "mid" | "outer" | "halo" | "inner" = "mid") {
  const theta = random() * Math.PI * 2;
  if (theta > 0.88 && theta < 1.32) return null;

  const phi = Math.acos(random() * 2 - 1);
  let r = 0.82 + random() ** 0.58 * 2.05;
  if (layer === "outer") r = 1.2 + random() ** 0.62 * 1.5;
  if (layer === "halo") r = 1.45 + random() ** 0.7 * 1.25;
  if (layer === "inner" && r > 1.05) return null;

  return {
    x: Math.sin(phi) * Math.cos(theta) * r * (0.9 + random() * 0.22),
    y: Math.cos(phi) * r * (0.74 + random() * 0.32),
    z: Math.sin(phi) * Math.sin(theta) * r + (random() - 0.5) * 0.85,
    r,
    theta,
    phi,
  };
}

function sunColor(random: () => number, radius: number) {
  const shell = Math.max(0, 1 - Math.abs(radius - 1.45) / 1.5);
  const hot = random();
  let r = 0.52 + shell * 0.46 + hot * 0.12;
  let g = 0.04 + shell * 0.42 + hot * 0.28;
  let b = 0.02 + hot * 0.09;
  if (radius > 2.1) {
    r = 0.42 + hot * 0.22;
    g = 0.1 + hot * 0.14;
    b = 0.04;
  }
  if (radius < 0.55) {
    r *= 0.65;
    g *= 0.6;
  }
  return new THREE.Color(r, g, b);
}

function buildThinShards(
  count: number,
  seed: number,
  zBias: number,
  scaleMul: number,
  layer: "mid" | "outer" | "halo" | "inner",
) {
  const random = seededRandom(seed);
  const geometry = new THREE.BoxGeometry(1, 1, 0.08);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  let placed = 0;

  for (let i = 0; i < count; i += 1) {
    const p = sampleCloud(random, layer);
    if (!p) continue;
    const width = (0.014 + random() ** 1.4 * 0.92) * scaleMul;
    const height = (0.007 + random() ** 1.2 * 0.2) * scaleMul;
    const depth = (0.01 + random() ** 1.1 * 0.28) * scaleMul;
    pos.set(p.x, p.y, p.z + zBias);
    rot.set(p.theta + (random() - 0.5) * 1.5, p.phi + (random() - 0.5) * 1.1, (random() - 0.5) * Math.PI);
    quat.setFromEuler(rot);
    scl.set(width, height, depth);
    matrix.compose(pos, quat, scl);
    mesh.setMatrixAt(placed, matrix);
    mesh.setColorAt(placed, sunColor(random, p.r));
    placed += 1;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildMixedShapes(
  kind: "sphere" | "disc",
  count: number,
  seed: number,
  zBias: number,
  scaleMul: number,
  layer: "mid" | "outer" | "halo" | "inner",
) {
  const random = seededRandom(seed);
  const geometry =
    kind === "sphere"
      ? new THREE.SphereGeometry(1, 10, 8)
      : new THREE.CylinderGeometry(1, 1, 1, 12);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  let placed = 0;

  for (let i = 0; i < count; i += 1) {
    const p = sampleCloud(random, layer);
    if (!p) continue;
    if (kind === "sphere") {
      const s = (0.02 + random() ** 1.25 * 0.14) * scaleMul;
      scl.set(s, s * (0.85 + random() * 0.35), s);
    } else {
      const rad = (0.035 + random() ** 1.0 * 0.34) * scaleMul;
      const thick = (0.05 + random() * 0.18) * scaleMul;
      scl.set(rad, thick, rad);
    }
    pos.set(p.x, p.y, p.z + zBias);
    rot.set((random() - 0.5) * 1.1, random() * Math.PI * 2, (random() - 0.5) * 1.1);
    quat.setFromEuler(rot);
    matrix.compose(pos, quat, scl);
    mesh.setMatrixAt(placed, matrix);
    mesh.setColorAt(placed, sunColor(random, p.r));
    placed += 1;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildVoidHalo(count: number, seed: number) {
  const random = seededRandom(seed);
  const geometry = new THREE.BoxGeometry(1, 1, 0.06);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const p = sampleCloud(random, "halo");
    if (!p) continue;
    const w = 0.18 + random() * 1.1;
    const h = 0.03 + random() * 0.28;
    const d = 0.06 + random() * 0.42;
    pos.set(p.x, p.y, p.z - 0.7 - random() * 0.5);
    rot.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    quat.setFromEuler(rot);
    scl.set(w, h, d);
    matrix.compose(pos, quat, scl);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, sunColor(random, p.r));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildParticleLayer(
  count: number,
  seed: number,
  layer: "mid" | "outer" | "halo" | "inner",
  pointSize: number,
  radiusFloor: number,
) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let placed = 0;

  for (let i = 0; i < count; i += 1) {
    const p = sampleCloud(random, layer);
    if (!p || p.r < radiusFloor) continue;
    const o = placed * 3;
    positions[o] = p.x;
    positions[o + 1] = p.y;
    positions[o + 2] = p.z;
    const c = sunColor(random, p.r);
    colors[o] = c.r;
    colors[o + 1] = c.g;
    colors[o + 2] = c.b;
    placed += 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions.slice(0, placed * 3), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors.slice(0, placed * 3), 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: pointSize,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    }),
  );
}

export type ReactorDraftI = {
  setActive: (on: boolean) => void;
  destroy: () => void;
};

export function mountReactor3D(
  container: HTMLElement,
  options: { idleScale?: number; activeScale?: number } = {},
): ReactorDraftI {
  const idleScale = options.idleScale ?? 0.78;
  const activeScale = options.activeScale ?? 1.04;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x140505, 0.014);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(0, 0.05, 7.4);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const root = new THREE.Group();
  const voidG = new THREE.Group();
  const deep = new THREE.Group();
  const mid = new THREE.Group();
  const front = new THREE.Group();
  root.add(voidG, deep, mid, front);
  scene.add(root);

  voidG.add(buildVoidHalo(150, 17));

  deep.add(
    buildThinShards(180, 23, -0.45, 0.92, "outer"),
    buildMixedShapes("sphere", 100, 29, -0.4, 0.9, "outer"),
    buildParticleLayer(418, 31, "outer", 0.036, 0.9),
  );

  const midVolume = [
    buildThinShards(240, 41, -0.08, 1.0, "mid"),
    buildThinShards(200, 47, 0.05, 1.12, "mid"),
    buildMixedShapes("disc", 160, 53, 0.02, 1.0, "mid"),
    buildMixedShapes("sphere", 140, 59, 0.04, 0.95, "mid"),
    buildParticleLayer(572, 61, "mid", 0.038, 0.72),
    buildParticleLayer(462, 67, "mid", 0.062, 0.78),
    buildParticleLayer(308, 73, "mid", 0.1, 0.82),
    buildParticleLayer(176, 79, "mid", 0.15, 0.88),
  ];
  mid.add(...midVolume);

  const frontVolume = [
    buildThinShards(120, 83, 0.28, 0.88, "mid"),
    buildMixedShapes("disc", 90, 89, 0.32, 0.85, "mid"),
    buildMixedShapes("sphere", 100, 97, 0.35, 0.82, "mid"),
    buildParticleLayer(220, 101, "mid", 0.12, 0.75),
    buildParticleLayer(110, 107, "inner", 0.18, 0.65),
  ];
  front.add(...frontVolume);

  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff7020,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  front.add(ember);

  let active = false;
  let activeAmount = 0;
  let visualScale = idleScale;
  let targetScale = idleScale;
  const clock = new THREE.Clock();
  let frame = 0;

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const shells = [voidG, deep, mid, front];

  const render = () => {
    frame = requestAnimationFrame(render);
    const elapsed = clock.getElapsedTime();
    activeAmount += ((active ? 1 : 0) - activeAmount) * 0.05;
    targetScale = idleScale + (activeScale - idleScale) * activeAmount;
    visualScale += (targetScale - visualScale) * 0.06;
    const speed = 1 + activeAmount * 0.1;

    root.scale.setScalar(visualScale);
    root.rotation.x = Math.sin(elapsed * 0.38 * speed) * 0.55;
    root.rotation.y = elapsed * 0.24 * speed + Math.sin(elapsed * 0.26) * 0.32;
    root.rotation.z = Math.sin(elapsed * 0.2 * speed) * 0.24;

    voidG.rotation.y = -elapsed * 0.1 * speed;
    deep.rotation.y = -elapsed * 0.44 * speed;
    mid.rotation.y = elapsed * 0.48 * speed;
    mid.rotation.z = Math.cos(elapsed * 0.4) * 0.28;
    front.rotation.x = Math.sin(elapsed * 0.58) * 0.3;
    front.rotation.y = -elapsed * 0.5 * speed;

    shells.forEach((shell, i) => {
      shell.position.z = Math.sin(elapsed * 0.28 + i) * 0.03 * (1 + activeAmount * 0.3);
    });

    (ember.material as THREE.MeshBasicMaterial).opacity = 0.28 + activeAmount * 0.22;
    ember.scale.setScalar(1 + activeAmount * 0.2);

    renderer.render(scene, camera);
  };
  render();

  return {
    setActive(on) {
      active = on;
    },
    destroy() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      container.removeChild(renderer.domElement);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
    },
  };
}
