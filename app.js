// ============================================================
// Animation Studio - Main Application
// ============================================================

(() => {
  'use strict';

  // ----------------------------------------------------------
  // State
  // ----------------------------------------------------------
  const state = {
    projectName: '新規プロジェクト',
    layers: [],          // { id, name, img (Image), visible, x, y, w, h, rotation, opacity, scaleX, scaleY, startX, startY, endX, endY, animStart, animDuration, easing }
    selectedLayerId: null,
    totalDuration: 10,   // seconds
    currentTime: 0,
    isPlaying: false,
    playStartTimestamp: null,
    playStartTime: 0,
    animFrameId: null,
    // Audio
    bgmTracks: [],       // { id, name, buffer, audioBuffer, startTime, volume }
    sfxTracks: [],
    voiceTracks: [],
    // Canvas
    canvasScale: 1,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    // Mode: null | 'setStart' | 'setEnd'
    interactionMode: null,
    // Duration recording
    isRecording: false,
    recordStartTime: 0,
    // ID counter
    nextId: 1,
    // Audio context
    audioCtx: null,
    activeAudioSources: [],
  };

  // ----------------------------------------------------------
  // DOM refs
  // ----------------------------------------------------------
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
  const durationDisplay = $('#duration-display');
  const totalDurationInput = $('#total-duration');
  const canvasContainer = $('#canvas-container');

  // ----------------------------------------------------------
  // Utils
  // ----------------------------------------------------------
  function genId() { return state.nextId++; }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  function getEasing(name) {
    switch (name) {
      case 'linear': return (t) => t;
      case 'easeIn': return (t) => t * t;
      case 'easeOut': return (t) => t * (2 - t);
      case 'easeInOut': return easeInOut;
      default: return (t) => t;
    }
  }

  // ----------------------------------------------------------
  // Audio Context
  // ----------------------------------------------------------
  function getAudioCtx() {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return state.audioCtx;
  }

  // ----------------------------------------------------------
  // Canvas Sizing
  // ----------------------------------------------------------
  function resizeCanvas() {
    const area = $('#canvas-area');
    const maxW = area.clientWidth - 40;
    const maxH = area.clientHeight - 80;
    const scale = Math.min(maxW / 1280, maxH / 720, 1);
    state.canvasScale = scale;
    canvasContainer.style.width = (1280 * scale) + 'px';
    canvasContainer.style.height = (720 * scale) + 'px';
    canvas.style.width = (1280 * scale) + 'px';
    canvas.style.height = (720 * scale) + 'px';
  }

  // ----------------------------------------------------------
  // Render Canvas
  // ----------------------------------------------------------
  // Pre-render checkerboard as offscreen canvas
  const checkerboard = (() => {
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    const cctx = c.getContext('2d');
    const size = 20;
    for (let y = 0; y < 720; y += size) {
      for (let x = 0; x < 1280; x += size) {
        cctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#2a2a2a' : '#333';
        cctx.fillRect(x, y, size, size);
      }
    }
    return c;
  })();

  function render() {
    ctx.clearRect(0, 0, 1280, 720);
    ctx.drawImage(checkerboard, 0, 0);

    // Draw layers bottom to top
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];
      if (!layer.visible || !layer.img) continue;

      // Compute animated position
      let posX = layer.x;
      let posY = layer.y;
      let currentOpacity = layer.opacity;

      if (layer.animDuration > 0 && layer.startX != null && layer.endX != null) {
        const t0 = layer.animStart;
        const t1 = layer.animStart + layer.animDuration;
        if (state.currentTime >= t0 && state.currentTime <= t1) {
          const raw = (state.currentTime - t0) / layer.animDuration;
          const easeFn = getEasing(layer.easing);
          const progress = easeFn(clamp(raw, 0, 1));
          posX = lerp(layer.startX, layer.endX, progress);
          posY = lerp(layer.startY, layer.endY, progress);
        } else if (state.currentTime > t1) {
          posX = layer.endX;
          posY = layer.endY;
        } else {
          posX = layer.startX;
          posY = layer.startY;
        }
      }

      ctx.save();
      ctx.globalAlpha = currentOpacity;
      ctx.translate(posX + layer.w / 2, posY + layer.h / 2);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.scale(layer.scaleX, layer.scaleY);
      ctx.drawImage(layer.img, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
      ctx.restore();

      // Draw selection outline
      if (layer.id === state.selectedLayerId && !state.isPlaying) {
        ctx.save();
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(posX, posY, layer.w, layer.h);
        ctx.setLineDash([]);

        // Draw start point marker
        if (layer.startX != null) {
          ctx.beginPath();
          ctx.arc(layer.startX + layer.w / 2, layer.startY + layer.h / 2, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#2ecc71';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // Draw end point marker
        if (layer.endX != null) {
          ctx.beginPath();
          ctx.arc(layer.endX + layer.w / 2, layer.endY + layer.h / 2, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#e94560';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // Draw path line
        if (layer.startX != null && layer.endX != null) {
          ctx.beginPath();
          ctx.moveTo(layer.startX + layer.w / 2, layer.startY + layer.h / 2);
          ctx.lineTo(layer.endX + layer.w / 2, layer.endY + layer.h / 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
    }
  }

  // ----------------------------------------------------------
  // Layer Management
  // ----------------------------------------------------------
  function addLayer(name, imgSrc) {
    const id = genId();
    const img = new Image();
    img.onload = () => {
      // Fit within canvas
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > 1280) { h *= 1280 / w; w = 1280; }
      if (h > 720) { w *= 720 / h; h = 720; }
      const layer = {
        id, name,
        img, imgSrc,
        visible: true,
        x: (1280 - w) / 2, y: (720 - h) / 2,
        w, h,
        rotation: 0, opacity: 1,
        scaleX: 1, scaleY: 1,
        startX: null, startY: null,
        endX: null, endY: null,
        animStart: 0,
        animDuration: 0,
        easing: 'easeInOut',
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

  // ----------------------------------------------------------
  // Layer List UI
  // ----------------------------------------------------------
  function refreshLayerList() {
    layerList.innerHTML = '';
    state.layers.forEach((layer) => {
      const li = document.createElement('li');
      li.className = 'layer-item' + (layer.id === state.selectedLayerId ? ' selected' : '');
      li.dataset.id = layer.id;

      // Thumbnail
      const thumb = document.createElement('canvas');
      thumb.className = 'layer-thumb';
      thumb.width = 32; thumb.height = 32;
      if (layer.img) {
        const tc = thumb.getContext('2d');
        const scale = Math.min(32 / layer.img.naturalWidth, 32 / layer.img.naturalHeight);
        const tw = layer.img.naturalWidth * scale;
        const th = layer.img.naturalHeight * scale;
        tc.drawImage(layer.img, (32 - tw) / 2, (32 - th) / 2, tw, th);
      }

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
        const finish = () => {
          layer.name = input.value || layer.name;
          refreshAll();
        };
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

      li.onclick = () => { state.selectedLayerId = layer.id; refreshAll(); };
      li.appendChild(thumb);
      li.appendChild(nameSpan);
      li.appendChild(vis);
      li.appendChild(del);
      layerList.appendChild(li);
    });
  }

  // ----------------------------------------------------------
  // Property Panel
  // ----------------------------------------------------------
  function refreshProperties() {
    const layer = getSelectedLayer();
    if (!layer) {
      propertyContent.innerHTML = '<p class="placeholder-text">レイヤーを選択してください</p>';
      return;
    }

    propertyContent.innerHTML = `
      <div class="prop-group">
        <h3>変形</h3>
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
        <h3>アニメーション</h3>
        <div class="prop-row"><label>始点X:</label><input type="number" data-prop="startX" value="${layer.startX ?? ''}" placeholder="未設定"></div>
        <div class="prop-row"><label>始点Y:</label><input type="number" data-prop="startY" value="${layer.startY ?? ''}" placeholder="未設定"></div>
        <div class="prop-row"><label>終点X:</label><input type="number" data-prop="endX" value="${layer.endX ?? ''}" placeholder="未設定"></div>
        <div class="prop-row"><label>終点Y:</label><input type="number" data-prop="endY" value="${layer.endY ?? ''}" placeholder="未設定"></div>
        <div class="prop-row"><label>開始:</label><input type="number" data-prop="animStart" value="${layer.animStart}" step="0.1" min="0">秒</div>
        <div class="prop-row"><label>秒数:</label><input type="number" data-prop="animDuration" value="${layer.animDuration}" step="0.1" min="0">秒</div>
        <div class="prop-row"><label>イージング:</label>
          <select data-prop="easing">
            <option value="linear" ${layer.easing === 'linear' ? 'selected' : ''}>リニア</option>
            <option value="easeIn" ${layer.easing === 'easeIn' ? 'selected' : ''}>イーズイン</option>
            <option value="easeOut" ${layer.easing === 'easeOut' ? 'selected' : ''}>イーズアウト</option>
            <option value="easeInOut" ${layer.easing === 'easeInOut' ? 'selected' : ''}>イーズインアウト</option>
          </select>
        </div>
      </div>
      <div class="prop-group">
        <h3>レイヤー順序</h3>
        <div class="prop-row">
          <button onclick="window._moveLayer(${layer.id}, -1)">↑ 前面へ</button>
          <button onclick="window._moveLayer(${layer.id}, 1)">↓ 背面へ</button>
        </div>
      </div>
    `;

    // Bind property inputs
    propertyContent.querySelectorAll('[data-prop]').forEach((input) => {
      input.addEventListener('change', () => {
        const prop = input.dataset.prop;
        let val = input.type === 'range' ? parseFloat(input.value) : input.value;
        if (input.type === 'number') val = val === '' ? null : parseFloat(val);
        if (prop === 'easing') val = input.value;
        layer[prop] = val;
        refreshAll();
      });
      input.addEventListener('input', () => {
        const prop = input.dataset.prop;
        if (input.type === 'range') {
          layer[prop] = parseFloat(input.value);
          render();
          // Update display
          const span = input.nextElementSibling;
          if (span) span.textContent = (layer.opacity * 100).toFixed(0) + '%';
        }
      });
    });
  }

  window._moveLayer = (id, dir) => { moveLayerOrder(id, dir); };

  // ----------------------------------------------------------
  // Timeline
  // ----------------------------------------------------------
  const TIMELINE_PX_PER_SEC = 80;
  const TRACK_LABEL_WIDTH = 120;

  function refreshTimeline() {
    const totalWidth = TRACK_LABEL_WIDTH + state.totalDuration * TIMELINE_PX_PER_SEC;

    // Ruler
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
      if (isMajor) {
        rc.fillText(s.toFixed(0) + 's', x + 2, 14);
      }
    }

    // Tracks
    timelineTracks.style.width = totalWidth + 'px';
    timelineTracks.innerHTML = '';

    // Layer tracks
    state.layers.forEach((layer) => {
      const track = document.createElement('div');
      track.className = 'timeline-track';

      const label = document.createElement('div');
      label.className = 'track-label';
      label.textContent = layer.name;
      label.onclick = () => { state.selectedLayerId = layer.id; refreshAll(); };

      const content = document.createElement('div');
      content.className = 'track-content';

      if (layer.animDuration > 0) {
        const bar = document.createElement('div');
        bar.className = 'keyframe-bar';
        bar.style.left = (layer.animStart * TIMELINE_PX_PER_SEC) + 'px';
        bar.style.width = (layer.animDuration * TIMELINE_PX_PER_SEC) + 'px';
        bar.textContent = layer.animDuration.toFixed(1) + 's';
        bar.title = `${layer.name}: ${layer.animStart.toFixed(1)}s ~ ${(layer.animStart + layer.animDuration).toFixed(1)}s`;

        // Draggable bar
        let barDragStart = null;
        bar.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          barDragStart = { x: e.clientX, origStart: layer.animStart };
          const onMove = (ev) => {
            const dx = ev.clientX - barDragStart.x;
            layer.animStart = Math.max(0, barDragStart.origStart + dx / TIMELINE_PX_PER_SEC);
            refreshAll();
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });

        content.appendChild(bar);
      }

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
      const dur = audio.duration || 1;
      bar.style.width = (dur * TIMELINE_PX_PER_SEC) + 'px';
      bar.textContent = audio.name;

      content.appendChild(bar);
      track.appendChild(label);
      track.appendChild(content);
      timelineTracks.appendChild(track);
    });

    updatePlayhead();
  }

  function updatePlayhead() {
    const x = TRACK_LABEL_WIDTH + state.currentTime * TIMELINE_PX_PER_SEC;
    playhead.style.left = x + 'px';
    timeDisplay.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.totalDuration)}`;
  }

  // Click on timeline to seek
  $('#timeline-tracks-container').addEventListener('mousedown', (e) => {
    const container = $('#timeline-tracks-container');
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - TRACK_LABEL_WIDTH;
    if (x >= 0) {
      state.currentTime = clamp(x / TIMELINE_PX_PER_SEC, 0, state.totalDuration);
      updatePlayhead();
      render();
    }
  });

  // ----------------------------------------------------------
  // Playback
  // ----------------------------------------------------------
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

  // ----------------------------------------------------------
  // Audio Playback
  // ----------------------------------------------------------
  function startAudioPlayback() {
    stopAudioPlayback();
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const playTrack = (track) => {
      if (!track.audioBuffer) return;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = track.volume ?? 1;
      src.buffer = track.audioBuffer;
      src.connect(gain);
      gain.connect(ctx.destination);
      const offset = Math.max(0, state.currentTime - (track.startTime || 0));
      const when = Math.max(0, (track.startTime || 0) - state.currentTime);
      if (offset < track.audioBuffer.duration) {
        src.start(ctx.currentTime + when, offset);
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

  // ----------------------------------------------------------
  // Canvas Interaction (Drag, Set Start/End)
  // ----------------------------------------------------------
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
      if (sx >= l.x && sx <= l.x + l.w && sy >= l.y && sy <= l.y + l.h) {
        return l;
      }
    }
    return null;
  }

  overlay.addEventListener('mousedown', (e) => {
    const { x, y } = canvasToStage(e.clientX, e.clientY);
    const layer = getSelectedLayer();

    if (state.interactionMode === 'setStart' && layer) {
      layer.startX = x - layer.w / 2;
      layer.startY = y - layer.h / 2;
      state.interactionMode = null;
      overlay.classList.remove('setting-start');
      refreshAll();
      return;
    }

    if (state.interactionMode === 'setEnd' && layer) {
      layer.endX = x - layer.w / 2;
      layer.endY = y - layer.h / 2;
      state.interactionMode = null;
      overlay.classList.remove('setting-end');
      refreshAll();
      return;
    }

    // Normal click - select & start drag
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
      // Update property panel values without full refresh
      const xInput = propertyContent.querySelector('[data-prop="x"]');
      const yInput = propertyContent.querySelector('[data-prop="y"]');
      if (xInput) xInput.value = Math.round(layer.x);
      if (yInput) yInput.value = Math.round(layer.y);
    }
  });

  overlay.addEventListener('mouseup', () => {
    state.isDragging = false;
    overlay.classList.remove('dragging');
  });

  overlay.addEventListener('mouseleave', () => {
    state.isDragging = false;
    overlay.classList.remove('dragging');
  });

  // ----------------------------------------------------------
  // Duration Recording (button hold)
  // ----------------------------------------------------------
  const btnRecord = $('#btn-record-duration');

  btnRecord.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const layer = getSelectedLayer();
    if (!layer) { alert('先にレイヤーを選択してください'); return; }
    state.isRecording = true;
    state.recordStartTime = performance.now();
    btnRecord.classList.add('recording');
    durationDisplay.textContent = '計測中...';

    const updateTimer = () => {
      if (!state.isRecording) return;
      const elapsed = (performance.now() - state.recordStartTime) / 1000;
      durationDisplay.textContent = elapsed.toFixed(2) + '秒';
      requestAnimationFrame(updateTimer);
    };
    updateTimer();
  });

  const stopRecording = () => {
    if (!state.isRecording) return;
    state.isRecording = false;
    btnRecord.classList.remove('recording');
    const elapsed = (performance.now() - state.recordStartTime) / 1000;
    const duration = Math.round(elapsed * 100) / 100;
    durationDisplay.textContent = duration.toFixed(2) + '秒';

    const layer = getSelectedLayer();
    if (layer) {
      layer.animDuration = duration;
      refreshAll();
    }
  };

  btnRecord.addEventListener('mouseup', stopRecording);
  btnRecord.addEventListener('mouseleave', stopRecording);

  // Touch support for duration recording
  btnRecord.addEventListener('touchstart', (e) => {
    e.preventDefault();
    btnRecord.dispatchEvent(new MouseEvent('mousedown'));
  });
  btnRecord.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopRecording();
  });

  // ----------------------------------------------------------
  // Set Start / End buttons
  // ----------------------------------------------------------
  $('#btn-set-start').addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) { alert('先にレイヤーを選択してください'); return; }
    // Set current position as start
    layer.startX = layer.x;
    layer.startY = layer.y;
    refreshAll();
  });

  $('#btn-set-end').addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (!layer) { alert('先にレイヤーを選択してください'); return; }
    // Set current position as end
    layer.endX = layer.x;
    layer.endY = layer.y;
    refreshAll();
  });

  // ----------------------------------------------------------
  // File Import
  // ----------------------------------------------------------
  const fileImage = $('#file-image');
  const fileAudio = $('#file-audio');
  const fileProject = $('#file-project');

  $('#btn-add-layer').addEventListener('click', () => fileImage.click());

  fileImage.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      addLayer(file.name.replace(/\.[^.]+$/, ''), ev.target.result);
    };
    reader.readAsDataURL(file);
    fileImage.value = '';
  });

  // Audio import
  function addAudioTrack(file, type) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const audioCtx = getAudioCtx();
      const arrayBuffer = ev.target.result;
      try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        const track = {
          id: genId(),
          name: file.name.replace(/\.[^.]+$/, ''),
          audioBuffer,
          dataUrl: await fileToDataUrl(file),
          startTime: 0,
          volume: 1,
          duration: audioBuffer.duration,
        };
        if (type === 'bgm') state.bgmTracks.push(track);
        else if (type === 'sfx') state.sfxTracks.push(track);
        else state.voiceTracks.push(track);
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

  // Audio list UI
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
        timeInput.min = 0;
        timeInput.step = 0.1;
        timeInput.style.width = '50px';
        timeInput.title = '開始時間(秒)';
        timeInput.addEventListener('change', () => {
          t.startTime = parseFloat(timeInput.value) || 0;
          refreshTimeline();
        });

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
          if (type === 'bgm') state.bgmTracks = state.bgmTracks.filter((a) => a.id !== t.id);
          else if (type === 'sfx') state.sfxTracks = state.sfxTracks.filter((a) => a.id !== t.id);
          else state.voiceTracks = state.voiceTracks.filter((a) => a.id !== t.id);
          refreshAll();
        };

        li.appendChild(name);
        li.appendChild(timeInput);
        li.appendChild(volInput);
        li.appendChild(rm);
        listEl.appendChild(li);
      });
    };
    renderList(state.bgmTracks, $('#bgm-list'), 'bgm');
    renderList(state.sfxTracks, $('#sfx-list'), 'sfx');
    renderList(state.voiceTracks, $('#voice-list'), 'voice');
  }

  // ----------------------------------------------------------
  // Project Save / Load
  // ----------------------------------------------------------
  function serializeProject() {
    return JSON.stringify({
      version: 1,
      projectName: state.projectName,
      totalDuration: state.totalDuration,
      layers: state.layers.map((l) => ({
        id: l.id, name: l.name, imgSrc: l.imgSrc,
        visible: l.visible,
        x: l.x, y: l.y, w: l.w, h: l.h,
        rotation: l.rotation, opacity: l.opacity,
        scaleX: l.scaleX, scaleY: l.scaleY,
        startX: l.startX, startY: l.startY,
        endX: l.endX, endY: l.endY,
        animStart: l.animStart, animDuration: l.animDuration,
        easing: l.easing,
      })),
      bgmTracks: state.bgmTracks.map((t) => ({
        id: t.id, name: t.name, dataUrl: t.dataUrl,
        startTime: t.startTime, volume: t.volume, duration: t.duration,
      })),
      sfxTracks: state.sfxTracks.map((t) => ({
        id: t.id, name: t.name, dataUrl: t.dataUrl,
        startTime: t.startTime, volume: t.volume, duration: t.duration,
      })),
      voiceTracks: state.voiceTracks.map((t) => ({
        id: t.id, name: t.name, dataUrl: t.dataUrl,
        startTime: t.startTime, volume: t.volume, duration: t.duration,
      })),
      nextId: state.nextId,
    });
  }

  function saveProject() {
    const data = serializeProject();
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.projectName + '.animproj';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function loadProject(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      state.projectName = data.projectName || '新規プロジェクト';
      state.totalDuration = data.totalDuration || 10;
      state.nextId = data.nextId || 1;
      state.selectedLayerId = null;
      state.currentTime = 0;

      // Load layers
      state.layers = [];
      const layerPromises = (data.layers || []).map((ld) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            state.layers.push({
              ...ld, img, imgSrc: ld.imgSrc,
            });
            resolve();
          };
          img.onerror = () => resolve();
          img.src = ld.imgSrc;
        });
      });
      await Promise.all(layerPromises);
      // Restore order
      const idOrder = data.layers.map((l) => l.id);
      state.layers.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id));

      // Load audio tracks
      const loadAudioTracks = async (tracks) => {
        const audioCtx = getAudioCtx();
        const results = [];
        for (const td of (tracks || [])) {
          try {
            const resp = await fetch(td.dataUrl);
            const buf = await resp.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(buf);
            results.push({ ...td, audioBuffer });
          } catch (e) {
            results.push({ ...td, audioBuffer: null });
          }
        }
        return results;
      };

      state.bgmTracks = await loadAudioTracks(data.bgmTracks);
      state.sfxTracks = await loadAudioTracks(data.sfxTracks);
      state.voiceTracks = await loadAudioTracks(data.voiceTracks);

      totalDurationInput.value = state.totalDuration;
      $('#project-name').textContent = state.projectName;
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
    state.currentTime = 0;
    state.bgmTracks = [];
    state.sfxTracks = [];
    state.voiceTracks = [];
    state.nextId = 1;
    totalDurationInput.value = 10;
    $('#project-name').textContent = state.projectName;
    refreshAll();
  });

  // Project name rename
  $('#project-name').addEventListener('click', () => {
    const modal = $('#rename-modal');
    const input = $('#rename-input');
    input.value = state.projectName;
    modal.classList.remove('hidden');
    input.focus();
    input.select();
  });

  $('#btn-rename-ok').addEventListener('click', () => {
    const val = $('#rename-input').value.trim();
    if (val) {
      state.projectName = val;
      $('#project-name').textContent = val;
    }
    $('#rename-modal').classList.add('hidden');
  });
  $('#btn-rename-cancel').addEventListener('click', () => {
    $('#rename-modal').classList.add('hidden');
  });

  // ----------------------------------------------------------
  // Export (WebM via MediaRecorder)
  // ----------------------------------------------------------
  $('#btn-export').addEventListener('click', () => {
    $('#export-modal').classList.remove('hidden');
  });
  $('#btn-export-cancel').addEventListener('click', () => {
    $('#export-modal').classList.add('hidden');
    $('#export-progress').classList.add('hidden');
  });

  $('#btn-export-start').addEventListener('click', async () => {
    const resStr = $('#export-resolution').value;
    const [expW, expH] = resStr.split('x').map(Number);
    const fps = parseInt($('#export-fps').value);
    const format = $('#export-format').value;

    $('#btn-export-start').disabled = true;
    $('#export-progress').classList.remove('hidden');

    try {
      await exportVideo(expW, expH, fps, format);
    } catch (err) {
      alert('エクスポートに失敗しました: ' + err.message);
    }

    $('#btn-export-start').disabled = false;
  });

  async function exportVideo(width, height, fps, format) {
    // Create offscreen canvas
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d');

    const mimeType = format === 'mp4'
      ? (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/webm;codecs=vp9')
      : 'video/webm;codecs=vp9';

    // Setup audio context for offline rendering
    const audioCtx = getAudioCtx();
    const sampleRate = audioCtx.sampleRate;
    const totalSamples = Math.ceil(state.totalDuration * sampleRate);
    let offlineCtx = null;
    let renderedAudioBuffer = null;

    // Check if we have audio to mix
    const hasAudio = state.bgmTracks.length > 0 || state.sfxTracks.length > 0 || state.voiceTracks.length > 0;

    if (hasAudio) {
      offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
      const allTracks = [...state.bgmTracks, ...state.sfxTracks, ...state.voiceTracks];
      allTracks.forEach((t) => {
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

    // Use MediaRecorder with canvas stream + audio
    const stream = offCanvas.captureStream(fps);

    if (renderedAudioBuffer) {
      const liveAudioCtx = new AudioContext({ sampleRate });
      const src = liveAudioCtx.createBufferSource();
      src.buffer = renderedAudioBuffer;
      const dest = liveAudioCtx.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
      videoBitsPerSecond: 8000000,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const exportDone = new Promise((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();

    const totalFrames = Math.ceil(state.totalDuration * fps);
    const scaleX = width / 1280;
    const scaleY = height / 720;

    for (let frame = 0; frame <= totalFrames; frame++) {
      const t = frame / fps;
      state.currentTime = Math.min(t, state.totalDuration);

      // Render frame
      offCtx.clearRect(0, 0, width, height);
      offCtx.fillStyle = '#222';
      offCtx.fillRect(0, 0, width, height);

      for (let i = state.layers.length - 1; i >= 0; i--) {
        const layer = state.layers[i];
        if (!layer.visible || !layer.img) continue;

        let posX = layer.x;
        let posY = layer.y;

        if (layer.animDuration > 0 && layer.startX != null && layer.endX != null) {
          const t0 = layer.animStart;
          const t1 = layer.animStart + layer.animDuration;
          if (state.currentTime >= t0 && state.currentTime <= t1) {
            const raw = (state.currentTime - t0) / layer.animDuration;
            const easeFn = getEasing(layer.easing);
            const progress = easeFn(clamp(raw, 0, 1));
            posX = lerp(layer.startX, layer.endX, progress);
            posY = lerp(layer.startY, layer.endY, progress);
          } else if (state.currentTime > t1) {
            posX = layer.endX;
            posY = layer.endY;
          } else {
            posX = layer.startX;
            posY = layer.startY;
          }
        }

        offCtx.save();
        offCtx.globalAlpha = layer.opacity;
        offCtx.translate((posX + layer.w / 2) * scaleX, (posY + layer.h / 2) * scaleY);
        offCtx.rotate((layer.rotation * Math.PI) / 180);
        offCtx.scale(layer.scaleX, layer.scaleY);
        offCtx.drawImage(layer.img, (-layer.w / 2) * scaleX, (-layer.h / 2) * scaleY, layer.w * scaleX, layer.h * scaleY);
        offCtx.restore();
      }

      // Update progress
      const progress = Math.round((frame / totalFrames) * 100);
      $('#export-progress-bar').value = progress;
      $('#export-progress-text').textContent = progress + '%';

      // Yield to browser
      await new Promise((r) => setTimeout(r, 0));
    }

    recorder.stop();
    await exportDone;

    // Download
    const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.projectName + '.' + ext;
    a.click();
    URL.revokeObjectURL(a.href);

    // Reset
    state.currentTime = 0;
    updatePlayhead();
    render();
    $('#export-modal').classList.add('hidden');
    $('#export-progress').classList.add('hidden');
  }

  // ----------------------------------------------------------
  // Playback Controls
  // ----------------------------------------------------------
  $('#btn-play').addEventListener('click', play);
  $('#btn-pause').addEventListener('click', pause);
  $('#btn-stop').addEventListener('click', stop);

  totalDurationInput.addEventListener('change', () => {
    state.totalDuration = parseFloat(totalDurationInput.value) || 10;
    refreshTimeline();
  });

  // Audio panel toggle
  $('#audio-panel-toggle').addEventListener('click', () => {
    $('#audio-panel').classList.toggle('collapsed');
  });

  // ----------------------------------------------------------
  // Keyboard Shortcuts
  // ----------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); state.isPlaying ? pause() : play(); }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (state.selectedLayerId) removeLayer(state.selectedLayerId);
    }
  });

  // ----------------------------------------------------------
  // Refresh All
  // ----------------------------------------------------------
  function refreshAll() {
    refreshLayerList();
    refreshProperties();
    refreshTimeline();
    refreshAudioLists();
    render();
  }

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  function init() {
    resizeCanvas();
    window.addEventListener('resize', () => { resizeCanvas(); render(); });
    refreshAll();
  }

  init();
})();
