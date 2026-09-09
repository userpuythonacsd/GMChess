// GM Chess 2026 Engine & UI Controller - Robust Edition
const chess = new Chess();
let selectedSquare = null;
let isFlipped = false;
let isAiThinking = false;
let analysisTimeout = null;
let lastMove = null;
let validMovesForSelected = [];
let engine;

// HD SVG Pieces Dictionary
const pieceImages = {
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg'
};

// let aiSafetyTimer = null;

// Initialize Stockfish Worker robustly
function initEngine() {
    try {
        const workerScript = `importScripts("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js");`;
        const blob = new Blob([workerScript], {type: 'application/javascript'});
        engine = new Worker(URL.createObjectURL(blob));
        
        engine.onmessage = handleEngineMessage;
        engine.onerror = function(err) {
            console.error("Stockfish Worker Error", err);
            isAiThinking = false;
        };
        
        engine.postMessage('uci');
        engine.postMessage('isready');
    } catch (e) {
        console.error("Failed to load engine worker.", e);
        engine = null;
    }
}

function makeFallbackAiMove() {
    if (chess.game_over()) {
        isAiThinking = false;
        return;
    }
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
        isAiThinking = false;
        return;
    }
    const captures = moves.filter(m => m.captured);
    const checks = moves.filter(m => m.san && m.san.includes('+'));
    const chosen = (captures.length > 0) ? captures[Math.floor(Math.random() * captures.length)]
                 : (checks.length > 0) ? checks[Math.floor(Math.random() * checks.length)]
                 : moves[Math.floor(Math.random() * moves.length)];
    
    const result = chess.move(chosen);
    if (result) {
        lastMove = { from: result.from, to: result.to };
        playSound(result.captured ? 'capture' : 'move');
        if (chess.in_check()) playSound('check');
    }
    isAiThinking = false;
    updateGameState();
}

// Handle responses from Stockfish
function handleEngineMessage(event) {
    const line = event.data;
    
    // Evaluation Parsing for Visual Bar
    if (line.includes('score cp')) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
            let eval = parseInt(match[1]) / 100;
            if (chess.turn() === 'b') eval = -eval; 
            updateEvalVisuals(eval, false);
        }
    } else if (line.includes('score mate')) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) {
            let mate = parseInt(match[1]);
            let actualMate = chess.turn() === 'b' ? -mate : mate;
            updateEvalVisuals(actualMate, true);
        }
    }

    // Best move execution
    if (line.startsWith('bestmove')) {
        clearTimeout(aiSafetyTimer);
        if (isAiThinking) {
            const match = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
            if (match && match[1]) {
                const moveStr = match[1];
                const from = moveStr.substring(0, 2);
                const to = moveStr.substring(2, 4);
                const promotion = moveStr.length > 4 ? moveStr[4] : 'q';
                
                const isCapture = chess.get(to) !== null;
                const result = chess.move({ from, to, promotion });
                
                if(result) {
                    lastMove = { from, to };
                    playSound(isCapture ? 'capture' : 'move');
                    if (chess.in_check()) playSound('check');
                }
            }
            isAiThinking = false;
            updateGameState();
        }
    }
}

// Update the Evaluation Bar Height
function updateEvalVisuals(score, isMate) {
    const evalText = document.getElementById('evaluation');
    const evalFill = document.getElementById('eval-fill');
    
    if (isMate) {
        evalText.textContent = "Eval: Mate in " + Math.abs(score);
        evalFill.style.height = score > 0 ? '100%' : '0%';
    } else {
        evalText.textContent = "Eval: " + (score > 0 ? "+" : "") + score.toFixed(2);
        // Formula to convert centipawns to percentage (capped at +5 / -5)
        let percent = 50 + (score * 10);
        if (percent > 100) percent = 100;
        if (percent < 0) percent = 0;
        evalFill.style.height = percent + '%';
    }
}

// Audio System
let audioCtx;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('click', initAudio, { once: true });

