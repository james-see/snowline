export interface LoadProgress {
  loaded: number;
  total: number;
  current: string;
}

/** Albedo (sRGB) + normal + ORM (ao=R, rough=G, metal=B). */
export interface PbrMapSet {
  albedo: import('three').Texture;
  normal: import('three').Texture;
  orm: import('three').Texture;
  tileScale: number;
}

export interface ResourceManager {
  preload(onProgress?: (p: LoadProgress) => void): Promise<void>;
  getTexture(id: string): import('three').Texture | null;
  getPbrMaps(id: string): PbrMapSet | null;
  getMaterials(): import('@/render/materials/MaterialLibrary.ts').MaterialLibrary;
  getEnvMap(): import('three').Texture | null;
  dispose(): void;
}
