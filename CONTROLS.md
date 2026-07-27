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
| Reset to path | R (snap to course centerline at current progress) |
| Pause | Esc |
| Confirm / Back | Enter / Backspace |

## Gamepad

Hot-plug friendly: listens for `gamepadconnected` / `gamepaddisconnected`. Every connected slot is over-sampled each frame in `Input.beginFrame`; **any stick/button activity becomes the active pad** (steals focus from idle Steam/OS ghost slots). Falls back to the preferred index, then the first connected slot.

**Chrome / WebKit activation:** `navigator.getGamepads()` often returns four null slots until you press any gamepad button after the page is focused — no site permission prompt on desktop. A one-time hint appears while that is the case. First activity on title/settings also toasts `Gamepad connected: …`. Keyboard keeps working regardless. Settings → Controller Test clears input lockout and dumps raw slots (`null` vs id) plus `gamepadconnected` counts via `__snowline.gamepadDebug()`.

**Layouts:** Prefers W3C `mapping: "standard"` (DualSense, Xbox, Switch Pro over Bluetooth typically qualify after the first button press). Non-standard Bluetooth pads with 6 axes (LX LY LT RX RY RT) are handled via a fallback axis layout. Face buttons also honor `value` when `pressed` is sticky/false.

**Debug semantics:** `__snowline.gamepadDebug().pads` lists only **non-null** browser slots. `pads: []` + `slotCount: 4` means Chrome returned `[null,null,null,null]` — not Snowline filtering “inactive” pads. That is normal until you press a button after focus (`awaitingGesture: true`). Cross-check with any HTML5 gamepad tester.

**8BitDo Ultimate 2 / Ultimate 2 Bluetooth:** Bluetooth **does** reach Chrome’s Gamepad API for many Mac users (Apple Community reports HTML5 testers seeing Ultimate / Ultimate 2.4g over BT; SDL also enumerates Ultimate 2 Wireless over BT). Do **not** treat `pads: []` alone as “BT broken.” First: focus the tab → press a face button. For Apple pairing, 8BitDo docs want the rear switch on **D** (not X). If still empty after presses: System Settings → Privacy → Bluetooth → Chrome; disable Steam Input; try wired USB-C; optional 2.4 GHz dongle in **X** on Windows-oriented setups. When a pad appears, auto-detect uses `8BitDo`/`Ultimate` in `gamepad.id`: `mapping: "standard"` → W3C Xbox indices; empty mapping → Xbox BT raw HID (A0 · B1 · X3 · Y4 · LB6 · RB7 · LT a3|b8 · RT a4|b9 · Select10 · Start11 · LX0 LY1 RX2 RY5). Settings → **Controller Remap** overrides persist in `snowline.settings.v1`.

**In-run:** `GameFlow.fixedUpdate` clears input lockout while `playing` *before* rider physics, so stick carve is not eaten by menu lockout ordering.

| Action | Control |
|--------|---------|
| Steer | Left stick X (Settings → **Invert steer (X)** defaults on) |
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
| Reset to path | Start+Select chord (or remappable **Reset to path** in Settings) |

Menus also read the pad directly in `UiModule` (stick / D-pad navigate, A confirm, B back) so UI works while gameplay input is locked out. In-run, `UiModule` forces lockout off so pad steer/jump/brake/boost reach the rider.

**Stuck recover:** keyboard **R** (or pad Start+Select / remapped reset) snaps the board to the race centerline at the current `pathT`, clears velocity/stun, and reorients downhill. Uses terrain mesh height — never Rapier `projectPoint`.

### Debug

With the game running, in the browser console:

```js
window.__snowline.gamepadDebug()
```

Returns connected pad ids, mapping, axes, buttons, raw `slots` (null vs present), `awaitingGesture`, `connectEvents`, `documentHasFocus`, `rawMoveX` (pre-lockout), `move`, and held actions.

## Settings

Landing assist, reduced motion, **Invert steer (X)** (`invertGamepadX`, default on — negates left-stick X after sampling for any X/D preset; keyboard A/D unchanged), **Controller Test** (live pads / axes / buttons; shows `(inverted)` on move.x when on; lockout cleared; gesture + Mac troubleshooting copy), and **Controller Remap** (bind-by-press overrides, Reset to auto). Back with Esc/B only — A does not leave the panel. Same snapshot as `window.__snowline.gamepadDebug()`.
