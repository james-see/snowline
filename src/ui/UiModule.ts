import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { CourseId, GameModeId, Medal } from '@/types/gameplay.ts';
import type { InputAction } from '@/types/input.ts';
import type { GameFlowModule, ScreenId } from '@/modes/GameFlowModule.ts';
import type { ScoreModule } from '@/score/ScoreModule.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import { COSMETICS, loadSave } from '@/score/SaveData.ts';
import { COURSE_LIST } from '@/course/CourseDefs.ts';
import {
  BIND_LABELS,
  BIND_UI_ACTIONS,
  formatPadSource,
  type GamepadBindAction,
  type GamepadBindingMap,
} from '@/engine/gamepadBindings.ts';
import {
  buttonDown,
  pickActiveGamepad,
  readGamepadSlots,
  resolveAxisLayout,
} from '@/engine/gamepadMap.ts';
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

const MENU_EXEMPT: readonly InputAction[] = [
  'pause',
  'confirm',
  'back',
  'jump',
  'brake',
  'steerLeft',
  'steerRight',
  'spinLeft',
  'spinRight',
  'flipFront',
  'flipBack',
];

const PAD_REPEAT_MS = 220;

export class UiModule implements GameModule {
  readonly name = 'ui';
  readonly order = 50;

  #root: HTMLElement | null = null;
  #hudVisible = true;
  #popupEl: HTMLElement | null = null;
  #tipShown = false;
  #courseIndex = 0;
  #modeIndex = 0;
  #focusIndex = 0;
  #paintedCourse = -1;
  #paintedMode = -1;
  #settingsReturn: 'title' | 'paused' = 'title';
  #padNavAt = 0;
  #padAxesLatched = false;
  #padA = false;
  #padB = false;
  #padIndex: number | null = null;
  #padHintShown = false;
  #ctx: EngineContext | null = null;
  #screen: ScreenId | null = null;

