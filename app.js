// Animation Studio - Main Application (Keyframe-based)

(() => {
  'use strict';

  const CANVAS_W = 1920;
  const CANVAS_H = 1080;
  const TIMELINE_PX_PER_SEC = 80;
  const TRACK_LABEL_WIDTH = 120;

  const EASING_FNS = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => t * (2 - t),
    easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  };

  const AUDIO_TRACK_KEYS = { bgm: 'bgmTracks', sfx: 'sfxTracks', voice: 'voiceTracks' };

  // ---- State ----
  const state = {
    projectName: '新規プロジェクト',
    // Each layer: { id, name, img, imgSrc, thumbCanvas, visible, x, y, w, h, rotation, opacity, scaleX, scaleY, keyframes: [], vibrations: [] }
    // Each keyframe: { time, x, y, rotation, opacity, scaleX, scaleY, easing }
    // Each vibration: { sourceType: 'bgm'|'sfx'|'voice', sourceIndex: number, intensity: number, threshold: number }
    layers: [],
    selectedLayerId: null,
    totalDuration: 10,
    currentTime: 0,
    isPlaying: false,
    playStartTimestamp: null,
    playStartTime: 0,
    animFrameId: null,
    bgmTracks: [],
    sfxTracks: [],
    voiceTracks: [],
    canvasScale: 1,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    nextId: 1,
    audioCtx: null,
    activeAudioSources: [],
    lastTotalDuration: null,
    // Analyser nodes for voice vibration: trackId -> { analyser, dataArray }
    activeAnalysers: new Map(),
  };

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const canvas = $('#stage-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = $('#canvas-overlay');
  const layerList = $('#layer-list');
  const propertyContent = $('#property-content');
  const timelineTracks = $('#timeline-tracks');
  const timelineRuler = $('#timeline-ruler');
  const playhead = $('#timeline-playhead');
  const timeDisplay = $('#time-display');
  const totalDurationInput = $('#total-duration');
  const canvasContainer = $('#canvas-container');
  const timelineContainer = $('#timeline-tracks-container');
  const bgmListEl = $('#bgm-list');
  const sfxListEl = $('#sfx-list');
  const voiceListEl = $('#voice-list');
  const exportProgressBar = $('#export-progress-bar');
  const exportProgressText = $('#export-progress-text');
  const exportModal = $('#export-modal');
  const exportProgress = $('#export-progress');
  const renameModal = $('#rename-modal');
  const renameInput = $('#rename-input');
  const projectNameEl = $('#project-name');
  const keyframeInfo = $('#keyframe-info');
  const gpuInfoEl = $('#gpu-info');
  const useGpuCheckbox = $('#export-use-gpu');

  // ---- GPU Detection ----
  const gpuInfo = (() => {
    const info = { renderer: null, webgl2: false, webcodecs: false, hardwareAccel: false };
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2');
      if (gl) {
        info.webgl2 = true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          info.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
          info.hardwareAccel = !/swiftshader|llvmpipe|software/i.test(info.renderer);
        }
      }
    } catch (e) {}
    info.webcodecs = typeof VideoEncoder === 'function';
    return info;
  })();

  // ---- Utils ----
  function genId() { return state.nextId++; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function stripExt(name) { return name.replace(/\.[^.]+$/, ''); }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function serializeAudioTrack(t) {
    return { id: t.id, name: t.name, dataUrl: t.dataUrl, startTime: t.startTime, volume: t.volume, duration: t.duration };
  }

  // ---- Keyframe interpolation ----
  // Returns interpolated state { x, y, rotation, opacity, scaleX, scaleY } at given time
  function getLayerStateAtTime(layer, time) {
    const kfs = layer.keyframes;
    if (!kfs || kfs.length === 0) {
      return { x: layer.x, y: layer.y, rotation: layer.rotation, opacity: layer.opacity, scaleX: layer.scaleX, scaleY: layer.scaleY };
    }
    if (kfs.length === 1 || time <= kfs[0].time) {
      const kf = kfs[0];
      return { x: kf.x, y: kf.y, rotation: kf.rotation, opacity: kf.opacity, scaleX: kf.scaleX, scaleY: kf.scaleY };
    }
    if (time >= kfs[kfs.length - 1].time) {
      const kf = kfs[kfs.length - 1];
      return { x: kf.x, y: kf.y, rotation: kf.rotation, opacity: kf.opacity, scaleX: kf.scaleX, scaleY: kf.scaleY };
    }
    // Find the two keyframes to interpolate between
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i];
      const b = kfs[i + 1];
      if (time >= a.time && time <= b.time) {
        const duration = b.time - a.time;
        const raw = duration > 0 ? (time - a.time) / duration : 0;
        const easeFn = EASING_FNS[b.easing] || EASING_FNS.linear;
        const t = easeFn(clamp(raw, 0, 1));
        return {
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
          rotation: lerp(a.rotation, b.rotation, t),
          opacity: lerp(a.opacity, b.opacity, t),
          scaleX: lerp(a.scaleX, b.scaleX, t),
          scaleY: lerp(a.scaleY, b.scaleY, t),
        };
      }
    }
    const kf = kfs[kfs.length - 1];
    return { x: kf.x, y: kf.y, rotation: kf.rotation, opacity: kf.opacity, scaleX: kf.scaleX, scaleY: kf.scaleY };
  }

  // ---- Keyframe management ----
  function addKeyframe(layer) {
    const time = Math.round(state.currentTime * 100) / 100;
    // Check if keyframe already exists at this time (within 0.05s tolerance)
    const existing = layer.keyframes.findIndex((kf) => Math.abs(kf.time - time) < 0.05);
    const kf = {
      time,
      x: layer.x, y: layer.y,
      rotation: layer.rotation, opacity: layer.opacity,
      scaleX: layer.scaleX, scaleY: layer.scaleY,
      easing: 'easeInOut',
    };
    if (existing >= 0) {
      // Update existing keyframe
      kf.easing = layer.keyframes[existing].easing;
      layer.keyframes[existing] = kf;
    } else {
      layer.keyframes.push(kf);
    }
    layer.keyframes.sort((a, b) => a.time - b.time);
    refreshAll();
  }

  function deleteKeyframeAtTime(layer, time) {
    const idx = layer.keyframes.findIndex((kf) => Math.abs(kf.time - time) < 0.05);
    if (idx >= 0) {
      layer.keyframes.splice(idx, 1);
      refreshAll();
    }
  }

  function findNearestKeyframe(layer, time) {
    if (!layer.keyframes.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (const kf of layer.keyframes) {
      const d = Math.abs(kf.time - time);
      if (d < bestDist) { bestDist = d; best = kf; }
    }
    return best;
  }

  // Apply keyframe state to layer's current position (for editing)
  function applyKeyframeToLayer(layer, kf) {
    layer.x = kf.x;
    layer.y = kf.y;
    layer.rotation = kf.rotation;
    layer.opacity = kf.opacity;
    layer.scaleX = kf.scaleX;
    layer.scaleY = kf.scaleY;
  }

  // ---- Audio Context ----
  function getAudioCtx() {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return state.audioCtx;
  }

  // ---- Canvas Sizing ----
  function resizeCanvas() {
    const area = $('#canvas-area');
    const maxW = area.clientWidth - 40;
    const maxH = area.clientHeight - 80;
    const scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1);
    state.canvasScale = scale;
    const w = (CANVAS_W * scale) + 'px';
    const h = (CANVAS_H * scale) + 'px';
    canvasContainer.style.width = w;
    canvasContainer.style.height = h;
    canvas.style.width = w;
    canvas.style.height = h;
  }

  // Pre-render checkerboard
  const checkerboard = (() => {
    const c = document.createElement('canvas');
    c.width = CANVAS_W; c.height = CANVAS_H;
    const cctx = c.getContext('2d');
    const size = 20;
    for (let y = 0; y < CANVAS_H; y += size) {
      for (let x = 0; x < CANVAS_W; x += size) {
        cctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#2a2a2a' : '#333';
        cctx.fillRect(x, y, size, size);
      }
    }
    return c;
  })();

  // ---- Render Canvas ----
  function renderLayer(targetCtx, layer, time, scaleX, scaleY, vibOffset) {
    if (!layer.visible || !layer.img) return;
    const st = getLayerStateAtTime(layer, time);
    const vdx = vibOffset ? vibOffset.dx : 0;
    const vdy = vibOffset ? vibOffset.dy : 0;

    targetCtx.save();
    targetCtx.globalAlpha = st.opacity;
    targetCtx.translate((st.x + vdx + layer.w / 2) * scaleX, (st.y + vdy + layer.h / 2) * scaleY);
    targetCtx.rotate((st.rotation * Math.PI) / 180);
    targetCtx.scale(st.scaleX, st.scaleY);
    targetCtx.drawImage(layer.img, (-layer.w / 2) * scaleX, (-layer.h / 2) * scaleY, layer.w * scaleX, layer.h * scaleY);
    targetCtx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(checkerboard, 0, 0);

    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];
      const vibOffset = state.isPlaying ? getLayerVibrationOffset(layer) : null;
      renderLayer(ctx, layer, state.currentTime, 1, 1, vibOffset);

      // Draw selection overlay for selected layer
      if (layer.id === state.selectedLayerId && !state.isPlaying) {
        const st = getLayerStateAtTime(layer, state.currentTime);

        ctx.save();
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(st.x, st.y, layer.w, layer.h);
        ctx.setLineDash([]);

        // Draw keyframe path
        if (layer.keyframes.length >= 2) {
          ctx.beginPath();
          for (let k = 0; k < layer.keyframes.length; k++) {
            const kf = layer.keyframes[k];
            const px = kf.x + layer.w / 2;
            const py = kf.y + layer.h / 2;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = 'rgba(241, 196, 15, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw keyframe position markers
        layer.keyframes.forEach((kf) => {
          const px = kf.x + layer.w / 2;
          const py = kf.y + layer.h / 2;
          const isAtTime = Math.abs(kf.time - state.currentTime) < 0.05;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.PI / 4);
          const sz = isAtTime ? 7 : 5;
          ctx.fillStyle = isAtTime ? '#e94560' : '#f1c40f';
          ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
          ctx.restore();
        });

        ctx.restore();
      }
    }
  }

  // ---- Layer Management ----
  function addLayer(name, imgSrc) {
    const id = genId();
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > CANVAS_W) { h *= CANVAS_W / w; w = CANVAS_W; }
      if (h > CANVAS_H) { w *= CANVAS_H / h; h = CANVAS_H; }

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 32; thumbCanvas.height = 32;
      const tc = thumbCanvas.getContext('2d');
      const scale = Math.min(32 / img.naturalWidth, 32 / img.naturalHeight);
      const tw = img.naturalWidth * scale;
      const th = img.naturalHeight * scale;
      tc.drawImage(img, (32 - tw) / 2, (32 - th) / 2, tw, th);

      const layer = {
        id, name, img, imgSrc, thumbCanvas,
        visible: true,
        x: (CANVAS_W - w) / 2, y: (CANVAS_H - h) / 2,
        w, h,
        rotation: 0, opacity: 1,
        scaleX: 1, scaleY: 1,
        keyframes: [],
        vibrations: [], // [{ sourceType, sourceIndex, intensity, threshold }]
      };
      state.layers.unshift(layer);
      state.selectedLayerId = id;
      refreshAll();
    };
    img.src = imgSrc;
  }

  function getSelectedLayer() {
    return state.layers.find((l) => l.id === state.selectedLayerId) || null;
  }

  function removeLayer(id) {
    state.layers = state.layers.filter((l) => l.id !== id);
    if (state.selectedLayerId === id) state.selectedLayerId = null;
    refreshAll();
  }

  function moveLayerOrder(id, dir) {
    const idx = state.layers.findIndex((l) => l.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= state.layers.length) return;
    [state.layers[idx], state.layers[newIdx]] = [state.layers[newIdx], state.layers[idx]];
    refreshAll();
  }

  // ---- Layer List UI ----
  function refreshLayerList() {
    layerList.innerHTML = '';
    state.layers.forEach((layer) => {
      const li = document.createElement('li');
      li.className = 'layer-item' + (layer.id === state.selectedLayerId ? ' selected' : '');

      const thumb = document.createElement('canvas');
      thumb.className = 'layer-thumb';
      thumb.width = 32; thumb.height = 32;
      if (layer.thumbCanvas) thumb.getContext('2d').drawImage(layer.thumbCanvas, 0, 0);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      nameSpan.textContent = layer.name;
      nameSpan.ondblclick = (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.value = layer.name;
        input.style.cssText = 'width:100%;font-size:12px;';
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        const finish = () => { layer.name = input.value || layer.name; refreshAll(); };
        input.onblur = finish;
        input.onkeydown = (ev) => { if (ev.key === 'Enter') finish(); };
      };

      const vis = document.createElement('span');
      vis.className = 'layer-visibility';
      vis.textContent = layer.visible ? '👁' : '🚫';
      vis.onclick = (e) => { e.stopPropagation(); layer.visible = !layer.visible; refreshAll(); };

      const del = document.createElement('span');
      del.className = 'layer-delete';
      del.textContent = '✕';
      del.onclick = (e) => { e.stopPropagation(); removeLayer(layer.id); };

      li.onclick = () => {
        state.selectedLayerId = layer.id;
        // When selecting a layer, snap its position to the nearest keyframe state if keyframes exist
        if (layer.keyframes.length > 0) {
          const st = getLayerStateAtTime(layer, state.currentTime);
          layer.x = st.x; layer.y = st.y;
          layer.rotation = st.rotation; layer.opacity = st.opacity;
          layer.scaleX = st.scaleX; layer.scaleY = st.scaleY;
        }
        refreshAll();
      };
      li.appendChild(thumb);
      li.appendChild(nameSpan);
      li.appendChild(vis);
      li.appendChild(del);
      layerList.appendChild(li);
    });
  }

  // ---- Property Panel ----
  const EDITABLE_PROPS = new Set([
    'x', 'y', 'w', 'h', 'rotation', 'opacity', 'scaleX', 'scaleY',
  ]);

  function refreshProperties() {
    const layer = getSelectedLayer();
    if (!layer) {
      propertyContent.innerHTML = '<p class="placeholder-text">レイヤーを選択してください</p>';
      keyframeInfo.textContent = 'キーフレーム: --';
      return;
    }

    keyframeInfo.textContent = `キーフレーム: ${layer.keyframes.length}個`;

    let kfListHtml = '';
    layer.keyframes.forEach((kf, idx) => {
      const isAtTime = Math.abs(kf.time - state.currentTime) < 0.05;
      kfListHtml += `
        <li class="kf-item${isAtTime ? ' active' : ''}" data-kf-idx="${idx}">
          <span class="kf-time">${kf.time.toFixed(2)}s</span>
          <span class="kf-pos">x:${Math.round(kf.x)} y:${Math.round(kf.y)}</span>
          <select class="kf-easing-select" data-kf-easing-idx="${idx}">
            <option value="linear"${kf.easing === 'linear' ? ' selected' : ''}>リニア</option>
            <option value="easeIn"${kf.easing === 'easeIn' ? ' selected' : ''}>イーズイン</option>
            <option value="easeOut"${kf.easing === 'easeOut' ? ' selected' : ''}>イーズアウト</option>
            <option value="easeInOut"${kf.easing === 'easeInOut' ? ' selected' : ''}>イーズインアウト</option>
          </select>
          <span class="kf-delete" data-kf-del-idx="${idx}">✕</span>
        </li>`;
    });

    propertyContent.innerHTML = `
      <div class="prop-group">
        <h3>変形（現在値）</h3>
        <div class="prop-row"><label>X:</label><input type="number" data-prop="x" value="${Math.round(layer.x)}" step="1"></div>
        <div class="prop-row"><label>Y:</label><input type="number" data-prop="y" value="${Math.round(layer.y)}" step="1"></div>
        <div class="prop-row"><label>幅:</label><input type="number" data-prop="w" value="${Math.round(layer.w)}" step="1" min="1"></div>
        <div class="prop-row"><label>高さ:</label><input type="number" data-prop="h" value="${Math.round(layer.h)}" step="1" min="1"></div>
        <div class="prop-row"><label>回転:</label><input type="number" data-prop="rotation" value="${layer.rotation}" step="1">°</div>
        <div class="prop-row"><label>透明度:</label><input type="range" data-prop="opacity" value="${layer.opacity}" min="0" max="1" step="0.01"><span>${(layer.opacity * 100).toFixed(0)}%</span></div>
        <div class="prop-row"><label>X倍率:</label><input type="number" data-prop="scaleX" value="${layer.scaleX}" step="0.1" min="0.1"></div>
        <div class="prop-row"><label>Y倍率:</label><input type="number" data-prop="scaleY" value="${layer.scaleY}" step="0.1" min="0.1"></div>
      </div>
      <div class="prop-group">
        <h3>キーフレーム一覧</h3>
        <p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">
          レイヤーを配置→タイムラインの時刻を変えて「◆ キーフレーム追加」（K）<br>
          複数登録すると自動で補間アニメーションされます
        </p>
        <ul class="kf-list">${kfListHtml || '<li style="color:var(--text-muted);font-size:11px;padding:4px;">キーフレームなし</li>'}</ul>
      </div>
      <div class="prop-group">
        <h3>🔊 音声連動振動</h3>
        <p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">
          音声に反応してレイヤーを揺らします。複数設定可能。
        </p>
        <div id="vibration-list"></div>
        <button id="btn-add-vibration" style="margin-top:4px;font-size:11px;">+ 振動追加</button>
      </div>
      <div class="prop-group">
        <h3>レイヤー順序</h3>
        <div class="prop-row" id="layer-order-buttons"></div>
      </div>
    `;

    // Vibration UI
    buildVibrationUI(layer);

    // Move-layer buttons
    const orderRow = propertyContent.querySelector('#layer-order-buttons');
    const btnUp = document.createElement('button');
    btnUp.textContent = '↑ 前面へ';
    btnUp.onclick = () => moveLayerOrder(layer.id, -1);
    const btnDown = document.createElement('button');
    btnDown.textContent = '↓ 背面へ';
    btnDown.onclick = () => moveLayerOrder(layer.id, 1);
    orderRow.appendChild(btnUp);
    orderRow.appendChild(btnDown);

    // Property input bindings
    propertyContent.querySelectorAll('[data-prop]').forEach((input) => {
      input.addEventListener('change', () => {
        const prop = input.dataset.prop;
        if (!EDITABLE_PROPS.has(prop)) return;
        let val = input.type === 'range' ? parseFloat(input.value) : input.value;
        if (input.type === 'number') val = val === '' ? null : parseFloat(val);
        layer[prop] = val;
        refreshAll();
      });
      input.addEventListener('input', () => {
        if (input.type === 'range') {
          layer[input.dataset.prop] = parseFloat(input.value);
          render();
          const span = input.nextElementSibling;
          if (span) span.textContent = (layer.opacity * 100).toFixed(0) + '%';
        }
      });
    });

    // Keyframe list click → jump to that time
    propertyContent.querySelectorAll('.kf-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.kf-delete') || e.target.closest('.kf-easing-select')) return;
        const idx = parseInt(el.dataset.kfIdx);
        const kf = layer.keyframes[idx];
        if (kf) {
          state.currentTime = kf.time;
          applyKeyframeToLayer(layer, kf);
          updatePlayhead();
          refreshAll();
        }
      });
    });

    // Keyframe easing change
    propertyContent.querySelectorAll('.kf-easing-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.dataset.kfEasingIdx);
        if (layer.keyframes[idx]) {
          layer.keyframes[idx].easing = sel.value;
          render();
        }
      });
    });

    // Keyframe delete
    propertyContent.querySelectorAll('.kf-delete').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.kfDelIdx);
        if (layer.keyframes[idx]) {
          layer.keyframes.splice(idx, 1);
          refreshAll();
        }
      });
    });
  }

  function getAudioTrackOptions() {
    const opts = [];
    state.bgmTracks.forEach((t, i) => opts.push({ type: 'bgm', index: i, label: `BGM: ${t.name || ('BGM ' + (i + 1))}` }));
    state.sfxTracks.forEach((t, i) => opts.push({ type: 'sfx', index: i, label: `効果音: ${t.name || ('SFX ' + (i + 1))}` }));
    state.voiceTracks.forEach((t, i) => opts.push({ type: 'voice', index: i, label: `音声: ${t.name || ('Voice ' + (i + 1))}` }));
    return opts;
  }

  function buildVibrationUI(layer) {
    const container = propertyContent.querySelector('#vibration-list');
    const btnAdd = propertyContent.querySelector('#btn-add-vibration');
    const audioOpts = getAudioTrackOptions();

    function renderVibList() {
      container.innerHTML = '';
      if (layer.vibrations.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px;">振動設定なし</div>';
        return;
      }
      layer.vibrations.forEach((vib, idx) => {
        const row = document.createElement('div');
        row.className = 'vibration-item';

        const sel = document.createElement('select');
        sel.className = 'vib-source-select';
        if (audioOpts.length === 0) {
          const o = document.createElement('option');
          o.textContent = '(音声なし)';
          sel.appendChild(o);
          sel.disabled = true;
        } else {
          audioOpts.forEach((ao) => {
            const o = document.createElement('option');
            o.value = ao.type + ':' + ao.index;
            o.textContent = ao.label;
            if (ao.type === vib.sourceType && ao.index === vib.sourceIndex) o.selected = true;
            sel.appendChild(o);
          });
        }
        sel.onchange = () => {
          const [t, i] = sel.value.split(':');
          vib.sourceType = t;
          vib.sourceIndex = parseInt(i);
        };

        const intensityLabel = document.createElement('span');
        intensityLabel.className = 'vib-label';
        intensityLabel.textContent = '強さ:';

        const intensityInput = document.createElement('input');
        intensityInput.type = 'number';
        intensityInput.className = 'vib-intensity';
        intensityInput.value = vib.intensity;
        intensityInput.min = 1;
        intensityInput.max = 100;
        intensityInput.step = 1;
        intensityInput.title = 'ピクセル振幅（1=微振動、20=大きく揺れる）';
        intensityInput.onchange = () => { vib.intensity = parseFloat(intensityInput.value) || 5; };

        const threshLabel = document.createElement('span');
        threshLabel.className = 'vib-label';
        threshLabel.textContent = '閾値:';

        const threshInput = document.createElement('input');
        threshInput.type = 'number';
        threshInput.className = 'vib-threshold';
        threshInput.value = vib.threshold;
        threshInput.min = 0;
        threshInput.max = 1;
        threshInput.step = 0.05;
        threshInput.title = '反応する音量の閾値（0=常に、0.3=大きめの音のみ）';
        threshInput.onchange = () => { vib.threshold = parseFloat(threshInput.value) || 0; };

        const delBtn = document.createElement('span');
        delBtn.className = 'vib-delete';
        delBtn.textContent = '✕';
        delBtn.onclick = () => {
          layer.vibrations.splice(idx, 1);
          renderVibList();
        };

        row.appendChild(sel);
        row.appendChild(intensityLabel);
        row.appendChild(intensityInput);
        row.appendChild(threshLabel);
        row.appendChild(threshInput);
        row.appendChild(delBtn);
        container.appendChild(row);
      });
    }

    btnAdd.onclick = () => {
      const firstOpt = audioOpts[0];
      layer.vibrations.push({
        sourceType: firstOpt ? firstOpt.type : 'voice',
        sourceIndex: firstOpt ? firstOpt.index : 0,
        intensity: 5,
        threshold: 0.1,
      });
      renderVibList();
    };

    renderVibList();
  }

  // ---- Timeline ----
  function refreshTimeline() {
    const totalWidth = TRACK_LABEL_WIDTH + state.totalDuration * TIMELINE_PX_PER_SEC;

    if (state.lastTotalDuration !== state.totalDuration) {
      state.lastTotalDuration = state.totalDuration;
      timelineRuler.style.width = totalWidth + 'px';
      const rulerCanvas = timelineRuler.querySelector('canvas') || document.createElement('canvas');
      rulerCanvas.width = totalWidth;
      rulerCanvas.height = 22;
      if (!timelineRuler.contains(rulerCanvas)) timelineRuler.appendChild(rulerCanvas);
      const rc = rulerCanvas.getContext('2d');
      rc.clearRect(0, 0, totalWidth, 22);
      rc.fillStyle = '#8899aa';
      rc.font = '10px monospace';
      for (let s = 0; s <= state.totalDuration; s += 0.5) {
        const x = TRACK_LABEL_WIDTH + s * TIMELINE_PX_PER_SEC;
        const isMajor = s % 1 === 0;
        rc.beginPath();
        rc.moveTo(x, isMajor ? 6 : 14);
        rc.lineTo(x, 22);
        rc.strokeStyle = isMajor ? '#667' : '#445';
        rc.stroke();
        if (isMajor) rc.fillText(s.toFixed(0) + 's', x + 2, 14);
      }
    }

    timelineTracks.style.width = totalWidth + 'px';
    timelineTracks.innerHTML = '';

    // Layer tracks with keyframe diamonds
    state.layers.forEach((layer) => {
      const track = document.createElement('div');
      track.className = 'timeline-track';

      const label = document.createElement('div');
      label.className = 'track-label';
      label.textContent = layer.name;
      label.onclick = () => { state.selectedLayerId = layer.id; refreshAll(); };

      const content = document.createElement('div');
      content.className = 'track-content';

      // Draw segments between keyframes
      for (let i = 0; i < layer.keyframes.length - 1; i++) {
        const a = layer.keyframes[i];
        const b = layer.keyframes[i + 1];
        const seg = document.createElement('div');
        seg.className = 'keyframe-segment';
        seg.style.left = (a.time * TIMELINE_PX_PER_SEC) + 'px';
        seg.style.width = ((b.time - a.time) * TIMELINE_PX_PER_SEC) + 'px';
        content.appendChild(seg);
      }

      // Draw keyframe diamond markers
      layer.keyframes.forEach((kf) => {
        const diamond = document.createElement('div');
        diamond.className = 'keyframe-diamond';
        const isAtTime = Math.abs(kf.time - state.currentTime) < 0.05;
        if (isAtTime && layer.id === state.selectedLayerId) diamond.classList.add('active');
        diamond.style.left = (kf.time * TIMELINE_PX_PER_SEC) + 'px';
        diamond.title = `${kf.time.toFixed(2)}s — x:${Math.round(kf.x)} y:${Math.round(kf.y)}`;

        // Click to jump to keyframe time
        diamond.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          state.currentTime = kf.time;
          state.selectedLayerId = layer.id;
          applyKeyframeToLayer(layer, kf);
          updatePlayhead();
          refreshAll();
        });

        content.appendChild(diamond);
      });

      track.appendChild(label);
      track.appendChild(content);
      timelineTracks.appendChild(track);
    });

    // Audio tracks
    const allAudio = [
      ...state.bgmTracks.map((a) => ({ ...a, type: 'bgm' })),
      ...state.sfxTracks.map((a) => ({ ...a, type: 'sfx' })),
      ...state.voiceTracks.map((a) => ({ ...a, type: 'voice' })),
    ];
    allAudio.forEach((audio) => {
      const track = document.createElement('div');
      track.className = 'timeline-track';
      const label = document.createElement('div');
      label.className = 'track-label';
      label.textContent = '🔊 ' + audio.name;
      const content = document.createElement('div');
      content.className = 'track-content';
      const bar = document.createElement('div');
      bar.className = 'keyframe-bar ' + (audio.type === 'voice' ? 'voice-bar' : 'audio-bar');
      bar.style.left = ((audio.startTime || 0) * TIMELINE_PX_PER_SEC) + 'px';
      bar.style.width = ((audio.duration || 1) * TIMELINE_PX_PER_SEC) + 'px';
      bar.textContent = audio.name;
      content.appendChild(bar);
      track.appendChild(label);
      track.appendChild(content);
      timelineTracks.appendChild(track);
    });

    updatePlayhead();
  }

  function updatePlayhead() {
    playhead.style.left = (TRACK_LABEL_WIDTH + state.currentTime * TIMELINE_PX_PER_SEC) + 'px';
    timeDisplay.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.totalDuration)}`;
  }

  // Click on timeline to seek
  timelineContainer.addEventListener('mousedown', (e) => {
    if (e.target.closest('.keyframe-diamond')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft - TRACK_LABEL_WIDTH;
    if (x >= 0) {
      state.currentTime = clamp(x / TIMELINE_PX_PER_SEC, 0, state.totalDuration);
      // Update selected layer position to match keyframe interpolation
      const layer = getSelectedLayer();
      if (layer && layer.keyframes.length > 0) {
        const st = getLayerStateAtTime(layer, state.currentTime);
        layer.x = st.x; layer.y = st.y;
        layer.rotation = st.rotation; layer.opacity = st.opacity;
        layer.scaleX = st.scaleX; layer.scaleY = st.scaleY;
      }
      updatePlayhead();
      refreshAll();
    }
  });

  // ---- Playback ----
  function play() {
    if (state.isPlaying) return;
    state.isPlaying = true;
    state.playStartTimestamp = performance.now();
    state.playStartTime = state.currentTime;
    startAudioPlayback();
    tick();
  }

  function pause() {
    state.isPlaying = false;
    if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
    stopAudioPlayback();
  }

  function stop() {
    pause();
    state.currentTime = 0;
    updatePlayhead();
    render();
  }

  function tick() {
    if (!state.isPlaying) return;
    const elapsed = (performance.now() - state.playStartTimestamp) / 1000;
    state.currentTime = state.playStartTime + elapsed;
    if (state.currentTime >= state.totalDuration) {
      state.currentTime = state.totalDuration;
      state.isPlaying = false;
      stopAudioPlayback();
    }
    updatePlayhead();
    render();
    if (state.isPlaying) {
      state.animFrameId = requestAnimationFrame(tick);
    }
  }

  // ---- Audio Playback ----
  function startAudioPlayback() {
    stopAudioPlayback();
    const aCtx = getAudioCtx();
    if (aCtx.state === 'suspended') aCtx.resume();

    const playTrack = (track, sourceType, sourceIndex) => {
      if (!track.audioBuffer) return;
      const src = aCtx.createBufferSource();
      const gain = aCtx.createGain();
      gain.gain.value = track.volume ?? 1;
      src.buffer = track.audioBuffer;
      src.connect(gain);

      // Create analyser for vibration detection
      const analyser = aCtx.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(analyser);
      analyser.connect(aCtx.destination);

      const dataArray = new Uint8Array(analyser.fftSize);
      const key = sourceType + ':' + sourceIndex;
      state.activeAnalysers.set(key, { analyser, dataArray });

      const offset = Math.max(0, state.currentTime - (track.startTime || 0));
      const when = Math.max(0, (track.startTime || 0) - state.currentTime);
      if (offset < track.audioBuffer.duration) {
        src.start(aCtx.currentTime + when, offset);
        state.activeAudioSources.push(src);
      }
    };

    state.bgmTracks.forEach((t, i) => playTrack(t, 'bgm', i));
    state.sfxTracks.forEach((t, i) => playTrack(t, 'sfx', i));
    state.voiceTracks.forEach((t, i) => playTrack(t, 'voice', i));
  }

  function stopAudioPlayback() {
    state.activeAudioSources.forEach((s) => { try { s.stop(); } catch (e) {} });
    state.activeAudioSources = [];
    state.activeAnalysers.clear();
  }

  // Get amplitude (0-1) for a specific audio track from its analyser
  function getTrackAmplitude(sourceType, sourceIndex) {
    const key = sourceType + ':' + sourceIndex;
    const entry = state.activeAnalysers.get(key);
    if (!entry) return 0;
    entry.analyser.getByteTimeDomainData(entry.dataArray);
    let maxDev = 0;
    for (let i = 0; i < entry.dataArray.length; i++) {
      const dev = Math.abs(entry.dataArray[i] - 128) / 128;
      if (dev > maxDev) maxDev = dev;
    }
    return maxDev;
  }

  // Calculate combined vibration offset for a layer (real-time playback)
  function getLayerVibrationOffset(layer) {
    if (!layer.vibrations || layer.vibrations.length === 0) return { dx: 0, dy: 0 };
    let dx = 0, dy = 0;
    for (const vib of layer.vibrations) {
      const amp = getTrackAmplitude(vib.sourceType, vib.sourceIndex);
      if (amp > vib.threshold) {
        const strength = ((amp - vib.threshold) / (1 - vib.threshold)) * vib.intensity;
        dx += (Math.random() - 0.5) * 2 * strength;
        dy += (Math.random() - 0.5) * 2 * strength;
      }
    }
    return { dx, dy };
  }

  // ---- Canvas Interaction ----
  function canvasToStage(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / state.canvasScale,
      y: (clientY - rect.top) / state.canvasScale,
    };
  }

  function hitTest(sx, sy) {
    for (let i = 0; i < state.layers.length; i++) {
      const l = state.layers[i];
      if (!l.visible) continue;
      // Use interpolated position for hit testing
      const st = getLayerStateAtTime(l, state.currentTime);
      if (sx >= st.x && sx <= st.x + l.w && sy >= st.y && sy <= st.y + l.h) return l;
    }
    return null;
  }

  function endDrag() {
    state.isDragging = false;
    overlay.classList.remove('dragging');
  }

  overlay.addEventListener('mousedown', (e) => {
    const { x, y } = canvasToStage(e.clientX, e.clientY);
    const hit = hitTest(x, y);
    if (hit) {
      state.selectedLayerId = hit.id;
      state.isDragging = true;
      state.dragOffsetX = x - hit.x;
      state.dragOffsetY = y - hit.y;
      overlay.classList.add('dragging');
      refreshLayerList();
      refreshProperties();
      render();
    } else {
      state.selectedLayerId = null;
      refreshAll();
    }
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    const { x, y } = canvasToStage(e.clientX, e.clientY);
    const layer = getSelectedLayer();
    if (layer) {
      layer.x = x - state.dragOffsetX;
      layer.y = y - state.dragOffsetY;
      render();
      const xInput = propertyContent.querySelector('[data-prop="x"]');
      const yInput = propertyContent.querySelector('[data-prop="y"]');
      if (xInput) xInput.value = Math.round(layer.x);
      if (yInput) yInput.value = Math.round(layer.y);
    }
  });

  overlay.addEventListener('mouseup', endDrag);
  overlay.addEventListener('mouseleave', endDrag);

  // ---- Keyframe buttons ----
  $('#btn-add-keyframe').addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) { alert('先にレイヤーを選択してください'); return; }
    addKeyframe(layer);
  });

  $('#btn-delete-keyframe').addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) { alert('先にレイヤーを選択してください'); return; }
    const nearest = findNearestKeyframe(layer, state.currentTime);
    if (nearest && Math.abs(nearest.time - state.currentTime) < 0.5) {
      deleteKeyframeAtTime(layer, nearest.time);
    } else {
      alert('現在時刻付近にキーフレームがありません');
    }
  });

  // ---- File Import ----
  const fileImage = $('#file-image');
  const fileAudio = $('#file-audio');
  const fileProject = $('#file-project');

  $('#btn-add-layer').addEventListener('click', () => fileImage.click());

  fileImage.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => addLayer(stripExt(file.name), ev.target.result);
    reader.readAsDataURL(file);
    fileImage.value = '';
  });

  function addAudioTrack(file, type) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const aCtx = getAudioCtx();
      const arrayBuffer = ev.target.result;
      try {
        const audioBuffer = await aCtx.decodeAudioData(arrayBuffer);
        const track = {
          id: genId(),
          name: stripExt(file.name),
          audioBuffer,
          dataUrl: await fileToDataUrl(file),
          startTime: 0,
          volume: 1,
          duration: audioBuffer.duration,
        };
        state[AUDIO_TRACK_KEYS[type]].push(track);
        refreshAll();
      } catch (err) {
        alert('音声ファイルの読み込みに失敗しました: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = (e) => resolve(e.target.result);
      r.readAsDataURL(file);
    });
  }

  $('#btn-add-bgm').addEventListener('click', () => { fileAudio.dataset.audioType = 'bgm'; fileAudio.click(); });
  $('#btn-add-sfx').addEventListener('click', () => { fileAudio.dataset.audioType = 'sfx'; fileAudio.click(); });
  $('#btn-add-voice').addEventListener('click', () => { fileAudio.dataset.audioType = 'voice'; fileAudio.click(); });

  fileAudio.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    addAudioTrack(file, fileAudio.dataset.audioType);
    fileAudio.value = '';
  });

  function refreshAudioLists() {
    const renderList = (tracks, listEl, type) => {
      listEl.innerHTML = '';
      tracks.forEach((t) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'audio-name';
        name.textContent = t.name;

        const timeInput = document.createElement('input');
        timeInput.type = 'number';
        timeInput.value = t.startTime || 0;
        timeInput.min = 0; timeInput.step = 0.1;
        timeInput.style.width = '50px';
        timeInput.title = '開始時間(秒)';
        timeInput.addEventListener('change', () => { t.startTime = parseFloat(timeInput.value) || 0; refreshTimeline(); });

        const volInput = document.createElement('input');
        volInput.type = 'range';
        volInput.value = t.volume ?? 1;
        volInput.min = 0; volInput.max = 1; volInput.step = 0.05;
        volInput.style.width = '50px';
        volInput.title = '音量';
        volInput.addEventListener('input', () => { t.volume = parseFloat(volInput.value); });

        const rm = document.createElement('span');
        rm.className = 'audio-remove';
        rm.textContent = '✕';
        rm.onclick = () => {
          const key = AUDIO_TRACK_KEYS[type];
          state[key] = state[key].filter((a) => a.id !== t.id);
          refreshAll();
        };

        li.appendChild(name);
        li.appendChild(timeInput);
        li.appendChild(volInput);
        li.appendChild(rm);
        listEl.appendChild(li);
      });
    };
    renderList(state.bgmTracks, bgmListEl, 'bgm');
    renderList(state.sfxTracks, sfxListEl, 'sfx');
    renderList(state.voiceTracks, voiceListEl, 'voice');
  }

  // ---- Project Save / Load ----
  function serializeProject() {
    return JSON.stringify({
      version: 2,
      projectName: state.projectName,
      totalDuration: state.totalDuration,
      layers: state.layers.map((l) => ({
        id: l.id, name: l.name, imgSrc: l.imgSrc,
        visible: l.visible,
        x: l.x, y: l.y, w: l.w, h: l.h,
        rotation: l.rotation, opacity: l.opacity,
        scaleX: l.scaleX, scaleY: l.scaleY,
        keyframes: l.keyframes,
        vibrations: l.vibrations || [],
      })),
      bgmTracks: state.bgmTracks.map(serializeAudioTrack),
      sfxTracks: state.sfxTracks.map(serializeAudioTrack),
      voiceTracks: state.voiceTracks.map(serializeAudioTrack),
      nextId: state.nextId,
    });
  }

  function saveProject() {
    const blob = new Blob([serializeProject()], { type: 'application/json' });
    downloadBlob(blob, state.projectName + '.animproj');
  }

  async function loadProject(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      state.projectName = data.projectName || '新規プロジェクト';
      state.totalDuration = data.totalDuration || 10;
      state.lastTotalDuration = null;
      state.nextId = data.nextId || 1;
      state.selectedLayerId = null;
      state.currentTime = 0;

      state.layers = [];
      const layerPromises = (data.layers || []).map((ld) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 32; thumbCanvas.height = 32;
            const tc = thumbCanvas.getContext('2d');
            const scale = Math.min(32 / img.naturalWidth, 32 / img.naturalHeight);
            tc.drawImage(img, (32 - img.naturalWidth * scale) / 2, (32 - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);

            // Migrate v1 format (startX/endX) to keyframes
            let keyframes = ld.keyframes || [];
            if (!ld.keyframes && ld.startX != null && ld.endX != null && ld.animDuration > 0) {
              keyframes = [
                { time: ld.animStart || 0, x: ld.startX, y: ld.startY, rotation: ld.rotation || 0, opacity: ld.opacity ?? 1, scaleX: ld.scaleX ?? 1, scaleY: ld.scaleY ?? 1, easing: 'easeInOut' },
                { time: (ld.animStart || 0) + ld.animDuration, x: ld.endX, y: ld.endY, rotation: ld.rotation || 0, opacity: ld.opacity ?? 1, scaleX: ld.scaleX ?? 1, scaleY: ld.scaleY ?? 1, easing: ld.easing || 'easeInOut' },
              ];
            }

            state.layers.push({ ...ld, img, imgSrc: ld.imgSrc, thumbCanvas, keyframes, vibrations: ld.vibrations || [] });
            resolve();
          };
          img.onerror = () => resolve();
          img.src = ld.imgSrc;
        });
      });
      await Promise.all(layerPromises);
      const idOrder = data.layers.map((l) => l.id);
      state.layers.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id));

      const loadAudioTrack = async (td) => {
        const aCtx = getAudioCtx();
        try {
          const resp = await fetch(td.dataUrl);
          const buf = await resp.arrayBuffer();
          const audioBuffer = await aCtx.decodeAudioData(buf);
          return { ...td, audioBuffer };
        } catch (e) {
          return { ...td, audioBuffer: null };
        }
      };

      const allAudioData = [
        ...(data.bgmTracks || []).map((t) => ({ ...t, _type: 'bgm' })),
        ...(data.sfxTracks || []).map((t) => ({ ...t, _type: 'sfx' })),
        ...(data.voiceTracks || []).map((t) => ({ ...t, _type: 'voice' })),
      ];
      const loaded = await Promise.all(allAudioData.map(loadAudioTrack));
      state.bgmTracks = []; state.sfxTracks = []; state.voiceTracks = [];
      loaded.forEach((t) => {
        const { _type, ...track } = t;
        state[AUDIO_TRACK_KEYS[_type]].push(track);
      });

      totalDurationInput.value = state.totalDuration;
      projectNameEl.textContent = state.projectName;
      refreshAll();
    } catch (e) {
      alert('プロジェクトの読み込みに失敗しました: ' + e.message);
    }
  }

  $('#btn-save-project').addEventListener('click', saveProject);
  $('#btn-load-project').addEventListener('click', () => fileProject.click());
  fileProject.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadProject(ev.target.result);
    reader.readAsText(file);
    fileProject.value = '';
  });

  $('#btn-new-project').addEventListener('click', () => {
    if (!confirm('現在のプロジェクトを破棄して新規作成しますか？')) return;
    state.projectName = '新規プロジェクト';
    state.layers = [];
    state.selectedLayerId = null;
    state.totalDuration = 10;
    state.lastTotalDuration = null;
    state.currentTime = 0;
    state.bgmTracks = []; state.sfxTracks = []; state.voiceTracks = [];
    state.nextId = 1;
    totalDurationInput.value = 10;
    projectNameEl.textContent = state.projectName;
    refreshAll();
  });

  // ---- Sample Project Generator ----
  function generateSampleImage(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    drawFn(cx, w, h);
    return c.toDataURL('image/png');
  }

  function loadSampleProject() {
    // Generate sample images
    const bgSrc = generateSampleImage(1920, 1080, (cx, w, h) => {
      const grad = cx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0a1628');
      grad.addColorStop(0.5, '#1a3a5c');
      grad.addColorStop(1, '#0d2137');
      cx.fillStyle = grad;
      cx.fillRect(0, 0, w, h);
      // Stars
      cx.fillStyle = '#fff';
      for (let i = 0; i < 120; i++) {
        const sx = Math.random() * w, sy = Math.random() * h * 0.7;
        const sr = Math.random() * 2 + 0.5;
        cx.globalAlpha = Math.random() * 0.7 + 0.3;
        cx.beginPath();
        cx.arc(sx, sy, sr, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;
      // Moon
      cx.fillStyle = '#f5e6c8';
      cx.beginPath();
      cx.arc(1500, 180, 80, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = '#0a1628';
      cx.beginPath();
      cx.arc(1530, 160, 70, 0, Math.PI * 2);
      cx.fill();
      // Ground
      const gGrad = cx.createLinearGradient(0, h * 0.75, 0, h);
      gGrad.addColorStop(0, '#1a3320');
      gGrad.addColorStop(1, '#0d1a10');
      cx.fillStyle = gGrad;
      cx.beginPath();
      cx.moveTo(0, h * 0.82);
      cx.quadraticCurveTo(w * 0.25, h * 0.76, w * 0.5, h * 0.80);
      cx.quadraticCurveTo(w * 0.75, h * 0.84, w, h * 0.78);
      cx.lineTo(w, h); cx.lineTo(0, h);
      cx.fill();
    });

    const charSrc = generateSampleImage(200, 300, (cx, w, h) => {
      // Simple character silhouette
      cx.fillStyle = '#e94560';
      // Body
      cx.beginPath();
      cx.ellipse(100, 200, 45, 70, 0, 0, Math.PI * 2);
      cx.fill();
      // Head
      cx.fillStyle = '#ffcba4';
      cx.beginPath();
      cx.arc(100, 110, 40, 0, Math.PI * 2);
      cx.fill();
      // Eyes
      cx.fillStyle = '#333';
      cx.beginPath();
      cx.arc(85, 105, 5, 0, Math.PI * 2);
      cx.fill();
      cx.beginPath();
      cx.arc(115, 105, 5, 0, Math.PI * 2);
      cx.fill();
      // Smile
      cx.strokeStyle = '#333';
      cx.lineWidth = 2;
      cx.beginPath();
      cx.arc(100, 115, 15, 0.1 * Math.PI, 0.9 * Math.PI);
      cx.stroke();
      // Cape
      cx.fillStyle = '#3498db';
      cx.beginPath();
      cx.moveTo(60, 160);
      cx.quadraticCurveTo(30, 240, 50, 290);
      cx.lineTo(70, 250);
      cx.quadraticCurveTo(60, 200, 75, 170);
      cx.fill();
      cx.beginPath();
      cx.moveTo(140, 160);
      cx.quadraticCurveTo(170, 240, 150, 290);
      cx.lineTo(130, 250);
      cx.quadraticCurveTo(140, 200, 125, 170);
      cx.fill();
    });

    const titleSrc = generateSampleImage(800, 120, (cx, w, h) => {
      cx.fillStyle = '#f1c40f';
      cx.font = 'bold 72px "Segoe UI", "Meiryo", sans-serif';
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.shadowColor = 'rgba(0,0,0,0.5)';
      cx.shadowBlur = 10;
      cx.shadowOffsetX = 3;
      cx.shadowOffsetY = 3;
      cx.fillText('Animation Studio', w / 2, h / 2);
    });

    const starSrc = generateSampleImage(80, 80, (cx, w, h) => {
      cx.fillStyle = '#f1c40f';
      cx.beginPath();
      const cx0 = w / 2, cy0 = h / 2;
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const x = cx0 + 35 * Math.cos(angle);
        const y = cy0 + 35 * Math.sin(angle);
        if (i === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      }
      cx.closePath();
      cx.fill();
      cx.shadowColor = '#f39c12';
      cx.shadowBlur = 15;
      cx.fill();
    });

    const cloudSrc = generateSampleImage(300, 150, (cx) => {
      cx.fillStyle = 'rgba(255,255,255,0.15)';
      cx.beginPath();
      cx.arc(100, 90, 50, 0, Math.PI * 2);
      cx.arc(160, 70, 60, 0, Math.PI * 2);
      cx.arc(220, 85, 45, 0, Math.PI * 2);
      cx.arc(140, 100, 40, 0, Math.PI * 2);
      cx.fill();
    });

    const projectData = {
      version: 2,
      projectName: 'サンプルプロジェクト',
      totalDuration: 8,
      layers: [
        {
          id: 1, name: 'タイトル', imgSrc: titleSrc,
          visible: true, x: 560, y: -120, w: 800, h: 120,
          rotation: 0, opacity: 1, scaleX: 1, scaleY: 1,
          keyframes: [
            { time: 0, x: 560, y: -120, rotation: 0, opacity: 0, scaleX: 0.5, scaleY: 0.5, easing: 'easeOut' },
            { time: 1.5, x: 560, y: 80, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, easing: 'easeInOut' },
            { time: 5.5, x: 560, y: 80, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, easing: 'easeIn' },
            { time: 7, x: 560, y: -120, rotation: -5, opacity: 0, scaleX: 0.8, scaleY: 0.8, easing: 'easeInOut' },
          ],
          vibrations: [
            // 効果音（雷等）でタイトルが大きく揺れる例
            { sourceType: 'sfx', sourceIndex: 0, intensity: 15, threshold: 0.3 },
          ],
        },
        {
          id: 2, name: 'キャラクター', imgSrc: charSrc,
          visible: true, x: -200, y: 600, w: 200, h: 300,
          rotation: 0, opacity: 1, scaleX: 1, scaleY: 1,
          keyframes: [
            { time: 0, x: -200, y: 600, rotation: 0, opacity: 0, scaleX: 1, scaleY: 1, easing: 'easeOut' },
            { time: 1, x: 200, y: 600, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, easing: 'easeInOut' },
            { time: 3, x: 860, y: 580, rotation: 5, opacity: 1, scaleX: 1.1, scaleY: 1.1, easing: 'easeInOut' },
            { time: 5, x: 1400, y: 560, rotation: -3, opacity: 1, scaleX: 1, scaleY: 1, easing: 'easeInOut' },
            { time: 7, x: 1800, y: 500, rotation: 10, opacity: 1, scaleX: 1.2, scaleY: 1.2, easing: 'easeIn' },
            { time: 8, x: 2100, y: 600, rotation: 0, opacity: 0, scaleX: 1, scaleY: 1, easing: 'linear' },
          ],
          vibrations: [
            // 音声トラックで喋りに合わせて微振動
            { sourceType: 'voice', sourceIndex: 0, intensity: 5, threshold: 0.1 },
            // 効果音（雷等）でびっくりして大きく揺れる
            { sourceType: 'sfx', sourceIndex: 0, intensity: 25, threshold: 0.3 },
          ],
        },
        {
          id: 3, name: '星1', imgSrc: starSrc,
          visible: true, x: 400, y: 300, w: 80, h: 80,
          rotation: 0, opacity: 1, scaleX: 1, scaleY: 1,
          keyframes: [
            { time: 0, x: 400, y: 400, rotation: 0, opacity: 0, scaleX: 0.3, scaleY: 0.3, easing: 'easeOut' },
            { time: 2, x: 400, y: 300, rotation: 180, opacity: 1, scaleX: 1, scaleY: 1, easing: 'easeInOut' },
            { time: 5, x: 500, y: 250, rotation: 360, opacity: 1, scaleX: 1.2, scaleY: 1.2, easing: 'easeInOut' },
            { time: 8, x: 600, y: 200, rotation: 720, opacity: 0, scaleX: 0.3, scaleY: 0.3, easing: 'easeIn' },
          ],
        },
        {
          id: 4, name: '星2', imgSrc: starSrc,
          visible: true, x: 1200, y: 250, w: 60, h: 60,
          rotation: 0, opacity: 1, scaleX: 0.7, scaleY: 0.7,
          keyframes: [
            { time: 0.5, x: 1200, y: 350, rotation: 0, opacity: 0, scaleX: 0.2, scaleY: 0.2, easing: 'easeOut' },
            { time: 2.5, x: 1200, y: 250, rotation: -180, opacity: 0.8, scaleX: 0.7, scaleY: 0.7, easing: 'easeInOut' },
            { time: 6, x: 1100, y: 200, rotation: -540, opacity: 0.8, scaleX: 0.9, scaleY: 0.9, easing: 'easeInOut' },
            { time: 8, x: 1000, y: 150, rotation: -720, opacity: 0, scaleX: 0.2, scaleY: 0.2, easing: 'easeIn' },
          ],
        },
        {
          id: 5, name: '雲', imgSrc: cloudSrc,
          visible: true, x: -300, y: 80, w: 300, h: 150,
          rotation: 0, opacity: 1, scaleX: 1, scaleY: 1,
          keyframes: [
            { time: 0, x: -300, y: 80, rotation: 0, opacity: 0.6, scaleX: 1, scaleY: 1, easing: 'linear' },
            { time: 8, x: 1920, y: 60, rotation: 0, opacity: 0.6, scaleX: 1.2, scaleY: 1, easing: 'linear' },
          ],
        },
        {
          id: 6, name: '背景', imgSrc: bgSrc,
          visible: true, x: 0, y: 0, w: 1920, h: 1080,
          rotation: 0, opacity: 1, scaleX: 1, scaleY: 1,
          keyframes: [],
        },
      ],
      bgmTracks: [],
      sfxTracks: [],
      voiceTracks: [],
      nextId: 7,
    };

    loadProject(JSON.stringify(projectData));
  }

  $('#btn-load-sample').addEventListener('click', () => {
    if (state.layers.length > 0 && !confirm('現在のプロジェクトを破棄してサンプルを読み込みますか？')) return;
    loadSampleProject();
  });

  projectNameEl.addEventListener('click', () => {
    renameInput.value = state.projectName;
    renameModal.classList.remove('hidden');
    renameInput.focus(); renameInput.select();
  });
  $('#btn-rename-ok').addEventListener('click', () => {
    const val = renameInput.value.trim();
    if (val) { state.projectName = val; projectNameEl.textContent = val; }
    renameModal.classList.add('hidden');
  });
  $('#btn-rename-cancel').addEventListener('click', () => { renameModal.classList.add('hidden'); });

  // ---- Export ----
  $('#btn-export').addEventListener('click', () => {
    exportModal.classList.remove('hidden');
    // Show GPU info
    const gpu = gpuInfo;
    const lines = [];
    if (gpu.renderer) lines.push(`GPU: ${gpu.renderer}`);
    else lines.push('GPU: 検出不可');
    lines.push(`WebGL2: <span class="${gpu.webgl2 ? 'gpu-available' : 'gpu-unavailable'}">${gpu.webgl2 ? '✓ 利用可能' : '✗ 非対応'}</span>`);
    lines.push(`WebCodecs (HWエンコード): <span class="${gpu.webcodecs ? 'gpu-available' : 'gpu-unavailable'}">${gpu.webcodecs ? '✓ 利用可能' : '✗ 非対応 (MediaRecorder使用)'}</span>`);
    if (gpu.hardwareAccel) lines.push('<span class="gpu-available">✓ ハードウェアアクセラレーション有効</span>');
    else lines.push('<span class="gpu-unavailable">⚠ ソフトウェアレンダリング</span>');
    gpuInfoEl.innerHTML = lines.join('<br>');
    useGpuCheckbox.disabled = !gpu.webgl2;
  });
  $('#btn-export-cancel').addEventListener('click', () => {
    exportModal.classList.add('hidden');
    exportProgress.classList.add('hidden');
  });

  $('#btn-export-start').addEventListener('click', async () => {
    const [expW, expH] = $('#export-resolution').value.split('x').map(Number);
    const fps = parseInt($('#export-fps').value);
    const format = $('#export-format').value;
    const useGpu = useGpuCheckbox.checked && gpuInfo.webgl2;
    $('#btn-export-start').disabled = true;
    exportProgress.classList.remove('hidden');
    try { await exportVideo(expW, expH, fps, format, useGpu); }
    catch (err) { alert('エクスポートに失敗しました: ' + err.message); }
    $('#btn-export-start').disabled = false;
  });

  // ---- WebGL Renderer for GPU export ----
  function createGLRenderer(width, height) {
    const glCanvas = document.createElement('canvas');
    glCanvas.width = width; glCanvas.height = height;
    const gl = glCanvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;

    const vsrc = `#version 300 es
      in vec2 a_pos;
      in vec2 a_uv;
      uniform mat3 u_matrix;
      out vec2 v_uv;
      void main() {
        vec3 p = u_matrix * vec3(a_pos, 1.0);
        gl_Position = vec4(p.xy, 0.0, 1.0);
        v_uv = a_uv;
      }`;
    const fsrc = `#version 300 es
      precision mediump float;
      in vec2 v_uv;
      uniform sampler2D u_tex;
      uniform float u_alpha;
      out vec4 outColor;
      void main() {
        vec4 c = texture(u_tex, v_uv);
        outColor = vec4(c.rgb, c.a * u_alpha);
      }`;

    function compileShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vsrc));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fsrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const aUv = gl.getAttribLocation(prog, 'a_uv');
    const uMatrix = gl.getUniformLocation(prog, 'u_matrix');
    const uAlpha = gl.getUniformLocation(prog, 'u_alpha');

    // Quad: position + uv
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 0, 1,   1, 0, 1, 1,   0, 1, 0, 0,
      1, 0, 1, 1,   1, 1, 1, 0,   0, 1, 0, 0,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Texture cache: layerId -> WebGLTexture
    const texCache = new Map();

    function getTexture(layer) {
      if (texCache.has(layer.id)) return texCache.get(layer.id);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.img);
      texCache.set(layer.id, tex);
      return tex;
    }

    function renderFrame(time, vibOffsets) {
      gl.viewport(0, 0, width, height);
      gl.clearColor(0.133, 0.133, 0.133, 1); // #222
      gl.clear(gl.COLOR_BUFFER_BIT);

      for (let i = state.layers.length - 1; i >= 0; i--) {
        const layer = state.layers[i];
        if (!layer.visible || !layer.img) continue;

        const st = getLayerStateAtTime(layer, time);
        const vib = vibOffsets ? (vibOffsets.get(layer.id) || { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
        const tex = getTexture(layer);
        gl.bindTexture(gl.TEXTURE_2D, tex);

        // Build 2D transform matrix (column-major for GLSL)
        const sx = (layer.w / width) * 2 * st.scaleX;
        const sy = (layer.h / height) * 2 * st.scaleY;
        const tx = ((st.x + vib.dx) / width) * 2 - 1 + (layer.w / width) * (1 - st.scaleX);
        // Flip Y for WebGL
        const ty = -(((st.y + vib.dy) / height) * 2 - 1 + (layer.h / height) * (1 - st.scaleY)) - sy;
        const rad = -(st.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Pivot at center of quad
        const cx = tx + sx / 2;
        const cy = ty + sy / 2;

        // T(cx,cy) * R * T(-cx,-cy) * S+T
        // Combined: scale, then translate, then rotate around center
        const m = new Float32Array([
          sx * cos, sx * sin, 0,
          -sy * sin, sy * cos, 0,
          cx - cx * cos + cy * sin, cy - cx * sin - cy * cos, 1,
        ]);

        gl.uniformMatrix3fv(uMatrix, false, m);
        gl.uniform1f(uAlpha, st.opacity);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    function destroy() {
      texCache.forEach((tex) => gl.deleteTexture(tex));
      texCache.clear();
      gl.deleteProgram(prog);
    }

    return { canvas: glCanvas, gl, renderFrame, destroy };
  }

  // ---- Render audio mixdown (shared by both export paths) ----
  async function renderAudioMixdown() {
    const hasAudio = state.bgmTracks.length > 0 || state.sfxTracks.length > 0 || state.voiceTracks.length > 0;
    if (!hasAudio) return null;
    const aCtx = getAudioCtx();
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(state.totalDuration * aCtx.sampleRate), aCtx.sampleRate);
    [...state.bgmTracks, ...state.sfxTracks, ...state.voiceTracks].forEach((t) => {
      if (!t.audioBuffer) return;
      const src = offlineCtx.createBufferSource();
      const gain = offlineCtx.createGain();
      gain.gain.value = t.volume ?? 1;
      src.buffer = t.audioBuffer;
      src.connect(gain);
      gain.connect(offlineCtx.destination);
      src.start(t.startTime || 0);
    });
    return offlineCtx.startRendering();
  }

  // Pre-analyze per-track audio waveform for export-time vibration
  // Returns Map<'type:index', Float32Array of per-frame amplitudes>
  async function analyzeAudioForVibration(fps, totalFrames) {
    const ampMap = new Map();
    const tracksToAnalyze = [];
    // Collect only tracks that are actually referenced by some layer vibration
    const usedKeys = new Set();
    state.layers.forEach((l) => {
      (l.vibrations || []).forEach((v) => usedKeys.add(v.sourceType + ':' + v.sourceIndex));
    });
    if (usedKeys.size === 0) return ampMap;

    const trackSets = [
      { type: 'bgm', tracks: state.bgmTracks },
      { type: 'sfx', tracks: state.sfxTracks },
      { type: 'voice', tracks: state.voiceTracks },
    ];
    for (const { type, tracks } of trackSets) {
      for (let idx = 0; idx < tracks.length; idx++) {
        const key = type + ':' + idx;
        if (!usedKeys.has(key)) continue;
        const t = tracks[idx];
        if (!t.audioBuffer) { ampMap.set(key, new Float32Array(totalFrames + 1)); continue; }
        tracksToAnalyze.push({ key, track: t });
      }
    }

    for (const { key, track } of tracksToAnalyze) {
      const buf = track.audioBuffer;
      const startTime = track.startTime || 0;
      const amps = new Float32Array(totalFrames + 1);
      // Analyze amplitude from raw PCM data per frame window
      const sampleRate = buf.sampleRate;
      const channelData = buf.getChannelData(0); // mono analysis
      const samplesPerFrame = Math.floor(sampleRate / fps);

      for (let frame = 0; frame <= totalFrames; frame++) {
        const time = frame / fps;
        const offsetInTrack = time - startTime;
        if (offsetInTrack < 0 || offsetInTrack >= buf.duration) { amps[frame] = 0; continue; }
        const sampleStart = Math.floor(offsetInTrack * sampleRate);
        const sampleEnd = Math.min(sampleStart + samplesPerFrame, channelData.length);
        let maxDev = 0;
        for (let s = sampleStart; s < sampleEnd; s++) {
          const dev = Math.abs(channelData[s]);
          if (dev > maxDev) maxDev = dev;
        }
        amps[frame] = maxDev;
      }
      ampMap.set(key, amps);
    }
    return ampMap;
  }

  // Calculate vibration offset for a layer during export using pre-analyzed amplitudes
  function getExportVibrationOffset(layer, frame, ampMap) {
    if (!layer.vibrations || layer.vibrations.length === 0) return { dx: 0, dy: 0 };
    let dx = 0, dy = 0;
    for (const vib of layer.vibrations) {
      const key = vib.sourceType + ':' + vib.sourceIndex;
      const amps = ampMap.get(key);
      if (!amps) continue;
      const amp = amps[frame] || 0;
      if (amp > vib.threshold) {
        const strength = ((amp - vib.threshold) / (1 - vib.threshold)) * vib.intensity;
        dx += (Math.random() - 0.5) * 2 * strength;
        dy += (Math.random() - 0.5) * 2 * strength;
      }
    }
    return { dx, dy };
  }

  // ---- Export (main entry) ----
  async function exportVideo(width, height, fps, format, useGpu) {
    const renderedAudioBuffer = await renderAudioMixdown();
    const totalFrames = Math.ceil(state.totalDuration * fps);
    const vibAmpMap = await analyzeAudioForVibration(fps, totalFrames);

    // GPU path: WebGL compositing + MediaRecorder encoding
    if (useGpu) {
      const glr = createGLRenderer(width, height);
      if (glr) {
        try {
          await exportWithGLMediaRecorder(glr, width, height, fps, format, renderedAudioBuffer, totalFrames, vibAmpMap);
          glr.destroy();
          return;
        } catch (e) {
          glr.destroy();
          // Fall through to CPU path
        }
      }
    }

    // CPU fallback: Canvas2D + MediaRecorder
    await exportWithCanvas2D(width, height, fps, format, renderedAudioBuffer, totalFrames, vibAmpMap);
  }

  // ---- GL + MediaRecorder export path ----
  async function exportWithGLMediaRecorder(glr, width, height, fps, format, renderedAudioBuffer, totalFrames, vibAmpMap) {
    const mimeType = format === 'mp4'
      ? (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/webm;codecs=vp9')
      : 'video/webm;codecs=vp9';

    const stream = glr.canvas.captureStream(0); // manual frame capture
    if (renderedAudioBuffer) {
      const aCtx = getAudioCtx();
      const liveAudioCtx = new AudioContext({ sampleRate: aCtx.sampleRate });
      const src = liveAudioCtx.createBufferSource();
      src.buffer = renderedAudioBuffer;
      const dest = liveAudioCtx.createMediaStreamDestination();
      src.connect(dest); src.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
      videoBitsPerSecond: 12_000_000,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const exportDone = new Promise((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start();

    const videoTrack = stream.getVideoTracks()[0];
    for (let frame = 0; frame <= totalFrames; frame++) {
      const time = Math.min(frame / fps, state.totalDuration);

      // Compute per-layer vibration offsets for this frame
      const vibOffsets = new Map();
      state.layers.forEach((layer) => {
        vibOffsets.set(layer.id, getExportVibrationOffset(layer, frame, vibAmpMap));
      });
      glr.renderFrame(time, vibOffsets);

      // Request frame capture from stream
      if (videoTrack.requestFrame) videoTrack.requestFrame();

      const progress = Math.round((frame / totalFrames) * 100);
      exportProgressBar.value = progress;
      exportProgressText.textContent = progress + '% (GPU)';

      // Pace at ~real frame intervals for MediaRecorder sync
      await new Promise((r) => setTimeout(r, 1000 / fps));
    }

    recorder.stop();
    await exportDone;

    const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    downloadBlob(new Blob(chunks, { type: recorder.mimeType }), state.projectName + '.' + ext);
    finishExport();
  }

  // ---- Canvas2D + MediaRecorder export path (CPU fallback) ----
  async function exportWithCanvas2D(width, height, fps, format, renderedAudioBuffer, totalFrames, vibAmpMap) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width; offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d');
    const scaleX = width / CANVAS_W;
    const scaleY = height / CANVAS_H;

    const mimeType = format === 'mp4'
      ? (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/webm;codecs=vp9')
      : 'video/webm;codecs=vp9';

    const stream = offCanvas.captureStream(fps);
    if (renderedAudioBuffer) {
      const aCtx = getAudioCtx();
      const liveAudioCtx = new AudioContext({ sampleRate: aCtx.sampleRate });
      const src = liveAudioCtx.createBufferSource();
      src.buffer = renderedAudioBuffer;
      const dest = liveAudioCtx.createMediaStreamDestination();
      src.connect(dest); src.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
      videoBitsPerSecond: 12_000_000,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const exportDone = new Promise((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start();

    for (let frame = 0; frame <= totalFrames; frame++) {
      const time = Math.min(frame / fps, state.totalDuration);

      offCtx.clearRect(0, 0, width, height);
      offCtx.fillStyle = '#222';
      offCtx.fillRect(0, 0, width, height);

      for (let i = state.layers.length - 1; i >= 0; i--) {
        const vibOffset = getExportVibrationOffset(state.layers[i], frame, vibAmpMap);
        renderLayer(offCtx, state.layers[i], time, scaleX, scaleY, vibOffset);
      }

      const progress = Math.round((frame / totalFrames) * 100);
      exportProgressBar.value = progress;
      exportProgressText.textContent = progress + '% (CPU)';
      await new Promise((r) => setTimeout(r, 0));
    }

    recorder.stop();
    await exportDone;

    const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    downloadBlob(new Blob(chunks, { type: recorder.mimeType }), state.projectName + '.' + ext);
    finishExport();
  }

  function finishExport() {
    state.currentTime = 0;
    updatePlayhead();
    render();
    exportModal.classList.add('hidden');
    exportProgress.classList.add('hidden');
  }

  // ---- Controls ----
  $('#btn-play').addEventListener('click', play);
  $('#btn-pause').addEventListener('click', pause);
  $('#btn-stop').addEventListener('click', stop);

  totalDurationInput.addEventListener('change', () => {
    state.totalDuration = parseFloat(totalDurationInput.value) || 10;
    refreshTimeline();
  });

  $('#audio-panel-toggle').addEventListener('click', () => {
    $('#audio-panel').classList.toggle('collapsed');
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); state.isPlaying ? pause() : play(); }
    if (e.code === 'KeyK') {
      const layer = getSelectedLayer();
      if (layer) addKeyframe(layer);
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (state.selectedLayerId) removeLayer(state.selectedLayerId);
    }
  });

  // ---- Refresh All ----
  function refreshAll() {
    refreshLayerList();
    refreshProperties();
    refreshTimeline();
    refreshAudioLists();
    render();
  }

  // ---- Init ----
  function init() {
    resizeCanvas();
    window.addEventListener('resize', () => { resizeCanvas(); render(); });
    refreshAll();
  }

  init();
})();
