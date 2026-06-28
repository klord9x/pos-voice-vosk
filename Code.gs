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
var POS_APP_URL = 'https://PASTE-YOUR-CLOUDFLARE-PAGES-DOMAIN.pages.dev'; // sửa lại domain Cloudflare của bạn

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

/* ===== Vietnamese phonetic / keyword matching (giữ nguyên không đổi) ===== */

var INITIAL_CONSONANT_MAP = {
  'tr': 'CH', 'ch': 'CH',
  's': 'X', 'x': 'X',
  'gi': 'Z', 'd': 'Z', 'r': 'Z', 'z': 'Z',
  'đ': 'D',
  'v': 'V', 'b': 'V',
  'l': 'L', 'n': 'N',
  'ph': 'F', 'f': 'F',
  'kh': 'K', 'k': 'K',
  'th': 'T', 't': 'T',
  'gh': 'G', 'g': 'G',
  'ngh': 'NG', 'ng': 'NG',
  'nh': 'NH', 'n': 'N',
  'ng': 'NG'
};

var RHYME_MAP = {
  'ă': 'A', 'â': 'A', 'a': 'A',
  'ê': 'E', 'e': 'E',
  'ô': 'O', 'o': 'O', 'ơ': 'O',
  'ư': 'U', 'u': 'U',
  'i': 'I', 'y': 'I',
  'ăn': 'AN', 'ân': 'AN', 'an': 'AN',
  'ên': 'EN', 'en': 'EN',
  'ôn': 'ON', 'ơn': 'ON', 'on': 'ON',
  'ưn': 'UN', 'un': 'UN',
  'in': 'IN', 'yn': 'IN',
  'ăt': 'AT', 'ât': 'AT', 'at': 'AT',
  'êt': 'ET', 'et': 'ET',
  'ôt': 'OT', 'ơt': 'OT', 'ot': 'OT',
  'ưt': 'UT', 'ut': 'UT',
  'it': 'IT', 'yt': 'IT',
  'ăng': 'ANG', 'âng': 'ANG', 'ang': 'ANG',
  'êng': 'ENG', 'eng': 'ENG',
  'ông': 'ONG', 'ơng': 'ONG', 'ong': 'ONG',
  'ưng': 'UNG', 'ung': 'UNG',
  'ing': 'ING', 'yng': 'ING',
  'nh': 'NH', 'n': 'N',
  'ch': 'CH', 'c': 'C', 't': 'T',
  'p': 'P', 't': 'T', 'c': 'C',
  'ng': 'NG', 'n': 'N'
};

function toPhoneticKey(text) {
  if (!text) return '';
  var s = String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  var words = s.split(' ');
  var result = [];

  for (var i = 0; i < words.length; i++) {
    var word = words[i];
    if (!word) continue;

    var initial = '';
    var rhyme = word;

    var twoChar = word.substring(0, 2);
    var threeChar = word.substring(0, 3);

    if (INITIAL_CONSONANT_MAP[threeChar]) {
      initial = INITIAL_CONSONANT_MAP[threeChar];
      rhyme = word.substring(3);
    } else if (INITIAL_CONSONANT_MAP[twoChar]) {
      initial = INITIAL_CONSONANT_MAP[twoChar];
      rhyme = word.substring(2);
    } else if (INITIAL_CONSONANT_MAP[word[0]]) {
      initial = INITIAL_CONSONANT_MAP[word[0]];
      rhyme = word.substring(1);
    } else {
      initial = word[0].toUpperCase();
      rhyme = word.substring(1);
    }

    var phoneticRhyme = rhyme;
    for (var len = Math.min(rhyme.length, 4); len >= 1; len--) {
      var sub = rhyme.substring(0, len);
      if (RHYME_MAP[sub]) {
        phoneticRhyme = RHYME_MAP[sub] + rhyme.substring(len);
        break;
      }
    }

    result.push(initial + phoneticRhyme.toUpperCase());
  }

  return result.join(' ');
}

function generatePronunciationVariants(text) {
  var variants = [text];
  var s = String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

  var rules = [
    [/tr/g, 'ch'], [/ch/g, 'tr'],
    [/s/g, 'x'], [/x/g, 's'],
    [/gi/g, 'd'], [/d(?=\s|$|[^i])/g, 'gi'], [/r/g, 'd'], [/z/g, 'd'],
    [/v/g, 'b'], [/b/g, 'v'],
    [/l/g, 'n'], [/n/g, 'l'],
    [/nh/g, 'n'], [/n(?=\s|$)/g, 'nh'],
    [/ng(?=\s|$)/g, 'n'], [/n(?=\s|$)/g, 'ng'],
    [/ch(?=\s|$)/g, 'c'], [/c(?=\s|$)/g, 'ch'],
    [/t(?=\s|$)/g, 'c'], [/c(?=\s|$)/g, 't'],
    [/ph/g, 'f'], [/f/g, 'ph'],
    [/kh/g, 'k'], [/k(?=[aeiouy])/g, 'kh'],
    [/th/g, 't'], [/t(?=[aeiouy])/g, 'th'],
    [/gh/g, 'g'], [/g(?=[ie])/g, 'gh'],
    [/ngh/g, 'ng'], [/ng(?=[ie])/g, 'ngh'],
    [/qu/g, 'q'], [/q/g, 'qu'],
    [/uy/g, 'i'], [/i(?=[^aeiouy]|$)/g, 'uy'],
  ];

  for (var i = 0; i < rules.length; i += 2) {
    var rule = rules[i];
    var variant = s.replace(rule[0], rule[1]);
    if (variant !== s && variants.indexOf(variant) === -1) {
      variants.push(variant);
    }
  }

  var combo = s
    .replace(/tr/g, 'ch').replace(/ch/g, 'tr')
    .replace(/s/g, 'x').replace(/x/g, 's')
    .replace(/gi/g, 'd').replace(/d(?=\s|$|[^i])/g, 'gi');
  if (combo !== s && variants.indexOf(combo) === -1) {
    variants.push(combo);
  }

  return variants;
}

