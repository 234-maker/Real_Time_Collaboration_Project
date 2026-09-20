import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory room state storage
// Structure:
// rooms: {
//   [roomId]: {
//     drawHistory: [ { type, points, color, width, shapeType, x, y, w, h, text } ],
//     stickyNotes: { [noteId]: { id, x, y, text, color } },
//     notesContent: string,
//     users: { [socketId]: { id, username, color, cursor: {x, y} } }
//   }
// }
const rooms = {};

// Clean up empty rooms periodically
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (Object.keys(room.users).length === 0) {
      delete rooms[roomId];
      console.log(`🧹 Room [${roomId}] was empty and has been removed.`);
    }
  }
}, 60000 * 15); // Every 15 minutes

io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // Track room ID for cleanup on disconnect
  let currentRoomId = null;

  socket.on('join-room', ({ roomId, username, color }) => {
    currentRoomId = roomId;
    socket.join(roomId);

    // Initialize room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        drawHistory: [],
        stickyNotes: {},
        notesContent: '# Real-time Notepad\n\nType here to collaborate! Support markdown notation like *italics*, **bold**, lists, and checkmarks.',
        users: {}
      };
    }

    const room = rooms[roomId];
    
    // Register user
    room.users[socket.id] = {
      id: socket.id,
      username: username || `Guest_${socket.id.substring(0, 4)}`,
      color: color || '#FF5733',
      cursor: { x: 0, y: 0 }
    };

    console.log(`👤 User [${room.users[socket.id].username}] joined room [${roomId}]`);

    // Send current room state to the newly joined user
    socket.emit('room-init', {
      drawHistory: room.drawHistory,
      stickyNotes: Object.values(room.stickyNotes),
      notesContent: room.notesContent,
      users: Object.values(room.users),
      myId: socket.id
    });

    // Broadcast update user list to the room
    io.to(roomId).emit('users-update', Object.values(room.users));
    
    // Broadcast user joined activity message
    socket.to(roomId).emit('activity-log', {
      type: 'join',
      username: room.users[socket.id].username,
      color: room.users[socket.id].color,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  // Handle draw action
  socket.on('draw-action', (action) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    
    rooms[currentRoomId].drawHistory.push(action);
    // Broadcast draw action to other users in the room
    socket.to(currentRoomId).emit('draw-action', action);
  });

  // Handle undo draw actions
  socket.on('undo-action', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    
    const room = rooms[currentRoomId];
    // Remove last stroke or action
    if (room.drawHistory.length > 0) {
      room.drawHistory.pop();
      io.to(currentRoomId).emit('canvas-rebuild', room.drawHistory);
    }
  });

  // Handle clear canvas
  socket.on('clear-canvas', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;

    rooms[currentRoomId].drawHistory = [];
    io.to(currentRoomId).emit('clear-canvas');
  });

  // Handle sticky note create/update
  socket.on('sticky-note-save', (note) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;

    rooms[currentRoomId].stickyNotes[note.id] = note;
    // Broadcast note details to others in room
    socket.to(currentRoomId).emit('sticky-note-save', note);
  });

  // Handle sticky note delete
  socket.on('sticky-note-delete', (noteId) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;

    if (rooms[currentRoomId].stickyNotes[noteId]) {
      delete rooms[currentRoomId].stickyNotes[noteId];
      socket.to(currentRoomId).emit('sticky-note-delete', noteId);
    }
  });

  // Handle real-time note (notepad) edit
  socket.on('note-update', ({ content, selection }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;

    rooms[currentRoomId].notesContent = content;
    // Broadcast content and cursor/selection info to other clients
    socket.to(currentRoomId).emit('note-update', {
      content,
      senderId: socket.id,
      selection
    });
  });

  // Handle active cursor movement
  socket.on('cursor-move', (coords) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;

    const room = rooms[currentRoomId];
    if (room.users[socket.id]) {
      room.users[socket.id].cursor = coords;
      // Broadcast cursor coordinates to everyone except sender
      socket.to(currentRoomId).emit('cursor-move', {
        id: socket.id,
        username: room.users[socket.id].username,
        color: room.users[socket.id].color,
        cursor: coords
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);

    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const username = room.users[socket.id]?.username;
      const color = room.users[socket.id]?.color;

      delete room.users[socket.id];

      // Broadcast user left event and updated list
      socket.to(currentRoomId).emit('users-update', Object.values(room.users));
      socket.to(currentRoomId).emit('cursor-leave', socket.id);

      if (username) {
        socket.to(currentRoomId).emit('activity-log', {
          type: 'leave',
          username: username,
          color: color,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Unified Collaboration Server running at http://localhost:${PORT}`);
});
