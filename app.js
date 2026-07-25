import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* =========================================================================
 * 3D Viewer
 * ========================================================================= */
const GROUP_LABELS = {
  bojo: "Bojo (casco de madeira)",
  arquilha_externa: "Arquilha externa de sustentação do bojo",
  arquilha_interna: "Arquilha interna de sustentação do bojo",
  aro_cima: "Aro de cima",
  suporte: "Suportes para o bojo no aro de baixo",
  aro_baixo: "Aro de baixo",
  orelha: "Orelhas furadas",
  esticador: "Esticadores",
  arquilha_couro: "Arquilha do couro",
  base_circular: "Base circular",
  pe: "Pés",
  bojo_aro_topo: "Aba superior do bojo (madeira)",
};
const GROUP_QTY = { bojo: 1, arquilha_externa: 1, arquilha_interna: 1, aro_cima: 1, suporte: 3, aro_baixo: 1, orelha: 15, esticador: 6, arquilha_couro: 1, base_circular: 1, pe: 3, bojo_aro_topo: 1 };
const WOOD_GROUPS = new Set(["bojo", "bojo_aro_topo"]);

const canvasWrap = document.getElementById("viewer-canvas");
const partLabelEl = document.getElementById("part-label");
const partsListEl = document.getElementById("parts-list");
const woodToggle = document.getElementById("toggle-wood");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
canvasWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11151a);

const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
camera.position.set(1200, 900, 1400);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 300, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(600, 900, 700);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-700, 400, -500);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.4);
rim.position.set(0, -400, -800);
scene.add(rim);

const modelRoot = new THREE.Group();
// Source STEP data is Z-up; rotate to three.js's Y-up convention.
modelRoot.rotation.x = -Math.PI / 2;
scene.add(modelRoot);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoverMesh = null;
let selectedGroup = null;
const meshesByGroup = {};
const originalMaterials = new Map();

const highlightColor = new THREE.Color(0xffb703);

function resizeRenderer() {
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resizeRenderer);

function setMeshHighlight(mesh, on) {
  if (!mesh.material) return;
  if (on) {
    if (!originalMaterials.has(mesh)) originalMaterials.set(mesh, mesh.material);
    if (!mesh.userData.__highlightMat) {
      mesh.userData.__highlightMat = mesh.material.clone();
      mesh.userData.__highlightMat.emissive = highlightColor;
      mesh.userData.__highlightMat.emissiveIntensity = 0.55;
    }
    mesh.material = mesh.userData.__highlightMat;
  } else {
    if (originalMaterials.has(mesh)) mesh.material = originalMaterials.get(mesh);
  }
}

function clearSelection() {
  if (selectedGroup && meshesByGroup[selectedGroup]) {
    meshesByGroup[selectedGroup].forEach((m) => setMeshHighlight(m, false));
  }
  selectedGroup = null;
  partLabelEl.classList.add("hidden");
  partsListEl.querySelectorAll("li").forEach((li) => li.classList.remove("active"));
}

function selectGroup(group, opts = {}) {
  clearSelection();
  selectedGroup = group;
  (meshesByGroup[group] || []).forEach((m) => setMeshHighlight(m, true));
  const label = GROUP_LABELS[group] || group;
  const qty = GROUP_QTY[group] || 1;
  partLabelEl.textContent = qty > 1 ? `${label} (${qty} peças)` : label;
  partLabelEl.classList.remove("hidden");
  const li = partsListEl.querySelector(`li[data-group="${group}"]`);
  if (li) {
    li.classList.add("active");
    if (opts.scrollIntoView) li.scrollIntoView({ block: "nearest" });
  }
}

