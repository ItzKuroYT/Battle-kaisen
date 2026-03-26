const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: clients.size, queue: queue.length, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Battle Kaisen WebSocket server is running.');
});

const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Map(); // clientId -> ws
const wsMeta = new WeakMap(); // ws -> { clientId, roomId }
const queue = [];
const rooms = new Map(); // roomId -> { p1Id, p2Id }
let roomCounter = 0;

function send(ws, payload) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sendToClient(clientId, payload) {
  const ws = clients.get(clientId);
  send(ws, payload);
}

function dropFromQueue(clientId) {
  const idx = queue.indexOf(clientId);
  if (idx >= 0) queue.splice(idx, 1);
}

function removeRoomByClient(clientId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.p1Id === clientId || room.p2Id === clientId) {
      const otherId = room.p1Id === clientId ? room.p2Id : room.p1Id;
      rooms.delete(roomId);
      sendToClient(otherId, { type: 'peer-left', roomId });
      return;
    }
  }
}

function tryMatchmake() {
  while (queue.length >= 2) {
    const p1Id = queue.shift();
    const p2Id = queue.shift();
    if (!clients.has(p1Id) || !clients.has(p2Id)) {
      if (clients.has(p1Id)) queue.unshift(p1Id);
      if (clients.has(p2Id)) queue.unshift(p2Id);
      continue;
    }

    roomCounter += 1;
    const roomId = `room-${roomCounter}`;
    rooms.set(roomId, { p1Id, p2Id });

    const p1ws = clients.get(p1Id);
    const p2ws = clients.get(p2Id);
    wsMeta.set(p1ws, { clientId: p1Id, roomId });
    wsMeta.set(p2ws, { clientId: p2Id, roomId });

    sendToClient(p1Id, { type: 'matched', roomId, role: 'p1', peerId: p2Id });
    sendToClient(p2Id, { type: 'matched', roomId, role: 'p2', peerId: p1Id });
  }
}

wss.on('connection', (ws) => {
  wsMeta.set(ws, { clientId: '', roomId: '' });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      return;
    }

    if (msg.type === 'joinQueue') {
      const clientId = String(msg.clientId || '').trim();
      if (!clientId) return;
      clients.set(clientId, ws);
      wsMeta.set(ws, { clientId, roomId: '' });
      dropFromQueue(clientId);
      queue.push(clientId);
      tryMatchmake();
      return;
    }

    if (msg.type === 'input') {
      const roomId = String(msg.roomId || '');
      const room = rooms.get(roomId);
      if (!room) return;

      const senderId = String(msg.from || '');
      if (!senderId) return;
      const targetId = room.p1Id === senderId ? room.p2Id : room.p1Id;
      sendToClient(targetId, {
        type: 'input',
        roomId,
        side: msg.side,
        keys: msg.keys || {},
        mouse: msg.mouse || { left: false, right: false, x: 550, y: 280 }
      });
      return;
    }

    if (msg.type === 'leaveRoom') {
      const clientId = String(msg.clientId || '');
      if (!clientId) return;
      removeRoomByClient(clientId);
      dropFromQueue(clientId);
    }
  });

  ws.on('close', () => {
    const meta = wsMeta.get(ws);
    if (!meta || !meta.clientId) return;
    const { clientId } = meta;
    clients.delete(clientId);
    dropFromQueue(clientId);
    removeRoomByClient(clientId);
  });
});

server.listen(PORT, () => {
  console.log(`Battle Kaisen ws-server listening on :${PORT}`);
});
