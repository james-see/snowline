/**
 * Input contracts.
 *
 * Actions are abstracted so rebinding and gamepad mapping never leak into
 * rider physics or trick code.
 */

/** Every discrete action the snowboard game responds to. */
export type InputAction =
  | 'steerLeft'
  | 'steerRight'
  | 'lean'
  | 'jump'
  | 'brake'
  | 'boost'
  | 'grabIndy'
  | 'grabMute'
  | 'grabMelon'
  | 'grabMethod'
  | 'spinLeft'
  | 'spinRight'
  | 'flipFront'
  | 'flipBack'
  | 'pause'
  | 'confirm'
  | 'back'
  | 'cameraLook';

export interface InputState {
  /** True while the action is held. */
  isDown(action: InputAction): boolean;
  /** True only on the frame the action was pressed. */
  wasPressed(action: InputAction): boolean;
  /** True only on the frame the action was released. */
  wasReleased(action: InputAction): boolean;

  /**
   * Accumulated look delta for this frame, in radians, sensitivity applied.
   * x is yaw (positive = left), y is pitch (positive = up).
   */
  readonly look: { x: number; y: number };

  /**
   * Normalised movement input. x is steer (-1 left, +1 right); y is unused
   * but reserved for future twin-stick schemes.
   */
  readonly move: { x: number; y: number };

  readonly pointerLocked: boolean;

  requestPointerLock(): void;
  exitPointerLock(): void;

  sensitivity: number;
  invertY: boolean;

  rebind(action: InputAction, code: string): void;
  getBinding(action: InputAction): string | undefined;

  setLockout(locked: boolean, exempt?: readonly InputAction[]): void;
  readonly lockedOut: boolean;

  /** Active gamepad slot, if any. */
  readonly gamepadIndex?: number | null;
  /** Chrome: true until the user presses a pad button after focus. */
  readonly gamepadAwaitingGesture?: boolean;
  readonly gamepadActive?: boolean;
}

/** Minimal input surface consumed by board physics each fixed step. */
export interface RiderInput {
  steer: number;
  lean: number;
  jump: boolean;
  jumpPressed: boolean;
  brake: boolean;
  boost: boolean;
  spinLeft: boolean;
  spinRight: boolean;
  flipFront: boolean;
  flipBack: boolean;
  grabIndy: boolean;
  grabMute: boolean;
  grabMelon: boolean;
  grabMethod: boolean;
}

/** Builds a physics-facing snapshot from the engine input state. */
export function readRiderInput(input: InputState): RiderInput {
  const steerFromMove = input.move.x;
  const steerFromKeys =
    (input.isDown('steerRight') ? 1 : 0) - (input.isDown('steerLeft') ? 1 : 0);
  const steer =
    Math.abs(steerFromMove) > 0.05 ? steerFromMove : steerFromKeys;

  return {
    steer: Math.max(-1, Math.min(1, steer)),
    lean: input.isDown('lean') ? 1 : 0,
    jump: input.isDown('jump'),
    jumpPressed: input.wasPressed('jump'),
    brake: input.isDown('brake'),
    boost: input.isDown('boost'),
    spinLeft: input.isDown('spinLeft'),
    spinRight: input.isDown('spinRight'),
    flipFront: input.isDown('flipFront'),
    flipBack: input.isDown('flipBack'),
    grabIndy: input.isDown('grabIndy'),
    grabMute: input.isDown('grabMute'),
    grabMelon: input.isDown('grabMelon'),
    grabMethod: input.isDown('grabMethod'),
  };
}