function autoGenerateKeywords(productName) {
  if (!productName) return [];

  var keywords = [];
  var normalized = String(productName).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

  keywords.push(productName);
  keywords.push(normalized);

  var words = normalized.split(/\s+/).filter(function(w) { return w.length > 1; });
  words.forEach(function(w) {
    if (keywords.indexOf(w) === -1) keywords.push(w);
  });

  for (var i = 0; i < words.length - 1; i++) {
    var bigram = words[i] + ' ' + words[i + 1];
    if (keywords.indexOf(bigram) === -1) keywords.push(bigram);
  }
  for (var i = 0; i < words.length - 2; i++) {
    var trigram = words[i] + ' ' + words[i + 1] + ' ' + words[i + 2];
    if (keywords.indexOf(trigram) === -1) keywords.push(trigram);
  }

  var variants = generatePronunciationVariants(productName);
  variants.forEach(function(v) {
    if (keywords.indexOf(v) === -1) keywords.push(v);
  });

  var phonetic = toPhoneticKey(productName);
  if (phonetic && keywords.indexOf(phonetic) === -1) {
    keywords.push(phonetic);
  }

  var abbreviations = generateAbbreviations(words);
  abbreviations.forEach(function(abbr) {
    if (keywords.indexOf(abbr) === -1) keywords.push(abbr);
  });

  return keywords;
}

function generateAbbreviations(words) {
  var abbrs = [];
  if (words.length < 2) return abbrs;

  var initials = words.map(function(w) { return w[0]; }).join('');
  abbrs.push(initials);

  if (words.length > 2) {
    abbrs.push(words[0] + ' ' + words[words.length - 1]);
  }

  var skipWords = ['nuoc', 'bot', 'banh', 'mi', 'com', 'cha', 'thit', 'ca', 'rau', 'qua'];
  if (skipWords.indexOf(words[0]) !== -1 && words.length > 1) {
    var withoutFirst = words.slice(1).join(' ');
    abbrs.push(withoutFirst);
  }

  return abbrs;
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
    var keywordsRaw = data[i][2];
    var price = data[i][3];
    if (!name) continue;

    var sheetKeywords = keywordsRaw
      ? String(keywordsRaw).split(',').map(function(s) { return s.trim(); }).filter(Boolean)
      : [];

    var autoKeywords = autoGenerateKeywords(name);

    var allKeywords = sheetKeywords.slice();
    autoKeywords.forEach(function(k) {
      if (allKeywords.indexOf(k) === -1) allKeywords.push(k);
    });

    products.push({
      code: String(code || ''),
      name: String(name),
      keywords: allKeywords,
      price: Number(price) || 0
    });
  }
  return products;
}

function saveInvoice(items) {
  if (!items || !items.length) throw new Error('Hóa đơn trống.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_INVOICE);
  if (!sh) throw new Error('Không tìm thấy sheet ' + SHEET_INVOICE);

  var totalRow = findTotalRow_(sh);
  var availableRows = totalRow - INVOICE_DATA_START_ROW;

  if (availableRows > 0) {
    sh.getRange(INVOICE_DATA_START_ROW, 1, availableRows, 5).clearContent();
  }

  if (items.length > availableRows) {
    var rowsToAdd = items.length - availableRows;
    sh.insertRowsBefore(totalRow, rowsToAdd);
    totalRow += rowsToAdd;
  }

  var total = 0;
  var rows = items.map(function(it) {
    total += Number(it.total) || 0;
    return [it.spokenText || it.name, it.qty, it.name, it.price, it.total];
  });

  sh.getRange(INVOICE_DATA_START_ROW, 1, rows.length, 5).setValues(rows);

  var totalCell = sh.getRange(totalRow, 5);
  totalCell.setValue(total);
  totalCell.setNumberFormat('#,##0" đ"');

  return { total: total, itemCount: items.length };
}

function clearInvoice() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_INVOICE);
  var totalRow = findTotalRow_(sh);
  var availableRows = totalRow - INVOICE_DATA_START_ROW;
  if (availableRows > 0) {
    sh.getRange(INVOICE_DATA_START_ROW, 1, availableRows, 5).clearContent();
  }
  sh.getRange(totalRow, 5).clearContent();
  return true;
}

function findTotalRow_(sh) {
  var lastRow = sh.getLastRow();
  var colA = sh.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    var v = String(colA[i][0] || '').toUpperCase();
    if (v.indexOf('TỔNG TIỀN') !== -1 || v.indexOf('TONG TIEN') !== -1) {
      return i + 1;
    }
  }
  return lastRow + 1;
}
