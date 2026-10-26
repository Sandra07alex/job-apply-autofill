const {chromium}=require('playwright');const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'..','extension','fill.js'),'utf8');
const profile={personal:{firstName:'Anu',lastName:'Mathew',email:'anu@x.com',phone:'9876543210',phoneCountryCode:'+91',addressLine1:'12 MG Road',city:'Kochi',postalCode:'682001',country:'India',linkedin:'https://linkedin.com/in/anu',portfolio:'https://anu.dev'},
job:{noticePeriod:'Immediate',expectedCtc:'6 LPA',workAuthorized:'Yes',needSponsorship:'No',totalExperience:'1',skills:'Python, React'},
education:[{school:'CUSAT',degree:'B.Tech',field:'CSE',gpa:'8.2',startMonth:'08',startYear:'2020',endMonth:'05',endYear:'2024'}],
experience:[{title:'Intern',company:'Acme',location:'Kochi',startMonth:'01',startYear:'2024',endMonth:'06',endYear:'2024',description:'Built stuff'},
{title:'Dev',company:'Beta',location:'Remote',startMonth:'07',startYear:'2024',current:true}],
answers:[{q:'former employee of Ernst',a:'No'},{q:'non-competition',a:'No'},{q:'I understand and agree',a:'Yes'}]};
let browser;
async function run(name,html){const page=await browser.newPage();await page.setContent(`<body>${html}</body>`);
await page.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p}},profile);
const r=await page.evaluate(src);console.log('==',name,JSON.stringify(r));
const rows=await page.evaluate(()=>[...document.querySelectorAll('input,select,textarea,button[aria-haspopup]')].map(e=>[(e.name||e.id||e.getAttribute('aria-label')),
e.type==='checkbox'||e.type==='radio'?e.checked:e.tagName==='BUTTON'?e.textContent:
e.dataset.automationId==='searchBox'?[...e.parentElement.querySelectorAll('[data-automation-id=selectedItem]')].map(p=>p.textContent).join(' + '):e.value]));
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
// Workday's real ids, "Select One" listbox buttons and search-and-pick boxes.
await run('workday-v2',`
<div data-automation-id="formField-addressLine1"><label for="address--addressLine1">Address Line 1</label><input id="address--addressLine1"></div>
<div data-automation-id="formField-city"><label for="address--city">City</label><input id="address--city"></div>
<div data-automation-id="formField-postalCode"><label for="address--postalCode">Postal Code</label><input id="address--postalCode"></div>
<div data-automation-id="formField-phoneNumber"><label for="phoneNumber--phoneNumber">Phone Number</label><input id="phoneNumber--phoneNumber"></div>
<div data-automation-id="formField-extension"><label for="phoneNumber--extension">Phone Extension</label><input id="phoneNumber--extension"></div>
<div data-automation-id="formField-schoolName"><label for="education-1--schoolName">School or University</label>
 <div data-automation-id="multiselectInputContainer"><input id="education-1--schoolName" data-automation-id="searchBox" data-opts="Cochin University of Science and Technology (CUSAT)|CUSAT College Kochi|Other"></div></div>
<div data-automation-id="formField-degree"><label for="education-1--degree">Degree</label>
 <button id="education-1--degree" aria-haspopup="listbox" data-opts="High School Diploma|Bachelor's Degree|Master's Degree">Select One</button></div>
<div data-automation-id="formField-skills"><label for="skills--skills">Type to Add Skills</label>
 <div data-automation-id="multiselectInputContainer"><input id="skills--skills" data-automation-id="searchBox" data-opts="Python (Programming Language)|React.js|Java"></div></div>
<div data-automation-id="formField-url"><label for="webAddress-1--url">URL</label><input id="webAddress-1--url"></div>
<script>
const list=document.createElement('ul');list.setAttribute('role','listbox');list.hidden=true;document.body.append(list);
function show(opts,pick){list.innerHTML='';list.hidden=false;for(const o of opts){const li=document.createElement('li');li.setAttribute('role','option');
 li.textContent=o;li.onclick=()=>{list.hidden=true;pick(o)};list.append(li);}}
document.querySelectorAll('button[data-opts]').forEach(b=>b.onclick=()=>show(b.dataset.opts.split('|'),o=>b.textContent=o));
document.querySelectorAll('input[data-opts]').forEach(i=>i.addEventListener('keydown',e=>{if(e.key!=='Enter')return;
 const q=i.value.toLowerCase();show(i.dataset.opts.split('|').filter(o=>o.toLowerCase().includes(q.slice(0,4))),o=>{
 const p=document.createElement('div');p.dataset.automationId='selectedItem';p.textContent=o;i.before(p);i.value='';});}));
</script>`);
// Workday "Application Questions": Yes/No listbox buttons answered from saved answers.
const q=(id,text)=>`<div data-automation-id="formField-${id}"><label for="${id}">${text}</label>
 <button id="${id}" aria-haspopup="listbox" aria-required="true" data-opts="Yes|No">Select One</button></div>`;
await run('workday-questions',
 q('q1','1. Are you a current or former employee of Ernst &amp; Young?')+
 q('q3','3. Did you sign any non-competition or non-solicitation agreement with your current employer (or other company) that might impact or prevent you to work in any way for Intel?')+
 q('q4','4. Do you own, control or have an economic interest in any intellectual property right (patents, trademarks, or copyrights)?')+
 q('q6','6. I understand and agree that any false information, misrepresentation, or omission of facts in this document may be considered as dishonest and deception.')+
 q('q7','7. Are you legally entitled to work in India for which you are applying and can provide evidence?')+
 `<script>const list=document.createElement('ul');list.setAttribute('role','listbox');list.hidden=true;document.body.append(list);
document.querySelectorAll('button[data-opts]').forEach(b=>b.onclick=()=>{list.innerHTML='';list.hidden=false;
 for(const o of b.dataset.opts.split('|')){const li=document.createElement('li');li.setAttribute('role','option');li.textContent=o;
 li.onclick=()=>{list.hidden=true;b.textContent=o};list.append(li);}});</script>`);
await browser.close();})();
