# Performance Report: Pocket Instinct, 2026-10-31

Build: branch `claude/instinct-polish`, `npm run build:game` writes `dist/game/index.html` + `dist/game/app.js` (also `dist/snap-iq-game.html`).
Scene: `dist/game/index.html?autoplay=1&seed=11`, playtest on, Pocket Instinct started, measurement from 1.5 s after the first snap.
Harness: headless Chromium (Playwright), viewport 1024x768, deviceScaleFactor 2, CDP `Emulation.setCPUThrottlingRate` 1x / 4x / 6x, 40 s of live snaps per rate. An injected rAF wrapper recorded frame intervals and rAF callback time. Canvas prototype wrappers counted calls per frame. A CDP sampling CPU profile ran at 4x and 6x. An ablation series used scratch builds of the bundle with one feature removed (source untouched).
Scratch scripts and raw data are in `/tmp/claude-0/-home-user/9db2a43f-830c-57d1-b2d8-b2d9feb12d5b/scratchpad/perf/` (`prof.js`, `varprof.js`, `vbuild.mjs`, `c1/c4/c6.json`, `m4/m6.json`, `cpu4/cpu6.cpuprofile`, `vars.out`).

## How to read these numbers (important)

- Headless Chromium draws canvas 2D in software on the CPU, and CDP throttling slows that rasterisation too. An iPad (2020) runs Safari with a GPU-backed canvas. So the **frame interval** numbers overstate the problem. Use them to rank where the time goes, not as a forecast for the device.
- The **rAF callback time** (sim + JS that issues the draw calls, plus any synchronous flushes) is the better stand-in for main-thread cost on the iPad. It is over budget at 4x anyway.
- Frame intervals snap to vsync steps (16.7 / 33.3 / 50 ms).
- A control page (one full-screen fillRect on a 2048x1536 canvas) held 16.67 ms at DPR 1 and 2. So the harness itself can run at 60 fps.

## Frame Time Budget: 16 ms (PRD §14.5)

| Throttle | Frame interval mean | p95 | p99 | Frames > 16.7 ms | rAF callback (JS) mean | p95 | p99 | Callbacks > 16.7 ms |
|---|---|---|---|---|---|---|---|---|
| 1x | 32.5 ms | 50.0 | 50.1 | 80.8 % | 4.6 ms | 9.3 | 11.9 | 0.4 % |
| **4x** (iPad 2020 proxy) | **119.0 ms** | **183.4** | 216.7 | 81.9 % | **20.4 ms** | **35.7** | 50.0 | 68.3 % |
| **6x** (iPad 2020 proxy, pessimistic) | **204.8 ms** | **316.6** | 350.0 | 87.3 % | **34.9 ms** | **56.8** | 70.5 | 72.7 % |

Status: **OVER** at 4x and 6x, on JS cost alone and much more on frame interval. Even at 1x the software-raster frame runs at about 30 fps.

The template's per-category split (gameplay, rendering, physics, AI, audio) does not fit this game. Here is the split the profile supports:

| Category | Budget | Actual (4x CPU profile share) | Status |
|---|---|---|---|
| Native rasterisation / canvas internals ("(program)") | none set | 79.4 % | dominant |
| `drawImage` (flushes the own-player layer, vignette, panorama) | none set | 10.8 % | high |
| `strokeText` (jersey number outlines) | none set | 2.4 % | medium |
| App JS (sim `step`, draw code, projection) | none set | about 3 % in total | low |
| Garbage collector | none set | 0.3 % | low |
| Audio | none set | NOT MEASURED (no audio in this mode) | n/a |

Sim cost: `step` was 41 ms of samples over the whole 4x run, which is negligible. **The bottleneck is rendering fill (pixels), not the sim.**

## DPR cap

- The cap is in code: `src/game/eyes.js:422` `DPR = Math.min(window.devicePixelRatio || 1, 2)`. Measured `devicePixelRatio` = 2, so the cap holds (≤ 2). **OK.**
- The own-player `layer` canvas is also allocated at full DPR (`eyes.js:399/423`). That makes two 2048x1536 backing stores, which are cleared and composited every frame.
- The vignette canvas is built at CSS size (`eyes.js:474`) and upscaled each frame. That is cheap in memory but is still a full-screen draw.

## Draw calls per frame (NOT ASSESSED: no committed budget)

Average per frame at 1x (similar at 4x and 6x): beginPath 408, stroke 321, fill 162, arc 114, save 59, fillText 27, createRadialGradient 25.7, ellipse 24, createLinearGradient 11.9, strokeText 10.7, fillRect 8.5, measureText 5.8, drawImage 2.1, clearRect 0.7. Canvas creation per frame: **0**. The page holds 4 canvases, and the count stayed stable.

## Memory (NOT ASSESSED: no committed budget)

