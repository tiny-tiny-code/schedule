/* ── State ─────────────────────────────────────────────────────────────────── */
let currentStep = 1;

const templates = [];            // [{ id, startTime, endTime, capacity }]
const selectedDates = new Set(); // 'YYYY-MM-DD'
const dateOverrides = {};        // 'YYYY-MM-DD' → [{ templateId, active, capacity }]

let calYear, calMonth;

/* ── Utilities ─────────────────────────────────────────────────────────────── */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

/* ── Step navigation ───────────────────────────────────────────────────────── */
function goTo(n) {
  showError('');

  if (n > currentStep) {
    if (!validateStep(currentStep)) return;
  }

  [1, 2, 3, 4, 5].forEach(i => {
    const el = document.getElementById(`step-${i}`);
    if (el) el.style.display = i === n ? 'block' : 'none';
    const ind = document.getElementById(`step-ind-${i}`);
    if (ind) {
      ind.className = 'step' + (i === n ? ' active' : i < n ? ' done' : '');
    }
  });

  currentStep = n;

  if (n === 2 && templates.length === 0) addTemplate();
  if (n === 3) renderCalendar();
  if (n === 4) renderReview();
}

/* ── Validation ────────────────────────────────────────────────────────────── */
function validateStep(n) {
  if (n === 1) {
    if (!document.getElementById('title').value.trim()) {
      showError('Please enter a study title.');
      return false;
    }
  }

  if (n === 2) {
    if (templates.length === 0) { showError('Add at least one time slot.'); return false; }
    for (const t of templates) {
      if (!t.startTime || !t.endTime) { showError('All slots need a start and end time.'); return false; }
      if (t.startTime >= t.endTime) { showError('End time must be after start time.'); return false; }
      if (t.capacity < 1) { showError('Capacity must be at least 1.'); return false; }
    }
  }

  if (n === 3) {
    const active = getActiveScheduledSlots();
    if (active.length === 0) {
      showError('Select at least one date and activate at least one slot.');
      return false;
    }
  }

  return true;
}

/* ── Template management ───────────────────────────────────────────────────── */
let templateIdSeq = 0;

function addTemplate() {
  const id = ++templateIdSeq;
  templates.push({ id, startTime: '', endTime: '', capacity: 1 });
  renderTemplates();
}

function removeTemplate(id) {
  const idx = templates.findIndex(t => t.id === id);
  if (idx !== -1) templates.splice(idx, 1);
  // remove from all date overrides
  for (const date of Object.keys(dateOverrides)) {
    dateOverrides[date] = dateOverrides[date].filter(o => o.templateId !== id);
  }
  renderTemplates();
  // re-render date slots if on step 3
  if (currentStep === 3) renderDateSlots();
}

function renderTemplates() {
  const list = document.getElementById('template-list');
  if (templates.length === 0) {
    list.innerHTML = '<p style="font-size:.875rem;color:var(--text-muted)">No slots added yet.</p>';
    return;
  }
  list.innerHTML = templates.map(t => `
    <div class="template-row" id="trow-${t.id}">
      <div class="time-inputs">
        <input type="time" value="${esc(t.startTime)}"
               onchange="updateTemplate(${t.id}, 'startTime', this.value)"
               aria-label="Start time">
        <span>to</span>
        <input type="time" value="${esc(t.endTime)}"
               onchange="updateTemplate(${t.id}, 'endTime', this.value)"
               aria-label="End time">
      </div>
      <span class="cap-label">Capacity:</span>
      <input type="number" min="1" max="999" value="${t.capacity}"
             onchange="updateTemplate(${t.id}, 'capacity', +this.value)"
             aria-label="Capacity"
             style="width:65px">
      <button class="btn btn-danger btn-sm" onclick="removeTemplate(${t.id})" aria-label="Remove slot">✕</button>
    </div>
  `).join('');
}

function updateTemplate(id, field, value) {
  const t = templates.find(t => t.id === id);
  if (!t) return;
  t[field] = field === 'capacity' ? Math.max(1, value || 1) : value;
  // sync capacity into any date overrides that haven't been manually changed
  if (field === 'capacity') {
    for (const overrides of Object.values(dateOverrides)) {
      const o = overrides.find(o => o.templateId === id && !o.manualCapacity);
      if (o) o.capacity = t.capacity;
    }
  }
}

/* ── Calendar ──────────────────────────────────────────────────────────────── */
function renderCalendar() {
  const today = new Date();
  if (calYear === undefined) { calYear = today.getFullYear(); calMonth = today.getMonth(); }

  const label = new Date(calYear, calMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = label;

  const grid = document.getElementById('cal-grid');
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let html = dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('');

  const firstDay = new Date(calYear, calMonth, 1);
  // Monday-first: 0=Mon … 6=Sun
  let startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) html += '<div class="cal-day cal-empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(calYear, calMonth, day);
    const iso = toISO(calYear, calMonth + 1, day);
    const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = iso === toISO(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const isSelected = selectedDates.has(iso);

    let cls = 'cal-day';
    if (isPast) cls += ' cal-past';
    if (isToday) cls += ' cal-today';
    if (isSelected) cls += ' cal-selected';

    const onclick = isPast ? '' : `onclick="toggleDate('${iso}')"`;
    html += `<div class="${cls}" ${onclick}>${day}</div>`;
  }

  grid.innerHTML = html;
  renderDateSlots();
}

