/**
 * Asset source list for Snowline, shared by `fetch.mjs` and `pack.mjs`.
 *
 * All Poly Haven content is CC0-1.0. Texture selection favours surfaces
 * without a single distinctive hero feature, because these tile across large
 * mountain faces and groom runs.
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
    slug: 'ground_snow',
    tileScale: 8,
    note: 'Packed groom snow. Low-frequency mottling tiles across wide runs without a readable grid.',
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
    slug: 'ice_01',
    tileScale: 5,
    metalness: 0.05,
    note: 'Glazed ice patch for race lines and north-facing slopes. High gloss, low metalness.',
  },
  {
    id: 'ice_frost',
    slug: 'frozen_ground_01',
    tileScale: 4,
    note: 'Frosted ice transition at tree line. Softer than race ice, still reads cold.',
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