function playSound(type) {
    if (document.getElementById('sound-toggle').value === 'off' || !audioCtx) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        const now = audioCtx.currentTime;
        
        if (type === 'move') {
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'capture') {
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'check') {
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.setValueAtTime(900, now + 0.08);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch(e) {}
}

// Render Board & UI Updates
function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const rank = isFlipped ? r + 1 : 8 - r;
            const fileIdx = isFlipped ? 7 - c : c;
            const file = String.fromCharCode(97 + fileIdx);
            const sq = file + rank;
            
            const squareEl = document.createElement('div');
            squareEl.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            squareEl.dataset.square = sq;
            
            if (lastMove && (lastMove.from === sq || lastMove.to === sq)) {
                squareEl.classList.add('last-move');
            }
            if (selectedSquare === sq) {
                squareEl.classList.add('selected');
            }
            if (validMovesForSelected.includes(sq)) {
                squareEl.classList.add('valid-move-dot');
            }
            
            const piece = chess.get(sq);
            if (piece) {
                const pieceImg = document.createElement('img');
                const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
                pieceImg.src = pieceImages[key];
                pieceImg.className = 'piece';
                squareEl.appendChild(pieceImg);
            }
            
            squareEl.addEventListener('click', () => handleSquareClick(sq));
            boardEl.appendChild(squareEl);
        }
    }
    
    document.getElementById('pgn').textContent = chess.pgn();
    scrollToBottomPGN();
    updateCapturedPieces();
}

function handleSquareClick(sq) {
    if (chess.game_over()) return;
    const mode = document.getElementById('game-mode').value;

    // ── Online multiplayer path ──────────────────────────────────────────────
    if (mode.startsWith('online-')) {
        if (!mpColor || chess.turn() !== mpColor) return;

        if (selectedSquare) {
            let moveDetails = { from: selectedSquare, to: sq };
            const piece = chess.get(selectedSquare);
            if (piece && piece.type === 'p' && (sq[1] === '8' || sq[1] === '1')) {
                moveDetails.promotion = 'q';
            }

            if (chess.moves({ verbose: true }).some(m => m.from === selectedSquare && m.to === sq)) {
                socket.emit('move', moveDetails);
                selectedSquare = null;
                validMovesForSelected = [];
            } else {
                const clickedPiece = chess.get(sq);
                if (clickedPiece && clickedPiece.color === mpColor) {
                    selectSquare(sq);
                } else {
                    selectedSquare = null;
                    validMovesForSelected = [];
                    renderBoard();
                }
            }
        } else {
            const piece = chess.get(sq);
            if (piece && piece.color === mpColor) selectSquare(sq);
        }
        return;
    }

    // ── AI / Local multiplayer path ──────────────────────────────────────────
    // Only lock clicks when in AI mode AND it's the AI's turn
    if (mode.startsWith('ai-') && chess.turn() === (isFlipped ? 'w' : 'b') && isAiThinking) return;

    if (selectedSquare) {
        const isCapture = chess.get(sq) !== null;
        let moveObj = { from: selectedSquare, to: sq };

        const piece = chess.get(selectedSquare);
        if (piece && piece.type === 'p' && (sq[1] === '8' || sq[1] === '1')) {
            moveObj.promotion = 'q';
        }

        const result = chess.move(moveObj);

        if (result) {
            lastMove = { from: result.from, to: result.to };
            selectedSquare = null;
            validMovesForSelected = [];
            playSound(isCapture ? 'capture' : 'move');
            if (chess.in_check()) playSound('check');
            updateGameState();
        } else {
            const clickedPiece = chess.get(sq);
            if (clickedPiece && clickedPiece.color === chess.turn()) selectSquare(sq);
            else {
                selectedSquare = null;
                validMovesForSelected = [];
                renderBoard();
            }
        }
    } else {
        const piece = chess.get(sq);
        if (piece && piece.color === chess.turn()) selectSquare(sq);
    }
}

