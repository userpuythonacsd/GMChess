const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

// rooms: { roomId: { players: [socketId, socketId], chess: Chess, colors: { socketId: 'w'|'b' } } }
const rooms = {};
// waiting queue for random match: single socket id or null
let waitingPlayer = null;

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function startGame(roomId) {
    const room = rooms[roomId];
    const [p1, p2] = room.players;
    room.colors = { [p1]: 'w', [p2]: 'b' };
    io.to(p1).emit('gameStart', { color: 'w', fen: room.chess.fen(), roomId });
    io.to(p2).emit('gameStart', { color: 'b', fen: room.chess.fen(), roomId });
}

io.on('connection', (socket) => {

    socket.on('createRoom', () => {
        const roomId = generateRoomId();
        rooms[roomId] = { players: [socket.id], chess: new Chess(), colors: {} };
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.emit('waitingForOpponent', { roomId });
    });

    socket.on('joinRoom', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return socket.emit('error', 'Room not found.');
        if (room.players.length >= 2) return socket.emit('error', 'Room is full.');
        room.players.push(socket.id);
        socket.join(roomId);
        socket.data.roomId = roomId;
        startGame(roomId);
    });

    socket.on('randomMatch', () => {
        if (waitingPlayer && waitingPlayer !== socket.id && io.sockets.sockets.get(waitingPlayer)) {
            // Pair with waiting player
            const roomId = generateRoomId();
            rooms[roomId] = { players: [waitingPlayer, socket.id], chess: new Chess(), colors: {} };
            const waitingSocket = io.sockets.sockets.get(waitingPlayer);
            waitingSocket.join(roomId);
            waitingSocket.data.roomId = roomId;
            socket.join(roomId);
            socket.data.roomId = roomId;
            waitingPlayer = null;
            startGame(roomId);
        } else {
            waitingPlayer = socket.id;
            socket.emit('waitingForOpponent', { roomId: null });
        }
    });

    socket.on('move', ({ from, to, promotion }) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room) return;

        const playerColor = room.colors[socket.id];
        if (room.chess.turn() !== playerColor) return; // wrong turn

        const result = room.chess.move({ from, to, promotion: promotion || 'q' });
        if (!result) return; // invalid move

        io.to(roomId).emit('moveApplied', { fen: room.chess.fen(), from: result.from, to: result.to });
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket.id) waitingPlayer = null;

        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        io.to(roomId).emit('opponentLeft');
        delete rooms[roomId];
    });
});

server.listen(PORT, () => console.log(`GMChess server running on http://localhost:${PORT}`));
