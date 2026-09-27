const test = require('node:test');
const assert = require('node:assert/strict');
const MedsLogic = require('../logic.js');

test('Timer Calculation - Uninitialized / No Doses', () => {
  const med = { id: 'm1', name: 'Aspirin', intervalHours: 6, lastTaken: null };
  const res = MedsLogic.calculateTimer(med);
  
  assert.equal(res.badgeClass, 'ready');
  assert.equal(res.badgeText, 'Ready for 1st dose');
  assert.equal(res.lastTakenText, 'No doses logged yet');
  assert.equal(res.isOverdue, false);
});

test('Timer Calculation - Invalid Date', () => {
  const med = { id: 'm1', name: 'Aspirin', intervalHours: 6, lastTaken: 'not-a-date' };
  const res = MedsLogic.calculateTimer(med);
  
  assert.equal(res.badgeClass, 'ready');
  assert.equal(res.lastTakenText, 'Invalid date');
});

test('Timer Calculation - Dose taken 10 seconds ago (Taken just now)', () => {
  const baseTime = 1700000000000;
  const med = {
    id: 'm1',
    name: 'Aspirin',
    intervalHours: 4,
    lastTaken: new Date(baseTime - 10 * 1000).toISOString()
  };
  const res = MedsLogic.calculateTimer(med, baseTime);

  assert.equal(res.badgeClass, 'ready');
  assert.equal(res.lastTakenText, 'Taken just now');
  assert.equal(res.badgeText, 'Next in 3h 59m');
  assert.equal(res.isOverdue, false);
});

test('Timer Calculation - Normal countdown (> 30 mins left)', () => {
  const baseTime = 1700000000000;
  // Taken 1 hour ago with 4-hour interval -> 3 hours remaining
  const med = {
    id: 'm1',
    name: 'Amoxicillin',
    intervalHours: 4,
    lastTaken: new Date(baseTime - 3600000).toISOString()
  };
  const res = MedsLogic.calculateTimer(med, baseTime);

  assert.equal(res.badgeClass, 'ready');
  assert.equal(res.lastTakenText, 'Taken 1h ago');
  assert.equal(res.badgeText, 'Next in 3h');
  assert.equal(res.isOverdue, false);
});

test('Timer Calculation - Due Soon (<= 30 mins left)', () => {
  const baseTime = 1700000000000;
  // Taken 3 hours and 45 minutes ago with 4-hour interval -> 15 mins remaining
  const med = {
    id: 'm1',
    name: 'Ibuprofen',
    intervalHours: 4,
    lastTaken: new Date(baseTime - (3 * 3600000 + 45 * 60000)).toISOString()
  };
  const res = MedsLogic.calculateTimer(med, baseTime);

  assert.equal(res.badgeClass, 'soon');
  assert.equal(res.badgeText, 'Next in 15m');
  assert.equal(res.lastTakenText, 'Taken 3h 45m ago');
  assert.equal(res.isOverdue, false);
});

test('Timer Calculation - Exactly Due Now', () => {
  const baseTime = 1700000000000;
  // Taken exactly 4 hours ago
  const med = {
    id: 'm1',
    name: 'Ibuprofen',
    intervalHours: 4,
    lastTaken: new Date(baseTime - 4 * 3600000).toISOString()
  };
  const res = MedsLogic.calculateTimer(med, baseTime);

  assert.equal(res.badgeClass, 'due');
  assert.equal(res.badgeText, '● Due now');
  assert.equal(res.isOverdue, true);
});

test('Timer Calculation - Overdue (45 minutes overdue)', () => {
  const baseTime = 1700000000000;
  // Taken 4 hours and 45 minutes ago with 4h interval
  const med = {
    id: 'm1',
    name: 'Ibuprofen',
    intervalHours: 4,
    lastTaken: new Date(baseTime - (4 * 3600000 + 45 * 60000)).toISOString()
  };
  const res = MedsLogic.calculateTimer(med, baseTime);

  assert.equal(res.badgeClass, 'due');
  assert.equal(res.badgeText, '● 45m overdue');
  assert.equal(res.isOverdue, true);
});

test('Timer Calculation - Overdue (2 hours overdue)', () => {
  const baseTime = 1700000000000;
  // Taken 6 hours ago with 4h interval
  const med = {
    id: 'm1',
    name: 'Ibuprofen',
    intervalHours: 4,
    lastTaken: new Date(baseTime - 6 * 3600000).toISOString()
  };
  const res = MedsLogic.calculateTimer(med, baseTime);

  assert.equal(res.badgeClass, 'due');
  assert.equal(res.badgeText, '● 2h overdue');
  assert.equal(res.isOverdue, true);
});