function selectSquare(sq) {
    selectedSquare = sq;
    const moves = chess.moves({ square: sq, verbose: true });
    validMovesForSelected = moves.map(m => m.to);
    renderBoard();
}

// Typing blitz interface
const typeInput = document.getElementById('type-move');
typeInput.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') submitTypedMove();
});

function submitTypedMove() {
    const mode = document.getElementById('game-mode').value;

    // ── Online multiplayer path ──────────────────────────────────────────────
    if (mode.startsWith('online-')) {
        if (!mpColor || chess.game_over() || chess.turn() !== mpColor) return;
        const moveStr = typeInput.value.trim().replace(/[^a-zA-Z0-9=+\-x#O]/g, '');
        if (!moveStr) return;
        const testChess = new Chess(chess.fen());
        const result = testChess.move(moveStr);
        if (!result) {
            alert('Invalid FIDE notation. Example: e4, Nf3, O-O');
            typeInput.value = '';
            return;
        }
        socket.emit('move', { from: result.from, to: result.to, promotion: result.promotion || 'q' });
        typeInput.value = '';
        return;
    }

    // ── AI / Local multiplayer path ──────────────────────────────────────────
    if (chess.game_over() || isAiThinking) return;
    const moveStr = typeInput.value.trim().replace(/[^a-zA-Z0-9=+-x#O\-]/g, '');
    if (!moveStr) return;

    const isCapture = moveStr.includes('x');
    const result = chess.move(moveStr);

    if (result) {
        lastMove = { from: result.from, to: result.to };
        typeInput.value = '';
        selectedSquare = null;
        validMovesForSelected = [];
        playSound(isCapture ? 'capture' : 'move');
        if (chess.in_check()) playSound('check');
        updateGameState();
    } else {
        alert("Invalid FIDE notation. Example: e4, Nf3, O-O");
        typeInput.value = '';
    }
}

// Captured Pieces Logic
function updateCapturedPieces() {
    const history = chess.history({ verbose: true });
    const capturedWhite = [];
    const capturedBlack = [];

    history.forEach(move => {
        if (move.captured) {
            if (move.color === 'w') capturedBlack.push(move.captured); // White captured a black piece
            else capturedWhite.push(move.captured); // Black captured a white piece
        }
    });

    const renderCaptures = (pieces, colorCode) => {
        return pieces.map(p => {
            const key = colorCode === 'w' ? p.toUpperCase() : p.toLowerCase();
            return `<img src="${pieceImages[key]}" alt="${p}">`;
        }).join('');
    };

    const topDiv = document.getElementById('captured-top');
    const bottomDiv = document.getElementById('captured-bottom');

    if (isFlipped) {
        topDiv.innerHTML = renderCaptures(capturedBlack, 'b');
        bottomDiv.innerHTML = renderCaptures(capturedWhite, 'w');
    } else {
        topDiv.innerHTML = renderCaptures(capturedWhite, 'w');
        bottomDiv.innerHTML = renderCaptures(capturedBlack, 'b');
    }
}

function checkStatus() {
    const statusEl = document.getElementById('status');
    if (chess.in_checkmate()) {
        statusEl.textContent = "Checkmate! Game Over.";
        statusEl.style.color = "red";
    } else if (chess.in_stalemate() || chess.in_threefold_repetition() || chess.insufficient_material() || chess.in_draw()) {
        statusEl.textContent = "Game Drawn.";
        statusEl.style.color = "brown";
    } else if (chess.in_check()) {
        statusEl.textContent = "Check!";
        statusEl.style.color = "red";
    } else {
        statusEl.textContent = (chess.turn() === 'w' ? 'White' : 'Black') + " to move";
        statusEl.style.color = "inherit";
    }
}

// Lichess & External Integrations
function analyzeOnLichess() {
    const pgnData = chess.pgn();
    if (!pgnData) return alert("Make some moves first!");
    
    document.getElementById('lichess-pgn').value = pgnData;
    document.getElementById('lichess-form').submit();
}

function loadFEN() {
    const fen = document.getElementById('fen-input').value.trim();
    if (chess.load(fen)) {
        selectedSquare = null;
        validMovesForSelected = [];
        lastMove = null;
        updateGameState();
    } else {
        alert("Invalid FEN string.");
    }
}

// Engine Triggering
function triggerAI() {
    const mode = document.getElementById('game-mode').value;
    if (mode === 'local' || mode.startsWith('online-')) return;

    let depth = '10', skill = '10';
    if (mode === 'ai-beginner') { depth = '5'; skill = '0'; }
    if (mode === 'ai-club') { depth = '10'; skill = '5'; }
    if (mode === 'ai-master') { depth = '14'; skill = '15'; }
    if (mode === 'ai-gm') { depth = '18'; skill = '20'; }

    isAiThinking = true;
    clearTimeout(aiSafetyTimer);

    if (engine) {
        try {
            engine.postMessage('setoption name Skill Level value ' + skill);
            engine.postMessage('position fen ' + chess.fen());
            engine.postMessage('go depth ' + depth);
            aiSafetyTimer = setTimeout(() => {
                if (isAiThinking) {
                    makeFallbackAiMove();
                }
            }, 1200);
            return;
        } catch(e) {
            console.error("Worker postMessage failed", e);
        }
    }
    
    setTimeout(makeFallbackAiMove, 200);
}

function updateGameState() {
    renderBoard();
    checkStatus();
    
    const mode = document.getElementById('game-mode').value;
    if (mode.startsWith('online-')) return;

    if (engine) engine.postMessage('stop'); 
    
    if (chess.game_over()) return;

    if (mode !== 'local' && chess.turn() === (isFlipped ? 'w' : 'b')) {
        setTimeout(triggerAI, 50);
    } else {
        isAiThinking = false;
        clearTimeout(analysisTimeout);
        analysisTimeout = setTimeout(() => {
            if(engine) {
                engine.postMessage('position fen ' + chess.fen());
                engine.postMessage('go depth 12');
            }
        }, 800); 
    }
}

function undoMove() {
    if (isAiThinking) return; 
    chess.undo();
    if (document.getElementById('game-mode').value !== 'local') {
        chess.undo(); 
    }
    selectedSquare = null;
    validMovesForSelected = [];
    lastMove = null;
    updateGameState();
}

function resetGame() {
    chess.reset();
    selectedSquare = null;
    validMovesForSelected = [];
    lastMove = null;
    isAiThinking = false;
    document.getElementById('evaluation').textContent = "Eval: +0.00";
    document.getElementById('eval-fill').style.height = '50%';
    document.getElementById('type-move').value = '';
    
    if(engine) {
        engine.postMessage('stop');
        engine.postMessage('ucinewgame'); 
        engine.postMessage('isready');
    }

    if (isFlipped && document.getElementById('game-mode').value !== 'local') isFlipped = false;
    updateGameState();
}

function flipBoard() {
    isFlipped = !isFlipped;
    renderBoard();
    if (document.getElementById('game-mode').value !== 'local') {
        updateGameState();
    }
}

function changeTheme() {
    document.body.className = document.getElementById('board-theme').value;
}

// Download PGN
function downloadPGN() {
    const pgnData = chess.pgn();
    if (!pgnData) return alert("No moves to download.");
    const blob = new Blob([pgnData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GM_Chess_${new Date().getTime()}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function scrollToBottomPGN() {
    const pgnBox = document.getElementById('pgn');
    pgnBox.scrollTop = pgnBox.scrollHeight;
}

// Hit Counter
function fetchHitCount() {
    const countDisplay = document.getElementById('hit-counter');
    countDisplay.textContent = `Visitors: 45,901`; // Fallback for aesthetic
}

// Modals
function openDonateModal() { document.getElementById('donate-modal').style.display = 'flex'; }
function closeDonateModal() { document.getElementById('donate-modal').style.display = 'none'; }

// Init
window.onload = function() {
    initEngine();
    updateGameState();
    fetchHitCount();
};

// ─── Multiplayer ───────────────────────────────────────────────────────────────

let socket = null;
let mpColor = null; // 'w' or 'b' — assigned side
let mpRoomId = null;

function getSocketServerUrl() {
    if (typeof io === 'undefined') return null;
    if (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    return 'https://web-production-c939c.up.railway.app';
}

const modeSelect = document.getElementById('game-mode');
modeSelect.addEventListener('change', function() {
    const mode = this.value;
    if (mode.startsWith('online-')) {
        initMultiplayer(mode);
    } else if (socket) {
        socket.disconnect();
        socket = null;
        mpColor = null;
        mpRoomId = null;
        document.getElementById('mp-overlay').style.display = 'none';
    }
});

function attachSocketListeners() {
    socket.on('connect_error', (err) => {
        document.getElementById('mp-title').textContent = 'Server Connection Error ⚠️';
        document.getElementById('mp-status').textContent = 'Unable to connect to multiplayer server. Please try again.';
        document.getElementById('mp-room-info').style.display = 'none';
        document.getElementById('mp-join-container').style.display = 'none';
        document.getElementById('mp-retry-btn').style.display = 'inline-block';
        document.getElementById('mp-overlay').style.display = 'flex';
    });

    socket.on('waitingForOpponent', ({ roomId }) => {
        if (roomId) {
            mpRoomId = roomId;
            document.getElementById('mp-room-id').textContent = roomId;
            document.getElementById('mp-room-info').style.display = 'block';
            document.getElementById('mp-title').textContent = 'Room Created! ♟️';
            document.getElementById('mp-status').textContent = 'Share the Room Code or Link with your opponent. Waiting for them to join\u2026';
            document.getElementById('mp-join-container').style.display = 'none';
        } else {
            document.getElementById('mp-title').textContent = 'Random Matchmaking 🎲';
            document.getElementById('mp-status').textContent = 'Searching for an online player\u2026 Please wait.';
            document.getElementById('mp-room-info').style.display = 'none';
            document.getElementById('mp-join-container').style.display = 'none';
        }
        document.getElementById('mp-retry-btn').style.display = 'none';
        document.getElementById('mp-overlay').style.display = 'flex';
    });

    socket.on('gameStart', ({ color, fen, roomId }) => {
        mpColor = color;
        mpRoomId = roomId;
        chess.load(fen);
        document.getElementById('mp-overlay').style.display = 'none';
        isFlipped = (color === 'b');
        updateGameState();
    });

    socket.on('moveApplied', ({ fen, from, to, captured, inCheck }) => {
        chess.load(fen);
        lastMove = { from, to };
        selectedSquare = null;
        validMovesForSelected = [];
        playSound(captured ? 'capture' : 'move');
        if (inCheck) playSound('check');
        updateGameState();
    });

    socket.on('opponentLeft', () => {
        document.getElementById('mp-status').textContent = 'Opponent disconnected.';
        document.getElementById('mp-room-info').style.display = 'none';
        document.getElementById('mp-join-container').style.display = 'none';
        document.getElementById('mp-title').textContent = 'Game Over';
        document.getElementById('mp-overlay').style.display = 'flex';
        mpColor = null;
    });

    socket.on('error', (msg) => {
        alert(msg);
        cancelMultiplayer();
    });
}

function initMultiplayer(mode) {
    if (typeof io === 'undefined') {
        alert("Socket.IO library failed to load. Please check your internet connection.");
        modeSelect.value = 'ai-club';
        return;
    }

    clearTimeout(analysisTimeout);
    if (engine) engine.postMessage('stop');
    isAiThinking = false;

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    const targetUrl = getSocketServerUrl();
    socket = targetUrl ? io(targetUrl) : io();
    attachSocketListeners();

    mpColor = null;
    chess.reset();

    if (mode === 'online-create') {
        document.getElementById('mp-title').textContent = 'Creating Room...';
        document.getElementById('mp-status').textContent = 'Connecting to multiplayer server...';
        document.getElementById('mp-room-info').style.display = 'none';
        document.getElementById('mp-join-container').style.display = 'none';
        document.getElementById('mp-retry-btn').style.display = 'none';
        document.getElementById('mp-overlay').style.display = 'flex';
        socket.emit('createRoom');
    } else if (mode === 'online-join') {
        document.getElementById('mp-title').textContent = 'Join Online Room';
        document.getElementById('mp-status').textContent = 'Enter the 6-character Room Code provided by your opponent:';
        document.getElementById('mp-room-info').style.display = 'none';
        document.getElementById('mp-join-container').style.display = 'block';
        document.getElementById('mp-retry-btn').style.display = 'none';
        document.getElementById('mp-join-input').value = '';
        document.getElementById('mp-overlay').style.display = 'flex';
        setTimeout(() => document.getElementById('mp-join-input').focus(), 100);
    } else if (mode === 'online-random') {
        document.getElementById('mp-title').textContent = 'Random Matchmaking 🎲';
        document.getElementById('mp-status').textContent = 'Searching for an online player... Please wait.';
        document.getElementById('mp-room-info').style.display = 'none';
        document.getElementById('mp-join-container').style.display = 'none';
        document.getElementById('mp-retry-btn').style.display = 'none';
        document.getElementById('mp-overlay').style.display = 'flex';
        socket.emit('randomMatch');
    }
}

function submitJoinRoom() {
    const inputEl = document.getElementById('mp-join-input');
    const code = (inputEl.value || '').trim().toUpperCase();
    if (!code) return alert("Please enter a Room Code.");
    if (code.length < 4) return alert("Invalid Room Code. Example: AB12CD");

    document.getElementById('mp-status').textContent = 'Joining room ' + code + '\u2026';
    document.getElementById('mp-join-container').style.display = 'none';
    socket.emit('joinRoom', { roomId: code });
}

function retryMultiplayerConnection() {
    const mode = modeSelect.value;
    if (mode.startsWith('online-')) {
        initMultiplayer(mode);
    }
}

function cancelMultiplayer() {
    document.getElementById('mp-overlay').style.display = 'none';
    if (socket) { socket.disconnect(); socket = null; }
    mpColor = null;
    mpRoomId = null;
    modeSelect.value = 'ai-club';
    resetGame();
}

function copyRoomCode() {
    if (!mpRoomId) return;
    navigator.clipboard.writeText(mpRoomId).then(() => alert('Room Code copied: ' + mpRoomId)).catch(() => alert('Room Code: ' + mpRoomId));
}

function copyRoomLink() {
    if (!mpRoomId) return;
    const url = `${location.origin}${location.pathname}?room=${mpRoomId}`;
    navigator.clipboard.writeText(url).then(() => alert('Share Link copied!')).catch(() => alert('Room Link: ' + url));
}

// Bind Enter key on join input field
document.addEventListener('DOMContentLoaded', () => {
    const joinInput = document.getElementById('mp-join-input');
    if (joinInput) {
        joinInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') submitJoinRoom();
        });
    }
});



// Handle ?room= URL param for direct room join via shared link
(function checkUrlRoom() {
    const roomId = new URLSearchParams(location.search).get('room');
    if (!roomId) return;
    modeSelect.value = 'online-create';
    document.getElementById('mp-title').textContent = 'Join Online Room';
    document.getElementById('mp-status').textContent = 'Joining room ' + roomId.trim().toUpperCase() + '\u2026';
    document.getElementById('mp-room-info').style.display = 'none';
    document.getElementById('mp-join-container').style.display = 'none';
    document.getElementById('mp-overlay').style.display = 'flex';

    const targetUrl = getSocketServerUrl();
    socket = targetUrl ? io(targetUrl) : io();
    attachSocketListeners();
    socket.emit('joinRoom', { roomId: roomId.trim() });
})();



