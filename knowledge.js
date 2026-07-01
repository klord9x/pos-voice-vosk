/* ===== Knowledge API — load, normalize, lookup, expand ===== */
var KNOWLEDGE = null;
var ENTITY_LOOKUP = {};
var _knowledgeReady = null;

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

function _buildEntityLookup(knowledge) {
  ENTITY_LOOKUP = {};
  var dictTypes = ['brand','product_type','attribute','descriptor','processing',
    'origin','variety','grade','capacity','package','unit','quantity'];
  dictTypes.forEach(function(type) {
    var dict = knowledge[type];
    if (!dict) return;
    Object.keys(dict).forEach(function(key) {
      var entry = dict[key];
      var norm = _normStr(entry.normalized || key);
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
  var norm = _normStr(text);
  var words = norm.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  var seen = {};
  var matches = [];
  for (var len = words.length; len >= 1; len--) {
    for (var i = 0; i <= words.length - len; i++) {
      var ng = words.slice(i, i + len).join(' ');
      if (seen[ng]) continue;
      seen[ng] = true;
      if (ENTITY_LOOKUP[ng]) {
        matches.push(ENTITY_LOOKUP[ng]);
      }
    }
  }
  return matches;
}

function splitProductName(name) {
  if (!name) return { line1: '', line2: '' };
  if (!KNOWLEDGE) return { line1: name, line2: '' };

  var entities = lookupEntities(name);
  var specTypes = { 'package': true, 'capacity': true, 'quantity': true, 'unit': true };
  var normName = _normStr(name);

  // Find the FIRST spec entity by word position
  var firstSpecWordIdx = -1;
  var firstPos = Infinity;

  entities.forEach(function(e) {
    if (!specTypes[e.type]) return;
    var idx = normName.indexOf(e.normalized);
    if (idx === -1) return;
    var precedingText = normName.substring(0, idx);
    var wordIdx = precedingText ? precedingText.trim().split(/\s+/).length : 0;
    if (wordIdx < firstPos) {
      firstPos = wordIdx;
      firstSpecWordIdx = wordIdx;
    }
  });

  // Don't split if spec is the first word or no spec found
  if (firstSpecWordIdx < 1) return { line1: name, line2: '' };

  var origWords = name.split(/\s+/);
  var line1 = origWords.slice(0, firstSpecWordIdx).join(' ').trim();
  var line2 = origWords.slice(firstSpecWordIdx).join(' ').trim();

  if (!line1 || !line2) return { line1: name, line2: '' };
  return { line1: line1, line2: line2 };
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
