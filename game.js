const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ─── Константы ───────────────────────────────────────────
const BOARD_SIZE = 8;
const LIGHT = '#F0D9B5';
const DARK  = '#B58863';
const SEL_COLOR  = 'rgba(0, 200, 0, 0.45)';
const HINT_COLOR = 'rgba(0, 200, 0, 0.25)';

const WHITE_PIECE  = '#FFFFFF';
const BLACK_PIECE  = '#1a1a1a';
const PIECE_BORDER = '#888888';
const KING_COLOR   = '#FFD700';

// ─── Canvas ──────────────────────────────────────────────
const canvas = document.getElementById('board');
const ctx    = canvas.getContext('2d');

const CELL = Math.floor(Math.min(window.innerWidth, window.innerHeight - 60) / BOARD_SIZE);
canvas.width  = CELL * BOARD_SIZE;
canvas.height = CELL * BOARD_SIZE;

// ─── Состояние ───────────────────────────────────────────
let board      = null;
let validMoves = [];
let selected   = null;
let gameStatus = 'IN_PROGRESS';

const chatId = new URLSearchParams(window.location.search).get('chatId');

// ─── Инициализация заглушки ──────────────────────────────
function initEmptyBoard() {
  board = Array.from({length: 8}, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) board[r][c] = 'BM';
      if (r > 4) board[r][c] = 'WM';
    }
  }
}

// ─── Загрузка состояния с бэкенда ────────────────────────
async function loadState() {
  if (!chatId) {
    setStatus('Ошибка: chatId не передан');
    console.error('chatId отсутствует в URL');
    return;
  }

  if (!chatId && tg.initDataUnsafe?.user?.id) {
    chatId = tg.initDataUnsafe.user.id;
    console.log('chatId взят из initDataUnsafe:', chatId);
  }

  if (!chatId) {
      setStatus('Ошибка: chatId не определён');
      console.error('Нет chatId ни в URL, ни в initDataUnsafe');
  } else {
      loadState();
  }

  try {
    const res = await fetch(`/api/game/${chatId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const state = await res.json();
    applyState(state);
  } catch (e) {
    console.error('Не удалось загрузить состояние:', e);
    setStatus('Ошибка загрузки игры');
  }
}

// ─── Применение состояния ────────────────────────────────
function applyState(state) {
  board      = state.board.cells;
  validMoves = state.validMoves || [];
  gameStatus = state.status;

  switch (state.status) {
    case 'WHITE_WON': setStatus('🎉 Вы победили!'); break;
    case 'BLACK_WON': setStatus('😔 ИИ победил');   break;
    case 'DRAW':      setStatus('🤝 Ничья');         break;
    default:
      setStatus(state.currentTurn === 'WHITE' ? 'Ваш ход ♟' : 'Ход ИИ...');
  }
  draw();
}

// ─── Отправка хода ───────────────────────────────────────
async function sendMove(move) {
  // Оптимистичное обновление
  board[move.toRow][move.toCol] = board[move.fromRow][move.fromCol];
  board[move.fromRow][move.fromCol] = null;
  if (move.captureRow != null) board[move.captureRow][move.captureCol] = null;
  validMoves = [];
  setStatus('Ход ИИ...');
  draw();

  try {
    const res = await fetch(`/api/game/${chatId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(move)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const state = await res.json();
    applyState(state);
  } catch (e) {
    console.error('Ошибка при отправке хода:', e);
    setStatus('Ошибка сети — попробуйте снова');
    await loadState(); // откат к актуальному состоянию
  }
}

// ─── Обработка кликов/тапов ──────────────────────────────
canvas.addEventListener('pointerdown', e => {
  if (gameStatus !== 'IN_PROGRESS') return;

  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const c = Math.floor((e.clientX - rect.left) * scaleX / CELL);
  const r = Math.floor((e.clientY - rect.top)  * scaleY / CELL);

  if (r < 0 || r >= 8 || c < 0 || c >= 8) return;

  // Если шашка выбрана — ищем ход в эту клетку
  if (selected) {
    const move = validMoves.find(m =>
      m.fromRow === selected.row && m.fromCol === selected.col &&
      m.toRow === r && m.toCol === c
    );
    if (move) {
      sendMove(move);
      selected = null;
      draw();
      return;
    }
  }

  // Выбираем белую шашку с доступными ходами
  const piece = board?.[r]?.[c];
  const hasMovesFromHere = validMoves.some(m => m.fromRow === r && m.fromCol === c);

  if (piece?.startsWith('W') && hasMovesFromHere) {
    selected = {row: r, col: c};
  } else {
    selected = null;
  }
  draw();
});

// ─── Отрисовка ───────────────────────────────────────────
function draw() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      drawCell(r, c);
      drawPiece(r, c);
    }
  }
}

function drawCell(r, c) {
  const x = c * CELL, y = r * CELL;

  ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT : DARK;
  ctx.fillRect(x, y, CELL, CELL);

  if (selected && selected.row === r && selected.col === c) {
    ctx.fillStyle = SEL_COLOR;
    ctx.fillRect(x, y, CELL, CELL);
  }

  const isHint = selected && validMoves.some(m =>
    m.fromRow === selected.row && m.fromCol === selected.col &&
    m.toRow === r && m.toCol === c
  );
  if (isHint) {
    ctx.fillStyle = HINT_COLOR;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.beginPath();
    ctx.arc(x + CELL/2, y + CELL/2, CELL/6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 180, 0, 0.6)';
    ctx.fill();
  }
}

function drawPiece(r, c) {
  const piece = board?.[r]?.[c];
  if (!piece) return;

  const x      = c * CELL + CELL / 2;
  const y      = r * CELL + CELL / 2;
  const radius = CELL / 2 - 4;
  const isWhite = piece.startsWith('W');
  const isKing  = piece.endsWith('K');

  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur  = 4;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = isWhite ? WHITE_PIECE : BLACK_PIECE;
  ctx.fill();
  ctx.strokeStyle = PIECE_BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(x, y, radius - 5, 0, Math.PI * 2);
  ctx.strokeStyle = isWhite ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (isKing) {
    ctx.font          = `${CELL * 0.4}px serif`;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillStyle     = KING_COLOR;
    ctx.fillText('♛', x, y);
  }
}

// ─── Статус ──────────────────────────────────────────────
function setStatus(text) {
  document.getElementById('status').textContent = text;
}

// ─── Старт ───────────────────────────────────────────────
initEmptyBoard();
draw();
loadState();
