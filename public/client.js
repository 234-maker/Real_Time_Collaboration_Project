// Synapse Collaborative Workspace Client-side Logic

// -------------------------------------------------------------
// Global Variables & Configuration
// -------------------------------------------------------------
let socket = null;
let myId = null;
let myUsername = '';
let myColor = '';
let currentRoom = '';

// Room Presence States
let usersList = [];
let remoteCursors = {};

// Viewport & Scaling states
const viewports = {
  activeView: 'canvas', // 'canvas', 'notes', 'split'
};

// Markdown simple compiler utility
const markdownCompile = (text) => {
  if (!text) return '';
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold & Italics
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');

  // Checkboxes
  html = html.replace(/^- \[x\] (.*?)$/gm, '<label><input type="checkbox" checked disabled> $1</label><br>');
  html = html.replace(/^- \[ \] (.*?)$/gm, '<label><input type="checkbox" disabled> $1</label><br>');

  // Unordered lists
  html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');

  // Blockquotes
  html = html.replace(/^&gt; (.*?)$/gm, '<blockquote>$1</blockquote>');

  // Code blocks
  html = html.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
};

// -------------------------------------------------------------
// Whiteboard Canvas State & Config
// -------------------------------------------------------------
const canvas = document.getElementById('whiteboard-canvas');
const ctx = canvas.getContext('2d');
const viewportContainer = document.getElementById('canvas-viewport');
const stickyLayer = document.getElementById('sticky-notes-layer');

let drawHistory = [];
let currentTool = 'pen'; // 'pen', 'line', 'rectangle', 'circle', 'text', 'sticky', 'eraser'
let currentColor = '#ffffff';
let currentBrushSize = 5;

// Pan & Zoom matrices
let zoom = 1.0;
let offset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

// Drawing coordinates state
let isDrawing = false;
let startPoint = { x: 0, y: 0 }; // Canvas space start coordinates
let activeStrokePoints = []; // Stores pen coordinates during a stroke

// Text tool active input tracker
let activeTextInput = null;

// Sticky notes state
let stickyNotes = [];

// -------------------------------------------------------------
// DOM Elements selection
// -------------------------------------------------------------
const entryScreen = document.getElementById('entry-screen');
const appWorkspace = document.getElementById('app-workspace');
const joinForm = document.getElementById('join-form');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const generateRoomBtn = document.getElementById('generate-room-btn');
const displayRoomId = document.getElementById('display-room-id');
const copyRoomBtn = document.getElementById('copy-room-btn');
const usersListContainer = document.getElementById('users-list');
const userCountDisplay = document.getElementById('user-count');
const activityLogs = document.getElementById('activity-logs');
const leaveWorkspaceBtn = document.getElementById('leave-workspace-btn');

// View selectors
const tabCanvas = document.getElementById('tab-canvas');
const tabNotes = document.getElementById('tab-notes');
const tabSplit = document.getElementById('tab-split');
const panelCanvas = document.getElementById('panel-canvas');
const panelNotes = document.getElementById('panel-notes');

// Whiteboard UI components
const toolButtons = document.querySelectorAll('.tool-btn');
const colorSwatches = document.querySelectorAll('.color-swatch');
const brushSizeSlider = document.getElementById('brush-size');
const brushPreview = document.getElementById('brush-preview');
const undoBtn = document.getElementById('undo-btn');
const clearBtn = document.getElementById('clear-btn');
const downloadBtn = document.getElementById('download-btn');
const textControls = document.getElementById('text-controls');
const fontFamilySelect = document.getElementById('font-family-select');
const zoomValueDisplay = document.getElementById('zoom-value');

// Notes UI components
const notesTextarea = document.getElementById('notes-textarea');
const btnTogglePreview = document.getElementById('btn-toggle-preview');
const previewPane = document.getElementById('preview-pane');
const markdownPreviewContent = document.getElementById('markdown-preview-content');
const lineCountDisplay = document.getElementById('line-count');
const wordCountDisplay = document.getElementById('word-count');
const activeEditorsList = document.getElementById('active-editors-list');
const typingIndicator = document.getElementById('typing-indicator');

// -------------------------------------------------------------
// 1. Initial Launch Setup
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Generate random room id by default
  roomInput.value = generateUUID().substring(0, 8);
  
  // Parse room ID from URL query param if present
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoom = urlParams.get('room');
  if (urlRoom) {
    roomInput.value = urlRoom;
  }

  // Setup SVG icons via Lucide
  lucide.createIcons();

  // Resize canvas initially
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Set up brush preview size
  updateBrushPreview();
});

// Helper: UUID generator
function generateUUID() {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}