  init(ctx: EngineContext): void {
    this.#ctx = ctx;
    this.#root = document.getElementById('hud');
    if (!this.#root) return;
    this.#root.innerHTML = '';
    this.#mountShell();
    this.#applyMenuLockout(ctx);
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
    ctx.events.on('course:finish', () => {
      this.#flashPopup('FINISH', 0);
    });

    ctx.setTimeScale(0);
  }

  update(_dt: number, ctx: EngineContext): void {
    const flow = ctx.getModule<GameFlowModule>('flow');
    if (!flow || !this.#root) return;

    const nav = this.#readMenuNav(ctx);

    if (flow.screen === 'course') {
      this.#applyMenuLockout(ctx);
      if (nav.left) this.#courseIndex = (this.#courseIndex + 2) % 3;
      if (nav.right) this.#courseIndex = (this.#courseIndex + 1) % 3;
      if (nav.confirm) flow.goModeSelect(COURSES[this.#courseIndex]!.id);
      if (nav.back) flow.goTitle();
      if (this.#paintedCourse !== this.#courseIndex) this.#paintCourse(flow);
    }

    if (flow.screen === 'mode') {
      this.#applyMenuLockout(ctx);
      if (nav.left) this.#modeIndex = (this.#modeIndex + 2) % 3;
      if (nav.right) this.#modeIndex = (this.#modeIndex + 1) % 3;
      if (nav.confirm) flow.startRun(MODES[this.#modeIndex]!.id);
      if (nav.back) flow.goCourseSelect();
      if (this.#paintedMode !== this.#modeIndex) this.#paintMode(flow);
    }

    if (flow.screen === 'title') {
      this.#applyMenuLockout(ctx);
      this.#handleFocusNav(nav, 2, (i) => {
        if (i === 0) flow.goCourseSelect();
        else this.#openSettings(flow, 'title');
      });
    }

    if (flow.screen === 'paused') {
      this.#applyMenuLockout(ctx);
      this.#handleFocusNav(nav, 4, (i) => {
        if (i === 0) flow.togglePause();
        else if (i === 1) flow.restart();
        else if (i === 2) this.#openSettings(flow, 'paused');
        else flow.goTitle();
      });
      if (nav.back) flow.togglePause();
    }

    if (flow.screen === 'settings') {
      // Controller Test / Remap need live stick + held — clear menu lockout.
      ctx.input.setLockout(false);
      const input = ctx.input as {
        gamepadRebindTarget?: GamepadBindAction | null;
        cancelGamepadRebind?: () => void;
        getGamepadBindings?: () => GamepadBindingMap | null;
      };
      // While listening for a remap, Esc/B cancels listen — does not leave Settings.
      if (nav.back) {
        if (input.gamepadRebindTarget) input.cancelGamepadRebind?.();
        else this.#leaveSettings(flow);
      }
      this.#syncPadBindings(ctx);
      this.#paintPadTest(ctx);
      this.#paintPadRemap(ctx);
    }

    if (flow.screen === 'results') {
      this.#applyMenuLockout(ctx);
      this.#handleFocusNav(nav, 2, (i) => {
        if (i === 0) flow.restart();
        else flow.goTitle();
      });
      if (nav.back) flow.goTitle();
    }

    if (flow.screen === 'playing') {
      // Menus re-apply lockout every frame; ensure in-run never stays locked out.
      ctx.input.setLockout(false);
      this.#maybeShowGamepadHint(ctx);
      if (this.#wantHud()) this.#paintHud(ctx);
    } else {
      this.#maybeShowGamepadHint(ctx);
    }

    this.#maybeToastGamepad(ctx, flow.screen);
  }

  setHud(visible: boolean): void {
    // Capture stills must keep in-run HUD (B9); ignore hide when capture=1.
    if (this.#ctx?.capture) visible = true;
    this.#hudVisible = visible;
    const play = this.#root?.querySelector('.hud-play') as HTMLElement | null;
    const playing = this.#ctx?.getModule<GameFlowModule>('flow')?.screen === 'playing';
    if (play) play.style.display = visible && playing ? 'block' : 'none';
  }

  #applyMenuLockout(ctx: EngineContext): void {
    ctx.input.setLockout(true, MENU_EXEMPT);
  }

  #openSettings(flow: GameFlowModule, from: 'title' | 'paused'): void {
    this.#settingsReturn = from;
    flow.goSettings();
  }

  #leaveSettings(flow: GameFlowModule): void {
    if (this.#settingsReturn === 'paused') {
      flow.screen = 'paused';
      this.#ctx?.events.emit('ui:navigate', { screen: 'paused' });
      return;
    }
    flow.goTitle();
  }

  #handleFocusNav(
    nav: { up: boolean; down: boolean; confirm: boolean },
    count: number,
    onConfirm: (index: number) => void
  ): void {
    if (nav.up) this.#focusIndex = (this.#focusIndex + count - 1) % count;
    if (nav.down) this.#focusIndex = (this.#focusIndex + 1) % count;
    this.#syncFocus(count);
    if (nav.confirm) onConfirm(this.#focusIndex);
  }

  #syncFocus(count: number): void {
    const layer = document.getElementById('ui-layer');
    if (!layer) return;
    const items = layer.querySelectorAll<HTMLElement>('[data-focus]');
    items.forEach((el) => {
      const i = Number(el.dataset.focus);
      el.classList.toggle('focused', i === this.#focusIndex);
    });
    if (items.length > 0 && items.length !== count) {
      this.#focusIndex = Math.min(this.#focusIndex, items.length - 1);
    }
  }

  #readMenuNav(ctx: EngineContext): {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    confirm: boolean;
    back: boolean;
  } {
    const now = performance.now();
    const left = ctx.input.wasPressed('steerLeft') || ctx.input.wasPressed('spinLeft');
    const right = ctx.input.wasPressed('steerRight') || ctx.input.wasPressed('spinRight');
    const up = ctx.input.wasPressed('flipFront');
    const down = ctx.input.wasPressed('flipBack');
    const confirm = ctx.input.wasPressed('confirm') || ctx.input.wasPressed('jump');
    const back = ctx.input.wasPressed('back') || ctx.input.wasPressed('brake');

    const pad = this.#pollPad(now);
    return {
      left: left || pad.left,
      right: right || pad.right,
      up: up || pad.up,
      down: down || pad.down,
      confirm: confirm || pad.confirm,
      back: back || pad.back,
    };
  }

