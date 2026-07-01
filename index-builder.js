/* ===== Index Builder — compile tokens, build search index ===== */
/* Depends on: knowledge.js (KNOWLEDGE, lookupEntities, expandEntities, normalizeKnowledge)
                search.js (toPhoneticKey, generatePronunciationVariants, norm)
   Globals: PRODUCTS */

var INDEX_VERSION = 3;
var INDEXED_DB_NAME = 'pos-search';
var INDEXED_DB_STORE = 'index';

function buildInitialism(words) {
  return words.filter(function(w) { return w.length > 0; })
              .map(function(w) { return w[0]; })
              .join('');
}

function addSearchToken(token, tokenSet) {
  var tn = norm(token);
  if (!tn || tokenSet.has(tn)) return;
  tokenSet.add(tn);
  var words = tn.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    var init = buildInitialism(words);
    if (!tokenSet.has(init)) tokenSet.add(init);
  }
}

function compileSearchTokens(productName) {
  if (!productName) return [];
  var tokenSet = new Set();
  var normText = norm(productName);

  // 1. Original name (normalized)
  if (normText) addSearchToken(normText, tokenSet);

  // 2. Individual words (skip single chars)
  var words = normText.split(/\s+/).filter(Boolean);
  words.forEach(function(w) {
    if (w.length > 1) addSearchToken(w, tokenSet);
  });

  // 3. Bigrams + trigrams
  for (var i = 0; i < words.length - 1; i++) {
    var bg = words[i] + ' ' + words[i + 1];
    addSearchToken(bg, tokenSet);
  }
  for (var i = 0; i < words.length - 2; i++) {
    var tg = words[i] + ' ' + words[i + 1] + ' ' + words[i + 2];
    addSearchToken(tg, tokenSet);
  }

  // 4. Entity lookup + expansion
  var entities = null;
  if (KNOWLEDGE) {
    entities = lookupEntities(productName);
    var expanded = expandEntities(entities);
    expanded.forEach(function(t) {
      addSearchToken(t, tokenSet);
    });
  }

  // 5. Brand + type combinations from knowledge_graph
  if (KNOWLEDGE && KNOWLEDGE.knowledge) {
    var kg = KNOWLEDGE.knowledge.knowledge_graph;
    if (kg && kg.brand && entities) {
      var matchedBrands = entities.filter(function(e) { return e.type === 'brand'; });
      var matchedTypes = entities.filter(function(e) { return e.type === 'product_type'; });
      var seen = {};
      matchedBrands.forEach(function(b) {
        matchedTypes.forEach(function(t) {
          var combo = b.canonical + ' ' + t.canonical;
          var key = norm(combo);
          if (!seen[key]) {
            seen[key] = true;
            addSearchToken(combo, tokenSet);
          }
        });
      });
    }
  }

  // 6. Phonetic key for voice
  var phonetic = toPhoneticKey(productName);
  if (phonetic) addSearchToken(phonetic, tokenSet);

  // 7. Pronunciation variants
  var variants = generatePronunciationVariants(productName);
  variants.forEach(function(v) {
    addSearchToken(v, tokenSet);
  });

  return Array.from(tokenSet);
}

function buildProductIndex(product) {
  var n = norm(product.name || '');
  var searchable = compileSearchTokens(product.name);
  return {
    code: norm(product.code || ''),
    name: n,
    tokens: n.split(' ').filter(Boolean),
    searchable: searchable,
    phonetic: toPhoneticKey(product.name),
    unit: norm(product.unit || '')
  };
}

function buildAllIndexes() {
  PRODUCTS.forEach(function(p) {
    p._idx = buildProductIndex(p);
  });
  SEARCH_CACHE = {};
}

/* ── IndexedDB cache ─────────────────────── */
var _db = null;

function _openDB() {
  return new Promise(function(resolve, reject) {
    if (_db) return resolve(_db);
    if (!window.indexedDB) return reject(null);
    var req = indexedDB.open(INDEXED_DB_NAME, INDEX_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
        db.createObjectStore(INDEXED_DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = function(e) {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = function() { reject(null); };
  });
}

function saveIndexToCache(products, knowledgeVersion) {
  _openDB().then(function(db) {
    var tx = db.transaction(INDEXED_DB_STORE, 'readwrite');
    var store = tx.objectStore(INDEXED_DB_STORE);
    var data = {
      id: 'search_index',
      version: INDEX_VERSION,
      knowledgeVersion: knowledgeVersion,
      timestamp: Date.now(),
      products: products.map(function(p) {
        return { code: p.code, name: p.name, price: p.price, unit: p.unit, _idx: p._idx };
      })
    };
    store.put(data);
    return tx.complete;
  }).catch(function() {});
}

function loadIndexFromCache() {
  return _openDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(INDEXED_DB_STORE, 'readonly');
      var store = tx.objectStore(INDEXED_DB_STORE);
      var req = store.get('search_index');
      req.onsuccess = function(e) {
        var data = e.target.result;
        if (data && data.products && data.products.length > 0) {
          resolve(data);
        } else {
          resolve(null);
        }
      };
      req.onerror = function() { resolve(null); };
    });
  }).catch(function() { return null; });
}

function clearIndexCache() {
  _openDB().then(function(db) {
    var tx = db.transaction(INDEXED_DB_STORE, 'readwrite');
    var store = tx.objectStore(INDEXED_DB_STORE);
    store.delete('search_index');
  }).catch(function() {});
}
