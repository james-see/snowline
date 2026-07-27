import type { InputAction, InputState } from '@/types/input.ts';
import type { EventBus } from '@/types/events.ts';
import {
  dumpGamepads,
  edgeSets,
  gamepadsAwaitingGesture,
  pickConnectedGamepad,
  sampleGamepad,
  type GamepadDebugDump,
} from '@/engine/gamepadMap.ts';

const DEFAULT_BINDINGS: Record<InputAction, string> = {
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  lean: 'KeyQ',
  jump: 'Space',
  brake: 'KeyS',
  boost: 'ShiftLeft',
  grabIndy: 'KeyJ',
  grabMute: 'KeyK',
  grabMelon: 'KeyL',
  grabMethod: 'KeyU',
  spinLeft: 'ArrowLeft',
  spinRight: 'ArrowRight',
  flipFront: 'ArrowUp',
  flipBack: 'ArrowDown',
  pause: 'Escape',
  confirm: 'Enter',
  back: 'Backspace',
  cameraLook: 'Mouse2',
};

const LOCKOUT_EXEMPT: readonly InputAction[] = ['pause', 'confirm', 'back'];

export class Input implements InputState {
  #down = new Set<string>();
  #pressed = new Set<string>();
  #released = new Set<string>();
  #bindings = new Map<InputAction, string>();
  /** Capture / synthetic holds — never cleared by gamepad sampling. */
  #injected = new Set<InputAction>();

  #padIndex: number | null = null;
  #padHeld = new Set<InputAction>();
  #padPressed = new Set<InputAction>();
  #padReleased = new Set<InputAction>();
  /** Chrome: getGamepads() stays all-null until a button press after focus. */
  #padAwaitingGesture = false;
  /** True once we have successfully sampled a connected pad this session. */
  #padActivated = false;
  #padSeenConnect = false;

  #lookX = 0;
  #lookY = 0;
  #locked = false;
  #lockedOut = false;
  #exempt: Set<InputAction> = new Set(LOCKOUT_EXEMPT);

  readonly look = { x: 0, y: 0 };
  readonly move = { x: 0, y: 0 };

  sensitivity = 0.002;
  invertY = false;

  #element: HTMLElement;
  #events: EventBus | null;
  #disposers: Array<() => void> = [];

  constructor(element: HTMLElement, events: EventBus | null = null) {
    this.#element = element;
    this.#events = events;
    for (const [action, code] of Object.entries(DEFAULT_BINDINGS)) {
      this.rebind(action as InputAction, code);
    }
    // Secondary lean binding (isDown checks both keys)
    this.#bindings.set('lean', 'KeyE');
    this.#attach();
  }

  get pointerLocked(): boolean {
    return this.#locked;
  }

  get lockedOut(): boolean {
    return this.#lockedOut;
  }

  /** Active gamepad index, or null when none connected. */
  get gamepadIndex(): number | null {
    return this.#padIndex;
  }

  /** True after at least one successful pad sample this page session. */
  get gamepadActive(): boolean {
    return this.#padActivated && this.#padIndex !== null;
  }

  /**
   * Chrome/WebKit: pads stay null until the user presses a gamepad button
   * after the document is focused. UI shows a one-time hint while this is true.
   */
  get gamepadAwaitingGesture(): boolean {
    return this.#padAwaitingGesture && !this.#padActivated;
  }

