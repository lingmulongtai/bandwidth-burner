import * as THREE from "three";

const mount = document.getElementById("threeMount");
const stage = document.getElementById("visualStage");
const visualStatus = document.getElementById("visualStatus");
const visualStreams = document.getElementById("visualStreams");

if (!mount || !stage || !visualStatus || !visualStreams) {
  throw new Error("Visualizer mount not found");
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = {
  running: document.getElementById("app")?.classList.contains("running") ?? false,
  speed: Number(document.getElementById("speed")?.textContent) || 0,
  targetSpeed: Number(document.getElementById("speed")?.textContent) || 0,
  streams: Number(document.getElementById("mode")?.value) || 8,
  totalBytes: 0,
};

let renderer;
let animationFrame;

try {
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  stage.classList.add("no-webgl");
  visualStatus.textContent = "webgl unavailable";
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, reducedMotion ? 1 : 1.75));
renderer.setClearColor(0x05080e, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
mount.appendChild(renderer.domElement);
stage.classList.add("is-ready");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070b12, 0.065);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
camera.position.set(0, 0, 7.3);

const world = new THREE.Group();
scene.add(world);

const cyan = new THREE.Color(0x5cf2d6);
const orange = new THREE.Color(0xff9366);
const deepCyan = new THREE.Color(0x118c84);
const white = new THREE.Color(0xeefcff);

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(170, 255, 242, 0.98)");
  gradient.addColorStop(0.08, "rgba(92, 242, 214, 0.82)");
  gradient.addColorStop(0.32, "rgba(92, 242, 214, 0.22)");
  gradient.addColorStop(1, "rgba(92, 242, 214, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const core = new THREE.Group();
world.add(core);

const glowMaterial = new THREE.SpriteMaterial({
  map: createGlowTexture(),
  color: cyan,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const glow = new THREE.Sprite(glowMaterial);
glow.scale.setScalar(4.5);
core.add(glow);

const innerMaterial = new THREE.MeshBasicMaterial({
  color: 0xc7fff5,
  transparent: true,
  opacity: 0.72,
  blending: THREE.AdditiveBlending,
});
const innerCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 3), innerMaterial);
core.add(innerCore);

const wireMaterial = new THREE.MeshBasicMaterial({
  color: cyan,
  wireframe: true,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const wireCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 2), wireMaterial);
core.add(wireCore);

const outerMaterial = new THREE.MeshBasicMaterial({
  color: orange,
  wireframe: true,
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
});
const outerCore = new THREE.Mesh(new THREE.IcosahedronGeometry(1.32, 1), outerMaterial);
outerCore.rotation.set(0.45, 0.2, 0.65);
core.add(outerCore);

const ringGroup = new THREE.Group();
core.add(ringGroup);

[
  [1.23, 0.014, cyan, 0.54, [1.1, 0.3, 0]],
  [1.55, 0.01, orange, 0.25, [0.15, 1.15, 0.5]],
  [1.83, 0.008, deepCyan, 0.2, [0.7, 0.2, 1.25]],
].forEach(([radius, tube, color, opacity, rotation]) => {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 8, 160),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.set(...rotation);
  ringGroup.add(ring);
});

const streamGroup = new THREE.Group();
world.add(streamGroup);
const packetMeshes = [];
const laneCount = 16;

