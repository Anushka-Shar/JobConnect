/**
 * Seed script — populates the database with realistic demo data so you can
 * explore JobConnect (AI matching, network suggestions, etc.) immediately.
 * Run with: npm run seed
 */
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const pass = bcrypt.hashSync('password123', 10);

console.log('🌱 Seeding database...');

// Clear existing demo-safe tables (keeps schema)
db.exec(`
  DELETE FROM notifications; DELETE FROM applications; DELETE FROM saved_jobs;
  DELETE FROM connections; DELETE FROM posts; DELETE FROM jobs;
  DELETE FROM users; DELETE FROM companies;
`);

const companies = [
  { name: 'NimbusTech', industry: 'Cloud Software', location: 'Bengaluru, India', description: 'NimbusTech builds cloud infrastructure tools used by thousands of engineering teams worldwide.', website: 'https://example.com/nimbustech' },
  { name: 'Fintara', industry: 'Fintech', location: 'Mumbai, India', description: 'Fintara is reinventing digital payments and lending for the next billion users.', website: 'https://example.com/fintara' },
  { name: 'PixelForge Studios', industry: 'Design & Media', location: 'Pune, India', description: 'A product design studio crafting delightful digital experiences for global brands.', website: 'https://example.com/pixelforge' },
  { name: 'DataWave Analytics', industry: 'Data & AI', location: 'Hyderabad, India', description: 'DataWave helps enterprises turn raw data into decisions using modern ML pipelines.', website: 'https://example.com/datawave' },
  { name: 'GreenGrid Energy', industry: 'CleanTech', location: 'Remote', description: 'Building the software backbone for renewable energy grids across South Asia.', website: 'https://example.com/greengrid' }
];

const companyIds = {};
for (const c of companies) {
  const info = db.prepare('INSERT INTO companies (name, industry, location, description, website) VALUES (?,?,?,?,?)')
    .run(c.name, c.industry, c.location, c.description, c.website);
  companyIds[c.name] = info.lastInsertRowid;
}