// Generate Room ID Button click
generateRoomBtn.addEventListener('click', () => {
  roomInput.value = generateUUID().substring(0, 8);
});

// Color picker for Join screen avatars
const avatarColors = document.querySelectorAll('.avatar-color');
let selectedAvatarColor = '#ff3366';
avatarColors.forEach(el => {
  el.addEventListener('click', () => {
    avatarColors.forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    selectedAvatarColor = el.getAttribute('data-color');
  });
});

// Submit Join Form
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  myUsername = usernameInput.value.trim();
  currentRoom = roomInput.value.trim();
  myColor = selectedAvatarColor;

  if (myUsername && currentRoom) {
    if (typeof io === 'undefined') {
      console.warn("Socket.io is undefined. Starting Offline Sandbox.");
      startOfflineSandbox();
    } else {
      initializeSocketConnection();
    }
  }
});

// -------------------------------------------------------------
// 2. Socket.io Event Handling & Offline Mode
// -------------------------------------------------------------
function startOfflineSandbox() {
  myId = 'local-user';
  if (socket) {
    try { socket.disconnect(); } catch (err) {}
    socket = null;
  }

  // Populate sandbox state
  drawHistory = [];
  stickyNotes = [];
  notesTextarea.value = '# Offline Sandbox Mode\n\nYou are working locally because the server is not running or Socket.io is unavailable.\n\n### Available features in Sandbox:\n- Whiteboard drawing (Pen, shapes, text, eraser)\n- Draggable sticky notes\n- Zoom & Pan (Space + drag)\n- Markdown note taking\n- Clear and download drawings\n\nTo enable live real-time sync with other users, please run `npm install` and `npm start` in your workspace terminal, then reload this page.';
  updateNotesStats();

  usersList = [{ id: 'local-user', username: myUsername, color: myColor }];
  renderCollaborators();

  // Re-render collaborators to show Offline tag
  const statusEl = document.querySelector('.user-status');
  if (statusEl) {
    statusEl.textContent = 'offline sandbox';
    statusEl.style.color = '#ff9f1c';
  }

  // Change pulse indicator to yellow (offline warning)
  const pulseEl = document.querySelector('.pulse-indicator');
  if (pulseEl) {
    pulseEl.style.backgroundColor = '#ff9f1c';
    pulseEl.style.boxShadow = '0 0 8px #ff9f1c';
  }

  // Add warning banner to sidebar room card
  const roomCard = document.querySelector('.room-card');
  if (roomCard) {
    roomCard.style.border = '1px solid rgba(255, 159, 28, 0.3)';
    const roomInfo = roomCard.querySelector('.room-info');
    if (roomInfo) {
      roomInfo.innerHTML = `
        <span class="label" style="color: #ff9f1c;">Sandbox Mode</span>
        <div class="room-id-display">
          <h4>Offline Workspace</h4>
        </div>
      `;
    }
  }

  // Rebuild canvas
  redraw();

  // Hide entry screen
  entryScreen.style.opacity = 0;
  setTimeout(() => {
    entryScreen.classList.add('hidden');
    appWorkspace.classList.remove('hidden');
    resizeCanvas();
  }, 400);

  logActivity('started an offline local session.', myUsername, myColor);
}

