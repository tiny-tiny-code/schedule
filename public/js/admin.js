const adminToken = location.pathname.split('/').pop();
let sessionData = null;

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

function fmtDateTime(iso) {
  return new Date(iso + 'Z').toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

async function load() {
  try {
    const res = await fetch(`/api/admin/${adminToken}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Not found');
    sessionData = await res.json();
    render();
    document.getElementById('loading').style.display = 'none';
    document.getElementById('main').style.display = 'block';
  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error-msg').textContent = err.message;
    document.getElementById('error-screen').style.display = 'block';
  }
}

function render() {
  document.title = `Admin — ${sessionData.title}`;
  document.getElementById('admin-title').textContent = sessionData.title;
  document.getElementById('admin-desc').textContent = sessionData.description || '';

  const base = window.location.origin;
  document.getElementById('participant-link').value = `${base}/book/${sessionData.participantToken}`;

  renderSlots();
  renderBookings();
}

function renderSlots() {
  const wrap = document.getElementById('slots-table-wrap');
  if (!sessionData.slots.length) {
    wrap.innerHTML = '<p class="empty-state">No slots.</p>';
    return;
  }

  const rows = sessionData.slots.map(s => {
    const booked = s.bookingCount;
    const full = booked >= s.capacity;
    return `
      <tr id="slot-row-${s.id}">
        <td>${fmtDate(s.slotDate)}</td>
        <td>${esc(s.startTime)} – ${esc(s.endTime)}</td>
        <td>
          <span class="badge ${full ? 'badge-red' : 'badge-green'}">${booked}/${s.capacity}</span>
        </td>
        <td>
          <input type="number" min="1" max="999" value="${s.capacity}" id="cap-${s.id}"
                 style="width:65px;padding:.3rem .5rem;font-size:.85rem;border:1px solid var(--border);border-radius:6px">
          <button class="btn btn-ghost btn-sm" onclick="updateCapacity(${s.id})">Save</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSlot(${s.id})" style="margin-left:.25rem">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Time</th><th>Bookings</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderBookings() {
  const wrap = document.getElementById('bookings-table-wrap');
  if (!sessionData.bookings.length) {
    wrap.innerHTML = '<p class="empty-state">No bookings yet.</p>';
    return;
  }

  const rows = sessionData.bookings.map(b => `
    <tr id="booking-row-${b.id}">
      <td>${esc(b.participantName)}</td>
      <td>${fmtDate(b.slotDate)}</td>
      <td>${esc(b.startTime)} – ${esc(b.endTime)}</td>
      <td style="color:var(--text-muted);font-size:.8rem">${fmtDateTime(b.createdAt)}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteBooking(${b.id})">Remove</button>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Participant</th><th>Date</th><th>Time</th><th>Booked at</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function updateCapacity(slotId) {
  const input = document.getElementById(`cap-${slotId}`);
  const capacity = parseInt(input.value, 10);
  if (!capacity || capacity < 1) { alert('Capacity must be at least 1.'); return; }

  const res = await fetch(`/api/admin/${adminToken}/slots/${slotId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capacity })
  });

  if (res.ok) {
    const slot = sessionData.slots.find(s => s.id === slotId);
    if (slot) slot.capacity = capacity;
    renderSlots();
  } else {
    alert((await res.json()).error || 'Error updating capacity.');
  }
}

async function deleteSlot(slotId) {
  if (!confirm('Delete this slot? Any existing bookings for it will also be removed.')) return;

  const res = await fetch(`/api/admin/${adminToken}/slots/${slotId}`, { method: 'DELETE' });
  if (res.ok) {
    sessionData.slots = sessionData.slots.filter(s => s.id !== slotId);
    sessionData.bookings = sessionData.bookings.filter(b => {
      const slot = sessionData.slots.find(s => s.id === b.scheduledSlotId);
      return !!slot;
    });
    await load(); // reload for accurate booking counts
  } else {
    alert((await res.json()).error || 'Error deleting slot.');
  }
}

async function deleteBooking(bookingId) {
  if (!confirm('Remove this booking? The participant will not be notified.')) return;

  const res = await fetch(`/api/admin/${adminToken}/bookings/${bookingId}`, { method: 'DELETE' });
  if (res.ok) {
    await load();
  } else {
    alert((await res.json()).error || 'Error removing booking.');
  }
}

function copyLink(inputId, btn) {
  const input = document.getElementById(inputId);
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1800);
  });
}

load();
