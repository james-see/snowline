import type { InputAction, InputState } from '@/types/input.ts';
import type { EventBus } from '@/types/events.ts';
import {
  autoBindingMap,
  capturePadSource,
  detectGamepadPreset,
  resolveBindingsForPad,
  snapshotPad,
  withReboundAction,
  type GamepadBindAction,
  type GamepadBindingMap,
} from '@/engine/gamepadBindings.ts';
import {
  dumpGamepads,
  edgeSets,
  gamepadHasActivity,
  gamepadsAwaitingGesture,
  pickActiveGamepad,
  readGamepadSlots,
  sampleGamepad,
  type GamepadDebugDump,
  type GamepadSlotScan,
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
  #padConnectCount = 0;
  #padLastConnectId: string | null = null;
  /** Stick X sampled this frame before lockout zeroing (Controller Test). */
  #rawMoveX = 0;
  /** Last pad id announced via consumeGamepadToast (connect / slot steal). */
  #padToastId: string | null = null;
  #padPendingToast: string | null = null;
  /** User overrides from Settings (null = auto-detect preset per pad). */
  #padBindings: GamepadBindingMap | null = null;
  /** Settings bind-by-press target; while set, suppress normal pad actions. */
  #padRebindTarget: GamepadBindAction | null = null;
  #padRebindCooldown = 0;
  #padRebindBaseline: { buttons: number[]; axes: number[] } | null = null;
  /** Last resolved map (for UI / debug). */
  #padResolved: GamepadBindingMap | null = null;

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
      this.#padConnectCount += 1;
      this.#padLastConnectId = e.gamepad.id || `(slot ${e.gamepad.index})`;
      this.#padIndex = e.gamepad.index;
      // Hot-plug / USB: clear awaiting-gesture as soon as Chrome fires connect.
      // (getGamepads may lag one frame — warm it inside the handler.)
      readGamepadSlots();
      this.#padActivated = true;
      this.#padAwaitingGesture = false;
      if (e.gamepad.id && gamepadHasActivity(e.gamepad)) {
        this.#padToastId = e.gamepad.id;
        this.#padPendingToast = e.gamepad.id;
      }
    };
    const onPadDisconnected = (e: GamepadEvent): void => {
      if (this.#padIndex === e.gamepad.index) {
        this.#padIndex = null;
        this.#padToastId = null;
        this.#clearPadEdges();
      }
    };
    const onFocus = (): void => {
      // Re-poll after tab focus — Mac Chrome may keep null slots until then.
      readGamepadSlots();
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
    root.addEventListener('focus', onFocus);
    root.addEventListener('gamepadconnected', onPadConnected);
    root.addEventListener('gamepaddisconnected', onPadDisconnected);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('visibilitychange', onFocus);
    this.#element.addEventListener('contextmenu', onContextMenu);

    this.#disposers.push(() => {
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('keyup', onKeyUp);
      root.removeEventListener('mousedown', onMouseDown);
      root.removeEventListener('mouseup', onMouseUp);
      root.removeEventListener('mousemove', onMouseMove);
      root.removeEventListener('blur', onBlur);
      root.removeEventListener('focus', onFocus);
      root.removeEventListener('gamepadconnected', onPadConnected);
      root.removeEventListener('gamepaddisconnected', onPadDisconnected);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('visibilitychange', onFocus);
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

    this.#rawMoveX = mx;
    this.move.x = this.#lockedOut ? 0 : mx;
    this.move.y = 0;
  }

  #readGamepad(): { x: number; lookX: number; lookY: number } {
    const list = readGamepadSlots();
    // Over-sample every slot; activity + 8BitDo preference steals from zombies.
    const gp = pickActiveGamepad(list, this.#padIndex);
    const awaiting =
      gamepadsAwaitingGesture(list) || (this.#padSeenConnect && !this.#padActivated);
    this.#padAwaitingGesture = awaiting && !gp;

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
    // Toast only on real activity (not idle Steam/OS ghost slots).
    if (gamepadHasActivity(gp) && gp.id !== this.#padToastId) {
      this.#padToastId = gp.id;
      this.#padPendingToast = gp.id;
    }

    this.#padResolved = resolveBindingsForPad(gp, this.#padBindings);

    // Bind-by-press: capture next button/axis, do not drive gameplay/menu actions.
    if (this.#padRebindTarget) {
      if (this.#padRebindCooldown > 0) {
        this.#padRebindCooldown -= 1;
        if (this.#padRebindCooldown === 0) {
          this.#padRebindBaseline = snapshotPad(gp);
        }
      } else if (this.#padRebindBaseline) {
        const src = capturePadSource(gp, this.#padRebindBaseline);
        if (src) {
          const next = withReboundAction(
            this.#padBindings,
            gp,
            this.#padRebindTarget,
            src,
          );
          this.#padBindings = next;
          this.#padResolved = next;
          this.#padRebindTarget = null;
          this.#padRebindBaseline = null;
          this.#clearPadEdges();
          return { x: 0, lookX: 0, lookY: 0 };
        }
      }
      this.#clearPadEdges();
      return { x: 0, lookX: 0, lookY: 0 };
    }

    const sample = sampleGamepad(gp, this.#padBindings);
    const { pressed, released } = edgeSets(this.#padHeld, sample.held);
    this.#padHeld = sample.held;
    this.#padPressed = pressed;
    this.#padReleased = released;

    return { x: sample.steer, lookX: sample.lookX, lookY: sample.lookY };
  }

  /** Persistable overrides (null = auto preset from pad id). */
  getGamepadBindings(): GamepadBindingMap | null {
    return this.#padBindings;
  }

  setGamepadBindings(map: GamepadBindingMap | null): void {
    this.#padBindings = map;
  }

  /** Active map after auto-detect / overrides (null before first pad sample). */
  getResolvedGamepadBindings(): GamepadBindingMap | null {
    return this.#padResolved;
  }

  /** Start listening for the next button/axis to bind `action`. */
  beginGamepadRebind(action: GamepadBindAction): void {
    this.#padRebindTarget = action;
    this.#padRebindBaseline = null;
    // Ignore the click/confirm that opened listening.
    this.#padRebindCooldown = 12;
  }

  cancelGamepadRebind(): void {
    this.#padRebindTarget = null;
    this.#padRebindCooldown = 0;
    this.#padRebindBaseline = null;
  }

  get gamepadRebindTarget(): GamepadBindAction | null {
    return this.#padRebindTarget;
  }

  /** Reset to auto-detect (clears Settings overrides). */
  resetGamepadBindings(): void {
    this.#padBindings = null;
    this.#padResolved = null;
    this.cancelGamepadRebind();
  }

  /**
   * One-shot toast id after first activity / slot steal.
   * UI: “Gamepad connected: …”. Returns null when nothing new.
   */
  consumeGamepadToast(): string | null {
    const id = this.#padPendingToast;
    this.#padPendingToast = null;
    return id;
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

  /** Active resolved map for the current pad (for Settings remap UI). */
  resolvedGamepadBindings(): GamepadBindingMap | null {
    const gp = pickActiveGamepad(readGamepadSlots(), this.#padIndex);
    if (!gp) {
      return this.#padBindings ?? autoBindingMap({ id: '', mapping: 'standard', axes: [0, 0, 0, 0] });
    }
    return resolveBindingsForPad(gp, this.#padBindings);
  }

  gamepadPresetId(): string {
    const gp = pickActiveGamepad(readGamepadSlots(), this.#padIndex);
    if (!gp) return 'none';
    if (this.#padBindings?.preset === 'custom') return 'custom';
    return detectGamepadPreset(gp.id, gp.mapping);
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
    documentHasFocus: boolean;
    connectEvents: number;
    lastConnectId: string | null;
    move: { x: number; y: number };
    /** Stick X before lockout zeroing — Controller Test should use this. */
    rawMoveX: number;
    held: InputAction[];
    bindings: GamepadBindingMap | null;
    rebindTarget: GamepadBindAction | null;
    slots: GamepadSlotScan[];
  } {
    const list = readGamepadSlots();
    const dump = dumpGamepads(list);
    const active = pickActiveGamepad(list, this.#padIndex);
    const bindings =
      this.#padResolved ??
      (active ? resolveBindingsForPad(active, this.#padBindings) : this.#padBindings);
    const hasFocus =
      typeof document !== 'undefined' && typeof document.hasFocus === 'function'
        ? document.hasFocus()
        : true;
    return {
      ...dump,
      awaitingGesture: this.gamepadAwaitingGesture || dump.awaitingGesture,
      activeIndex: active?.index ?? this.#padIndex,
      activated: this.#padActivated,
      lockedOut: this.#lockedOut,
      documentHasFocus: hasFocus,
      connectEvents: this.#padConnectCount,
      lastConnectId: this.#padLastConnectId,
      move: { x: this.move.x, y: this.move.y },
      rawMoveX: this.#rawMoveX,
      held: [...this.#padHeld],
      bindings,
      rebindTarget: this.#padRebindTarget,
      slots: dump.slots,
    };
  }

  dispose(): void {
    for (const d of this.#disposers) d();
    this.#disposers = [];
    this.#clearPadEdges();
  }
}
