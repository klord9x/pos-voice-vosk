# POS Giọng Nói — Cloudflare Pages + PWA

## Cấu trúc

```
pos-cloudflare/
├── index.html        ← UI chính (đã bỏ <?!= include ?> của GAS)
├── styles.css         ← tách từ Styles.html
├── app.js              ← tách từ <script> trong Index.html, đã đổi google.script.run → fetch()
├── manifest.json       ← khai báo PWA, display:fullscreen
├── service-worker.js   ← cache static asset, KHÔNG cache API call
├── icons/icon-192.png, icon-512.png  ← icon tạm, nên đổi bằng icon thật của bạn
├── _headers             ← header riêng cho Cloudflare Pages
└── Code.gs              ← backend Apps Script mới, chỉ làm JSON API (deploy riêng, KHÔNG nằm trong repo Cloudflare)
```

## Bước 1 — Deploy backend Apps Script trước

1. Mở project Apps Script hiện tại (gắn với Google Sheet `DANH_MUC_HANG` / `HOA_DON_HIEN_TAI`).
2. Thay toàn bộ `Code.gs` cũ bằng `Code.gs` mới trong gói này.
3. **Xoá file `Index.html` và `Styles.html` khỏi project Apps Script** — không cần nữa vì UI đã chuyển ra Cloudflare.
4. Triển khai > Quản lý triển khai > Triển khai mới:
   - Loại: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** ← bắt buộc, nếu để "Only myself" thì Cloudflare sẽ không gọi được.
5. Copy URL dạng `https://script.google.com/macros/s/XXXXXXXX/exec`.

> Apps Script Web App tự động trả header `Access-Control-Allow-Origin: *`, nên không cần làm gì thêm cho CORS — miễn là request POST gửi với `Content-Type: text/plain` (đã code sẵn trong `app.js`) để tránh bị browser gửi preflight `OPTIONS` (Apps Script không xử lý được preflight).

## Bước 2 — Gắn API_URL vào frontend

Mở `app.js`, dòng đầu:

```js
var API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
```

Dán URL `.../exec` ở bước 1 vào đây.

## Bước 3 — Deploy lên Cloudflare Pages

**Cách nhanh nhất (kéo thả, không cần git):**
1. Vào [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages → Upload assets.
2. Kéo cả thư mục `pos-cloudflare/` (trừ `Code.gs`, file đó không deploy lên Pages) vào.
3. Cloudflare cấp domain dạng `pos-app-xxx.pages.dev`.

**Cách dùng Git (khuyên dùng nếu sau này còn sửa code):**
```bash
cd pos-cloudflare
rm Code.gs          # backend không nằm trong repo frontend
git init && git add . && git commit -m "init pos pwa"
git remote add origin <repo-cua-ban>
git push -u origin main
```
Sau đó Cloudflare Pages → Connect to Git → chọn repo → Build command: (để trống) → Output directory: `/`.

## Bước 4 — Cập nhật lại domain trong Code.gs (tuỳ chọn)

Trong `Code.gs`, sửa:
```js
var POS_APP_URL = 'https://PASTE-YOUR-CLOUDFLARE-PAGES-DOMAIN.pages.dev';
```
thành domain Cloudflare thật ở Bước 3 — để menu "🎤 POS Giọng Nói → Mở màn hình bán hàng" trong Google Sheet bật ra link đúng.

## Bước 5 — Cài app lên điện thoại (PWA, full screen thật, không thanh địa chỉ)

- **Android (Chrome):** mở domain `.pages.dev` → menu ⋮ → "Cài đặt ứng dụng" / "Thêm vào màn hình chính". Vì có `manifest.json` với `display: fullscreen`, app sẽ mở full màn hình, không thanh địa chỉ, không thanh điều hướng.
- **iOS (Safari):** mở domain → nút Share → "Thêm vào màn hình chính". iOS không đọc `display` trong manifest, nhưng đã có `apple-mobile-web-app-capable=yes` trong `index.html` nên vẫn mở standalone, không Safari UI.

## Đã xử lý sẵn trong code

- ✅ Chặn menu long-press (copy/paste/save ảnh) — `contextmenu` + `-webkit-touch-callout:none`
- ✅ Chặn double-tap zoom — `touch-action:manipulation` + JS debounce `touchend`
- ✅ Chặn pinch-zoom — `gesturestart` + viewport `user-scalable=no`
- ✅ Chặn pull-to-refresh / bounce — `overscroll-behavior:none`
- ✅ Chặn select text / kéo-thả — `user-select:none` + JS `selectstart`/`dragstart`
- ✅ Service worker cache static asset, **luôn fetch mới** cho mọi request tới `script.google.com` (giá/hàng hóa luôn cập nhật, không bị cache cũ)

## Còn cần bạn tự làm

- Đổi icon tạm trong `icons/` thành icon thật (giữ đúng tên file + kích thước 192/512, hoặc sửa lại path trong `manifest.json`).
- Nếu muốn domain riêng (không phải `.pages.dev`) → Cloudflare Pages → Custom domains.
- File `localStorage` (QTY_CONFIG) vẫn lưu trên thiết bị như cũ, không ảnh hưởng gì khi đổi domain.
