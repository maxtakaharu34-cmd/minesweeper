import { useState, useEffect, useRef, useCallback } from "react";

const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10, label: "Easy" },
  medium: { rows: 16, cols: 16, mines: 40, label: "Medium" },
  hard: { rows: 16, cols: 30, mines: 99, label: "Hard" },
};

type Difficulty = keyof typeof DIFFICULTIES;
type CellState = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
};

const COLORS: Record<number, string> = {
  1: "#4FC3F7",
  2: "#66BB6A",
  3: "#EF5350",
  4: "#AB47BC",
  5: "#FF7043",
  6: "#26C6DA",
  7: "#EC407A",
  8: "#BDBDBD",
};

function playSound(type: "reveal" | "flag" | "boom" | "win") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "reveal") {
      osc.frequency.value = 600;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialDecayTo?.(0.01, ctx.currentTime + 0.05) ??
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === "flag") {
      osc.frequency.value = 800;
      osc.type = "square";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === "boom") {
      const bufferSize = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();
      noise.stop(ctx.currentTime + 0.5);
      osc.frequency.value = 100;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "win") {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = f;
        o.type = "triangle";
        g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.2);
        o.start(ctx.currentTime + i * 0.12);
        o.stop(ctx.currentTime + i * 0.12 + 0.2);
      });
    }
  } catch {}
}

function createBoard(rows: number, cols: number, mines: number, safeR: number, safeC: number): CellState[][] {
  const board: CellState[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 }))
  );
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (board[r][c].mine) continue;
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
    board[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) count++;
        }
      board[r][c].adjacent = count;
    }
  }
  return board;
}

