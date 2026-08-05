import './proto2d.css';

// A throwaway prototype answering one question: does a painted, scrolling
// background actually deliver the concept-art look in motion? Everything that
// is not the background is a deliberate placeholder.

// One sheet holding every act side by side. Cropping the panel at draw time
// means no image tooling in the pipeline — swap the sheet and it just works.
const LEVEL_ART = '/concept-art/level/acts-composite.png';
const ACT_COUNT = 3;
const SCROLL_SPEED = 90; // world pixels per second at a 1080-tall canvas
const PLAY_ASPECT = 9 / 16;

interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alive: boolean;
  hue?: number;
  phase?: number;
}

const canvas = document.querySelector<HTMLCanvasElement>('#proto-canvas')!;
const fpsLabel = document.querySelector<HTMLElement>('#proto-fps')!;
const missingPanel = document.querySelector<HTMLElement>('#proto-missing')!;
const context = canvas.getContext('2d')!;

const keys = new Set<string>();
let levelArt: HTMLImageElement | null = null;
let scrollOffset = 0;
let mirrorTile = true;
let paused = false;
let act = 0;

const player = { x: 0.5, y: 0.78, cooldown: 0 };
const bullets: Entity[] = [];
const enemies: Entity[] = [];
let enemyTimer = 0;

function loadLevelArt(): void {
  const image = new Image();
  image.addEventListener('load', () => {
    levelArt = image;
    missingPanel.hidden = true;
  });
  image.addEventListener('error', () => {
    missingPanel.hidden = false;
  });
  image.src = LEVEL_ART;
}

