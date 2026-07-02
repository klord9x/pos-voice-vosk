/* ===== Display Migration ===== */

function migrateLegacyDisplay(products) {
  if (!products) return;
  products.forEach(function(p) {
    if (p.display && p.display.title) return;
    var entry = DISPLAY_MAP && DISPLAY_MAP[p.code];
    if (entry) {
      p.display = { title: entry.title, subtitle: entry.subtitle, spokenName: null };
      return;
    }
    var groups = parseProductSemantic(p.name || '');
    if (!groups || groups.length === 0) {
      p.display = { title: p.name || '', subtitle: p.unit || '', spokenName: null };
      return;
    }
    var title = [], subtitle = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.type === 'brand' || g.type === 'product_type') {
        title.push(g.text);
      } else {
        subtitle.push(g.text);
      }
    }
    p.display = {
      title: title.join(' '),
      subtitle: subtitle.join(' '),
      spokenName: null
    };
  });
}
