const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Middleware
app.use(session({
  secret: 'naic-engineering-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if running strictly over HTTPS
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Prevent caching of authenticated pages
app.use((req, res, next) => {
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
  next();
});

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Helper to safely read credentials from config.json
function getCredentials() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error("Error reading config.json:", err);
    }
  }
  return {
    username: 'naic_engineering',
    passwordHash: bcrypt.hashSync('EO2026!', 10)
  };
}

// Helper to save updated credentials back to config.json
function saveCredentials(creds) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(creds, null, 2), 'utf8');
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login.html');
}

// ------------------- PUBLIC ROUTES & ASSETS -------------------

// Allow serving CSS, JS, and Images freely without blocking login
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Login Page GET
app.get('/login.html', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/controller.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Forgot Password Page GET
app.get('/forgot-password.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

// Login Form POST
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const currentCreds = getCredentials();

  const isUsernameValid = (username === currentCreds.username);
  const isPasswordValid = isUsernameValid && bcrypt.compareSync(password, currentCreds.passwordHash);

  if (isUsernameValid && isPasswordValid) {
    req.session.user = username;
    return res.redirect('/controller.html');
  }

  res.redirect('/login.html?error=invalid');
});

// Reset Password Form POST
app.post('/api/reset-password', (req, res) => {
  const { username, newPassword } = req.body;
  const currentCreds = getCredentials();

  if (username !== currentCreds.username) {
    return res.redirect('/forgot-password.html?error=invalid_user');
  }

  if (!newPassword || newPassword.length < 6) {
    return res.redirect('/forgot-password.html?error=weak_password');
  }

  // Hash the new password and write to config.json
  const newHash = bcrypt.hashSync(newPassword, 10);
  currentCreds.passwordHash = newHash;
  saveCredentials(currentCreds);

  res.redirect('/login.html?reset=success');
});

// Logout GET
app.get('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login.html');
  });
});

// ------------------- PROTECTED ROUTES -------------------

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controller.html'));
});

app.get('/controller.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controller.html'));
});

app.get('/display.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// Fallback for any unknown routes
app.get('*', requireAuth, (req, res) => {
  res.redirect('/controller.html');
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