function resize(): void {
  const height = window.innerHeight;
  const width = Math.min(window.innerWidth, Math.round(height * PLAY_ASPECT));
  const ratio = Math.min(window.devicePixelRatio, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

// Mirror-tiling is the whole trick: drawing the strip, then a vertically
// flipped copy above it, makes ANY image loop with no seam. The cost is that
// the mirrored pass is visibly a reflection, which a purpose-drawn tileable
// strip would avoid.
function drawBackground(width: number, height: number): void {
  if (!levelArt) {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#241a4a');
    gradient.addColorStop(1, '#8c4326');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    return;
  }

  const panelWidth = levelArt.width / ACT_COUNT;
  const sourceX = act * panelWidth;
  const stripHeight = levelArt.height * (width / panelWidth);
  const cycle = mirrorTile ? stripHeight * 2 : stripHeight;
  const start = -(scrollOffset % cycle);

  for (let y = start - cycle; y < height + cycle; y += cycle) {
    context.drawImage(levelArt, sourceX, 0, panelWidth, levelArt.height, 0, y, width, stripHeight);
    if (!mirrorTile) continue;
    context.save();
    context.translate(0, y + stripHeight * 2);
    context.scale(1, -1);
    context.drawImage(levelArt, sourceX, 0, panelWidth, levelArt.height, 0, 0, width, stripHeight);
    context.restore();
  }
}

function drawPlayer(width: number, height: number): void {
  const x = player.x * width;
  const y = player.y * height;
  const size = height * 0.045;

  context.save();
  context.translate(x, y);
  context.fillStyle = 'rgba(12, 6, 20, 0.32)';
  context.beginPath();
  context.ellipse(0, size * 0.62, size * 0.52, size * 0.2, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#f4d98a';
  context.strokeStyle = '#2b1a10';
  context.lineWidth = Math.max(1.5, size * 0.09);
  context.beginPath();
  context.moveTo(0, -size * 0.62);
  context.lineTo(size * 0.48, size * 0.5);
  context.lineTo(0, size * 0.24);
  context.lineTo(-size * 0.48, size * 0.5);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = '#7ce7ff';
  context.beginPath();
  context.arc(0, -size * 0.1, size * 0.17, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawBullets(width: number, height: number): void {
  context.fillStyle = '#ffe9a8';
  for (const bullet of bullets) {
    if (!bullet.alive) continue;
    const size = height * 0.012;
    context.fillRect(bullet.x * width - size * 0.22, bullet.y * height - size, size * 0.44, size * 2);
  }
}

function drawEnemies(width: number, height: number, elapsed: number): void {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const x = enemy.x * width;
    const y = enemy.y * height;
    const size = enemy.radius * height;
    const wobble = Math.sin(elapsed * 4 + (enemy.phase ?? 0)) * size * 0.12;

    context.save();
    context.translate(x, y + wobble);
    context.fillStyle = 'rgba(12, 6, 20, 0.28)';
    context.beginPath();
    context.ellipse(0, size * 0.9, size * 0.6, size * 0.2, 0, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = `hsl(${enemy.hue ?? 280} 72% 62%)`;
    context.strokeStyle = '#2b1030';
    context.lineWidth = Math.max(1.5, size * 0.14);
    context.beginPath();
    context.arc(0, 0, size, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = '#1b0f22';
    context.beginPath();
    context.arc(-size * 0.32, -size * 0.12, size * 0.16, 0, Math.PI * 2);
    context.arc(size * 0.32, -size * 0.12, size * 0.16, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function drawVignette(width: number, height: number): void {
  const gradient = context.createRadialGradient(
    width * 0.5,
    height * 0.5,
    height * 0.28,
    width * 0.5,
    height * 0.5,
    height * 0.78,
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(14, 8, 28, 0.42)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function spawnEnemy(): void {
  enemies.push({
    x: 0.15 + Math.random() * 0.7,
    y: -0.06,
    vx: (Math.random() - 0.5) * 0.06,
    vy: 0.1 + Math.random() * 0.08,
    radius: 0.016 + Math.random() * 0.01,
    alive: true,
    hue: 250 + Math.random() * 90,
    phase: Math.random() * Math.PI * 2,
  });
}

function update(delta: number): void {
  scrollOffset += SCROLL_SPEED * delta * (canvas.height / (window.devicePixelRatio || 1) / 1080);

  const horizontal =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const vertical =
    Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  player.x = Math.min(0.93, Math.max(0.07, player.x + horizontal * delta * 0.62));
  player.y = Math.min(0.94, Math.max(0.18, player.y + vertical * delta * 0.62));

  player.cooldown -= delta;
  if (keys.has('Space') && player.cooldown <= 0) {
    player.cooldown = 0.11;
    bullets.push({ x: player.x, y: player.y - 0.03, vx: 0, vy: -1.5, radius: 0.008, alive: true });
  }

  for (const bullet of bullets) {
    bullet.y += bullet.vy * delta;
    if (bullet.y < -0.05) bullet.alive = false;
  }

  enemyTimer -= delta;
  if (enemyTimer <= 0) {
    enemyTimer = 0.45 + Math.random() * 0.5;
    spawnEnemy();
  }

  for (const enemy of enemies) {
    enemy.x += enemy.vx * delta;
    enemy.y += enemy.vy * delta;
    if (enemy.x < 0.08 || enemy.x > 0.92) enemy.vx *= -1;
    if (enemy.y > 1.08) enemy.alive = false;

    for (const bullet of bullets) {
      if (!bullet.alive || !enemy.alive) continue;
      const dx = bullet.x - enemy.x;
      const dy = (bullet.y - enemy.y) * PLAY_ASPECT;
      if (dx * dx + dy * dy < enemy.radius * enemy.radius) {
        bullet.alive = false;
        enemy.alive = false;
      }
    }
  }

  for (let index = bullets.length - 1; index >= 0; index -= 1) {
    if (!bullets[index].alive) bullets.splice(index, 1);
  }
  for (let index = enemies.length - 1; index >= 0; index -= 1) {
    if (!enemies[index].alive) enemies.splice(index, 1);
  }
}

let lastTime = performance.now();
let frameCount = 0;
let fpsClock = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  frameCount += 1;
  fpsClock += delta;
  if (fpsClock >= 0.5) {
    fpsLabel.textContent = `${Math.round(frameCount / fpsClock)} fps`;
    frameCount = 0;
    fpsClock = 0;
  }

  if (!paused) update(delta);

  const width = canvas.width / (window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio || 1);

  context.clearRect(0, 0, width, height);
  drawBackground(width, height);
  drawEnemies(width, height, now / 1000);
  drawBullets(width, height);
  drawPlayer(width, height);
  drawVignette(width, height);
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') mirrorTile = !mirrorTile;
  if (event.code === 'KeyP') paused = !paused;
  if (event.code === 'BracketRight') act = (act + 1) % ACT_COUNT;
  if (event.code === 'BracketLeft') act = (act + ACT_COUNT - 1) % ACT_COUNT;
  if (
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)
  ) {
    event.preventDefault();
  }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resize);

loadLevelArt();
resize();
requestAnimationFrame(frame);
