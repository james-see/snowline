import type { AntialiasMode, QualityPreset, QualitySettings } from '@/types/settings.ts';

const STORAGE_KEY = 'snowline.settings.v1';

type PresetFields = Omit<
  QualitySettings,
  | 'applyPreset'
  | 'save'
  | 'load'
  | 'preset'
  | 'fov'
  | 'cameraShakeScale'
  | 'landingAssist'
  | 'reducedMotion'
  | 'masterVolume'
  | 'sfxVolume'
  | 'musicVolume'
  | 'showPerfHud'
>;

const PRESETS: Record<QualityPreset, PresetFields> = {
  low: {
    renderScale: 0.75,
    maxPixelRatio: 1,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    shadowCascades: 2,
    softShadows: false,
    shadowDistance: 80,
    ssaoEnabled: false,
    antialias: 'fxaa',
    motionBlurEnabled: false,
    motionBlurAmount: 0,
    bloomEnabled: true,
    bloomIntensity: 0.35,
    autoExposureEnabled: false,
    filmGrainEnabled: false,
    vignetteEnabled: true,
    sharpenAmount: 0.2,
    lodBias: 0.6,
    maxParticles: 1500,
    anisotropy: 4,
  },
  medium: {
    renderScale: 0.9,
    maxPixelRatio: 1.5,
    shadowsEnabled: true,
    shadowMapSize: 1536,
    shadowCascades: 3,
    softShadows: false,
    shadowDistance: 120,
    ssaoEnabled: false,
    antialias: 'smaa',
    motionBlurEnabled: true,
    motionBlurAmount: 0.35,
    bloomEnabled: true,
    bloomIntensity: 0.45,
    autoExposureEnabled: true,
    filmGrainEnabled: true,
    vignetteEnabled: true,
    sharpenAmount: 0.25,
    lodBias: 0.85,
    maxParticles: 4000,
    anisotropy: 8,
  },
  high: {
    renderScale: 1,
    maxPixelRatio: 2,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    shadowCascades: 3,
    softShadows: true,
    shadowDistance: 160,
    ssaoEnabled: true,
    antialias: 'taa',
    motionBlurEnabled: true,
    motionBlurAmount: 0.45,
    bloomEnabled: true,
    bloomIntensity: 0.5,
    autoExposureEnabled: true,
    filmGrainEnabled: true,
    vignetteEnabled: true,
    sharpenAmount: 0.3,
    lodBias: 1,
    maxParticles: 8000,
    anisotropy: 16,
  },
  ultra: {
    renderScale: 1,
    maxPixelRatio: 2,
    shadowsEnabled: true,
    shadowMapSize: 4096,
    shadowCascades: 4,
    softShadows: true,
    shadowDistance: 220,
    ssaoEnabled: true,
    antialias: 'taa',
    motionBlurEnabled: true,
    motionBlurAmount: 0.55,
    bloomEnabled: true,
    bloomIntensity: 0.55,
    autoExposureEnabled: true,
    filmGrainEnabled: true,
    vignetteEnabled: true,
    sharpenAmount: 0.35,
    lodBias: 1,
    maxParticles: 12000,
    anisotropy: 16,
  },
};

export class Settings implements QualitySettings {
  preset: QualityPreset = 'high';
  renderScale = 1;
  maxPixelRatio = 2;
  shadowsEnabled = true;
  shadowMapSize = 2048;
  shadowCascades = 3;
  softShadows = true;
  shadowDistance = 160;
  ssaoEnabled = true;
  antialias: AntialiasMode = 'taa';
  motionBlurEnabled = true;
  motionBlurAmount = 0.45;
  bloomEnabled = true;
  bloomIntensity = 0.5;
  autoExposureEnabled = true;
  filmGrainEnabled = true;
  vignetteEnabled = true;
  sharpenAmount = 0.3;
  lodBias = 1;
  maxParticles = 8000;
  anisotropy = 16;
  fov = 62;
  cameraShakeScale = 1;
  landingAssist = true;
  reducedMotion = false;
  masterVolume = 0.85;
  sfxVolume = 1;
  musicVolume = 0.55;
  showPerfHud = false;

  applyPreset(preset: QualityPreset): void {
    this.preset = preset;
    Object.assign(this, PRESETS[preset]);
  }

  save(): void {
    const data = { ...this };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.applyPreset('high');
        return;
      }
      const data = JSON.parse(raw) as Partial<QualitySettings> & { preset?: QualityPreset };
      if (data.preset) this.applyPreset(data.preset);
      Object.assign(this, data);
    } catch {
      this.applyPreset('high');
    }
  }
}
