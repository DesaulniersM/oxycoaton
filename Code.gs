/**
 * Google Apps Script for iOS Medication Tracker PWA
 * 
 * Instructions:
 * 1. Open your Google Sheet in Google Drive.
 * 2. Click 'Extensions' > 'Apps Script'.
 * 3. Replace all existing text in Code.gs with this code.
 * 4. Click 'Deploy' > 'New deployment'.
 * 5. Select type 'Web app'.
 * 6. Set Description: "Meds Tracker API"
 * 7. Set 'Execute as': "Me"
 * 8. Set 'Who has access': "Anyone" (CRITICAL: must be Anyone so your friend's phone can write to the sheet).
 * 9. Click 'Deploy' and authorize access.
 * 10. Copy the Web App URL (ends with /exec) and paste it into the Settings in your PWA.
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "Medication Tracker API is running successfully!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 10 seconds for concurrent writes
  lock.tryLock(10000);

  try {
    var sheet = getOrCreateLogSheet();
    var contents = e.postData ? e.postData.contents : "";
    var data = {};
    
    if (contents) {
      try {
        data = JSON.parse(contents);
      } catch (parseErr) {
        data = { raw: contents };
      }
    }

    var now = new Date();
    var timestampStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

    // Handle connection test ping
    if (data.action === "ping") {
      sheet.appendRow([
        timestampStr,
        "CONNECTION TEST",
        "Connection verified successfully",
        "",
        data.timestamp || "",
        "iOS PWA"
      ]);
      return createJsonResponse({ status: "success", action: "ping" });
    }

    // Handle batch sync of queued doses
    if (data.action === "log_batch" && Array.isArray(data.items)) {
      data.items.forEach(function(item) {
        var itemDate = item.timestamp ? new Date(item.timestamp) : now;
        var deviceTimeStr = Utilities.formatDate(itemDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        
        sheet.appendRow([
          timestampStr,
          item.medName || "Unknown",
          item.dose || "",
          item.intervalHours || "",
          deviceTimeStr,
          "iOS PWA"
        ]);
      });
      return createJsonResponse({ status: "success", count: data.items.length });
    }

    // Handle single dose entry
    if (data.medName) {
      var itemDate = data.timestamp ? new Date(data.timestamp) : now;
      var deviceTimeStr = Utilities.formatDate(itemDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

      sheet.appendRow([
        timestampStr,
        data.medName,
        data.dose || "",
        data.intervalHours || "",
        deviceTimeStr,
        "iOS PWA"
      ]);
      return createJsonResponse({ status: "success", action: "log_dose" });
    }

    return createJsonResponse({ status: "ignored", reason: "no recognized action" });

  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Medication Logs");
  
  if (!sheet) {
    // If not found, use first sheet or create new
    sheet = ss.getActiveSheet();
    sheet.setName("Medication Logs");
  }

  // Ensure header row exists
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Sync Timestamp",
      "Medication Name",
      "Dose / Instructions",
      "Interval (Hours)",
      "Device Timestamp",
      "Source"
    ]);

    // Format header
    var headerRange = sheet.getRange(1, 1, 1, 6);
    headerRange.setBackground("#1e293b");
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
    
    // Auto-adjust column widths
    for (var col = 1; col <= 6; col++) {
      sheet.autoResizeColumn(col);
    }
  }

  return sheet;
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
