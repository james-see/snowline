/**
 * Quality rubric for Snowline — a browser snowboarding game.
 *
 * Categories are phrased so two reviewers looking at the same frame would
 * agree on the score. Disqualifiers are binary presence checks that fail the
 * gate regardless of category scores.
 */

export const CATEGORIES = [
  {
    id: 'lighting',
    name: 'Lighting and exposure',
    prompt:
      'Is the alpine lighting physically believable with a clear sun direction and sky fill? Real tonal range — deep tree shadows AND bright snow highlights — rather than a flat grey or blown-out wash? Correct black levels on rock and tree bark?',
  },
  {
    id: 'snow',
    name: 'Snow surface quality',
    prompt:
      'Does the snow read as powder, packed groom, or ice where appropriate? Subsurface scatter or sparkle on sun-facing faces? Tracks and disturbed snow visible after passes? Any flat white albedo with no micro-detail or specular variation?',
  },
  {
    id: 'terrain',
    name: 'Terrain and slope geometry',
    prompt:
      'Do slopes, bowls, ridges and tree lines read as real mountain terrain? Smooth curvature without obvious mesh faceting? Banked turns, kickers and landings shaped believably? Any floating geometry or visible seams?',
  },
  {
    id: 'materials',
    name: 'Material response',
    prompt:
      'Do rock, ice, wood and snow surfaces respond correctly to light — wet ice gloss, matte powder, rough granite? Specular and roughness variation convincing? Anything reading as uniform plastic?',
  },
  {
    id: 'atmosphere',
    name: 'Atmosphere and depth',
    prompt:
      'Is there aerial perspective, fog or haze separating near and far peaks? Does the sky gradient and cloud layer sell altitude? Any harsh pop-in or uniform distant mountains?',
  },
  {
    id: 'rider',
    name: 'Rider presentation',
    prompt:
      'Does the rider read clearly at speed — silhouette, gear colour, board visible? Proportions and stance believable? (Score 5 as neutral if no rider is visible in this frame.)',
  },
  {
    id: 'animation',
    name: 'Animation and pose',
    prompt:
      'Are body weight, knee flexion and arm balance convincing for the manoeuvre shown? Board angle matches carve or air state? Any stiff T-pose or foot sliding? (Score 5 as neutral if rider is static or absent.)',
  },
  {
    id: 'camera',
    name: 'Camera and framing',
    prompt:
      'Is the follow cam stable and readable at speed? Horizon level, rider positioned for upcoming terrain, no clipping through snow or geometry? FOV appropriate for speed sensation without distortion?',
  },
  {
    id: 'vfx',
    name: 'Effects quality',
    prompt:
      'Snow spray, speed lines, landing puff, grind sparks integrate with the scene? Soft-particle depth fade present? (Score 5 as neutral if no effects visible in this frame.)',
  },
  {
    id: 'ui',
    name: 'HUD and UI',
    prompt:
      'Is the HUD legible at speed — speed, trick name, score, boost meter? Restrained typography and placement? (Score 5 as neutral if no HUD is visible in this frame.)',
  },
  {
    id: 'course_composition',
    name: 'Course composition',
    prompt:
      'Does the run have a readable line — features spaced for flow, vista moments, tree gaps, kickers placed with intent? Would this pass as a marketing screenshot of a real course?',
  },
  {
    id: 'readability_at_speed',
    name: 'Readability at speed',
    prompt:
      'At the velocity implied by the frame, can the player read upcoming terrain, landing zones and hazards? Contrast and motion blur (if any) aid rather than obscure?',
  },
  {
    id: 'physics_believability',
    name: 'Physics believability',
    prompt:
      'Does the pose and environment state match plausible momentum — air time, compression on landing, spray direction on carve? Anything floaty, moon-gravity or sliding uphill?',
  },
  {
    id: 'control_feel',
    name: 'Control feel (inferred)',
    prompt:
      'From body lean, edge angle and line choice, does the run look like responsive carving or twitchy skating? Would a player trust these inputs at this speed?',
  },
  {
    id: 'trick_satisfaction',
    name: 'Trick satisfaction',
    prompt:
      'If a trick is shown: clean rotation, grab timing, stylish extension? Landing compression satisfying? (Score 5 as neutral if no trick or air is visible.)',
  },
  {
    id: 'audio_feedback',
    name: 'Audio feedback (inferred)',
    prompt:
      'Visual cues that imply audio — spray intensity, grind contact, landing impact dust — do they suggest crisp, satisfying feedback? (Score 5 as neutral; audio cannot be heard in stills.)',
  },
  {
    id: 'performance',
    name: 'Performance (inferred)',
    prompt:
      'Any signs of stress — LOD pop, shadow cascade steps, reduced particle count, temporal smear from frame pacing? Judge from visual artefacts only.',
  },
  {
    id: 'temporal_stability',
    name: 'Temporal stability',
    prompt:
      'Any aliasing crawl on high-contrast edges, specular shimmer on snow, TAA ghosting on the rider, or noise that should have been denoised?',
  },
  {
    id: 'overall_fun',
    name: 'Overall fun factor',
    prompt:
      'Would you want to play this run? Does the frame sell speed, freedom and skill expression — or does it feel like a tech demo?',
  },
  {
    id: 'art_direction',
    name: 'Art direction',
    prompt:
      'Coherent colour script — cold shadows, warm sun, saturated gear against white snow? Distinct identity versus generic winter asset pack?',
  },
];

