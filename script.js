// RetroGM Chess Engine & UI Controller (2026 Enhanced Edition)
const chess = new Chess();
let selectedSquare = null;
let isFlipped = false;
let isAiThinking = false;
let analysisTimeout = null;
let lastMove = null;
let validMovesForSelected = [];

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

// Extremely robust Stockfish initialization via Blob
const workerScript = `importScripts("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js");`;
const blob = new Blob([workerScript], {type: 'application/javascript'});
const engine = new Worker(URL.createObjectURL(blob));

engine.onmessage = function(event) {
    const line = event.data;
    
    // Robust parsing for bestmove 
    if (line.startsWith('bestmove') && isAiThinking) {
        const match = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (match && match[1]) {
            const moveStr = match[1];
            const from = moveStr.substring(0, 2);
            const to = moveStr.substring(2, 4);
            const promotion = moveStr.length > 4 ? moveStr[4] : 'q';
            
            const result = chess.move({ from, to, promotion });
            if(result) {
                lastMove = { from, to };
            }
            
            isAiThinking = false;
            updateGameState();
        } else {
            // Failsafe if engine bugs out
            isAiThinking = false;
            updateGameState();
        }
    }
    
    // Engine Evaluation parser
    if (line.includes('score cp')) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
            let eval = parseInt(match[1]) / 100;
            if (chess.turn() === 'b') eval = -eval; 
            document.getElementById('evaluation').textContent = "Eval: " + (eval > 0 ? "+" : "") + eval.toFixed(2);
        }
    } else if (line.includes('score mate')) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) {
            let mate = parseInt(match[1]);
            let actualMate = chess.turn() === 'b' ? -mate : mate;
            document.getElementById('evaluation').textContent = "Eval: Mate in " + Math.abs(actualMate);
        }
    }
};

engine.onerror = function(err) {
    console.error("Stockfish Engine Error:", err);
    isAiThinking = false;
};

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = ''; // Safe here, we control the generated HTML
    const board = chess.board(); 

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const boardRow = isFlipped ? 7 - r : r;
            const boardCol = isFlipped ? 7 - c : c;
            const piece = board[boardRow][boardCol];
            
            const file = String.fromCharCode(97 + boardCol);
            const rank = 8 - boardRow;
            const sq = file + rank;
            
            const squareEl = document.createElement('div');
            
            // Base square coloring
            squareEl.className = 'square ' + ((boardRow + boardCol) % 2 === 0 ? 'light' : 'dark');
            squareEl.dataset.square = sq;
            
            // Visual Highlights
            if (selectedSquare === sq) squareEl.classList.add('selected');
            if (lastMove && (lastMove.from === sq || lastMove.to === sq)) {
                squareEl.classList.add('last-move');
            }
            if (validMovesForSelected.includes(sq)) {
                squareEl.classList.add('valid-move-dot');
            }
            
            if (piece) {
                const img = document.createElement('img');
                const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
                img.src = pieceImages[key];
                img.className = 'piece';
                img.alt = key;
                squareEl.appendChild(img);
            }
            
            squareEl.addEventListener('click', () => handleSquareClick(sq));
            boardEl.appendChild(squareEl);
        }
    }
    // Secure text injection for PGN
    document.getElementById('pgn').textContent = chess.pgn();
    scrollToBottomPGN();
}

function handleSquareClick(sq) {
    if (chess.game_over()) return;
    const mode = document.getElementById('game-mode').value;
    
    // Lock board if AI is calculating
    if (mode !== 'local' && chess.turn() === 'b' && isAiThinking) return;

    if (selectedSquare) {
        // Attempt move
        const moveDetails = { from: selectedSquare, to: sq, promotion: 'q' };
        const result = chess.move(moveDetails);
        
        if (result) {
            lastMove = { from: result.from, to: result.to };
            selectedSquare = null;
            validMovesForSelected = [];
            updateGameState();
        } else {
            // Select new piece if it belongs to current player
            const piece = chess.get(sq);
            if (piece && piece.color === chess.turn()) {
                selectSquare(sq);
            } else {
                selectedSquare = null;
                validMovesForSelected = [];
                renderBoard();
            }
        }
    } else {
        const piece = chess.get(sq);
        if (piece && piece.color === chess.turn()) {
            selectSquare(sq);
        }
    }
}

function selectSquare(sq) {
    selectedSquare = sq;
    // Calculate valid moves for dot highlighting
    const moves = chess.moves({ square: sq, verbose: true });
    validMovesForSelected = moves.map(m => m.to);
    renderBoard();
}

// Blitz Typing Handling
const typeInput = document.getElementById('type-move');
typeInput.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') submitTypedMove();
});

