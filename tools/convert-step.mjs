import occtimportjs from "occt-import-js";
import fs from "fs";

const occt = await occtimportjs();
const fileBuffer = fs.readFileSync("/Users/jtragtenberg/Projetos/calculadora-de-engome/Engome.step");
const result = occt.ReadStepFile(fileBuffer, null);
if (!result.success) throw new Error("STEP parse failed");

const classification = {
  0:  { key: "bojo",             label: "Bojo (casco de madeira)",     group: "wood",     material: null },
  1:  { key: "arquilha_externa", label: "Arquilha externa",            group: "chata",    material: "chata" },
  2:  { key: "arquilha_interna", label: "Arquilha interna",            group: "chata",    material: "chata" },
  3:  { key: "aro_cima",         label: "Aro de cima",                 group: "chata",    material: "chata" },
  4:  { key: "suporte_1",        label: "Suporte do bojo (aro de baixo) 1/3", group: "chata", material: "chata" },
  5:  { key: "suporte_2",        label: "Suporte do bojo (aro de baixo) 2/3", group: "chata", material: "chata" },
  6:  { key: "suporte_3",        label: "Suporte do bojo (aro de baixo) 3/3", group: "chata", material: "chata" },
  7:  { key: "aro_baixo",        label: "Aro de baixo",                group: "chata",    material: "chata" },
  29: { key: "arquilha_couro",   label: "Arquilha do couro",           group: "varao14",  material: "varao14" },
  30: { key: "base_circular",    label: "Base circular",               group: "varao12",  material: "varao12" },
  34: { key: "bojo_aro_topo",    label: "Aba superior do bojo (madeira)", group: "wood",  material: null },
};
for (let i = 0; i < 15; i++) {
  classification[8 + i] = { key: `orelha_${i+1}`, label: `Orelha furada ${i+1}/15`, group: "cantoneira", material: "cantoneira" };
}
for (let i = 0; i < 6; i++) {
  classification[23 + i] = { key: `esticador_${i+1}`, label: `Esticador ${i+1}/6`, group: "esticador", material: "esticador" };
}
for (let i = 0; i < 3; i++) {
  classification[31 + i] = { key: `pe_${i+1}`, label: `Pé ${i+1}/3`, group: "pe", material: "pe" };
}

const groupColors = {
  wood: [0.54, 0.38, 0.25],
  chata: [0.69, 0.71, 0.73],
  cantoneira: [0.44, 0.48, 0.53],
  varao14: [0.84, 0.70, 0.36],
  varao12: [0.56, 0.68, 0.42],
  esticador: [0.36, 0.62, 0.79],
  pe: [0.79, 0.42, 0.36],
};

// ---- Build glTF ----
const gltf = {
  asset: { version: "2.0", generator: "engome-convert" },
  scene: 0,
  scenes: [{ nodes: [] }],
  nodes: [],
  meshes: [],
  materials: [],
  accessors: [],
  bufferViews: [],
  buffers: [],
};

const binChunks = [];
let bufferOffset = 0;

function pad4(buf) {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - rem)]);
}

function addBufferView(typedArrayBuffer, target) {
  const buf = pad4(Buffer.from(typedArrayBuffer.buffer, typedArrayBuffer.byteOffset, typedArrayBuffer.byteLength));
  const bufferView = {
    buffer: 0,
    byteOffset: bufferOffset,
    byteLength: typedArrayBuffer.byteLength,
  };
  if (target) bufferView.target = target;
  gltf.bufferViews.push(bufferView);
  binChunks.push(buf);
  bufferOffset += buf.length;
  return gltf.bufferViews.length - 1;
}