function initializeSocketConnection() {
  // Determine server URL. If running locally as a file:/// index.html, point to port 3000.
  const serverUrl = window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;
  
  console.log(`Connecting to WebSocket server at: ${serverUrl}`);

  // Connect to backend Express server with a timeout so it doesn't hang forever
  socket = io(serverUrl, {
    timeout: 4000,
    reconnectionAttempts: 2
  });

  // Handle connection failures and fall back to sandbox gracefully
  socket.on('connect_error', (err) => {
    console.error("Connection failed:", err);
    if (!entryScreen.classList.contains('hidden')) {
      alert("Could not connect to the real-time server. Entering Offline Sandbox Mode so you can still use the workspace!");
      startOfflineSandbox();
    }
  });

  // On connection successful
  socket.on('connect', () => {
    console.log('Connected to server via WebSocket');
    
    // Join specified room
    socket.emit('join-room', {
      roomId: currentRoom,
      username: myUsername,
      color: myColor
    });

    // Update URL query string (wrapped in try-catch to prevent file:// protocol SecurityErrors)
    try {
      const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + currentRoom;
      window.history.pushState({path:newurl}, '', newurl);
    } catch (e) {
      console.warn("Could not update URL query string (likely due to file:// protocol limitations):", e);
    }
  });

  // Room initial state push from server
  socket.on('room-init', ({ drawHistory: history, stickyNotes: notes, notesContent, users, myId: socketId }) => {
    myId = socketId;
    drawHistory = history;
    stickyNotes = notes;
    notesTextarea.value = notesContent;
    updateNotesStats();

    // Populate active users
    usersList = users;
    renderCollaborators();

    // Build sticky notes in UI
    stickyLayer.innerHTML = '';
    stickyNotes.forEach(note => renderStickyNoteDOM(note));

    // Rebuild whiteboard strokes
    redraw();

    // Hide entry modal
    entryScreen.style.opacity = 0;
    setTimeout(() => {
      entryScreen.classList.add('hidden');
      appWorkspace.classList.remove('hidden');
      // Trigger canvas resize again to make sure width is correct
      resizeCanvas();
    }, 400);

    logActivity('Successfully joined the workspace.', myUsername, myColor);
  });

  // User list update
  socket.on('users-update', (users) => {
    usersList = users;
    renderCollaborators();
  });

  // Remote Drawing Sync
  socket.on('draw-action', (action) => {
    drawHistory.push(action);
    // Directly paint new stroke segment or shape without complete redraw for performance
    paintStrokeElement(action);
  });

  // Canvas rebuild (triggered on undo)
  socket.on('canvas-rebuild', (history) => {
    drawHistory = history;
    redraw();
  });

  // Clear Canvas Sync
  socket.on('clear-canvas', () => {
    drawHistory = [];
    redraw();
  });

  // Sticky Note updates
  socket.on('sticky-note-save', (note) => {
    const idx = stickyNotes.findIndex(n => n.id === note.id);
    if (idx !== -1) {
      stickyNotes[idx] = note;
      // Update DOM
      const noteEl = document.getElementById(`sticky-${note.id}`);
      if (noteEl) {
        noteEl.querySelector('textarea').value = note.text;
        noteEl.style.transform = `translate(${note.x}px, ${note.y}px)`;
        // Class updates
        noteEl.className = `sticky-note ${note.color}-note`;
      }
    } else {
      stickyNotes.push(note);
      renderStickyNoteDOM(note);
    }
  });

  socket.on('sticky-note-delete', (noteId) => {
    stickyNotes = stickyNotes.filter(n => n.id !== noteId);
    const noteEl = document.getElementById(`sticky-${noteId}`);
    if (noteEl) noteEl.remove();
  });

  // Notes document Sync
  socket.on('note-update', ({ content, senderId, selection }) => {
    // Record selection index to prevent typing caret resets
    const start = notesTextarea.selectionStart;
    const end = notesTextarea.selectionEnd;
    const scrollPos = notesTextarea.scrollTop;

    notesTextarea.value = content;
    updateNotesStats();

    // Restore caret if local client was typing
    if (document.activeElement === notesTextarea) {
      notesTextarea.setSelectionRange(start, end);
      notesTextarea.scrollTop = scrollPos;
    }

    // Update markdown preview content
    updateMarkdownPreview();

    // Render active cursor flags
    updateRemoteEditorCursors(senderId, selection);
  });

  // Cursor movements sync
  socket.on('cursor-move', ({ id, username, color, cursor }) => {
    updateRemoteCursor(id, username, color, cursor);
  });

  // Remote user cursor leave
  socket.on('cursor-leave', (id) => {
    const el = document.getElementById(`cursor-${id}`);
    if (el) el.remove();
    delete remoteCursors[id];
  });

  // Activity logs broadcast
  socket.on('activity-log', ({ type, username, color, timestamp }) => {
    if (type === 'join') {
      logActivity('joined the workspace.', username, color);
    } else if (type === 'leave') {
      logActivity('left the workspace.', username, color);
    }
  });
}

// -------------------------------------------------------------
// 3. UI Tabs & Views Switcher
// -------------------------------------------------------------
function switchView(mode) {
  viewports.activeView = mode;

  // Update tabs active state
  tabCanvas.classList.remove('active');
  tabNotes.classList.remove('active');
  tabSplit.classList.remove('active');

  panelCanvas.classList.remove('active');
  panelNotes.classList.remove('active');
  appWorkspace.classList.remove('split-mode');

  if (mode === 'canvas') {
    tabCanvas.classList.add('active');
    panelCanvas.classList.add('active');
    resizeCanvas();
  } else if (mode === 'notes') {
    tabNotes.classList.add('active');
    panelNotes.classList.add('active');
  } else if (mode === 'split') {
    tabSplit.classList.add('active');
    appWorkspace.classList.add('split-mode');
    resizeCanvas();
  }
}

tabCanvas.addEventListener('click', () => switchView('canvas'));
tabNotes.addEventListener('click', () => switchView('notes'));
tabSplit.addEventListener('click', () => switchView('split'));

