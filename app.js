// Animation Studio - Main Application (Keyframe-based)

(() => {
  'use strict';

  const CANVAS_W = 1280;
  const CANVAS_H = 720;
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
    // Each layer: { id, name, img, imgSrc, thumbCanvas, visible, x, y, w, h, rotation, opacity, scaleX, scaleY, keyframes: [] }
    // Each keyframe: { time, x, y, rotation, opacity, scaleX, scaleY, easing }
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
  function renderLayer(targetCtx, layer, time, scaleX, scaleY) {
    if (!layer.visible || !layer.img) return;
    const st = getLayerStateAtTime(layer, time);

    targetCtx.save();
    targetCtx.globalAlpha = st.opacity;
    targetCtx.translate((st.x + layer.w / 2) * scaleX, (st.y + layer.h / 2) * scaleY);
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
      renderLayer(ctx, layer, state.currentTime, 1, 1);

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
        <h3>レイヤー順序</h3>
        <div class="prop-row" id="layer-order-buttons"></div>
      </div>
    `;

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

    const playTrack = (track) => {
      if (!track.audioBuffer) return;
      const src = aCtx.createBufferSource();
      const gain = aCtx.createGain();
      gain.gain.value = track.volume ?? 1;
      src.buffer = track.audioBuffer;
      src.connect(gain);
      gain.connect(aCtx.destination);
      const offset = Math.max(0, state.currentTime - (track.startTime || 0));
      const when = Math.max(0, (track.startTime || 0) - state.currentTime);
      if (offset < track.audioBuffer.duration) {
        src.start(aCtx.currentTime + when, offset);
        state.activeAudioSources.push(src);
      }
    };

    state.bgmTracks.forEach(playTrack);
    state.sfxTracks.forEach(playTrack);
    state.voiceTracks.forEach(playTrack);
  }

  function stopAudioPlayback() {
    state.activeAudioSources.forEach((s) => { try { s.stop(); } catch (e) {} });
    state.activeAudioSources = [];
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

            state.layers.push({ ...ld, img, imgSrc: ld.imgSrc, thumbCanvas, keyframes });
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
  $('#btn-export').addEventListener('click', () => { exportModal.classList.remove('hidden'); });
  $('#btn-export-cancel').addEventListener('click', () => {
    exportModal.classList.add('hidden');
    exportProgress.classList.add('hidden');
  });

  $('#btn-export-start').addEventListener('click', async () => {
    const [expW, expH] = $('#export-resolution').value.split('x').map(Number);
    const fps = parseInt($('#export-fps').value);
    const format = $('#export-format').value;
    $('#btn-export-start').disabled = true;
    exportProgress.classList.remove('hidden');
    try { await exportVideo(expW, expH, fps, format); }
    catch (err) { alert('エクスポートに失敗しました: ' + err.message); }
    $('#btn-export-start').disabled = false;
  });

  async function exportVideo(width, height, fps, format) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width; offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d');
    const scaleX = width / CANVAS_W;
    const scaleY = height / CANVAS_H;

    const mimeType = format === 'mp4'
      ? (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/webm;codecs=vp9')
      : 'video/webm;codecs=vp9';

    const aCtx = getAudioCtx();
    let renderedAudioBuffer = null;
    const hasAudio = state.bgmTracks.length > 0 || state.sfxTracks.length > 0 || state.voiceTracks.length > 0;

    if (hasAudio) {
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
      renderedAudioBuffer = await offlineCtx.startRendering();
    }

    const stream = offCanvas.captureStream(fps);
    if (renderedAudioBuffer) {
      const liveAudioCtx = new AudioContext({ sampleRate: aCtx.sampleRate });
      const src = liveAudioCtx.createBufferSource();
      src.buffer = renderedAudioBuffer;
      const dest = liveAudioCtx.createMediaStreamDestination();
      src.connect(dest); src.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
      videoBitsPerSecond: 8000000,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const exportDone = new Promise((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start();

    const totalFrames = Math.ceil(state.totalDuration * fps);
    for (let frame = 0; frame <= totalFrames; frame++) {
      const time = Math.min(frame / fps, state.totalDuration);

      offCtx.clearRect(0, 0, width, height);
      offCtx.fillStyle = '#222';
      offCtx.fillRect(0, 0, width, height);

      for (let i = state.layers.length - 1; i >= 0; i--) {
        renderLayer(offCtx, state.layers[i], time, scaleX, scaleY);
      }

      const progress = Math.round((frame / totalFrames) * 100);
      exportProgressBar.value = progress;
      exportProgressText.textContent = progress + '%';
      await new Promise((r) => setTimeout(r, 0));
    }

    recorder.stop();
    await exportDone;

    const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    downloadBlob(new Blob(chunks, { type: recorder.mimeType }), state.projectName + '.' + ext);

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
