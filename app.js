/* ===== API config (Cloudflare Pages frontend -> Apps Script JSON API backend) ===== */
var API_URL = 'https://script.google.com/macros/s/AKfycbwk_Zm5bTDLw0BRhN0qQ0unrCWOcBxhjF9xcyMK83INbcwx4l4bi9YJuY7qh2OJzbfE/exec'; // .../exec

function apiCall(action, payload){
  if(!payload){
    // Simple GET, no preflight
    return fetch(API_URL + '?action=' + encodeURIComponent(action))
      .then(function(r){ return r.json(); })
      .then(function(json){
        if(json && json.ok === false) throw new Error(json.error || 'API error');
        return json.data;
      });
  }
  // POST as text/plain to stay a "simple request" and avoid CORS preflight
  // (Apps Script web apps don't implement doOptions, so OPTIONS preflight fails)
  var body = JSON.stringify(Object.assign({action: action}, payload));
  return fetch(API_URL, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=utf-8'},
    body: body
  })
    .then(function(r){ return r.json(); })
    .then(function(json){
      if(json && json.ok === false) throw new Error(json.error || 'API error');
      return json.data;
    });
}

/* ===== Mobile browser guards: chặn long-press menu, double-tap zoom, select, drag ===== */
document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, false);
document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, false);
document.addEventListener('selectstart', function(e){ e.preventDefault(); }, false);
document.addEventListener('dragstart', function(e){ e.preventDefault(); }, false);

/* ===== Welcome → Main transition: detect Chrome iOS bar hide ===== */
(function(){
  var welcome = document.getElementById('welcomeScreen');
  var app = document.getElementById('app');
  if(!welcome || !app) return;

  var dismissed = false;
  var initialH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  var screenH = window.screen.height;
  var barHidden = initialH > screenH * 0.92;

  function lockBody(){
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
  }

  function showApp(){
    if(dismissed) return;
    dismissed = true;
    window.scrollTo(0, 0);
    welcome.style.display = 'none';
    app.classList.add('visible');
    lockBody();
    // Đảm bảo app phủ kín viewport mới
    app.style.minHeight = '100dvh';
  }

  // Nếu bar đã ẩn hoặc không phải Chrome iOS → hiện app ngay
  if(barHidden || !/CriOS/.test(navigator.userAgent)){
    setTimeout(showApp, 100);
    return;
  }

  // Phát hiện bar ẩn qua visualViewport resize
  function onResize(){
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if(h > initialH + 20) showApp();
  }
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', onResize);
  }
  window.addEventListener('resize', onResize);

  // Phát hiện qua body scroll
  window.addEventListener('scroll', function(){
    if(window.scrollY > 40){
      setTimeout(onResize, 100);
    }
  }, {passive: true});

  // Touch end: kiểm tra viewport sau khi thả tay
  welcome.addEventListener('touchend', function(){
    setTimeout(onResize, 200);
  }, {passive: true});

  // Click bất kỳ trên welcome
  welcome.addEventListener('click', function(){ showApp(); });

  // Fallback 5s
  setTimeout(showApp, 5000);
})();

/* ===== PWA: register service worker ===== */
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/service-worker.js').catch(function(){});
  });
}




/* ===== JsCore ===== */
function fmtShort(n){return Math.round(n).toLocaleString('vi-VN');}
function fmtCompact(n){
  if(n >= 1000000000){var v=n/1000000000;return(v%1===0?~~v:v.toFixed(1))+'B';}
  if(n >= 1000000){var v=n/1000000;return(v%1===0?~~v:v.toFixed(1))+'M';}
  if(n >= 1000){var v=n/1000;return(v%1===0?~~v:v.toFixed(1))+'K';}
  return n%1===0?String(n):n.toFixed(1).replace(/\.0$/,'');
}
function vibrate(){if(navigator.vibrate)navigator.vibrate(12);}

var PRODUCTS = [];
var ITEMS = [];
var MATCH_OK = 0.55;
var MATCH_LOW = 0.32;
var QTY_CONFIG = [];
var SALES_HISTORY = [];

var STATE = 'search';
var PREV_STATE = 'search';
var SEARCH_QUERY = '';
var SUGGESTIONS = [];
var SUGGEST_ACTIVE_IDX = 0;
var PENDING_PRODUCT = null;
var EDIT_IDX = -1;
var NUMPAD_QTY = '0';
var NUMPAD_DRAFT = '';
var SKIP_CLICK = false;

var ORDERS = [];
var ACTIVE_ORDER_INDEX = 0;
var NEXT_ORDER_ID = 1;

function createOrder(id) {
  return {id:id,items:[],searchQuery:'',pendingProduct:null};
}
function getActiveOrder(){return ORDERS[ACTIVE_ORDER_INDEX];}

