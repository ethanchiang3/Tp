# 曲面 UV 展開與貼圖工具

純前端的 3D web app：把曲面做 UV 展開（unwrap），上傳圖片貼到曲面上，並在 2D UV 視圖中即時調整貼圖的位置、縮放與旋轉。

## 執行方式

不需要建置步驟，用任何靜態伺服器開啟即可：

```bash
# 方法一：Python
python3 -m http.server 8000

# 方法二：Node
npx serve .
```

然後開啟 <http://localhost:8000>。

> 注意：因為使用了 ES modules，直接雙擊 `index.html`（`file://`）無法運作，必須透過 http 伺服器開啟。

## 功能

### 曲面
- 內建曲面：圓柱、球體、圓環、圓錐、波浪面、馬鞍面、花瓶（旋轉曲面）
- 匯入自訂 `.obj` 模型（支援 `v` / `vt` / `vn` / `f`，多邊形自動三角化），可用按鈕或直接拖放檔案

### UV 展開
- **原生參數化**：使用曲面本身的參數座標
- **BFF 保角展開**：Boundary First Flattening（Sawhney & Crane 2017）的簡化實作——解 Yamabe 方程得到目標邊界曲率、走出平面邊界多邊形、cotan Laplacian 調和延拓內部。非圓盤拓撲自動切縫（封閉曲面切狹縫、多邊界曲面在邊界間切開）；圓環等高虧格曲面暫不支援
- **平面投影**：沿最薄的軸投影
- **圓柱投影**：繞 Y 軸展開，自動修正 0/1 接縫
- **球面投影**：經緯度展開，自動修正接縫
- **方盒投影**：依三角形法線的主軸選擇投影平面（適合任意模型）

### 貼圖
- 上傳任何圖片（或使用內建棋盤格）貼到曲面
- 在 UV 視圖中 **拖曳移動**、**滾輪縮放**（以滑鼠位置為錨點）
- 滑桿控制縮放、旋轉、U/V 位移；環繞模式：重複／延伸／鏡像
- UV 視圖同時顯示網格線框，即時對照貼圖與展開結果

### 匯出
- **UV 模板**：2048×2048 的線框 PNG，可拿去繪圖軟體畫貼圖
- **合成貼圖**：把目前的貼圖變換烘焙成單張貼圖 PNG

## 技術

- [Three.js](https://threejs.org/)（已 vendor 在 `vendor/`，不依賴 CDN）
- 原生 ES modules + import map，零依賴、零建置

## 專案結構

```
index.html          頁面與版面
css/style.css       樣式
js/main.js          場景、UV 編輯器、貼圖變換、匯出
js/surfaces.js      內建曲面（參數幾何）
js/unwrap.js        UV 展開演算法（投影 + 接縫處理）
js/bff.js           BFF 保角展開（拓撲處理、切縫、Yamabe、調和延拓）
js/objparser.js     極簡 OBJ 解析器
vendor/             Three.js（MIT，見 THREE-LICENSE）
```
