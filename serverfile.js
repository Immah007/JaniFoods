const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { initializeSocket } = require('./sockets');
const routes = require('./routes/index');
const { COOKIE_NAME,  ADMIN_AUTH, DELIVERY_AUTH, JWT_SECRET } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = initializeSocket(server);
app.set('io', io); // Make io accessible in routes

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // or your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
//app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api', routes);

// HTML Routes with Auth Checks
app.get('/', (req, res) => {
 /* const token = req.cookies[COOKIE_NAME];
  if (!token) return res.sendFile(path.join(__dirname, 'public', 'userloginfile.html'));
  
  try {
    jwt.verify(token, JWT_SECRET);*/
    res.sendFile(path.join(__dirname, 'public', 'food_order_frontend.html'));
 /* } catch (err) {
    res.redirect('/login');
  }*/
});

app.get('/admin', (req, res) => {
  const token = req.cookies[ADMIN_AUTH];
  if (!token) return res.sendFile(path.join(__dirname, 'public', 'adminloginfile.html'));
  
  try {
    jwt.verify(token, JWT_SECRET);
    res.sendFile(path.join(__dirname, 'public', 'foodstore_admin.html'));
  } catch (err) {
    res.redirect('/admin-login');
  }
});


app.get('/delivery', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'delivery_interfce.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'userloginfile.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot_password.html'));
});

app.get('/otp', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'password_reset_otp.html'));
});

app.get('/password-reset', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'password_reset.html'));
});

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'adminloginfile.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
