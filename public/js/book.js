const participantToken = location.pathname.split('/').pop();
let selectedSlotId = null;
let slots = [];

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function load() {
  try {
    const res = await fetch(`/api/book/${participantToken}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Session not found.');
    const data = await res.json();

    document.title = data.title;
    document.getElementById('book-title').textContent = data.title;
    const desc = document.getElementById('book-desc');
    if (data.description) {
      desc.textContent = data.description;
    } else {
      desc.style.display = 'none';
    }

    slots = data.slots;
    renderSlots(slots);

    document.getElementById('loading').style.display = 'none';
    document.getElementById('main').style.display = 'block';
  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error-msg').textContent = err.message;
    document.getElementById('error-screen').style.display = 'block';
  }
}

function renderSlots(slots) {
  const container = document.getElementById('slots-list');
  const noSlots = document.getElementById('no-slots');

  if (!slots.length) {
    container.style.display = 'none';
    noSlots.style.display = 'block';
    document.getElementById('submit-btn').disabled = true;
    return;
  }

  // Group by date
  const byDate = {};
  for (const s of slots) {
    if (!byDate[s.slotDate]) byDate[s.slotDate] = [];
    byDate[s.slotDate].push(s);
  }

  container.innerHTML = Object.keys(byDate).sort().map(date => {
    const daySlots = byDate[date].map(s => {
      const spotsLeft = s.capacity - s.bookingCount;
      const spotsLabel = s.capacity === 1
        ? ''
        : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`;

      return `
        <div class="slot-option" id="slot-opt-${s.id}" onclick="selectSlot(${s.id})">
          <input type="radio" name="slot" value="${s.id}" id="slot-${s.id}">
          <label for="slot-${s.id}" class="slot-time" style="cursor:pointer">
            ${esc(s.startTime)} – ${esc(s.endTime)}
          </label>
          ${spotsLabel ? `<span class="slot-spots">${esc(spotsLabel)}</span>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="slot-group">
        <div class="slot-group-date">${fmtDate(date)}</div>
        ${daySlots}
      </div>
    `;
  }).join('');
}

function selectSlot(id) {
  selectedSlotId = id;
  document.querySelectorAll('.slot-option').forEach(el => el.classList.remove('selected'));
  const opt = document.getElementById(`slot-opt-${id}`);
  if (opt) {
    opt.classList.add('selected');
    opt.querySelector('input[type="radio"]').checked = true;
  }
  showError('');
}

async function submitBooking() {
  showError('');
  const name = document.getElementById('participant-name').value.trim();

  if (!name) { showError('Please enter your name.'); return; }
  if (!selectedSlotId) { showError('Please select a time slot.'); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Confirming…';

  try {
    const res = await fetch(`/api/book/${participantToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: selectedSlotId, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    const slot = slots.find(s => s.id === selectedSlotId);
    const detail = slot
      ? `${fmtDate(slot.slotDate)}, ${slot.startTime} – ${slot.endTime}`
      : '';
    document.getElementById('success-detail').textContent =
      `Slot confirmed: ${detail}. The researcher will be in touch.`;

    document.getElementById('main').style.display = 'none';
    document.getElementById('success').style.display = 'block';
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = 'Confirm booking';
  }
}

load();
