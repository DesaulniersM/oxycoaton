const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createGasEnvironment() {
  const appendedRows = [];
  let headerFormatted = false;

  const mockSheet = {
    _rows: appendedRows,
    _name: 'Medication Logs',
    getLastRow() {
      return appendedRows.length;
    },
    appendRow(row) {
      appendedRows.push(row);
    },
    setName(name) {
      this._name = name;
    },
    getRange(r, c, numR, numC) {
      return {
        setBackground(bg) { headerFormatted = true; },
        setFontColor(color) {},
        setFontWeight(weight) {}
      };
    },
    setFrozenRows(n) {},
    autoResizeColumn(c) {}
  };

  const mockSpreadsheet = {
    getSheetByName(name) {
      return mockSheet;
    },
    getActiveSheet() {
      return mockSheet;
    }
  };

  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => mockSpreadsheet
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: (ms) => true,
        releaseLock: () => {}
      })
    },
    Utilities: {
      formatDate: (date, tz, fmt) => {
        return date.toISOString().replace('T', ' ').substring(0, 19);
      }
    },
    Session: {
      getScriptTimeZone: () => 'UTC'
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({
        _content: text,
        setMimeType: function(type) {
          this._mimeType = type;
          return this;
        },
        getContent: function() { return this._content; }
      })
    },
    console: console
  };

  vm.createContext(context);
  const code = fs.readFileSync(path.join(__dirname, '../Code.gs'), 'utf8');
  vm.runInContext(code, context);

  return { context, mockSheet, appendedRows };
}

test('Google Apps Script - doGet returns healthy status', () => {
  const { context } = createGasEnvironment();
  const output = context.doGet();
  const parsed = JSON.parse(output.getContent());

  assert.equal(parsed.status, 'ok');
  assert.ok(parsed.message.includes('Medication Tracker API'));
});

test('Google Apps Script - Sheet Header Initialization', () => {
  const { context, appendedRows } = createGasEnvironment();
  // Sheet is initially empty (getLastRow() === 0)
  const e = { postData: { contents: JSON.stringify({ action: 'ping' }) } };
  context.doPost(e);

  // First row must be headers
  assert.ok(appendedRows.length >= 2);
  const headers = appendedRows[0];
  assert.equal(headers[0], 'Sync Timestamp');
  assert.equal(headers[1], 'Medication Name');
  assert.equal(headers[2], 'Dose / Instructions');
  assert.equal(headers[3], 'Interval (Hours)');
  assert.equal(headers[4], 'Device Timestamp');
  assert.equal(headers[5], 'Source');
});

test('Google Apps Script - doPost ping action records test row', () => {
  const { context, appendedRows } = createGasEnvironment();
  const e = {
    postData: {
      contents: JSON.stringify({ action: 'ping', timestamp: '2026-09-27T08:00:00Z' })
    }
  };

  const output = context.doPost(e);
  const parsed = JSON.parse(output.getContent());

  assert.equal(parsed.status, 'success');
  assert.equal(parsed.action, 'ping');

  // Row 0 is header, Row 1 is the ping
  const pingRow = appendedRows[1];
  assert.equal(pingRow[1], 'CONNECTION TEST');
  assert.equal(pingRow[2], 'Connection verified successfully');
  assert.equal(pingRow[5], 'iOS PWA');
});

test('Google Apps Script - doPost log_batch records multiple doses', () => {
  const { context, appendedRows } = createGasEnvironment();
  const e = {
    postData: {
      contents: JSON.stringify({
        action: 'log_batch',
        items: [
          { medName: 'Amoxicillin', dose: '500mg', intervalHours: 8, timestamp: '2026-09-27T08:00:00Z' },
          { medName: 'Ibuprofen', dose: '400mg', intervalHours: 6, timestamp: '2026-09-27T08:15:00Z' }
        ]
      })
    }
  };

  const output = context.doPost(e);
  const parsed = JSON.parse(output.getContent());

  assert.equal(parsed.status, 'success');
  assert.equal(parsed.count, 2);

  // Headers: row 0, Item 1: row 1, Item 2: row 2
  assert.equal(appendedRows.length, 3);
  assert.equal(appendedRows[1][1], 'Amoxicillin');
  assert.equal(appendedRows[1][2], '500mg');
  assert.equal(appendedRows[1][3], 8);
  assert.equal(appendedRows[2][1], 'Ibuprofen');
  assert.equal(appendedRows[2][2], '400mg');
  assert.equal(appendedRows[2][3], 6);
});

test('Google Apps Script - doPost single dose fallback', () => {
  const { context, appendedRows } = createGasEnvironment();
  const e = {
    postData: {
      contents: JSON.stringify({
        medName: 'Vitamin D',
        dose: '2000 IU',
        intervalHours: 24,
        timestamp: '2026-09-27T09:00:00Z'
      })
    }
  };

  const output = context.doPost(e);
  const parsed = JSON.parse(output.getContent());

  assert.equal(parsed.status, 'success');
  assert.equal(parsed.action, 'log_dose');
  assert.equal(appendedRows[1][1], 'Vitamin D');
  assert.equal(appendedRows[1][2], '2000 IU');
});

test('Google Apps Script - doPost malformed JSON does not crash', () => {
  const { context } = createGasEnvironment();
  const e = {
    postData: {
      contents: 'invalid-non-json'
    }
  };

  const output = context.doPost(e);
  const parsed = JSON.parse(output.getContent());
  // Should handle gracefully without unhandled exception
  assert.ok(parsed.status === 'ignored' || parsed.status === 'error');
});
