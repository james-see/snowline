import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { CourseId, GameModeId } from '@/types/gameplay.ts';
import type { GameFlowModule } from '@/modes/GameFlowModule.ts';
import type { ScoreModule } from '@/score/ScoreModule.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import { COSMETICS, loadSave } from '@/score/SaveData.ts';
import { COURSE_LIST } from '@/course/CourseDefs.ts';
import './styles.css';

const COURSES: { id: CourseId; blurb: string }[] = [
  { id: 'alpine', blurb: 'Wide alpine flow — learn the mountain.' },
  { id: 'timberline', blurb: 'Tight forest lines and risky shortcuts.' },
  { id: 'summit', blurb: 'Cliffs, big air, and a canyon finale.' },
];

const MODES: { id: GameModeId; label: string; blurb: string }[] = [
  { id: 'freeride', label: 'Freeride', blurb: 'Ride end-to-end. Medals on time.' },
  { id: 'time_trial', label: 'Time Trial', blurb: 'Ghost the clock. Clean lines win.' },
  { id: 'trick_attack', label: 'Trick Attack', blurb: 'Bank style points. Variety pays.' },
];

export class UiModule implements GameModule {
  readonly name = 'ui';
  readonly order = 50;

  #root: HTMLElement | null = null;
  #hudVisible = true;
  #popupEl: HTMLElement | null = null;
  #tipShown = false;
  #courseIndex = 0;
  #modeIndex = 0;
  #ctx: EngineContext | null = null;

