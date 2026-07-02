/* ===== Semantic Display Engine ===== */
/* Returns a clean Display Model used by all UI screens */

function computeProductDisplay(name, unit) {
  if (!name) return { title: '', variant: '', package: '', chips: [] };
  var groups = parseProductSemantic(name);
  if (!groups || groups.length === 0) {
    return { title: name || '', variant: '', package: unit || '', chips: [] };
  }

  var title = [];
  var variant = [];
  var packageParts = [];
  var chips = [];
  var i = 0;

  while (i < groups.length) {
    var g = groups[i];
    if (g.type === 'brand' || g.type === 'product_type') {
      title.push(g.text);
    } else if (['quantity', 'package', 'unit'].indexOf(g.type) !== -1) {
      // Package-related: group quantity + unit
      if (g.type === 'quantity' && i + 1 < groups.length && 
          (groups[i + 1].type === 'package' || groups[i + 1].type === 'unit')) {
        packageParts.push(g.text + ' ' + groups[i + 1].text);
        i++; // Skip next
      } else if (g.type === 'quantity') {
        packageParts.push(g.text);
      } else {
        packageParts.push(g.text);
      }
    } else {
      // Identity types (attribute, descriptor, etc.)
      variant.push(g.text);
    }
    // Add to chips for backward compatibility
    chips.push({ type: g.type, text: g.text });
    i++;
  }

  // Build package string with saleUnit prepended
  var packageStr = '';
  if (unit) {
    if (packageParts.length > 0) {
      var firstPart = packageParts[0];
      if (!firstPart.toLowerCase().startsWith(unit.toLowerCase())) {
        packageStr = unit + ' ' + firstPart;
        for (var k = 1; k < packageParts.length; k++) {
          packageStr += ' ' + packageParts[k];
        }
      } else {
        packageStr = packageParts.join(' ');
      }
    } else {
      packageStr = unit;
    }
  } else {
    packageStr = packageParts.join(' ');
  }

  return {
    title: title.join(' '),
    variant: variant.join(' '),
    package: packageStr,
    chips: chips,
    subtitle: chips  // backward-compat cho entity-index.js
  };
}
