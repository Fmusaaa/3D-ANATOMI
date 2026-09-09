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

/** Lookup state & transform per struktur dari DataTexture (§5.3.2). */
export const STATE_LOOKUP_GLSL = /* glsl */ `
uniform sampler2D uStateTex;
uniform sampler2D uXformTex;
uniform float uStateTexHeight;

vec2 atlasTexUV(float idx) {
  float x = mod(idx, 256.0) + 0.5;
  float y = floor(idx / 256.0) + 0.5;
  return vec2(x / 256.0, y / uStateTexHeight);
}

vec4 readState(float idx) {
  return texture2D(uStateTex, atlasTexUV(idx));
}

/** RGB = offset explode (meter), A = skala (dicadangkan). */
vec4 readXform(float idx) {
  return texture2D(uXformTex, atlasTexUV(idx));
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
  // Exploded view (§E6): geser struktur ke posisi tujuannya. Geometri tidak
  // pernah dibangun ulang — offset-nya datang dari tekstur (§5.2).
  transformed += readXform(aStructureIdx).xyz;

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

/**
 * Material picking (§5.3.5): tulis `structureIdx` sebagai warna 24-bit.
 *
 * ⚠️ TIDAK bisa dipakai lewat `scene.overrideMaterial`, karena tiap batch punya
 * `quantScale`/`quantOffset` sendiri dan overrideMaterial hanya satu untuk
 * seluruh scene. `BatchManager` menukar material per mesh selama pass picking.
 */
export const PICKING_VERTEX = /* glsl */ `
#include <clipping_planes_pars_vertex>

attribute vec2 aOctNormal;
attribute float aStructureIdx;

uniform vec3 uQuantScale;
uniform vec3 uQuantOffset;
uniform sampler2D uStateTex;
uniform sampler2D uXformTex;
uniform float uStateTexHeight;
uniform float uMinPickOpacity;

varying float vIdx;

vec2 atlasTexUV(float idx) {
  float x = mod(idx, 256.0) + 0.5;
  float y = floor(idx / 256.0) + 0.5;
  return vec2(x / 256.0, y / uStateTexHeight);
}

void main() {
  vIdx = aStructureIdx;
  vec4 state = texture2D(uStateTex, atlasTexUV(aStructureIdx));
  vec3 p = position * uQuantScale + uQuantOffset;
  // WAJIB memakai offset yang sama dengan pass tampilan. Kalau tidak, saat
  // explode aktif klik akan mengenai posisi lama struktur — meleset jauh.
  p += texture2D(uXformTex, atlasTexUV(aStructureIdx)).xyz;

  // §E3 AC10: struktur tersembunyi tidak bisa ter-pick — dicull dengan shader
  // yang sama, jadi mustahil melenceng dari yang terlihat.
  //
  // Struktur ghost (opacity rendah) juga dikecualikan: ia konteks spasial,
  // bukan target. Kalau ikut ter-pick, rangka samar di depan akan mencuri
  // setiap klik yang ditujukan ke organ di belakangnya.
  if (state.r < 0.5 || state.b < uMinPickOpacity) {
    p = vec3(1e10);
  }

  // §E13: bidang potong WAJIB dipakai di pass picking juga. Kalau tidak,
  // klik pada permukaan potongan akan memilih struktur yang sudah terpotong
  // dan tidak terlihat — user memilih sesuatu yang tidak ada di layar.
  //
  // Chunk clipping_planes_vertex membaca variabel bernama 'mvPosition',
  // jadi namanya tidak boleh diubah.
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
`

export const PICKING_FRAGMENT = /* glsl */ `
#include <clipping_planes_pars_fragment>

varying float vIdx;

void main() {
  #include <clipping_planes_fragment>

  float idx = floor(vIdx + 0.5);
  gl_FragColor = vec4(
    mod(idx, 256.0) / 255.0,
    mod(floor(idx / 256.0), 256.0) / 255.0,
    floor(idx / 65536.0) / 255.0,
    1.0
  );
}
`
