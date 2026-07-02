/* ===== Knowledge API — load, normalize, lookup, expand ===== */
var KNOWLEDGE = null;
var ENTITY_LOOKUP = {};
var DISPLAY_MAP = {};
var _knowledgeReady = null;
var _displayReady = null;
var ENTITY_GROUPS = {
  spec: new Set(['package','capacity','quantity','unit'])
};
var MAX_ENTITY_WORDS = 0;
function isSpecEntity(entity) {
  return ENTITY_GROUPS.spec.has(entity.type);
}

function loadKnowledge() {
  if (_knowledgeReady) return _knowledgeReady;
  _knowledgeReady = fetch('/search-knowledge/knowledge.bundle.json')
    .then(function(r) { return r.json(); })
    .then(function(bundle) {
      KNOWLEDGE = bundle;
      _buildEntityLookup(bundle.knowledge);
      return bundle;
    });
  return _knowledgeReady;
}

function loadDisplayKnowledge() {
  if (_displayReady) return _displayReady;
  _displayReady = fetch('/search-knowledge/display_knowledge.json')
    .then(function(r) { return r.json(); })
    .then(function(entries) {
      DISPLAY_MAP = {};
      entries.forEach(function(e) {
        DISPLAY_MAP[e.sku] = { title: e.display_title, subtitle: e.display_subtitle };
      });
      return DISPLAY_MAP;
    });
  return _displayReady;
}

function _buildEntityLookup(knowledge) {
  ENTITY_LOOKUP = {};
  MAX_ENTITY_WORDS = 0;
  var dictTypes = ['brand','product_type','attribute','descriptor','processing',
    'origin','variety','grade','capacity','package','unit','quantity'];
  dictTypes.forEach(function(type) {
    var dict = knowledge[type];
    if (!dict) return;
    Object.keys(dict).forEach(function(key) {
      var entry = dict[key];
      var norm = _normStr(entry.normalized || key);
      var wordCount = norm.split(/\s+/).filter(Boolean).length;
      if (wordCount > MAX_ENTITY_WORDS) MAX_ENTITY_WORDS = wordCount;
      ENTITY_LOOKUP[norm] = { type: type, canonical: entry.canonical, normalized: norm };
    });
  });
  var speech = knowledge.speech;
  if (speech) {
    Object.keys(speech).forEach(function(canonical) {
      var entry = speech[canonical];
      (entry.aliases || []).forEach(function(alias) {
        var norm = _normStr(alias);
        if (!ENTITY_LOOKUP[norm]) {
          var wc = norm.split(/\s+/).filter(Boolean).length;
          if (wc > MAX_ENTITY_WORDS) MAX_ENTITY_WORDS = wc;
          ENTITY_LOOKUP[norm] = { type: 'speech', canonical: canonical, normalized: norm, target: _normStr(canonical) };
        }
      });
    });
  }
  var normDict = knowledge.normalization;
  if (normDict) {
    Object.keys(normDict).forEach(function(canonical) {
      var entry = normDict[canonical];
      (entry.aliases || []).forEach(function(alias) {
        var norm = _normStr(alias);
        if (!ENTITY_LOOKUP[norm]) {
          ENTITY_LOOKUP[norm] = { type: 'normalization', canonical: canonical, normalized: _normStr(canonical) };
        }
      });
    });
  }
}

function _normStr(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}

function normalizeKnowledge(text) {
  return _normStr(text);
}

function lookupEntities(text) {
  var origWords = text.split(/\s+/).filter(Boolean);
  if (origWords.length === 0) return [];

  var normInfo = [];
  origWords.forEach(function(ow, idx) {
    var nw = _normStr(ow).split(/\s+/).filter(Boolean);
    if (nw.length === 0) return;
    nw.forEach(function(n) { normInfo.push({ norm: n, origIdx: idx }); });
  });
  if (normInfo.length === 0) return [];

  var normWords = normInfo.map(function(e) { return e.norm; });
  var matches = [];
  var maxLen = Math.min(MAX_ENTITY_WORDS, normWords.length);

  for (var len = maxLen; len >= 1; len--) {
    for (var i = 0; i <= normWords.length - len; i++) {
      var ng = normWords.slice(i, i + len).join(' ');
      if (ENTITY_LOOKUP[ng]) {
        var entry = ENTITY_LOOKUP[ng];
        var firstOrig = normInfo[i].origIdx;
        var lastOrig = normInfo[i + len - 1].origIdx;
        matches.push({
          type: entry.type,
          canonical: entry.canonical,
          normalized: entry.normalized,
          text: origWords.slice(firstOrig, lastOrig + 1).join(' '),
          wordStart: firstOrig,
          wordEnd: lastOrig
        });
      }
    }
  }
  return matches;
}


function parseProductSemantic(name) {
  if (!name) return [];
  var entities = lookupEntities(name);
  var words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  var used = {};
  var deduped = [];
  entities.slice().sort(function(a, b) {
    var aLen = a.wordEnd - a.wordStart;
    var bLen = b.wordEnd - b.wordStart;
    return bLen !== aLen ? bLen - aLen : a.wordStart - b.wordStart;
  }).forEach(function(e) {
    for (var w = e.wordStart; w <= e.wordEnd; w++) {
      if (used[w]) return;
    }
    for (var w = e.wordStart; w <= e.wordEnd; w++) used[w] = true;
    deduped.push(e);
  });
  deduped.sort(function(a, b) { return a.wordStart - b.wordStart; });

  var groups = [];
  var ptr = 0;
  deduped.forEach(function(e) {
    if (e.wordStart > ptr) {
      var gap = words.slice(ptr, e.wordStart).join(' ');
      if (gap) groups.push({ type: null, text: gap });
    }
    groups.push({ type: e.type, text: e.text });
    ptr = e.wordEnd + 1;
  });
  if (ptr < words.length) {
    var gap = words.slice(ptr).join(' ');
    if (gap) groups.push({ type: null, text: gap });
  }
  return groups;
}

function expandEntities(entities) {
  var tokens = [];
  entities.forEach(function(e) {
    tokens.push(e.canonical);
    tokens.push(e.normalized);
    var speech = KNOWLEDGE && KNOWLEDGE.knowledge && KNOWLEDGE.knowledge.speech;
    if (speech && speech[e.canonical]) {
      (speech[e.canonical].aliases || []).forEach(function(a) { tokens.push(a); });
    }
    var normDict = KNOWLEDGE && KNOWLEDGE.knowledge && KNOWLEDGE.knowledge.normalization;
    if (normDict && normDict[e.canonical]) {
      (normDict[e.canonical].aliases || []).forEach(function(a) { tokens.push(a); });
    }
  });
  return tokens.filter(function(t, i, a) { return t && a.indexOf(t) === i; });
}
