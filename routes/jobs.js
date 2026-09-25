const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { scoreJobForUser, notifyEligibleUsersForJob, generateAIExplanation } = require('../utils/recommendationEngine');

// ---- Job feed / search ----
router.get('/jobs', (req, res) => {
  const { q, location, job_type } = req.query;
  let sql = `
    SELECT jobs.*, companies.name as company_name, companies.logo as company_logo
    FROM jobs JOIN companies ON jobs.company_id = companies.id
    WHERE jobs.status = 'open'
  `;
  const params = [];
  if (q) {
    sql += ` AND (jobs.title LIKE ? OR jobs.skills_required LIKE ? OR companies.name LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (location) {
    sql += ` AND jobs.location LIKE ?`;
    params.push(`%${location}%`);
  }
  if (job_type) {
    sql += ` AND jobs.job_type = ?`;
    params.push(job_type);
  }
  sql += ` ORDER BY jobs.created_at DESC LIMIT 100`;
  let jobs = db.prepare(sql).all(...params);

  if (req.user) {
    jobs = jobs.map(job => ({ ...job, ...scoreJobForUser(req.user, job) }));
  }

  res.render('jobs', { title: 'Find Jobs', jobs, query: req.query });
});

// ---- Post a job (recruiter only) ----
router.get('/jobs/new', requireAuth, requireRole('recruiter'), (req, res) => {
  res.render('post-job', { title: 'Post a Job' });
});

router.post('/jobs/new', requireAuth, requireRole('recruiter'), (req, res) => {
  const { title, description, skills_required, location, job_type, experience_required, salary_min, salary_max, deadline } = req.body;
  if (!req.user.company_id) {
    req.flash('error', 'You need a company profile before posting jobs. Set one up in your profile.');
    return res.redirect('/settings/profile');
  }
  const info = db.prepare(`
    INSERT INTO jobs (company_id, posted_by, title, description, skills_required, location, job_type, experience_required, salary_min, salary_max, deadline)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.user.company_id, req.user.id, title, description || '', skills_required || '',
    location || '', job_type || 'Full-time', parseFloat(experience_required) || 0,
    parseInt(salary_min) || 0, parseInt(salary_max) || 0, deadline || ''
  );
  const notifiedCount = notifyEligibleUsersForJob(info.lastInsertRowid);
  req.flash('success', `Job posted! ${notifiedCount} matching candidate(s) were notified automatically.`);
  res.redirect(`/jobs/${info.lastInsertRowid}`);
});

// ---- Job detail ----
router.get('/jobs/:id', async (req, res) => {
  const job = db.prepare(`
    SELECT jobs.*, companies.name as company_name, companies.logo as company_logo, companies.description as company_description
    FROM jobs JOIN companies ON jobs.company_id = companies.id WHERE jobs.id = ?
  `).get(req.params.id);
  if (!job) return res.status(404).render('404', { title: 'Job not found' });

  let matchResult = null;
  let aiExplanation = null;
  let alreadyApplied = false;
  if (req.user) {
    matchResult = scoreJobForUser(req.user, job);
    aiExplanation = await generateAIExplanation(req.user, job, matchResult);
    alreadyApplied = !!db.prepare('SELECT id FROM applications WHERE job_id = ? AND user_id = ?').get(job.id, req.user.id);
  }

  const applicantCount = db.prepare('SELECT COUNT(*) as c FROM applications WHERE job_id = ?').get(job.id).c;

  res.render('job-detail', { title: job.title, job, matchResult, aiExplanation, alreadyApplied, applicantCount });
});

// ---- Apply ----
router.post('/jobs/:id/apply', requireAuth, (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).render('404', { title: 'Job not found' });
  const { score } = scoreJobForUser(req.user, job);
  try {
    db.prepare('INSERT INTO applications (job_id, user_id, cover_letter, match_score) VALUES (?,?,?,?)')
      .run(job.id, req.user.id, req.body.cover_letter || '', score);
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)').run(
      job.posted_by, 'application_update', `${req.user.name} applied for "${job.title}" (${score}% match).`, `/jobs/${job.id}/applicants`
    );
    req.flash('success', 'Application submitted!');
  } catch (e) {
    req.flash('error', 'You have already applied to this job.');
  }
  res.redirect(`/jobs/${job.id}`);
});

// ---- Save / unsave ----
router.post('/jobs/:id/save', requireAuth, (req, res) => {
  try {
    db.prepare('INSERT INTO saved_jobs (user_id, job_id) VALUES (?, ?)').run(req.user.id, req.params.id);
  } catch (e) {
    db.prepare('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?').run(req.user.id, req.params.id);
  }
  res.redirect('back');
});

// ---- Applicants list (recruiter/poster only) ----
router.get('/jobs/:id/applicants', requireAuth, (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job || job.posted_by !== req.user.id) {
    req.flash('error', 'You cannot view applicants for that job.');
    return res.redirect('/jobs');
  }
  const applicants = db.prepare(`
    SELECT applications.*, users.name, users.email, users.headline, users.skills, users.experience_years, users.avatar, users.resume_path
    FROM applications JOIN users ON applications.user_id = users.id
    WHERE applications.job_id = ? ORDER BY applications.match_score DESC
  `).all(job.id);
  res.render('applicants', { title: `Applicants – ${job.title}`, job, applicants });
});

router.post('/applications/:id/status', requireAuth, (req, res) => {
  const app = db.prepare('SELECT applications.*, jobs.posted_by, jobs.title FROM applications JOIN jobs ON applications.job_id = jobs.id WHERE applications.id = ?').get(req.params.id);
  if (!app || app.posted_by !== req.user.id) {
    req.flash('error', 'Not authorized.');
    return res.redirect('back');
  }
  db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?,?,?,?)').run(
    app.user_id, 'application_update', `Your application for "${app.title}" was updated to: ${req.body.status}.`, `/jobs/${app.job_id}`
  );
  req.flash('success', 'Applicant status updated.');
  res.redirect(`/jobs/${app.job_id}/applicants`);
});

module.exports = router;
