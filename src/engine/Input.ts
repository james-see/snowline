import type { InputAction, InputState } from '@/types/input.ts';
import type { EventBus } from '@/types/events.ts';
import {
  edgeSets,
  pickConnectedGamepad,
  sampleStandardGamepad,
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
      if (!this.#locked) this.#down.clear();
      this.#events?.emit('engine:pointer-lock', { locked: this.#locked });
    };
    const onBlur = (): void => {
      this.#down.clear();
      this.#clearPadEdges();
    };
    const onPadConnected = (e: GamepadEvent): void => {
      if (this.#padIndex === null) this.#padIndex = e.gamepad.index;
    };
    const onPadDisconnected = (e: GamepadEvent): void => {
      if (this.#padIndex === e.gamepad.index) {
        this.#padIndex = null;
        this.#clearPadEdges();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', onBlur);
    window.addEventListener('gamepadconnected', onPadConnected);
    window.addEventListener('gamepaddisconnected', onPadDisconnected);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    this.#element.addEventListener('contextmenu', onContextMenu);

    this.#disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('gamepadconnected', onPadConnected);
      window.removeEventListener('gamepaddisconnected', onPadDisconnected);
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

    let mx = 0;
    if (this.isDown('steerRight')) mx += 1;
    if (this.isDown('steerLeft')) mx -= 1;

    const pad = this.#readGamepad();
    mx += pad.x;
    if (pad.lookX || pad.lookY) {
      this.look.x += pad.lookX;
      this.look.y += pad.lookY;
    }

    this.move.x = this.#lockedOut ? 0 : Math.max(-1, Math.min(1, mx));
    this.move.y = 0;
  }

  #readGamepad(): { x: number; lookX: number; lookY: number } {
    const pads = typeof navigator !== 'undefined' ? (navigator.getGamepads?.() ?? []) : [];
    const list = Array.from(pads);
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
      this.#padIndex = null;
      return { x: 0, lookX: 0, lookY: 0 };
    }

    this.#padIndex = gp.index;
    const sample = sampleStandardGamepad(gp);
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

  dispose(): void {
    for (const d of this.#disposers) d();
    this.#disposers = [];
    this.#clearPadEdges();
  }
}