// Recruiters (one per company)
const recruiters = [
  { name: 'Ananya Rao', email: 'ananya@nimbustech.com', company: 'NimbusTech', headline: 'Talent Acquisition Lead at NimbusTech' },
  { name: 'Rohit Malhotra', email: 'rohit@fintara.com', company: 'Fintara', headline: 'Head of HR at Fintara' },
  { name: 'Simran Kaur', email: 'simran@pixelforge.com', company: 'PixelForge Studios', headline: 'People Ops at PixelForge Studios' },
  { name: 'Vikram Nair', email: 'vikram@datawave.com', company: 'DataWave Analytics', headline: 'Recruiter at DataWave Analytics' },
  { name: 'Priya Menon', email: 'priya@greengrid.com', company: 'GreenGrid Energy', headline: 'Talent Partner at GreenGrid Energy' }
];
const recruiterIds = {};
for (const r of recruiters) {
  const info = db.prepare(`
    INSERT INTO users (name, email, password, role, headline, location, company_id, skills, experience_years)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(r.name, r.email, pass, 'recruiter', r.headline, 'India', companyIds[r.company], 'Recruiting, Talent Sourcing, HRBP', 5);
  recruiterIds[r.company] = info.lastInsertRowid;
}

// Job seekers with varied skill sets
const seekers = [
  { name: 'Aarav Sharma', email: 'aarav@example.com', headline: 'Frontend Developer', location: 'Bengaluru, India', skills: 'JavaScript, React, HTML, CSS, TypeScript', exp: 2.5, edu: 'B.Tech Computer Science, IIT Delhi', bio: 'Frontend developer passionate about building fast, accessible web apps.' },
  { name: 'Diya Patel', email: 'diya@example.com', headline: 'Backend Engineer', location: 'Mumbai, India', skills: 'Node.js, Express, PostgreSQL, Docker, REST APIs', exp: 3, edu: 'B.E Information Technology, VJTI', bio: 'Backend engineer who loves designing scalable APIs.' },
  { name: 'Kabir Singh', email: 'kabir@example.com', headline: 'Full Stack Developer', location: 'Pune, India', skills: 'React, Node.js, MongoDB, JavaScript, AWS', exp: 4, edu: 'B.Tech, COEP Pune', bio: 'Full-stack developer with a focus on product-led growth startups.' },
  { name: 'Ishita Verma', email: 'ishita@example.com', headline: 'UI/UX Designer', location: 'Pune, India', skills: 'Figma, UI Design, User Research, Prototyping, Design Systems', exp: 3.5, edu: 'NID Ahmedabad', bio: 'Designer obsessed with clean, human-centered interfaces.' },
  { name: 'Arjun Reddy', email: 'arjun@example.com', headline: 'Data Scientist', location: 'Hyderabad, India', skills: 'Python, Machine Learning, SQL, Pandas, TensorFlow', exp: 2, edu: 'M.Tech Data Science, IIIT Hyderabad', bio: 'Data scientist building ML pipelines for real-world impact.' },
  { name: 'Sneha Iyer', email: 'sneha@example.com', headline: 'Product Manager', location: 'Bengaluru, India', skills: 'Product Strategy, Agile, SQL, Roadmapping, Analytics', exp: 5, edu: 'MBA, IIM Bangalore', bio: 'PM focused on fintech and consumer products.' },
  { name: 'Yash Kulkarni', email: 'yash@example.com', headline: 'DevOps Engineer', location: 'Remote', skills: 'AWS, Docker, Kubernetes, CI/CD, Terraform', exp: 3, edu: 'B.Tech, NIT Trichy', bio: 'DevOps engineer automating everything that can be automated.' },
  { name: 'Meera Nambiar', email: 'meera@example.com', headline: 'Data Analyst', location: 'Hyderabad, India', skills: 'SQL, Python, Tableau, Excel, Data Visualization', exp: 1.5, edu: 'B.Sc Statistics, Osmania University', bio: 'Analyst who loves turning messy data into clear stories.' },
  { name: 'Rahul Deshmukh', email: 'rahul@example.com', headline: 'Junior Frontend Developer', location: 'Bengaluru, India', skills: 'JavaScript, React, CSS, Git', exp: 0.5, edu: 'B.Tech, BITS Pilani', bio: 'Recent grad excited to build great user interfaces.' },
  { name: 'Neha Joshi', email: 'neha@example.com', headline: 'Growth Marketer', location: 'Mumbai, India', skills: 'SEO, Content Strategy, Analytics, Growth Hacking', exp: 2, edu: 'MBA Marketing, NMIMS', bio: 'Growth marketer for early-stage fintech products.' }
];

const seekerIds = {};
for (const s of seekers) {
  const info = db.prepare(`
    INSERT INTO users (name, email, password, role, headline, location, skills, experience_years, education, bio, open_to_work)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)
  `).run(s.name, s.email, pass, 'seeker', s.headline, s.location, s.skills, s.exp, s.edu, s.bio);
  seekerIds[s.name] = info.lastInsertRowid;
}

const jobs = [
  { company: 'NimbusTech', title: 'Frontend Developer (React)', skills: 'JavaScript, React, TypeScript, CSS', location: 'Bengaluru, India', type: 'Full-time', exp: 2, min: 800000, max: 1400000,
    desc: 'Build and scale the customer-facing dashboard used by thousands of DevOps teams. You will work closely with design and backend to ship pixel-perfect, performant UI.' },
  { company: 'NimbusTech', title: 'DevOps Engineer', skills: 'AWS, Docker, Kubernetes, Terraform, CI/CD', location: 'Remote', type: 'Full-time', exp: 3, min: 1000000, max: 1800000,
    desc: 'Own our cloud infrastructure and deployment pipelines. Experience with Kubernetes at scale is a big plus.' },
  { company: 'Fintara', title: 'Backend Engineer (Node.js)', skills: 'Node.js, Express, PostgreSQL, REST APIs, Docker', location: 'Mumbai, India', type: 'Full-time', exp: 3, min: 1000000, max: 1700000,
    desc: 'Design and build the core payments API powering millions of transactions monthly. Strong focus on reliability and security.' },
  { company: 'Fintara', title: 'Product Manager - Payments', skills: 'Product Strategy, SQL, Agile, Analytics, Roadmapping', location: 'Mumbai, India', type: 'Full-time', exp: 4, min: 1800000, max: 2800000,
    desc: 'Own the roadmap for our merchant payments product line, working with engineering, design and compliance.' },
  { company: 'PixelForge Studios', title: 'Senior UI/UX Designer', skills: 'Figma, UI Design, Design Systems, Prototyping, User Research', location: 'Pune, India', type: 'Full-time', exp: 3, min: 900000, max: 1500000,
    desc: 'Lead design for client projects spanning fintech, healthtech and consumer apps. Portfolio required.' },
  { company: 'PixelForge Studios', title: 'Full Stack Developer', skills: 'React, Node.js, MongoDB, JavaScript', location: 'Pune, India', type: 'Full-time', exp: 3, min: 900000, max: 1600000,
    desc: 'Build interactive prototypes and production apps for our design clients.' },
  { company: 'DataWave Analytics', title: 'Data Scientist', skills: 'Python, Machine Learning, TensorFlow, SQL, Pandas', location: 'Hyderabad, India', type: 'Full-time', exp: 2, min: 1000000, max: 1800000,
    desc: 'Build predictive models and ML pipelines for enterprise clients across retail and BFSI.' },
  { company: 'DataWave Analytics', title: 'Data Analyst', skills: 'SQL, Python, Tableau, Data Visualization, Excel', location: 'Hyderabad, India', type: 'Full-time', exp: 1, min: 500000, max: 900000,
    desc: 'Turn raw data into dashboards and insights that drive client decisions.' },
  { company: 'GreenGrid Energy', title: 'DevOps / Cloud Engineer', skills: 'AWS, Docker, Kubernetes, CI/CD', location: 'Remote', type: 'Remote', exp: 2, min: 900000, max: 1500000,
    desc: 'Help scale the software backbone for renewable energy grid monitoring across South Asia.' },
  { company: 'GreenGrid Energy', title: 'Growth Marketing Associate', skills: 'SEO, Content Strategy, Analytics, Growth Hacking', location: 'Remote', type: 'Full-time', exp: 1, min: 500000, max: 850000,
    desc: 'Drive organic growth and content strategy for our clean-energy SaaS platform.' },
  { company: 'NimbusTech', title: 'Junior Frontend Developer', skills: 'JavaScript, React, CSS, Git', location: 'Bengaluru, India', type: 'Full-time', exp: 0, min: 500000, max: 800000,
    desc: 'Great entry point for early-career developers who love building clean interfaces. Mentorship provided.' },
];

const jobIds = [];
for (const j of jobs) {
  const info = db.prepare(`
    INSERT INTO jobs (company_id, posted_by, title, description, skills_required, location, job_type, experience_required, salary_min, salary_max)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(companyIds[j.company], recruiterIds[j.company], j.title, j.desc, j.skills, j.location, j.type, j.exp, j.min, j.max);
  jobIds.push(info.lastInsertRowid);
}

