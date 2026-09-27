/**
 * Core business and timing logic for Medication Tracker PWA
 * Usable both in browser and in Node.js unit tests
 */

const MedsLogic = {
  /**
   * Calculates the current timer status and friendly display strings for a medication.
   * @param {Object} med - { id, name, intervalHours, lastTaken }
   * @param {number} [currentTimeMs=Date.now()] - Timestamp to calculate relative to (for testing)
   */
  calculateTimer(med, currentTimeMs = Date.now()) {
    if (!med || !med.lastTaken) {
      return {
        badgeClass: 'ready',
        badgeText: 'Ready for 1st dose',
        lastTakenText: 'No doses logged yet',
        remainingMs: null,
        elapsedMs: null,
        isOverdue: false
      };
    }

    const lastTakenMs = new Date(med.lastTaken).getTime();
    if (isNaN(lastTakenMs)) {
      return {
        badgeClass: 'ready',
        badgeText: 'Ready for 1st dose',
        lastTakenText: 'Invalid date',
        remainingMs: null,
        elapsedMs: null,
        isOverdue: false
      };
    }

    const elapsedMs = Math.max(0, currentTimeMs - lastTakenMs);
    const intervalMs = Math.max(0, (med.intervalHours || 4) * 3600000);
    const remainingMs = intervalMs - elapsedMs;

    // Friendly elapsed time
    const elapsedMins = Math.floor(elapsedMs / 60000);
    let lastTakenText = '';
    if (elapsedMins < 1) {
      lastTakenText = 'Taken just now';
    } else if (elapsedMins < 60) {
      lastTakenText = `Taken ${elapsedMins}m ago`;
    } else {
      const h = Math.floor(elapsedMins / 60);
      const m = elapsedMins % 60;
      lastTakenText = m > 0 ? `Taken ${h}h ${m}m ago` : `Taken ${h}h ago`;
    }

    // Overdue or due now
    if (remainingMs <= 0) {
      const overdueMins = Math.floor(Math.abs(remainingMs) / 60000);
      let overdueText = 'Due now';
      if (overdueMins >= 60) {
        const h = Math.floor(overdueMins / 60);
        const m = overdueMins % 60;
        overdueText = m > 0 ? `${h}h ${m}m overdue` : `${h}h overdue`;
      } else if (overdueMins > 0) {
        overdueText = `${overdueMins}m overdue`;
      }

      return {
        badgeClass: 'due',
        badgeText: `● ${overdueText}`,
        lastTakenText,
        remainingMs,
        elapsedMs,
        isOverdue: true
      };
    }

    // Due soon (within 30 minutes)
    if (remainingMs <= 30 * 60000) {
      const minsLeft = Math.ceil(remainingMs / 60000);
      return {
        badgeClass: 'soon',
        badgeText: `Next in ${minsLeft}m`,
        lastTakenText,
        remainingMs,
        elapsedMs,
        isOverdue: false
      };
    }

    // Normal countdown (> 30 minutes)
    const hoursLeft = Math.floor(remainingMs / 3600000);
    const minsLeft = Math.floor((remainingMs % 3600000) / 60000);
    const timeText = hoursLeft > 0 
      ? (minsLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${hoursLeft}h`)
      : `${minsLeft}m`;

    return {
      badgeClass: 'ready',
      badgeText: `Next in ${timeText}`,
      lastTakenText,
      remainingMs,
      elapsedMs,
      isOverdue: false
    };
  },

  /**
   * Creates a structured dose record
   */
  createDoseRecord(med, timestamp = new Date()) {
    const d = new Date(timestamp);
    return {
      id: 'log-' + d.getTime() + '-' + Math.random().toString(36).substring(2, 7),
      medId: med.id,
      medName: med.name,
      dose: med.dose || '',
      intervalHours: med.intervalHours,
      timestamp: d.toISOString(),
      localTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  },

  /**
   * Commits a dose into state, updating history and the sync queue.
   */
  commitDoseToState(state, doseRecord, maxHistory = 100) {
    // 1. Update history
    const newHistory = [doseRecord, ...state.history];
    if (newHistory.length > maxHistory) {
      newHistory.length = maxHistory;
    }

    // 2. Update the corresponding medication's lastTaken
    const newMeds = state.meds.map(m => {
      if (m.id === doseRecord.medId) {
        return { ...m, lastTaken: doseRecord.timestamp };
      }
      return m;
    });

    // 3. Add to sync queue
    const newSyncQueue = [...state.syncQueue, doseRecord];

    return {
      ...state,
      meds: newMeds,
      history: newHistory,
      syncQueue: newSyncQueue,
      undoCandidate: null
    };
  },

  /**
   * Rolls back an uncommitted dose candidate (Undo action)
   */
  rollbackUndoCandidate(state) {
    if (!state.undoCandidate) return state;

    const candidate = state.undoCandidate;
    const newMeds = state.meds.map(m => {
      if (m.id === candidate.medId) {
        return {
          ...m,
          lastTaken: candidate.prevLastTaken || null
        };
      }
      return m;
    });

    return {
      ...state,
      meds: newMeds,
      undoCandidate: null
    };
  },

  /**
   * Reconciles the sync queue after a successful batch dispatch.
   * Only removes the items that were successfully synced.
   */
  reconcileSyncQueue(currentQueue, syncedItems) {
    const syncedIds = new Set(syncedItems.map(item => item.id));
    return currentQueue.filter(item => !syncedIds.has(item.id));
  },

  /**
   * Prepares the payload to send to Google Apps Script
   */
  buildSyncPayload(items) {
    return JSON.stringify({
      action: 'log_batch',
      items: items.map(item => ({
        id: item.id,
        medName: item.medName,
        dose: item.dose || '',
        intervalHours: item.intervalHours,
        timestamp: item.timestamp
      }))
    });
  },

  /**
   * Validates and parses backup JSON data for import
   */
  validateBackupData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') return { valid: false, error: 'Not an object' };
      if (!Array.isArray(data.meds)) return { valid: false, error: 'Missing meds array' };
      if (!Array.isArray(data.history)) return { valid: false, error: 'Missing history array' };

      // Validate med structure
      const validMeds = data.meds.every(m => m && typeof m.name === 'string');
      if (!validMeds) return { valid: false, error: 'Invalid medication item format' };

      return { valid: true, data };
    } catch (e) {
      return { valid: false, error: 'Invalid JSON syntax' };
    }
  },

  /**
   * Escapes HTML to prevent XSS
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MedsLogic;
}
