export interface LoadProgress {
  loaded: number;
  total: number;
  current: string;
}

export interface ResourceManager {
  preload(onProgress?: (p: LoadProgress) => void): Promise<void>;
  getTexture(id: string): import('three').Texture | null;
  getEnvMap(): import('three').Texture | null;
  dispose(): void;
}
