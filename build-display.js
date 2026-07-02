const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'data.csv');
const outPath = path.join(__dirname, 'search-knowledge', 'display_knowledge.json');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map(s => s.trim().replace(/^"(.*)"$/, '$1').trim());
}

const raw = fs.readFileSync(csvPath, 'utf-8').trim();
const lines = raw.split('\n');
const products = [];
for (let i = 1; i < lines.length; i++) {
  const parts = parseCSVLine(lines[i]);
  if (parts.length < 2) continue;
  const sku = parts[0];
  const name = parts[1];
  const unit = parts.length >= 4 ? parts[3] : '';
  products.push({ sku, name, unit });
}

const bundlePath = path.join(__dirname, 'search-knowledge', 'knowledge.bundle.json');
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
const brandData = bundle.knowledge.brand;

function titleForBrand(brand, variant, productType) {
  const info = brandData[brand];
  if (info && info.category_defining) return `${brand} ${variant}`;
  return `${productType} ${brand}`;
}

function subtitleForBrand(brand, variant, spec) {
  const info = brandData[brand];
  if (info && info.category_defining) return spec;
  return variant + (spec ? ` • ${spec}` : '');
}

function makeDisplay(product) {
  const { sku, name, unit } = product;

  // ---- CONDIMENT (Gia vị) pattern: "Gia vị {brand} {product} {spec}" -> "{product} {brand}" ----
  const condimentMatch = name.match(/^Gia vị\s+(.+?)\s+(Nước mắm|Tương ớt|Bột ngọt|Nước tương|Hạt nêm)((?:\s.*)?)$/);
  if (condimentMatch) {
    const brand = condimentMatch[1];
    const prod = condimentMatch[2];
    const rest = (condimentMatch[3] || '').trim();
    const spec = parseSpec(rest, unit);
    return {
      sku,
      display_title: `${prod} ${brand}`,
      display_subtitle: spec
    };
  }

  // ---- DRINK (Nước ngọt) pattern: "Nước ngọt {brand} {variant} {spec}" -> "{brand} {variant}" ----
  const drinkMatch = name.match(/^Nước ngọt\s+(.+?)\s+(Nguyên bản|Chanh|Hương xá xị|Hương cam|Ít đường)((?:\s.*)?)$/);
  if (drinkMatch) {
    const brand = drinkMatch[1];
    const variant = drinkMatch[2];
    const rest = (drinkMatch[3] || '').trim();
    const spec = parseSpec(rest, unit);
    return { sku, display_title: titleForBrand(brand, variant, 'Nước ngọt'), display_subtitle: subtitleForBrand(brand, variant, spec) };
  }

  // ---- DRINK (Coca Cola) pattern: "Nước ngọt Coca Cola {variant} {spec}" -> "Coca Cola {variant}" ----
  const cocaMatch = name.match(/^Nước ngọt\s+(Coca Cola)\s+(Nguyên bản|Ít đường|Hương xá xị)((?:\s.*)?)$/);
  if (cocaMatch) {
    const brand = cocaMatch[1];
    const variant = cocaMatch[2];
    const rest = (cocaMatch[3] || '').trim();
    const spec = parseSpec(rest, unit);
    return { sku, display_title: titleForBrand(brand, variant, 'Nước ngọt'), display_subtitle: subtitleForBrand(brand, variant, spec) };
  }

  // ---- SHAMPOO (Dầu gội) pattern: -> "{brand} {variant}" ----
  const shampooMatch = name.match(/^Dầu gội\s+(.+?)\s+(Sạch sâu|Trị gàu|Bạc hà|Suôn mượt)((?:\s.*)?)$/);
  if (shampooMatch) {
    const brand = shampooMatch[1];
    const variant = shampooMatch[2];
    const rest = (shampooMatch[3] || '').trim();
    const spec = parseSpec(rest, unit);
    return { sku, display_title: titleForBrand(brand, variant, 'Dầu gội'), display_subtitle: subtitleForBrand(brand, variant, spec) };
  }

  // ---- TISSUE (Khăn giấy) pattern: -> "{brand} {variant}" ----
  const tissueMatch = name.match(/^Khăn giấy\s+(.+?)\s+(Không mùi|Hương lô hội|2 lớp|3 lớp)((?:\s.*)?)$/);
  if (tissueMatch) {
    const brand = tissueMatch[1];
    const variant = tissueMatch[2];
    const rest = (tissueMatch[3] || '').trim();
    const spec = parseSpec(rest, unit);
    return { sku, display_title: titleForBrand(brand, variant, 'Khăn giấy'), display_subtitle: subtitleForBrand(brand, variant, spec) };
  }

  // ---- TISSUE (Khăn giấy) just brand variant fallback ----
  const tissueBrandMatch = name.match(/^Khăn giấy\s+(.+?)\s+(.+?)((?:\s.*)?)$/);
  if (tissueBrandMatch) {
    const brand = tissueBrandMatch[1];
    const variant = tissueBrandMatch[2];
    const rest = (tissueBrandMatch[3] || '').trim();
    // But only if brand is in our known list
    const knownTissueBrands = ['Pulppy', 'An An', 'Bless You', 'Tempo'];
    if (knownTissueBrands.includes(brand)) {
      const spec = parseSpec(rest, unit);
      return { sku, display_title: titleForBrand(brand, variant, 'Khăn giấy'), display_subtitle: subtitleForBrand(brand, variant, spec) };
    }
  }

  // ---- COOKIE (Bánh quy) pattern: -> "{brand} {variant}" ----
  const cookieMatch = name.match(/^Bánh quy\s+(.+?)\s+(Vanila|Phô mai|Dâu|Bơ|Socola)((?:\s.*)?)$/);
  if (cookieMatch) {
    const brand = cookieMatch[1];
    const variant = cookieMatch[2];
    const rest = (cookieMatch[3] || '').trim();
    const spec = parseSpec(rest, unit);
    return { sku, display_title: titleForBrand(brand, variant, 'Bánh quy'), display_subtitle: subtitleForBrand(brand, variant, spec) };
  }

  // ---- MILK (Sữa tươi) pattern: -> "Sữa tươi {brand} {variant}" ----
  const milkMatch = name.match(/^Sữa tươi\s+(.+?)\s+(Socola|Có đường|Không đường|Ít đường|Hương dâu)((?:\s.*)?)$/);
  if (milkMatch) {
    const brand = milkMatch[1];
    const variant = milkMatch[2];
    const rest = (milkMatch[3] || '').trim();
    const spec = parseSpec(rest, unit);
    return { sku, display_title: titleForBrand(brand, variant, 'Sữa tươi'), display_subtitle: subtitleForBrand(brand, variant, spec) };
  }

  // ---- NOODLE (Mì) pattern: -> "Mì {brand} {variant}" ----
  const noodleMatch = name.match(/^Mì\s+(.+?)\s+(Sườn heo|Bò hầm|Xốt spaghetti|Tôm chua cay|Lẩu thái)((?:\s.*)?)$/);
  if (noodleMatch) {
    const brand = noodleMatch[1];
    const variant = noodleMatch[2];
    const rest = (noodleMatch[3] || '').trim();
    const spec = parseSpec(rest, unit);
    return { sku, display_title: titleForBrand(brand, variant, 'Mì'), display_subtitle: subtitleForBrand(brand, variant, spec) };
  }

  // ---- FRESH FOOD: Tôm thẻ ----
  const tomMatch = name.match(/^Tôm thẻ\s+(Size vừa|Size lớn|Size vừa lớn)((?:\s.*)?)$/);
  if (tomMatch) {
    const grade = tomMatch[1];
    const rest = (tomMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Tôm thẻ ${grade}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Trứng gà ----
  const trungGaMatch = name.match(/^Trứng gà\s+(Ta|Công nghiệp)((?:\s.*)?)$/);
  if (trungGaMatch) {
    const variety = trungGaMatch[1];
    const rest = (trungGaMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Trứng gà ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Trứng cút ----
  const trungCutMatch = name.match(/^Trứng cút\s+(Lộn|Tươi)((?:\s.*)?)$/);
  if (trungCutMatch) {
    const processing = trungCutMatch[1];
    const rest = (trungCutMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Trứng cút ${processing}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Trứng cút (no processing) ----
  const trungCutPlain = name.match(/^Trứng cút((?:\s.*)?)$/);
  if (trungCutPlain) {
    const rest = (trungCutPlain[1] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: 'Trứng cút', display_subtitle: spec };
  }

  // ---- FRESH FOOD: Trứng vịt ----
  const trungVitMatch = name.match(/^Trứng vịt\s+(Muối|Đồng)((?:\s.*)?)$/);
  if (trungVitMatch) {
    const processing = trungVitMatch[1];
    const rest = (trungVitMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Trứng vịt ${processing}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cá hú ----
  const caHuMatch = name.match(/^Cá hú\s+(Tươi|Cắt khoanh)((?:\s.*)?)$/);
  if (caHuMatch) {
    const processing = caHuMatch[1];
    const rest = (caHuMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cá hú ${processing}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cá nục ----
  const caNucMatch = name.match(/^Cá nục\s+(Hấp sẵn|Biển tươi)((?:\s.*)?)$/);
  if (caNucMatch) {
    const processing = caNucMatch[1];
    const rest = (caNucMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cá nục ${processing}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cá thu ----
  const caThuMatch = name.match(/^Cá thu\s+(Tươi|Cắt lát)((?:\s.*)?)$/);
  if (caThuMatch) {
    const processing = caThuMatch[1];
    const rest = (caThuMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cá thu ${processing}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cá lóc ----
  const caLocMatch = name.match(/^Cá lóc\s+(Đồng|Nuôi)((?:\s.*)?)$/);
  if (caLocMatch) {
    const variety = caLocMatch[1];
    const rest = (caLocMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cá lóc ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cá điêu hồng ----
  const caDieuMatch = name.match(/^Cá điêu hồng\s+(Sông|Làm sẵn)((?:\s.*)?)$/);
  if (caDieuMatch) {
    const variety = caDieuMatch[1];
    const rest = (caDieuMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cá điêu hồng ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Thịt ba rọi ----
  const thitBaRoiMatch = name.match(/^Thịt ba rọi\s+(Heo tộc|Heo CP|CP)((?:\s.*)?)$/);
  if (thitBaRoiMatch) {
    const variety = thitBaRoiMatch[1];
    const rest = (thitBaRoiMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Thịt ba rọi ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Thịt bò ----
  const thitBoMatch = name.match(/^Thịt bò\s+(Bắp hoa|Thăn nội|Gầu)((?:\s.*)?)$/);
  if (thitBoMatch) {
    const descriptor = thitBoMatch[1];
    const rest = (thitBoMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Thịt bò ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Thịt heo xay ----
  const thitHeoXayMatch = name.match(/^Thịt heo xay\s+(Nạc|Sẵn)((?:\s.*)?)$/);
  if (thitHeoXayMatch) {
    const processing = thitHeoXayMatch[1];
    const rest = (thitHeoXayMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Thịt heo xay ${processing}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Nạc dăm ----
  const nacDamMatch = name.match(/^Nạc dăm\s+(Mềm|Heo tươi)((?:\s.*)?)$/);
  if (nacDamMatch) {
    const descriptor = nacDamMatch[1];
    const rest = (nacDamMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Nạc dăm ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Sườn non ----
  const suonNonMatch = name.match(/^Sườn non\s+(Heo tươi|Heo CP|CP)((?:\s.*)?)$/);
  if (suonNonMatch) {
    const descriptor = suonNonMatch[1];
    const rest = (suonNonMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Sườn non ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Đùi gà ----
  const duiGaMatch = name.match(/^Đùi gà\s+(Tươi tỏi|Góc tư)((?:\s.*)?)$/);
  if (duiGaMatch) {
    const descriptor = duiGaMatch[1];
    const rest = (duiGaMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Đùi gà ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cánh gà ----
  const canhGaMatch = name.match(/^Cánh gà\s+(Tươi|Công nghiệp)((?:\s.*)?)$/);
  if (canhGaMatch) {
    const descriptor = canhGaMatch[1];
    const rest = (canhGaMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cánh gà ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Chân giò ----
  const chanGioMatch = name.match(/^Chân giò\s+(Heo trước|Heo sau)((?:\s.*)?)$/);
  if (chanGioMatch) {
    const descriptor = chanGioMatch[1];
    const rest = (chanGioMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Chân giò ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Xoài ----
  const xoaiMatch = name.match(/^Xoài\s+(Cát Hòa Lộc|Keo|Đài Loan)((?:\s.*)?)$/);
  if (xoaiMatch) {
    const variety = xoaiMatch[1];
    const rest = (xoaiMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Xoài ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cam ----
  const camMatch = name.match(/^Cam\s+(Sành miền Tây|Xoàn)((?:\s.*)?)$/);
  if (camMatch) {
    const variety = camMatch[1];
    const rest = (camMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cam ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Chuối ----
  const chuoiMatch = name.match(/^Chuối\s+(Cau|Già hương|Sứ)((?:\s.*)?)$/);
  if (chuoiMatch) {
    const variety = chuoiMatch[1];
    const rest = (chuoiMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Chuối ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Thanh long ----
  const thanhLongMatch = name.match(/^Thanh long\s+(Ruột đỏ|Ruột trắng)((?:\s.*)?)$/);
  if (thanhLongMatch) {
    const variety = thanhLongMatch[1];
    const rest = (thanhLongMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Thanh long ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Ổi ----
  const oiMatch = name.match(/^Ổi\s+(Đài Loan|Nữ hoàng)((?:\s.*)?)$/);
  if (oiMatch) {
    const variety = oiMatch[1];
    const rest = (oiMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Ổi ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Táo ----
  const taoMatch = name.match(/^Táo\s+(Gala|Fuji|Envy)((?:\s.*)?)$/);
  if (taoMatch) {
    const variety = taoMatch[1];
    const rest = (taoMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Táo ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Bưởi ----
  const buoiMatch = name.match(/^Bưởi\s+(Năm Roi|Da xanh)((?:\s.*)?)$/);
  if (buoiMatch) {
    const variety = buoiMatch[1];
    const rest = (buoiMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Bưởi ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Chôm chôm ----
  const chomMatch = name.match(/^Chôm chôm\s+(Nhãn|Thái)((?:\s.*)?)$/);
  if (chomMatch) {
    const variety = chomMatch[1];
    const rest = (chomMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Chôm chôm ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Dưa hấu ----
  const duaHauMatch = name.match(/^Dưa hấu\s+(Không hạt|Long An)((?:\s.*)?)$/);
  if (duaHauMatch) {
    const variety = duaHauMatch[1];
    const rest = (duaHauMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Dưa hấu ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Khoai tây ----
  const khoaiTayMatch = name.match(/^Khoai tây\s+(Đà Lạt|Vàng)((?:\s.*)?)$/);
  if (khoaiTayMatch) {
    const origin = khoaiTayMatch[1];
    const rest = (khoaiTayMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Khoai tây ${origin}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cà rốt ----
  const caRotMatch = name.match(/^Cà rốt\s+(Đà Lạt|Hữu cơ)((?:\s.*)?)$/);
  if (caRotMatch) {
    const origin = caRotMatch[1];
    const rest = (caRotMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cà rốt ${origin}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Bắp cải ----
  const bapCaiMatch = name.match(/^Bắp cải\s+(Tím Đà Lạt)((?:\s.*)?)$/);
  if (bapCaiMatch) {
    const variety = bapCaiMatch[1];
    const rest = (bapCaiMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Bắp cải ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Bầu ----
  const bauMatch = name.match(/^Bầu\s+(Dài|Sao)((?:\s.*)?)$/);
  if (bauMatch) {
    const variety = bauMatch[1];
    const rest = (bauMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Bầu ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Bí đỏ ----
  const biDoMatch = name.match(/^Bí đỏ\s+(Tròn|Hồ lô)((?:\s.*)?)$/);
  if (biDoMatch) {
    const variety = biDoMatch[1];
    const rest = (biDoMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Bí đỏ ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cà chua ----
  const caChuaMatch = name.match(/^Cà chua\s+(Bi|Thường Đà Lạt)((?:\s.*)?)$/);
  if (caChuaMatch) {
    const variety = caChuaMatch[1];
    const rest = (caChuaMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cà chua ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Dưa leo ----
  const duaLeoMatch = name.match(/^Dưa leo\s+(Baby|Thường)((?:\s.*)?)$/);
  if (duaLeoMatch) {
    const variety = duaLeoMatch[1];
    const rest = (duaLeoMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Dưa leo ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Hành tây ----
  const hanhTayMatch = name.match(/^Hành tây\s+(Đà Lạt|Nhập khẩu)((?:\s.*)?)$/);
  if (hanhTayMatch) {
    const origin = hanhTayMatch[1];
    const rest = (hanhTayMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Hành tây ${origin}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Mực ống ----
  const mucMatch = name.match(/^Mực ống\s+(Miền Trung|Tươi rói)((?:\s.*)?)$/);
  if (mucMatch) {
    const descriptor = mucMatch[1];
    const rest = (mucMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Mực ống ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Nghêu ----
  const ngheuMatch = name.match(/^Nghêu\s+(Sống|Bến Tre)((?:\s.*)?)$/);
  if (ngheuMatch) {
    const descriptor = ngheuMatch[1];
    const rest = (ngheuMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Nghêu ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Khổ qua ----
  const khoQuaMatch = name.match(/^Khổ qua\s+(Rừng|Tròn)((?:\s.*)?)$/);
  if (khoQuaMatch) {
    const variety = khoQuaMatch[1];
    const rest = (khoQuaMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Khổ qua ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Rau muống ----
  const rauMuongMatch = name.match(/^Rau muống\s+(Đồng quê|Sông hồng)((?:\s.*)?)$/);
  if (rauMuongMatch) {
    const origin = rauMuongMatch[1];
    const rest = (rauMuongMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Rau muống ${origin}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Rau ngót ----
  const rauNgọtMatch = name.match(/^Rau ngót\s+(Sạch|Bó)((?:\s.*)?)$/);
  if (rauNgọtMatch) {
    const descriptor = rauNgọtMatch[1];
    const rest = (rauNgọtMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Rau ngót ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Cải ngọt ----
  const caiNgọtMatch = name.match(/^Cải ngọt\s+(Đà Lạt|Vườn nhà)((?:\s.*)?)$/);
  if (caiNgọtMatch) {
    const origin = caiNgọtMatch[1];
    const rest = (caiNgọtMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Cải ngọt ${origin}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Mồng tơi ----
  const mongToiMatch = name.match(/^Mồng tơi\s+(Sạch|Đồng)((?:\s.*)?)$/);
  if (mongToiMatch) {
    const descriptor = mongToiMatch[1];
    const rest = (mongToiMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Mồng tơi ${descriptor}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Xà lách ----
  const xaLachMatch = name.match(/^Xà lách\s+(Mỡ Đà Lạt|Búp)((?:\s.*)?)$/);
  if (xaLachMatch) {
    const variety = xaLachMatch[1];
    const rest = (xaLachMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Xà lách ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Đậu hũ ----
  const dauHuMatch = name.match(/^Đậu hũ\s+(Chiên|Trắng)((?:\s.*)?)$/);
  if (dauHuMatch) {
    const processing = dauHuMatch[1];
    const rest = (dauHuMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Đậu hũ ${processing}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Nấm đùi gà ----
  const namDuiGaMatch = name.match(/^Nấm đùi gà\s+(Tươi|Khay)((?:\s.*)?)$/);
  if (namDuiGaMatch) {
    const descriptor = namDuiGaMatch[1];
    const rest = (namDuiGaMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Nấm đùi gà`, display_subtitle: spec };
    // Note: some Nấm đùi gà have "Khay" or "Tươi" as descriptor but we simplify title
  }

  // ---- FRESH FOOD: Nấm kim châm ----
  const namKimMatch = name.match(/^Nấm kim châm\s+(Hàn Quốc|Gói)((?:\s.*)?)$/);
  if (namKimMatch) {
    const origin = namKimMatch[1];
    const rest = (namKimMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Nấm kim châm ${origin}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Bánh đa ----
  const banhDaMatch = name.match(/^Bánh đa\s+(Mè|Hải Phòng)((?:\s.*)?)$/);
  if (banhDaMatch) {
    const variant = banhDaMatch[1];
    const rest = (banhDaMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Bánh đa ${variant}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Bún tươi ----
  const bunTuoiMatch = name.match(/^Bún tươi\s+(Sợi to|Sợi nhỏ)((?:\s.*)?)$/);
  if (bunTuoiMatch) {
    const variant = bunTuoiMatch[1];
    const rest = (bunTuoiMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Bún tươi ${variant}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: Quýt ----
  const quytMatch = name.match(/^Quýt\s+(Đường)((?:\s.*)?)$/);
  if (quytMatch) {
    const variety = quytMatch[1];
    const rest = (quytMatch[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: `Quýt ${variety}`, display_subtitle: spec };
  }

  // ---- FRESH FOOD: other single-name produce ----
  const freshSingle = name.match(/^(Nấm đùi gà|Nấm kim châm|Bánh đa Mè|Bánh đa Hải Phòng|Bánh đa|Bún tươi)((?:\s.*)?)$/);
  if (freshSingle) {
    const prod = freshSingle[1];
    const rest = (freshSingle[2] || '').trim();
    const spec = parseFreshSpec(rest, unit);
    return { sku, display_title: prod, display_subtitle: spec };
  }

  // ---- FALLBACK for any unmatched items ----
  // Try to extract the most natural title
  // Remove quantity/size words at end
  let title = name;
  // Remove parenthesized weight
  title = title.replace(/\s*\(\d+(kg|g)\)\s*$/, '');
  // Remove trailing quantity patterns like "10 quả", "24 gói", "6 hộp", etc.
  title = title.replace(/\s+\d+\s+(quả|gói|hộp|lon|chai|cuộn)$/, '');
  // Remove trailing capacity like "65g", "500ml", "1L"
  title = title.replace(/\s+\d+(g|ml|kg|L)$/, '');
  // Remove leading "Gia vị " 
  title = title.replace(/^Gia vị\s+/, '');
  
  // Skip if nothing left
  if (!title || title === name) {
    title = name;
  }

  const spec = parseSpec('', unit);

  return { sku, display_title: title.trim(), display_subtitle: spec.trim() };
}

function normUnitKey(u) {
  return u.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/^"(.*)"$/, '$1');
}
function capitalizeUnit(u) {
  const map = { 'loc': 'Lốc', 'thung': 'Thùng', 'goi': 'Gói', 'chai': 'Chai', 'lon': 'Lon',
    'hu': 'Hũ', 'hop': 'Hộp', 'cuon': 'Cuộn', 'kg': 'Kg', 'con': 'Con', 'trai': 'Trái',
    'bich': 'Bịch', 'phan': 'Phần', 'chuc': 'Chục', 'vi': 'Vỉ', 'bo': 'Bó', 'khay': 'Khay',
    'cay': 'Cây' };
  const key = normUnitKey(u);
  return map[key] || u.charAt(0).toUpperCase() + u.slice(1);
}
function capitalizeUnitShort(u) {
  const map = { 'hop': 'Hộp', 'goi': 'Gói', 'lon': 'Lon', 'chai': 'Chai', 'cuon': 'Cuộn',
    'qua': 'Quả' };
  const key = normUnitKey(u);
  return map[key] || u.charAt(0).toUpperCase() + u.slice(1);
}

function parseSpec(rest, unit) {
  const r = (rest || '').trim();
  if (!r) return unit ? capitalizeUnit(unit) : '';

  // Handle patterns like "4 hộp", "24 gói", "24 lon", "12 chai", "30 gói", "10 cuộn", "6 hộp"
  const multiPackMatch = r.match(/^(\d+)\s+(hộp|gói|lon|chai|cuộn)$/);
  if (multiPackMatch) {
    const qty = multiPackMatch[1];
    const innerUnit = multiPackMatch[2];
    const displayUnit = capitalizeUnit(unit);
    return `${displayUnit} ${qty} ${innerUnit}`;
  }

  // Handle patterns like "10 quả"
  const qtyFruitMatch = r.match(/^(\d+)\s+(quả)$/);
  if (qtyFruitMatch) {
    const qty = qtyFruitMatch[1];
    const displayUnit = capitalizeUnit(unit);
    return `${displayUnit} ${qty} quả`;
  }

  // Handle capacity like "65g", "500ml", "1L", "400g", "100ml"
  const capMatch = r.match(/^(\d+(?:\.\d+)?)(g|ml|kg|L)$/);
  if (capMatch) {
    const cap = capMatch[1] + capMatch[2];
    if (unit === 'kg' || unit === 'chục' || unit === 'trái' || unit === 'con' || unit === 'phần' || unit === 'bó' || !unit) {
      if (unit === 'kg' || unit === 'chục' || unit === 'trái' || unit === 'con' || unit === 'phần' || unit === 'bó') {
        return cap;
      }
      return `${capitalizeUnit(unit)} ${cap}`;
    }
    return `${capitalizeUnit(unit)} ${cap}`;
  }

  // Check for parenthesized capacity like "(500g)", "(1kg)"
  const parenCapMatch = r.match(/^\((\d+(?:\.\d+)?)(g|kg)\)$/);
  if (parenCapMatch) {
    return parenCapMatch[1] + parenCapMatch[2];
  }

  // Handle "(500g)" variant
  if (r.match(/^\(\d+[gkg]+\)$/)) {
    return r.replace(/[()]/g, '');
  }

  // Handle "10 quả" further
  if (r.match(/^\d+\s+quả$/)) {
    const displayUnit = capitalizeUnit(unit);
    return `${displayUnit} ${r}`;
  }

  // For fresh food without explicit spec, use selling unit
  if (unit && ['kg', 'con', 'trái', 'phần', 'bó', 'chục', 'gói', 'khay', 'vỉ', 'trái'].includes(unit)) {
    return capitalizeUnit(unit);
  }

  // Default
  if (unit) return capitalizeUnit(unit);
  return r || '';
}

function parseFreshSpec(rest, unit) {
  if (!rest) {
    if (unit === 'kg') return '';
    return capitalizeUnit(unit);
  }

  // Clean parenthesized weight
  const parenMatch = rest.match(/^\((\d+(?:\.\d+)?)(g|kg)\)$/);
  if (parenMatch) {
    return parenMatch[1] + parenMatch[2];
  }

  // Extract quantity + fruit unit
  const qtyMatch = rest.match(/^(\d+)\s+(quả)$/);
  if (qtyMatch) {
    if (unit === 'chục' || unit === 'vỉ') {
      return `${capitalizeUnit(unit)}`;
    }
    return `${capitalizeUnit(unit)} ${qtyMatch[1]} quả`;
  }

  // Extract capacity
  const capMatch = rest.match(/^(\d+(?:\.\d+)?)(g|kg|ml|L)$/);
  if (capMatch) {
    const cap = capMatch[1] + capMatch[2];
    if (unit === 'kg' && capMatch[2] !== 'kg') {
      // e.g. 500g sold by kg → just show capacity
      return cap;
    }
    if (unit === 'khay' || unit === 'gói') {
      return `${capitalizeUnit(unit)} ${cap}`;
    }
    return cap;
  }

  // Handle grade+capacity like "Size vừa 500g"
  const gradeCapMatch = rest.match(/^(Size vừa|Size lớn|Size vừa lớn|Tầm trung|lớn|nhỏ)\s+(\d+(?:\.\d+)?(?:g|kg|ml|L))$/);
  if (gradeCapMatch) {
    return gradeCapMatch[2];
  }

  // Handle just grade
  if (rest.match(/^(Size vừa|Size lớn|Size vừa lớn|Tầm trung|lớn|nhỏ|lớn|nhỏ)$/)) {
    return capitalizeUnit(unit);
  }

  // Handle capacity at end like "500g"
  const trailingCap = rest.match(/(\d+(?:\.\d+)?(?:g|kg|ml|L))$/);
  if (trailingCap) {
    const cap = trailingCap[1];
    if (unit === 'khay' || unit === 'gói') {
      return `${capitalizeUnit(unit)} ${cap}`;
    }
    return cap;
  }

  // Fallback for fresh: use selling unit
  if (unit) return capitalizeUnit(unit);
  return rest;
}

// ---- Generate ----
const output = products.map(p => makeDisplay(p));

// Validate uniqueness
const seen = new Set();
const dupes = output.filter(o => {
  if (seen.has(o.sku)) return true;
  seen.add(o.sku);
  return false;
});
if (dupes.length > 0) {
  console.error('Duplicate SKUs found:', dupes.map(d => d.sku).join(', '));
  process.exit(1);
}

// Write output (minimal - just sku, display_title, display_subtitle)
const minimal = output.map(o => ({
  sku: o.sku,
  display_title: o.display_title,
  display_subtitle: o.display_subtitle
}));

fs.writeFileSync(outPath, JSON.stringify(minimal, null, 2), 'utf-8');
console.log(`Generated ${output.length} entries → ${outPath}`);
