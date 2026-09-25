const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const {
  recommendJobsForUser, recommendCompaniesForUser, recommendPeopleForUser, notifyAllOpenJobsForUser
} = require('../utils/recommendationEngine');

// ---------------- Home / feed ----------------
router.get('/', (req, res) => {
  if (!req.user) return res.render('landing', { title: 'JobConnect – Find your next role' });
  res.redirect('/dashboard');
});

router.get('/dashboard', requireAuth, (req, res) => {
  const recommendedJobs = recommendJobsForUser(req.user.id, 6);
  const recommendedCompanies = req.user.role === 'seeker' ? recommendCompaniesForUser(req.user.id, 4) : [];
  const recommendedPeople = recommendPeopleForUser(req.user.id, 5);
  const posts = db.prepare(`
    SELECT posts.*, users.name, users.headline, users.avatar FROM posts
    JOIN users ON posts.user_id = users.id ORDER BY posts.created_at DESC LIMIT 15
  `).all();

  let myJobs = [];
  let myApplications = [];
  if (req.user.role === 'recruiter') {
    myJobs = db.prepare('SELECT * FROM jobs WHERE posted_by = ? ORDER BY created_at DESC').all(req.user.id);
  } else {
    myApplications = db.prepare(`
      SELECT applications.*, jobs.title, companies.name as company_name FROM applications
      JOIN jobs ON applications.job_id = jobs.id JOIN companies ON jobs.company_id = companies.id
      WHERE applications.user_id = ? ORDER BY applications.applied_at DESC LIMIT 5
    `).all(req.user.id);
  }

  res.render('dashboard', {
    title: 'Home',
    recommendedJobs, recommendedCompanies, recommendedPeople, posts, myJobs, myApplications
  });
});

// ---------------- Posts (simple feed like LinkedIn updates) ----------------
router.post('/posts', requireAuth, (req, res) => {
  if (req.body.content && req.body.content.trim()) {
    db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.user.id, req.body.content.trim());
    req.flash('success', 'Posted to your network.');
  }
  res.redirect('/dashboard');
});

// ---------------- My applications ----------------
router.get('/applications', requireAuth, (req, res) => {
  const applications = db.prepare(`
    SELECT applications.*, jobs.title, jobs.location, jobs.job_type, companies.name as company_name, companies.logo as company_logo
    FROM applications JOIN jobs ON applications.job_id = jobs.id JOIN companies ON jobs.company_id = companies.id
    WHERE applications.user_id = ? ORDER BY applications.applied_at DESC
  `).all(req.user.id);
  res.render('my-applications', { title: 'My Applications', applications });
});

router.get('/saved', requireAuth, (req, res) => {
  const jobs = db.prepare(`
    SELECT jobs.*, companies.name as company_name, companies.logo as company_logo, saved_jobs.saved_at
    FROM saved_jobs JOIN jobs ON saved_jobs.job_id = jobs.id JOIN companies ON jobs.company_id = companies.id
    WHERE saved_jobs.user_id = ? ORDER BY saved_jobs.saved_at DESC
  `).all(req.user.id);
  res.render('saved-jobs', { title: 'Saved Jobs', jobs });
});

// ---------------- Companies ----------------
router.get('/companies', (req, res) => {
  const companies = db.prepare(`
    SELECT companies.*, COUNT(jobs.id) as open_roles FROM companies
    LEFT JOIN jobs ON jobs.company_id = companies.id AND jobs.status = 'open'
    GROUP BY companies.id ORDER BY open_roles DESC
  `).all();
  res.render('companies', { title: 'Discover Companies', companies });
});

router.get('/companies/:id', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).render('404', { title: 'Company not found' });
  const jobs = db.prepare("SELECT * FROM jobs WHERE company_id = ? AND status = 'open' ORDER BY created_at DESC").all(company.id);
  const employees = db.prepare('SELECT id, name, headline, avatar FROM users WHERE company_id = ?').all(company.id);
  res.render('company-detail', { title: company.name, company, jobs, employees });
});

// ---------------- Notifications ----------------
router.get('/notifications', requireAuth, (req, res) => {
  // On-demand AI matching sweep: find any newly-eligible jobs and notify.
  notifyAllOpenJobsForUser(req.user.id);
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.render('notifications', { title: 'Notifications', notifications });
});

module.exports = router;
