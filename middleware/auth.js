const jwt = require('jsonwebtoken');
const pool = require('../services/db');
const path = require('path');

const JWT_SECRET = 'your-secret-key-here';
const COOKIE_NAME = 'jikoni-auth';
const ADMIN_AUTH = 'admin-auth';
const DELIVERY_AUTH = 'delivery-auth';


const authenticate = (roles = []) => {
  return async (req, res, next) => {
    const token = req.cookies[COOKIE_NAME];
   
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const user = userResult.rows[0];
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
};

const authenticateAdmin = (roles = []) => {
  return async (req, res, next) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const user = userResult.rows[0];
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
};

const authenticateDelivery = (roles = []) => {
  return async (req, res, next) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const user = userResult.rows[0];
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
};

const authenticateForLogin = (roles = []) => {
  return async (req, res, next) => {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
      return res.status(401).json({ success: false, error: 'You are Not logged in', redirect_url: '/login' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);

      if (userResult.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const user = userResult.rows[0];
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
  };
};



module.exports = {
  authenticate,
  authenticateAdmin,
  authenticateDelivery,
  authenticateForLogin,
  JWT_SECRET,
  COOKIE_NAME,
  ADMIN_AUTH,
  DELIVERY_AUTH
};


//[{combination: [{id: 'Id', name: 'pilau', price: 125, discount: 12, quantity: 2}, {id: 'Id2', name: 'pilau', price: 125, discount: 12, quantity: 2}, {id: 'Id3', name: 'pilau', price: 125, discount: 12, quantity: 2}], quantity:1}]  