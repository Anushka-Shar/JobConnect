const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { title: 'Join JobConnect' });
});

router.post('/register', (req, res) => {
  try {
    const { name, email, password, role, headline, location, skills, experience_years, education, company_name } = req.body;
    if (!name || !email || !password) {
      req.flash('error', 'Name, email and password are required.');
      return res.redirect('/register');
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      req.flash('error', 'An account with that email already exists.');
      return res.redirect('/register');
    }

    const hashed = bcrypt.hashSync(password, 10);
    const finalRole = role === 'recruiter' ? 'recruiter' : 'seeker';

    let companyId = null;
    if (finalRole === 'recruiter' && company_name) {
      const info = db.prepare(
        'INSERT INTO companies (name, created_at) VALUES (?, CURRENT_TIMESTAMP)'
      ).run(company_name.trim());
      companyId = info.lastInsertRowid;
    }

    const info = db.prepare(`
      INSERT INTO users (name, email, password, role, headline, location, skills, experience_years, education, company_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(), email.toLowerCase().trim(), hashed, finalRole,
      headline || '', location || '', skills || '', parseFloat(experience_years) || 0,
      education || '', companyId
    );

    if (companyId) {
      db.prepare('UPDATE companies SET created_by = ? WHERE id = ?').run(info.lastInsertRowid, companyId);
    }

    const token = jwt.sign({ id: info.lastInsertRowid }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    req.flash('success', `Welcome to JobConnect, ${name.split(' ')[0]}!`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong creating your account.');
    res.redirect('/register');
  }
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Log in to JobConnect' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/login');
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  req.flash('success', `Welcome back, ${user.name.split(' ')[0]}!`);
  res.redirect('/dashboard');
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

module.exports = router;
