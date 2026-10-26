const { parseResume } = require('../extension/resume.js');

const samples = {
  'one-column': `ANU MATHEW
Kochi, Kerala | +91 98765 43210 | anu.mathew@example.com
linkedin.com/in/anu-mathew | github.com/anumathew | https://anu.dev

SUMMARY
Full stack developer who likes building things.

EXPERIENCE
Full Stack Developer Intern | Acme Systems | Kochi, Kerala
Jul 2024 – Present
• Built the web and mobile features of a manufacturing SaaS platform.
• Wrote REST APIs in Node.js.

Software Engineer Trainee at Beta Labs
Jan 2023 - Jun 2023
- Automated test suites.

EDUCATION
Government Engineering College, Kozhikode
B.Tech in Computer Science and Design | CGPA: 8.66 | 2020 – 2024
GHSS Patikkad
Higher Secondary (Science) – 98.2% – 2020

TECHNICAL SKILLS
Languages: Python, JavaScript, Java
Frameworks: React, Node.js, Express

PROJECTS
Job apply autofill`,

  'two-line-headings': `Rahul K
rahul.k@example.com
9876501234

Education
Bachelor of Technology - Mechanical Engineering
College of Engineering Trivandrum
Aug 2018 - May 2022
CGPA 7.9/10

Work Experience
Acme Corp
Design Engineer
06/2022 - 12/2023
Kerala, India
Designed parts.

Skills
AutoCAD • SolidWorks • MATLAB`,
};

const assert = require('node:assert');
const r = {};
for (const [name, text] of Object.entries(samples)) {
  r[name] = parseResume(text);
  console.log('==', name);
  console.log(JSON.stringify(r[name], null, 1));
}
const a = r['one-column'], b = r['two-line-headings'];
assert.deepStrictEqual([a.personal.firstName, a.personal.lastName, a.personal.phone, a.personal.city], ['Anu', 'Mathew', '9876543210', 'Kochi']);
assert.deepStrictEqual(a.education.map((e) => [e.school, e.degree, e.gpa, e.endYear]),
  [['Government Engineering College, Kozhikode', 'B.Tech', '8.66', '2024'], ['GHSS Patikkad', 'Higher Secondary', '98.2', '2020']]);
assert.deepStrictEqual(a.experience.map((e) => [e.title, e.company, e.startYear, !!e.current]),
  [['Full Stack Developer Intern', 'Acme Systems', '2024', true], ['Software Engineer Trainee', 'Beta Labs', '2023', false]]);
assert.deepStrictEqual([b.experience[0].title, b.experience[0].company, b.experience[0].location], ['Design Engineer', 'Acme Corp', 'Kerala, India']);
assert.strictEqual(b.job.skills, 'AutoCAD, SolidWorks, MATLAB');
console.log('resume parser: all checks passed');