  /** Stick / D-pad / A·B edges — Input zeros move under lockout and misses pad wasPressed. */
  #pollPad(now: number): {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    confirm: boolean;
    back: boolean;
  } {
    const empty = { left: false, right: false, up: false, down: false, confirm: false, back: false };
    const pads = readGamepadSlots();
    const gp = pickActiveGamepad(pads, this.#padIndex);
    if (!gp) {
      this.#padIndex = null;
      this.#padA = false;
      this.#padB = false;
      return empty;
    }
    this.#padIndex = gp.index;

    const aDown = buttonDown(gp.buttons, 0);
    const bDown = buttonDown(gp.buttons, 1);
    const confirm = aDown && !this.#padA;
    const back = bDown && !this.#padB;
    this.#padA = aDown;
    this.#padB = bDown;

    const dz = 0.55;
    const layout = resolveAxisLayout(gp);
    const ax = gp.axes[layout.leftX] ?? 0;
    const ay = gp.axes[layout.leftY] ?? 0;
    const hatLeft = buttonDown(gp.buttons, 14);
    const hatRight = buttonDown(gp.buttons, 15);
    const hatUp = buttonDown(gp.buttons, 12);
    const hatDown = buttonDown(gp.buttons, 13);
    const axisActive =
      Math.abs(ax) > dz || Math.abs(ay) > dz || hatLeft || hatRight || hatUp || hatDown;

    let left = false;
    let right = false;
    let up = false;
    let down = false;

    if (!axisActive) {
      this.#padAxesLatched = false;
    } else if (!this.#padAxesLatched || now - this.#padNavAt >= PAD_REPEAT_MS) {
      this.#padNavAt = now;
      this.#padAxesLatched = true;
      left = ax < -dz || hatLeft;
      right = ax > dz || hatRight;
      up = ay < -dz || hatUp;
      down = ay > dz || hatDown;
    }

    return { left, right, up, down, confirm, back };
  }

  /** In-run HUD on during play; always on in capture (B9). */
  #wantHud(): boolean {
    return this.#hudVisible || !!this.#ctx?.capture;
  }

  #mountShell(): void {
    if (!this.#root) return;
    this.#root.innerHTML = `
      <div class="ui-layer" id="ui-layer"></div>
      <div class="hud-play" id="hud-play" style="display:none">
        <div class="hud-stack hud-stack-tl">
          <div class="hud-score">
            <span class="label">Score</span>
            <span id="hud-score">0</span>
          </div>
          <div class="hud-combo" id="hud-combo-wrap">
            <span class="label">Combo</span>
            <span id="hud-combo">×1.0</span>
          </div>
        </div>
        <div class="hud-stack hud-stack-tr">
          <div class="hud-time">
            <span class="label">Time</span>
            <span id="hud-time">0:00.00</span>
          </div>
          <div class="hud-cp" id="hud-cp">CP 0/0</div>
        </div>
        <div class="hud-stack hud-stack-bl">
          <div class="hud-speed">
            <span id="hud-speed">0</span><span class="unit">km/h</span>
          </div>
          <div class="boost-wrap">
            <span class="label">Boost</span>
            <div class="boost-track"><div class="boost-fill" id="hud-boost"></div></div>
          </div>
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

    const screen = flow.screen;
    const screenChanged = this.#screen !== screen;
    this.#screen = screen;

    play.style.display = screen === 'playing' && this.#wantHud() ? 'block' : 'none';

    if (screen === 'playing') {
      layer.innerHTML = '';
      layer.className = 'ui-layer';
      if (this.#wantHud()) this.#paintHud(ctx);
      return;
    }

    if (!screenChanged) return;

    this.#focusIndex = 0;
    this.#paintedCourse = -1;
    this.#paintedMode = -1;
    layer.className = `ui-layer screen-${screen}`;

    if (screen === 'title') {
      layer.innerHTML = `
        <section class="screen title-screen" aria-label="Title">
          <div class="title-atmos" aria-hidden="true">
            <div class="title-ridge"></div>
            <div class="title-haze"></div>
            <div class="title-sun"></div>
          </div>
          <div class="title-copy">
            <p class="eyebrow">Alpine Arcade</p>
            <h1 class="brand">SNOWLINE</h1>
            <p class="tag">Carve the ridge. Own the air.</p>
            <div class="title-actions">
              <button class="btn primary" data-focus="0" data-act="play">Ride</button>
              <button class="btn ghost" data-focus="1" data-act="settings">Settings</button>
            </div>
            <p class="hint">Enter / A — confirm · ↑↓ select</p>
            <p class="hint pad-hint" id="pad-gesture-hint" hidden>Gamepad: press any button to activate</p>
          </div>
        </section>`;
      layer.querySelector('[data-act="play"]')?.addEventListener('click', () => flow.goCourseSelect());
      layer
        .querySelector('[data-act="settings"]')
        ?.addEventListener('click', () => this.#openSettings(flow, 'title'));
      this.#bindFocusClicks(layer, 2);
      this.#syncFocus(2);
    } else if (screen === 'course') {
      layer.innerHTML = `
        <section class="screen select-screen">
          <h2>Choose a line</h2>
          <div class="cards" id="course-cards"></div>
          <p class="hint">←/→ or stick · Enter / A confirm · B / Back</p>
        </section>`;
      this.#paintCourse(flow);
    } else if (screen === 'mode') {
      layer.innerHTML = `
        <section class="screen select-screen">
          <h2>Mode</h2>
          <div class="cards" id="mode-cards"></div>
          <p class="hint">←/→ or stick · Enter / A confirm · B / Back</p>
        </section>`;
      this.#paintMode(flow);
    } else if (screen === 'paused') {
      layer.innerHTML = `
        <section class="screen pause-screen">
          <h2>Paused</h2>
          <div class="menu-stack">
            <button class="btn primary" data-focus="0" data-act="resume">Resume</button>
            <button class="btn" data-focus="1" data-act="restart">Restart</button>
            <button class="btn" data-focus="2" data-act="settings">Settings</button>
            <button class="btn ghost" data-focus="3" data-act="quit">Quit to Title</button>
          </div>
          <p class="hint">↑/↓ · Enter / A · Esc / B resume</p>
        </section>`;
      layer.querySelector('[data-act="resume"]')?.addEventListener('click', () => flow.togglePause());
      layer.querySelector('[data-act="restart"]')?.addEventListener('click', () => flow.restart());
      layer
        .querySelector('[data-act="settings"]')
        ?.addEventListener('click', () => this.#openSettings(flow, 'paused'));
      layer.querySelector('[data-act="quit"]')?.addEventListener('click', () => flow.goTitle());
      this.#bindFocusClicks(layer, 4);
      this.#syncFocus(4);
    } else if (screen === 'results') {
      layer.innerHTML = this.#resultsHtml(flow);
      layer.querySelector('[data-act="retry"]')?.addEventListener('click', () => flow.restart());
      layer.querySelector('[data-act="title"]')?.addEventListener('click', () => flow.goTitle());
      this.#bindFocusClicks(layer, 2);
      this.#syncFocus(2);
    } else if (screen === 'settings') {
      layer.innerHTML = this.#settingsHtml(ctx);
      this.#bindSettings(ctx, flow);
      this.#syncFocus(1);
    }
  }

  #bindFocusClicks(layer: HTMLElement, count: number): void {
    layer.querySelectorAll<HTMLElement>('[data-focus]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        this.#focusIndex = Number(el.dataset.focus) || 0;
        this.#syncFocus(count);
      });
    });
  }

  #paintCourse(flow: GameFlowModule): void {
    const el = document.getElementById('course-cards');
    if (!el) return;
    this.#paintedCourse = this.#courseIndex;
    el.innerHTML = COURSES.map((c, i) => {
      const def = COURSE_LIST.find((d) => d.id === c.id);
      const diff = def?.difficulty ?? 'blue';
      return `<button class="card ${i === this.#courseIndex ? 'active' : ''}" data-i="${i}" type="button">
        <span class="card-kicker">${diff}</span>
        <span class="card-title">${def?.name ?? c.id}</span>
        <span class="card-blurb">${c.blurb}</span>
      </button>`;
    }).join('');
    el.querySelectorAll('.card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.#courseIndex = Number((btn as HTMLElement).dataset.i);
        flow.goModeSelect(COURSES[this.#courseIndex]!.id);
      });
      btn.addEventListener('mouseenter', () => {
        const next = Number((btn as HTMLElement).dataset.i);
        if (next === this.#courseIndex) return;
        this.#courseIndex = next;
        this.#paintCourse(flow);
      });
    });
  }

  #paintMode(flow: GameFlowModule): void {
    const el = document.getElementById('mode-cards');
    if (!el) return;
    this.#paintedMode = this.#modeIndex;
    el.innerHTML = MODES.map(
      (m, i) => `<button class="card ${i === this.#modeIndex ? 'active' : ''}" data-i="${i}" type="button">
        <span class="card-title">${m.label}</span>
        <span class="card-blurb">${m.blurb}</span>
      </button>`
    ).join('');
    el.querySelectorAll('.card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.#modeIndex = Number((btn as HTMLElement).dataset.i);
        flow.startRun(MODES[this.#modeIndex]!.id);
      });
      btn.addEventListener('mouseenter', () => {
        const next = Number((btn as HTMLElement).dataset.i);
        if (next === this.#modeIndex) return;
        this.#modeIndex = next;
        this.#paintMode(flow);
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
      document.getElementById('hud-combo-wrap')?.classList.toggle('hot', hud.combo >= 2);
    }
    if (rider) {
      set('hud-speed', String(Math.round(rider.state.speed * 3.6)));
      const boost = document.getElementById('hud-boost');
      if (boost) {
        boost.style.width = `${Math.round(rider.state.boostMeter * 100)}%`;
        boost.classList.toggle('full', rider.state.boostMeter >= 0.98);
      }
    }
    const prog = course?.getProgress();
    if (prog) set('hud-cp', `CP ${prog.checkpointsCleared}/${prog.totalCheckpoints}`);
  }

  #flashPopup(text: string, points: number): void {
    if (!this.#popupEl) return;
    this.#popupEl.textContent = points > 0 ? `${text} +${points}` : text;
    this.#popupEl.classList.remove('show');
    void this.#popupEl.offsetWidth;
    this.#popupEl.classList.add('show');
    window.setTimeout(() => this.#popupEl?.classList.remove('show'), 900);
  }

  #showTip(): void {
    const tip = document.getElementById('hud-tip');
    if (!tip) return;
    tip.style.display = 'block';
    tip.textContent =
      'A/D carve · Space jump · Shift boost · Arrows spin/flip · J/K/L/U grabs · Q/E lean · Pad: stick / A / B / RT';
    window.setTimeout(() => {
      tip.style.display = 'none';
    }, 6000);
  }

  /** One-time Chrome activation nudge when getGamepads() is still all-null. */
  #maybeShowGamepadHint(ctx: EngineContext): void {
    if (this.#padHintShown) return;
    if (!ctx.input.gamepadAwaitingGesture) return;
    this.#padHintShown = true;

    const menuHint = document.getElementById('pad-gesture-hint');
    if (menuHint) {
      menuHint.hidden = false;
      window.setTimeout(() => {
        menuHint.hidden = true;
      }, 8000);
      return;
    }

    const tip = document.getElementById('hud-tip');
    if (!tip) return;
    tip.style.display = 'block';
    tip.textContent = 'Press any gamepad button to activate controller';
    window.setTimeout(() => {
      tip.style.display = 'none';
    }, 5000);
  }

  /** First pad activity on title/settings → toast. */
  #maybeToastGamepad(ctx: EngineContext, screen: ScreenId): void {
    const input = ctx.input as { consumeGamepadToast?: () => string | null };
    const id = input.consumeGamepadToast?.();
    if (!id) return;
    if (screen !== 'title' && screen !== 'settings') return;
    const short = id.length > 48 ? `${id.slice(0, 46)}…` : id;
    this.#showToast(`Gamepad connected: ${short}`);
  }

  #showToast(text: string): void {
    let el = document.getElementById('ui-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ui-toast';
      el.className = 'ui-toast';
      (this.#root ?? document.body).appendChild(el);
    }
    el.textContent = text;
    el.classList.add('visible');
    window.setTimeout(() => {
      el?.classList.remove('visible');
    }, 3200);
  }

  /** Live Controller Test panel — same source as `window.__snowline.gamepadDebug()`. */
  #paintPadTest(ctx: EngineContext): void {
    const root = document.getElementById('pad-test');
    if (!root) return;
    const input = ctx.input as {
      gamepadDebug?: () => {
        awaitingGesture: boolean;
        activeIndex: number | null;
        activated: boolean;
        lockedOut: boolean;
        documentHasFocus?: boolean;
        connectEvents?: number;
        lastConnectId?: string | null;
        move: { x: number; y: number };
        rawMoveX?: number;
        held: string[];
        pads: Array<{
          id: string;
          index: number;
          mapping: string;
          connected: boolean;
          axes: number[];
          buttons: Array<{ pressed: boolean; value: number }>;
        }>;
        slots?: Array<{
          index: number;
          present: boolean;
          id: string;
          connected: boolean;
          ghost: boolean;
          activity: boolean;
          pressedButtons: number[];
        }>;
        slotCount: number;
        rebindTarget?: string | null;
        bindings?: { preset?: string } | null;
      };
    };
    const dump = input.gamepadDebug?.();
    if (!dump) {
      root.innerHTML = '<p class="pad-test-empty">Gamepad debug unavailable</p>';
      return;
    }

    const focused = dump.documentHasFocus !== false;
    const connectN = dump.connectEvents ?? 0;
    const rawX = dump.rawMoveX ?? dump.move.x;

    let statusHtml = '';
    if (dump.awaitingGesture && dump.pads.length === 0) {
      statusHtml = `<p class="pad-gesture">Click this page, then press any pad button</p>`;
      if (!focused) {
        statusHtml += `<p class="pad-test-empty">Tab not focused — click the game window first</p>`;
      } else if (connectN === 0) {
        // slotCount 4 + pads [] is Chrome's normal pre-gesture state — not proof BT failed.
        statusHtml += `<p class="pad-test-empty"><code>getGamepads()</code> is four nulls (<code>pads:[]</code> omits nulls only — Snowline is not filtering). Press A/B after focus. Still empty? Mac: rear switch <strong>D</strong> for Apple BT · Privacy → Bluetooth → Chrome · disable Steam Input · verify on any HTML5 gamepad tester · then try USB-C or 2.4&nbsp;GHz X as fallback.</p>`;
      } else {
        statusHtml += `<p class="pad-test-empty">Saw gamepadconnected (${escapeHtml(dump.lastConnectId ?? '?')}) but slots still null — refocus + press again; if stuck, try D-input BT or USB-C / 2.4&nbsp;GHz X.</p>`;
      }
    } else if (dump.awaitingGesture) {
      statusHtml = `<p class="pad-gesture">Press any button to activate</p>`;
    }

    const slots = dump.slots ?? [];
    const slotLine =
      slots.length > 0
        ? `<p class="pad-live-meta">slots ${slots
            .map((s) => {
              if (!s.present) return `#${s.index}=null`;
              const flags = [
                s.connected ? 'on' : 'off',
                s.ghost ? 'ghost' : null,
                s.activity ? 'act' : null,
                s.pressedButtons.length ? `b[${s.pressedButtons.join(',')}]` : null,
              ]
                .filter(Boolean)
                .join(',');
              return `#${s.index}:{${flags}}`;
            })
            .join(' · ')} · connectEvents ${connectN} · focus ${focused ? 'yes' : 'no'}</p>`
        : '';

    const pads =
      dump.pads.length === 0
        ? `<p class="pad-test-empty">No pads connected${dump.slotCount ? ' (slots allocated)' : ''}</p>`
        : `<ul class="pad-list">${dump.pads
            .map((p) => {
              const active = p.index === dump.activeIndex ? ' active' : '';
              const map = p.mapping || 'none';
              return `<li class="pad-item${active}"><span class="pad-id">${escapeHtml(p.id || '(empty id)')}</span><span class="pad-meta">#${p.index} · ${escapeHtml(map)}${active ? ' · active' : ''}</span></li>`;
            })
            .join('')}</ul>`;

    const activePad = dump.pads.find((p) => p.index === dump.activeIndex) ?? dump.pads[0];
    let axesHtml = '<p class="pad-test-empty">—</p>';
    let buttonsHtml = '';
    if (activePad) {
      axesHtml = `<div class="pad-axes">${activePad.axes
        .map((v, i) => {
          const pct = Math.round(((v + 1) / 2) * 100);
          const lit = Math.abs(v) > 0.08 ? ' lit' : '';
          return `<div class="pad-axis${lit}"><span>a${i}</span><div class="pad-axis-track"><i style="left:${pct}%"></i></div><b>${v.toFixed(2)}</b></div>`;
        })
        .join('')}</div>`;
      buttonsHtml = `<div class="pad-buttons">${activePad.buttons
        .map((b, i) => {
          const on = b.pressed || b.value > 0.08;
          return `<span class="pad-btn${on ? ' on' : ''}" title="${b.value.toFixed(2)}">${i}</span>`;
        })
        .join('')}</div>`;
    }

    const held = dump.held.length ? dump.held.join(', ') : '—';
    const rebind = dump.rebindTarget;
    const preset = dump.bindings?.preset;
    const listen = rebind
      ? `<p class="pad-gesture">Remap listening — lit b# / a# are raw indices</p>`
      : '';
    root.innerHTML = `
      ${statusHtml}
      ${listen}
      ${slotLine}
      ${pads}
      <div class="pad-live">
        <div class="pad-live-meta">move.x ${rawX.toFixed(2)} · lockedOut ${dump.lockedOut ? 'yes' : 'no'} · held ${escapeHtml(held)}${preset ? ` · preset ${escapeHtml(String(preset))}` : ''}</div>
        ${axesHtml}
        ${buttonsHtml}
      </div>
      <dl class="pad-legend">
        <div><dt>LS</dt><dd>Steer</dd></div>
        <div><dt>A / b0</dt><dd>Jump</dd></div>
        <div><dt>B / b1</dt><dd>Brake</dd></div>
        <div><dt>LT</dt><dd>Lean</dd></div>
        <div><dt>RT</dt><dd>Boost</dd></div>
        <div><dt>Start</dt><dd>Pause</dd></div>
      </dl>`;
  }

  #resultsHtml(flow: GameFlowModule): string {
    const r = flow.lastResults;
    const medal = (r?.medal ?? 'none') as Medal;
    const medalLabel = medal === 'none' ? 'NO MEDAL' : medal.toUpperCase();
    const courseName = COURSE_LIST.find((c) => c.id === r?.courseId)?.name ?? r?.courseId ?? '—';
    const modeLabel = MODES.find((m) => m.id === r?.mode)?.label ?? r?.mode ?? '—';
    return `
      <section class="screen results-screen">
        <p class="eyebrow finish-banner">FINISH</p>
        <h2>${courseName}</h2>
        <p class="results-mode">${modeLabel} · Run Complete</p>
        <div class="medal-badge medal-${medal}" aria-label="${medalLabel}">
          <span class="medal-ring"></span>
          <span class="medal-label">${medalLabel}</span>
        </div>
        <div class="results-stats">
          <div><span class="label">Time</span><strong>${fmtTime(r?.time ?? 0)}</strong></div>
          <div><span class="label">Score</span><strong>${Math.floor(r?.score ?? 0)}</strong></div>
        </div>
        <div class="menu-stack">
          <button class="btn primary" data-focus="0" data-act="retry">Ride Again</button>
          <button class="btn ghost" data-focus="1" data-act="title">Title</button>
        </div>
        <p class="hint">Enter / A · B / Back to title</p>
      </section>`;
  }

  #settingsHtml(ctx: EngineContext): string {
    const s = ctx.settings;
    const unlocks = loadSave().unlocks.map((u) => COSMETICS[u]?.label ?? u).join(', ');
    return `
      <section class="screen settings-screen">
        <h2>Settings</h2>
        <div class="settings-grid">
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
          <label class="check"><input id="set-assist" type="checkbox" ${s.landingAssist ? 'checked' : ''}/> Landing assist</label>
          <label class="check"><input id="set-motion" type="checkbox" ${s.reducedMotion ? 'checked' : ''}/> Reduced motion</label>
        </div>
        <p class="unlocks">Unlocked: ${unlocks || '—'}</p>
        <section class="pad-test-panel" aria-label="Controller test">
          <h3>Controller Test</h3>
          <p class="pad-test-blurb">No special site permission — click the page, press any button. Console: <code>__snowline.gamepadDebug()</code>. <code>pads:[]</code> + 4 slots = Chrome nulls (pre-gesture or not exposed) — not our filter. <strong>8BitDo on Mac:</strong> Apple BT → rear switch <strong>D</strong>; BT often works in Chrome after a button press.</p>
          <div id="pad-test" class="pad-test"></div>
        </section>
        <section class="pad-remap-panel" aria-label="Controller remap">
          <h3>Controller Remap</h3>
          <p class="pad-test-blurb">8BitDo Ultimate 2 X mode → Xbox standard (or Xbox BT when mapping is empty). Click an action, then press a button / pull a trigger.</p>
          <div id="pad-remap" class="pad-remap"></div>
          <button type="button" class="btn ghost" data-act="pad-reset">Reset to Standard</button>
        </section>
        <button class="btn primary focused" data-focus="0" data-act="back">Back</button>
        <p class="hint">Esc / B — back · click page + any pad button to activate</p>
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
    bindRange('#set-master', (v) => {
      ctx.settings.masterVolume = v;
    });
    bindRange('#set-sfx', (v) => {
      ctx.settings.sfxVolume = v;
    });
    bindRange('#set-music', (v) => {
      ctx.settings.musicVolume = v;
    });
    bindRange('#set-fov', (v) => {
      ctx.settings.fov = v;
    });
    layer?.querySelector('#set-assist')?.addEventListener('change', (e) => {
      ctx.settings.landingAssist = (e.target as HTMLInputElement).checked;
      ctx.settings.save();
    });
    layer?.querySelector('#set-motion')?.addEventListener('change', (e) => {
      ctx.settings.reducedMotion = (e.target as HTMLInputElement).checked;
      ctx.settings.save();
      ctx.events.emit('settings:changed');
    });
    layer?.querySelector('[data-act="back"]')?.addEventListener('click', () => this.#leaveSettings(flow));
    layer?.querySelector('[data-act="pad-reset"]')?.addEventListener('click', () => {
      const input = ctx.input as {
        resetGamepadBindings?: () => void;
      };
      input.resetGamepadBindings?.();
      ctx.settings.gamepadBindings = null;
      ctx.settings.save();
      this.#paintPadRemap(ctx);
    });
  }

  /** Persist Input overrides back into Settings when a rebind completes. */
  #syncPadBindings(ctx: EngineContext): void {
    const input = ctx.input as {
      getGamepadBindings?: () => GamepadBindingMap | null;
      gamepadRebindTarget?: GamepadBindAction | null;
    };
    if (input.gamepadRebindTarget) return;
    const binds = input.getGamepadBindings?.() ?? null;
    if (binds === ctx.settings.gamepadBindings) return;
    // Only write when Input holds a custom map (rebind finished).
    if (binds && binds.preset === 'custom') {
      ctx.settings.gamepadBindings = binds;
      ctx.settings.save();
    }
  }

  #paintPadRemap(ctx: EngineContext): void {
    const root = document.getElementById('pad-remap');
    if (!root) return;
    const input = ctx.input as {
      getResolvedGamepadBindings?: () => GamepadBindingMap | null;
      getGamepadBindings?: () => GamepadBindingMap | null;
      beginGamepadRebind?: (a: GamepadBindAction) => void;
      gamepadRebindTarget?: GamepadBindAction | null;
      gamepadDebug?: () => { bindings: GamepadBindingMap | null; rebindTarget: GamepadBindAction | null };
    };
    const dump = input.gamepadDebug?.();
    const map =
      dump?.bindings ??
      input.getResolvedGamepadBindings?.() ??
      input.getGamepadBindings?.() ??
      null;
    const listening = dump?.rebindTarget ?? input.gamepadRebindTarget ?? null;
    const preset = map?.preset ?? 'standard';
    const rows = BIND_UI_ACTIONS.map((action) => {
      const src = map?.actions?.[action];
      const lit = listening === action ? ' listening' : '';
      const label = BIND_LABELS[action];
      return `<button type="button" class="pad-remap-row${lit}" data-rebind="${action}"><span>${label}</span><b>${formatPadSource(src)}</b></button>`;
    }).join('');
    root.innerHTML = `
      <p class="pad-remap-preset">Preset: <strong>${escapeHtml(preset)}</strong>${listening ? ' · press button/axis…' : ''}</p>
      <div class="pad-remap-list">${rows}</div>`;
    root.querySelectorAll('[data-rebind]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = (el as HTMLElement).dataset.rebind as GamepadBindAction;
        input.beginGamepadRebind?.(action);
        this.#paintPadRemap(ctx);
      });
    });
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