// Copy invite room link click
copyRoomBtn.addEventListener('click', () => {
  const inviteUrl = window.location.href;
  navigator.clipboard.writeText(inviteUrl).then(() => {
    // Show copy tooltip notification
    const origIcon = copyRoomBtn.innerHTML;
    copyRoomBtn.innerHTML = '<i data-lucide="check" style="color:#20bf55;"></i>';
    lucide.createIcons();
    setTimeout(() => {
      copyRoomBtn.innerHTML = origIcon;
      lucide.createIcons();
    }, 2000);
  });
});

// Leave Room
leaveWorkspaceBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to leave this collaboration workspace?')) {
    window.location.href = window.location.origin + window.location.pathname;
  }
});

// Render dynamic user badges in sidebar
function renderCollaborators() {
  displayRoomId.textContent = currentRoom;
  userCountDisplay.textContent = usersList.length;
  usersListContainer.innerHTML = '';

  usersList.forEach(user => {
    const userItem = document.createElement('div');
    userItem.className = `user-item ${user.id === myId ? 'me' : ''}`;
    
    // Initials lookup
    const initials = user.username.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    userItem.innerHTML = `
      <div class="user-avatar" style="background-color: ${user.color}; --color: ${user.color}">
        ${initials}
      </div>
      <span class="user-name">${user.username}</span>
      <span class="user-status">${user.id === myId ? 'online' : 'active'}</span>
    `;
    usersListContainer.appendChild(userItem);
  });
}

// Log activities to the side board
function logActivity(text, username, color) {
  const logItem = document.createElement('div');
  logItem.className = 'log-item';
  logItem.innerHTML = `
    <span class="log-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    <span class="log-text"><span style="color: ${color}">${username}</span> ${text}</span>
  `;
  activityLogs.appendChild(logItem);
  activityLogs.scrollTop = activityLogs.scrollHeight;
}

// -------------------------------------------------------------
// 4. Whiteboard HTML5 Drawing Engine
// -------------------------------------------------------------
function resizeCanvas() {
  // Set dimensions based on viewport element bounds
  const rect = viewportContainer.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  // Scale context to account for high-DPI scaling
  redraw();
}

// Update local stroke thickness indicator circle
function updateBrushPreview() {
  brushPreview.style.width = `${currentBrushSize}px`;
  brushPreview.style.height = `${currentBrushSize}px`;
  brushPreview.style.backgroundColor = currentColor;
}

// Listen to Brush stroke values slider change
brushSizeSlider.addEventListener('input', (e) => {
  currentBrushSize = parseInt(e.target.value);
  updateBrushPreview();
});

// Toolbar buttons selectors
toolButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    toolButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.getAttribute('data-tool');

    // Show text tool font settings if selected
    if (currentTool === 'text') {
      textControls.classList.remove('hidden');
    } else {
      textControls.classList.add('hidden');
    }
  });
});

// Color swatch palettes selectors
colorSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    colorSwatches.forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    currentColor = swatch.getAttribute('data-color');
    updateBrushPreview();
  });
});

// Undo action click
undoBtn.addEventListener('click', () => {
  if (socket) {
    socket.emit('undo-action');
  } else {
    if (drawHistory.length > 0) {
      drawHistory.pop();
      redraw();
    }
  }
});

// Clear board click
clearBtn.addEventListener('click', () => {
  if (confirm('Clear the entire whiteboard? This cannot be undone.')) {
    if (socket) {
      socket.emit('clear-canvas');
    } else {
      drawHistory = [];
      redraw();
    }
  }
});

// Download Canvas as PNG image file
downloadBtn.addEventListener('click', () => {
  // Build a temporary canvas to output final drawing without panning/zooming guides
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportCtx = exportCanvas.getContext('2d');
  
  // Fill background
  exportCtx.fillStyle = '#0b0c10';
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  
  // Draw strokes scaled onto export canvas
  exportCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  exportCtx.translate(offset.x, offset.y);
  exportCtx.scale(zoom, zoom);
  
  drawHistory.forEach(action => {
    drawElementToContext(exportCtx, action);
  });

  const url = exportCanvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `synapse-whiteboard-${currentRoom}.png`;
  link.href = url;
  link.click();
});

// Screen coordinates converter (Client space to Canvas space)
function getCanvasCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  return {
    x: (mouseX - offset.x) / zoom,
    y: (mouseY - offset.y) / zoom
  };
}

// -------------------------------------------------------------
// Whiteboard Input Event Listeners
// -------------------------------------------------------------
viewportContainer.addEventListener('mousedown', onMouseDown);
viewportContainer.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
viewportContainer.addEventListener('wheel', onWheel, { passive: false });

// Block right-clicks default menu so we can use right-click panning
viewportContainer.addEventListener('contextmenu', (e) => e.preventDefault());