  #attach(): void {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.#press(e.code);
    };
    const onKeyUp = (e: KeyboardEvent): void => this.#release(e.code);
    const onMouseDown = (e: MouseEvent): void => this.#press(`Mouse${e.button}`);
    const onMouseUp = (e: MouseEvent): void => this.#release(`Mouse${e.button}`);
    const onMouseMove = (e: MouseEvent): void => {
      if (!this.#locked) return;
      this.#lookX -= e.movementX;
      this.#lookY += this.invertY ? e.movementY : -e.movementY;
    };
    const onContextMenu = (e: Event): void => e.preventDefault();
    const onPointerLockChange = (): void => {
      this.#locked = document.pointerLockElement === this.#element;
      // Keyboard only — pad is re-sampled from getGamepads each frame.
      if (!this.#locked) this.#down.clear();
      this.#events?.emit('engine:pointer-lock', { locked: this.#locked });
    };
    const onBlur = (): void => {
      // Clear keys on blur; do NOT wipe pad edges — pointer-lock / focus blips
      // would drop held buttons and re-fire wasPressed (spurious pause/jump).
      this.#down.clear();
    };
    const onPadConnected = (e: GamepadEvent): void => {
      this.#padSeenConnect = true;
      if (this.#padIndex === null) this.#padIndex = e.gamepad.index;
    };
    const onPadDisconnected = (e: GamepadEvent): void => {
      if (this.#padIndex === e.gamepad.index) {
        this.#padIndex = null;
        this.#clearPadEdges();
      }
    };

    const root = globalThis as typeof globalThis & {
      addEventListener: typeof addEventListener;
      removeEventListener: typeof removeEventListener;
    };
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('mousedown', onMouseDown);
    root.addEventListener('mouseup', onMouseUp);
    root.addEventListener('mousemove', onMouseMove);
    root.addEventListener('blur', onBlur);
    root.addEventListener('gamepadconnected', onPadConnected);
    root.addEventListener('gamepaddisconnected', onPadDisconnected);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    this.#element.addEventListener('contextmenu', onContextMenu);

    this.#disposers.push(() => {
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('keyup', onKeyUp);
      root.removeEventListener('mousedown', onMouseDown);
      root.removeEventListener('mouseup', onMouseUp);
      root.removeEventListener('mousemove', onMouseMove);
      root.removeEventListener('blur', onBlur);
      root.removeEventListener('gamepadconnected', onPadConnected);
      root.removeEventListener('gamepaddisconnected', onPadDisconnected);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      this.#element.removeEventListener('contextmenu', onContextMenu);
    });
  }

  #clearPadEdges(): void {
    this.#padHeld.clear();
    this.#padPressed.clear();
    this.#padReleased.clear();
  }

  #press(code: string): void {
    if (!this.#down.has(code)) this.#pressed.add(code);
    this.#down.add(code);
  }

  #release(code: string): void {
    if (this.#down.has(code)) this.#released.add(code);
    this.#down.delete(code);
  }

  beginFrame(): void {
    const scale = this.#lockedOut ? 0 : this.sensitivity;
    this.look.x = this.#lookX * scale;
    this.look.y = this.#lookY * scale;
    this.#lookX = 0;
    this.#lookY = 0;

    // Sample pad before digital steer so stick → steerLeft/Right lands this frame.
    const pad = this.#readGamepad();

    let mx = 0;
    if (this.isDown('steerRight')) mx += 1;
    if (this.isDown('steerLeft')) mx -= 1;
    // Analog stick wins when deflected; digital pad/keys still contribute when idle stick.
    if (Math.abs(pad.x) > 0.05) mx = pad.x;
    else mx = Math.max(-1, Math.min(1, mx));

    if (pad.lookX || pad.lookY) {
      this.look.x += pad.lookX;
      this.look.y += pad.lookY;
    }

    this.move.x = this.#lockedOut ? 0 : mx;
    this.move.y = 0;
  }

  #readGamepad(): { x: number; lookX: number; lookY: number } {
    const pads = typeof navigator !== 'undefined' ? (navigator.getGamepads?.() ?? []) : [];
    const list = Array.from(pads);
    const awaiting = gamepadsAwaitingGesture(list) || (this.#padSeenConnect && !this.#padActivated);
    this.#padAwaitingGesture = awaiting && !pickConnectedGamepad(list, this.#padIndex);

    const gp = pickConnectedGamepad(list, this.#padIndex);
    if (!gp) {
      if (this.#padHeld.size > 0) {
        const { released } = edgeSets(this.#padHeld, new Set());
        this.#padPressed.clear();
        this.#padReleased = released;
        this.#padHeld.clear();
      } else {
        this.#padPressed.clear();
        this.#padReleased.clear();
      }
      // Keep preferred index while Chrome still returns null slots (pre-gesture).
      if (!this.#padAwaitingGesture) this.#padIndex = null;
      return { x: 0, lookX: 0, lookY: 0 };
    }

    this.#padIndex = gp.index;
    this.#padActivated = true;
    this.#padAwaitingGesture = false;
    const sample = sampleGamepad(gp);
    const { pressed, released } = edgeSets(this.#padHeld, sample.held);
    this.#padHeld = sample.held;
    this.#padPressed = pressed;
    this.#padReleased = released;

    return { x: sample.steer, lookX: sample.lookX, lookY: sample.lookY };
  }

  endFrame(): void {
    this.#pressed.clear();
    this.#released.clear();
    this.#padPressed.clear();
    this.#padReleased.clear();
  }

  setLockout(locked: boolean, exempt: readonly InputAction[] = LOCKOUT_EXEMPT): void {
    this.#lockedOut = locked;
    this.#exempt = new Set(exempt);
  }

  #suppressed(action: InputAction): boolean {
    return this.#lockedOut && !this.#exempt.has(action);
  }

  #keyboardDown(action: InputAction): boolean {
    if (action === 'lean') {
      return this.#down.has('KeyQ') || this.#down.has('KeyE');
    }
    const code = this.#bindings.get(action);
    return code !== undefined && this.#down.has(code);
  }

  #keyboardPressed(action: InputAction): boolean {
    if (action === 'lean') {
      return this.#pressed.has('KeyQ') || this.#pressed.has('KeyE');
    }
    const code = this.#bindings.get(action);
    return code !== undefined && this.#pressed.has(code);
  }

  #keyboardReleased(action: InputAction): boolean {
    if (action === 'lean') {
      return this.#released.has('KeyQ') || this.#released.has('KeyE');
    }
    const code = this.#bindings.get(action);
    return code !== undefined && this.#released.has(code);
  }

  isDown(action: InputAction): boolean {
    if (this.#suppressed(action)) return false;
    return (
      this.#injected.has(action) || this.#padHeld.has(action) || this.#keyboardDown(action)
    );
  }

  wasPressed(action: InputAction): boolean {
    if (this.#suppressed(action)) return false;
    return this.#padPressed.has(action) || this.#keyboardPressed(action);
  }

  wasReleased(action: InputAction): boolean {
    if (this.#suppressed(action)) return false;
    return this.#padReleased.has(action) || this.#keyboardReleased(action);
  }

  pressed(action: InputAction): boolean {
    return this.wasPressed(action);
  }

  released(action: InputAction): boolean {
    return this.wasReleased(action);
  }

  rebind(action: InputAction, code: string): void {
    this.#bindings.set(action, code);
  }

  getBinding(action: InputAction): string | undefined {
    return this.#bindings.get(action);
  }

  requestPointerLock(): void {
    this.#element.requestPointerLock?.();
  }

  exitPointerLock(): void {
    document.exitPointerLock?.();
  }

  inject(actions: InputAction[], down: boolean): void {
    for (const a of actions) {
      if (down) this.#injected.add(a);
      else this.#injected.delete(a);
    }
  }

  /** Live pad dump for capture / console: `window.__snowline.gamepadDebug()`. */
  gamepadDebug(): GamepadDebugDump & {
    activeIndex: number | null;
    activated: boolean;
    awaitingGesture: boolean;
    lockedOut: boolean;
    move: { x: number; y: number };
    held: InputAction[];
  } {
    const pads = typeof navigator !== 'undefined' ? (navigator.getGamepads?.() ?? []) : [];
    const dump = dumpGamepads(Array.from(pads));
    return {
      ...dump,
      awaitingGesture: this.gamepadAwaitingGesture || dump.awaitingGesture,
      activeIndex: this.#padIndex,
      activated: this.#padActivated,
      lockedOut: this.#lockedOut,
      move: { x: this.move.x, y: this.move.y },
      held: [...this.#padHeld],
    };
  }

  dispose(): void {
    for (const d of this.#disposers) d();
    this.#disposers = [];
    this.#clearPadEdges();
  }
}
