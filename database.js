/**
 * Simple JSON file-based database.
 * All data lives in scheduler.json; writes are synchronous and atomic
 * (write to tmp file, then rename) to avoid corruption on crash.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'scheduler.json');
const TMP_PATH = DB_PATH + '.tmp';

const EMPTY = {
  sessions: [],       // { id, adminToken, participantToken, title, description, createdAt }
  slotTemplates: [],  // { id, sessionId, startTime, endTime, capacity, sortOrder }
  scheduledSlots: [], // { id, sessionId, slotDate, startTime, endTime, capacity }
  bookings: []        // { id, scheduledSlotId, participantName, createdAt }
};

let _seq = 0;
let _data;

function load() {
  if (_data) return _data;
  try {
    _data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    // compute next sequence from existing ids
    const allIds = [
      ..._data.sessions.map(r => r.id),
      ..._data.slotTemplates.map(r => r.id),
      ..._data.scheduledSlots.map(r => r.id),
      ..._data.bookings.map(r => r.id)
    ];
    _seq = allIds.length ? Math.max(...allIds) : 0;
  } catch {
    _data = JSON.parse(JSON.stringify(EMPTY));
  }
  return _data;
}

function save() {
  fs.writeFileSync(TMP_PATH, JSON.stringify(_data, null, 2));
  fs.renameSync(TMP_PATH, DB_PATH);
}

function nextId() { return ++_seq; }
function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

load();

/* ── Public API ─────────────────────────────────────────────────────────────── */

const db = {
  // Sessions
  createSession({ adminToken, participantToken, title, description }) {
    const rec = { id: nextId(), adminToken, participantToken, title, description, createdAt: now() };
    _data.sessions.push(rec);
    save();
    return rec;
  },
  getSessionByAdmin(adminToken) {
    return _data.sessions.find(s => s.adminToken === adminToken) || null;
  },
  getSessionByParticipant(participantToken) {
    return _data.sessions.find(s => s.participantToken === participantToken) || null;
  },

  // Slot templates
  createTemplate({ sessionId, startTime, endTime, capacity, sortOrder }) {
    const rec = { id: nextId(), sessionId, startTime, endTime, capacity, sortOrder };
    _data.slotTemplates.push(rec);
    save();
    return rec;
  },

  // Scheduled slots
  createScheduledSlot({ sessionId, slotDate, startTime, endTime, capacity }) {
    const rec = { id: nextId(), sessionId, slotDate, startTime, endTime, capacity };
    _data.scheduledSlots.push(rec);
    save();
    return rec;
  },
  getSlotsForSession(sessionId) {
    return _data.scheduledSlots
      .filter(s => s.sessionId === sessionId)
      .map(s => ({ ...s, bookingCount: _data.bookings.filter(b => b.scheduledSlotId === s.id).length }))
      .sort((a, b) => a.slotDate.localeCompare(b.slotDate) || a.startTime.localeCompare(b.startTime));
  },
  getSlotById(id) {
    return _data.scheduledSlots.find(s => s.id === id) || null;
  },
  updateSlotCapacity(id, capacity) {
    const slot = _data.scheduledSlots.find(s => s.id === id);
    if (!slot) return false;
    slot.capacity = capacity;
    save();
    return true;
  },
  deleteSlot(id) {
    const before = _data.scheduledSlots.length;
    _data.scheduledSlots = _data.scheduledSlots.filter(s => s.id !== id);
    _data.bookings = _data.bookings.filter(b => b.scheduledSlotId !== id);
    if (_data.scheduledSlots.length < before) { save(); return true; }
    return false;
  },

  // Bookings
  createBooking({ scheduledSlotId, participantName }) {
    const rec = { id: nextId(), scheduledSlotId, participantName, createdAt: now() };
    _data.bookings.push(rec);
    save();
    return rec;
  },
  getBookingsForSession(sessionId) {
    const slotIds = new Set(_data.scheduledSlots.filter(s => s.sessionId === sessionId).map(s => s.id));
    return _data.bookings
      .filter(b => slotIds.has(b.scheduledSlotId))
      .map(b => {
        const slot = _data.scheduledSlots.find(s => s.id === b.scheduledSlotId);
        return { ...b, slotDate: slot?.slotDate, startTime: slot?.startTime, endTime: slot?.endTime };
      })
      .sort((a, b) => (a.slotDate + a.startTime).localeCompare(b.slotDate + b.startTime) || a.createdAt.localeCompare(b.createdAt));
  },
  getBookingCountForSlot(slotId) {
    return _data.bookings.filter(b => b.scheduledSlotId === slotId).length;
  },
  deleteBooking(id, sessionId) {
    const slotIds = new Set(_data.scheduledSlots.filter(s => s.sessionId === sessionId).map(s => s.id));
    const booking = _data.bookings.find(b => b.id === id && slotIds.has(b.scheduledSlotId));
    if (!booking) return false;
    _data.bookings = _data.bookings.filter(b => b.id !== id);
    save();
    return true;
  }
};

module.exports = db;
