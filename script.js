/**
 * CryptSolve — script.js
 * ─────────────────────────────────────────────
 * Crypt Arithmetic Solver using Constraint Satisfaction
 * Problem (CSP) with Backtracking algorithm.
 *
 * Sections:
 *   1. Puzzle Parser
 *   2. CSP Solver (Backtracking + Constraint Propagation)
 *   3. Solver UI (animate, display results)
 *   4. Play Mode
 *   5. Theme & Panel switching
 */

/* ═══════════════════════════════════════════════
   1. PUZZLE PARSER
   Parses "SEND + MORE = MONEY" into structured data
═══════════════════════════════════════════════ */

/**
 * Parse a puzzle string into its components.
 * Supports: WORD1 + WORD2 = RESULT  or  WORD1 - WORD2 = RESULT
 * @param {string} raw - raw input string
 * @returns {{ lhs: string[][], ops: string[], result: string, letters: string[], leading: Set }}
 */
function parsePuzzle(raw) {
  const cleaned = raw.toUpperCase().replace(/\s+/g, '');

  // Split at '='
  const eqParts = cleaned.split('=');
  if (eqParts.length !== 2) throw new Error('Exactly one "=" required.');
  const resultWord = eqParts[1].trim();
  if (!/^[A-Z]+$/.test(resultWord)) throw new Error('Result must contain only letters.');

  // Split left side at + or -
  const lhsRaw = eqParts[0];
  const lhsTokens = lhsRaw.split(/(?=[+\-])/); // split keeping delimiter
  const operands = [];
  const ops = [];

  lhsTokens.forEach((tok, i) => {
    if (i === 0) {
      if (!/^[A-Z]+$/.test(tok)) throw new Error('Each operand must be letters only.');
      operands.push(tok);
    } else {
      const op  = tok[0];     // '+' or '-'
      const word = tok.slice(1);
      if (!/^[+\-]$/.test(op) || !/^[A-Z]+$/.test(word))
        throw new Error('Invalid operand format.');
      ops.push(op);
      operands.push(word);
    }
  });

  if (operands.length < 2) throw new Error('Need at least two operands.');

  // Collect unique letters
  const allWords = [...operands, resultWord];
  const letterSet = new Set(allWords.join(''));
  const letters = [...letterSet];

  if (letters.length > 10) throw new Error('Too many unique letters (max 10).');

  // Leading letters cannot be 0
  const leading = new Set();
  allWords.forEach(w => leading.add(w[0]));

  return { operands, ops, result: resultWord, letters, leading };
}

/* ═══════════════════════════════════════════════
   2. CSP SOLVER — Backtracking + Constraint Propagation
═══════════════════════════════════════════════ */

/** Shared stats for logging */
let solverStats = { nodes: 0, backtracks: 0, startTime: 0 };
let logBuffer   = [];
let logCallback = null; // called with each log entry during solving

/**
 * Main solve entry point.
 * @param {object} puzzle - parsed puzzle from parsePuzzle()
 * @param {function} onLog - callback(logEntry) for step-by-step logging
 * @returns {{ solution: object|null, stats: object }}
 */
function solvePuzzle_CSP(puzzle, onLog) {
  const { operands, ops, result, letters, leading } = puzzle;

  solverStats = { nodes: 0, backtracks: 0, startTime: performance.now() };
  logCallback  = onLog || null;
  logBuffer    = [];

  // Assignment map: letter → digit
  const assignment = {};

  // Domain: each letter can be 0–9
  const domains = {};
  letters.forEach(l => {
    domains[l] = leading.has(l) ? [1,2,3,4,5,6,7,8,9] : [0,1,2,3,4,5,6,7,8,9];
  });

  const solution = backtrack(assignment, letters, 0, domains, puzzle);

  const elapsed = (performance.now() - solverStats.startTime).toFixed(1);
  return { solution, stats: { ...solverStats, elapsed } };
}

/**
 * Recursive backtracking with constraint propagation.
 */
