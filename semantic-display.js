/* ===== Semantic Display Engine ===== */
/* Renders product names using semantic groups, never breaking within a group */

var CONTAINER_UNITS = new Set(['thùng','lốc','bịch','túi','bao','rổ','bó']);
var PROMINENT_TYPES = new Set(['sale_package','package_spec','container_unit']);

function computeProductDisplay(name, unit) {
  if (!name) return { title: [], subtitle: [], saleUnit: '' };
  var groups = parseProductSemantic(name);
  if (!groups || groups.length === 0)
    return { title: [], subtitle: [], saleUnit: unit || '' };
  var title = [], subtitle = [];
  var i = 0;
  while (i < groups.length) {
    var g = groups[i];
    if (g.type === 'brand' || g.type === 'product_type') {
      title.push({ type: g.type, text: g.text });
      i++;
    } else if (g.type === 'quantity' && i + 1 < groups.length &&
               (groups[i + 1].type === 'package' || groups[i + 1].type === 'unit')) {
      subtitle.push({ type: 'package_spec', text: g.text + ' ' + groups[i + 1].text });
      i += 2;
    } else {
      subtitle.push({ type: g.type, text: g.text });
      i++;
    }
  }
  return { title: title, subtitle: subtitle, saleUnit: unit || '' };
}

function renderSemanticName(display, mode) {
  if (!display) return { line1: '', line2: '', html: '' };
  mode = mode || 'suggest';
  if (mode === 'suggest') return renderSuggestDisplay(display);
  if (mode === 'cart') return renderCartDisplay(display);
  return renderCartDisplay(display);
}

function renderSuggestDisplay(display) {
  var titleText = display.title.map(function(g) { return g.text; }).join(' ');
  if (!titleText) {
    var all = display.subtitle.map(function(g) { return g.text; }).join(' ');
    return { line1: all, line2: '', html: '<span class="name"><span class="name-line1">' + esc(all) + '</span></span>' };
  }

  var chips = _buildDisplayChips(display);

  var html = '<span class="name"><span class="name-line1">' + esc(titleText) + '</span>';
  if (chips.length) {
    html += '<span class="name-line2">';
    for (var si = 0; si < chips.length; si++) {
      html += '<span class="spec' + (PROMINENT_TYPES.has(chips[si].type) ? ' prominent' : '') + '">' + esc(chips[si].text) + '</span>';
    }
    html += '</span>';
  }
  html += '</span>';
  return {
    line1: titleText,
    line2: chips.map(function(g) { return g.text; }).join(' '),
    html: html
  };
}

function renderCartDisplay(display) {
  var titleText = display.title.map(function(g) { return g.text; }).join(' ');
  var chips = _buildDisplayChips(display);
  var subText = chips.map(function(g) { return g.text; }).join(' ');
  if (!titleText) {
    return { line1: subText || '', line2: '', html: '' };
  }
  return { line1: titleText, line2: subText, html: '' };
}

function _buildDisplayChips(display) {
  var chips = [];
  var merged = false;
  display.subtitle.forEach(function(g) {
    if (!merged && g.type === 'package_spec' && display.saleUnit &&
        CONTAINER_UNITS.has(display.saleUnit)) {
      chips.push({ type: 'sale_package', text: display.saleUnit + ' ' + g.text });
      merged = true;
    } else {
      chips.push(g);
    }
  });
  if (!merged && display.saleUnit && CONTAINER_UNITS.has(display.saleUnit)) {
    chips.push({ type: 'container_unit', text: display.saleUnit });
  }

  var variant = chips.filter(function(c) { return !PROMINENT_TYPES.has(c.type); });
  var prominent = chips.filter(function(c) { return PROMINENT_TYPES.has(c.type); });
  return variant.concat(prominent);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