function buildPartsList(metadata) {
  // group order: follow first-seen order in metadata / BOM-ish priority
  const order = ["bojo", "arquilha_externa", "arquilha_interna", "aro_cima", "aro_baixo", "suporte", "orelha", "esticador", "arquilha_couro", "base_circular", "pe", "bojo_aro_topo"];
  const groupColor = {};
  Object.values(metadata).forEach((info) => {
    if (!(info.group in groupColor)) groupColor[info.group] = colorForGroup(info.group);
  });

  let html = "";
  order.forEach((group) => {
    if (!meshesByGroup[group]) return;
    const label = GROUP_LABELS[group] || group;
    const qty = GROUP_QTY[group] || 1;
    html += `<li data-group="${group}">
      <span class="swatch" style="background:${groupColor[group]}"></span>
      <span>${label}</span>
      <span class="qty">${qty > 1 ? qty + "x" : ""}</span>
    </li>`;
  });
  partsListEl.innerHTML = html;
  partsListEl.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => selectGroup(li.dataset.group));
    li.addEventListener("mouseenter", () => {
      (meshesByGroup[li.dataset.group] || []).forEach((m) => setMeshHighlight(m, true));
    });
    li.addEventListener("mouseleave", () => {
      if (selectedGroup === li.dataset.group) return;
      (meshesByGroup[li.dataset.group] || []).forEach((m) => setMeshHighlight(m, false));
    });
  });
}

function colorForGroup(group) {
  const colors = {
    wood: "#8a6240", chata: "#b0b4b8", cantoneira: "#6f7a86",
    varao14: "#d7b25c", varao12: "#8fae6b", esticador: "#5c9ec9", pe: "#c96b5c",
  };
  // map GROUP (semantic) to material-group used at export time
  const semanticToExportGroup = {
    bojo: "wood", bojo_aro_topo: "wood",
    arquilha_externa: "chata", arquilha_interna: "chata", aro_cima: "chata", aro_baixo: "chata", suporte: "chata",
    orelha: "cantoneira", arquilha_couro: "varao14", base_circular: "varao12",
    esticador: "esticador", pe: "pe",
  };
  return colors[semanticToExportGroup[group]] || "#cccccc";
}

async function loadModel() {
  const [gltf, metadata] = await Promise.all([
    new GLTFLoader().loadAsync("assets/engome.glb"),
    fetch("assets/engome-parts.json").then((r) => r.json()),
  ]);

  gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const info = metadata[obj.name];
    if (!info) return;
    obj.userData.info = info;
    const group = info.group;
    // remap export-time group -> semantic list group for esticador/pe (already same key)
    let semanticGroup = group;
    if (info.key.startsWith("suporte")) semanticGroup = "suporte";
    else if (info.key.startsWith("orelha")) semanticGroup = "orelha";
    else if (info.key.startsWith("esticador")) semanticGroup = "esticador";
    else if (info.key.startsWith("pe_")) semanticGroup = "pe";
    else semanticGroup = info.key;

    obj.userData.semanticGroup = semanticGroup;
    if (!meshesByGroup[semanticGroup]) meshesByGroup[semanticGroup] = [];
    meshesByGroup[semanticGroup].push(obj);
  });

  modelRoot.add(gltf.scene);
  buildPartsList(metadata);
  fitCameraToObject(modelRoot);
  applyWoodVisibility();
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fitDist = maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360)) * 1.5;
  camera.position.set(center.x + fitDist * 0.7, center.y + fitDist * 0.5, center.z + fitDist * 0.7);
  controls.target.copy(center);
  controls.update();
}

function applyWoodVisibility() {
  const show = woodToggle.checked;
  ["bojo", "bojo_aro_topo"].forEach((g) => {
    (meshesByGroup[g] || []).forEach((m) => { m.visible = show; });
  });
}
woodToggle.addEventListener("change", applyWoodVisibility);

renderer.domElement.addEventListener("pointermove", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
});

renderer.domElement.addEventListener("click", (e) => {
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(modelRoot.children, true).filter((i) => i.object.visible);
  if (intersects.length === 0) {
    clearSelection();
    return;
  }
  const mesh = intersects[0].object;
  const group = mesh.userData.semanticGroup;
  if (!group) return;
  selectGroup(group, { scrollIntoView: true });
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

resizeRenderer();
loadModel().then(animate).catch((err) => {
  console.error("Falha ao carregar modelo 3D:", err);
  canvasWrap.innerHTML = `<p style="padding:1rem;color:#c96b5c">Não foi possível carregar o modelo 3D (assets/engome.glb). Detalhe: ${err.message}</p>`;
});
new ResizeObserver(resizeRenderer).observe(canvasWrap);