function backtrack(assignment, letters, depth, domains, puzzle) {
  // Base case: all letters assigned
  if (depth === letters.length) {
    solverStats.nodes++;
    if (isValid(assignment, puzzle)) {
      appendLog('ok', `✓ Solution found!`);
      return { ...assignment };
    }
    return null;
  }

  const letter = letters[depth]; // Pick next variable (in-order for speed)
  const domain = [...domains[letter]];
  const usedDigits = new Set(Object.values(assignment));

  for (const digit of domain) {
    // Constraint: all-different
    if (usedDigits.has(digit)) continue;

    // Constraint: no leading zeros
    if (digit === 0 && puzzle.leading.has(letter)) continue;

    solverStats.nodes++;
    assignment[letter] = digit;

    appendLog('assign', `Assign ${letter} = ${digit} (depth ${depth})`);

    // Forward checking: can we still possibly satisfy the equation?
    if (forwardCheck(assignment, puzzle)) {
      const result = backtrack(assignment, letters, depth + 1, domains, puzzle);
      if (result) return result;
    } else {
      appendLog('fail', `Forward check failed for ${letter}=${digit}`);
    }

    // Backtrack
    delete assignment[letter];
    solverStats.backtracks++;
  }

  return null;
}

/**
 * Forward checking: with partial assignment, ensure no column is violated.
 * A lightweight check: if all letters in equation are assigned, check full validity.
 */
function forwardCheck(assignment, puzzle) {
  const { operands, ops, result, letters } = puzzle;

  // Count how many letters are assigned
  const assigned = new Set(Object.keys(assignment));
  const allAssigned = letters.every(l => assigned.has(l));

  if (allAssigned) {
    return isValid(assignment, puzzle);
  }

  // Partial check: all assigned letters must not create a digit collision
  const usedDigits = Object.values(assignment);
  const uniqueDigits = new Set(usedDigits);
  return uniqueDigits.size === usedDigits.length;
}

/**
 * Verify the complete assignment satisfies the arithmetic equation.
 * Supports N operands with + and - operators.
 */
function isValid(assignment, puzzle) {
  const { operands, ops, result } = puzzle;

  function wordToNum(word) {
    let num = 0;
    for (const ch of word) {
      num = num * 10 + assignment[ch];
    }
    return num;
  }

  let lhsValue = wordToNum(operands[0]);
  for (let i = 0; i < ops.length; i++) {
    const val = wordToNum(operands[i + 1]);
    lhsValue = ops[i] === '+' ? lhsValue + val : lhsValue - val;
  }

  return lhsValue === wordToNum(result);
}

/** Add a log entry (buffered to avoid flooding UI) */
function appendLog(type, message) {
  if (logCallback && logBuffer.length < 200) {
    logCallback(type, message);
    logBuffer.push({ type, message });
  }
}

/* ═══════════════════════════════════════════════
   3. SOLVER UI
═══════════════════════════════════════════════ */

/** Load a preset puzzle into the input field */
function loadPreset(str) {
  document.getElementById('puzzleInput').value = str;
  clearResults();
  // Auto-scroll to input
  document.getElementById('puzzleInput').scrollIntoView({ behavior: 'smooth' });
}

