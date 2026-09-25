const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { recommendPeopleForUser } = require('../utils/recommendationEngine');

router.get('/network', requireAuth, (req, res) => {
  const suggestions = recommendPeopleForUser(req.user.id, 12);
  const pending = db.prepare(`
    SELECT connections.*, users.name, users.headline, users.avatar
    FROM connections JOIN users ON connections.requester_id = users.id
    WHERE connections.addressee_id = ? AND connections.status = 'pending'
  `).all(req.user.id);
  const myConnections = db.prepare(`
    SELECT users.id, users.name, users.headline, users.avatar FROM connections
    JOIN users ON users.id = CASE WHEN connections.requester_id = ? THEN connections.addressee_id ELSE connections.requester_id END
    WHERE (connections.requester_id = ? OR connections.addressee_id = ?) AND connections.status = 'accepted'
  `).all(req.user.id, req.user.id, req.user.id);

  res.render('network', { title: 'My Network', suggestions, pending, myConnections });
});

router.post('/network/connect/:id', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.redirect('/network');
  try {
    db.prepare("INSERT INTO connections (requester_id, addressee_id, status) VALUES (?, ?, 'pending')").run(req.user.id, targetId);
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)').run(
      targetId, 'connection', `${req.user.name} wants to connect with you.`, '/network'
    );
    req.flash('success', 'Connection request sent.');
  } catch (e) {
    req.flash('error', 'Request already exists.');
  }
  res.redirect('back');
});

router.post('/network/respond/:connId', requireAuth, (req, res) => {
  const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.connId);
  if (!conn || conn.addressee_id !== req.user.id) return res.redirect('/network');
  const status = req.body.action === 'accept' ? 'accepted' : 'declined';
  db.prepare('UPDATE connections SET status = ? WHERE id = ?').run(status, conn.id);
  if (status === 'accepted') {
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)').run(
      conn.requester_id, 'connection', `${req.user.name} accepted your connection request.`, `/profile/${req.user.id}`
    );
  }
  req.flash('success', `Request ${status}.`);
  res.redirect('/network');
});

module.exports = router;
