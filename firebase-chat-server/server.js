// Basic chat server with Socket.IO and WebSocket for real-time messaging and signaling
const http = require('http');
const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const winston = require('winston');
const { Server } = require('socket.io');
const WebSocket = require('ws');

// Load env vars
dotenv.config();

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// Express app
const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors());

// HTTP & Socket.IO server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Attach a raw WebSocket server to the same HTTP server
const wss = new WebSocket.Server({ server });

// In-memory storage for messages
const messages = [];

io.on('connection', (socket) => {
  let userId = socket.id;
  logger.info(`User connected: ${userId}`);

  // Send message history to the new user
  socket.emit('history', { messages: Array.from(messages) });

  socket.on('chat', (data) => {
    const msg = {
      from: userId,
      message: data.message,
      timestamp: Date.now(),
      type: data.type || 'chat',
    };
    messages.push(msg);
    io.emit('chat', msg); // Broadcast to all users
  });

  // Voice message event
  socket.on('voice', (data) => {
    // data: { audio: <base64 or binary>, from: userId, timestamp }
    const voiceMsg = {
      from: userId,
      audio: data.audio, // base64 or binary
      timestamp: Date.now(),
      type: 'voice',
    };
    io.emit('voice', voiceMsg);
  });

  // WebRTC signaling for video conference
  socket.on('signal', (data) => {
    if (data.to) {
      io.to(data.to).emit('signal', {
        from: userId,
        signal: data.signal,
      });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${userId}`);
  });
});

wss.on('connection', (ws) => {
  let userId = `ws_${Math.random().toString(36).slice(2)}`;
  // Send message history to the new user
  ws.send(JSON.stringify({ type: 'history', messages: Array.from(messages) }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'chat':
          const msg = {
            from: userId,
            message: data.message,
            timestamp: Date.now(),
            type: 'chat',
          };
          messages.push(msg);
          // Broadcast to all WebSocket users
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client !== ws) {
              client.send(JSON.stringify({ type: 'chat', ...msg }));
            }
          });
          // Also broadcast to Socket.IO users
          io.emit('chat', msg);
          break;
        case 'voice':
          // { audio: <base64 or binary> }
          const voiceMsg = {
            from: userId,
            audio: data.audio,
            timestamp: Date.now(),
            type: 'voice',
          };
          // Broadcast to all WebSocket users
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client !== ws) {
              client.send(JSON.stringify({ type: 'voice', ...voiceMsg }));
            }
          });
          // Also broadcast to Socket.IO users
          io.emit('voice', voiceMsg);
          break;
        case 'signal':
          if (data.to) {
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client.userId === data.to) {
                client.send(JSON.stringify({ type: 'signal', from: userId, signal: data.signal }));
              }
            });
            io.to(data.to).emit('signal', { from: userId, signal: data.signal });
          }
          break;
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
  ws.on('close', () => {
    // No room/user cleanup needed
  });
  ws.userId = userId;
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});