test('Dose Record Creation', () => {
  const med = { id: 'med-xyz', name: 'Penicillin', dose: '250mg', intervalHours: 8 };
  const record = MedsLogic.createDoseRecord(med, new Date(1700000000000));

  assert.ok(record.id.startsWith('log-'));
  assert.equal(record.medId, 'med-xyz');
  assert.equal(record.medName, 'Penicillin');
  assert.equal(record.dose, '250mg');
  assert.equal(record.intervalHours, 8);
  assert.equal(record.timestamp, new Date(1700000000000).toISOString());
});

test('State Management - Commit Dose Updates History and Sync Queue', () => {
  const initialState = {
    meds: [{ id: 'm1', name: 'Tylenol', intervalHours: 6, lastTaken: null }],
    history: [],
    syncQueue: [],
    undoCandidate: null
  };

  const dose = MedsLogic.createDoseRecord(initialState.meds[0], new Date(1700000000000));
  const nextState = MedsLogic.commitDoseToState(initialState, dose, 100);

  assert.equal(nextState.history.length, 1);
  assert.equal(nextState.history[0].id, dose.id);
  assert.equal(nextState.meds[0].lastTaken, dose.timestamp);
  assert.equal(nextState.syncQueue.length, 1);
  assert.equal(nextState.syncQueue[0].id, dose.id);
});

test('State Management - History Capping at Max Limit', () => {
  const existingHistory = Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}` }));
  const initialState = {
    meds: [{ id: 'm1', name: 'Tylenol', intervalHours: 6, lastTaken: null }],
    history: existingHistory,
    syncQueue: [],
    undoCandidate: null
  };

  const dose = { id: 'new-dose', medId: 'm1', timestamp: '2026-09-27T00:00:00Z' };
  // Cap at 3 items
  const nextState = MedsLogic.commitDoseToState(initialState, dose, 3);

  assert.equal(nextState.history.length, 3);
  assert.equal(nextState.history[0].id, 'new-dose');
  assert.equal(nextState.history[1].id, 'old-0');
  assert.equal(nextState.history[2].id, 'old-1');
});

test('Undo Rollback Restores Previous Timestamp', () => {
  const originalLastTaken = '2026-09-26T12:00:00.000Z';
  const state = {
    meds: [{ id: 'm1', name: 'Tylenol', intervalHours: 6, lastTaken: '2026-09-27T08:00:00.000Z' }],
    undoCandidate: {
      medId: 'm1',
      prevLastTaken: originalLastTaken
    }
  };

  const rolledBack = MedsLogic.rollbackUndoCandidate(state);
  assert.equal(rolledBack.meds[0].lastTaken, originalLastTaken);
  assert.equal(rolledBack.undoCandidate, null);
});

test('Sync Queue Reconciliation Only Removes Synced Items', () => {
  const queue = [
    { id: 'item-1', name: 'A' },
    { id: 'item-2', name: 'B' },
    { id: 'item-3', name: 'C' }
  ];

  // Only item-1 and item-2 were successfully synced
  const synced = [{ id: 'item-1' }, { id: 'item-2' }];
  const remaining = MedsLogic.reconcileSyncQueue(queue, synced);

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'item-3');
});

test('Build Sync Payload Matches Expected Format', () => {
  const items = [
    { id: '1', medName: 'Aspirin', dose: '100mg', intervalHours: 24, timestamp: '2026-09-27T08:00:00Z' }
  ];
  const payloadStr = MedsLogic.buildSyncPayload(items);
  const parsed = JSON.parse(payloadStr);

  assert.equal(parsed.action, 'log_batch');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].medName, 'Aspirin');
  assert.equal(parsed.items[0].dose, '100mg');
});

test('Backup Data Validation - Valid Data', () => {
  const validJson = JSON.stringify({
    meds: [{ id: '1', name: 'Advil', intervalHours: 6 }],
    history: [{ id: 'h1', medName: 'Advil' }]
  });
  const res = MedsLogic.validateBackupData(validJson);
  assert.equal(res.valid, true);
  assert.equal(res.data.meds.length, 1);
});

test('Backup Data Validation - Malformed or Missing Fields', () => {
  assert.equal(MedsLogic.validateBackupData('not-json').valid, false);
  assert.equal(MedsLogic.validateBackupData('{}').valid, false);
  assert.equal(MedsLogic.validateBackupData(JSON.stringify({ meds: 'not-array', history: [] })).valid, false);
  assert.equal(MedsLogic.validateBackupData(JSON.stringify({ meds: [{ noName: 123 }], history: [] })).valid, false);
});

test('HTML Escaping for Sanitization', () => {
  const dangerous = '<script>alert("xss & fun")</script>\'test\'';
  const clean = MedsLogic.escapeHtml(dangerous);
  assert.equal(clean.includes('<script>'), false);
  assert.equal(clean, '&lt;script&gt;alert(&quot;xss &amp; fun&quot;)&lt;/script&gt;&#039;test&#039;');
  assert.equal(MedsLogic.escapeHtml(null), '');
  assert.equal(MedsLogic.escapeHtml(undefined), '');
});