  init(ctx: EngineContext): void {
    this.#ctx = ctx;
    this.#root = document.getElementById('hud');
    if (!this.#root) return;
    this.#root.innerHTML = '';
    this.#mountShell();
    this.#render(ctx);

    ctx.events.on('ui:navigate', () => this.#render(ctx));
    ctx.events.on('score:popup', ({ text, points }) => this.#flashPopup(text, points));
    ctx.events.on('run:start', () => {
      const save = loadSave();
      if (!save.tutorialDone && !this.#tipShown) {
        this.#tipShown = true;
        this.#showTip();
        ctx.getModule<GameFlowModule>('flow')?.markTutorialDone();
      }
    });
    ctx.events.on('run:checkpoint', ({ index, total }) => {
      const el = document.getElementById('hud-cp');
      if (el) el.textContent = `CP ${index + 1}/${total}`;
    });

    ctx.input.setLockout(true);
    ctx.setTimeScale(0);
  }

  update(_dt: number, ctx: EngineContext): void {
    const flow = ctx.getModule<GameFlowModule>('flow');
    if (!flow || !this.#root) return;

    if (flow.screen === 'course') {
      if (ctx.input.wasPressed('steerLeft')) this.#courseIndex = (this.#courseIndex + 2) % 3;
      if (ctx.input.wasPressed('steerRight')) this.#courseIndex = (this.#courseIndex + 1) % 3;
      if (ctx.input.wasPressed('confirm') || ctx.input.wasPressed('jump')) {
        flow.goModeSelect(COURSES[this.#courseIndex]!.id);
      }
      if (ctx.input.wasPressed('back')) flow.goTitle();
      this.#paintCourse(flow);
    }

    if (flow.screen === 'mode') {
      if (ctx.input.wasPressed('steerLeft')) this.#modeIndex = (this.#modeIndex + 2) % 3;
      if (ctx.input.wasPressed('steerRight')) this.#modeIndex = (this.#modeIndex + 1) % 3;
      if (ctx.input.wasPressed('confirm') || ctx.input.wasPressed('jump')) {
        flow.startRun(MODES[this.#modeIndex]!.id);
      }
      if (ctx.input.wasPressed('back')) flow.goCourseSelect();
      this.#paintMode(flow);
    }

    if (flow.screen === 'title') {
      if (ctx.input.wasPressed('confirm') || ctx.input.wasPressed('jump')) flow.goCourseSelect();
      if (ctx.input.wasPressed('back')) {
        /* already title */
      }
    }

    if (flow.screen === 'settings') {
      if (ctx.input.wasPressed('back')) flow.goTitle();
    }

    if (flow.screen === 'results') {
      if (ctx.input.wasPressed('confirm') || ctx.input.wasPressed('jump')) flow.restart();
      if (ctx.input.wasPressed('back')) flow.goTitle();
    }

    if (flow.screen === 'playing' && this.#hudVisible) {
      this.#paintHud(ctx);
    }
  }

  setHud(visible: boolean): void {
    this.#hudVisible = visible;
    const play = this.#root?.querySelector('.hud-play') as HTMLElement | null;
    if (play) play.style.display = visible ? 'block' : 'none';
  }

  #mountShell(): void {
    if (!this.#root) return;
    this.#root.innerHTML = `
      <div class="ui-layer" id="ui-layer"></div>
      <div class="hud-play" id="hud-play" style="display:none">
        <div class="hud-top">
          <div class="hud-score"><span class="label">Score</span><span id="hud-score">0</span></div>
          <div class="hud-combo"><span class="label">Combo</span><span id="hud-combo">×1</span></div>
          <div class="hud-time"><span class="label">Time</span><span id="hud-time">0:00</span></div>
        </div>
        <div class="hud-bottom">
          <div class="hud-speed"><span id="hud-speed">0</span><span class="unit">km/h</span></div>
          <div class="boost-track"><div class="boost-fill" id="hud-boost"></div></div>
          <div class="hud-cp" id="hud-cp">CP 0/0</div>
        </div>
        <div class="hud-popup" id="hud-popup"></div>
        <div class="hud-tip" id="hud-tip" style="display:none"></div>
      </div>
    `;
    this.#popupEl = document.getElementById('hud-popup');
  }

  #render(ctx: EngineContext): void {
    const flow = ctx.getModule<GameFlowModule>('flow');
    const layer = document.getElementById('ui-layer');
    const play = document.getElementById('hud-play');
    if (!flow || !layer || !play) return;

    play.style.display = flow.screen === 'playing' && this.#hudVisible ? 'block' : 'none';

    if (flow.screen === 'title') {
      layer.innerHTML = `
        <section class="screen title-screen">
          <div class="title-atmos"></div>
          <h1 class="brand">SNOWLINE</h1>
          <p class="tag">Carve the ridge. Own the air.</p>
          <button class="btn primary" data-act="play">Ride</button>
          <button class="btn ghost" data-act="settings">Settings</button>
          <p class="hint">Enter / Space — gamepad A</p>
        </section>`;
      layer.querySelector('[data-act="play"]')?.addEventListener('click', () => flow.goCourseSelect());
      layer.querySelector('[data-act="settings"]')?.addEventListener('click', () => flow.goSettings());
    } else if (flow.screen === 'course') {
      layer.innerHTML = `<section class="screen select-screen"><h2>Choose a line</h2><div class="cards" id="course-cards"></div><p class="hint">A/D select · Enter confirm</p></section>`;
      this.#paintCourse(flow);
    } else if (flow.screen === 'mode') {
      layer.innerHTML = `<section class="screen select-screen"><h2>Mode</h2><div class="cards" id="mode-cards"></div></section>`;
      this.#paintMode(flow);
    } else if (flow.screen === 'paused') {
      layer.innerHTML = `
        <section class="screen pause-screen">
          <h2>Paused</h2>
          <button class="btn primary" data-act="resume">Resume</button>
          <button class="btn" data-act="restart">Restart</button>
          <button class="btn" data-act="settings">Settings</button>
          <button class="btn ghost" data-act="quit">Quit to Title</button>
        </section>`;
      layer.querySelector('[data-act="resume"]')?.addEventListener('click', () => flow.togglePause());
      layer.querySelector('[data-act="restart"]')?.addEventListener('click', () => flow.restart());
      layer.querySelector('[data-act="settings"]')?.addEventListener('click', () => flow.goSettings());
      layer.querySelector('[data-act="quit"]')?.addEventListener('click', () => flow.goTitle());
    } else if (flow.screen === 'results') {
      const r = flow.lastResults;
      const medal = r?.medal ?? 'none';
      layer.innerHTML = `
        <section class="screen results-screen">
          <h2>Run Complete</h2>
          <p class="medal medal-${medal}">${medal.toUpperCase()}</p>
          <p>Time <strong>${fmtTime(r?.time ?? 0)}</strong></p>
          <p>Score <strong>${Math.floor(r?.score ?? 0)}</strong></p>
          <button class="btn primary" data-act="retry">Ride Again</button>
          <button class="btn ghost" data-act="title">Title</button>
        </section>`;
      layer.querySelector('[data-act="retry"]')?.addEventListener('click', () => flow.restart());
      layer.querySelector('[data-act="title"]')?.addEventListener('click', () => flow.goTitle());
    } else if (flow.screen === 'settings') {
      layer.innerHTML = this.#settingsHtml(ctx);
      this.#bindSettings(ctx, flow);
    } else if (flow.screen === 'playing') {
      layer.innerHTML = '';
    }
  }

  #paintCourse(flow: GameFlowModule): void {
    const el = document.getElementById('course-cards');
    if (!el) return;
    el.innerHTML = COURSES.map((c, i) => {
      const def = COURSE_LIST.find((d) => d.id === c.id);
      return `<button class="card ${i === this.#courseIndex ? 'active' : ''}" data-i="${i}">
        <span class="card-title">${def?.name ?? c.id}</span>
        <span class="card-blurb">${c.blurb}</span>
      </button>`;
    }).join('');
    el.querySelectorAll('.card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.#courseIndex = Number((btn as HTMLElement).dataset.i);
        flow.goModeSelect(COURSES[this.#courseIndex]!.id);
      });
    });
  }

  #paintMode(flow: GameFlowModule): void {
    const el = document.getElementById('mode-cards');
    if (!el) return;
    el.innerHTML = MODES.map(
      (m, i) => `<button class="card ${i === this.#modeIndex ? 'active' : ''}" data-i="${i}">
        <span class="card-title">${m.label}</span>
        <span class="card-blurb">${m.blurb}</span>
      </button>`
    ).join('');
    el.querySelectorAll('.card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.#modeIndex = Number((btn as HTMLElement).dataset.i);
        flow.startRun(MODES[this.#modeIndex]!.id);
      });
    });
  }

  #paintHud(ctx: EngineContext): void {
    const score = ctx.getModule<ScoreModule>('score');
    const rider = ctx.getModule<RiderModule>('rider');
    const course = ctx.getModule<CourseModule>('course');
    const hud = score?.getHud();
    const set = (id: string, text: string): void => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    if (hud) {
      set('hud-score', String(hud.score + hud.pending));
      set('hud-combo', `×${hud.combo.toFixed(1)}`);
      set('hud-time', fmtTime(hud.time));
    }
    if (rider) {
      set('hud-speed', String(Math.round(rider.state.speed * 3.6)));
      const boost = document.getElementById('hud-boost');
      if (boost) boost.style.width = `${Math.round(rider.state.boostMeter * 100)}%`;
    }
    const prog = course?.getProgress();
    if (prog) set('hud-cp', `CP ${prog.checkpointsCleared}/${prog.totalCheckpoints}`);
  }

  #flashPopup(text: string, points: number): void {
    if (!this.#popupEl) return;
    this.#popupEl.textContent = points > 0 ? `${text} +${points}` : text;
    this.#popupEl.classList.add('show');
    window.setTimeout(() => this.#popupEl?.classList.remove('show'), 900);
  }

  #showTip(): void {
    const tip = document.getElementById('hud-tip');
    if (!tip) return;
    tip.style.display = 'block';
    tip.textContent =
      'A/D carve · Space jump · Shift boost · Arrows spin/flip · J/K/L/U grabs · C lean';
    window.setTimeout(() => {
      tip.style.display = 'none';
    }, 6000);
  }

  #settingsHtml(ctx: EngineContext): string {
    const s = ctx.settings;
    return `
      <section class="screen settings-screen">
        <h2>Settings</h2>
        <label>Quality
          <select id="set-quality">
            <option value="low" ${s.preset === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${s.preset === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${s.preset === 'high' ? 'selected' : ''}>High</option>
            <option value="ultra" ${s.preset === 'ultra' ? 'selected' : ''}>Ultra</option>
          </select>
        </label>
        <label>Master <input id="set-master" type="range" min="0" max="1" step="0.05" value="${s.masterVolume}" /></label>
        <label>SFX <input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${s.sfxVolume}" /></label>
        <label>Music <input id="set-music" type="range" min="0" max="1" step="0.05" value="${s.musicVolume}" /></label>
        <label>FOV <input id="set-fov" type="range" min="50" max="85" step="1" value="${s.fov}" /></label>
        <label><input id="set-assist" type="checkbox" ${s.landingAssist ? 'checked' : ''}/> Landing assist</label>
        <label><input id="set-motion" type="checkbox" ${s.reducedMotion ? 'checked' : ''}/> Reduced motion</label>
        <p class="unlocks">Unlocked: ${loadSave().unlocks.map((u) => COSMETICS[u]?.label ?? u).join(', ')}</p>
        <button class="btn primary" data-act="back">Back</button>
      </section>`;
  }

  #bindSettings(ctx: EngineContext, flow: GameFlowModule): void {
    const layer = document.getElementById('ui-layer');
    layer?.querySelector('#set-quality')?.addEventListener('change', (e) => {
      ctx.settings.applyPreset((e.target as HTMLSelectElement).value as 'low' | 'medium' | 'high' | 'ultra');
      ctx.settings.save();
      ctx.events.emit('settings:changed');
    });
    const bindRange = (id: string, apply: (v: number) => void): void => {
      layer?.querySelector(id)?.addEventListener('input', (e) => {
        apply(Number((e.target as HTMLInputElement).value));
        ctx.settings.save();
        ctx.events.emit('settings:changed');
      });
    };
    bindRange('#set-master', (v) => (ctx.settings.masterVolume = v));
    bindRange('#set-sfx', (v) => (ctx.settings.sfxVolume = v));
    bindRange('#set-music', (v) => (ctx.settings.musicVolume = v));
    bindRange('#set-fov', (v) => (ctx.settings.fov = v));
    layer?.querySelector('#set-assist')?.addEventListener('change', (e) => {
      ctx.settings.landingAssist = (e.target as HTMLInputElement).checked;
      ctx.settings.save();
    });
    layer?.querySelector('#set-motion')?.addEventListener('change', (e) => {
      ctx.settings.reducedMotion = (e.target as HTMLInputElement).checked;
      ctx.settings.save();
    });
    layer?.querySelector('[data-act="back"]')?.addEventListener('click', () => flow.goTitle());
  }

  dispose(): void {
    this.#root = null;
    this.#ctx = null;
  }
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
