import { useEffect, useRef } from "react";
import * as THREE from "three";

type ChipmunkReactorProps = {
  status: "checking" | "online" | "offline";
  intensity?: "idle" | "active";
};

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function buildBlockLayer(count: number, seed: number, zBias: number) {
  const random = seededRandom(seed);
  const geometry = new THREE.BoxGeometry(1, 1, 0.08);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let index = 0; index < count; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    const shell = 0.72 + random() * 2.15;
    const width = 0.08 + random() * 0.52;
    const height = 0.028 + random() * 0.14;
    const depth = 0.04 + random() * 0.16;
    const hot = random();
    const color = new THREE.Color().setRGB(1, 0.04 + hot * 0.28, hot * 0.04);
    const x = Math.sin(phi) * Math.cos(theta) * shell;
    const y = Math.cos(phi) * shell * (0.88 + random() * 0.18);
    const z = Math.sin(phi) * Math.sin(theta) * shell + (random() - 0.5) * 0.55 + zBias;

    position.set(x, y, z);
    rotation.set(theta + (random() - 0.5) * 1.4, phi + (random() - 0.5) * 1.1, (random() - 0.5) * Math.PI);
    quaternion.setFromEuler(rotation);
    scale.set(width, height, depth);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh };
}

function buildParticleCloud(count: number, seed: number, radiusFloor = 0.3) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    const shell = radiusFloor + random() * 2.65;
    const offset = index * 3;
    positions[offset] = Math.sin(phi) * Math.cos(theta) * shell;
    positions[offset + 1] = Math.cos(phi) * shell * 0.95;
    positions[offset + 2] = Math.sin(phi) * Math.sin(theta) * shell + (random() - 0.5) * 0.7;
    colors[offset] = 1;
    colors[offset + 1] = 0.1 + random() * 0.42;
    colors[offset + 2] = random() * 0.045;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.092,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });

  return new THREE.Points(geometry, material);
}

function buildArcLayer(seed: number) {
  const random = seededRandom(seed);
  const group = new THREE.Group();

  for (let arc = 0; arc < 44; arc += 1) {
    const radius = 0.38 + random() * 2.38;
    const start = random() * Math.PI * 2;
    const length = 0.14 + random() * 1.35;
    const z = (random() - 0.5) * 1.9;
    const points: THREE.Vector3[] = [];

    for (let step = 0; step < 22; step += 1) {
      const amount = step / 21;
      const angle = start + length * amount;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * (0.68 + random() * 0.36),
          z + Math.sin(amount * Math.PI) * (0.16 + random() * 0.34),
        ),
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: random() > 0.35 ? 0xff2a2a : 0xff7a24,
      transparent: true,
      opacity: 0.44 + random() * 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.rotation.x = (random() - 0.5) * 1.1;
    line.rotation.y = (random() - 0.5) * 1.3;
    group.add(line);
  }

  return group;
}

export function ChipmunkReactor({ status, intensity = "idle" }: ChipmunkReactorProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(false);
  const statusRef = useRef(status);
  const intensityRef = useRef(intensity);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 7.1);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const root = new THREE.Group();
    const deepShell = new THREE.Group();
    const midShell = new THREE.Group();
    const frontShell = new THREE.Group();
    root.add(deepShell, midShell, frontShell);
    scene.add(root);

    const backBlocks = buildBlockLayer(340, 11, -0.35);
    const frontBlocks = buildBlockLayer(300, 29, 0.48);
    deepShell.add(backBlocks.mesh);
    frontShell.add(frontBlocks.mesh);

    const particlesFine = buildParticleCloud(620, 41, 0.24);
    const particlesHot = buildParticleCloud(340, 67, 0.18);
    particlesHot.material.size = 0.15;
    midShell.add(particlesFine, particlesHot);

    const arcs = buildArcLayer(83);
    midShell.add(arcs);

    const core = new THREE.Group();
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2a2a,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreBall = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 16), coreMaterial);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5a24,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.018, 12, 96), haloMaterial);
    const innerHalo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 12, 80), haloMaterial.clone());
    innerHalo.material.opacity = 0.62;
    core.add(coreBall, halo, innerHalo);
    frontShell.add(core);

    let activeAmount = 0;
    let frame = 0;
    const clock = new THREE.Clock();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    const render = () => {
      frame = window.requestAnimationFrame(render);
      const elapsed = clock.getElapsedTime();
      const target = (activeRef.current || intensityRef.current === "active") && !reduceMotion ? 1 : 0;
      activeAmount += (target - activeAmount) * 0.045;
      const statusBoost = statusRef.current === "offline" ? 0.82 : 1;
      const speed = reduceMotion ? 0.08 : statusBoost * (1 + activeAmount * 0.08);
      const spread = 1.08 + activeAmount * 0.24;

      root.scale.setScalar(spread);
      root.rotation.x = Math.sin(elapsed * 0.42 * speed) * 0.72 + Math.cos(elapsed * 0.19) * 0.2;
      root.rotation.y = elapsed * 0.28 * speed + Math.sin(elapsed * 0.31) * 0.42;
      root.rotation.z = Math.sin(elapsed * 0.24 * speed) * 0.34;

      deepShell.rotation.y = -elapsed * 0.5 * speed;
      deepShell.rotation.x = Math.sin(elapsed * 0.8) * 0.24;
      midShell.rotation.y = elapsed * 0.56 * speed;
      midShell.rotation.z = Math.cos(elapsed * 0.5) * 0.38;
      frontShell.rotation.x = Math.sin(elapsed * 0.72) * 0.42;
      frontShell.rotation.y = -elapsed * 0.64 * speed;

      particlesFine.rotation.y = elapsed * 0.18 * speed;
      particlesHot.rotation.x = -elapsed * 0.22 * speed;
      arcs.rotation.z = elapsed * 0.18 * speed;
      arcs.rotation.y = Math.sin(elapsed * 0.47) * 0.8;

      core.rotation.x = elapsed * 1.2 * speed;
      core.rotation.y = elapsed * 1.7 * speed;
      core.scale.setScalar(1 + Math.sin(elapsed * 4.3) * 0.08 + activeAmount * 0.14);

      const flicker = 0.72 + Math.sin(elapsed * 17.0) * 0.08 + Math.sin(elapsed * 29.0) * 0.045 + activeAmount * 0.16;
      (particlesFine.material as THREE.PointsMaterial).opacity = flicker;
      (particlesHot.material as THREE.PointsMaterial).opacity = Math.min(1, flicker + 0.18);
      (frontBlocks.mesh.material as THREE.MeshBasicMaterial).opacity = 0.78 + activeAmount * 0.12 + Math.sin(elapsed * 4.6) * 0.04;
      (backBlocks.mesh.material as THREE.MeshBasicMaterial).opacity = 0.64 + activeAmount * 0.1 + Math.cos(elapsed * 3.9) * 0.05;

      renderer.render(scene, camera);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mount.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className="reactor-3d"
      ref={mountRef}
      onPointerEnter={() => {
        activeRef.current = true;
      }}
      onPointerLeave={() => {
        activeRef.current = false;
      }}
    />
  );
}
