/* ===== Semantic Display Engine ===== */
/* Renders product names using semantic groups, never breaking within a group */

function renderSemanticName(name, mode) {
  if (!name) return { line1: '', line2: '', html: '' };
  mode = mode || 'suggest';

  var groups = parseProductSemantic(name);
  if (!groups || groups.length === 0)
    return { line1: name, line2: '', html: '<span class="name"><span class="name-line1">' + esc(name) + '</span></span>' };

  if (mode === 'suggest') {
    return renderSuggest(groups);
  }

  var all = groups.map(function(g) { return g.text; }).join(' ');
  return { line1: all, line2: '', html: '<span class="name"><span class="name-line1">' + esc(all) + '</span></span>' };
}

function renderSuggest(groups) {
  var line1 = [], line2 = [];
  var crossed = false;

  groups.forEach(function(g) {
    if (!crossed && (g.type === 'brand' || g.type === 'product_type')) {
      line1.push(g.text);
    } else {
      crossed = true;
      line2.push(g.text);
    }
  });

  var line1Text = line1.join(' ');
  if (!line1Text) {
    var all = groups.map(function(g) { return g.text; }).join(' ');
    return { line1: all, line2: '', html: '<span class="name"><span class="name-line1">' + esc(all) + '</span></span>' };
  }

  var line2Text = line2.join(' ');
  var html = '<span class="name"><span class="name-line1">' + esc(line1Text) + '</span>';
  if (line2.length) {
    html += '<span class="name-line2">';
    for (var si = 0; si < line2.length; si++) {
      html += '<span class="spec">' + esc(line2[si]) + '</span>';
    }
    html += '</span>';
  }
  html += '</span>';

  return { line1: line1Text, line2: line2Text, html: html };
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