var QTY_CONFIG_DEFAULT = [
  {keywords:['1 ký rưỡi','1000g rưỡi','1 cân rưỡi','một ký rưỡi','mot ki ruoi','mot can ruoi','1 ki ruoi','1 can ruoi'],value:1.5},
  {keywords:['2 ký rưỡi','2 cân rưỡi','hai ký rưỡi','hai cân rưỡi','2 ki ruoi','2 can ruoi'],value:2.5},
  {keywords:['3 ký rưỡi','3 cân rưỡi','ba ký rưỡi'],value:3.5},
  {keywords:['nửa ký','nửa cân','nua ki','nua can','0.5 kg','0.5kg','nửa kilo','nua kilo','mot nua ki','một nửa ký'],value:0.5},
  {keywords:['1 cặp','một cặp','mot cap','mot doi','một đôi','1 doi','1 đôi'],value:2},
  {keywords:['1 chục','một chục','mot chuc','1 chuc'],value:10},
  {keywords:['1 tá','một tá','mot ta','1 ta'],value:12},
  {keywords:['1 rổ','một rổ','mot ro','1 ro'],value:5},
  {keywords:['1 bó','một bó','mot bo','1 bo'],value:10},
  {keywords:['1 nắm','một nắm','mot nam','1 nam'],value:3},
  {keywords:['1 mớ','một mớ','mot mo','1 mo'],value:5},
  {keywords:['1 ít','một ít','mot it','1 it','it thoi'],value:0.3},
  {keywords:['thùng 24 lon','thùng 24','thung 24 lon','thung 24'],value:24},
  {keywords:['thùng 6 lon','lốc 6 lon','1 lốc','một lốc','loc 6 lon','mot loc','1 loc'],value:6},
  {keywords:['thùng 12 lon','thung 12 lon','thung 12'],value:12},
  {keywords:['1 thùng','một thùng','mot thung','1 thung'],value:24},
  {keywords:['1 chai','một chai','mot chai','1 trai','mot trai'],value:1},
  {keywords:['1 lon','một lon','mot lon'],value:1},
  {keywords:['1 gói','một gói','mot goi','1 goi'],value:1},
  {keywords:['1 hộp','một hộp','mot hop','1 hop'],value:1},
  {keywords:['1 bịch','một bịch','mot bich','1 bich'],value:1},
  {keywords:['1 túi','một túi','mot tui','1 tui'],value:1},
  {keywords:['1 bao','một bao','mot bao','1 bao'],value:1},
  {keywords:['1 quả','một quả','mot qua','1 qua','1 trái','một trái','mot trai','1 trai'],value:1},
  {keywords:['1 cái','một cái','mot cai','1 cai'],value:1},
  {keywords:['1 miếng','một miếng','mot mieng','1 mieng'],value:1},
  {keywords:['1 ổ','một ổ','mot o','1 o'],value:1},
  {keywords:['1 ly','một ly','mot ly','1 cốc','một cốc','mot coc','1 coc'],value:1},
  {keywords:['1 con','một con','mot con','1 con'],value:1},
  {keywords:['1 chiếc','một chiếc','mot chiec','1 chiec'],value:1},
  {keywords:['1 cây','một cây','mot cay','1 cay'],value:1},
  {keywords:['1 lít','một lít','mot lit','1 lit'],value:1},
  {keywords:['1 kg','1kg','một ký','mot ki','mot ky','1 ki','1 ky','1 cân','mot can','1 can'],value:1},
  {keywords:['2 kg','2kg','hai ký','hai ki','hai ky','2 ki','2 ky','2 cân','hai can','2 can'],value:2},
  {keywords:['3 kg','3kg','ba ký','ba ki','ba ky','3 ki','3 ky','3 cân','ba can','3 can'],value:3},
  {keywords:['4 kg','4kg','bốn ký','bon ki','bon ky','4 ki','4 ky','4 cân','bon can','4 can'],value:4},
  {keywords:['5 kg','5kg','năm ký','nam ki','nam ky','5 ki','5 ky','5 cân','nam can','5 can'],value:5},
  {keywords:['10 kg','10kg','mười ký','muoi ki','muoi ky','10 ki','10 ky','10 cân','muoi can','10 can'],value:10},
  {keywords:['nửa lon','nua lon','0.5 lon','mot nua lon'],value:0.5},
  {keywords:['nửa chai','nua chai','0.5 chai','mot nua chai'],value:0.5},
  {keywords:['nửa gói','nua goi','0.5 goi','mot nua goi'],value:0.5},
];
try{
  var saved=localStorage.getItem('pos_qty_config');
  QTY_CONFIG=saved?JSON.parse(saved):JSON.parse(JSON.stringify(QTY_CONFIG_DEFAULT));
}catch(e){QTY_CONFIG=JSON.parse(JSON.stringify(QTY_CONFIG_DEFAULT));}

var PHONETIC_INITIAL = {
  'tr':'CH','ch':'CH','s':'X','x':'X','gi':'Z','d':'Z','r':'Z','z':'Z',
  'đ':'D','v':'V','b':'V','l':'L','n':'N','ph':'F','f':'F','kh':'K','k':'K',
  'th':'T','t':'T','gh':'G','g':'G','ngh':'NG','ng':'NG','nh':'NH','qu':'Q'
};
var PHONETIC_RHYME = {
  'ă':'A','â':'A','a':'A','ê':'E','e':'E','ô':'O','o':'O','ơ':'O',
  'ư':'U','u':'U','i':'I','y':'I','ăn':'AN','ân':'AN','an':'AN',
  'ên':'EN','en':'EN','ôn':'ON','ơn':'ON','on':'ON','ưn':'UN','un':'UN',
  'in':'IN','yn':'IN','ăt':'AT','ât':'AT','at':'AT','êt':'ET','et':'ET',
  'ôt':'OT','ơt':'OT','ot':'OT','ưt':'UT','ut':'UT','it':'IT','yt':'IT',
  'ăng':'ANG','âng':'ANG','ang':'ANG','êng':'ENG','eng':'ENG',
  'ông':'ONG','ơng':'ONG','ong':'ONG','ưng':'UNG','ung':'UNG',
  'ing':'ING','yng':'ING','nh':'NH','n':'N','ch':'CH','c':'C','t':'T',
  'p':'P','ng':'NG'
};

function toPhoneticKey(text){
  if(!text)return '';
  var s=String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d')
    .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  var words=s.split(' '),result=[];
  for(var i=0;i<words.length;i++){
    var word=words[i];if(!word)continue;
    var initial='',rhyme=word;
    var two=word.substring(0,2),three=word.substring(0,3);
    if(PHONETIC_INITIAL[three]){initial=PHONETIC_INITIAL[three];rhyme=word.substring(3);}
    else if(PHONETIC_INITIAL[two]){initial=PHONETIC_INITIAL[two];rhyme=word.substring(2);}
    else if(PHONETIC_INITIAL[word[0]]){initial=PHONETIC_INITIAL[word[0]];rhyme=word.substring(1);}
    else{initial=word[0].toUpperCase();rhyme=word.substring(1);}
    var pr=rhyme;
    for(var len=Math.min(rhyme.length,4);len>=1;len--){
      var sub=rhyme.substring(0,len);
      if(PHONETIC_RHYME[sub]){pr=PHONETIC_RHYME[sub]+rhyme.substring(len);break;}
    }
    result.push(initial+pr.toUpperCase());
  }
  return result.join(' ');
}