/** Gameplay categories held to a higher bar. */
export const GAMEPLAY_CATEGORIES = [
  'control_feel',
  'physics_believability',
  'trick_satisfaction',
  'overall_fun',
];

/**
 * Binary defects. Any one present fails the gate regardless of category scores.
 */
export const DISQUALIFIERS = [
  { id: 'flat_white_snow', desc: 'Large snow areas of uniform flat white with no micro-detail or specular' },
  { id: 'plastic_ice', desc: 'Ice surfaces reading as matte plastic rather than glossy/translucent' },
  { id: 'camera_clipping', desc: 'Camera intersecting terrain, trees or the rider' },
  { id: 'rider_clipping', desc: 'Rider or board intersecting terrain or obstacles' },
  { id: 'visible_tiling', desc: 'Obvious repeating texture pattern on snow, rock or ice' },
  { id: 'flat_ambient', desc: 'Flat ambient-only shading with no directional sun shadow' },
  { id: 'peter_panning', desc: 'Shadows detached from the object casting them' },
  { id: 'shadow_acne', desc: 'Self-shadowing stripe artefacts on terrain' },
  { id: 'taa_ghosting', desc: 'Smearing or trailing behind the rider or spray' },
  { id: 'aliasing_crawl', desc: 'Jagged or crawling high-contrast edges on terrain or trees' },
  { id: 'blown_highlights', desc: 'Snow highlights clipped to pure white with no detail' },
  { id: 'floating_rider', desc: 'Rider hovering above snow with no contact shadow or spray' },
  { id: 'moon_gravity', desc: 'Air time or hang time physically implausible for the takeoff shown' },
  { id: 'unreadable_speed', desc: 'Frame too chaotic or blurry to read line at implied velocity' },
  { id: 'lod_pop', desc: 'Obvious geometry or texture pop-in mid-frame' },
];

/** Thresholds. The loop exits when all of these hold. */
export const GATE = {
  minCategoryScore: 8,
  minMeanScore: 8.5,
  minGameplayScore: 9,
  maxDisqualifiers: 0,
  minFps: 60,
  maxIterations: 6,
};

/** JSON shape the critic must return. Enforced by `validateVerdict`. */
export const VERDICT_SCHEMA = {
  scores: 'object, keyed by category id, each { score: 1-10, note: string }',
  disqualifiers: 'array of disqualifier ids actually observed',
  worstProblem: 'string, the single highest-impact defect to fix next',
  fixes: 'array of specific, actionable fixes ordered by visual impact',
  verdict: 'string, one of: pass | fail',
};

