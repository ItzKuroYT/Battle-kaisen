# Battle Kaisen WebSocket Server

This is the global matchmaking and input relay backend for multiplayer.

## Run locally

1. Install dependencies:
   npm install
2. Start server:
   npm start
3. WebSocket endpoint:
   ws://localhost:8080/ws

## Deploy

Deploy this folder to any Node host (Render, Railway, Fly.io, etc.).

Set environment variable:
- PORT (optional, defaults to 8080)

After deploy, use the public WebSocket URL in game Options:
- Example: wss://your-app.onrender.com/ws

## Health check

- GET /health
