/**
 * recommendationEngine.js
 * -----------------------------------------------------------------------
 * A content-based AI recommendation engine for the platform.
 *
 * It scores Jobs / Companies / People for a given user using a weighted
 * similarity model (skills overlap via Jaccard/cosine-style scoring,
 * experience-band matching, location matching, and recency decay) --
 * the same family of technique real job platforms use for "matching %".
 *
 * OPTIONAL LLM UPGRADE:
 * If an OPENAI_API_KEY (or ANTHROPIC_API_KEY) is present in the environment,
 * generateAIExplanation() will call that provider to produce a natural
 * language "why this matches you" blurb. Without a key, it falls back to a
 * clear, deterministic, rule-based explanation -- so the app works fully
 * out of the box with zero external dependencies or cost.
 * -----------------------------------------------------------------------
 */

const db = require('../config/db');
let fetchFn = global.fetch;
if (!fetchFn) {
  try { fetchFn = require('node-fetch'); } catch (e) { fetchFn = null; }
}

// ---------- helpers ----------
function toSkillSet(skillsStr) {
  return new Set(
    (skillsStr || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function experienceMatchScore(userExp, jobExpRequired) {
  const diff = Math.abs((userExp || 0) - (jobExpRequired || 0));
  if (diff <= 0.5) return 1;
  if (diff <= 1.5) return 0.75;
  if (diff <= 3) return 0.45;
  if (diff <= 5) return 0.2;
  return 0.05;
}

function locationMatchScore(userLoc, jobLoc) {
  if (!userLoc || !jobLoc) return 0.4; // unknown = neutral-ish
  const u = userLoc.trim().toLowerCase();
  const j = jobLoc.trim().toLowerCase();
  if (j.includes('remote')) return 1;
  if (u === j) return 1;
  if (j.includes(u) || u.includes(j)) return 0.7;
  return 0.15;
}

function recencyScore(createdAt) {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 2) return 1;
  if (days <= 7) return 0.85;
  if (days <= 21) return 0.6;
  if (days <= 45) return 0.35;
  return 0.15;
}

// ---------- CORE: score a job for a user ----------
function scoreJobForUser(user, job) {
  const userSkills = toSkillSet(user.skills);
  const jobSkills = toSkillSet(job.skills_required);
  const skillScore = jaccardSimilarity(userSkills, jobSkills);
  const expScore = experienceMatchScore(user.experience_years, job.experience_required);
  const locScore = locationMatchScore(user.location, job.location);
  const recScore = recencyScore(job.created_at);

  // Weighted composite -- weights tuned so skill-fit dominates, like real ATS matching engines
  const composite =
    skillScore * 0.55 +
    expScore * 0.20 +
    locScore * 0.15 +
    recScore * 0.10;

  const matchedSkills = [...userSkills].filter(s => jobSkills.has(s));
  return {
    score: Math.round(composite * 100),
    matchedSkills,
    skillScore, expScore, locScore, recScore
  };
}

// ---------- Recommend jobs ----------
function recommendJobsForUser(userId, limit = 20) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return [];
  const jobs = db.prepare(`
    SELECT jobs.*, companies.name as company_name, companies.logo as company_logo
    FROM jobs JOIN companies ON jobs.company_id = companies.id
    WHERE jobs.status = 'open'
  `).all();

  // exclude jobs already applied to
  const applied = new Set(
    db.prepare('SELECT job_id FROM applications WHERE user_id = ?').all(userId).map(r => r.job_id)
  );

  const scored = jobs
    .filter(j => !applied.has(j.id))
    .map(job => {
      const result = scoreJobForUser(user, job);
      return { ...job, ...result };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

// ---------- Recommend companies ----------
function recommendCompaniesForUser(userId, limit = 8) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return [];
  const companies = db.prepare('SELECT * FROM companies').all();
  const userSkills = toSkillSet(user.skills);

  const scored = companies.map(company => {
    const companyJobs = db.prepare("SELECT * FROM jobs WHERE company_id = ? AND status = 'open'").all(company.id);
    let bestSkillOverlap = 0;
    let openRoles = companyJobs.length;
    for (const job of companyJobs) {
      const overlap = jaccardSimilarity(userSkills, toSkillSet(job.skills_required));
      if (overlap > bestSkillOverlap) bestSkillOverlap = overlap;
    }
    const locScore = locationMatchScore(user.location, company.location);
    const composite = bestSkillOverlap * 0.6 + locScore * 0.2 + Math.min(openRoles / 5, 1) * 0.2;
    return { ...company, score: Math.round(composite * 100), openRoles };
  }).sort((a, b) => b.score - a.score);

  return scored.filter(c => c.score > 0 || c.openRoles > 0).slice(0, limit);
}

// ---------- Recommend "people you may know" ----------
function recommendPeopleForUser(userId, limit = 8) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return [];
  const others = db.prepare('SELECT * FROM users WHERE id != ?').all(userId);

  const existingConnIds = new Set();
  const conns = db.prepare(
    'SELECT requester_id, addressee_id FROM connections WHERE requester_id = ? OR addressee_id = ?'
  ).all(userId, userId);
  conns.forEach(c => {
    existingConnIds.add(c.requester_id === userId ? c.addressee_id : c.requester_id);
  });

  const userSkills = toSkillSet(user.skills);
  const scored = others
    .filter(o => !existingConnIds.has(o.id))
    .map(person => {
      const skillOverlap = jaccardSimilarity(userSkills, toSkillSet(person.skills));
      const sameCompany = user.company_id && person.company_id === user.company_id ? 1 : 0;
      const sameLocation = locationMatchScore(user.location, person.location);
      const sameEducation = user.education && person.education &&
        user.education.trim().toLowerCase() === person.education.trim().toLowerCase() ? 1 : 0;
      const composite = skillOverlap * 0.45 + sameCompany * 0.25 + sameLocation * 0.15 + sameEducation * 0.15;
      return { ...person, score: Math.round(composite * 100), sameCompany: !!sameCompany, sameEducation: !!sameEducation };
    })
    .sort((a, b) => b.score - a.score);

  return scored.filter(p => p.score > 5).slice(0, limit);
}

// ---------- Eligible job notifications ----------
// Call periodically (or on job creation) to notify users of strong new matches.
function notifyEligibleUsersForJob(jobId, { threshold = 55, maxNotify = 200 } = {}) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return 0;
  const seekers = db.prepare("SELECT * FROM users WHERE role = 'seeker' AND open_to_work = 1").all();

  const insertNotif = db.prepare(
    'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
  );
  const alreadyNotified = db.prepare(
    "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND link = ? AND type = 'job_match'"
  );

  let count = 0;
  for (const user of seekers) {
    if (count >= maxNotify) break;
    const { score, matchedSkills } = scoreJobForUser(user, job);
    if (score >= threshold) {
      const dup = alreadyNotified.get(user.id, `/jobs/${job.id}`);
      if (dup.c > 0) continue;
      const skillsNote = matchedSkills.length
        ? ` You match on: ${matchedSkills.slice(0, 4).join(', ')}.`
        : '';
      insertNotif.run(
        user.id,
        'job_match',
        `You're a ${score}% match for "${job.title}".${skillsNote}`,
        `/jobs/${job.id}`
      );
      count++;
    }
  }
  return count;
}

function notifyAllOpenJobsForUser(userId, { threshold = 55 } = {}) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || user.role !== 'seeker') return 0;
  const jobs = recommendJobsForUser(userId, 100);
  const insertNotif = db.prepare(
    'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
  );
  const alreadyNotified = db.prepare(
    "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND link = ? AND type = 'job_match'"
  );
  let count = 0;
  for (const job of jobs) {
    if (job.score >= threshold) {
      const dup = alreadyNotified.get(userId, `/jobs/${job.id}`);
      if (dup.c > 0) continue;
      insertNotif.run(
        userId, 'job_match',
        `You're a ${job.score}% match for "${job.title}" at ${job.company_name}.`,
        `/jobs/${job.id}`
      );
      count++;
    }
  }
  return count;
}

