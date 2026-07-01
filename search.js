/* ===== Search Engine — normalize, match, score, rank ===== */
/* Globals: PRODUCTS, MATCH_OK, MATCH_LOW, SUGGEST_MAX, SEARCH_INPUT_MODE */

var PHONETIC_INITIAL = {
  'tr':'CH','ch':'CH','s':'X','x':'X','gi':'Z','d':'Z','r':'Z','z':'Z',
  'đ':'D','v':'V','b':'V','l':'L','n':'N','ph':'F','f':'F','kh':'K','k':'K',
  'th':'T','t':'T','gh':'G','g':'G','ngh':'NG','ng':'NG','nh':'NH','qu':'Q',
  'c':'K'
};
var PHONETIC_RHYME = {
  'ă':'A','â':'A','a':'A','ê':'E','e':'E','ô':'O','o':'O','ơ':'O',
  'ư':'U','u':'U','i':'I','y':'I','ăn':'AN','ân':'AN','an':'AN',
  'ên':'EN','en':'EN','ôn':'ON','ơn':'ON','on':'ON','ưn':'UN','un':'UN',
  'in':'IN','yn':'IN','ăt':'AT','ât':'AT','at':'AT','êt':'ET','et':'ET',
  'ôt':'OT','ơt':'OT','ot':'OT','ưt':'UT','ut':'UT','it':'IT','yt':'IT',
  'ăng':'ANG','âng':'ANG','ang':'ANG','êng':'ENG','eng':'ENG',
  'ông':'ONG','ơng':'ONG','ong':'ONG','ưng':'UNG','ung':'UNG',
  'ing':'ING','yng':'ING','nh':'NH','n':'N','ch':'CH','c':'C','t':'T',
  'p':'P','ng':'NG',
  'ăc':'AT','âc':'AT','ac':'AT','êc':'ET','ec':'ET',
  'ôc':'OT','ơc':'OT','oc':'OT','ưc':'UT','uc':'UT','ic':'IT','yc':'IT'
};

var BRAND_ALIAS = {};
var _brandAliasBuilt = false;

function _ensureBrandAlias() {
  if (_brandAliasBuilt) return;
  _brandAliasBuilt = true;
  if (!KNOWLEDGE || !KNOWLEDGE.knowledge) return;
  var speech = KNOWLEDGE.knowledge.speech;
  if (speech) {
    Object.keys(speech).forEach(function(canonical) {
      var canonNorm = norm(canonical);
      var entry = speech[canonical];
      (entry.aliases || []).forEach(function(alias) {
        var aliasNorm = norm(alias);
        if (aliasNorm && aliasNorm !== canonNorm) {
          BRAND_ALIAS[aliasNorm] = canonNorm;
        }
      });
    });
  }
  var brand  = KNOWLEDGE.knowledge.brand;
  if (brand) {
    Object.keys(brand).forEach(function(key) {
      var canonNorm = norm(brand[key].canonical || key);
      var keyNorm = norm(key);
      if (keyNorm !== canonNorm && !BRAND_ALIAS[keyNorm]) {
        BRAND_ALIAS[keyNorm] = canonNorm;
      }
    });
  }
}

var SEARCH_FILLERS = [
  'cho em','cho anh','cho chi','cho toi','giup toi',
  'tinh tong tien','tinh tien','tong hoa don','tinh hoa don',
  'lap hoa don','tao hoa don','lam hoa don','thanh toan giup','thanh toan',
  'lay gium','lay','gium','oi','nha','cho','ban','mua','giup','di nao','di','nao'
];

var WORD_TO_NUM = {
  'mot ngan':1000,'hai tram':200,'mot tram':100,
  'hai muoi':20,'ba muoi':30,'bon muoi':40,'nam muoi':50,
  'muoi':10,'chin':9,'tam':8,'bay':7,'sau':6,
  'nam':5,'bon':4,'ba':3,'hai':2,'mot':1,
  'mười':10,'chín':9,'tám':8,'bảy':7,'sáu':6,
  'năm':5,'bốn':4,'một':1
};

var SEARCH_CACHE = {};
var PREFIX_SCORE = 0.85;
var SCORE_CACHE = {};

function resetScoreCache() {
  SCORE_CACHE = {};
}

function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/[-_.]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}

