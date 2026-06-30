# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
node server.js        # serves on http://localhost:8080
# or
python -m http.server 8080
```

The `.claude/launch.json` uses Python on port 3000 for Claude Code on the web. There is no build step, no package.json, no transpilation — edit files and refresh the browser.

On Windows, `起動.bat` auto-detects Node.js or Python and launches the browser.

## Architecture

This is a **zero-dependency, single-page animation editor** written in vanilla JavaScript. The entire application is three files: `index.html`, `app.js` (~3200 lines), and `style.css`. It ships as a PWA via `sw.js`.

### Two IIFEs in app.js

**Main IIFE** (lines 1–3187): The entire animation engine. All state, rendering, audio, export, and UI live here.

**Dock Manager IIFE** (lines 3189–end): Handles resizable splitters and the tab/float panel system. Communicates back to the main IIFE only via `window._studioRefreshAll`.

### State Model

A single `state` object is the source of truth. The key sub-structures:

- **Layer** — `{ id, name, img, imgSrc, thumbCanvas, visible, x, y, w, h, rotation, opacity, scaleX, scaleY, keyframes[], vibrations[] }`
- **Keyframe** — `{ time, x, y, rotation, opacity, scaleX, scaleY, easing }` (easing: `linear | easeIn | easeOut | easeInOut`)
- **Vibration** — `{ sourceType: 'bgm'|'sfx'|'voice', sourceIndex, intensity, threshold }` — shakes a layer in sync with an audio track's amplitude during playback
- **Audio track** — `{ id, name, audioBuffer, dataUrl, startTime, volume, duration, vc }` — stored in `state.bgmTracks`, `state.sfxTracks`, or `state.voiceTracks`
- **VC (voice changer)** — `{ enabled, pitch, bass, mid, treble }` — per-track; `pitch` drives `playbackRate`, the rest use BiquadFilter nodes
- **Subtitle** — `{ id, text, startTime, endTime, x, y, fontSize, color, bgColor, bgOpacity, outlineColor, outlineWidth, speaker, position }` — `position` is `top | center | bottom | custom`

### Undo/Redo

`pushUndo()` snapshots state before any mutation. `snapshotState()` intentionally excludes the `img` and `thumbCanvas` fields (these are large DOM objects). Instead, a separate `imageCache` Map (`layerId → { img, thumbCanvas }`) holds them so `applySnapshot()` can rehydrate layers from it.

**Always call `pushUndo()` before mutating state.**

### Rendering

- Canvas is fixed at **1920×1080** (`CANVAS_W`/`CANVAS_H`); it is scaled down to fit the viewport via CSS transform.
- The `<canvas id="stage-canvas">` is inert to mouse events. A sibling `<div id="canvas-overlay">` catches all pointer interaction.
- `render()` draws: checkerboard background → layers in **reverse index order** (index 0 = front/top, last index = back/bottom) → subtitles on top.
- `renderLayer()` calls `getLayerStateAtTime()` to interpolate position between keyframes. During playback it also applies `getLayerVibrationOffset()` (reads live AnalyserNode amplitude).

### UI Update Pattern

Every state change must end with either `refreshAll()` or the specific refresh functions it delegates to:

```
refreshAll()
  ├── refreshLayerList()
  ├── refreshProperties()
  ├── refreshTimeline()
  ├── refreshAudioLists()
  ├── refreshSubtitleList()
  ├── refreshVoiceChangerUI()
  └── render()
```

Call `render()` alone only for live-drag updates that don't need the panel UIs rebuilt.

### Audio Pipeline

All audio goes through the Web Audio API. A lazy singleton `AudioContext` is returned by `getAudioCtx()`.

- **Playback**: `startAudioPlayback()` creates `BufferSource → Gain → [optional BiquadFilter chain] → AnalyserNode → destination` for each track. The AnalyserNodes are keyed as `'type:index'` in `state.activeAnalysers` for the vibration system.
- **Voice changer**: `buildVCChain(ctx, settings)` returns `{ inputNode: BiquadFilter(bass), outputNode: BiquadFilter(treble) }` with mid in between. Applied destructively via `OfflineAudioContext` when the user clicks "適用".
- **Export mixdown**: `renderAudioMixdown()` uses `OfflineAudioContext` to produce a single stereo buffer, then a live `AudioContext` feeds it into a `MediaStreamDestination` which is mixed into the `MediaRecorder` stream.

### Export

Two paths, chosen based on GPU availability and user setting:

1. **GPU path** (`exportWithGLMediaRecorder`): WebGL2 compositing canvas + subtitle Canvas2D overlay. Uses a minimal GLSL shader (one quad, `mat3` transform, alpha uniform).
2. **CPU fallback** (`exportWithCanvas2D`): Canvas2D with the same `renderLayer()` used for preview.

Both paths: frame loop paced with `setTimeout(r, 1000/fps)` → `MediaRecorder` → download as WebM or MP4.

Vibration during export is pre-analyzed from PCM data by `analyzeAudioForVibration()` (avoids real-time AnalyserNode dependency).

### Asset Browser

`assets/manifest.json` lists all SVG assets with `{ file, name }`. When a new SVG is added to `assets/`, its entry must be added to this manifest for the asset browser to show it.

### Project File Format

Projects are saved as `.animproj` (JSON) with `version: 2`. Images are embedded as base64 data URLs in `imgSrc`. Audio tracks store their data URL in `dataUrl` and are re-decoded via `AudioContext.decodeAudioData()` on load. `loadProject()` handles migration from v1 format (converts old `startX/endX/animDuration` to keyframe arrays).

### PWA / Service Worker

`sw.js` caches `index.html`, `app.js`, `style.css`, and `manifest.json` under the key `animstudio-v7`. Bump this version string whenever those files change and a forced cache refresh is needed.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `K` | Add keyframe to selected layer |
| `Delete` / `Backspace` | Remove selected layer |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Y` / `Ctrl/Cmd+Shift+Z` | Redo |

Shortcuts are suppressed when an `<input>`, `<textarea>`, or `<select>` is focused.

## Key Constants

```js
CANVAS_W = 1920, CANVAS_H = 1080   // logical canvas resolution
TIMELINE_PX_PER_SEC = 80            // pixels per second in timeline
TRACK_LABEL_WIDTH = 120             // px width of track labels
MAX_UNDO = 50                       // undo stack depth
```