/** Clear result cards */
function clearResults() {
  ['resultCard','noSolutionCard','solvingCard','equationCard'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
}

/** Main "Solve" button handler */
async function solvePuzzle() {
  const raw = document.getElementById('puzzleInput').value.trim();
  if (!raw) return;

  clearResults();

  const solveBtn = document.getElementById('solveBtn');
  solveBtn.classList.add('loading');
  solveBtn.disabled = true;

  // Small delay so the UI can update before heavy computation
  await sleep(60);

  let puzzle;
  try {
    puzzle = parsePuzzle(raw);
  } catch (err) {
    alert('Parse error: ' + err.message);
    solveBtn.classList.remove('loading');
    solveBtn.disabled = false;
    return;
  }

  // Show parsed equation
  showEquation(puzzle);

  // Show solving animation
  const solvingCard = document.getElementById('solvingCard');
  const logEl       = document.getElementById('backtrackLog');
  solvingCard.style.display = 'block';
  logEl.innerHTML = '';

  // Log callback: append to log element
  const logLines = [];
  function onLog(type, msg) {
    logLines.push({ type, msg });
    // Show every 10th log line to avoid perf issues
    if (logLines.length % 10 === 0 || logLines.length < 20) {
      const span = document.createElement('span');
      span.className = `log-${type}`;
      span.textContent = msg + '\n';
      logEl.appendChild(span);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  // Run solver in next tick to allow DOM paint
  await sleep(80);

  const { solution, stats } = solvePuzzle_CSP(puzzle, onLog);

  // Final log message
  const finalSpan = document.createElement('span');
  finalSpan.className = solution ? 'log-ok' : 'log-fail';
  finalSpan.textContent = solution
    ? `✓ Done — ${stats.nodes} nodes explored, ${stats.backtracks} backtracks\n`
    : `✕ No solution — ${stats.nodes} nodes explored\n`;
  logEl.appendChild(finalSpan);
  logEl.scrollTop = logEl.scrollHeight;

  // Show stats
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-item"><strong>${stats.nodes.toLocaleString()}</strong> Nodes</div>
    <div class="stat-item"><strong>${stats.backtracks.toLocaleString()}</strong> Backtracks</div>
    <div class="stat-item"><strong>${puzzle.letters.length}</strong> Variables</div>
    <div class="stat-item"><strong>${stats.elapsed}ms</strong> Elapsed</div>
  `;

  await sleep(300);

  solveBtn.classList.remove('loading');
  solveBtn.disabled = false;

  if (solution) {
    showResult(solution, puzzle, stats);
  } else {
    document.getElementById('noSolutionCard').style.display = 'block';
  }
}

/** Display the parsed equation */
function showEquation(puzzle) {
  const card = document.getElementById('equationCard');
  const display = document.getElementById('equationDisplay');
  card.style.display = 'block';

  let html = `<span class="eq-word">${puzzle.operands[0]}</span>`;
  puzzle.ops.forEach((op, i) => {
    html += `<span class="eq-op">${op}</span>`;
    html += `<span class="eq-word">${puzzle.operands[i+1]}</span>`;
  });
  html += `<span class="eq-eq">=</span>`;
  html += `<span class="eq-word">${puzzle.result}</span>`;
  display.innerHTML = html;
}

/** Display the solution */
function showResult(solution, puzzle, stats) {
  const card = document.getElementById('resultCard');
  card.style.display = 'block';

  // Time badge
  document.getElementById('resultTime').textContent =
    `${stats.elapsed}ms · ${stats.nodes.toLocaleString()} nodes explored`;

  // Mapping chips
  const grid = document.getElementById('mappingGrid');
  grid.innerHTML = '';
  const sortedLetters = Object.keys(solution).sort();
  sortedLetters.forEach((letter, i) => {
    const chip = document.createElement('div');
    chip.className = 'map-chip';
    chip.style.animationDelay = `${i * 55}ms`;
    chip.innerHTML = `
      <span class="letter">${letter}</span>
      <span class="equals">═</span>
      <span class="digit">${solution[letter]}</span>
    `;
    grid.appendChild(chip);
  });

  // Verified equation
  function wordToNum(word) {
    return parseInt([...word].map(c => solution[c]).join(''));
  }
  const nums = puzzle.operands.map(wordToNum);
  let val = nums[0];
  let eqStr = `${nums[0]}`;
  puzzle.ops.forEach((op, i) => {
    eqStr += ` ${op} ${nums[i+1]}`;
    val = op === '+' ? val + nums[i+1] : val - nums[i+1];
  });
  eqStr += ` = ${wordToNum(puzzle.result)}`;
  document.getElementById('verifiedEq').textContent = eqStr;

  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  playSound('success');
}

/* ═══════════════════════════════════════════════
   4. PLAY MODE
═══════════════════════════════════════════════ */

let playState = {
  puzzle: null,
  solution: null,
  attempts: 0,
  score: 1000,
  revealed: new Set(),
};

/** Start a new play puzzle */
async function startPlayPuzzle(raw) {
  document.getElementById('playIdleCard').style.display  = 'none';
  document.getElementById('playCard').style.display      = 'block';

  let puzzle;
  try {
    puzzle = parsePuzzle(raw);
  } catch (e) {
    alert(e.message); return;
  }

  // Solve silently to get the answer
  const { solution } = solvePuzzle_CSP(puzzle, null);
  if (!solution) { alert('This puzzle has no solution!'); return; }

  playState = {
    puzzle, solution,
    attempts: 0, score: 1000,
    revealed: new Set()
  };

  // Reset UI
  document.getElementById('attemptCount').textContent = 0;
  document.getElementById('scoreCount').textContent   = 1000;
  document.getElementById('playPuzzleLabel').textContent = raw.toUpperCase();
  hideFeedback();

  // Build equation display
  renderPlayEq(puzzle);

  // Build input grid
  renderPlayInputs(puzzle);
}

/** Render the play-mode equation */
function renderPlayEq(puzzle) {
  let html = '';
  puzzle.operands.forEach((word, i) => {
    if (i > 0) html += ` ${puzzle.ops[i-1]} `;
    html += word;
  });
  html += ` = ${puzzle.result}`;
  document.getElementById('playEqDisplay').textContent = html;
}

/** Render digit-input fields for each unique letter */
function renderPlayInputs(puzzle) {
  const container = document.getElementById('playInputs');
  container.innerHTML = '';
  puzzle.letters.forEach(letter => {
    const group = document.createElement('div');
    group.className = 'play-input-group';
    group.innerHTML = `
      <span class="play-letter">${letter}</span>
      <input
        class="play-digit-input"
        id="pi-${letter}"
        type="number"
        min="0" max="9"
        maxlength="1"
        placeholder="?"
        oninput="clampDigit(this)"
      />
    `;
    container.appendChild(group);
  });
}

/** Clamp digit input to 0–9 */
function clampDigit(input) {
  let v = parseInt(input.value);
  if (isNaN(v)) { input.value = ''; return; }
  if (v < 0) v = 0;
  if (v > 9) v = parseInt(String(v).slice(-1));
  input.value = v;
}

/** Check the user's guess */
function checkGuess() {
  const { puzzle, solution } = playState;
  if (!puzzle) return;

  playState.attempts++;
  document.getElementById('attemptCount').textContent = playState.attempts;

  let allFilled = true;
  let allCorrect = true;
  let wrongCount = 0;

  puzzle.letters.forEach(letter => {
    const input = document.getElementById(`pi-${letter}`);
    const val = parseInt(input.value);
    if (isNaN(val)) { allFilled = false; return; }

    if (val === solution[letter]) {
      input.classList.remove('wrong'); input.classList.add('correct');
    } else {
      input.classList.remove('correct'); input.classList.add('wrong');
      allCorrect = false; wrongCount++;
    }
  });

  if (!allFilled) {
    showFeedback('info', 'Fill in all letter digits first!');
    return;
  }

  // Score penalty per wrong letter per attempt
  const penalty = wrongCount * 30 + 10;
  playState.score = Math.max(0, playState.score - penalty);
  document.getElementById('scoreCount').textContent = playState.score;

  if (allCorrect) {
    showFeedback('success', `🎉 Correct! Final score: ${playState.score} pts (${playState.attempts} attempts)`);
    playSound('success');
  } else {
    showFeedback('fail', `✕ ${wrongCount} letter(s) wrong. −${penalty} points. Keep trying!`);
    playSound('fail');
  }
}

/** Give a hint: reveal one random unresolved letter */
function giveHint() {
  const { puzzle, solution, revealed } = playState;
  if (!puzzle) return;

  const unrevealed = puzzle.letters.filter(l => !revealed.has(l));
  if (unrevealed.length === 0) {
    showFeedback('info', 'All letters already revealed!');
    return;
  }

  // Pick a random unrevealed letter that user hasn't gotten right yet
  const wrong = unrevealed.filter(l => {
    const input = document.getElementById(`pi-${l}`);
    return !input.classList.contains('correct');
  });
  const pool = wrong.length > 0 ? wrong : unrevealed;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  const input = document.getElementById(`pi-${pick}`);
  input.value = solution[pick];
  input.classList.remove('wrong', 'correct');
  input.classList.add('hinted');
  input.disabled = true;
  revealed.add(pick);

  playState.score = Math.max(0, playState.score - 50);
  document.getElementById('scoreCount').textContent = playState.score;

  showFeedback('info', `💡 Hint: ${pick} = ${solution[pick]}`);
}

/** Reveal the full answer */
function revealAnswer() {
  const { puzzle, solution } = playState;
  if (!puzzle) return;

  puzzle.letters.forEach(letter => {
    const input = document.getElementById(`pi-${letter}`);
    input.value = solution[letter];
    input.disabled = true;
    input.classList.remove('wrong');
    input.classList.add('hinted');
  });

  playState.score = 0;
  document.getElementById('scoreCount').textContent = 0;
  showFeedback('info', `Solution revealed. Score reset to 0.`);
}

function showFeedback(type, msg) {
  const el = document.getElementById('playFeedback');
  el.className = `play-feedback ${type}`;
  el.textContent = msg;
}
function hideFeedback() {
  const el = document.getElementById('playFeedback');
  el.className = 'play-feedback';
  el.textContent = '';
}

/* ═══════════════════════════════════════════════
   5. THEME & PANEL SWITCHING
═══════════════════════════════════════════════ */

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-icon').textContent = isDark ? '☾' : '☀';
}

function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.panel === name);
  });
  document.getElementById(`panel-${name}`).classList.add('active');
}

/* ═══════════════════════════════════════════════
   6. UTILITIES
═══════════════════════════════════════════════ */

/** Promise-based sleep */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Minimal sound effects using the Web Audio API.
 * @param {'success'|'fail'} type
 */
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Ascending arpeggio
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(550, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } else {
      // Low buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    // AudioContext not supported — silently ignore
  }
}
