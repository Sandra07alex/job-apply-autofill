# Job Apply Autofill

A Chrome extension that fills job applications from one saved profile, so you stop retyping the same personal details, education and work experience on every site.

Works on **LinkedIn Easy Apply**, **Workday**, and most other application forms (Greenhouse, Lever, company career pages).

## Why

Applying to jobs means entering identical information dozens of times across different sites. Tedium leads to fewer applications. This extension fills what it can and highlights what it couldn't, and you stay in control: **it never submits anything for you.**

## Features

- **One profile:** personal details, job preferences, multiple education entries and multiple work experience / internship entries
- **Paste your resume** on the profile page to fill it in automatically (parsed locally, nothing uploaded)
- **Saved answers** for screening questions ("former employee of…" → No), reused on every site
- **Workday pickers:** opens "Select One" lists and picks from School / Skills search suggestions
- **One click or one shortcut** (`Alt+Shift+F`) to fill the current page
- **Repeated sections:** fills Experience 1, Experience 2, Education 1 and so on with the right entry
- **Works with React/Angular forms** (e.g. Workday) by firing the input events those frameworks listen for
- **Visual feedback:** green outline = filled, orange dashed = needs you
- **Safe by default:** doesn't overwrite fields that already have text, never ticks consent checkboxes, never touches passwords or file uploads
- **Private:** everything is stored locally in your browser (`chrome.storage.local`); nothing is sent anywhere
- **Backup:** export and import your profile as JSON

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension/` folder.
5. Click the extension icon, choose **Edit my profile**, fill it in, and click **Save profile**.

## Use

1. Open a job application page.
2. Click the extension icon, then **Fill this page** (or press `Alt+Shift+F`).
3. Fix anything outlined in orange, review everything, and submit yourself.

**Workday tip:** Workday only shows one experience/education block until you click **Add**. Click **Add** once per entry in your profile, then press Fill again; already-filled fields are left alone.

## Project structure

```
extension/
  manifest.json   Chrome extension config (Manifest V3)
  popup.html/js   The toolbar popup (Fill button, overwrite toggle)
  options.html/js The profile editor page
  resume.js       Turns pasted resume text into a profile
  fill.js         The core: reads each form field, decides what it's asking for, fills it
  background.js   Keyboard shortcut handler
tests/
  fill.test.js    Runs fill.js against mock LinkedIn, Workday and Keka forms in headless Chromium
  resume.test.js  Checks the resume parser on sample resumes
```

### How `fill.js` works

1. **Describe** each visible field by collecting its label, `aria-label`, placeholder, `name`, Workday `data-automation-id`, and surrounding group label (e.g. "From" around a Month/Year pair).
2. **Classify** that description with ordered regex rules into a profile key (`email`, `school`, `company`, `startYear`, …).
3. **Track sections** in page order: when a key like `company` appears again, that's the next experience entry. Dates attach to whichever section you're currently in.
4. **Fill** using the native value setter plus `input`/`change`/`blur` events so framework-driven forms register the value.

## Run the tests

```bash
npm install
npx playwright install chromium
npm test
```

## Known limitations

- **Resume parsing** is rule-based, so unusual layouts (tables, two columns) may come out partly wrong; always review before saving.
- **Open-ended questions** ("Why do you want to work here?") are left blank.
- **Skill-specific questions** ("Years of experience with Python?") are deliberately left blank rather than guessed.
- **Doesn't click "Add"** buttons for extra experience/education blocks.

## Roadmap

- [x] Handle Workday custom dropdowns (open the listbox, pick the matching option)
- [x] Fill the profile by pasting resume text
- [ ] Auto-click "Add" for each extra experience / education entry
- [x] Saved answers for common screening questions, reused across sites
- [ ] Optional AI drafts for open-ended questions using the job description, shown for review before inserting
- [ ] Resume upload helper
- [ ] Application tracker (company, role, date, link) logged on each fill
- [ ] Site-specific rules for Naukri, Instahyre, Greenhouse, Lever

## License

MIT
