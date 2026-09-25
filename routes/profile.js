const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = file.fieldname === 'resume' ? 'public/uploads/resumes' : 'public/uploads/avatars';
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).render('404', { title: 'Not found' });
  const company = user.company_id ? db.prepare('SELECT * FROM companies WHERE id = ?').get(user.company_id) : null;

  let connectionStatus = 'none';
  if (req.user && req.user.id !== user.id) {
    const conn = db.prepare(`
      SELECT * FROM connections
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `).get(req.user.id, user.id, user.id, req.user.id);
    if (conn) connectionStatus = conn.status === 'accepted' ? 'connected' : (conn.requester_id === req.user.id ? 'pending_sent' : 'pending_received');
  }

  const mutualConnCount = req.user ? db.prepare(`
    SELECT COUNT(*) as c FROM connections c1
    JOIN connections c2 ON (
      (c1.requester_id = c2.requester_id OR c1.requester_id = c2.addressee_id OR c1.addressee_id = c2.requester_id OR c1.addressee_id = c2.addressee_id)
    )
    WHERE c1.status='accepted' AND c2.status='accepted'
  `).get()?.c || 0 : 0;

  const posts = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(user.id);

  res.render('profile', { title: `${user.name} | Profile`, profileUser: user, company, connectionStatus, posts });
});

router.get('/settings/profile', requireAuth, (req, res) => {
  res.render('edit-profile', { title: 'Edit Profile' });
});

router.post('/settings/profile', requireAuth, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'resume', maxCount: 1 }]), (req, res) => {
  const { name, headline, bio, location, skills, experience_years, education, open_to_work } = req.body;
  let avatarPath = req.user.avatar;
  let resumePath = req.user.resume_path;
  if (req.files?.avatar?.[0]) avatarPath = '/' + req.files.avatar[0].path.replace(/\\/g, '/').replace('public/', '');
  if (req.files?.resume?.[0]) resumePath = '/' + req.files.resume[0].path.replace(/\\/g, '/').replace('public/', '');

  db.prepare(`
    UPDATE users SET name=?, headline=?, bio=?, location=?, skills=?, experience_years=?, education=?, avatar=?, resume_path=?, open_to_work=?
    WHERE id = ?
  `).run(
    name || req.user.name, headline || '', bio || '', location || '', skills || '',
    parseFloat(experience_years) || 0, education || '', avatarPath, resumePath,
    open_to_work ? 1 : 0, req.user.id
  );
  req.flash('success', 'Profile updated!');
  res.redirect(`/profile/${req.user.id}`);
});

module.exports = router;
