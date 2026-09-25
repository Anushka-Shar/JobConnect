const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

function attachUser(req, res, next) {
  const token = req.cookies?.token;
  res.locals.currentUser = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
      if (user) {
        req.user = user;
        res.locals.currentUser = user;
        res.locals.unreadNotifCount = db.prepare(
          'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
        ).get(user.id).c;
        res.locals.pendingConnCount = db.prepare(
          "SELECT COUNT(*) as c FROM connections WHERE addressee_id = ? AND status = 'pending'"
        ).get(user.id).c;
      }
    } catch (e) { /* invalid/expired token -> treat as logged out */ }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    req.flash('error', 'Please log in to continue.');
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      req.flash('error', 'You do not have permission to view that page.');
      return res.redirect('/');
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole, JWT_SECRET };
