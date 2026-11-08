const {chromium}=require('playwright');const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'..','extension','fill.js'),'utf8');
const profile={personal:{firstName:'Anu',lastName:'Mathew',gender:'Female',dateOfBirth:'2002-05-14',email:'anu@x.com',phone:'9876543210',phoneCountryCode:'+91',addressLine1:'12 MG Road',city:'Kochi',postalCode:'682001',country:'India',linkedin:'https://linkedin.com/in/anu',portfolio:'https://anu.dev'},
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
// Keka-style: gender select, date of birth, joining time in days, and a tag box for skills.
await run('keka',`
<label for=k1>Gender *</label><select id=k1><option value=''>Select an option</option><option>Male</option><option>Female</option></select>
<label for=k2>Date of Birth</label><input id=k2 placeholder="DD/MM/YYYY">
<label for=k3>Available To Join (in days)</label><input id=k3 type=number>
<label for=k4>Skills</label><div id=tags></div><input id=k4 placeholder="Add new skill">
<script>const k4=document.getElementById('k4');k4.addEventListener('keydown',e=>{if(e.key==='Enter'&&k4.value){
 const t=document.createElement('input');t.name='tag';t.value=k4.value;t.disabled=true;document.getElementById('tags').append(t);k4.value='';}});
k4.addEventListener('blur',()=>{k4.value=''});</script>`);
// Rippling-style: labels in plain divs (not linked), a "+1 US" phone code preset,
// a location box whose suggestions arrive late, textareas, and consent radios.
const rf=(label,field)=>`<div class=field><div class=lbl><span>${label}</span><span>*</span></div><div class=ctl>${field}</div></div>`;
await run('rippling',
 rf('Current company','<input name="f-1a2b">')+
 rf('Phone number','<div class=row><select name="f-cc"><option>+1 US</option><option>+44 GB</option><option>+91 IN</option></select><input type=tel name="f-ph"></div>')+
 rf('Location','<input name="f-loc" role=combobox aria-autocomplete=list aria-controls=locs><ul id=locs role=listbox></ul>')+
 rf('Overall Experience (Years)','<input name="f-3c4d">')+
 rf('Current CTC (Fixed + Variable)','<textarea name="f-5e6f"></textarea>')+
 rf('Expected CTC','<textarea name="f-7a8b"></textarea>')+
 rf('Notice Period (days)','<textarea name="f-9c0d"></textarea>')+
 `<p>Check Yes or No to indicate your agreement to receive text messages.</p>
 <label><input type=radio name=sms value=yes>Yes - I consent to receiving text messages</label>
 <label><input type=radio name=sms value=no>No - I do not consent</label>
<script>const loc=document.querySelector('[name=f-loc]'),ul=document.getElementById('locs');
loc.addEventListener('input',()=>setTimeout(()=>{ul.innerHTML='';for(const o of ['Kochi, Kerala, India','Kochin, Sri Lanka']){
 const li=document.createElement('li');li.setAttribute('role','option');li.textContent=o;li.onclick=()=>{loc.value=o;ul.innerHTML='';};ul.append(li);}},600));</script>`);
// Add buttons, resume upload, and learning from answers you give yourself.
{
  const page=await browser.newPage();
  await page.setContent(`<body>
<h3>Education</h3><div id=edu></div><button id=addEdu>Add</button>
<div><h3>Resume/CV</h3><div>Drop files here <input type=file id=resume style="display:none"></div></div>
<div><h3>Cover letter</h3><div>Drop or select <input type=file id=cover style="display:none"></div></div>
<label for=hear>How did you hear about us?</label><select id=hear><option value="">Select</option><option>LinkedIn</option><option>Naukri</option></select>
<div class=field><div>Current CTC (Fixed + Variable)</div><textarea id=ctc></textarea></div>
<label for=ok>I agree to the privacy policy</label><select id=ok><option value="">Select</option><option>Yes</option></select>
<script>let n=0;document.getElementById('addEdu').onclick=()=>{n++;const b=document.getElementById('addEdu');b.textContent='Add Another';
 document.getElementById('edu').insertAdjacentHTML('beforeend',
 '<input aria-label="School or University" name=school'+n+'><input aria-label="Degree" name=degree'+n+'>');};</script></body>`);
  const p2=JSON.parse(JSON.stringify(profile));
  p2.education.push({school:'GHSS Patikkad',degree:'Higher Secondary'});
  await page.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p,resume:{name:'Anu_Resume.pdf',type:'application/pdf',data:'data:application/pdf;base64,JVBERi0xLjQ='}}},p2);
  const r=await page.evaluate(src);console.log('== add-upload-learn',JSON.stringify(r));
  console.log('   education blocks  ',await page.evaluate(()=>[...document.querySelectorAll('#edu input')].map(e=>e.value).join(' | ')));
  console.log('   resume / cover    ',await page.evaluate(()=>[resume.files[0]&&resume.files[0].name,cover.files.length]));
  // You answer the fields it couldn't, like a person would.
  await page.selectOption('#hear',{label:'LinkedIn'});await page.fill('#ctc','4 LPA');await page.selectOption('#ok',{label:'Yes'});
  await page.waitForTimeout(3500);
  const saved=await page.evaluate(()=>({answers:window.__AUTOFILL_TEST__.profile.answers.slice(3),ctc:window.__AUTOFILL_TEST__.profile.job.currentCtc,toast:document.body.lastElementChild.textContent}));
  console.log('   learned answers   ',JSON.stringify(saved.answers));
  console.log('   learned CTC       ',saved.ctc);
  console.log('   toast             ',saved.toast);
  await page.close();
}
// Tracker: logged on fill (once per job across steps), marked Applied on the final Submit click.
{
  const page=await browser.newPage();
  const html=(step)=>`<html><head><title>Apply - Junior Software Engineer - Backend and Optimisation</title></head><body>
<h1>Application: Junior Software Engineer - Backend and Optimisation</h1>
<label for=fn>First name</label><input id=fn><p>Step ${step}</p><button id=submit type=button>Submit application</button></body></html>`;
  await page.route('https://ats.rippling.com/**',r=>r.fulfill({contentType:'text/html',body:html(r.request().url().endsWith('step2')?2:1)}));
  await page.goto('https://ats.rippling.com/benchmark-construction-technology/jobs/3bdf1ad9/apply');
  await page.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p}},profile);
  const r1=await page.evaluate(src);
  const apps=await page.evaluate(()=>window.__AUTOFILL_TEST__.applications);
  await page.evaluate(()=>{history.pushState({},'','/benchmark-construction-technology/jobs/3bdf1ad9/apply/step2');document.getElementById('fn').value='';});
  await page.evaluate(src);
  const afterStep2=await page.evaluate(()=>window.__AUTOFILL_TEST__.applications.length);
  await page.click('#submit');await page.waitForTimeout(300);
  const after=await page.evaluate(()=>window.__AUTOFILL_TEST__.applications[0]);
  console.log('== tracker',JSON.stringify(r1.tracked));
  console.log('   logged            ',apps.length,apps[0].key);
  console.log('   entries after step 2',afterStep2);
  console.log('   after submit      ',after.status,after.appliedOn?'(dated)':'(no date)');
  await page.close();
  // "Save job for later" on the posting, then Fill on its /apply page: one entry, To apply -> In progress.
  {
    const pg=await browser.newPage();
    await pg.route('https://jobs.lever.co/**',r=>r.fulfill({contentType:'text/html',body:'<title>Acme - Backend Intern</title><h1>Backend Intern</h1><label for=fn>First name</label><input id=fn>'}));
    await pg.goto('https://jobs.lever.co/acme/1234');
    await pg.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p};window.__AUTOFILL_SAVE_ONLY__=true},profile);
    const saved=(await pg.evaluate(src)).saved;
    const untouched=await pg.inputValue('#fn');
    await pg.goto('https://jobs.lever.co/acme/1234/apply');
    await pg.evaluate(p=>{window.__AUTOFILL_TEST__=Object.assign(window.__AUTOFILL_TEST__||{}, {profile:p})},profile);
    // Carry the tracker over, as chrome.storage would.
    await pg.evaluate(a=>{window.__AUTOFILL_TEST__.applications=a},[{...saved,key:'jobs.lever.co/acme/1234',id:'x'}]);
    await pg.evaluate(src);
    const apps=await pg.evaluate(()=>window.__AUTOFILL_TEST__.applications);
    console.log('   saved job          ',JSON.stringify(saved),'| field left empty:',untouched==='','| after Fill:',apps.length,'entry,',apps[0].status);
    await pg.close();
  }
  // Save job (Alt+Shift+S) on LinkedIn, Naukri and Indeed pages: real job link, title, company, city.
  for (const [site,url,body,want] of [
    ['naukri','https://www.naukri.com/job-listings-python-developer-trainee-foxdale-kochi-0-to-1-years-061125000123',
     `<title>Python Developer Trainee - Foxdale | Naukri.com</title><h1>Python Developer Trainee</h1>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Python Developer Trainee",
       "hiringOrganization":{"@type":"Organization","name":"Foxdale (P) Ltd"},"jobLocation":[{"@type":"Place","address":{"addressLocality":"Kochi","addressRegion":"Kerala"}}]}</script>`,
     ['Python Developer Trainee','Foxdale (P) Ltd','Kochi, Kerala','https://www.naukri.com/job-listings-python-developer-trainee-foxdale-kochi-0-to-1-years-061125000123']],
    ['indeed','https://in.indeed.com/jobs?q=software+engineer+fresher&l=Kochi&vjk=abc123def',
     `<title>Software Engineer Fresher Jobs in Kochi | Indeed</title><h1>Software engineer fresher jobs</h1>
      <h2 data-testid="jobsearch-JobInfoHeader-title">Junior Software Engineer - job post</h2>
      <div data-testid="inlineHeader-companyName">AlgoMinds 4.2 ★</div><div data-testid="inlineHeader-companyLocation">Kochi, Kerala</div>`,
     ['Junior Software Engineer','AlgoMinds','Kochi, Kerala','https://in.indeed.com/viewjob?jk=abc123def']],
    ['linkedin','https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=full%20stack',
     `<title>Jobs | LinkedIn</title><div class="job-details-jobs-unified-top-card__job-title"><h1>Full Stack Developer</h1></div>
      <div class="job-details-jobs-unified-top-card__company-name">Velvet Labs</div>
      <div class="job-details-jobs-unified-top-card__primary-description-container">Kochi, Kerala, India · 2 weeks ago · 40 applicants</div>`,
     ['Full Stack Developer','Velvet Labs','Kochi, Kerala, India','https://www.linkedin.com/jobs/view/4012345678/']],
    ['google','https://www.google.com/search?q=full+stack+fresher+jobs+kochi&udm=8#sv=abc',
     `<title>full stack fresher jobs kochi - Google Search</title>
      <div><div>Junior Full-Stack Developer</div><div>Windfall Production Pvt Ltd</div><div>Kochi, Keralam • via Shine</div></div>
      <div style="display:none"><h1>Old Cached Job</h1><div><span>Old Co</span> · <span>Pune</span> · <span>via Naukri</span></div><a href="https://www.naukri.com/job-old">Apply on Naukri</a></div>
      <div><div><div role="heading">Nesa Software Pvt Ltd</div></div><h1>MERN Stack Developer</h1>
       <div><span>Nesa Software Pvt Ltd</span> · <span>Kochi, Keralam</span> · <span>via SimplyHired</span></div>
       <div><a href="https://www.google.com/url?q=https%3A%2F%2Fwww.simplyhired.co.in%2Fjob%2Fabc123%3Futm_source%3Dgoogle"><span>Apply on SimplyHired</span></a><a href="https://in.jobrapido.com/jobpreview/9">Apply on Jobrapido.com</a></div>
       <h2>Job description</h2></div>`,
     ['MERN Stack Developer','Nesa Software Pvt Ltd','Kochi, Keralam','https://www.simplyhired.co.in/job/abc123?utm_source=google']]]) {
    const pg=await browser.newPage();
    await pg.route(url.split('?')[0]+'*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body}));
    await pg.goto(url);
    await pg.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p};window.__AUTOFILL_SAVE_ONLY__=true},profile);
    await pg.evaluate(src);
    const toast1=await pg.evaluate(()=>document.body.lastElementChild.textContent);
    await pg.evaluate(()=>{window.__AUTOFILL_SAVE_ONLY__=true});
    await pg.evaluate(src); // second press: already saved
    const toast2=await pg.evaluate(()=>document.body.lastElementChild.textContent);
    const a=(await pg.evaluate(()=>window.__AUTOFILL_TEST__.applications));
    console.log(`   save on ${site.padEnd(8)}`,JSON.stringify([a[0].role,a[0].company,a[0].location,a[0].url]),'| entries:',a.length,'|',toast1.replace('Undo',''),'|',toast2.replace('Undo','').slice(0,22));
    if(JSON.stringify([a[0].role,a[0].company,a[0].location,a[0].url])!==JSON.stringify(want)||a.length!==1) throw new Error('save on '+site+' wrong');
    await pg.close();
  }
  // Google Jobs: two jobs are two entries (even on a site that tells jobs apart by ?id=), and with no job open nothing is saved.
  {
    const panel=(title,co,id)=>`<h1>${title}</h1><div>${co} · Kochi · via Example</div><a href="https://jobs.example.com/view?id=${id}&utm_source=google">Apply on Example</a>`;
    const pg=await browser.newPage();
    let body=panel('Web Developer','One Co',1);
    await pg.route('https://www.google.com/search*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body}));
    await pg.goto('https://www.google.com/search?q=jobs&udm=8');
    await pg.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p};window.__AUTOFILL_SAVE_ONLY__=true},profile);
    await pg.evaluate(src);
    await pg.evaluate(h=>{document.body.innerHTML=h;window.__AUTOFILL_SAVE_ONLY__=true},panel('React Developer','Two Co',2));
    await pg.evaluate(src);
    await pg.evaluate(()=>{document.body.innerHTML='<div>Junior Developer</div><div>Kochi • via Shine</div>';window.__AUTOFILL_SAVE_ONLY__=true});
    const none=await pg.evaluate(src);
    const toast=await pg.evaluate(()=>document.body.lastElementChild.textContent);
    const a=await pg.evaluate(()=>window.__AUTOFILL_TEST__.applications);
    console.log('   google jobs      ',JSON.stringify(a.map(x=>[x.role,x.company,x.key,x.notes])),'|',toast);
    if(a.length!==2||a[0].key===a[1].key||a[1].role!=='React Developer'||none.saved||!/Open a job/.test(toast)) throw new Error('google jobs save wrong');
    await pg.close();
  }
  // Google Jobs, save all: opens each card, skips one that never opens, follows newly loaded cards, and Undo removes them.
  {
    const body=`<title>jobs - Google Search</title><div id=list></div><div id=panel></div><script>
      const jobs=[['Web Developer','One Co',1],['React Developer','Two Co',2],['Stuck Job','Three Co',0],['Web Developer','Four Co',4],['Late Job','Five Co',5]];
      function card(j){const d=document.createElement('div');d.innerHTML='<div>'+j[0]+'</div><div>'+j[1]+'</div><div>Kochi • via Shine</div>';
        d.onclick=()=>{if(!j[2])return;if(j[2]===4&&!jobs.added){jobs.added=1;list.append(card(jobs[4]))}
          setTimeout(()=>{panel.innerHTML='<h1>'+j[0]+'</h1><div>'+j[1]+' · Kochi · via Shine</div><a href="https://jobs.example.com/view/'+j[2]+'">Apply on Shine</a>'},60)};return d}
      jobs.slice(0,4).forEach(j=>list.append(card(j)));
    </script>`;
    const pg=await browser.newPage();
    await pg.route('https://www.google.com/search*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body}));
    await pg.goto('https://www.google.com/search?q=jobs&udm=8');
    await pg.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p,applications:[{id:'old',key:'jobs.example.com/view/2',status:'Applied'}]};window.__AUTOFILL_SAVE_ALL__=true},profile);
    const res=await pg.evaluate(src);
    const a=await pg.evaluate(()=>window.__AUTOFILL_TEST__.applications);
    const toast=await pg.evaluate(()=>document.body.lastElementChild.textContent);
    console.log('   google save all  ',JSON.stringify(res),JSON.stringify(a.map(x=>[x.role,x.company,x.status])),'|',toast);
    if(res.savedAll!==3||res.already!==1||res.failed!==1||a.length!==4||a[0].status!=='Applied'||!a.some(x=>x.role==='Late Job')) throw new Error('google save all wrong');
    await pg.evaluate(()=>document.body.lastElementChild.querySelector('button').click());
    await pg.waitForTimeout(50);
    const left=await pg.evaluate(()=>window.__AUTOFILL_TEST__.applications);
    if(left.length!==1||left[0].id!=='old') throw new Error('google save all undo wrong');
    await pg.close();
  }
  for (const [url,title,body] of [
    ['https://intel.wd1.myworkdayjobs.com/en-US/External/job/India%2C-Bangalore/AI-System-Performance-Engineer_JR0288211/apply/applyManually','Careers','<h2 data-automation-id="jobPostingHeader">AI System Performance Engineer</h2>'],
    ['https://infilect.keka.com/careers/applyjob/142740?source=linkedin','Full Stack Development Intern | Infilect','']]) {
    const pg=await browser.newPage();
    await pg.route(url.split('?')[0]+'*',r=>r.fulfill({contentType:'text/html',body:`<title>${title}</title>${body}<label for=fn>First name</label><input id=fn>`}));
    await pg.goto(url);await pg.evaluate(p=>{window.__AUTOFILL_TEST__={profile:p}},profile);
    const t=(await pg.evaluate(src)).tracked;const k=await pg.evaluate(()=>window.__AUTOFILL_TEST__.applications[0].key);
    console.log('   guessed           ',t.company,'|',t.role,'|',k);await pg.close();
  }
}
await browser.close();})();