| Item | Estimate |
|---|---|
| Main canvas 2048x1536 RGBA | about 12.6 MB |
| Own-player layer 2048x1536 | about 12.6 MB |
| Vignette (CSS size, about 1024x768) | about 3 MB |
| Panorama (about 2.7k x 0.15k px) + 128x128 grain | about 1.6 MB |
| JS heap growth over a long run | **NOT MEASURED** (the long-run heap pass was cut before it ran) |

Possible leak sources, from reading the code (not confirmed by a measurement):
- `SnapSim.hist` arrays grow every step, but a new SnapSim is made each snap and the old one is replaced. That is bounded unless something keeps old sims; `simShown` keeps one, which is fine.
- No canvases are created per frame.
- GC was 0.3 % of the profile, which points to low allocation pressure.

## Where the frame goes: ablation at 1x, DPR 2 (one 12 s run each, noise about ±1.5 ms)

| Removed | Frame interval mean (base 32.65) | Δ interval | rAF JS mean (base 4.76) | Δ JS |
|---|---|---|---|---|
| Turf grain pattern fill (`eyes.js:511`) | 25.87 | **−6.8 ms** | 4.64 | ~0 |
| All player figures (`drawFigure`) | 27.19 | **−5.5 ms** | 1.11 | **−3.65 ms** |
| Vignette drawImage (`eyes.js:722`) | 28.39 | **−4.3 ms** | 4.91 | ~0 |
| Light pool gradient (`eyes.js:508-510`) | 30.45 | −2.2 ms | 4.65 | ~0 |
| Own-player layer composite (`eyes.js:703`) | 30.98 | −1.7 ms | 1.87 | **−2.9 ms** (the composite forces the layer to rasterise synchronously) |
| Light-tower glows (`eyes.js:492-501`) | 31.09 | −1.6 ms | 4.67 | ~0 |
| Contact shadows (`eyes.js:688-694`) | 31.84 | −0.8 ms | 4.70 | ~0 |
| Panorama, turf stripes, chips/labels, hands, look strip, overlay/hud, sky, whole field | — | **NOT MEASURED** (run cut) | — | — |

## Per-frame allocations (from code reading plus counters)

- **Gradients:** about 26 radial and 12 linear per frame.
  - One radial per player contact shadow (`eyes.js:692`).
  - One radial per helmet (`:594`).
  - One linear per torso (`:567`).
  - One radial per light tower (`:496`) and one for the pool (`:508`).
  - One linear for the sky (`:486`).
  - Gradients for the hands and ball (`:638`, `:645`).
  - The edge-flicker linear (`instinct.js:228`), whenever a free rusher is out of view.
- **Canvas creation:** none per frame (only in `buildLayers` on resize).
- **Strings:**
  - `font` strings built per chip and per jersey number (`:578`, `:622`).
  - `rgba(...)` template strings in the ball trail (`:612`) and the edge flicker (`instinct.js:229`).
  - `String(p.num)` twice per figure.
  - `measureText` on every chip, every frame.
- **Objects/arrays:**
  - `stateAt` returns a `new Array(NF)` per player per frame (`:322`).
  - `proj()` returns a new object per call (hundreds per frame).
  - `drawFigure` builds a 16-entry `Pj` object, a `parts` array of closures and a hull per figure.
  - `order`, `info` and `edge` are rebuilt every frame.
  - In the sim, `pos()` does `allies.find()` and returns a fresh `{x,y}`.
  - `ground()` calls `filter().map()` and builds a 39-point array every frame.
- All of these are cheap next to the raster cost (GC 0.3 %), but they add to JS time at 4x and 6x.

## Top bottlenecks and prioritised optimisation list

Gains are measured on the headless proxy unless marked as an estimate. On the iPad's GPU canvas, fill-bound items should cost less in absolute terms but keep the same order. The 16 ms budget is the target throughout.