export default function マインスイーパー() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [board, setBoard] = useState<CellState[][] | null>(null);
  const [gameState, setGameState] = useState<"idle" | "playing" | "won" | "lost">("idle");
  const [timer, setTimer] = useState(0);
  const [flagCount, setFlagCount] = useState(0);
  const [explosions, setExplosions] = useState<{ r: number; c: number; t: number }[]>([]);
  const [bestTimes, setBestTimes] = useState<Record<Difficulty, number | null>>({ easy: null, medium: null, hard: null });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstClick = useRef(true);
  const boardRef = useRef(board);
  boardRef.current = board;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const config = DIFFICULTIES[difficulty];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("minesweeper_best");
      if (saved) setBestTimes(JSON.parse(saved));
    } catch {}
  }, []);

  const saveBest = useCallback((diff: Difficulty, time: number) => {
    setBestTimes((prev) => {
      const next = { ...prev };
      if (next[diff] === null || time < next[diff]!) {
        next[diff] = time;
        localStorage.setItem("minesweeper_best", JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const startGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setBoard(null);
    setGameState("idle");
    setTimer(0);
    setFlagCount(0);
    setExplosions([]);
    firstClick.current = true;
  }, []);

  useEffect(() => {
    startGame();
  }, [difficulty, startGame]);

  useEffect(() => {
    if (gameState === "playing") {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState]);

  const reveal = useCallback((b: CellState[][], r: number, c: number, rows: number, cols: number) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (b[r][c].revealed || b[r][c].flagged) return;
    b[r][c].revealed = true;
    if (b[r][c].adjacent === 0 && !b[r][c].mine) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr !== 0 || dc !== 0) reveal(b, r + dr, c + dc, rows, cols);
    }
  }, []);

  const checkWin = useCallback((b: CellState[][], rows: number, cols: number): boolean => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (!b[r][c].mine && !b[r][c].revealed) return false;
    return true;
  }, []);

  const handleClick = useCallback((r: number, c: number, rightClick: boolean) => {
    const cfg = DIFFICULTIES[difficulty];
    let b: CellState[][];
    if (firstClick.current && !rightClick) {
      b = createBoard(cfg.rows, cfg.cols, cfg.mines, r, c);
      firstClick.current = false;
      setGameState("playing");
    } else {
      if (gameStateRef.current !== "playing" && gameStateRef.current !== "idle") return;
      if (!boardRef.current) return;
      b = boardRef.current.map((row) => row.map((cell) => ({ ...cell })));
    }

    if (rightClick) {
      if (b[r][c].revealed) return;
      b[r][c].flagged = !b[r][c].flagged;
      setFlagCount((prev) => prev + (b[r][c].flagged ? 1 : -1));
      playSound("flag");
      setBoard(b);
      return;
    }

    if (b[r][c].flagged || b[r][c].revealed) {
      setBoard(b);
      return;
    }

    if (b[r][c].mine) {
      playSound("boom");
      for (let rr = 0; rr < cfg.rows; rr++)
        for (let cc = 0; cc < cfg.cols; cc++)
          if (b[rr][cc].mine) b[rr][cc].revealed = true;
      setBoard(b);
      setGameState("lost");
      const exps: { r: number; c: number; t: number }[] = [];
      for (let rr = 0; rr < cfg.rows; rr++)
        for (let cc = 0; cc < cfg.cols; cc++)
          if (b[rr][cc].mine) {
            const dist = Math.abs(rr - r) + Math.abs(cc - c);
            exps.push({ r: rr, c: cc, t: Date.now() + dist * 80 });
          }
      setExplosions(exps);
      return;
    }

    reveal(b, r, c, cfg.rows, cfg.cols);
    playSound("reveal");
    setBoard(b);

    if (checkWin(b, cfg.rows, cfg.cols)) {
      playSound("win");
      setGameState("won");
      saveBest(difficulty, timer);
    }
  }, [difficulty, timer, reveal, checkWin, saveBest]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cellSize = Math.min(
      Math.floor((window.innerWidth - 40) / config.cols),
      Math.floor((window.innerHeight - 200) / config.rows),
      36
    );
    const w = config.cols * cellSize;
    const h = config.rows * cellSize;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const x = c * cellSize;
        const y = r * cellSize;
        const cell = board ? board[r][c] : null;

        if (cell?.revealed) {
          if (cell.mine) {
            ctx.fillStyle = "#FF1744";
            ctx.fillRect(x, y, cellSize, cellSize);
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.25, 0, Math.PI * 2);
            ctx.fill();
            // spikes
            for (let a = 0; a < 8; a++) {
              const angle = (a * Math.PI) / 4;
              ctx.beginPath();
              ctx.moveTo(x + cellSize / 2, y + cellSize / 2);
              ctx.lineTo(
                x + cellSize / 2 + Math.cos(angle) * cellSize * 0.38,
                y + cellSize / 2 + Math.sin(angle) * cellSize * 0.38
              );
              ctx.strokeStyle = "#000";
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          } else {
            ctx.fillStyle = "#16213e";
            ctx.fillRect(x, y, cellSize, cellSize);
            if (cell.adjacent > 0) {
              ctx.fillStyle = COLORS[cell.adjacent] || "#FFF";
              ctx.font = `bold ${cellSize * 0.55}px monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(String(cell.adjacent), x + cellSize / 2, y + cellSize / 2 + 1);
            }
          }
        } else {
          // unrevealed
          const grad = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
          grad.addColorStop(0, "#2a2a5a");
          grad.addColorStop(1, "#1e1e4a");
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, cellSize, cellSize);
          // highlight
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.fillRect(x, y, cellSize, 2);
          ctx.fillRect(x, y, 2, cellSize);

          if (cell?.flagged) {
            ctx.fillStyle = "#FFD740";
            ctx.font = `${cellSize * 0.55}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🚩", x + cellSize / 2, y + cellSize / 2 + 1);
          }
        }

        // grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }

    // explosions
    if (explosions.length > 0) {
      const now = Date.now();
      explosions.forEach((e) => {
        const elapsed = now - e.t;
        if (elapsed < 0 || elapsed > 600) return;
        const progress = elapsed / 600;
        const radius = cellSize * 0.8 * progress;
        const alpha = 1 - progress;
        const x = e.c * cellSize + cellSize / 2;
        const y = e.r * cellSize + cellSize / 2;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, `rgba(255,200,50,${alpha})`);
        grad.addColorStop(0.5, `rgba(255,80,20,${alpha * 0.7})`);
        grad.addColorStop(1, `rgba(255,0,0,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      if (explosions.some((e) => Date.now() - e.t < 600)) {
        requestAnimationFrame(() => setExplosions([...explosions]));
      }
    }
  }, [board, config, explosions]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cellSize = canvas.width / DIFFICULTIES[difficulty].cols;
    const c = Math.floor((e.clientX - rect.left) / cellSize);
    const r = Math.floor((e.clientY - rect.top) / cellSize);
    if (r < 0 || r >= DIFFICULTIES[difficulty].rows || c < 0 || c >= DIFFICULTIES[difficulty].cols) return;
    handleClick(r, c, false);
  }, [difficulty, handleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cellSize = canvas.width / DIFFICULTIES[difficulty].cols;
    const c = Math.floor((e.clientX - rect.left) / cellSize);
    const r = Math.floor((e.clientY - rect.top) / cellSize);
    if (r < 0 || r >= DIFFICULTIES[difficulty].rows || c < 0 || c >= DIFFICULTIES[difficulty].cols) return;
    handleClick(r, c, true);
  }, [difficulty, handleClick]);

  // Long press for mobile flagging
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ r: number; c: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const cellSize = canvas.width / DIFFICULTIES[difficulty].cols;
    const c = Math.floor((touch.clientX - rect.left) / cellSize);
    const r = Math.floor((touch.clientY - rect.top) / cellSize);
    touchStart.current = { r, c };
    longPressTimer.current = setTimeout(() => {
      handleClick(r, c, true);
      touchStart.current = null;
    }, 500);
  }, [difficulty, handleClick]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (touchStart.current) {
      e.preventDefault();
      handleClick(touchStart.current.r, touchStart.current.c, false);
      touchStart.current = null;
    }
  }, [handleClick]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "16px",
      fontFamily: "'Segoe UI', sans-serif",
      color: "#fff",
      userSelect: "none",
    }}>
      <h1 style={{
        fontSize: "clamp(24px, 5vw, 40px)",
        margin: "8px 0",
        background: "linear-gradient(90deg, #FF6B6B, #FFE66D)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        fontWeight: 900,
      }}>
        💣 MINESWEEPER
      </h1>

      {/* Difficulty */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "none",
              background: difficulty === d ? "linear-gradient(135deg, #FF6B6B, #ee5a24)" : "rgba(255,255,255,0.1)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {DIFFICULTIES[d].label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div style={{
        display: "flex",
        gap: 24,
        marginBottom: 12,
        fontSize: 18,
        fontWeight: 700,
        alignItems: "center",
      }}>
        <span>💣 {config.mines - flagCount}</span>
        <span>⏱️ {formatTime(timer)}</span>
        {bestTimes[difficulty] !== null && <span style={{ color: "#FFE66D", fontSize: 14 }}>🏆 {formatTime(bestTimes[difficulty]!)}</span>}
        <button onClick={startGame} style={{
          padding: "4px 12px",
          borderRadius: 8,
          border: "none",
          background: "rgba(255,255,255,0.15)",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 700,
        }}>
          🔄 New
        </button>
      </div>

      {/* Game state banner */}
      {gameState === "won" && (
        <div style={{
          padding: "8px 24px",
          background: "linear-gradient(90deg, #00b894, #00cec9)",
          borderRadius: 12,
          marginBottom: 8,
          fontWeight: 900,
          fontSize: 20,
        }}>
          🎉 YOU WIN! — {formatTime(timer)}
        </div>
      )}
      {gameState === "lost" && (
        <div style={{
          padding: "8px 24px",
          background: "linear-gradient(90deg, #e74c3c, #c0392b)",
          borderRadius: 12,
          marginBottom: 8,
          fontWeight: 900,
          fontSize: 20,
        }}>
          💥 ゲームオーバー
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          borderRadius: 8,
          boxShadow: "0 0 30px rgba(255,107,107,0.3)",
          touchAction: "none",
        }}
      />

      <p style={{ marginTop: 12, fontSize: 12, opacity: 0.5 }}>
        Left click = reveal · Right click / long press = flag
      </p>
    </div>
  );
}