// ---------- Optional real-LLM explanation (graceful fallback built in) ----------
async function generateAIExplanation(user, job, matchResult) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  const fallback = buildRuleBasedExplanation(user, job, matchResult);

  if (!apiKey || !fetchFn) return fallback;

  try {
    if (process.env.OPENAI_API_KEY) {
      const resp = await fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a career assistant. In 1-2 short sentences, explain why this candidate fits this job. Be specific and encouraging.' },
            { role: 'user', content: `Candidate skills: ${user.skills}. Experience: ${user.experience_years} yrs. Job title: ${job.title}. Required skills: ${job.skills_required}. Match score: ${matchResult.score}%.` }
          ],
          max_tokens: 100
        }),
        timeout: 8000
      });
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      return text ? text.trim() : fallback;
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const resp = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `In 1-2 short encouraging sentences, explain why this candidate fits this job. Candidate skills: ${user.skills}. Experience: ${user.experience_years} yrs. Job title: ${job.title}. Required skills: ${job.skills_required}. Match score: ${matchResult.score}%.`
          }]
        }),
        timeout: 8000
      });
      const data = await resp.json();
      const text = data?.content?.[0]?.text;
      return text ? text.trim() : fallback;
    }
  } catch (err) {
    return fallback;
  }
  return fallback;
}

function buildRuleBasedExplanation(user, job, matchResult) {
  const { score, matchedSkills } = matchResult;
  if (score >= 75) {
    return `Excellent fit (${score}%) — you share ${matchedSkills.length} key skill${matchedSkills.length !== 1 ? 's' : ''} (${matchedSkills.slice(0, 3).join(', ') || 'core requirements'}) with this role, and your experience level lines up well.`;
  } else if (score >= 50) {
    return `Good match (${score}%) — overlapping skills in ${matchedSkills.slice(0, 3).join(', ') || 'a few areas'}. Worth a look even if not every requirement lines up perfectly.`;
  } else if (score >= 25) {
    return `Partial match (${score}%) — some relevant overlap, but this role may require skills or experience you haven't listed on your profile yet.`;
  }
  return `Low match (${score}%) — this role's requirements differ significantly from your current profile.`;
}

module.exports = {
  scoreJobForUser,
  recommendJobsForUser,
  recommendCompaniesForUser,
  recommendPeopleForUser,
  notifyEligibleUsersForJob,
  notifyAllOpenJobsForUser,
  generateAIExplanation,
  toSkillSet,
  jaccardSimilarity
};
