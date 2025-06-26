const WebSocket = require('ws');
const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const messages = [];

wss.on('connection', (ws) => {
  let userId = `ws_${Math.random().toString(36).slice(2)}`;

  // Send history
  ws.send(JSON.stringify({ type: 'history', messages }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Handle presence
      if (data.type === 'presence') {
        ws.userId = data.userId || userId;
        ws.send(JSON.stringify({ type: 'presence', status: 'online' }));
        return;
      }

      // Handle message
      if (data.type === 'message') {
        const msg = {
          type: 'message',
          text: data.text,
          userId: data.userId || userId,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        messages.push(msg);

        // Broadcast to all
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msg));
          }
        });
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});