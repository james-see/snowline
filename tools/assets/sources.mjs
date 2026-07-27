/**
 * Asset source list for Snowline, shared by `fetch.mjs` and `pack.mjs`.
 *
 * All Poly Haven content is CC0-1.0. Kenney Nature Kit is CC0.
 * Texture selection favours surfaces without a single distinctive hero feature,
 * because these tile across large mountain faces and groom runs.
 *
 * Tree runtime meshes come from Kenney low-poly pines (~200 tris) — NOT Poly Haven
 * full trees (fir_sapling etc. are ~tens of MB and fail LOD budgets).
 */

export const POLYHAVEN_API = 'https://api.polyhaven.com';

export const TEXTURE_RESOLUTIONS = ['4k', '2k'];
export const HDRI_RESOLUTIONS = ['2k', '1k'];

export const TEXTURE_MAPS = ['Diffuse', 'nor_gl', 'Rough', 'AO', 'Metal', 'arm'];

/**
 * @typedef {object} MaterialSource
 * @property {string} id
 * @property {string} slug
 * @property {number} tileScale  World metres covered by one texture repeat.
 * @property {string} note
 * @property {number} [metalness]
 */

/** @type {MaterialSource[]} */
export const MATERIALS = [
  {
    id: 'snow_groom',
    slug: 'snow_floor',
    tileScale: 6,
    note: 'Packed groom / corduroy snow floor. Replaces flat ground_snow for readable ridges.',
  },
  {
    id: 'snow_powder',
    slug: 'snow_01',
    tileScale: 6,
    note: 'Fresh powder with subtle sparkle variation. Off-piste and landing zones.',
  },
  {
    id: 'rock_face',
    slug: 'cliff_side',
    tileScale: 4,
    note: 'Alpine cliff rock for outcrops and chutes. Vertical strata hides horizontal repetition.',
  },
  {
    id: 'rock_scree',
    slug: 'rock_face',
    tileScale: 3,
    note: 'Granular scree for runouts and ridge lines. Breaks up large flat rock planes.',
  },
  {
    id: 'ice_glass',
    slug: 'snow_02',
    tileScale: 5,
    metalness: 0.05,
    note: 'Smooth frosty snow (PH snow_02) for race ice — clearcoat/low roughness in MaterialLibrary. ice_01 gone 2026.',
  },
  {
    id: 'ice_frost',
    slug: 'snow_03',
    tileScale: 4,
    note: 'Trampled/dirty snow (PH snow_03) for frosted tree-line transition. frozen_ground_01 gone 2026.',
  },
  {
    id: 'wood_bark',
    slug: 'pine_bark',
    tileScale: 2,
    note: 'Pine bark for tree trunks and timber props. Vertical grain tiles on cylinders.',
  },
  {
    id: 'wood_plank',
    slug: 'brown_planks_07',
    tileScale: 2,
    note: 'Weathered brown planks for ramps, tunnels, and wood furniture.',
  },
  {
    id: 'fabric_banner',
    slug: 'hessian_230',
    tileScale: 1.5,
    note: 'Hessian / burlap weave for finish banners and fabric race furniture.',
  },
];

/**
 * @typedef {object} EnvironmentSource
 * @property {string} id
 * @property {string} slug
 * @property {number} intensity
 * @property {string} note
 */

/** @type {EnvironmentSource[]} */
export const ENVIRONMENTS = [
  {
    id: 'alpine_noon',
    slug: 'snowy_field',
    intensity: 1.15,
    note: 'Bright overcast alpine sky with soft fill and crisp sun breaks. Default course lighting.',
  },
  {
    id: 'summit_dawn',
    slug: 'kiara_1_dawn',
    intensity: 0.9,
    note: 'Pink dawn horizon for summit vistas and title screen mood.',
  },
];

/**
 * @typedef {object} KitSource
 * @property {string} id
 * @property {string} url
 * @property {string} license
 * @property {string} author
 * @property {string} note
 */

/** @type {KitSource[]} */
export const KITS = [
  {
    id: 'kenney_nature',
    url: 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip',
    license: 'CC0-1.0',
    author: 'Kenney',
    note: 'Low-poly Nature Kit — pine OBJs for instanced forest (~200 tris each).',
  },
];

/**
 * Kenney pines are ~1.55 m tall; procedural trees are ~7 m+. Scale ~5.5×.
 *
 * @typedef {object} TreeModelSource
 * @property {string} id  Runtime / manifest model id (tree_pine_0 …).
 * @property {string} kit  Kit id in KITS.
 * @property {string} obj  Path inside the extracted kit zip.
 * @property {number} scale  Uniform world scale applied at pack + documented for runtime.
 * @property {number} variant  Maps to PropPlacement.variant % N.
 * @property {string} note
 */

/** @type {TreeModelSource[]} */
export const TREE_MODELS = [
  {
    id: 'tree_pine_0',
    kit: 'kenney_nature',
    obj: 'Models/OBJ format/tree_pineDefaultA.obj',
    scale: 5.5,
    variant: 0,
    note: 'Default pine — bark + leafsDark meshes.',
  },
  {
    id: 'tree_pine_1',
    kit: 'kenney_nature',
    obj: 'Models/OBJ format/tree_pineTallA.obj',
    scale: 5.5,
    variant: 1,
    note: 'Tall pine silhouette for belt variation.',
  },
  {
    id: 'tree_pine_2',
    kit: 'kenney_nature',
    obj: 'Models/OBJ format/tree_pineRoundA.obj',
    scale: 5.5,
    variant: 2,
    note: 'Rounder canopy pine for mid-forest fill.',
  },
];