function normalizeVN(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/đ/g,'d').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function levenshtein(a,b){
  var m=a.length,n=b.length;
  if(m===0)return n;if(n===0)return m;
  var dp=[];
  for(var i=0;i<=m;i++){dp.push([i]);}
  for(var j=0;j<=n;j++){dp[0][j]=j;}
  for(i=1;i<=m;i++){
    for(j=1;j<=n;j++){
      if(a[i-1]===b[j-1])dp[i][j]=dp[i-1][j-1];
      else dp[i][j]=1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function levRatio(a,b){
  var maxLen=Math.max(a.length,b.length,1);
  return 1-levenshtein(a,b)/maxLen;
}

function firstCharRatio(a,b){
  var wa=a.split(' ').filter(Boolean),wb=b.split(' ').filter(Boolean);
  var n=Math.min(wa.length,wb.length);
  if(n===0)return 0;
  var match=0;
  for(var i=0;i<n;i++){if(wa[i][0]===wb[i][0])match++;}
  return match/Math.max(wa.length,wb.length,1);
}

function combinedScore(a,b){return 0.5*levRatio(a,b)+0.5*firstCharRatio(a,b);}

function phoneticScore(a,b){
  var pa=toPhoneticKey(a),pb=toPhoneticKey(b);
  if(pa===pb)return 1.0;
  var maxLen=Math.max(pa.length,pb.length,1);
  return 1-levenshtein(pa,pb)/maxLen;
}

function abbreviationScore(query,productWords){
  var qWords=normalizeVN(query).split(' ').filter(Boolean);
  var pWords=productWords||[];
  var pInitials=pWords.map(function(w){return w[0];}).join('');
  var qJoined=qWords.join('');
  if(pInitials===qJoined)return 0.9;
  if(levRatio(pInitials,qJoined)>0.8)return 0.7;
  return 0;
}

function matchProductTop3(phrase){
  var pn=normalizeVN(phrase);
  var scored=[];
  PRODUCTS.forEach(function(p){
    var candidates=[normalizeVN(p.name)].concat((p.keywords||[]).map(normalizeVN));
    var pWords=normalizeVN(p.name).split(' ').filter(Boolean);
    var pScore=0,matchType='';
    candidates.forEach(function(c){
      var s=combinedScore(pn,c);
      if(pn===c||c.indexOf(pn)!==-1||pn.indexOf(c)!==-1){s=Math.max(s,0.95);}
      var ps=phoneticScore(pn,c);
      if(ps>0.85){s=Math.max(s,ps*0.9+0.1);}
      if(s>pScore){pScore=s;matchType='lev';}
    });
    var abbrScore=abbreviationScore(pn,pWords);
    if(abbrScore>pScore){pScore=abbrScore;matchType='abbr';}
    var phoneticKeyScore=phoneticScore(pn,p.name);
    if(phoneticKeyScore>pScore){pScore=phoneticKeyScore;matchType='phonetic';}
    scored.push({product:p,score:pScore,matchType:matchType});
  });
  scored.sort(function(a,b){return b.score-a.score;});
  return scored.slice(0,8);
}

var UNIT_WORDS=['kg','kí','ký','ki','cân','can','g','gam','gr','lon','chai','gói','goi','hộp','hop','túi','tui',
  'quả','qua','trái','trai','ly','cốc','coc','ổ','o','miếng','mieng','cái','cai',
  'bao','cây','cay','thùng','thung','lít','lit','chiếc','chiec','con','bịch','bich',
  'cặp','cap','doi','đôi','chục','chuc','tá','ta','ro','rổ','bó','bo','nắm','nam',
  'mớ','mo','ít','it','lốc','loc'];
var DISCRETE_UNITS=['lon','chai','goi','hop','tui','qua','trai','ly','coc','o',
  'mieng','cai','bao','cay','thung','chiec','con','bich','cap','doi','chuc','ta','ro','bo','nam','mo','loc'];

function isWeightItem(item){
  var u=normalizeVN(item.unit||'');
  if(!u)return true;
  return DISCRETE_UNITS.indexOf(u)===-1;
}

function normalizeDecimalWords(text){
  var t=text;
  t=t.replace(/(\d+)\s+phẩy\s+(\d)/gi,'$1.$2');
  t=t.replace(/(\d+)\s+chấm\s+(\d)/gi,'$1.$2');
  t=t.replace(/(\d+)\s+phay\s+(\d)/gi,'$1.$2');
  t=t.replace(/(\d+)\s+cham\s+(\d)/gi,'$1.$2');
  t=t.replace(/không\s+phẩy\s+(\d)/gi,'0.$1');
  t=t.replace(/khong\s+phay\s+(\d)/gi,'0.$1');
  return t;
}

function normalizeKgDecimal(text){
  var t=text;
  var kgUnits='ký|ký|ki|kg|cân|can|kilo';
  t=t.replace(new RegExp('(\\d+)\\s*('+kgUnits+')\\s+(\\d)(?!\\d)','gi'),
    function(_,whole,_u,frac){return whole+'.'+frac+' kg';});
  t=t.replace(new RegExp('(\\d+)('+kgUnits+')(\\d)(?!\\d)','gi'),
    function(_,whole,_u,frac){return whole+'.'+frac+' kg';});
  return t;
}

function normalizeLang(text){
  var t=text;
  t=t.replace(/(\d+)\s*lạng/gi,function(_,n){return (parseInt(n)/10)+' kg';});
  t=t.replace(/(\d+)\s*lang/gi,function(_,n){return (parseInt(n)/10)+' kg';});
  return t;
}

function normalizeGram(text){
  var t=text;
  t=t.replace(/(\d+)\s*gram/gi,function(_,n){return (parseInt(n)/1000)+' kg';});
  t=t.replace(/(\d+)\s*gam/gi,function(_,n){return (parseInt(n)/1000)+' kg';});
  return t;
}

function trySpecialQtyPatterns(text){
  var normalized=normalizeVN(text);
  for(var i=0;i<QTY_CONFIG.length;i++){
    var cfg=QTY_CONFIG[i];
    for(var j=0;j<cfg.keywords.length;j++){
      var kw=normalizeVN(cfg.keywords[j]);
      if(normalized.indexOf(kw)!==-1){
        var remaining=normalized.replace(kw,'').trim();
        return {qty:cfg.value,remaining:remaining,matched:cfg.keywords[j]};
      }
    }
  }
  return null;
}

function extractNumberAndUnit(text){
  var unitGroup=UNIT_WORDS.join('|');
  var reKgShortcut=new RegExp('^(\\d+(?:\\.\\d+)?)\\s*(can|cân|kg|ký|kí)\\s+(\\d)\\s+(.+)$','i');
  var mShortcut=text.match(reKgShortcut);
  if(mShortcut){return {qty:parseFloat(mShortcut[1]+'.'+mShortcut[3]),unit:mShortcut[2]||'kg',phrase:mShortcut[4].trim()};}
  var reLead=new RegExp('^(\\d+(?:\\.\\d+)?)\\s*('+unitGroup+')?\\s+(.+)$','i');
  var m=text.match(reLead);
  if(m){return {qty:parseFloat(m[1]),unit:m[2]||'',phrase:m[3].trim()};}
  var reTrail=new RegExp('^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*('+unitGroup+')?\\s*$','i');
  var m2=text.match(reTrail);
  if(m2){return {qty:parseFloat(m2[2]),unit:m2[3]||'',phrase:m2[1].trim()};}
  var reNumOnly=new RegExp('^(\\d+(?:\\.\\d+)?)\\s+(.+)$','i');
  var m3=text.match(reNumOnly);
  if(m3){return {qty:parseFloat(m3[1]),unit:'',phrase:m3[2].trim()};}
  var reNumEnd=new RegExp('^(.+?)\\s+(\\d+(?:\\.\\d+)?)$','i');
  var m4=text.match(reNumEnd);
  if(m4){return {qty:parseFloat(m4[2]),unit:'',phrase:m4[1].trim()};}
  return null;
}

function parseSegment(segment){
  var seg=segment.trim();if(!seg)return null;
  var raw=seg;
  seg=normalizeDecimalWords(seg);
  seg=normalizeKgDecimal(seg);
  seg=normalizeLang(seg);
  seg=normalizeGram(seg);
  var special=trySpecialQtyPatterns(seg);
  if(special){return {qty:special.qty,phrase:special.remaining,raw:raw,unit:'',special:special.matched};}
  var extracted=extractNumberAndUnit(seg);
  if(extracted){return {qty:extracted.qty,phrase:extracted.phrase,raw:raw,unit:extracted.unit,special:null};}
  return {qty:1,phrase:seg,raw:raw,unit:'',special:null};
}

function stripPrefix(text){
  var PREFIXES=['tính tổng tiền','tính tiền','tổng hóa đơn','tính hóa đơn','lập hóa đơn',
    'tạo hóa đơn','làm hóa đơn','thanh toán giúp','thanh toán','cho tôi','giúp tôi'];
  var t=text.trim();var lower=normalizeVN(t);
  for(var i=0;i<PREFIXES.length;i++){
    var pNorm=normalizeVN(PREFIXES[i]);
    if(lower.indexOf(pNorm)===0){
      var wordsCount=PREFIXES[i].split(' ').length;
      var words=t.split(/\s+/);
      t=words.slice(wordsCount).join(' ');break;
    }
  }
  return t.trim();
}

function processTranscript(text){
  var cleaned=stripPrefix(text);
  var segments=cleaned.split(/,|;| và /i).map(function(s){return s.trim();}).filter(Boolean);
  if(segments.length===0)return 0;
  var added=0;
  segments.forEach(function(seg){
    var parsed=parseSegment(seg);
    if(!parsed)return;
    var top3=matchProductTop3(parsed.phrase);
    if(!top3||top3.length===0||!top3[0].product)return;
    ITEMS.push({
      spokenText:parsed.raw,
      top3:top3,
      selectedIdx:0,
      qty:parsed.qty,
      price:top3[0].product.price,
      total:Math.round(parsed.qty*top3[0].product.price),
      unit:parsed.unit||'',
      special:parsed.special
    });
    added++;
  });
  return added;
}

/* ===== JsOrder ===== */
function updateTotal(){
  var active = ITEMS.filter(function(it){ return !it._deleted; });
  var total = active.reduce(function(s, it){ return s + it.total; }, 0);
  var count = active.length;
  var countEl = document.querySelector('.header-count');
  var totalEl = document.querySelector('.header-total');
  if(countEl) countEl.textContent = count + ' món';
  if(totalEl) totalEl.textContent = fmtShort(total);
}

function renderCart(){
  var cartItems = document.getElementById('cartItems');
  var holdList = document.getElementById('holdList');
  var cartEmpty = document.getElementById('cartEmpty');

  if(ITEMS.length === 0){
    // Cart empty → show Hold Orders in cart area
    cartItems.style.display = 'none';
    holdList.style.display = 'block';
    cartEmpty.style.display = 'none';
    renderHoldOrders();
    updateTotal();
    return;
  }

  // Cart has items
  cartItems.style.display = 'block';
  holdList.style.display = 'none';
  cartEmpty.style.display = 'none';

  var html = '';
  for(var i = 0; i < ITEMS.length; i++){
    var item = ITEMS[i];
    var prod = item.top3[item.selectedIdx].product;
    var isActive = !item._deleted && i === EDIT_IDX;
    var qtyStr = item.unit === 'kg' || item.unit === 'ký' ? fmtCompact(item.qty)+'kg' : '×'+fmtCompact(item.qty);
    html += '<div class="cart-row'+(isActive?' active':'')+(item._deleted?' ghost':'')+'" data-idx="'+i+'" onclick="onCartRowTap('+i+')">';
    html += '<span class="indicator">'+(isActive?'▶':'')+'</span>';
    html += '<span class="name'+(item._deleted?' strikethrough':'')+'">'+prod.name+'</span>';
    html += '<span class="qty">'+qtyStr+'</span>';
    html += '<span class="price">'+fmtCompact(item.total)+'</span>';
    html += '</div>';
  }
  cartItems.innerHTML = html;
  updateTotal();
}

function renderHoldOrders(){
  var holdList = document.getElementById('holdList');
  var html = '';
  var first = true;
  for(var i = 0; i < ORDERS.length; i++){
    var ord = ORDERS[i];
    if(i === ACTIVE_ORDER_INDEX) continue;
    var items = ord.items||[];
    if(items.length === 0) continue;
    var total = items.reduce(function(s, it){ return s + (it.total||0); }, 0);
    html += '<div class="hold-row" onclick="onHoldRestore('+i+')">';
    html += '<span class="indicator">'+(first?'▶':'')+'</span>';
    html += '<span class="name">Hold #'+ord.id+'</span>';
    html += '<span class="total">'+fmtShort(total)+'</span>';
    html += '</div>';
    first = false;
  }
  holdList.innerHTML = html;
}

function onHoldRestore(idx){
  vibrate();
  saveCurrentOrderState();
  ACTIVE_ORDER_INDEX = idx;
  restoreCurrentOrderState();
  SEARCH_QUERY = '';
  PENDING_PRODUCT = null;
  EDIT_IDX = -1;
  SUGGEST_ACTIVE_IDX = 0;
  setParser('search');
  renderCart();
  renderCommand();
  liveSearch();
  updateHoldHeader();
}

function addToCartDirect(product, qty, unit){
  var foundIdx = -1;
  for(var i = 0; i < ITEMS.length; i++){
    if(!ITEMS[i]._deleted && ITEMS[i].top3[0].product.code === product.code){
      foundIdx = i;
      break;
    }
  }
  if(foundIdx >= 0){
    var existing = ITEMS[foundIdx];
    var newQty = Math.round((existing.qty + qty) * 100) / 100;
    existing.qty = newQty;
    existing.total = Math.round(newQty * existing.price);
  } else {
    ITEMS.push({
      spokenText: product.name + ' ' + qty + unit,
      top3: [{product: product, score: 1.0}],
      selectedIdx: 0,
      qty: qty,
      price: product.price,
      total: Math.round(qty * product.price),
      unit: unit,
      special: null
    });
  }
  var hlIdx = foundIdx >= 0 ? foundIdx : ITEMS.length - 1;
  SALES_HISTORY.unshift({code: product.code, name: product.name, timestamp: Date.now()});
  if(SALES_HISTORY.length > 50) SALES_HISTORY.length = 50;
  EDIT_IDX = hlIdx;
  renderCart();
  updateTotal();
}

function deleteCartItem(idx){
  vibrate();
  var target = ITEMS[idx];
  if(!target || target._deleted) return;
  // Immediately finalize any existing ghost items (previous swipe)
  for(var i = ITEMS.length - 1; i >= 0; i--){
    if(ITEMS[i]._deleted){
      clearTimeout(ITEMS[i]._timer);
      ITEMS.splice(i, 1);
    }
  }
  if(EDIT_IDX >= ITEMS.length){EDIT_IDX = -1;PENDING_PRODUCT = null;}
  // Find target in updated array
  var newIdx = ITEMS.indexOf(target);
  if(newIdx < 0) return;
  target = ITEMS[newIdx];
  target._deleted = true;
  target._deletedAt = Date.now();
  renderCart();
  target._timer = setTimeout(function(){
    var pos = ITEMS.indexOf(target);
    if(pos >= 0){
      ITEMS.splice(pos, 1);
      if(EDIT_IDX >= ITEMS.length){EDIT_IDX = -1;PENDING_PRODUCT = null;}
    }
    renderCart();
    updateTotal();
  }, 3000);
}

function onCartRowTap(idx){
  if(SKIP_CLICK){ SKIP_CLICK = false; return; }
  vibrate();
  var item = ITEMS[idx];
  if(!item) return;
  if(item._deleted){
    clearTimeout(item._timer);
    delete item._deleted;
    delete item._deletedAt;
    delete item._timer;
    EDIT_IDX = idx;
    renderCart();
    return;
  }
  if(STATE === 'qty'){
    if(EDIT_IDX === idx){
      goToPrevState();
    } else {
      EDIT_IDX = idx;
      var item = ITEMS[idx];
      var prod = item.top3[item.selectedIdx].product;
      PENDING_PRODUCT = {product: prod, qty: item.qty, unit: item.unit || 'đv'};
      NUMPAD_DRAFT = '';
      NUMPAD_QTY = String(item.qty);
      updateQtyCommand();
      renderCart();
    }
  } else {
    EDIT_IDX = idx;
    SUGGEST_ACTIVE_IDX = -1;
    updateActiveSuggestion();
    var item = ITEMS[idx];
    var prod = item.top3[item.selectedIdx].product;
    PENDING_PRODUCT = {product: prod, qty: item.qty, unit: item.unit || 'đv'};
    NUMPAD_DRAFT = '';
    NUMPAD_QTY = String(item.qty);
    updateQtyCommand();
    setParser('qty');
    updateActiveSuggestion();
    renderCart();
  }
}

// Long-press-to-delete on cart rows (500ms)
(function(){
  var timer = null, target = null;
  var container = document.getElementById('cartItems');
  container.addEventListener('touchstart', function(e){
    var row = e.target.closest('.cart-row');
    if(!row || row.classList.contains('ghost')) return;
    var idx = parseInt(row.getAttribute('data-idx'));
    if(isNaN(idx)) return;
    target = row;
    timer = setTimeout(function(){
      SKIP_CLICK = true;
      timer = null;
      deleteCartItem(idx);
    }, 500);
  }, {passive: true});
  container.addEventListener('touchmove', function(){
    if(timer){ clearTimeout(timer); timer = null; }
  }, {passive: true});
  container.addEventListener('touchend', function(){
    if(timer){ clearTimeout(timer); timer = null; }
  }, {passive: true});
})();

function saveCurrentOrderState(){
  var order = getActiveOrder();
  if(!order)return;
  order.items = ITEMS;
  order.searchQuery = SEARCH_QUERY;
  order.pendingProduct = PENDING_PRODUCT;
}

function restoreCurrentOrderState(){
  var order = getActiveOrder();
  if(!order)return;
  ITEMS = order.items||[];
  SEARCH_QUERY = order.searchQuery||'';
  PENDING_PRODUCT = order.pendingProduct||null;
}

function updateHoldHeader(){
  var prevEl=document.getElementById('holdPrev');
  var nextEl=document.getElementById('holdNext');
  if(prevEl)prevEl.classList.toggle('disabled',ORDERS.length<=1);
  if(nextEl)nextEl.classList.toggle('disabled',ORDERS.length<=1);
}

function onHoldAction(ev){
  if(ev)ev.stopPropagation();
  vibrate();
  if(ITEMS.length===0)return;
  saveCurrentOrderState();
  var newOrder=createOrder(++NEXT_ORDER_ID);
  ORDERS.push(newOrder);
  if(ORDERS.length > 11){
    ORDERS.splice(0, 1);
    ACTIVE_ORDER_INDEX = ORDERS.length - 1;
  } else {
    ACTIVE_ORDER_INDEX = ORDERS.length - 1;
  }
  restoreCurrentOrderState();
  PENDING_PRODUCT=null;
  EDIT_IDX=-1;
  SEARCH_QUERY='';
  SUGGEST_ACTIVE_IDX = 0;
  setParser('search');
  renderCart();
  updateTotal();
  renderCommand();
  liveSearch();
  updateHoldHeader();
}

function onHoldPrev(ev){
  if(ev)ev.stopPropagation();
  if(ORDERS.length<=1)return;
  vibrate();
  saveCurrentOrderState();
  ACTIVE_ORDER_INDEX=(ACTIVE_ORDER_INDEX-1+ORDERS.length)%ORDERS.length;
  restoreCurrentOrderState();
  SEARCH_QUERY='';
  PENDING_PRODUCT=null;
  EDIT_IDX=-1;
  SUGGEST_ACTIVE_IDX = 0;
  setParser('search');
  renderCart();
  updateTotal();
  renderCommand();
  liveSearch();
  updateHoldHeader();
}

function onHoldNext(ev){
  if(ev)ev.stopPropagation();
  if(ORDERS.length<=1)return;
  vibrate();
  saveCurrentOrderState();
  ACTIVE_ORDER_INDEX=(ACTIVE_ORDER_INDEX+1)%ORDERS.length;
  restoreCurrentOrderState();
  SEARCH_QUERY='';
  PENDING_PRODUCT=null;
  EDIT_IDX=-1;
  SUGGEST_ACTIVE_IDX = 0;
  setParser('search');
  renderCart();
  updateTotal();
  renderCommand();
  liveSearch();
  updateHoldHeader();
}

/* ===== JsQtyEdit ===== */
function updateQtyCommand(){
  var display = NUMPAD_DRAFT || NUMPAD_QTY || '0';
  document.getElementById('filterContent').textContent = display;
}

function onQtyClear(){
  vibrate();
  NUMPAD_DRAFT = '';
  updateQtyCommand();
}

function onNumpadKey(k){
  vibrate();
  if(k === 'del'){
    NUMPAD_DRAFT = NUMPAD_DRAFT.slice(0, -1);
  } else if(k === '.'){
    if(!NUMPAD_DRAFT.includes('.')){
      NUMPAD_DRAFT += NUMPAD_DRAFT ? '.' : '0.';
    }
  } else {
    NUMPAD_DRAFT += k;
  }
  updateQtyCommand();
}

function onQuickQty(qty){
  vibrate();
  NUMPAD_DRAFT = String(qty);
  updateQtyCommand();
  onNumpadCommit();
}

function onNumpadCommit(){
  vibrate();
  var qty = parseFloat(NUMPAD_DRAFT) || parseFloat(NUMPAD_QTY) || 1;
  if(EDIT_IDX >= 0){
    var item = ITEMS[EDIT_IDX];
    item.qty = qty;
    item.total = Math.round(qty * item.price);
    PENDING_PRODUCT = null;
    renderCart();
    updateTotal();
  } else if(PENDING_PRODUCT){
    addToCartDirect(PENDING_PRODUCT.product, qty, PENDING_PRODUCT.unit || 'đv');
    PENDING_PRODUCT = null;
  } else {
    return;
  }
  SEARCH_QUERY = '';
  NUMPAD_DRAFT = '';
  NUMPAD_QTY = '0';
  SUGGEST_ACTIVE_IDX = 0;
  setParser('search');
  renderCommand();
  liveSearch();
}

/* ===== JsPayment ===== */
var PAY_CASH = {};
var PAY_DRAFT = 0;
var PAY_EXTRA = 0;
var PAY_NUMPAD_MODE = false;

function initPayMode(){
  PAY_CASH = {500000:0, 200000:0, 100000:0, 50000:0, 20000:0, 10000:0, 5000:0, 2000:0, 1000:0};
  PAY_DRAFT = 0;
  PAY_EXTRA = 0;
  PAY_NUMPAD_MODE = false;
  renderChipCounters();
  updatePayDisplay();
}

function renderChipCounters(){
  var container = document.getElementById('payChips');
  var denoms = [
    {key:500000, label:'500K'},
    {key:200000, label:'200K'},
    {key:100000, label:'100K'},
    {key:50000, label:'50K'},
    {key:20000, label:'20K'},
    {key:10000, label:'10K'},
    {key:5000, label:'5K'},
    {key:2000, label:'2K'},
    {key:1000, label:'1K'}
  ];
  var html = '';
  for(var i = 0; i < denoms.length; i++){
    var d = denoms[i];
    var count = PAY_CASH[d.key] || 0;
    html += '<div class="chip'+(count > 0 ? ' has-count' : '')+'" onclick="onChipTap('+d.key+')">';
    html += d.label;
    if(count > 0) html += '<span class="count">×'+count+'</span>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function onChipTap(denom){
  vibrate();
  if(PAY_NUMPAD_MODE){
    PAY_DRAFT = 0;
    PAY_EXTRA = 0;
    PAY_NUMPAD_MODE = false;
  }
  PAY_CASH[denom] = (PAY_CASH[denom] || 0) + 1;
  renderChipCounters();
  updatePayDisplay();
}

function payCashAmount(){
  var amt = 0;
  for(var d in PAY_CASH){
    amt += parseFloat(d) * PAY_CASH[d];
  }
  return amt + PAY_DRAFT * 1000 + PAY_EXTRA;
}

function updatePayDisplay(){
  var total = ITEMS.reduce(function(s, it){ return s + it.total; }, 0);
  var cash = payCashAmount();
  var change = cash - total;
  var changeEl = document.getElementById('payChange');
  var changeLabel = document.querySelector('.change .change-label');
  var fc = document.getElementById('filterContent');

  if(fc) fc.textContent = cash ? fmtShort(cash) : '';
  if(changeLabel) changeLabel.textContent = change >= 0 ? 'Tiền thối' : 'Còn thiếu';
  if(changeEl){
    changeEl.textContent = fmtShort(Math.abs(change));
    changeEl.className = 'change-value' + (change < 0 ? ' negative' : '');
  }
}

function onPayKey(k){
  vibrate();
  for(var d in PAY_CASH) PAY_CASH[d] = 0;
  PAY_EXTRA = 0;
  var digit = parseInt(k);
  if(!PAY_NUMPAD_MODE){
    PAY_DRAFT = digit;
    PAY_NUMPAD_MODE = true;
  } else {
    PAY_DRAFT = PAY_DRAFT * 10 + digit;
  }
  renderChipCounters();
  updatePayDisplay();
}

function onPayBackspace(){
  vibrate();
  if(PAY_NUMPAD_MODE){
    PAY_DRAFT = Math.floor(PAY_DRAFT / 10);
    updatePayDisplay();
  }
}

function onPay500(){
  vibrate();
  PAY_EXTRA += 500;
  updatePayDisplay();
}

function onExactCash(){
  vibrate();
  for(var d in PAY_CASH) PAY_CASH[d] = 0;
  PAY_DRAFT = 0;
  PAY_EXTRA = 0;
  PAY_NUMPAD_MODE = false;
  var total = ITEMS.reduce(function(s, it){ return s + it.total; }, 0);
  var remaining = total;
  var denoms = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];
  for(var i = 0; i < denoms.length && remaining >= 1000; i++){
    var d = denoms[i];
    var count = Math.floor(remaining / d);
    if(count > 0){ PAY_CASH[d] = count; remaining -= d * count; }
  }
  if(remaining > 0) PAY_EXTRA = remaining;
  renderChipCounters();
  updatePayDisplay();
}

function onPayDone(){
  vibrate();
  var total = ITEMS.reduce(function(s, it){ return s + it.total; }, 0);
  var received = payCashAmount();
  var change = received - total;
  if(change < 0){
    flashOwnerError('Chưa đủ tiền');
    return;
  }
  if(received === 0){
    flashOwnerError('Chưa nhập tiền');
    return;
  }
  saveInvoiceBtn();
}

function onResetCash(){
  vibrate();
  for(var d in PAY_CASH) PAY_CASH[d] = 0;
  PAY_DRAFT = 0;
  PAY_EXTRA = 0;
  PAY_NUMPAD_MODE = false;
  renderChipCounters();
  updatePayDisplay();
}

/* ===== JsVoice ===== */
var recognition = null;
var SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
var VOICE_ACTIVE = false;
var VOICE_DONE = false;

function initSpeechRecognition(){
  if(!SpeechRecognitionImpl) return;
  recognition = new SpeechRecognitionImpl();
  recognition.lang = 'vi-VN';
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = function(){
    VOICE_ACTIVE = true;
    VOICE_DONE = false;
    renderCommand();
  };

  recognition.onresult = function(event){
    var interim = '', final = '';
    for(var i = event.resultIndex; i < event.results.length; i++){
      if(event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    if(final.trim()){
      VOICE_DONE = true;
      SEARCH_QUERY = final.trim();
      renderCommand();
      liveSearch();
    }
  };

  recognition.onerror = function(event){
    if(event.error !== 'no-speech'){
      VOICE_ACTIVE = false;
      renderCommand();
    }
  };

  recognition.onend = function(){
    VOICE_ACTIVE = false;
    VOICE_DONE = false;
    renderCommand();
    if(SEARCH_QUERY) liveSearch();
  };
}

function startVoiceInput(){
  vibrate();
  if(STATE !== 'search' || SEARCH_QUERY.trim()){
    flashOwnerError('Chỉ dùng khi ô trống');
    return;
  }
  if(VOICE_ACTIVE) return;
  if(!recognition){
    flashOwnerError('Trình duyệt không hỗ trợ giọng nói');
    return;
  }
  try{
    recognition.start();
  }catch(e){
    flashOwnerError('Lỗi mic');
  }
}

/* ===== JsSearch ===== */
function renderCommand(){
  var fc = document.getElementById('filterContent');
  if (VOICE_ACTIVE && !VOICE_DONE) {
    fc.innerHTML = 'Đang nghe<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>';
  } else {
    fc.textContent = SEARCH_QUERY || '';
  }
}

function renderSuggestions(results){
  SUGGESTIONS = results || [];
  SUGGEST_ACTIVE_IDX = 0;
  var max = 8;
  for(var i = 0; i < max; i++){
    var el = document.getElementById('suggest'+i);
    if(!el) continue;
    var nameEl = document.getElementById('s'+i+'name');
    var priceEl = document.getElementById('s'+i+'price');
    if(SUGGESTIONS && SUGGESTIONS[i]){
      nameEl.textContent = SUGGESTIONS[i].product.name;
      priceEl.textContent = fmtShort(SUGGESTIONS[i].product.price);
    }
  }
  updateActiveSuggestion();
}

function updateActiveSuggestion(){
  var max = 8;
  var focusIdx = SUGGEST_ACTIVE_IDX;
  var isQty = document.body.getAttribute('data-parser') === 'qty';
  for(var i = 0; i < max; i++){
    var el = document.getElementById('suggest'+i);
    if(!el) continue;
    if(SUGGESTIONS && SUGGESTIONS[i]){
      if(isQty){
        if(i === focusIdx && focusIdx >= 0){
          el.style.display = 'grid';
          el.classList.add('active');
          var ind = el.querySelector('.indicator');
          if(ind) ind.textContent = '▶';
        } else {
          el.style.display = 'none';
          var ind = el.querySelector('.indicator');
          if(ind) ind.textContent = '';
        }
      } else {
        el.style.display = 'grid';
        el.classList.toggle('active', i === focusIdx && focusIdx >= 0);
        var ind = el.querySelector('.indicator');
        if(ind) ind.textContent = i === focusIdx && focusIdx >= 0 ? '▶' : '';
      }
    } else {
      el.style.display = 'none';
    }
  }
}

function getRecentProducts(limit){
  limit = limit || 8;
  var seen = {};
  var result = [];
  for(var i = 0; i < SALES_HISTORY.length && result.length < limit; i++){
    var code = SALES_HISTORY[i].code;
    if(!seen[code]){
      var prod = PRODUCTS.filter(function(p){ return p.code === code; })[0];
      if(prod){
        seen[code] = true;
        result.push({product: prod, score: 1.0, matchType: 'recent'});
      }
    }
  }
  for(var i = 0; i < PRODUCTS.length && result.length < limit; i++){
    var code = PRODUCTS[i].code;
    if(!seen[code]){
      seen[code] = true;
      result.push({product: PRODUCTS[i], score: 0.8, matchType: 'top'});
    }
  }
  return result;
}

function liveSearch(){
  if(VOICE_ACTIVE && !VOICE_DONE){
    renderSuggestions([]);
    return;
  }
  if(!SEARCH_QUERY.trim()){
    var recent = getRecentProducts(8);
    if(recent.length > 0){
      PENDING_PRODUCT = {product: recent[0].product, qty: 1, unit: 'đv'};
    } else {
      PENDING_PRODUCT = null;
    }
    renderSuggestions(recent);
    return;
  }
  var parsed = parseSegment(SEARCH_QUERY);
  var searchPhrase = parsed ? parsed.phrase : SEARCH_QUERY;
  var qty = parsed && parsed.qty > 0 ? parsed.qty : 1;
  var results = matchProductTop3(searchPhrase);
  if(results && results.length > 0){
    PENDING_PRODUCT = {product: results[0].product, qty: qty, unit: 'đv'};
  } else {
    PENDING_PRODUCT = null;
  }
  renderSuggestions(results);
}

function onSearchKey(c){
  vibrate();
  if(STATE !== 'search') return;
  if(VOICE_ACTIVE){
    VOICE_ACTIVE = false;
    VOICE_DONE = false;
    if(recognition) recognition.stop();
  }
  SEARCH_QUERY += c;
  renderCommand();
  liveSearch();
}

function onBackspace(){
  vibrate();
  if(STATE === 'qty'){
    onNumpadKey('del');
    return;
  }
  if(STATE === 'pay'){
    onPayBackspace();
    return;
  }
  if(STATE !== 'search') return;
  if(VOICE_ACTIVE){
    VOICE_ACTIVE = false;
    VOICE_DONE = false;
    if(recognition) recognition.stop();
  }
  if(SEARCH_QUERY.length > 0){
    SEARCH_QUERY = SEARCH_QUERY.slice(0, -1);
    renderCommand();
    liveSearch();
  }
}

function onClearSearch(){
  vibrate();
  SEARCH_QUERY = '';
  PENDING_PRODUCT = null;
  renderCommand();
  liveSearch();
}

var SUGGEST_LAST_TAP = 0;

function onSuggestionTap(idx){
  vibrate();
  if(!SUGGESTIONS || !SUGGESTIONS[idx]) return;
  EDIT_IDX = -1;
  renderCart();
  var now = Date.now();
  if(now - SUGGEST_LAST_TAP < 300 && SUGGEST_ACTIVE_IDX === idx){
    SUGGEST_LAST_TAP = 0;
    var sug = SUGGESTIONS[idx];
    PENDING_PRODUCT = {product: sug.product, qty: 1, unit: 'đv'};
    NUMPAD_DRAFT = '';
    NUMPAD_QTY = '1';
    updateQtyCommand();
    setParser('qty');
    updateActiveSuggestion();
    return;
  }
  SUGGEST_LAST_TAP = now;
  SUGGEST_ACTIVE_IDX = idx;
  updateActiveSuggestion();
  PENDING_PRODUCT = {product: SUGGESTIONS[idx].product, qty: 1, unit: 'đv'};
}

function onEnterKey(){
  vibrate();
  if(STATE === 'qty'){
    onNumpadCommit();
    return;
  }
  if(STATE === 'pay'){
    onPayDone();
    return;
  }
  if(STATE === 'search'){
    if(!SEARCH_QUERY.trim() && SUGGESTIONS && SUGGESTIONS.length > 0){
      // Tap on recent product → add to cart
      var sug = SUGGESTIONS[SUGGEST_ACTIVE_IDX] || SUGGESTIONS[0];
      addToCartDirect(sug.product, 1, 'đv');
      SEARCH_QUERY = '';
      PENDING_PRODUCT = null;
      SUGGEST_ACTIVE_IDX = 0;
      renderCommand();
      liveSearch();
      renderCart();
      return;
    }
    if(SEARCH_QUERY.trim() && SUGGESTIONS && SUGGESTIONS.length > 0){
      var sug = SUGGESTIONS[SUGGEST_ACTIVE_IDX] || SUGGESTIONS[0];
      var parsed = parseSegment(SEARCH_QUERY);
      var qty = (parsed && parsed.qty > 0) ? parsed.qty : 1;
      addToCartDirect(sug.product, qty, 'đv');
      SEARCH_QUERY = '';
      PENDING_PRODUCT = null;
      SUGGEST_ACTIVE_IDX = 0;
      renderCommand();
      liveSearch();
      renderCart();
      return;
    }
    if(ITEMS.length > 0 && !SEARCH_QUERY.trim()){
      EDIT_IDX = -1;
      setParser('pay');
      renderCart();
      initPayMode();
    }
  }
}

function onCommandTap(){
  if(STATE === 'search'){
    if(!VOICE_ACTIVE){
      if(SEARCH_QUERY.trim()){
        SEARCH_QUERY = '';
        renderCommand();
        liveSearch();
      }
      startVoiceInput();
    } else {
      VOICE_ACTIVE = false;
      VOICE_DONE = false;
      if(recognition) recognition.stop();
      renderCommand();
      liveSearch();
    }
  } else {
    goToPrevState();
  }
}

function onHeaderTap(){
  if(STATE === 'pay'){
    goToPrevState();
  } else if(ITEMS.length > 0 && STATE === 'search' && !SEARCH_QUERY.trim()){
    EDIT_IDX = -1;
    setParser('pay');
    renderCart();
    initPayMode();
  }
}

/* ===== JsInvoice ===== */
var ownerErrTimer = null;

function flashOwnerError(msg){
  var cmd = document.getElementById('commandArea');
  if(cmd){
    cmd.classList.remove('error-flash');
    void cmd.offsetWidth;
    cmd.classList.add('error-flash');
  }
  clearTimeout(ownerErrTimer);
  ownerErrTimer = setTimeout(function(){
    if(cmd) cmd.classList.remove('error-flash');
  }, 2200);
}

function setParser(name){
  if(name !== 'search' && VOICE_ACTIVE){
    VOICE_ACTIVE = false;
    VOICE_DONE = false;
    if(recognition) recognition.stop();
  }
  if(name !== STATE){
    PREV_STATE = STATE;
  }
  STATE = name;
  document.body.dataset.parser = name;
}

function goToPrevState(){
  var target = PREV_STATE || 'search';
  if(target === STATE) target = 'search';
  if(target === 'qty') target = 'search';
  setParser(target);
  if(target === 'search'){
    renderCommand();
    liveSearch();
  } else if(target === 'pay'){
    renderCart();
    initPayMode();
  }
}

function saveInvoiceBtn(){
  if(ITEMS.length === 0) return;
  var header = document.querySelector('.header');
  header.style.opacity = '0.5';
  var payload = ITEMS.map(function(it){
    return {
      spokenText: it.spokenText,
      code: it.top3[it.selectedIdx].product.code,
      name: it.top3[it.selectedIdx].product.name,
      qty: it.qty,
      price: it.price,
      total: it.total
    };
  });
  apiCall('saveInvoice', {items: payload}).then(function(res){
    header.style.opacity = '1';
    ORDERS.splice(ACTIVE_ORDER_INDEX, 1);
    var newOrder = createOrder(NEXT_ORDER_ID++);
    ORDERS.push(newOrder);
    ACTIVE_ORDER_INDEX = ORDERS.length - 1;
    ITEMS = [];
    PENDING_PRODUCT = null;
    EDIT_IDX = -1;
    SEARCH_QUERY = '';
    SUGGEST_ACTIVE_IDX = 0;
    setParser('search');
    renderCart();
    updateTotal();
    renderCommand();
    liveSearch();
    updateHoldHeader();
  }).catch(function(err){
    header.style.opacity = '1';
    flashOwnerError('Lỗi lưu đơn: ' + err.message);
  });
}

apiCall('getProducts').then(function(products){
  PRODUCTS = products || [];
  document.getElementById('loadingScreen').classList.add('hidden');
  if(ORDERS.length === 0){
    var firstOrder = createOrder(NEXT_ORDER_ID++);
    ORDERS.push(firstOrder);
    ACTIVE_ORDER_INDEX = 0;
  }
  initSpeechRecognition();
  setParser('search');
  renderCart();
  updateTotal();
  renderCommand();
  liveSearch();
  updateHoldHeader();
}).catch(function(err){
  document.getElementById('loadingScreen').innerHTML = '<div class="loading-text" style="color:#FF453A;">Lỗi tải: ' + err.message + '</div>';
});