| # | Change | Expected gain vs 16 ms | Owner |
|---|---|---|---|
| 1 | **Turf grain:** stop filling a full-field pattern every frame. Bake grain (and the light pool, #5) into the turf colour once per size, or draw it at reduced resolution, or drop it below a quality tier. | Measured −6.8 ms interval (1x proxy). Estimated 1-3 ms on device. | technical-artist |
| 2 | **Figures:** pre-render per-team helmet shading as a sprite (drawImage) instead of a radial gradient per helmet. Build the torso gradient once per team in unit space and position it with a transform. Drop the `strokeText` outline on numbers under about 10 px, or use cached number sprites. Cache chip widths per label instead of calling `measureText` every frame. | Measured: all figures cost 5.5 ms interval / 3.65 ms JS. Expected 2-3 ms recovered. | technical-artist |
| 3 | **Vignette:** move it out of the canvas into a CSS overlay element (radial-gradient background, GPU-composited), or at least build it at device resolution and composite once. That also makes the art-bible "tighten" a cheap `opacity` change. | Measured −4.3 ms interval (proxy). Estimated 1-2 ms on device. | technical-artist |
| 4 | **Own-player layer:** stop clearing and compositing a full 2048x1536 offscreen layer. Clear and draw only the dirty rect around own players (track the bounding box), or allocate the layer at the players' bounding size. | Measured −1.7 ms interval / −2.9 ms JS (synchronous flush). Expected 1.5-2.5 ms. | technical-artist |
| 5 | **Static background:** pre-render one light-tower glow sprite and drawImage it. Bake the pool into the turf (#1). Cache the sky gradient per farY band. | Measured: towers −1.6 ms, pool −2.2 ms. Expected 2-3 ms together. | technical-artist |
| 6 | **Contact shadows:** use one pre-rendered soft-shadow sprite, drawn scaled with globalAlpha, instead of a radial gradient plus save/restore per player. This is also the cheap base for the art-bible rusher shadows. | Measured −0.8 ms (all shadows). Expected 0.5 ms. | technical-artist |
| 7 | **JS hot path:** reuse `stateAt` output buffers, write `proj()` into scratch objects in the inner loops, avoid the per-figure `parts` closures, and give the sim's `pos()` a Map lookup instead of `find`. | Estimated 0.5-1.5 ms of rAF JS at 4x (JS app code is about 3 % of the profile). | engine-programmer (sim/`pos`, `stateAt`); technical-artist (eyes.js draw code) |
| 8 | **Render scale:** offer an internal render scale of 1.5 on older iPads (raster cost scales about with DPR², so about 44 % fewer pixels). This stays within the "≤ 2" cap, but it is a visual-quality decision. | Estimated the largest single gain for fill-bound frames (several ms). | escalate to technical-director (quality/budget trade), then technical-artist |

Order of work: #1, #3, #4 and #5 are low-risk changes to cached layers. #2 needs art sign-off on the number outline. #8 is a decision, not a fix.

## Art-bible additions: cost and the cheap way to do each

General rule: **no `ctx.filter`** (not supported on the 2D canvas in the iPadOS 15-17 Safari a 2020 iPad may run, and slow where supported), **no `shadowBlur`**, and no new full-screen canvas passes in steady state.

| Addition | Cost if done naively | Cheap method | Estimated steady cost |
|---|---|---|---|
| Gold additive-glow open-receiver ellipse (replaces green, `instinct.js:210-217`) | Small: a gradient per open ally, or shadowBlur, would add about 0.2-0.5 ms | One pre-rendered gold glow sprite, drawn scaled to the ellipse with `globalCompositeOperation = 'lighter'`; reset the composite mode after | under 0.2 ms |
| Rusher contact shadows lengthen and darken up to +30 % within 6 yd | As now (a gradient per player) plus maths: about 0.1 ms | With the sprite from #6, only scale Y and globalAlpha change. Distance comes from the sim positions already in hand | about 0 |
| Vignette tightens with the nearest rusher (cap 12 %) | A second full-screen drawImage, or rebuilding the gradient each frame: +1 full-screen pass (proxy about 4 ms) | CSS overlay with two pre-baked layers (normal and tight), crossfaded by `opacity`. In canvas, replace the current vignette with one draw whose alpha mixes the two, never two passes | about 0 (CSS) / no extra pass (canvas) |
| 600 ms desaturation on a hit | `ctx.filter = 'saturate()'`: unsupported or slow on Safari | Either a CSS `filter: saturate()` on the canvas element for 600 ms (GPU-composited; check on device), or one full-screen fillRect in grey with `globalCompositeOperation = 'saturation'` at ramped alpha | One full-screen pass, only for 600 ms, at the end of a run |
| 400 ms +6 % warm key lift and soft bloom on a completion | Blur filters or shadowBlur: expensive | Warm lift: one full-screen fillRect, warm colour, low alpha, `'soft-light'` (or `'lighter'` at about 3 %). Bloom: a pre-rendered radial sprite at the receiver or ball with `'lighter'` | One full-screen pass plus a sprite, only for 400 ms |

Net: done as above, the steady-state additions cost about 0 ms. The transient effects add one full-screen pass during their windows. Done naively (filter, shadowBlur, a second vignette pass), they would add at least one full-screen pass per frame on a frame that is already over budget.

## Regressions since last report

None detected. There is no earlier Pocket Instinct profile to compare against, so this report is the baseline.

## Not measured / not assessed

- JS heap growth over a long run: **NOT MEASURED**.
- Ablations for panorama, stripes, chips, hands, look strip, overlay/hud, sky and whole field: **NOT MEASURED**.
- Draw-call and memory budgets: **NOT ASSESSED** (none committed). The measured values are above.
- On-device (iPad Safari) frame times: **NOT MEASURED**. Needed to confirm the proxy.