function onMouseDown(e) {
  // Keyboard Space bar pressed or Right Click triggers panning mode
  if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
    isPanning = true;
    panStart.x = e.clientX - offset.x;
    panStart.y = e.clientY - offset.y;
    viewportContainer.style.cursor = 'grabbing';
    return;
  }

  // Draw tools triggers on left click
  if (e.button === 0) {
    if (activeTextInput) {
      saveTextInput();
      return;
    }

    const coords = getCanvasCoordinates(e);

    // Sticky Note creation tool
    if (currentTool === 'sticky') {
      createNewStickyNote(coords.x, coords.y);
      // Revert tool back to pen
      document.querySelector('[data-tool="pen"]').click();
      return;
    }

    // Text label creation tool
    if (currentTool === 'text') {
      spawnTextInput(coords.x, coords.y, e.clientX, e.clientY);
      return;
    }

    isDrawing = true;
    startPoint = coords;
    activeStrokePoints = [coords];
  }
}

function onMouseMove(e) {
  // Sync client mouse cursor coords
  syncMousePosition(e);

  // Handle active panning
  if (isPanning) {
    offset.x = e.clientX - panStart.x;
    offset.y = e.clientY - panStart.y;
    syncStickyLayerTransform();
    redraw();
    return;
  }

  // Handle active drawing
  if (!isDrawing) return;

  const coords = getCanvasCoordinates(e);

  if (currentTool === 'pen' || currentTool === 'eraser') {
    activeStrokePoints.push(coords);
    
    // Smooth drawing performance: broadcast segments immediately
    const prev = activeStrokePoints[activeStrokePoints.length - 2];
    const segment = {
      type: 'stroke',
      points: [prev, coords],
      color: currentTool === 'eraser' ? '#0b0c10' : currentColor,
      width: currentTool === 'eraser' ? currentBrushSize * 3 : currentBrushSize
    };
    
    // Paint segments locally & broadcast
    drawHistory.push(segment);
    paintStrokeElement(segment);
    if (socket) socket.emit('draw-action', segment);
  } else {
    // Shapes require drawing boundaries updates on mouse move (redraw temporary state)
    redraw();
    drawTempShape(coords);
  }
}

function onMouseUp(e) {
  if (isPanning) {
    isPanning = false;
    viewportContainer.style.cursor = 'crosshair';
  }

  if (!isDrawing) return;
  isDrawing = false;

  const endCoords = getCanvasCoordinates(e);

  // Complete Shape elements drawing and emit to socket
  if (currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle') {
    const action = {
      type: 'shape',
      shapeType: currentTool,
      startPoint: startPoint,
      endPoint: endCoords,
      color: currentColor,
      width: currentBrushSize
    };
    
    drawHistory.push(action);
    if (socket) socket.emit('draw-action', action);
    redraw();
  }
}

// Scroll Wheel zoom calculation
function onWheel(e) {
  e.preventDefault();
  
  // Define Zoom parameters
  const zoomFactor = 1.08;
  let newZoom = zoom;

  if (e.deltaY < 0) {
    newZoom = Math.min(zoom * zoomFactor, 8.0);
  } else {
    newZoom = Math.max(zoom / zoomFactor, 0.25);
  }

  // Zoom center relative to cursor positions
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Re-compute offset coordinates based on cursor zoom scaling center
  offset.x = mouseX - (mouseX - offset.x) * (newZoom / zoom);
  offset.y = mouseY - (mouseY - offset.y) * (newZoom / zoom);
  
  zoom = newZoom;
  zoomValueDisplay.textContent = Math.round(zoom * 100);

  syncStickyLayerTransform();
  redraw();
}

// Sync HTML absolute positioning sticky notes overlay
function syncStickyLayerTransform() {
  stickyLayer.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;
}

// -------------------------------------------------------------
// Canvas Redrawing loop & rendering logic
// -------------------------------------------------------------
function redraw() {
  // Clear standard canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw background color grid or pattern
  ctx.save();
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Set transforms matrices
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  ctx.translate(offset.x, offset.y);
  ctx.scale(zoom, zoom);

  // Render Grid dots for modern blueprint touch
  drawGridDots();

  // Redraw all actions
  drawHistory.forEach(action => {
    drawElementToContext(ctx, action);
  });

  ctx.restore();
}