for (let index = 0; index < laneCount; index += 1) {
  const angle = (index / laneCount) * Math.PI * 2;
  const radius = 3.1 + (index % 3) * 0.35;
  const start = new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.58,
    -5.2 - (index % 4) * 0.55,
  );
  const bend = new THREE.Vector3(
    Math.cos(angle + 0.85) * (1.35 + (index % 2) * 0.35),
    Math.sin(angle + 0.85) * (1.05 + (index % 3) * 0.16),
    -1.6,
  );
  const curve = new THREE.QuadraticBezierCurve3(start, bend, new THREE.Vector3(0, 0, 0));

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
    new THREE.LineBasicMaterial({
      color: index % 5 === 0 ? orange : cyan,
      transparent: true,
      opacity: index < state.streams ? 0.17 : 0.025,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  line.userData.index = index;
  streamGroup.add(line);

  for (let packetIndex = 0; packetIndex < 2; packetIndex += 1) {
    const packet = new THREE.Mesh(
      new THREE.SphereGeometry(packetIndex === 0 ? 0.033 : 0.021, 8, 8),
      new THREE.MeshBasicMaterial({
        color: index % 5 === 0 ? orange : white,
        transparent: true,
        opacity: index < state.streams ? 0.9 : 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    packet.userData = {
      curve,
      lane: index,
      offset: packetIndex * 0.47 + ((index * 0.137) % 1),
    };
    packetMeshes.push(packet);
    streamGroup.add(packet);
  }
}

const particleCount = reducedMotion ? 520 : 1450;
const particlePositions = new Float32Array(particleCount * 3);
const particleColors = new Float32Array(particleCount * 3);
const particleRadius = new Float32Array(particleCount);
const particleAngle = new Float32Array(particleCount);
const particleDepth = new Float32Array(particleCount);

for (let index = 0; index < particleCount; index += 1) {
  const radius = 0.35 + Math.pow(Math.random(), 0.62) * 4.5;
  const angle = Math.random() * Math.PI * 2;
  const depth = -18 + Math.random() * 22;
  particleRadius[index] = radius;
  particleAngle[index] = angle;
  particleDepth[index] = depth;
  particlePositions[index * 3] = Math.cos(angle) * radius;
  particlePositions[index * 3 + 1] = Math.sin(angle) * radius * 0.56;
  particlePositions[index * 3 + 2] = depth;
  const color = Math.random() > 0.92 ? orange : cyan;
  particleColors[index * 3] = color.r;
  particleColors[index * 3 + 1] = color.g;
  particleColors[index * 3 + 2] = color.b;
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
const particles = new THREE.Points(
  particleGeometry,
  new THREE.PointsMaterial({
    size: reducedMotion ? 0.025 : 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.58,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
world.add(particles);

const horizon = new THREE.LineSegments(
  new THREE.WireframeGeometry(new THREE.CylinderGeometry(4.7, 1.1, 15, 20, 7, true)),
  new THREE.LineBasicMaterial({
    color: 0x1b6e68,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  }),
);
horizon.rotation.x = Math.PI / 2;
horizon.position.z = -5.8;
world.add(horizon);

const pointer = new THREE.Vector2();
const targetPointer = new THREE.Vector2();

function onPointerMove(event) {
  const bounds = stage.getBoundingClientRect();
  targetPointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
  targetPointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
}

function onPointerLeave() {
  targetPointer.set(0, 0);
}

stage.addEventListener("pointermove", onPointerMove);
stage.addEventListener("pointerleave", onPointerLeave);

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(stage);
resize();

function updateMetrics(event) {
  const detail = event.detail ?? {};
  state.running = Boolean(detail.running);
  state.targetSpeed = Number.isFinite(detail.speed) ? detail.speed : 0;
  state.streams = Math.max(1, Math.min(laneCount, Number(detail.streams) || 8));
  state.totalBytes = Number(detail.totalBytes) || 0;
  visualStatus.textContent = state.running ? "packet reactor online" : "reactor standby";
  visualStreams.textContent = `${String(state.streams).padStart(2, "0")} active lanes`;

  streamGroup.children.forEach((child) => {
    const lane = child.userData.index ?? child.userData.lane;
    const active = lane < state.streams;
    if (child.material) {
      child.material.opacity = child.isLine ? (active ? 0.17 : 0.025) : active ? 0.9 : 0.06;
    }
  });
}

window.addEventListener("bandwidth:metrics", updateMetrics);

const timer = new THREE.Timer();
timer.connect(document);

function animate(timestamp) {
  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 0.05);
  const elapsed = timer.getElapsed();
  state.speed += (state.targetSpeed - state.speed) * Math.min(1, delta * 3.4);

  const normalized = Math.min(2, Math.sqrt(Math.max(0, state.speed) / 500));
  const activity = state.running ? 0.35 + normalized : 0.055;
  const motionScale = reducedMotion ? 0.28 : 1;

  pointer.lerp(targetPointer, 0.045);
  camera.position.x += (pointer.x * 0.42 - camera.position.x) * 0.025;
  camera.position.y += (-pointer.y * 0.28 - camera.position.y) * 0.025;
  camera.lookAt(0, 0, -0.3);

  core.rotation.y += delta * (0.16 + activity * 0.62) * motionScale;
  core.rotation.x = Math.sin(elapsed * 0.23) * 0.11 + pointer.y * 0.08;
  wireCore.rotation.z -= delta * (0.24 + activity * 0.82) * motionScale;
  outerCore.rotation.y += delta * (0.09 + activity * 0.24) * motionScale;
  ringGroup.rotation.x += delta * (0.08 + activity * 0.2) * motionScale;
  ringGroup.rotation.z -= delta * (0.06 + activity * 0.28) * motionScale;

  const pulse = 1 + Math.sin(elapsed * (2.1 + activity * 3.8)) * (state.running ? 0.055 : 0.018);
  const heat = Math.min(1, normalized / 1.35);
  innerCore.scale.setScalar(pulse * (1 + heat * 0.2));
  glow.scale.setScalar((4.2 + heat * 1.55) * pulse);
  glowMaterial.opacity = 0.32 + activity * 0.24;
  wireMaterial.opacity = 0.32 + activity * 0.26;
  outerMaterial.opacity = 0.08 + heat * 0.2;
  innerMaterial.color.copy(cyan).lerp(orange, Math.max(0, heat - 0.62) * 1.55);

  const packetRate = (0.025 + activity * 0.19) * motionScale;
  packetMeshes.forEach((packet) => {
    const { curve, lane, offset } = packet.userData;
    const progress = (elapsed * packetRate + offset) % 1;
    curve.getPointAt(progress, packet.position);
    const active = lane < state.streams;
    packet.visible = active || progress < 0.08;
    const arrivalPulse = 0.75 + Math.pow(progress, 3) * (1.4 + heat * 2.2);
    packet.scale.setScalar(arrivalPulse);
  });

  const particleSpeed = delta * (0.35 + activity * 7.2) * motionScale;
  for (let index = 0; index < particleCount; index += 1) {
    particleDepth[index] += particleSpeed * (0.72 + (index % 9) * 0.045);
    if (particleDepth[index] > 4.2) particleDepth[index] = -18;
    particleAngle[index] += delta * (0.015 + activity * 0.055) * (index % 2 ? 1 : -1) * motionScale;
    const depthScale = 0.68 + ((particleDepth[index] + 18) / 22) * 0.42;
    particlePositions[index * 3] = Math.cos(particleAngle[index]) * particleRadius[index] * depthScale;
    particlePositions[index * 3 + 1] =
      Math.sin(particleAngle[index]) * particleRadius[index] * 0.56 * depthScale;
    particlePositions[index * 3 + 2] = particleDepth[index];
  }
  particleGeometry.attributes.position.needsUpdate = true;
  particles.material.opacity = 0.28 + activity * 0.25;
  particles.material.size = 0.026 + Math.min(0.035, activity * 0.014);
  horizon.rotation.z += delta * (0.018 + activity * 0.035) * motionScale;
  world.rotation.z = pointer.x * 0.025;

  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(animate);
}

animationFrame = requestAnimationFrame(animate);

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  resizeObserver.disconnect();
  timer.dispose();
  renderer.dispose();
});