function toPhoneticKey(text) {
  var words = norm(text).split(' ').filter(Boolean);
  return words.map(function(word) {
    var initial='', rest=word;
    var three=word.substring(0,3), two=word.substring(0,2), one=word.substring(0,1);
    if (PHONETIC_INITIAL[three]) { initial=PHONETIC_INITIAL[three]; rest=word.substring(3); }
    else if (PHONETIC_INITIAL[two]) { initial=PHONETIC_INITIAL[two]; rest=word.substring(2); }
    else if (PHONETIC_INITIAL[one]) { initial=PHONETIC_INITIAL[one]; rest=word.substring(1); }
    else { initial=one ? one.toUpperCase() : ''; rest=word.substring(1); }
    var pr = '';
    for (var len = Math.min(rest.length, 4); len >= 1; len--) {
      var sub = rest.substring(0, len);
      if (PHONETIC_RHYME[sub]) { pr = PHONETIC_RHYME[sub] + rest.substring(len); break; }
    }
    if (!pr) pr = rest;
    return (initial + pr).toUpperCase();
  }).join(' ');
}

function normalizeVN(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}

function levenshtein(a, b) {
  var m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  var dp = [];
  for (var i = 0; i <= m; i++) { dp.push([i]); }
  for (var j = 0; j <= n; j++) { dp[0][j] = j; }
  for (i = 1; i <= m; i++) {
    for (j = 1; j <= n; j++) {
      if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1];
      else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function levRatio(a, b) {
  var maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

function initialClass(word) {
  if (!word) return '';
  var two = word.substring(0,2), three = word.substring(0,3);
  if (PHONETIC_INITIAL[three]) return PHONETIC_INITIAL[three];
  if (PHONETIC_INITIAL[two]) return PHONETIC_INITIAL[two];
  if (PHONETIC_INITIAL[word[0]]) return PHONETIC_INITIAL[word[0]];
  return word[0] ? word[0].toUpperCase() : '';
}

function firstCharRatio(a, b) {
  var wa = a.split(' ').filter(Boolean), wb = b.split(' ').filter(Boolean);
  var n = Math.min(wa.length, wb.length);
  if (n === 0) return 0;
  var match = 0;
  for (var i = 0; i < n; i++) {
    if (initialClass(wa[i]) === initialClass(wb[i])) match++;
    else if (wa[i][0] === wb[i][0]) match += 1;
  }
  return match / Math.max(wa.length, wb.length, 1);
}

function relaxFinal(key) {
  return key.replace(/(NG|NH)(?=\s|$)/g,'N');
}

function phoneticScore(a, b, pa, pb) {
  if (!pa) pa = toPhoneticKey(a);
  if (!pb) pb = toPhoneticKey(b);
  if (pa === pb) return 1.0;
  var strict = 1 - levenshtein(pa, pb) / Math.max(pa.length, pb.length, 1);
  var ra = relaxFinal(pa), rb = relaxFinal(pb);
  if (ra !== pa || rb !== pb) {
    var relaxed = 1 - levenshtein(ra, rb) / Math.max(ra.length, rb.length, 1);
    return Math.max(strict, relaxed * 0.92);
  }
  return strict;
}

function combinedScore(a, b, mode, pa, pb) {
  var lr = levRatio(a, b), fr = firstCharRatio(a, b), pr = phoneticScore(a, b, pa, pb);
  if (mode === 'voice') return 0.30 * lr + 0.20 * fr + 0.50 * pr;
  return 0.45 * lr + 0.35 * fr + 0.20 * pr;
}

function combinedScoreCached(a, b, mode, pa, pb) {
  var key = mode + '|' + a + '|' + b;
  if (SCORE_CACHE[key] !== undefined) return SCORE_CACHE[key];
  var s = combinedScore(a, b, mode, pa, pb);
  SCORE_CACHE[key] = s;
  return s;
}

function applyAlias(s) {
  _ensureBrandAlias();
  var t = s;
  Object.keys(BRAND_ALIAS).sort(function(a,b) { return b.length - a.length; }).forEach(function(k) {
    var re = new RegExp('(^|\\s)' + k.replace(/\s+/g,'\\s+') + '(\\s|$)', 'g');
    t = t.replace(re, function(m, p, su) { return p + BRAND_ALIAS[k] + su; });
  });
  return t.replace(/\s+/g,' ').trim();
}

function wordToNumber(s) {
  var t = s;
  Object.keys(WORD_TO_NUM).sort(function(a,b) { return b.length - a.length; }).forEach(function(k) {
    var re = new RegExp('(^|\\s)' + norm(k) + '(\\s|$)', 'g');
    t = t.replace(re, function(m, p, su) { return p + WORD_TO_NUM[k] + su; });
  });
  return t.replace(/\s+/g,' ').trim();
}

function stripFillers(s) {
  var t = s;
  SEARCH_FILLERS.slice().sort(function(a,b) { return b.length - a.length; }).forEach(function(f) {
    var fn = norm(f);
    var re = new RegExp('(^|\\s)' + fn.replace(/\s+/g,'\\s+') + '(\\s|$)', 'g');
    t = t.replace(re, ' ');
  });
  return t.replace(/\s+/g,' ').trim();
}

function dropLeadingConsonants(text) {
  var words = norm(text).split(' ').filter(Boolean);
  var changed = false;
  var out = words.map(function(w) {
    var m = w.match(/^[bcdghklmnpqrstvx]{1,2}(?=[aeiouy])/);
    if (m && w.length > m[0].length + 1) { changed = true; return w.slice(m[0].length); }
    return w;
  });
  return changed ? out.join(' ') : norm(text);
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
    if (variant !== s && variants.indexOf(variant) === -1) variants.push(variant);
  }
  var combo = s
    .replace(/tr/g, 'ch').replace(/ch/g, 'tr')
    .replace(/s/g, 'x').replace(/x/g, 's')
    .replace(/gi/g, 'd').replace(/d(?=\s|$|[^i])/g, 'gi');
  if (combo !== s && variants.indexOf(combo) === -1) variants.push(combo);
  return variants;
}

/* ── Parse helpers ────────────────────────── */
var UNIT_WORDS_NORM = ['kg','ki','ky','can','g','gam','gr','lon','chai','goi','hop',
  'tui','bich','ly','coc','o','mieng','cai','bao','cay','thung','lit','chiec',
  'con','cap','doi','chuc','ta','ro','bo','nam','mo','it','loc','vi','xap','tam',
  'cuon','qua','trai'];
var UNIT_WORDS = ['kg','kí','ký','ki','cân','can','g','gam','gr','lon','chai','gói','goi','hộp','hop','túi','tui',
  'quả','qua','trái','trai','ly','cốc','coc','ổ','o','miếng','mieng','cái','cai',
  'bao','cây','cay','thùng','thung','lít','lit','chiếc','chiec','con','bịch','bich',
  'cặp','cap','doi','đôi','chục','chuc','tá','ta','ro','rổ','bó','bo','nắm','nam',
  'mớ','mo','ít','it','lốc','loc'];
var DISCRETE_UNITS = ['lon','chai','goi','hop','tui','qua','trai','ly','coc','o',
  'mieng','cai','bao','cay','thung','chiec','con','bich','cap','doi','chuc','ta','ro','bo','nam','mo','loc'];

function isWeightItem(item) {
  var u = normalizeVN(item.unit || '');
  if (!u) return true;
  return DISCRETE_UNITS.indexOf(u) === -1;
}

function normalizeDecimalWords(text) {
  var t = text;
  t = t.replace(/(\d+)\s+phẩy\s+(\d)/gi, '$1.$2');
  t = t.replace(/(\d+)\s+chấm\s+(\d)/gi, '$1.$2');
  t = t.replace(/(\d+)\s+phay\s+(\d)/gi, '$1.$2');
  t = t.replace(/(\d+)\s+cham\s+(\d)/gi, '$1.$2');
  t = t.replace(/không\s+phẩy\s+(\d)/gi, '0.$1');
  t = t.replace(/khong\s+phay\s+(\d)/gi, '0.$1');
  return t;
}

function normalizeKgDecimal(text) {
  var t = text;
  var kgUnits = 'ký|ký|ki|kg|cân|can|kilo';
  t = t.replace(new RegExp('(\\d+)\\s*('+kgUnits+')\\s+(\\d)(?!\\d)','gi'),
    function(_,whole,_u,frac) { return whole+'.'+frac+' kg'; });
  t = t.replace(new RegExp('(\\d+)('+kgUnits+')(\\d)(?!\\d)','gi'),
    function(_,whole,_u,frac) { return whole+'.'+frac+' kg'; });
  return t;
}

function normalizeLang(text) {
  var t = text;
  t = t.replace(/(\d+)\s*lạng/gi, function(_,n) { return (parseInt(n)/10)+' kg'; });
  t = t.replace(/(\d+)\s*lang/gi, function(_,n) { return (parseInt(n)/10)+' kg'; });
  return t;
}

function normalizeGram(text) {
  var t = text;
  t = t.replace(/(\d+)\s*gram/gi, function(_,n) { return (parseInt(n)/1000)+' kg'; });
  t = t.replace(/(\d+)\s*gam/gi, function(_,n) { return (parseInt(n)/1000)+' kg'; });
  return t;
}

function trySpecialQtyPatterns(text) {
  var normalized = normalizeVN(text);
  for (var i = 0; i < QTY_CONFIG.length; i++) {
    var cfg = QTY_CONFIG[i];
    for (var j = 0; j < cfg.keywords.length; j++) {
      var kw = normalizeVN(cfg.keywords[j]);
      if (normalized.indexOf(kw) !== -1) {
        var remaining = normalized.replace(kw, '').trim();
        return { qty: cfg.value, remaining: remaining, matched: cfg.keywords[j] };
      }
    }
  }
  return null;
}

function extractNumberAndUnit(text) {
  var unitGroup = UNIT_WORDS.join('|');
  var reKgShortcut = new RegExp('^(\\d+(?:\\.\\d+)?)\\s*(can|cân|kg|ký|kí)\\s+(\\d)\\s+(.+)$','i');
  var mShortcut = text.match(reKgShortcut);
  if (mShortcut) { return { qty: parseFloat(mShortcut[1]+'.'+mShortcut[3]), unit: mShortcut[2]||'kg', phrase: mShortcut[4].trim() }; }
  var reLead = new RegExp('^(\\d+(?:\\.\\d+)?)\\s*('+unitGroup+')?\\s+(.+)$','i');
  var m = text.match(reLead);
  if (m) { return { qty: parseFloat(m[1]), unit: m[2]||'', phrase: m[3].trim() }; }
  var reTrail = new RegExp('^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*('+unitGroup+')?\\s*$','i');
  var m2 = text.match(reTrail);
  if (m2) { return { qty: parseFloat(m2[2]), unit: m2[3]||'', phrase: m2[1].trim() }; }
  var reNumOnly = new RegExp('^(\\d+(?:\\.\\d+)?)\\s+(.+)$','i');
  var m3 = text.match(reNumOnly);
  if (m3) { return { qty: parseFloat(m3[1]), unit: '', phrase: m3[2].trim() }; }
  var reNumEnd = new RegExp('^(.+?)\\s+(\\d+(?:\\.\\d+)?)$','i');
  var m4 = text.match(reNumEnd);
  if (m4) { return { qty: parseFloat(m4[2]), unit: '', phrase: m4[1].trim() }; }
  return null;
}

function parseSegment(segment) {
  var seg = segment.trim();
  if (!seg) return null;
  var raw = seg;
  seg = normalizeDecimalWords(seg);
  seg = normalizeKgDecimal(seg);
  seg = normalizeLang(seg);
  seg = normalizeGram(seg);
  var special = trySpecialQtyPatterns(seg);
  if (special) { return { qty: special.qty, phrase: special.remaining, raw: raw, unit: '', special: special.matched }; }
  var extracted = extractNumberAndUnit(seg);
  if (extracted) { return { qty: extracted.qty, phrase: extracted.phrase, raw: raw, unit: extracted.unit, special: null }; }
  return { qty: 1, phrase: seg, raw: raw, unit: '', special: null };
}

function stripPrefix(text) {
  var PREFIXES = ['tính tổng tiền','tính tiền','tổng hóa đơn','tính hóa đơn','lập hóa đơn',
    'tạo hóa đơn','làm hóa đơn','thanh toán giúp','thanh toán','cho tôi','giúp tôi'];
  var t = text.trim();
  var lower = normalizeVN(t);
  for (var i = 0; i < PREFIXES.length; i++) {
    var pNorm = normalizeVN(PREFIXES[i]);
    if (lower.indexOf(pNorm) === 0) {
      var wordsCount = PREFIXES[i].split(' ').length;
      var words = t.split(/\s+/);
      t = words.slice(wordsCount).join(' ');
      break;
    }
  }
  return t.trim();
}

function parseQueryInput(raw, mode) {
  var s = norm(wordToNumber(raw));
  s = stripFillers(s);
  s = applyAlias(s);
  var qty = 1, unit = '', phrase = s;
  var unitGroup = UNIT_WORDS_NORM.join('|');
  var m = s.match(new RegExp('^(\\d+(?:\\.\\d+)?)\\s*('+unitGroup+')?\\s+(.+)$'));
  if (m) { qty = parseFloat(m[1]); unit = m[2]||''; phrase = m[3].trim(); }
  else {
    m = s.match(new RegExp('^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*('+unitGroup+')?\\s*$'));
    if (m) { phrase = m[1].trim(); qty = parseFloat(m[2]); unit = m[3]||''; }
  }
  return { qty: qty, unit: norm(unit), phrase: phrase };
}

function processTranscript(text) {
  var cleaned = stripPrefix(text);
  var segments = cleaned.split(/,|;| và /i).map(function(s) { return s.trim(); }).filter(Boolean);
  if (segments.length === 0) return 0;
  var added = 0;
  segments.forEach(function(seg) {
    var parsed = parseSegment(seg);
    if (!parsed) return;
    var top3 = matchProductTop3(parsed.phrase);
    if (!top3 || top3.length === 0 || !top3[0].product) return;
    ITEMS.push({
      spokenText: parsed.raw,
      top3: top3,
      selectedIdx: 0,
      qty: parsed.qty,
      price: top3[0].product.price,
      total: Math.round(parsed.qty * top3[0].product.price),
      unit: parsed.unit || '',
      special: parsed.special
    });
    added++;
  });
  return added;
}

function bestTypingScore(q, qPhonetic, tokens, mode) {
  var best = 0;
  for (var i = 0; i < tokens.length; i++) {
    var s = tokens[i];
    if (s === q) return 1.0;
    if (s.indexOf(q) === 0) { best = Math.max(best, PREFIX_SCORE); continue; }
    if (Math.abs(s.length - q.length) > 3 && s.indexOf(q) === -1 && q.indexOf(s) === -1) continue;
    if (s.length < 2) continue;
    best = Math.max(best, combinedScoreCached(q, s, mode, qPhonetic, null));
  }
  return best;
}

function bestVoiceScore(q, qPhonetic, tokens) {
  var best = 0;
  for (var i = 0; i < tokens.length; i++) {
    var s = tokens[i];
    if (Math.abs(s.length - q.length) > 3 && s.indexOf(q) === -1 && q.indexOf(s) === -1) continue;
    best = Math.max(best, phoneticScore(q, s, qPhonetic, null));
  }
  return best;
}

/* ── Search engine ────────────────────────── */
function matchProductTop3(rawQuery, unitHintLegacy, mode) {
  mode = mode || SEARCH_INPUT_MODE || 'type';
  if (!rawQuery || !rawQuery.trim()) return [];

  var cacheKey = mode + ':' + rawQuery.trim().toLowerCase();
  if (SEARCH_CACHE[cacheKey]) return SEARCH_CACHE[cacheKey];

  var parsed = parseQueryInput(rawQuery, mode);
  var q = parsed.phrase;
  var unitHint = parsed.unit || unitHintLegacy || '';

  var results = [];

  // Tier 1: SKU exact
  PRODUCTS.forEach(function(p) {
    if (p._idx.code === q) results.push({ product: p, tier: 1, score: 1.00, matchType: 'sku' });
  });
  if (results.length) return _finishSearch(results, unitHint, cacheKey);

  // Tier 2: Barcode exact
  PRODUCTS.forEach(function(p) {
    if (p._idx.barcode && p._idx.barcode === q) results.push({ product: p, tier: 2, score: 1.00, matchType: 'barcode' });
  });
  if (results.length) return _finishSearch(results, unitHint, cacheKey);

  // Tier 3: Exact match in searchable tokens
  PRODUCTS.forEach(function(p) {
    var idx = p._idx;
    if (idx.searchable && idx.searchable.indexOf(q) !== -1)
      results.push({ product: p, tier: 3, score: 1.00, matchType: 'exact' });
  });
  if (results.length) return _finishSearch(results, unitHint, cacheKey);

  // Tier 4: StartsWith
  PRODUCTS.forEach(function(p) {
    var idx = p._idx;
    if (idx.searchable && idx.searchable.some(function(s) { return s.indexOf(q) === 0; }))
      results.push({ product: p, tier: 4, score: 0.95, matchType: 'startswith' });
  });

  // Tier 5: Contains + multi-keyword
  var qTokens = q.split(' ').filter(Boolean);
  var already = {};
  results.forEach(function(r) { already[r.product._idx.code || r.product.name] = true; });
  PRODUCTS.forEach(function(p) {
    if (already[p._idx.code || p.name]) return;
    var idx = p._idx;
    if (idx.searchable && (idx.searchable.some(function(s) { return s.indexOf(q) !== -1; }))) {
      already[p._idx.code || p.name] = true;
      results.push({ product: p, tier: 5, score: 0.88, matchType: 'contains' });
      return;
    }
    if (qTokens.length > 1 && idx.tokens && qTokens.every(function(t) {
      return idx.tokens.some(function(pt) { return pt.indexOf(t) === 0; }) ||
             (idx.searchable && idx.searchable.some(function(s) { return s.indexOf(t) !== -1; }));
    })) {
      already[p._idx.code || p.name] = true;
      results.push({ product: p, tier: 5, score: 0.82, matchType: 'multi-kw' });
    }
  });

  // Tier 6: Searchable partial
  PRODUCTS.forEach(function(p) {
    if (already[p._idx.code || p.name]) return;
    var idx = p._idx;
    if (idx.searchable && idx.searchable.some(function(s) { return s.indexOf(q) === 0 || q.indexOf(s) === 0; })) {
      already[p._idx.code || p.name] = true;
      results.push({ product: p, tier: 6, score: 0.75, matchType: 'keyword' });
    }
  });

  // Tier 7+8: Fuzzy + Phonetic — top30 candidates
  resetScoreCache();
  var qPhonetic = toPhoneticKey(q);
  var q0 = qTokens[0] || '';
  var candidates = PRODUCTS.filter(function(p) {
    if (already[p._idx.code || p.name]) return false;
    return p._idx.tokens.some(function(t) {
      return t.indexOf(q0) === 0 || q0.indexOf(t) === 0 || Math.abs(t.length - q0.length) <= 2;
    }) || (p._idx.searchable && p._idx.searchable.length > 0);
  }).map(function(p) {
    var quick = Math.max(
      levRatio(q, p._idx.name),
      p._idx.searchable ? bestTypingScore(q, qPhonetic, p._idx.searchable, mode) : 0
    );
    return { p: p, quick: quick };
  }).filter(function(x) { return x.quick > 0.35; })
    .sort(function(a, b) { return b.quick - a.quick; })
    .slice(0, 30);

  var qAlt = dropLeadingConsonants(q);
  var qAltPhonetic = qAlt !== q ? toPhoneticKey(qAlt) : '';
  candidates.forEach(function(x) {
    var p = x.p;
    var idx = p._idx;
    var fuzzy = Math.max(
      combinedScoreCached(q, idx.name, mode, qPhonetic, idx.phonetic),
      bestTypingScore(q, qPhonetic, idx.searchable, mode),
      qAlt !== q ? combinedScoreCached(qAlt, idx.name, mode, qAltPhonetic, idx.phonetic) * 0.93 : 0
    );
    var voice = Math.max(
      phoneticScore(q, idx.name, qPhonetic, idx.phonetic),
      bestVoiceScore(q, qPhonetic, idx.searchable)
    );
    var best = Math.max(fuzzy, voice * 0.90);
    if (best > 0.50) results.push({ product: p, tier: best >= 0.80 ? 7 : 8, score: best, matchType: 'fuzzy' });
  });

  return _finishSearch(results, unitHint, cacheKey);
}

function _finishSearch(results, unitHint, cacheKey) {
  if (unitHint) results.forEach(function(r) {
    if (r.product._idx.unit === unitHint) r.score = Math.min(1, r.score + 0.12);
  });
  results.sort(function(a, b) { return a.tier !== b.tier ? a.tier - b.tier : b.score - a.score; });
  var out = results.slice(0, SUGGEST_MAX);
  if (cacheKey) SEARCH_CACHE[cacheKey] = out;
  return out;
}
