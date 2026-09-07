/**
 * Potongan GLSL untuk pendekatan "batched geometry + state texture" (§5.3.3).
 *
 * Disuntikkan lewat `onBeforeCompile` pada MeshStandardMaterial supaya lighting
 * PBR didapat gratis, sesuai rekomendasi PRD §5.3.3.
 */

/**
 * ⚠️ WAJIB cocok dengan `_sign_not_zero` di scripts/04_pack_batches.py.
 *
 * Dekode oktahedral yang memetakan nol ke −1 (perilaku `sign()` GLSL untuk 0
 * adalah 0) akan salah membaca normal hemisfer bawah yang salah satu
 * komponennya tepat nol — dan mesh anatomi penuh face datar sumbu-sejajar.
 * Pipeline meng-encode dengan konvensi 0 → +1; dekoder di sini harus sama.
 */
export const OCT_DECODE_GLSL = /* glsl */ `
vec2 signNotZero(vec2 v) {
  return vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
}

vec3 octDecode(vec2 e) {
  vec3 v = vec3(e.xy, 1.0 - abs(e.x) - abs(e.y));
  if (v.z < 0.0) {
    v.xy = (1.0 - abs(v.yx)) * signNotZero(v.xy);
  }
  return normalize(v);
}
`

/** Lookup state per struktur dari DataTexture (§5.3.2). */
export const STATE_LOOKUP_GLSL = /* glsl */ `
uniform sampler2D uStateTex;
uniform float uStateTexHeight;

vec4 readState(float idx) {
  float x = mod(idx, 256.0) + 0.5;
  float y = floor(idx / 256.0) + 0.5;
  return texture2D(uStateTex, vec2(x / 256.0, y / uStateTexHeight));
}
`

export const VERTEX_DECLARATIONS = /* glsl */ `
attribute vec2 aOctNormal;
attribute float aStructureIdx;

uniform vec3 uQuantScale;
uniform vec3 uQuantOffset;

varying float vSelectState;
varying float vOpacity;
varying float vSystemId;

${STATE_LOOKUP_GLSL}
${OCT_DECODE_GLSL}
`

/**
 * Menggantikan `beginnormal_vertex`.
 *
 * ⚠️ Urutan chunk di three penting: `defaultnormal_vertex` memakai
 * `objectNormal` dan berjalan SEBELUM `begin_vertex`. Jadi `objectNormal` wajib
 * dideklarasikan di sini — mendeklarasikannya di `begin_vertex` menghasilkan
 * "'objectNormal' : undeclared identifier" saat kompilasi.
 */
export const VERTEX_NORMAL_BODY = /* glsl */ `
  vec3 objectNormal = octDecode(aOctNormal / 127.0);
`

/**
 * Menggantikan `begin_vertex`.
 *
 * Struktur yang tidak terlihat dilempar ke luar clip space supaya seluruh
 * segitiganya ter-cull tanpa perlu menyentuh index buffer (§5.3.3).
 */
export const VERTEX_BODY = /* glsl */ `
  vec4 state = readState(aStructureIdx);
  vSelectState = state.g;
  vOpacity     = state.b;
  vSystemId    = state.a;

  vec3 transformed = position * uQuantScale + uQuantOffset;

  if (state.r < 0.5) {
    // Di luar clip space -> ter-cull. Lebih murah daripada membangun ulang index.
    transformed = vec3(1e10);
  }
`

export const FRAGMENT_DECLARATIONS = /* glsl */ `
varying float vSelectState;
varying float vOpacity;
varying float vSystemId;

uniform sampler2D uPaletteTex;
uniform float uPaletteSize;
uniform float uOpaquePass;
`

/**
 * Warna dasar dari palet per sistem, lalu tint menurut selectState.
 * Outline seleksi pakai rim-light di sini, BUKAN OutlinePass — §8.4 melarang
 * post-processing full-screen karena mahal di mobile.
 */
export const FRAGMENT_COLOR = /* glsl */ `
  // Pisahkan pass opaque/transparan lewat discard supaya geometri tidak dipecah.
  if (uOpaquePass > 0.5) {
    if (vOpacity < 0.99) discard;
  } else {
    if (vOpacity >= 0.99) discard;
  }

  vec3 base = texture2D(uPaletteTex, vec2((vSystemId + 0.5) / uPaletteSize, 0.5)).rgb;

  if (vSelectState > 2.5 && vSelectState < 3.5) {
    // dimmed: desaturasi
    base = mix(base, vec3(dot(base, vec3(0.299, 0.587, 0.114))), 0.7);
  } else if (vSelectState > 1.5) {
    base = mix(base, vec3(1.0, 0.62, 0.24), 0.55); // selected
  } else if (vSelectState > 0.5) {
    base = mix(base, vec3(1.0), 0.28); // hover
  }

  diffuseColor.rgb = base;
  diffuseColor.a *= vOpacity;
`

/** Material picking (§5.3.5): tulis structureIdx sebagai warna 24-bit. */
export const PICKING_VERTEX = /* glsl */ `
attribute vec2 aOctNormal;
attribute float aStructureIdx;
uniform vec3 uQuantScale;
uniform vec3 uQuantOffset;
uniform sampler2D uStateTex;
uniform float uStateTexHeight;
varying float vIdx;

${STATE_LOOKUP_GLSL.replace('uniform sampler2D uStateTex;\nuniform float uStateTexHeight;\n', '')}

void main() {
  vIdx = aStructureIdx;
  vec4 state = readState(aStructureIdx);
  vec3 p = position * uQuantScale + uQuantOffset;
  // Struktur invisible ikut ter-cull, jadi tidak bisa ter-pick (§E3 AC10).
  if (state.r < 0.5) p = vec3(1e10);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

export const PICKING_FRAGMENT = /* glsl */ `
varying float vIdx;
void main() {
  float idx = floor(vIdx + 0.5);
  gl_FragColor = vec4(
    mod(idx, 256.0) / 255.0,
    mod(floor(idx / 256.0), 256.0) / 255.0,
    floor(idx / 65536.0) / 255.0,
    1.0
  );
}
`