// Some posts for the feed
const posts = [
  { user: 'Sneha Iyer', content: "Thrilled to share that our team just shipped a major update to Fintara's merchant dashboard! 🚀" },
  { user: 'Ishita Verma', content: 'Design systems are a superpower for scaling teams. Wrote a few notes on how we built ours at PixelForge.' },
  { user: 'Arjun Reddy', content: 'Open to new data science opportunities! Excited about anything involving ML in production.' },
  { user: 'Yash Kulkarni', content: 'Kubernetes migration complete after 3 months of work. Ask me anything about zero-downtime cutovers.' }
];
for (const p of posts) {
  db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(seekerIds[p.user], p.content);
}

// A few connections
db.prepare("INSERT INTO connections (requester_id, addressee_id, status) VALUES (?,?,'accepted')").run(seekerIds['Aarav Sharma'], seekerIds['Rahul Deshmukh']);
db.prepare("INSERT INTO connections (requester_id, addressee_id, status) VALUES (?,?,'accepted')").run(seekerIds['Diya Patel'], seekerIds['Kabir Singh']);
db.prepare("INSERT INTO connections (requester_id, addressee_id, status) VALUES (?,?,'pending')").run(seekerIds['Meera Nambiar'], seekerIds['Arjun Reddy']);

// Trigger AI matching for all posted jobs to pre-populate notifications
const { notifyEligibleUsersForJob } = require('../utils/recommendationEngine');
let notifCount = 0;
for (const id of jobIds) notifCount += notifyEligibleUsersForJob(id, { threshold: 50 });

console.log(`✅ Seeded ${companies.length} companies, ${recruiters.length} recruiters, ${seekers.length} job seekers, ${jobs.length} jobs.`);
console.log(`✅ AI matching engine auto-notified ${notifCount} candidate(s) of eligible jobs.`);
console.log('\nDemo login (any seeded user): password123');
console.log('e.g.  aarav@example.com / password123   (job seeker)');
console.log('e.g.  ananya@nimbustech.com / password123 (recruiter)');
