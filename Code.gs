/**
 * ===== POS Giọng Nói — Backend API (Google Apps Script) =====
 * Frontend (HTML/CSS/JS) đã chuyển sang Cloudflare Pages.
 * File này CHỈ còn vai trò JSON API: đọc/ghi Google Sheet.
 *
 * Deploy: Triển khai > Triển khai mới > Loại: Web App
 *   - Execute as: Me
 *   - Who has access: Anyone (bắt buộc, để Cloudflare gọi được từ domain khác)
 * Lấy URL .../exec dán vào API_URL trong app.js (frontend).
 */

function doGet(e) {
  var action = e.parameter.action;
  try {
    var data;
    if (action === 'getProducts') {
      data = getProducts();
    } else {
      return jsonOut({ ok: false, error: 'Unknown action: ' + action });
    }
    return jsonOut({ ok: true, data: data });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var data;
    if (action === 'saveInvoice') {
      data = saveInvoice(body.items);
    } else if (action === 'clearInvoice') {
      data = clearInvoice();
    } else {
      return jsonOut({ ok: false, error: 'Unknown action: ' + action });
    }
    return jsonOut({ ok: true, data: data });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===== Menu trong Google Sheet: mở app POS đang host trên Cloudflare ===== */
var POS_APP_URL = 'https://pos-voice-vosk.pages.dev'; // sửa lại domain Cloudflare của bạn

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎤 POS Giọng Nói')
    .addItem('Mở màn hình bán hàng', 'showPosDialog')
    .addToUi();
}

function showPosDialog() {
  var html = HtmlService.createHtmlOutput(
    '<a href="' + POS_APP_URL + '" target="_blank" ' +
    'style="display:inline-block;margin:24px;padding:12px 20px;background:#0A84FF;' +
    'color:#fff;border-radius:8px;font-family:sans-serif;text-decoration:none;">' +
    'Mở POS Giọng Nói ↗</a>'
  ).setWidth(320).setHeight(120);
  SpreadsheetApp.getUi().showModalDialog(html, 'POS Giọng Nói');
}



/* ===== Google Sheet I/O (giữ nguyên không đổi) ===== */

var SHEET_PRODUCTS = 'DANH_MUC_HANG';
var SHEET_INVOICE = 'HOA_DON_HIEN_TAI';
var PRODUCT_DATA_START_ROW = 4;
var INVOICE_DATA_START_ROW = 4;

function getProducts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sh) throw new Error('Không tìm thấy sheet ' + SHEET_PRODUCTS);

  var lastRow = sh.getLastRow();
  if (lastRow < PRODUCT_DATA_START_ROW) return [];

  var numRows = lastRow - PRODUCT_DATA_START_ROW + 1;
  var data = sh.getRange(PRODUCT_DATA_START_ROW, 1, numRows, 4).getValues();

  var products = [];
  for (var i = 0; i < data.length; i++) {
    var code = data[i][0];
    var name = data[i][1];
    var price = data[i][2];
    var unit = data[i][3];
    if (!name) continue;

    products.push({
      code: String(code || ''),
      name: String(name),
      price: Number(price) || 0,
      unit: String(unit || '').trim()
    });
  }
  return products;
}

function saveInvoice(items) {
  if (!items || !items.length) throw new Error('Hóa đơn trống.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_INVOICE);
  if (!sh) throw new Error('Không tìm thấy sheet ' + SHEET_INVOICE);

  var lastRow = sh.getLastRow();
  if (lastRow >= INVOICE_DATA_START_ROW) {
    var lastColA = sh.getRange(lastRow, 1).getValue();
    if (String(lastColA || '').toUpperCase().indexOf('TỔNG TIỀN') !== -1 ||
        String(lastColA || '').toUpperCase().indexOf('TONG TIEN') !== -1) {
      lastRow--;
    }
  }

  var startRow = Math.max(lastRow + 1, INVOICE_DATA_START_ROW);

  var now = new Date();
  var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

  var rows = items.map(function(it) {
    return [it.spokenText || it.name, it.qty, it.name, it.price, it.total, timestamp];
  });

  var range = sh.getRange(startRow, 1, rows.length, 6);
  range.setValues(rows);

  var fmtRange = sh.getRange(startRow, 4, rows.length, 2);
  fmtRange.setNumberFormat('#,##0');

  var total = items.reduce(function(s, it) { return s + (Number(it.total) || 0); }, 0);

  var props = PropertiesService.getScriptProperties();
  var colorIdx = props.getProperty('invoiceColor') || '0';
  var bgColor = colorIdx === '0' ? '#ffffff' : '#f2f2f2';
  range.setBackground(bgColor);
  props.setProperty('invoiceColor', colorIdx === '0' ? '1' : '0');

  return { total: total, itemCount: items.length };
}

function clearInvoice() {
  return true;
}