export function buildCriticPrompt({ shotIds, iteration }) {
  return `You are a HARSH senior art director reviewing frames from a real-time browser snowboarding game. You have shipped AAA winter-sports titles. Your standard of comparison is SSX, Riders Republic, or a modern Ubisoft mountain screenshot.

Be genuinely critical. Inflated scores are worse than useless here: they end the improvement loop early and ship a mediocre product. A score of 8 means "would survive review at a AAA studio". Most first drafts deserve 3-5. Do not be encouraging. Do not grade on effort or on the constraints of the platform.

This is iteration ${iteration}. Frames under review: ${shotIds.join(', ')}.

Score each category from 1-10 and justify tersely:

${CATEGORIES.map((c) => `- ${c.id} (${c.name}): ${c.prompt}`).join('\n')}

Then list every disqualifier you actually OBSERVE in the images (do not list ones you merely suspect):

${DISQUALIFIERS.map((d) => `- ${d.id}: ${d.desc}`).join('\n')}

Return ONLY valid JSON, no prose outside it:
{
  "scores": { "<category_id>": { "score": <1-10>, "note": "<one sentence>" }, ... },
  "disqualifiers": ["<id>", ...],
  "worstProblem": "<the single highest-impact defect>",
  "fixes": ["<specific actionable fix>", ...],
  "verdict": "pass" | "fail"
}

The gate is: every category >= ${GATE.minCategoryScore}, gameplay categories (${GAMEPLAY_CATEGORIES.join(', ')}) >= ${GATE.minGameplayScore}, mean >= ${GATE.minMeanScore}, zero disqualifiers. Set "verdict" accordingly.`;
}

/** Validates and normalises a critic response. Throws on malformed input. */
export function validateVerdict(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON object found in critic response');
    parsed = JSON.parse(match[0]);
  }

  if (!parsed.scores || typeof parsed.scores !== 'object') {
    throw new Error('verdict missing "scores"');
  }

  const scores = {};
  const missing = [];
  for (const category of CATEGORIES) {
    const entry = parsed.scores[category.id];
    if (!entry || typeof entry.score !== 'number') {
      missing.push(category.id);
      continue;
    }
    scores[category.id] = {
      score: Math.max(1, Math.min(10, entry.score)),
      note: String(entry.note ?? ''),
    };
  }
  if (missing.length > 0) throw new Error(`verdict missing categories: ${missing.join(', ')}`);

  const disqualifiers = Array.isArray(parsed.disqualifiers)
    ? parsed.disqualifiers.filter((d) => DISQUALIFIERS.some((x) => x.id === d))
    : [];

  return {
    scores,
    disqualifiers,
    worstProblem: String(parsed.worstProblem ?? ''),
    fixes: Array.isArray(parsed.fixes) ? parsed.fixes.map(String) : [],
  };
}

/** Applies the gate. Returns pass/fail plus the reasons it failed. */
export function evaluate(verdict, perf = {}) {
  const values = Object.values(verdict.scores).map((s) => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const below = Object.entries(verdict.scores)
    .filter(([, s]) => s.score < GATE.minCategoryScore)
    .map(([id, s]) => `${id}=${s.score}`);

  const belowGameplay = Object.entries(verdict.scores)
    .filter(([id, s]) => GAMEPLAY_CATEGORIES.includes(id) && s.score < GATE.minGameplayScore)
    .map(([id, s]) => `${id}=${s.score}`);

  const reasons = [];
  if (below.length > 0) reasons.push(`below ${GATE.minCategoryScore}: ${below.join(', ')}`);
  if (belowGameplay.length > 0) {
    reasons.push(`gameplay below ${GATE.minGameplayScore}: ${belowGameplay.join(', ')}`);
  }
  if (mean < GATE.minMeanScore) reasons.push(`mean ${mean.toFixed(2)} < ${GATE.minMeanScore}`);
  if (verdict.disqualifiers.length > GATE.maxDisqualifiers) {
    reasons.push(`disqualifiers: ${verdict.disqualifiers.join(', ')}`);
  }
  if (perf.fps !== undefined && perf.fps < GATE.minFps) {
    reasons.push(`fps ${perf.fps.toFixed(0)} < ${GATE.minFps}`);
  }

  return { passed: reasons.length === 0, mean, reasons, below, belowGameplay };
}
