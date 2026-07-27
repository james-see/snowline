# Controls

Default map: [GAME_DESIGN.md](GAME_DESIGN.md).

Input is data-driven via `Input.rebind`. Keyboard and gamepad merge each frame (OR for buttons, summed/clamped steer). Capture injection (`Input.inject`) is independent of the pad sampler.

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

## Gamepad (standard mapping)

Hot-plug friendly: listens for `gamepadconnected` / `gamepaddisconnected`, tracks the active pad index, and falls back to the first connected slot. Requires a browser-standard layout (`mapping: "standard"` — DualSense, Xbox, Switch Pro over Bluetooth typically qualify after the first button press).

| Action | Control |
|--------|---------|
| Steer | Left stick X |
| Camera look | Right stick |
| Jump | A |
| Brake | B |
| Lean | LT |
| Boost | RT |
| Spin | D-pad ← / → |
| Flip | D-pad ↑ / ↓ |
| Grabs | X Indy · Y Mute · LB Melon · RB Method |
| Pause | Start |
| Back (menus) | Select / View |

Menus also read the pad directly in `UiModule` (stick / D-pad navigate, A confirm, B back) so UI works while gameplay input is locked out.

## Settings

Landing assist, reduced camera shake (see settings screen).