function toISO(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function prevMonth() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function nextMonth() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

function toggleDate(iso) {
  if (selectedDates.has(iso)) {
    selectedDates.delete(iso);
    delete dateOverrides[iso];
  } else {
    selectedDates.add(iso);
    // default: all templates active with their default capacity
    dateOverrides[iso] = templates.map(t => ({
      templateId: t.id,
      active: true,
      capacity: t.capacity,
      manualCapacity: false
    }));
  }
  renderCalendar();
}

/* ── Per-day slot customisation ────────────────────────────────────────────── */
function renderDateSlots() {
  const container = document.getElementById('date-slots-list');
  const sorted = [...selectedDates].sort();

  if (sorted.length === 0) {
    container.innerHTML = '<p style="font-size:.875rem;color:var(--text-muted);margin-top:.75rem">No dates selected yet.</p>';
    return;
  }

  container.innerHTML = sorted.map(date => {
    const overrides = dateOverrides[date] || [];
    const rows = templates.map(t => {
      const ov = overrides.find(o => o.templateId === t.id) || { active: true, capacity: t.capacity };
      return `
        <div class="day-slot-row">
          <label>
            <input type="checkbox" ${ov.active ? 'checked' : ''}
                   onchange="setSlotActive('${date}', ${t.id}, this.checked)">
            ${esc(t.startTime || '??:??')} – ${esc(t.endTime || '??:??')}
          </label>
          <input type="number" min="1" max="999" value="${ov.capacity}"
                 onchange="setSlotCapacity('${date}', ${t.id}, +this.value)"
                 title="Capacity for this slot"
                 style="${ov.active ? '' : 'opacity:.4;pointer-events:none'}">
          <span style="font-size:.78rem;color:var(--text-muted)">spots</span>
        </div>
      `;
    }).join('');

    return `
      <div class="date-slots-item">
        <div class="date-slots-header">
          <span>${fmtDate(date)}</span>
          <button class="btn btn-danger btn-sm" onclick="toggleDate('${date}')">Remove</button>
        </div>
        <div class="date-slots-body">${rows}</div>
      </div>
    `;
  }).join('');
}

function setSlotActive(date, templateId, active) {
  const ov = dateOverrides[date]?.find(o => o.templateId === templateId);
  if (ov) ov.active = active;
  // update the capacity input opacity inline without full re-render
  renderDateSlots();
}

function setSlotCapacity(date, templateId, value) {
  const ov = dateOverrides[date]?.find(o => o.templateId === templateId);
  if (ov) { ov.capacity = Math.max(1, value || 1); ov.manualCapacity = true; }
}

/* ── Review ────────────────────────────────────────────────────────────────── */
function renderReview() {
  const title = document.getElementById('title').value.trim();
  const desc = document.getElementById('description').value.trim();
  const slots = getActiveScheduledSlots();

  const byDate = {};
  for (const s of slots) {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  }

  const dateRows = Object.keys(byDate).sort().map(date => `
    <tr>
      <td>${fmtDate(date)}</td>
      <td>${byDate[date].map(s =>
        `<span class="badge badge-green">${esc(s.startTime)}–${esc(s.endTime)} (${s.capacity})</span> `
      ).join('')}</td>
    </tr>
  `).join('');

  document.getElementById('review-content').innerHTML = `
    <div class="field">
      <label>Title</label>
      <p>${esc(title)}</p>
    </div>
    ${desc ? `<div class="field"><label>Description</label><p style="font-size:.875rem;color:var(--text-muted)">${esc(desc)}</p></div>` : ''}
    <div class="field" style="margin-top:.75rem">
      <label>${slots.length} active slot${slots.length !== 1 ? 's' : ''} across ${Object.keys(byDate).length} date${Object.keys(byDate).length !== 1 ? 's' : ''}</label>
      <table style="margin-top:.5rem">
        <thead><tr><th>Date</th><th>Slots (capacity)</th></tr></thead>
        <tbody>${dateRows}</tbody>
      </table>
    </div>
  `;
}

function getActiveScheduledSlots() {
  const slots = [];
  for (const date of [...selectedDates].sort()) {
    const overrides = dateOverrides[date] || [];
    for (const ov of overrides) {
      if (!ov.active) continue;
      const t = templates.find(t => t.id === ov.templateId);
      if (!t || !t.startTime || !t.endTime) continue;
      slots.push({ date, startTime: t.startTime, endTime: t.endTime, capacity: ov.capacity });
    }
  }
  return slots;
}

/* ── Publish ───────────────────────────────────────────────────────────────── */
async function publish() {
  showError('');
  if (!validateStep(3)) { goTo(3); return; }

  const btn = document.getElementById('publish-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Publishing…';

  const payload = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    templates: templates.map(t => ({ startTime: t.startTime, endTime: t.endTime, capacity: t.capacity })),
    scheduledSlots: getActiveScheduledSlots()
  };

  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');

    const base = window.location.origin;
    document.getElementById('participant-link').value = `${base}/book/${data.participantToken}`;
    document.getElementById('admin-link').value = `${base}/admin/${data.adminToken}`;

    goTo(5);
    document.getElementById('step-5').style.display = 'block';
    // hide the step indicators — we're done
    document.querySelectorAll('.step').forEach(el => el.closest('.steps')?.style && (el.closest('.steps').style.display = 'none'));
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = 'Publish & get link';
  }
}

/* ── Copy helper ───────────────────────────────────────────────────────────── */
function copyLink(inputId, btn) {
  const input = document.getElementById(inputId);
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1800);
  });
}

/* ── Init ──────────────────────────────────────────────────────────────────── */
goTo(1);