function minMax(arr, comps) {
  const min = new Array(comps).fill(Infinity);
  const max = new Array(comps).fill(-Infinity);
  for (let i = 0; i < arr.length; i += comps) {
    for (let c = 0; c < comps; c++) {
      const v = arr[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max };
}

const materialCache = new Map();
function getMaterialIndex(group) {
  if (materialCache.has(group)) return materialCache.get(group);
  const color = groupColors[group] ?? [0.8, 0.8, 0.8];
  const idx = gltf.materials.length;
  gltf.materials.push({
    name: group,
    pbrMetallicRoughness: {
      baseColorFactor: [...color, 1.0],
      metallicFactor: group === "wood" ? 0.0 : 0.75,
      roughnessFactor: group === "wood" ? 0.85 : 0.35,
    },
  });
  materialCache.set(group, idx);
  return idx;
}

result.meshes.forEach((mesh, idx) => {
  const info = classification[idx];
  if (!info) {
    console.warn("UNCLASSIFIED index", idx);
    return;
  }

  const positions = Float32Array.from(mesh.attributes.position.array);
  let normals;
  if (mesh.attributes.normal) {
    normals = Float32Array.from(mesh.attributes.normal.array);
  }
  const indexArrRaw = mesh.index.array;
  const maxIndex = indexArrRaw.length ? Math.max(...indexArrRaw) : 0;
  const indices = maxIndex > 65534
    ? Uint32Array.from(indexArrRaw)
    : Uint16Array.from(indexArrRaw);

  const posBV = addBufferView(positions, 34962);
  const { min, max } = minMax(positions, 3);
  const posAccessor = gltf.accessors.length;
  gltf.accessors.push({
    bufferView: posBV, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max,
  });

  let normAccessor = null;
  if (normals) {
    const normBV = addBufferView(normals, 34962);
    normAccessor = gltf.accessors.length;
    gltf.accessors.push({ bufferView: normBV, componentType: 5126, count: normals.length / 3, type: "VEC3" });
  }

  const idxBV = addBufferView(indices, 34963);
  const idxAccessor = gltf.accessors.length;
  gltf.accessors.push({
    bufferView: idxBV,
    componentType: indices instanceof Uint32Array ? 5125 : 5123,
    count: indices.length,
    type: "SCALAR",
  });

  const attributes = { POSITION: posAccessor };
  if (normAccessor !== null) attributes.NORMAL = normAccessor;

  const meshIndex = gltf.meshes.length;
  gltf.meshes.push({
    name: info.key,
    primitives: [{ attributes, indices: idxAccessor, material: getMaterialIndex(info.group) }],
  });

  const nodeIndex = gltf.nodes.length;
  gltf.nodes.push({
    name: info.key,
    mesh: meshIndex,
    extras: { label: info.label, group: info.group, materialCategory: info.material, bodyIndex: idx },
  });
  gltf.scenes[0].nodes.push(nodeIndex);
});

const binBuffer = Buffer.concat(binChunks);
gltf.buffers.push({ byteLength: binBuffer.length });

const jsonStr = JSON.stringify(gltf);
const jsonBuf = pad4(Buffer.from(jsonStr, "utf8"));
// glTF spec requires JSON chunk padded with spaces (0x20), not zeros
{
  const rem = Buffer.byteLength(jsonStr, "utf8") % 4;
  if (rem !== 0) {
    const padded = jsonStr + " ".repeat(4 - rem);
    var jsonBufFinal = Buffer.from(padded, "utf8");
  } else {
    var jsonBufFinal = Buffer.from(jsonStr, "utf8");
  }
}

const binPadded = pad4(binBuffer); // pad with zeros is fine for BIN chunk

const headerLen = 12;
const jsonChunkHeaderLen = 8;
const binChunkHeaderLen = 8;
const totalLen = headerLen + jsonChunkHeaderLen + jsonBufFinal.length + binChunkHeaderLen + binPadded.length;

const glbHeader = Buffer.alloc(12);
glbHeader.writeUInt32LE(0x46546c67, 0); // magic "glTF"
glbHeader.writeUInt32LE(2, 4); // version
glbHeader.writeUInt32LE(totalLen, 8);

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(jsonBufFinal.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(binPadded.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

const glb = Buffer.concat([glbHeader, jsonChunkHeader, jsonBufFinal, binChunkHeader, binPadded]);

fs.writeFileSync("/Users/jtragtenberg/Projetos/calculadora-de-engome/assets/engome.glb", glb);
console.log("Wrote engome.glb", (glb.length / 1024 / 1024).toFixed(2), "MB");

const metadata = {};
for (const info of Object.values(classification)) {
  metadata[info.key] = info;
}
fs.writeFileSync(
  "/Users/jtragtenberg/Projetos/calculadora-de-engome/assets/engome-parts.json",
  JSON.stringify(metadata, null, 2)
);
console.log("Wrote engome-parts.json");
