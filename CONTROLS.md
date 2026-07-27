# Controls

Default map: [GAME_DESIGN.md](GAME_DESIGN.md).

Input is data-driven via `Input.rebind`. Keyboard and gamepad merge each frame (OR for buttons, analog stick overrides digital steer when deflected). Capture injection (`Input.inject`) is independent of the pad sampler.

## Keyboard

| Action | Keys |
|--------|------|
| Steer | A / D |
| Lean | Q / E |
| Jump | Space |
| Brake | S |
| Boost | Shift |
| Spin | ← / → |
| Flip | ↑ / ↓ |
| Grabs | J Indy · K Mute · L Melon · U Method |
| Pause | Esc |
| Confirm / Back | Enter / Backspace |

## Gamepad

Hot-plug friendly: listens for `gamepadconnected` / `gamepaddisconnected`. Every connected slot is over-sampled each frame in `Input.beginFrame`; **any stick/button activity becomes the active pad** (steals focus from idle Steam/OS ghost slots). Falls back to the preferred index, then the first connected slot.

**Chrome / WebKit activation:** `navigator.getGamepads()` often returns all-null slots until you press any gamepad button after the page is focused. A one-time on-screen hint (“Press any gamepad button…”) appears while that is the case. First activity on title/settings also toasts `Gamepad connected: …`. Keyboard keeps working regardless.

**Layouts:** Prefers W3C `mapping: "standard"` (DualSense, Xbox, Switch Pro over Bluetooth typically qualify after the first button press). Non-standard Bluetooth pads with 6 axes (LX LY LT RX RY RT) are handled via a fallback axis layout. Face buttons also honor `value` when `pressed` is sticky/false.

**8BitDo Ultimate 2 (X mode):** Auto-detected when `gamepad.id` contains `8BitDo` + `Ultimate`. If the browser already reports `mapping: "standard"`, W3C Xbox indices are used. On pass-through / empty mapping (common Mac BT), Snowline applies the Xbox Bluetooth raw HID preset (Chromium `MapperXboxBluetooth` / SDL Ultimate 2): A0 · B1 · X3 · Y4 · LB6 · RB7 · LT a3|b8 · RT a4|b9 · Select10 · Start11 · sticks LX0 LY1 RX2 RY5. Settings → **Controller Remap** can override any action by press; overrides persist in `snowline.settings.v1` (`gamepadBindings`).

**In-run:** `GameFlow.fixedUpdate` clears input lockout while `playing` *before* rider physics, so stick carve is not eaten by menu lockout ordering.

| Action | Control |
|--------|---------|
| Steer | Left stick X |
| Camera look | Right stick |
| Jump / Confirm | A |
| Brake | B |
| Lean | LT |
| Boost | RT |
| Spin | D-pad ← / → |
| Flip | D-pad ↑ / ↓ |
| Grabs | X Indy · Y Mute · LB Melon · RB Method |
| Pause | Start |
| Back (menus) | Select / View |

Menus also read the pad directly in `UiModule` (stick / D-pad navigate, A confirm, B back) so UI works while gameplay input is locked out. In-run, `UiModule` forces lockout off so pad steer/jump/brake/boost reach the rider.

### Debug

With the game running, in the browser console:

```js
window.__snowline.gamepadDebug()
```

Returns connected pad ids, mapping, axes, buttons, `awaitingGesture`, `move`, and currently held actions.

## Settings

Landing assist, reduced motion, **Controller Test** (live pads / axes / buttons), and **Controller Remap** (bind-by-press overrides, Reset to auto). Back with Esc/B only — A does not leave the panel. Same snapshot as `window.__snowline.gamepadDebug()`.
