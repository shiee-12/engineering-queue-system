const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Global state holding queue data
let queueState = {
  regular: 0,
  priority: 0,
  lastCalled: null // { type: 'Regular'|'Priority', number: X, action: 'call'|'recall' }
};

io.on('connection', (socket) => {
  // Send current state to newly connected client
  socket.emit('stateUpdate', queueState);

  // Handle queue actions from Controller
  socket.on('queueAction', (data) => {
    const { action, queueType, manualNumber } = data; // action: 'next', 'skip', 'recall', 'manual', 'resetRegular', 'resetPriority', 'resetBoth'

    if (action === 'resetBoth') {
      queueState.regular = 0;
      queueState.priority = 0;
      queueState.lastCalled = null;
    } else if (action === 'resetRegular') {
      queueState.regular = 0;
    } else if (action === 'resetPriority') {
      queueState.priority = 0;
    } else if (queueType === 'regular') {
      if (action === 'next') {
        queueState.regular = queueState.regular >= 20 ? 1 : queueState.regular + 1;
        queueState.lastCalled = { type: 'Regular', number: queueState.regular, action: 'call' };
      } else if (action === 'skip') {
        queueState.regular = queueState.regular >= 20 ? 1 : queueState.regular + 1;
      } else if (action === 'recall' && queueState.regular > 0) {
        queueState.lastCalled = { type: 'Regular', number: queueState.regular, action: 'recall' };
      } else if (action === 'manual' && manualNumber) {
        queueState.regular = parseInt(manualNumber, 10);
        queueState.lastCalled = { type: 'Regular', number: queueState.regular, action: 'call' };
      }
    } else if (queueType === 'priority') {
      if (action === 'next') {
        queueState.priority = queueState.priority >= 20 ? 1 : queueState.priority + 1;
        queueState.lastCalled = { type: 'Priority', number: queueState.priority, action: 'call' };
      } else if (action === 'skip') {
        queueState.priority = queueState.priority >= 20 ? 1 : queueState.priority + 1;
      } else if (action === 'recall' && queueState.priority > 0) {
        queueState.lastCalled = { type: 'Priority', number: queueState.priority, action: 'recall' };
      } else if (action === 'manual' && manualNumber) {
        queueState.priority = parseInt(manualNumber, 10);
        queueState.lastCalled = { type: 'Priority', number: queueState.priority, action: 'call' };
      }
    }

    // Broadcast updated state to all connected devices
    io.emit('stateUpdate', queueState);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Access from mobile/other PCs using host local IP address.`);
});