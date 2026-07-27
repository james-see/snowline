import type { GamepadBindingMap } from '@/engine/gamepadBindings.ts';

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
export type AntialiasMode = 'none' | 'fxaa' | 'smaa' | 'taa';

export interface QualitySettings {
  preset: QualityPreset;
  renderScale: number;
  maxPixelRatio: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  shadowCascades: number;
  softShadows: boolean;
  shadowDistance: number;
  ssaoEnabled: boolean;
  antialias: AntialiasMode;
  motionBlurEnabled: boolean;
  motionBlurAmount: number;
  bloomEnabled: boolean;
  bloomIntensity: number;
  autoExposureEnabled: boolean;
  filmGrainEnabled: boolean;
  vignetteEnabled: boolean;
  sharpenAmount: number;
  lodBias: number;
  maxParticles: number;
  anisotropy: number;
  fov: number;
  cameraShakeScale: number;
  landingAssist: boolean;
  reducedMotion: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  showPerfHud: boolean;
  /**
   * Custom gamepad binds (null = auto-preset from pad id / mapping).
   * Persisted in localStorage with the rest of settings.
   */
  gamepadBindings: GamepadBindingMap | null;
  applyPreset(preset: QualityPreset): void;
  save(): void;
  load(): void;
}
