const {chromium}=require('playwright');const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'..','extension','fill.js'),'utf8');
const profile={personal:{firstName:'Anu',lastName:'Mathew',email:'anu@x.com',phone:'9876543210',phoneCountryCode:'+91',city:'Kochi',country:'India',linkedin:'https://linkedin.com/in/anu'},
job:{noticePeriod:'Immediate',expectedCtc:'6 LPA',workAuthorized:'Yes',needSponsorship:'No',totalExperience:'1'},
education:[{school:'CUSAT',degree:'B.Tech',field:'CSE',gpa:'8.2',startMonth:'08',startYear:'2020',endMonth:'05',endYear:'2024'}],
experience:[{title:'Intern',company:'Acme',location:'Kochi',startMonth:'01',startYear:'2024',endMonth:'06',endYear:'2024',description:'Built stuff'},
{title:'Dev',company:'Beta',location:'Remote',startMonth:'07',startYear:'2024',current:true}]};
let browser;
async function run(name,html){const page=await browser.newPage();await page.setContent(`<body>${html}</body>`);
await page.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p}},profile);
const r=await page.evaluate(src);console.log('==',name,JSON.stringify(r));
const rows=await page.evaluate(()=>[...document.querySelectorAll('input,select,textarea')].map(e=>[(e.name||e.id||e.getAttribute('aria-label')),e.type==='checkbox'||e.type==='radio'?e.checked:e.value]));
rows.forEach(([n,v])=>console.log('  ',String(n).padEnd(28),v));await page.close();}
(async()=>{browser=await chromium.launch();
await run('linkedin',`<label for=a>First name</label><input id=a><label for=b>Last name</label><input id=b>
<label for=c>Email address</label><select id=c><option>Select</option><option>anu@x.com</option></select>
<label for=d>Phone country code</label><select id=d><option>Select</option><option>India (+91)</option></select>
<label for=e>Mobile phone number</label><input id=e required><label for=f>City</label><input id=f>
<label for=g>How many years of work experience do you have with Python?</label><input id=g>
<fieldset><legend>Will you now or in the future require visa sponsorship?</legend><label><input type=radio name=s value=Yes>Yes</label><label><input type=radio name=s value=No>No</label></fieldset>
<label for=h>Notice period</label><input id=h><label for=z>Why do you want to join?</label><textarea id=z required></textarea>`);
await run('workday',`
<div data-automation-id="formField-legalNameSection_firstName"><input aria-label="First Name"></div>
<div><input aria-label="Last Name" value="Mathew"></div>
<div data-automation-id="workExperience-1">
 <div data-automation-id="formField-jobTitle"><input name="jobTitle1" aria-label="Job Title"></div>
 <div data-automation-id="formField-companyName"><input name="company1" aria-label="Company"></div>
 <div data-automation-id="formField-location"><input name="loc1" aria-label="Location"></div>
 <input type=checkbox name="cur1" aria-label="I currently work here">
 <div role=group aria-label="From"><input name="fm1" aria-label="Month"><input name="fy1" aria-label="Year"></div>
 <div role=group aria-label="To"><input name="tm1" aria-label="Month"><input name="ty1" aria-label="Year"></div>
 <textarea name="desc1" aria-label="Role Description"></textarea></div>
<div data-automation-id="workExperience-2">
 <input name="jobTitle2" aria-label="Job Title"><input name="company2" aria-label="Company"><input name="loc2" aria-label="Location">
 <input type=checkbox name="cur2" aria-label="I currently work here">
 <div role=group aria-label="From"><input name="fm2" aria-label="Month"><input name="fy2" aria-label="Year"></div>
 <div role=group aria-label="To"><input name="tm2" aria-label="Month"><input name="ty2" aria-label="Year"></div></div>
<div data-automation-id="education-1">
 <input name="school" aria-label="School or University"><input name="degree" aria-label="Degree"><input name="fos" aria-label="Field of Study"><input name="gpa" aria-label="Overall Result (GPA)">
 <div role=group aria-label="From"><input name="efy" aria-label="Year"></div><div role=group aria-label="To (Actual or Expected)"><input name="ety" aria-label="Year"></div></div>`);
await browser.close();})();
