import type { InputAction, InputState } from '@/types/input.ts';
import type { EventBus } from '@/types/events.ts';

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
const GAMEPAD_DEADZONE = 0.18;

export class Input implements InputState {
  #down = new Set<string>();
  #pressed = new Set<string>();
  #released = new Set<string>();
  #bindings = new Map<InputAction, string>();
  #injected = new Set<InputAction>();

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
    // Secondary lean binding
    this.#bindings.set('lean', 'KeyE');
    this.#attach();
  }

  get pointerLocked(): boolean {
    return this.#locked;
  }

  get lockedOut(): boolean {
    return this.#lockedOut;
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
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    this.#element.addEventListener('contextmenu', onContextMenu);

    this.#disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      this.#element.removeEventListener('contextmenu', onContextMenu);
    });
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

    // Q or E for lean
    if (this.#down.has('KeyQ') || this.#down.has('KeyE')) {
      this.#injected.add('lean');
    }
  }

  #readGamepad(): { x: number; lookX: number; lookY: number } {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads[0];
    if (!gp) return { x: 0, lookX: 0, lookY: 0 };
    const dz = (v: number): number => (Math.abs(v) < GAMEPAD_DEADZONE ? 0 : v);
    const x = dz(gp.axes[0] ?? 0);
    const lookX = -dz(gp.axes[2] ?? 0) * 0.08;
    const lookY = dz(gp.axes[3] ?? 0) * 0.05;

    if (gp.buttons[0]?.pressed) this.#injected.add('jump');
    else this.#injected.delete('jump');
    if (gp.buttons[1]?.pressed) this.#injected.add('brake');
    else this.#injected.delete('brake');
    if (gp.buttons[2]?.pressed) this.#injected.add('grabIndy');
    else this.#injected.delete('grabIndy');
    if (gp.buttons[4]?.pressed || (gp.buttons[7]?.value ?? 0) > 0.3) this.#injected.add('boost');
    else this.#injected.delete('boost');
    if ((gp.buttons[6]?.value ?? 0) > 0.3) this.#injected.add('lean');
    else if (!this.#down.has('KeyQ') && !this.#down.has('KeyE')) this.#injected.delete('lean');
    if (gp.buttons[9]?.pressed && !this.#down.has('Escape')) {
      this.#pressed.add('Escape');
      this.#down.add('Escape');
    }

    return { x, lookX, lookY };
  }

  endFrame(): void {
    this.#pressed.clear();
    this.#released.clear();
    // Clear edge-triggered injects that aren't held by pad this frame is handled in beginFrame
  }

  setLockout(locked: boolean, exempt: readonly InputAction[] = LOCKOUT_EXEMPT): void {
    this.#lockedOut = locked;
    this.#exempt = new Set(exempt);
  }

  #suppressed(action: InputAction): boolean {
    return this.#lockedOut && !this.#exempt.has(action);
  }

  isDown(action: InputAction): boolean {
    if (this.#suppressed(action)) return false;
    if (this.#injected.has(action)) return true;
    if (action === 'lean') {
      return this.#down.has('KeyQ') || this.#down.has('KeyE') || this.#injected.has('lean');
    }
    const code = this.#bindings.get(action);
    return code !== undefined && this.#down.has(code);
  }

  wasPressed(action: InputAction): boolean {
    if (this.#suppressed(action)) return false;
    if (action === 'lean') {
      return this.#pressed.has('KeyQ') || this.#pressed.has('KeyE');
    }
    const code = this.#bindings.get(action);
    return code !== undefined && this.#pressed.has(code);
  }

  wasReleased(action: InputAction): boolean {
    if (this.#suppressed(action)) return false;
    const code = this.#bindings.get(action);
    return code !== undefined && this.#released.has(code);
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
  }
}
