import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" } 
});

const PORT = process.env.PORT || 3000;

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'dist')));

// WebSocket Logic for "Server Mode"
io.on('connection', (socket) => {
  
  // Join a specific class room
  socket.on('join_room', (roomCode) => {
    socket.join(roomCode);
    // console.log(`Socket ${socket.id} joined room ${roomCode}`);
  });

  // Relay messages (Teacher -> Students or Students -> Teacher)
  socket.on('message', ({ roomCode, message }) => {
    // Broadcast to everyone else in the room
    socket.to(roomCode).emit('message', message);
  });

  socket.on('disconnect', () => {
    // console.log('User disconnected');
  });
});

// Handle React Routing (SPA) - Return index.html for all 404s
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Mode: Docker/WebSocket (Reliable)`);
});