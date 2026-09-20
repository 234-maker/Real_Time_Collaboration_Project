# Synapse Collab - Real-Time Collaborative Workspace

A beautiful, premium, dark-themed real-time collaborative workspace featuring a shared whiteboard and a collaborative notes editor with live synchronization using WebSockets.

![Dashboard Preview](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80) <!-- Optional placeholder visual -->

## Features

### 1. User Presence & Rooms
* **Dynamic Rooms**: Create or join workspaces using custom Room IDs or instant invite links.
* **Presence indicators**: Real-time listing of active users in the room with colorful initials and active indicators.
* **Live cursor tracking**: Mouse pointers of other active users glide smoothly across the workspace in real-time, showing their names and custom avatar colors.

### 2. Collaborative Whiteboard Canvas
* **Smooth HTML5 Canvas**: Tailored vector-based render loop with high-DPI (Retina) support for sharp graphics.
* **Rich Toolkit**: Pen, Line, Rectangle, Circle, Eraser, Text Label tool, and Sticky Notes.
* **Panning & Zooming**: Click-and-drag panning (with Middle-click, Space+drag, or Right-click drag) and scroll wheel zoom for an infinite canvas feel.
* **Action controls**: Undo drawings, clear the workspace, and download the board directly as a `.png` file.
* **Draggable Sticky Notes**: Add collaborative, editable sticky cards that hover on the whiteboard canvas and glide around relative to zoom/pan layers.

### 3. Synchronized Notepad Editor
* **Markdown Support**: Take rich-text notes with active lists, checkboxes, headings, quotes, and inline code formatting.
* **Live editor sync**: Lightweight typing syncing that keeps local cursor carets locked in position to prevent cursor jumping.
* **Visual editor updates**: Live indicator tags showing who is editing on which line in real-time.
* **Dual-pane Preview**: Toggle markdown parsing visualizer side-by-side or work in full-screen notepad screen.

---

## Technical Architecture

The project is built on a **single-process Node.js architecture** to ensure maximum simplicity, reliability, and speed:
* **Express Backend** (`server.js`): Serves static front-end assets directly and handles CORS. Periodically sweeps inactive rooms.
* **Socket.io WebSockets**: Coordinates real-time sync states including draw strokes, sticky note movements, text content, and active cursor positions.
* **Vanilla HTML5/JS/CSS Frontend**: A responsive dashboard styled with CSS Variables, animated glowing backdrops, fluid glassmorphic sheets, custom pointer layers, and vector matrices.

---

## Setup & Running Guide

### Prerequisites
* [Node.js](https://nodejs.org/en/download) (v16.0.0 or later recommended)

### Installation
1. Clone this workspace folder to your machine.
2. In your terminal, navigate to the root directory and install dependencies:
   ```bash
   npm install
   ```

### Execution
1. Run the local Express server:
   ```bash
   npm start
   ```
2. Open your web browser and navigate to:
   [http://localhost:3000](http://localhost:3000)
3. Open a second browser window (or in Incognito mode) and join the same **Room ID** to collaborate and draw in real-time!
