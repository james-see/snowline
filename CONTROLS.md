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

Landing assist, reduced motion, and **Controller Test**: live connected pads (id / mapping / index), axis meters, button grid, binding legend (LS/A/B/LT/RT/Start). Back with Esc/B only — A does not leave the panel. Same snapshot as `window.__snowline.gamepadDebug()`.
