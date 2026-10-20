/* «Пивной забег» — a small endless runner for the Tarussky Gus brewery.
   No dependencies, no external assets: everything is drawn on canvas. */
(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

  const stage = $('[data-stage]');
  const overlay = $('[data-overlay]');
  const overlayEyebrow = $('[data-overlay-eyebrow]');
  const overlayTitle = $('[data-overlay-title]');
  const overlayText = $('[data-overlay-text]');
  const overlayResult = $('[data-overlay-result]');
  const startButton = $('[data-start]');
  const startLabel = $('[data-start-label]');
  const resultScore = $('[data-result-score]');
  const resultBottles = $('[data-result-bottles]');
  const scoreEl = $('[data-score]');
  const bottlesEl = $('[data-bottles]');
  const bestEl = $('[data-best]');
  const statusEl = $('[data-game-status]');
  const soundButton = $('[data-sound]');
  const pauseButtons = $$('[data-pause]');

  const BEST_KEY = 'tg-game-best';
  const SOUND_KEY = 'tg-game-sound';
  const COLORS = {
    forest: '#0a1e17',
    forest2: '#153a2b',
    forest3: '#244a37',
    cream: '#f5f0e3',
    cream2: '#fbf8f0',
    amber: '#e2a94a',
    amberDark: '#c98b2f',
    copper: '#b97a3e',
    wood: '#a8743f',
    woodDark: '#6b4728',
    orange: '#d98a35',
    sky1: '#f8ecd4',
    sky2: '#f1d9ae',
    sky3: '#e7c58d',
    hillFar: '#b8c4a3',
    hillNear: '#93a782',
    river: '#93b5aa',
    ground: '#1b2b22',
    groundTop: '#41543a',
  };

  const storage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (error) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (error) { /* private mode */ }
    },
  };

  const state = {
    mode: 'idle',
    W: 0,
    H: 0,
    groundY: 0,
    dpr: 1,
    scroll: 0,
    speed: 0,
    elapsed: 0,
    score: 0,
    bottles: 0,
    best: Number(storage.get(BEST_KEY)) || 0,
    spawnTimer: 1.2,
    bottleTimer: 1.5,
    time: 0,
    last: 0,
    shake: 0,
    flash: 0,
    dustTimer: 0,
    hudScore: -1,
    hudBottles: -1,
    hudBest: -1,
  };

  const goose = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    vy: 0,
    onGround: true,
    run: 0,
    jumpBuffer: 0,
  };

  const obstacles = [];
  const bottleItems = [];
  const particles = [];
  const floaters = [];
  let clouds = [];

  let audioCtx = null;
  let soundOn = storage.get(SOUND_KEY) === '1';

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const easeOut = (value) => 1 - (1 - value) * (1 - value);

  function announce(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function updateSoundButton() {
    if (!soundButton) return;
    soundButton.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    soundButton.setAttribute('aria-label', soundOn ? 'Выключить звук' : 'Включить звук');
    soundButton.title = soundOn ? 'Выключить звук' : 'Включить звук';
  }

  function ensureAudio() {
    if (!soundOn) return null;
    try {
      if (!audioCtx) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return null;
        audioCtx = new AudioCtor();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (error) {
      return null;
    }
  }

  function tone(from, to, duration, type = 'sine', volume = 0.04) {
    if (!soundOn) return;
    const audio = ensureAudio();
    if (!audio) return;
    try {
      const now = audio.currentTime;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch (error) {
      /* audio is optional */
    }
  }

  function playJump() { tone(360, 620, 0.11, 'triangle', 0.035); }
  function playCollect() {
    tone(880, 1180, 0.08, 'sine', 0.035);
    window.setTimeout(() => tone(1320, 1600, 0.08, 'sine', 0.025), 55);
  }
  function playHit() { tone(160, 55, 0.32, 'sawtooth', 0.05); }

  function setupClouds() {
    const count = clamp(Math.round(state.W / 230), 3, 7);
    clouds = Array.from({ length: count }, () => ({
      x: rand(0, state.W + 160),
      y: rand(state.H * 0.08, state.H * 0.3),
      scale: rand(0.65, 1.25),
      depth: rand(0.08, 0.2),
    }));
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const widthChanged = Math.abs(rect.width - state.W) > 2;
    if (state.mode === 'playing' && widthChanged) pauseGame();

    state.W = rect.width;
    state.H = rect.height;
    state.dpr = dpr;
    state.groundY = state.H * 0.8;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    goose.h = clamp(state.H * 0.145, 28, 72);
    goose.w = goose.h * 1.25;
    goose.x = state.W * 0.15;
    if (state.mode === 'idle' || state.mode === 'over' || !goose.y) {
      goose.y = state.groundY - goose.h;
    } else {
      goose.y = Math.min(goose.y, state.groundY - goose.h);
    }

    if (!clouds.length || widthChanged) setupClouds();
  }

  function resetGame() {
    obstacles.length = 0;
    bottleItems.length = 0;
    particles.length = 0;
    floaters.length = 0;
    state.score = 0;
    state.bottles = 0;
    state.elapsed = 0;
    state.speed = state.H * 0.62;
    state.spawnTimer = 1.15;
    state.bottleTimer = 1.5;
    state.shake = 0;
    state.flash = 0;
    state.dustTimer = 0;
    goose.y = state.groundY - goose.h;
    goose.vy = 0;
    goose.onGround = true;
    goose.run = 0;
    goose.jumpBuffer = 0;
    updateHud(true);
  }

  function updateHud(force = false) {
    const score = Math.floor(state.score);
    const best = Math.max(state.best, score);
    if (force || score !== state.hudScore) {
      if (scoreEl) scoreEl.textContent = score.toLocaleString('ru-RU');
      state.hudScore = score;
    }
    if (force || state.bottles !== state.hudBottles) {
      if (bottlesEl) bottlesEl.textContent = String(state.bottles);
      state.hudBottles = state.bottles;
    }
    if (force || best !== state.hudBest) {
      if (bestEl) bestEl.textContent = best.toLocaleString('ru-RU');
      state.hudBest = best;
    }
  }

  function showOverlay({ eyebrow, title, text, button, result = false, hint }) {
    if (!overlay) return;
    if (overlayEyebrow) overlayEyebrow.textContent = eyebrow;
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayText) overlayText.textContent = text;
    if (startLabel) startLabel.textContent = button;
    if (overlayResult) overlayResult.hidden = !result;
    if (result) {
      if (resultScore) resultScore.textContent = Math.floor(state.score).toLocaleString('ru-RU');
      if (resultBottles) resultBottles.textContent = String(state.bottles);
    }
    const hintEl = $('.game-overlay__hint', overlay);
    if (hintEl && hint) hintEl.textContent = hint;
    overlay.hidden = false;
  }

  function hideOverlay() {
    if (overlay) overlay.hidden = true;
  }

  function updatedControls() {
    const canPause = state.mode === 'playing' || state.mode === 'paused';
    pauseButtons.forEach((button) => {
      button.disabled = !canPause;
      if (button.classList.contains('game-icon-btn')) {
        button.setAttribute('aria-label', state.mode === 'paused' ? 'Продолжить' : 'Поставить на паузу');
        button.title = state.mode === 'paused' ? 'Продолжить' : 'Пауза';
      }
    });
  }

  function startGame() {
    if (state.mode === 'paused') {
      resumeGame();
      return;
    }
    resetGame();
    state.mode = 'playing';
    state.last = performance.now();
    hideOverlay();
    updatedControls();
    announce('Забег начался. Прыгайте через препятствия и собирайте бутылки.');
    if (canvas.focus) canvas.focus({ preventScroll: true });
    if (soundOn) tone(420, 620, 0.12, 'triangle', 0.035);
    if (window.matchMedia('(max-width: 700px)').matches && stage) {
      window.setTimeout(() => stage.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
    }
  }

  function pauseGame() {
    if (state.mode !== 'playing') return;
    state.mode = 'paused';
    showOverlay({
      eyebrow: 'Передышка',
      title: 'Пауза',
      text: 'Гусь переводит дыхание. Продолжите, когда будете готовы.',
      button: 'Продолжить',
      hint: 'P или Esc — продолжить',
    });
    updatedControls();
    announce('Игра на паузе.');
  }

  function resumeGame() {
    if (state.mode !== 'paused') return;
    state.mode = 'playing';
    state.last = performance.now();
    hideOverlay();
    updatedControls();
    announce('Продолжаем забег.');
    if (canvas.focus) canvas.focus({ preventScroll: true });
  }

  function endGame() {
    state.mode = 'over';
    state.best = Math.max(state.best, Math.floor(state.score));
    storage.set(BEST_KEY, String(state.best));
    state.flash = 0.45;
    state.shake = 0.3;
    for (let i = 0; i < 16; i += 1) {
      particles.push({
        x: goose.x + goose.w * 0.5,
        y: goose.y + goose.h * 0.5,
        vx: rand(-state.W * 0.18, state.W * 0.12),
        vy: rand(-state.H * 0.5, -state.H * 0.12),
        life: rand(0.5, 1),
        maxLife: 1,
        size: rand(2, 5),
        color: i % 3 === 0 ? COLORS.amber : COLORS.cream,
        gravity: state.H * 1.2,
      });
    }
    playHit();
    updateHud(true);
    showOverlay({
      eyebrow: 'Забег окончен',
      title: 'Гусь споткнулся',
      text: 'Ничего страшного: гусь отряхнулся и готов снова. Главное — не расплескать пиво.',
      button: 'Ещё раз',
      result: true,
      hint: 'Пробел или тап — новый забег',
    });
    updatedControls();
    announce(`Забег окончен. Счёт ${Math.floor(state.score)}. Собрано бутылок: ${state.bottles}.`);
    window.setTimeout(() => {
      if (state.mode === 'over' && startButton) startButton.focus({ preventScroll: true });
    }, 120);
  }

  function jump() {
    if (state.mode === 'idle' || state.mode === 'over') {
      startGame();
      return;
    }
    if (state.mode === 'paused') {
      resumeGame();
      return;
    }
    if (state.mode !== 'playing') return;

    // A tap slightly before touchdown is remembered and fires immediately
    // on landing, so quick mobile taps never feel ignored.
    if (!goose.onGround) {
      goose.jumpBuffer = 0.16;
      return;
    }

    doJump();
  }

  function doJump() {
    goose.vy = -state.H * 1.78;
    goose.onGround = false;
    goose.jumpBuffer = 0;
    playJump();
    if (navigator.vibrate) {
      try { navigator.vibrate(8); } catch (error) { /* optional */ }
    }
    for (let i = 0; i < 5; i += 1) {
      particles.push({
        x: goose.x + goose.w * 0.35 + rand(-4, 6),
        y: state.groundY - 1,
        vx: rand(-state.W * 0.03, state.W * 0.005),
        vy: rand(-state.H * 0.1, -state.H * 0.02),
        life: rand(0.2, 0.42),
        maxLife: 0.5,
        size: rand(1.5, 3),
        color: 'rgba(245, 240, 227, 0.7)',
        gravity: state.H * 0.35,
      });
    }
  }

  function togglePause() {
    if (state.mode === 'playing') pauseGame();
    else if (state.mode === 'paused') resumeGame();
  }

  function spawnObstacle() {
    const unit = state.H * 0.13;
    const type = ['crate', 'keg', 'fence'][Math.floor(Math.random() * 3)];
    let w = unit;
    let h = unit;
    if (type === 'keg') {
      w = unit * 0.86;
      h = unit * 1.05;
    } else if (type === 'fence') {
      w = unit * 0.62;
      h = unit * 1.2;
    } else {
      w = unit * (0.9 + Math.random() * 0.1);
      h = unit * (0.82 + Math.random() * 0.14);
    }
    obstacles.push({ type, x: state.W + 24, w, h, seed: Math.random() });
  }

  function spawnBottle() {
    const h = state.H * 0.075;
    const w = h * 0.42;
    const minY = state.groundY - goose.h - state.H * 0.16 - h;
    const maxY = state.groundY - goose.h - state.H * 0.035 - h;
    bottleItems.push({
      x: state.W + 30,
      y: rand(minY, maxY),
      w,
      h,
      phase: rand(0, Math.PI * 2),
      collected: false,
    });
  }

  function addFloater(text, x, y, color = COLORS.amber) {
    floaters.push({ text, x, y, life: 0.9, maxLife: 0.9, color });
  }

  function collectBottle(item) {
    item.collected = true;
    state.bottles += 1;
    state.score += 10;
    addFloater('+10', item.x + item.w * 0.5, item.y - 4);
    playCollect();
    for (let i = 0; i < 8; i += 1) {
      particles.push({
        x: item.x + item.w * 0.5,
        y: item.y + item.h * 0.5,
        vx: rand(-state.W * 0.07, state.W * 0.07),
        vy: rand(-state.H * 0.23, -state.H * 0.04),
        life: rand(0.35, 0.7),
        maxLife: 0.7,
        size: rand(1.5, 3.5),
        color: i % 2 ? COLORS.amber : COLORS.cream,
        gravity: state.H * 0.5,
      });
    }
    announce(`Бутылка собрана. Счёт ${Math.floor(state.score)}.`);
  }

  function update(dt) {
    state.elapsed += dt;
    state.speed = state.H * (0.62 + Math.min(0.5, state.elapsed * 0.015));
    state.scroll += state.speed * dt;
    state.score += dt * 9;

    if (goose.jumpBuffer > 0) goose.jumpBuffer = Math.max(0, goose.jumpBuffer - dt);

    if (!goose.onGround) {
      goose.vy += state.H * 4.8 * dt;
      goose.y += goose.vy * dt;
      if (goose.y >= state.groundY - goose.h) {
        goose.y = state.groundY - goose.h;
        goose.vy = 0;
        goose.onGround = true;
        if (goose.jumpBuffer > 0) doJump();
      }
    } else {
      goose.run += dt * (7 + state.speed / state.H * 4);
      state.dustTimer -= dt;
      if (state.dustTimer <= 0) {
        state.dustTimer = 0.13;
        particles.push({
          x: goose.x + goose.w * 0.18,
          y: state.groundY - 2,
          vx: rand(-state.W * 0.025, -state.W * 0.005),
          vy: rand(-state.H * 0.06, -state.H * 0.01),
          life: rand(0.25, 0.5),
          maxLife: 0.5,
          size: rand(1, 2.6),
          color: 'rgba(70, 86, 65, 0.5)',
          gravity: state.H * 0.2,
        });
      }
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = rand(1.05, 1.7);
    }

    state.bottleTimer -= dt;
    if (state.bottleTimer <= 0) {
      spawnBottle();
      state.bottleTimer = rand(1.3, 2.4);
    }

    const dx = state.speed * dt;
    obstacles.forEach((item) => { item.x -= dx; });
    bottleItems.forEach((item) => { item.x -= dx; });

    const gooseBox = {
      x: goose.x + goose.w * 0.16,
      y: goose.y + goose.h * 0.12,
      w: goose.w * 0.68,
      h: goose.h * 0.78,
    };

    for (let i = obstacles.length - 1; i >= 0; i -= 1) {
      const item = obstacles[i];
      if (item.x + item.w < -30) {
        obstacles.splice(i, 1);
        continue;
      }
      const obstacleTop = state.groundY - item.h;
      if (
        gooseBox.x < item.x + item.w - 3 &&
        gooseBox.x + gooseBox.w > item.x + 3 &&
        gooseBox.y < state.groundY &&
        gooseBox.y + gooseBox.h > obstacleTop
      ) {
        endGame();
        return;
      }
    }

    for (let i = bottleItems.length - 1; i >= 0; i -= 1) {
      const item = bottleItems[i];
      if (item.x + item.w < -30) {
        bottleItems.splice(i, 1);
        continue;
      }
      const bob = Math.sin(state.time * 3 + item.phase) * 2;
      if (
        gooseBox.x < item.x + item.w &&
        gooseBox.x + gooseBox.w > item.x &&
        gooseBox.y < item.y + item.h + bob &&
        gooseBox.y + gooseBox.h > item.y + bob
      ) {
        collectBottle(item);
        bottleItems.splice(i, 1);
      }
    }

    if (state.score > state.best) state.best = Math.floor(state.score);
    updateHud();
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      f.life -= dt;
      f.y -= 30 * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
    state.flash = Math.max(0, state.flash - dt * 1.9);
    state.shake = Math.max(0, state.shake - dt * 2.8);
  }

  function drawRoundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawCloud(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(255, 250, 238, 0.78)';
    drawRoundRect(0, 0, 90, 24, 12);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(24, 4, 17, Math.PI, 0);
    ctx.arc(50, 0, 21, Math.PI, 0);
    ctx.arc(72, 6, 14, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(226, 169, 74, 0.13)';
    drawRoundRect(8, 15, 76, 5, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawHillLayer(baseOffset, amplitude, color, speedFactor) {
    const offset = state.scroll * speedFactor;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, state.groundY);
    for (let x = 0; x <= state.W + 40; x += 30) {
      const y =
        state.groundY -
        state.H * baseOffset -
        Math.sin((x + offset) / 130) * state.H * amplitude -
        Math.sin((x + offset) / 47) * state.H * amplitude * 0.32;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(state.W, state.groundY);
    ctx.closePath();
    ctx.fill();
  }

  function drawBrewery(x, baseY, scale) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#7d8e78';
    ctx.fillRect(0, -52, 98, 52);
    ctx.beginPath();
    ctx.moveTo(-8, -52);
    ctx.lineTo(30, -76);
    ctx.lineTo(66, -52);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(18, -82, 12, 32);
    ctx.fillRect(18, -91, 12, 7);
    ctx.fillStyle = 'rgba(226, 169, 74, 0.72)';
    [12, 38, 64].forEach((wx) => {
      ctx.fillRect(wx, -35, 8, 10);
      ctx.fillRect(wx, -16, 8, 10);
    });
    ctx.fillStyle = 'rgba(245, 240, 227, 0.2)';
    ctx.beginPath();
    ctx.arc(24, -98, 6, 0, Math.PI * 2);
    ctx.arc(34, -108, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBackground() {
    const { W, H, groundY } = state;
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, COLORS.sky1);
    sky.addColorStop(0.55, COLORS.sky2);
    sky.addColorStop(1, COLORS.sky3);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY + 2);

    const sunX = W * 0.82;
    const sunY = H * 0.2;
    const sunR = H * 0.055;
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR * 4.2);
    glow.addColorStop(0, 'rgba(255, 216, 145, 0.7)');
    glow.addColorStop(1, 'rgba(255, 216, 145, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6b35f';
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    clouds.forEach((cloud) => {
      const total = W + 200;
      const x = ((cloud.x - state.scroll * cloud.depth) % total + total) % total - 100;
      drawCloud(x, cloud.y, cloud.scale);
    });

    drawHillLayer(0.12, 0.035, COLORS.hillFar, 0.04);
    drawHillLayer(0.075, 0.045, COLORS.hillNear, 0.09);

    ctx.fillStyle = COLORS.river;
    ctx.fillRect(0, groundY - H * 0.055, W, H * 0.055);
    ctx.strokeStyle = 'rgba(245, 240, 227, 0.28)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, groundY - H * 0.047 + i * H * 0.014);
      for (let x = 0; x <= W; x += 28) {
        ctx.lineTo(x, groundY - H * 0.047 + i * H * 0.014 + Math.sin((x + state.scroll * 0.4) / 36) * 1.4);
      }
      ctx.stroke();
    }

    const breweryBase = groundY - H * 0.04;
    const step = Math.max(360, W * 0.55);
    const offset = ((state.scroll * 0.12) % step + step) % step;
    for (let x = -step - offset; x < W + step; x += step) {
      drawBrewery(x, breweryBase, clamp(H / 420, 0.55, 1.2));
    }

    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = COLORS.groundTop;
    ctx.fillRect(0, groundY, W, Math.max(3, H * 0.012));

    const dashGap = Math.max(30, H * 0.12);
    const dashOffset = state.scroll % dashGap;
    ctx.fillStyle = 'rgba(245, 240, 227, 0.16)';
    for (let x = -dashGap; x < W + dashGap; x += dashGap) {
      ctx.fillRect(x - dashOffset, groundY + H * 0.055, dashGap * 0.42, Math.max(1, H * 0.006));
    }

    ctx.fillStyle = 'rgba(145, 164, 119, 0.55)';
    for (let x = -dashGap; x < W + dashGap; x += dashGap * 1.7) {
      const gx = x - (state.scroll % (dashGap * 1.7));
      ctx.fillRect(gx, groundY - 2, 2, 5);
      ctx.fillRect(gx + 4, groundY - 4, 2, 7);
    }
  }

  function drawCrate(item) {
    const x = item.x;
    const y = state.groundY - item.h;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 30, 23, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x + item.w * 0.5, state.groundY + 2, item.w * 0.55, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.wood;
    drawRoundRect(x, y, item.w, item.h, 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.woodDark;
    ctx.lineWidth = Math.max(1, item.w * 0.045);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(107, 71, 40, 0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + item.h * 0.35);
    ctx.lineTo(x + item.w - 3, y + item.h * 0.35);
    ctx.moveTo(x + 3, y + item.h * 0.7);
    ctx.lineTo(x + item.w - 3, y + item.h * 0.7);
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + item.w - 4, y + item.h - 4);
    ctx.moveTo(x + item.w - 4, y + 4);
    ctx.lineTo(x + 4, y + item.h - 4);
    ctx.stroke();
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(x + item.w * 0.18, y + item.h * 0.18, 2, 2);
    ctx.fillRect(x + item.w * 0.8, y + item.h * 0.18, 2, 2);
    ctx.restore();
  }

  function drawKeg(item) {
    const x = item.x;
    const w = item.w;
    const h = item.h;
    const y = state.groundY - h;
    const r = Math.max(3, w * 0.12);
    ctx.save();
    ctx.fillStyle = 'rgba(10, 30, 23, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, state.groundY + 2, w * 0.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.copper;
    drawRoundRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.9, r);
    ctx.fill();
    ctx.fillStyle = '#d49a55';
    drawRoundRect(x + w * 0.14, y + h * 0.03, w * 0.72, h * 0.12, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(78, 47, 22, 0.7)';
    ctx.lineWidth = Math.max(1, h * 0.025);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h * 0.3);
    ctx.lineTo(x + w * 0.92, y + h * 0.3);
    ctx.moveTo(x + w * 0.08, y + h * 0.72);
    ctx.lineTo(x + w * 0.92, y + h * 0.72);
    ctx.stroke();
    ctx.fillStyle = '#6b4728';
    ctx.fillRect(x + w * 0.78, y + h * 0.44, w * 0.24, Math.max(2, h * 0.06));
    ctx.fillStyle = 'rgba(245, 240, 227, 0.25)';
    ctx.fillRect(x + w * 0.2, y + h * 0.18, Math.max(1, w * 0.06), h * 0.38);
    ctx.restore();
  }

  function drawFence(item) {
    const x = item.x;
    const w = item.w;
    const h = item.h;
    const y = state.groundY - h;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 30, 23, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, state.groundY + 2, w * 0.7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6e5738';
    ctx.fillRect(x, y + h * 0.22, w, h * 0.1);
    ctx.fillRect(x, y + h * 0.55, w, h * 0.1);
    const postW = w * 0.24;
    [0.04, 0.38, 0.72].forEach((offset) => {
      ctx.fillStyle = '#8a6b42';
      ctx.beginPath();
      ctx.moveTo(x + w * offset, y);
      ctx.lineTo(x + w * offset + postW, y);
      ctx.lineTo(x + w * offset + postW, y + h);
      ctx.lineTo(x + w * offset, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w * offset, y);
      ctx.lineTo(x + w * offset + postW * 0.5, y - h * 0.1);
      ctx.lineTo(x + w * offset + postW, y);
      ctx.closePath();
      ctx.fillStyle = '#a17e4d';
      ctx.fill();
    });
    ctx.restore();
  }

  function drawBottle(item) {
    const bob = Math.sin(state.time * 3 + item.phase) * 2;
    const x = item.x;
    const y = item.y + bob;
    const w = item.w;
    const h = item.h;
    ctx.save();
    ctx.shadowColor = 'rgba(226, 169, 74, 0.45)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(226, 169, 74, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.9, h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#b9762a';
    drawRoundRect(x + w * 0.2, y + h * 0.28, w * 0.6, h * 0.62, w * 0.14);
    ctx.fill();
    ctx.fillStyle = '#d29238';
    ctx.fillRect(x + w * 0.38, y + h * 0.08, w * 0.24, h * 0.25);
    ctx.fillStyle = COLORS.forest2;
    ctx.fillRect(x + w * 0.34, y + h * 0.02, w * 0.32, h * 0.09);
    ctx.fillStyle = COLORS.cream;
    drawRoundRect(x + w * 0.27, y + h * 0.46, w * 0.46, h * 0.24, 1);
    ctx.fill();
    ctx.fillStyle = COLORS.forest2;
    ctx.fillRect(x + w * 0.33, y + h * 0.52, w * 0.34, Math.max(1, h * 0.025));
    ctx.fillRect(x + w * 0.33, y + h * 0.58, w * 0.22, Math.max(1, h * 0.025));
    ctx.fillStyle = 'rgba(255, 245, 215, 0.55)';
    ctx.fillRect(x + w * 0.3, y + h * 0.3, Math.max(1, w * 0.07), h * 0.34);
    ctx.restore();
  }

  function drawGoose() {
    const scale = goose.h / 52;
    const airborne = !goose.onGround;
    const heightAbove = Math.max(0, state.groundY - (goose.y + goose.h));
    const shadowAlpha = 0.22 * (1 - Math.min(1, heightAbove / (state.H * 0.55)));

    ctx.save();
    ctx.fillStyle = `rgba(10, 30, 23, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(goose.x + goose.w * 0.45, state.groundY + 1, goose.w * 0.4, Math.max(2, state.H * 0.008), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const bob = goose.onGround && state.mode === 'playing' ? Math.abs(Math.sin(goose.run * 2)) * 1.2 : 0;
    const flap = airborne ? Math.sin(state.time * 18) * 0.45 : Math.sin(goose.run) * 0.12;

    ctx.save();
    ctx.translate(goose.x, goose.y + bob);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#e8dfcb';
    ctx.beginPath();
    ctx.moveTo(5, 33);
    ctx.lineTo(16, 27);
    ctx.lineTo(18, 38);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fbf7eb';
    ctx.beginPath();
    ctx.ellipse(30, 33, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ece3d1';
    ctx.beginPath();
    ctx.ellipse(32, 37, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(27, 32);
    ctx.rotate(-0.15 + flap);
    ctx.fillStyle = '#e5dcc8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(107, 71, 40, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, 1);
    ctx.quadraticCurveTo(0, 4, 8, 1);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#fbf7eb';
    drawRoundRect(37, 13, 10, 22, 4);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(45, 11, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.orange;
    ctx.beginPath();
    ctx.moveTo(52, 8);
    ctx.lineTo(63, 12);
    ctx.lineTo(52, 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#8f3f24';
    ctx.beginPath();
    ctx.moveTo(52, 12);
    ctx.lineTo(63, 12);
    ctx.lineTo(52, 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLORS.forest;
    ctx.beginPath();
    ctx.arc(48, 9.5, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(48.6, 8.9, 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(37, 21, 10, 4);
    ctx.beginPath();
    ctx.moveTo(46, 21);
    ctx.quadraticCurveTo(55, 18 + Math.sin(state.time * 12) * 2, 63, 22);
    ctx.lineTo(58, 25);
    ctx.quadraticCurveTo(52, 23, 46, 25);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = COLORS.orange;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    const stride = goose.onGround ? Math.sin(goose.run * 2) * 3.4 : 0;
    if (airborne) {
      ctx.beginPath();
      ctx.moveTo(23, 42);
      ctx.lineTo(19, 47);
      ctx.moveTo(34, 42);
      ctx.lineTo(38, 47);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(23, 42);
      ctx.lineTo(21 + stride, 50);
      ctx.moveTo(34, 42);
      ctx.lineTo(36 - stride, 50);
      ctx.stroke();
    }
    ctx.lineWidth = 2.4;
    if (airborne) {
      ctx.beginPath();
      ctx.moveTo(19, 47);
      ctx.lineTo(24, 49);
      ctx.moveTo(38, 47);
      ctx.lineTo(33, 49);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(21 + stride, 50);
      ctx.lineTo(26 + stride, 50);
      ctx.moveTo(36 - stride, 50);
      ctx.lineTo(41 - stride, 50);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEffects() {
    particles.forEach((p) => {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 13px Manrope, sans-serif';
    floaters.forEach((f) => {
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  function draw() {
    if (!state.W || !state.H) return;
    ctx.save();
    if (state.shake > 0) {
      const amount = state.shake * 9;
      ctx.translate(rand(-amount, amount), rand(-amount, amount));
    }
    drawBackground();

    bottleItems.forEach(drawBottle);
    obstacles.forEach((item) => {
      if (item.type === 'crate') drawCrate(item);
      else if (item.type === 'keg') drawKeg(item);
      else drawFence(item);
    });
    drawGoose();
    drawEffects();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(245, 240, 227, ${state.flash * 0.45})`;
      ctx.fillRect(0, 0, state.W, state.H);
    }
    ctx.restore();
  }

  function loop(timestamp) {
    const dt = Math.min(0.05, (timestamp - state.last) / 1000 || 0);
    state.last = timestamp;
    state.time += dt;

    if (state.mode === 'playing') update(dt);
    else if (state.mode === 'idle') {
      state.scroll += state.H * 0.012 * dt;
      goose.run += dt * 5;
    }
    updateEffects(dt);
    draw();
    window.requestAnimationFrame(loop);
  }

  function bindEvents() {
    if (startButton) {
      startButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.mode === 'paused') resumeGame();
        else startGame();
      });
    }

    if (stage) {
      stage.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button, a')) return;
        event.preventDefault();
        if (state.mode === 'playing') jump();
        else if (state.mode === 'paused') resumeGame();
        else startGame();
      });
    }


    pauseButtons.forEach((button) => {
      button.addEventListener('click', () => togglePause());
    });

    if (soundButton) {
      soundButton.addEventListener('click', () => {
        soundOn = !soundOn;
        storage.set(SOUND_KEY, soundOn ? '1' : '0');
        updateSoundButton();
        if (soundOn) tone(520, 720, 0.09, 'sine', 0.03);
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      const target = event.target;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return;
      }
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
        if (target && target.closest && target.closest('button, a')) return;
        event.preventDefault();
        jump();
        return;
      }
      if (event.code === 'KeyP' || event.code === 'Escape') {
        if (target && target.closest && target.closest('input, textarea, select')) return;
        if (state.mode === 'playing' || state.mode === 'paused') {
          event.preventDefault();
          togglePause();
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.mode === 'playing') pauseGame();
    });

    window.addEventListener('resize', resizeCanvas);
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(resizeCanvas);
      observer.observe(canvas);
    }
  }

  function init() {
    updateSoundButton();
    resizeCanvas();
    state.mode = 'idle';
    hideOverlay();
    showOverlay({
      eyebrow: 'Секретный уровень',
      title: 'Готовы к забегу?',
      text: 'Прыгайте через препятствия и собирайте бутылки. Чем дальше — тем быстрее.',
      button: 'Начать забег',
      result: false,
      hint: 'Пробел, ↑ или тап по полю',
    });
    updateHud(true);
    updatedControls();
    bindEvents();
    state.last = performance.now();
    window.requestAnimationFrame(loop);
  }

  init();
})();