// Paint single element to context
function drawElementToContext(context, el) {
  context.beginPath();
  context.strokeStyle = el.color;
  context.lineWidth = el.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (el.type === 'stroke') {
    if (el.points.length < 2) return;
    context.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) {
      context.lineTo(el.points[i].x, el.points[i].y);
    }
    context.stroke();
  } else if (el.type === 'shape') {
    const sp = el.startPoint;
    const ep = el.endPoint;

    if (el.shapeType === 'line') {
      context.moveTo(sp.x, sp.y);
      context.lineTo(ep.x, ep.y);
      context.stroke();
    } else if (el.shapeType === 'rectangle') {
      const x = Math.min(sp.x, ep.x);
      const y = Math.min(sp.y, ep.y);
      const w = Math.abs(ep.x - sp.x);
      const h = Math.abs(ep.y - sp.y);
      context.strokeRect(x, y, w, h);
    } else if (el.shapeType === 'circle') {
      const radius = Math.sqrt(Math.pow(ep.x - sp.x, 2) + Math.pow(ep.y - sp.y, 2));
      context.arc(sp.x, sp.y, radius, 0, 2 * Math.PI);
      context.stroke();
    }
  } else if (el.type === 'text') {
    context.fillStyle = el.color;
    context.font = `${el.fontSize}px ${el.fontFamily || 'Outfit'}`;
    context.textBaseline = 'top';
    context.fillText(el.text, el.x, el.y);
  }
}

// High performance: paint new line strokes in real-time
function paintStrokeElement(el) {
  ctx.save();
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  ctx.translate(offset.x, offset.y);
  ctx.scale(zoom, zoom);
  
  drawElementToContext(ctx, el);
  ctx.restore();
}

// Draw temporary shapes overlay while dragging
function drawTempShape(endCoords) {
  ctx.save();
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  ctx.translate(offset.x, offset.y);
  ctx.scale(zoom, zoom);

  ctx.beginPath();
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentBrushSize;
  ctx.lineCap = 'round';

  if (currentTool === 'line') {
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endCoords.x, endCoords.y);
    ctx.stroke();
  } else if (currentTool === 'rectangle') {
    const x = Math.min(startPoint.x, endCoords.x);
    const y = Math.min(startPoint.y, endCoords.y);
    const w = Math.abs(endCoords.x - startPoint.x);
    const h = Math.abs(endCoords.y - startPoint.y);
    ctx.strokeRect(x, y, w, h);
  } else if (currentTool === 'circle') {
    const radius = Math.sqrt(Math.pow(endCoords.x - startPoint.x, 2) + Math.pow(endCoords.y - startPoint.y, 2));
    ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }

  ctx.restore();
}

// Draw grids pattern dots
function drawGridDots() {
  const gridSize = 40;
  
  // Calculate canvas-space visible bounding box coordinates
  const left = -offset.x / zoom;
  const top = -offset.y / zoom;
  const right = left + canvas.width / (zoom * window.devicePixelRatio);
  const bottom = top + canvas.height / (zoom * window.devicePixelRatio);

  // Round parameters to grid points
  const startX = Math.floor(left / gridSize) * gridSize;
  const startY = Math.floor(top / gridSize) * gridSize;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  
  for (let x = startX; x < right; x += gridSize) {
    for (let y = startY; y < bottom; y += gridSize) {
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }
}

// -------------------------------------------------------------
// 5. Whiteboard Text Label inputs
// -------------------------------------------------------------
function spawnTextInput(canvasX, canvasY, clientX, clientY) {
  if (activeTextInput) saveTextInput();

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'text-tool-input';
  
  // Keep dimensions styled
  const fontSize = 16;
  const fontFamily = fontFamilySelect.value;
  textInput.style.font = `${fontSize}px ${fontFamily}`;
  textInput.style.color = currentColor;
  textInput.style.left = `${clientX}px`;
  textInput.style.top = `${clientY}px`;

  viewportContainer.appendChild(textInput);
  textInput.focus();

  activeTextInput = {
    element: textInput,
    x: canvasX,
    y: canvasY,
    fontSize: fontSize,
    fontFamily: fontFamily,
    color: currentColor
  };

  // Add event listener to capture Enter keypress
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveTextInput();
    }
  });

  // Stop click events bubbling up while writing
  textInput.addEventListener('mousedown', (e) => e.stopPropagation());
}

function saveTextInput() {
  if (!activeTextInput) return;
  const inputEl = activeTextInput.element;
  const val = inputEl.value.trim();

  if (val) {
    const textAction = {
      type: 'text',
      x: activeTextInput.x,
      y: activeTextInput.y,
      text: val,
      fontSize: activeTextInput.fontSize,
      fontFamily: activeTextInput.fontFamily,
      color: activeTextInput.color,
      width: 1
    };

    drawHistory.push(textAction);
    if (socket) socket.emit('draw-action', textAction);
    redraw();
  }

  // Remove element and state
  inputEl.remove();
  activeTextInput = null;
  // Revert back to pen
  document.querySelector('[data-tool="pen"]').click();
}

