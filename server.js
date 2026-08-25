const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware for parsing form inputs
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Middleware (Expires when browser/tab closes + prevents caching)
app.use(session({
  secret: 'naic-engineering-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if running exclusively on HTTPS
    httpOnly: true 
    // maxAge is deliberately removed so the cookie expires on browser close
  }
}));

// Prevent browser from caching protected pages
app.use((req, res, next) => {
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
  next();
});

// Admin Credentials
const ADMIN_USERNAME = "naic_engineering";
const ADMIN_PASSWORD_HASH = bcrypt.hashSync("EO2026!", 10);

// Authentication Guard Middleware
// Auth Middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login.html');
}

// 1. PUBLIC ROUTES (Do NOT apply requireAuth here)
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 2. PROTECTED ROUTES (Apply requireAuth here)
app.get('/controller.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controller.html'));
});

app.get('/display.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// 2. Handle Login Form POST Request
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // Perform your user authentication check here
  if (username === 'admin' && password === 'yourpassword') {
    req.session.user = username; // Establishes session
    return res.redirect('/controller.html');
  }

  res.redirect('/login.html?error=invalid');
});

// 3. Handle Logout Request
app.get('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Allow static assets (CSS, images) needed for the login screen
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'style.css'));
});

// ------------------- PROTECTED ROUTES -------------------

// Serve Main Display Page (Protected)
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// Protect all other static files (controller.html, display.html, JS files)
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// Redirect any unhandled route back to main page or login
app.get('*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// ------------------- SOCKET.IO QUEUE LOGIC -------------------

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
      if (action === 'next') {
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
      if (action === 'next') {
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
