/* ===== Semantic Display Engine ===== */
/* Renders product names using semantic groups, never breaking within a group */

function computeProductDisplay(name) {
  if (!name) return { title: [], subtitle: [] };
  var groups = parseProductSemantic(name);
  if (!groups || groups.length === 0)
    return { title: [], subtitle: [] };
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
  return { title: title, subtitle: subtitle };
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
  var html = '<span class="name"><span class="name-line1">' + esc(titleText) + '</span>';
  if (display.subtitle.length) {
    html += '<span class="name-line2">';
    for (var si = 0; si < display.subtitle.length; si++) {
      html += '<span class="spec">' + esc(display.subtitle[si].text) + '</span>';
    }
    html += '</span>';
  }
  html += '</span>';
  return {
    line1: titleText,
    line2: display.subtitle.map(function(g) { return g.text; }).join(' '),
    html: html
  };
}

function renderCartDisplay(display) {
  var titleText = display.title.map(function(g) { return g.text; }).join(' ');
  var subText = display.subtitle.map(function(g) { return g.text; }).join(' ');
  if (!titleText) {
    return { line1: subText || '', line2: '', html: '' };
  }
  return { line1: titleText, line2: subText, html: '' };
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