// -------------------------------------------------------------
// 6. Collaborative Sticky Notes Layer
// -------------------------------------------------------------
function createNewStickyNote(canvasX, canvasY) {
  const colors = ['yellow', 'pink', 'cyan', 'green', 'purple'];
  const note = {
    id: generateUUID(),
    x: canvasX - 100, // Center note offset
    y: canvasY - 100,
    text: 'Click & edit note details!',
    color: colors[Math.floor(Math.random() * colors.length)]
  };

  stickyNotes.push(note);
  renderStickyNoteDOM(note);
  if (socket) socket.emit('sticky-note-save', note);
}

function renderStickyNoteDOM(note) {
  const stickyDiv = document.createElement('div');
  stickyDiv.id = `sticky-${note.id}`;
  stickyDiv.className = `sticky-note ${note.color}-note`;
  stickyDiv.style.transform = `translate(${note.x}px, ${note.y}px)`;

  // Add random tiny tilt angle style for hand-crafted sticky look
  const angles = [-2, -1, 1, 2];
  const tilt = angles[Math.floor(Math.random() * angles.length)];
  stickyDiv.style.rotate = `${tilt}deg`;

  stickyDiv.innerHTML = `
    <div class="sticky-header">
      <i data-lucide="grip-horizontal" class="sticky-handle"></i>
      <div style="display:flex; gap: 4px;">
        <button class="sticky-delete-btn" title="Delete Note">
          <i data-lucide="x"></i>
        </button>
      </div>
    </div>
    <textarea spellcheck="false">${note.text}</textarea>
  `;

  stickyLayer.appendChild(stickyDiv);
  lucide.createIcons({ node: stickyDiv });

  const textarea = stickyDiv.querySelector('textarea');
  const deleteBtn = stickyDiv.querySelector('.sticky-delete-btn');
  const handle = stickyDiv.querySelector('.sticky-handle');

  // Input changes sync
  textarea.addEventListener('input', (e) => {
    note.text = e.target.value;
    if (socket) socket.emit('sticky-note-save', note);
  });

  // Delete Action handler
  deleteBtn.addEventListener('click', () => {
    stickyDiv.remove();
    stickyNotes = stickyNotes.filter(n => n.id !== note.id);
    if (socket) socket.emit('sticky-note-delete', note.id);
  });

  // Dragging event bindings on sticky notes
  let isDraggingNote = false;
  let dragStartOffset = { x: 0, y: 0 };

  const startDrag = (e) => {
    // Left-click only
    if (e.button !== 0) return;
    
    isDraggingNote = true;
    
    // Zoom factor scaling affects mouse drags relative to Note transforms coordinates
    dragStartOffset.x = (e.clientX / zoom) - note.x;
    dragStartOffset.y = (e.clientY / zoom) - note.y;

    stickyDiv.style.cursor = 'grabbing';
    e.stopPropagation();
    e.preventDefault();
  };

  const onDrag = (e) => {
    if (!isDraggingNote) return;

    note.x = (e.clientX / zoom) - dragStartOffset.x;
    note.y = (e.clientY / zoom) - dragStartOffset.y;

    stickyDiv.style.transform = `translate(${note.x}px, ${note.y}px)`;
  };

  const stopDrag = () => {
    if (isDraggingNote) {
      isDraggingNote = false;
      stickyDiv.style.cursor = 'grab';
      if (socket) socket.emit('sticky-note-save', note);
    }
  };

  // Bind drag handlers
  handle.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
}

// -------------------------------------------------------------
// 7. Collaborative Markdown Notepad Synchronizer
// -------------------------------------------------------------
let isLocalEditing = false;
let editingTimeout = null;

// Textarea input list triggers sync event
notesTextarea.addEventListener('input', () => {
  updateNotesStats();
  updateMarkdownPreview();

  if (!socket) return;

  isLocalEditing = true;
  // Emit data with client selection indexes
  socket.emit('note-update', {
    content: notesTextarea.value,
    selection: {
      start: notesTextarea.selectionStart,
      end: notesTextarea.selectionEnd
    }
  });

  // Clear typing timeout loader
  clearTimeout(editingTimeout);
  
  // Display loading status indicator
  typingIndicator.classList.add('typing');
  typingIndicator.querySelector('.indicator-text').textContent = 'Syncing...';

  editingTimeout = setTimeout(() => {
    isLocalEditing = false;
    typingIndicator.classList.remove('typing');
    typingIndicator.querySelector('.indicator-text').textContent = 'All changes synced.';
  }, 1000);
});

