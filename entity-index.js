/* ===== Entity Index — Intent detection, posting lists ===== */
/* Depends on: knowledge.js (KNOWLEDGE), search.js (norm),
   index-builder.js (buildInitialism), semantic-display.js (computeProductDisplay) */

var ENTITY_REGISTRY = [];
var ENTITY_BY_TEXT = {};
var INTENT_INDEX = {};
var POSTINGS = {};

function buildEntityIndex() {
  ENTITY_REGISTRY = [];
  ENTITY_BY_TEXT = {};
  INTENT_INDEX = {};
  POSTINGS = {};

  var bundle = KNOWLEDGE && KNOWLEDGE.knowledge;
  if (!bundle) return;

  var nextId = 0;
  var entityTypes = ['product_type', 'brand', 'attribute', 'descriptor',
    'origin', 'variety', 'grade', 'package', 'unit', 'capacity'];

  entityTypes.forEach(function(type) {
    var dict = bundle[type];
    if (!dict) return;
    Object.keys(dict).forEach(function(key) {
      var entry = dict[key];
      var text = norm(entry.canonical || key);
      if (text && text.length >= 2 && !ENTITY_BY_TEXT[text]) {
        ENTITY_BY_TEXT[text] = { id: nextId++, text: text, type: type };
      }
    });
  });

  Object.keys(ENTITY_BY_TEXT).forEach(function(text) {
    ENTITY_REGISTRY.push(ENTITY_BY_TEXT[text]);
  });

  ENTITY_REGISTRY.forEach(function(entity) {
    _addIntentEntry(entity.text, entity.id, 1.0);
    var words = entity.text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      var init = buildInitialism(words);
      if (init.length >= 2) _addIntentEntry(init, entity.id, 1.0);
    }
  });

  var speech = bundle.speech;
  if (speech) {
    Object.keys(speech).forEach(function(canonical) {
      var entry = speech[canonical];
      var canonNorm = norm(canonical);
      var entity = ENTITY_BY_TEXT[canonNorm];
      if (entity && entry.aliases) {
        entry.aliases.forEach(function(alias) {
          var aliasNorm = norm(alias);
          if (aliasNorm && aliasNorm !== canonNorm && aliasNorm.length >= 2) {
            _addIntentEntry(aliasNorm, entity.id, 0.95);
          }
        });
      }
    });
  }

  PRODUCTS.forEach(function(product, idx) {
    var display = product._display || computeProductDisplay(product.name);
    var seen = {};
    var allGroups = (display.title || []).concat(display.subtitle || []);
    allGroups.forEach(function(g) {
      var text = norm(g.text);
      var entity = ENTITY_BY_TEXT[text];
      if (entity && !seen[entity.id]) {
        seen[entity.id] = true;
        if (!POSTINGS[entity.id]) POSTINGS[entity.id] = [];
        POSTINGS[entity.id].push(idx);
      }
    });
  });
}

function _addIntentEntry(expr, entityId, confidence) {
  if (!expr || expr.length < 2) return;
  if (!INTENT_INDEX[expr]) INTENT_INDEX[expr] = [];
  if (!INTENT_INDEX[expr].some(function(m) { return m.entityId === entityId; })) {
    INTENT_INDEX[expr].push({ entityId: entityId, confidence: confidence });
  }
}
