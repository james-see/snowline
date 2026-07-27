import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOD_BUFFER_CAPS, presetBudgets, resolveLodBudgets } from '@/engine/Lod.ts';
import type { QualitySettings } from '@/types/settings.ts';

function fakeSettings(
  partial: Partial<Pick<QualitySettings, 'preset' | 'lodBias' | 'maxParticles' | 'shadowDistance' | 'anisotropy'>>
): Pick<QualitySettings, 'preset' | 'lodBias' | 'maxParticles' | 'shadowDistance' | 'anisotropy'> {
  return {
    preset: 'high',
    lodBias: 1,
    maxParticles: 8000,
    shadowDistance: 160,
    anisotropy: 16,
    ...partial,
  };
}

describe('resolveLodBudgets', () => {
  it('keeps High within 60fps instance/particle caps', () => {
    const b = resolveLodBudgets(fakeSettings({ preset: 'high' }));
    assert.ok(b.maxTreeInstances <= LOD_BUFFER_CAPS.trees);
    assert.equal(b.maxTreeInstances, 960);
    assert.ok(b.maxTreeShadowCasters <= b.maxTreeInstances);
    assert.ok(b.maxSnowParticles <= 2200);
    assert.ok(b.shadowDistance <= 140);
    assert.ok(b.textureSize <= 256);
  });

  it('clamps snow to settings.maxParticles', () => {
    const b = resolveLodBudgets(fakeSettings({ maxParticles: 500 }));
    assert.equal(b.maxSnowParticles, 500);
  });

  it('never exceeds buffer ceilings', () => {
    const b = resolveLodBudgets(
      fakeSettings({ preset: 'ultra', lodBias: 1.25, maxParticles: 99999, anisotropy: 64 })
    );
    assert.ok(b.maxSnowParticles <= LOD_BUFFER_CAPS.snow);
    assert.ok(b.maxSprayParticles <= LOD_BUFFER_CAPS.spray);
    assert.ok(b.maxTreeInstances <= LOD_BUFFER_CAPS.trees);
    assert.ok(b.anisotropy <= 16);
  });

  it('scales instance counts with lodBias', () => {
    const full = resolveLodBudgets(fakeSettings({ lodBias: 1 }));
    const low = resolveLodBudgets(fakeSettings({ lodBias: 0.5 }));
    assert.ok(low.maxTreeInstances < full.maxTreeInstances);
    assert.ok(low.maxTreeShadowCasters < full.maxTreeShadowCasters);
  });
});

describe('presetBudgets', () => {
  it('returns a copy of the preset table', () => {
    const a = presetBudgets('low');
    const b = presetBudgets('low');
    a.maxTreeInstances = 1;
    assert.notEqual(b.maxTreeInstances, 1);
  });
});