// Sync selection focus coordinates
notesTextarea.addEventListener('keyup', () => syncSelectionFocus());
notesTextarea.addEventListener('click', () => syncSelectionFocus());
notesTextarea.addEventListener('focus', () => syncSelectionFocus());

function syncSelectionFocus() {
  if (!socket) return;
  socket.emit('note-update', {
    content: notesTextarea.value,
    selection: {
      start: notesTextarea.selectionStart,
      end: notesTextarea.selectionEnd
    }
  });
}

// Update word counts and line counts
function updateNotesStats() {
  const text = notesTextarea.value || '';
  const lines = text.split('\n').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  lineCountDisplay.textContent = lines;
  wordCountDisplay.textContent = words;
}

// Toggle Markdown Preview UI Pane
let isPreviewEnabled = false;
btnTogglePreview.addEventListener('click', () => {
  isPreviewEnabled = !isPreviewEnabled;
  btnTogglePreview.classList.toggle('active', isPreviewEnabled);
  previewPane.classList.toggle('hidden', !isPreviewEnabled);
  
  if (isPreviewEnabled) {
    updateMarkdownPreview();
  }
});

function updateMarkdownPreview() {
  if (isPreviewEnabled) {
    markdownPreviewContent.innerHTML = markdownCompile(notesTextarea.value);
  }
}

// Render remote client cursor locations in textarea footer
function updateRemoteEditorCursors(userId, selection) {
  const user = usersList.find(u => u.id === userId);
  if (!user || !selection) return;

  // Clean existing bubble marker
  const oldBubble = document.getElementById(`editor-bubble-${userId}`);
  if (oldBubble) oldBubble.remove();

  // Render cursor labels in notepad footer container
  const bubble = document.createElement('div');
  bubble.id = `editor-bubble-${userId}`;
  bubble.className = 'editor-bubble';
  bubble.style.setProperty('--color', user.color);
  bubble.style.backgroundColor = user.color;
  bubble.innerHTML = `
    <i data-lucide="user" style="width:10px; height:10px;"></i>
    <span>${user.username} (L:${notesTextarea.value.substring(0, selection.start).split('\n').length})</span>
  `;
  activeEditorsList.appendChild(bubble);
  lucide.createIcons({ node: activeEditorsList });

  // Fade out cursor tags if inactive
  clearTimeout(user.editorTimeout);
  user.editorTimeout = setTimeout(() => {
    bubble.remove();
  }, 4000);
}

// -------------------------------------------------------------
// 8. Dynamic Mouse Cursor Tracker Overlay Layers
// -------------------------------------------------------------
const cursorContainer = document.getElementById('remote-cursors');

function syncMousePosition(e) {
  if (!socket || viewports.activeView !== 'canvas' && viewports.activeView !== 'split') return;

  // We convert screen mouse pointer into Canvas space coordinates
  const canvasCoords = getCanvasCoordinates(e);

  socket.emit('cursor-move', canvasCoords);
}

function updateRemoteCursor(id, username, color, cursorCoords) {
  if (id === myId) return;

  let cursorEl = document.getElementById(`cursor-${id}`);
  
  if (!cursorEl) {
    cursorEl = document.createElement('div');
    cursorEl.id = `cursor-${id}`;
    cursorEl.className = 'remote-cursor';
    cursorEl.style.setProperty('--color', color);
    
    // Modern custom arrow mouse pointer SVG
    cursorEl.innerHTML = `
      <svg class="cursor-pointer-svg" viewBox="0 0 24 24" fill="${color}">
        <path d="M4 2.5l14 11.5-6.5.7 3.5 6.3-2.5 1.5-3.5-6.5-5 5V2.5z" stroke="white" stroke-width="1.5"/>
      </svg>
      <div class="cursor-label">${username}</div>
    `;
    cursorContainer.appendChild(cursorEl);
  }

  // Update pointer coordinate positions relative to local client's current canvas scale/offset transforms matrices
  const x = cursorCoords.x * zoom + offset.x;
  const y = cursorCoords.y * zoom + offset.y;

  cursorEl.style.transform = `translate(${x}px, ${y}px)`;
  remoteCursors[id] = cursorCoords;
}

// Handle panning/zooming updates relative to active cursors placement
function updateAllRemoteCursorsPosition() {
  for (const id in remoteCursors) {
    const coords = remoteCursors[id];
    const cursorEl = document.getElementById(`cursor-${id}`);
    if (cursorEl) {
      const x = coords.x * zoom + offset.x;
      const y = coords.y * zoom + offset.y;
      cursorEl.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}

// Listen pan offset updates to update cursors coordinates
const originalRedraw = redraw;
redraw = function() {
  originalRedraw();
  updateAllRemoteCursorsPosition();
};
