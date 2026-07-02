/* ===== Display Migration — temporary fallback for legacy data ===== */
/* Will be removed when AI Compiler fully deployed */

function migrateLegacyDisplay(products) {
  if (!products) return;
  products.forEach(function(p) {
    if (p.display && p.display.title) return;
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
