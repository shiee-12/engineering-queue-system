const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

let queueState = {
  regular: 0,
  priority: 0,
  lastCalled: null 
};

io.on('connection', (socket) => {
  socket.emit('stateUpdate', queueState);

  socket.on('queueAction', (data) => {
    const { action, queueType, manualNumber } = data;
    const now = Date.now();

    if (action === 'resetBoth') {
      queueState.regular = 0;
      queueState.priority = 0;
      queueState.lastCalled = null;
    } else if (action === 'resetRegular') {
      queueState.regular = 0;
    } else if (action === 'resetPriority') {
      queueState.priority = 0;
    } else if (queueType === 'regular') {
      if (action === 'next' || action === 'skip') {
        queueState.regular = queueState.regular >= 20 ? 1 : queueState.regular + 1;
        queueState.lastCalled = { type: 'Regular', number: queueState.regular, action: action, timestamp: now };
      } else if (action === 'recall' && queueState.regular > 0) {
        queueState.lastCalled = { type: 'Regular', number: queueState.regular, action: 'recall', timestamp: now };
      } else if (action === 'manual' && manualNumber !== undefined && manualNumber !== null) {
        const parsedNum = parseInt(manualNumber, 10);
        if (!isNaN(parsedNum)) {
          queueState.regular = parsedNum;
          queueState.lastCalled = { type: 'Regular', number: queueState.regular, action: 'call', timestamp: now };
        }
      }
    } else if (queueType === 'priority') {
      if (action === 'next' || action === 'skip') {
        queueState.priority = queueState.priority >= 20 ? 1 : queueState.priority + 1;
        queueState.lastCalled = { type: 'Priority', number: queueState.priority, action: action, timestamp: now };
      } else if (action === 'recall' && queueState.priority > 0) {
        queueState.lastCalled = { type: 'Priority', number: queueState.priority, action: 'recall', timestamp: now };
      } else if (action === 'manual' && manualNumber !== undefined && manualNumber !== null) {
        const parsedNum = parseInt(manualNumber, 10);
        if (!isNaN(parsedNum)) {
          queueState.priority = parsedNum;
          queueState.lastCalled = { type: 'Priority', number: queueState.priority, action: 'call', timestamp: now };
        }
      }
    }

    io.emit('stateUpdate', queueState);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});