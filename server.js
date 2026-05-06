const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Researcher: create a new scheduling session ──────────────────────────────

app.post('/api/sessions', (req, res) => {
  const { title, description, templates, scheduledSlots } = req.body;

  if (!title || !title.trim())
    return res.status(400).json({ error: 'Title is required.' });
  if (!Array.isArray(templates) || templates.length === 0)
    return res.status(400).json({ error: 'At least one time slot template is required.' });
  if (!Array.isArray(scheduledSlots) || scheduledSlots.length === 0)
    return res.status(400).json({ error: 'At least one scheduled slot is required.' });

  for (const t of templates) {
    if (!t.startTime || !t.endTime || t.startTime >= t.endTime)
      return res.status(400).json({ error: 'Each template needs a valid start and end time.' });
    if (!Number.isInteger(t.capacity) || t.capacity < 1)
      return res.status(400).json({ error: 'Capacity must be a positive integer.' });
  }

  for (const s of scheduledSlots) {
    if (!s.date || !s.startTime || !s.endTime || s.startTime >= s.endTime)
      return res.status(400).json({ error: 'Each scheduled slot needs a valid date, start and end time.' });
    if (!Number.isInteger(s.capacity) || s.capacity < 1)
      return res.status(400).json({ error: 'Capacity must be a positive integer.' });
  }

  const adminToken = uuidv4();
  const participantToken = uuidv4();

  const session = db.createSession({
    adminToken, participantToken,
    title: title.trim(),
    description: (description || '').trim()
  });

  templates.forEach((t, i) => {
    db.createTemplate({ sessionId: session.id, startTime: t.startTime, endTime: t.endTime, capacity: t.capacity, sortOrder: i });
  });

  scheduledSlots.forEach(s => {
    db.createScheduledSlot({ sessionId: session.id, slotDate: s.date, startTime: s.startTime, endTime: s.endTime, capacity: s.capacity });
  });

  res.json({ adminToken, participantToken, sessionId: session.id });
});

// ── Researcher: get full session data including bookings ─────────────────────

app.get('/api/admin/:adminToken', (req, res) => {
  const session = db.getSessionByAdmin(req.params.adminToken);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  res.json({
    title: session.title,
    description: session.description,
    participantToken: session.participantToken,
    createdAt: session.createdAt,
    slots: db.getSlotsForSession(session.id),
    bookings: db.getBookingsForSession(session.id)
  });
});

// ── Researcher: update a single scheduled slot ───────────────────────────────

app.patch('/api/admin/:adminToken/slots/:slotId', (req, res) => {
  const session = db.getSessionByAdmin(req.params.adminToken);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const slotId = parseInt(req.params.slotId, 10);
  const slot = db.getSlotById(slotId);
  if (!slot || slot.sessionId !== session.id)
    return res.status(404).json({ error: 'Slot not found.' });

  const { capacity } = req.body;
  if (capacity !== undefined) {
    if (!Number.isInteger(capacity) || capacity < 1)
      return res.status(400).json({ error: 'Capacity must be a positive integer.' });
    db.updateSlotCapacity(slotId, capacity);
  }

  res.json({ ok: true });
});

// ── Researcher: delete a scheduled slot ─────────────────────────────────────

app.delete('/api/admin/:adminToken/slots/:slotId', (req, res) => {
  const session = db.getSessionByAdmin(req.params.adminToken);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const slotId = parseInt(req.params.slotId, 10);
  const slot = db.getSlotById(slotId);
  if (!slot || slot.sessionId !== session.id)
    return res.status(404).json({ error: 'Slot not found.' });

  db.deleteSlot(slotId);
  res.json({ ok: true });
});

// ── Researcher: delete a booking ─────────────────────────────────────────────

app.delete('/api/admin/:adminToken/bookings/:bookingId', (req, res) => {
  const session = db.getSessionByAdmin(req.params.adminToken);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const bookingId = parseInt(req.params.bookingId, 10);
  const deleted = db.deleteBooking(bookingId, session.id);
  if (!deleted) return res.status(404).json({ error: 'Booking not found.' });

  res.json({ ok: true });
});

// ── Participant: get available slots ─────────────────────────────────────────

app.get('/api/book/:participantToken', (req, res) => {
  const session = db.getSessionByParticipant(req.params.participantToken);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const allSlots = db.getSlotsForSession(session.id);
  const available = allSlots.filter(s => s.bookingCount < s.capacity);

  res.json({
    title: session.title,
    description: session.description,
    slots: available
  });
});

// ── Participant: book a slot ──────────────────────────────────────────────────

app.post('/api/book/:participantToken', (req, res) => {
  const session = db.getSessionByParticipant(req.params.participantToken);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const { slotId, name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!slotId) return res.status(400).json({ error: 'Slot selection is required.' });

  const slot = db.getSlotById(parseInt(slotId, 10));
  if (!slot || slot.sessionId !== session.id)
    return res.status(404).json({ error: 'Slot not found.' });

  const booked = db.getBookingCountForSlot(slot.id);
  if (booked >= slot.capacity)
    return res.status(409).json({ error: 'This slot is now full. Please choose another.' });

  db.createBooking({ scheduledSlotId: slot.id, participantName: name.trim() });
  res.json({ ok: true });
});

// ── SPA fallback routes ───────────────────────────────────────────────────────

app.get('/admin/:adminToken', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/book/:participantToken', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'book.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scheduler running on http://localhost:${PORT}`));