function submitTypedMove() {
    if (chess.game_over()) return;
    
    const mode = document.getElementById('game-mode').value;
    if (mode !== 'local' && chess.turn() === 'b' && isAiThinking) {
        return; // Silent reject if typed while AI is moving
    }
    
    // Sanitize input
    const moveStr = typeInput.value.trim().replace(/[^a-zA-Z0-9=+-x#O\-]/g, '');
    if (moveStr === "") return;
    
    const result = chess.move(moveStr); 
    if (result) {
        lastMove = { from: result.from, to: result.to };
        typeInput.value = '';
        typeInput.focus();
        selectedSquare = null;
        validMovesForSelected = [];
        updateGameState();
    } else {
        // Visual shake or red outline for bad input could go here
        alert("Invalid FIDE notation. Example: e4, Nf3, O-O");
    }
}

function checkStatus() {
    const statusEl = document.getElementById('status');
    if (chess.in_checkmate()) {
        statusEl.textContent = "Checkmate! Game Over.";
        statusEl.style.color = "red";
    } else if (chess.in_stalemate()) {
        statusEl.textContent = "Stalemate! Draw.";
        statusEl.style.color = "brown";
    } else if (chess.in_threefold_repetition()) {
        statusEl.textContent = "Draw (Threefold Repetition)!";
        statusEl.style.color = "brown";
    } else if (chess.insufficient_material()) {
        statusEl.textContent = "Draw (Insufficient Material)!";
        statusEl.style.color = "brown";
    } else if (chess.in_draw()) {
        statusEl.textContent = "Draw (50-Move Rule)!";
        statusEl.style.color = "brown";
    } else if (chess.in_check()) {
        statusEl.textContent = "Check!";
        statusEl.style.color = "red";
    } else {
        let turn = chess.turn() === 'w' ? 'White' : 'Black';
        statusEl.textContent = turn + " to move";
        statusEl.style.color = "var(--win-blue)";
    }
}

function triggerAI() {
    const mode = document.getElementById('game-mode').value;
    if (mode === 'local' || mode === 'online-create' || mode === 'online-join') return;

    let depth = '10'; // Medium
    if (mode === 'ai-easy') depth = '5';
    if (mode === 'ai-hard') depth = '15';

    isAiThinking = true;
    engine.postMessage('position fen ' + chess.fen());
    engine.postMessage('go depth ' + depth);
}

function updateGameState() {
    renderBoard();
    checkStatus();

    const mode = document.getElementById('game-mode').value;

    // Online multiplayer: no AI, no Stockfish analysis
    if (mode === 'online-create' || mode === 'online-join') return;

    engine.postMessage('stop'); // Halt analysis immediately
    if (chess.game_over()) return;

    if (mode !== 'local' && chess.turn() === 'b') {
        // Prevent race condition, add tiny delay for UI update
        setTimeout(triggerAI, 50);
    } else {
        // Human Turn -> Background GM Evaluation Analysis
        isAiThinking = false;
        clearTimeout(analysisTimeout);
        analysisTimeout = setTimeout(() => {
            engine.postMessage('position fen ' + chess.fen());
            engine.postMessage('go depth 15');
        }, 500);
    }
}

function resetGame() {
    chess.reset();
    selectedSquare = null;
    validMovesForSelected = [];
    lastMove = null;
    isAiThinking = false;
    document.getElementById('evaluation').textContent = "Eval: +0.00";
    document.getElementById('type-move').value = '';
    
    engine.postMessage('stop');
    engine.postMessage('ucinewgame'); // Crucial to prevent AI freeze on restart
    engine.postMessage('isready');

    // If flipped and playing AI, flip back to white
    if (isFlipped && document.getElementById('game-mode').value !== 'local') {
        isFlipped = false;
    }
    
    updateGameState();
}

function flipBoard() {
    isFlipped = !isFlipped;
    renderBoard();
}

function downloadPGN() {
    const pgnData = chess.pgn();
    if (!pgnData) return alert("No moves to download.");
    
    const blob = new Blob([pgnData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GM_Chess_Game_${new Date().getTime()}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function scrollToBottomPGN() {
    const pgnBox = document.getElementById('pgn');
    pgnBox.scrollTop = pgnBox.scrollHeight;
}

// Initialize application
window.onload = function() {
    engine.postMessage('uci'); // boot sequence
    engine.postMessage('isready');
    updateGameState();
};

// ─── Multiplayer ───────────────────────────────────────────────────────────────

let socket = null;
let mpColor = null; // 'w' or 'b' — this client's assigned color
let mpRoomId = null;

const modeSelect = document.getElementById('game-mode');
modeSelect.addEventListener('change', function() {
    const mode = this.value;
    if (mode === 'online-create' || mode === 'online-join') {
        initMultiplayer(mode);
    } else if (socket) {
        // Clean up socket if switching away from an online mode
        socket.disconnect();
        socket = null;
        mpColor = null;
        mpRoomId = null;
        document.getElementById('mp-overlay').style.display = 'none';
    }
});


function attachSocketListeners() {
    socket.on('waitingForOpponent', ({ roomId }) => {
        if (roomId) {
            mpRoomId = roomId;
            document.getElementById('mp-room-id').textContent = roomId;
            document.getElementById('mp-room-info').style.display = '';
            document.getElementById('mp-title').textContent = 'Create Room';
        }
        document.getElementById('mp-status').textContent = 'Waiting for opponent\u2026';
        document.getElementById('mp-overlay').style.display = '';
    });
    socket.on('gameStart', ({ color, fen, roomId }) => {
        mpColor = color;
        mpRoomId = roomId;
        chess.load(fen);
        document.getElementById('mp-overlay').style.display = 'none';
        isFlipped = (color === 'b');
        updateGameState();
    });
    socket.on('moveApplied', ({ fen, from, to }) => {
        chess.load(fen);
        lastMove = { from, to };
        selectedSquare = null;
        validMovesForSelected = [];
        updateGameState();
    });
    socket.on('opponentLeft', () => {
        document.getElementById('mp-status').textContent = 'Opponent disconnected.';
        document.getElementById('mp-room-info').style.display = 'none';
        document.getElementById('mp-title').textContent = 'Game Over';
        document.getElementById('mp-overlay').style.display = '';
        mpColor = null;
    });
    socket.on('error', (msg) => alert(msg));
}

function initMultiplayer(mode) {
    // Stop any running AI analysis before entering online mode
    clearTimeout(analysisTimeout);
    engine.postMessage('stop');
    isAiThinking = false;

    if (socket) {
        // Disconnect to cleanly leave any existing server room before starting fresh
        socket.disconnect();
        socket = null;
    }
    socket = io();
    attachSocketListeners();

    mpColor = null;
    chess.reset();
    document.getElementById('mp-room-info').style.display = 'none';

    if (mode === 'online-create') {
        socket.emit('createRoom');
    } else {
        document.getElementById('mp-title').textContent = 'Random Match';
        document.getElementById('mp-status').textContent = 'Finding opponent\u2026';
        document.getElementById('mp-overlay').style.display = '';
        socket.emit('randomMatch');
    }
}


function cancelMultiplayer() {
    document.getElementById('mp-overlay').style.display = 'none';
    if (socket) { socket.disconnect(); socket = null; }
    mpColor = null;
    mpRoomId = null;
    modeSelect.value = 'ai-medium';
    resetGame();
}

function copyRoomLink() {
    const url = `${location.origin}${location.pathname}?room=${mpRoomId}`;
    navigator.clipboard.writeText(url).then(() => alert('Link copied!')).catch(() => alert('Room ID: ' + mpRoomId));
}

// Intercept handleSquareClick for multiplayer enforcement
const _origHandleSquareClick = handleSquareClick;
function handleSquareClick(sq) {
    const mode = document.getElementById('game-mode').value;
    if (mode !== 'online-create' && mode !== 'online-join') {
        return _origHandleSquareClick(sq);
    }
    if (!mpColor || chess.game_over() || chess.turn() !== mpColor) return;

    if (selectedSquare) {
        if (chess.moves({ verbose: true }).some(m => m.from === selectedSquare && m.to === sq)) {
            socket.emit('move', { from: selectedSquare, to: sq, promotion: 'q' });
            selectedSquare = null;
            validMovesForSelected = [];
        } else {
            const piece = chess.get(sq);
            if (piece && piece.color === mpColor) {
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
}

// Intercept submitTypedMove for multiplayer enforcement
const _origSubmitTypedMove = submitTypedMove;
function submitTypedMove() {
    const mode = document.getElementById('game-mode').value;
    if (mode !== 'online-create' && mode !== 'online-join') {
        return _origSubmitTypedMove();
    }
    if (!mpColor || chess.game_over() || chess.turn() !== mpColor) return;

    const moveStr = document.getElementById('type-move').value.trim().replace(/[^a-zA-Z0-9=+\-x#O]/g, '');
    if (!moveStr) return;

    const testChess = new Chess(chess.fen());
    const result = testChess.move(moveStr);
    if (!result) return alert('Invalid FIDE notation. Example: e4, Nf3, O-O');

    socket.emit('move', { from: result.from, to: result.to, promotion: result.promotion || 'q' });
    document.getElementById('type-move').value = '';
}

// Handle ?room= URL param for direct room join via shared link
(function checkUrlRoom() {
    const roomId = new URLSearchParams(location.search).get('room');
    if (!roomId) return;
    modeSelect.value = 'online-create';
    socket = io();
    attachSocketListeners();
    document.getElementById('mp-title').textContent = 'Join Room';
    document.getElementById('mp-status').textContent = 'Joining room ' + roomId + '\u2026';
    document.getElementById('mp-overlay').style.display = '';
    socket.emit('joinRoom', { roomId });
})();

