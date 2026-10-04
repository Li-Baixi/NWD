/* NWD site editor — in-place text & image editing with one-click GitHub publishing.
   Ported key scheme and crop logic from the original inline editor; publishing
   now commits directly to the repository through the GitHub REST Contents API. */
(function () {
  "use strict";

  var storageKey = "nwdrecruitment-content-edits";
  var tokenKey = "nwdrecruitment-editor-token";
  var loginKey = "nwdrecruitment-editor-login";
  var remotePath = "edits.json";
  var repoSlug = "Li-Baixi/NWD";
  var branch = "main";
  var apiBase = "https://api.github.com";
  var liveEditsUrl = "edits.json";
  var imageDir = "assets/edits";
  var tokenCreateUrl = "https://github.com/settings/personal-access-tokens/new" +
    "?name=" + encodeURIComponent("NWD 网站编辑器") +
    "&description=" + encodeURIComponent("网页内容编辑发布") +
    "&target_name=Li-Baixi" +
    "&expires_in=90" +
    "&contents=write";
  var supportedLangs = ["zh-CN", "zh-HK", "en"];

  var editorBar = null;
  var editorStatus = null;
  var publishButton = null;
  var revertButton = null;
  var connectButton = null;
  var imagePanel = null;
  var tokenPanel = null;
  var cropStage = null;
  var cropViewport = null;
  var cropCanvas = null;
  var cropZoomInput = null;
  var cropZoomValue = null;
  var cropSizeLabel = null;
  var imageUrlInput = null;
  var imageFileInput = null;
  var imageCurrentPreview = null;
  var imageOutputPreview = null;
  var inlineImageError = null;
  var tokenInput = null;
  var tokenStateLine = null;

  var activeLang = document.documentElement.lang || "zh-CN";
  var editingEnabled = false;
  var imageRecords = [];
  var textRecords = [];
  var edits = {};
  var remoteEdits = {};
  var activeTextRecord = null;
  var activeImageRecord = null;
  var tokenLogin = "";
  var publishState = { phase: "idle" };
  var imageState = {
    image: null,
    rawSource: "",
    loadedSource: "",
    zoom: 1,
    panX: 0,
    panY: 0,
    baseScale: 1,
    targetRatio: 1,
    outputWidth: 0,
    outputHeight: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    panStartX: 0,
    panStartY: 0
  };

  /* ---------- UI construction ---------- */

  function buildToolbar() {
    var aside = document.createElement("aside");
    aside.id = "siteEditor";
    aside.className = "inline-editor";
    aside.setAttribute("hidden", "");
    aside.setAttribute("aria-hidden", "true");
    aside.innerHTML =
      '<div class="inline-editor-bar">' +
      '<div class="inline-editor-bar-inner">' +
      '<span class="inline-editor-mark">原位编辑</span>' +
      '<div class="inline-lang-tabs" aria-label="编辑语言">' +
      '<button type="button" data-editor-lang="zh-CN">简</button>' +
      '<button type="button" data-editor-lang="zh-HK">繁</button>' +
      '<button type="button" data-editor-lang="en">EN</button>' +
      '</div>' +
      '<button class="inline-tool-button" id="revertLocalEdits" type="button">撤销本地修改</button>' +
      '<button class="inline-tool-button" id="connectGithub" type="button">连接 GitHub</button>' +
      '<button class="inline-tool-button primary" id="publishChanges" type="button">发布</button>' +
      '<button class="inline-tool-button quiet" id="closeInlineEditor" type="button">完成</button>' +
      '<div class="inline-editor-status" id="editorStatus" role="status" aria-live="polite"></div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(aside);
    editorBar = aside;
    editorStatus = aside.querySelector("#editorStatus");
    publishButton = aside.querySelector("#publishChanges");
    revertButton = aside.querySelector("#revertLocalEdits");
    connectButton = aside.querySelector("#connectGithub");
  }

  function buildImagePanel() {
    var panel = document.createElement("section");
    panel.id = "inlineImageEditor";
    panel.className = "inline-image-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "inlineImageTitle");
    panel.setAttribute("hidden", "");
    panel.innerHTML =
      '<header class="inline-image-panel-head">' +
      '<div>' +
      '<strong id="inlineImageTitle">图片编辑</strong>' +
      '<span id="inlineImageCaption">拖动图片并调整缩放，保持版块原有尺寸比例。</span>' +
      '</div>' +
      '<button class="inline-close" id="closeInlineImage" type="button" aria-label="关闭图片编辑">&times;</button>' +
      '</header>' +
      '<div class="inline-image-body">' +
      '<div class="inline-field">' +
      '<span class="inline-field-label">当前图片</span>' +
      '<div class="inline-current-image"><img id="imageCurrentPreview" alt=""></div>' +
      '</div>' +
      '<div class="inline-field">' +
      '<label for="imageUrlInput">图片地址</label>' +
      '<div class="inline-field-row">' +
      '<input id="imageUrlInput" type="url" placeholder="https://example.com/image.jpg" autocomplete="off">' +
      '<button class="inline-file-picker" id="loadImageUrl" type="button">载入</button>' +
      '</div>' +
      '</div>' +
      '<div class="inline-field">' +
      '<label class="inline-file-picker" for="imageFileInput">从电脑选择图片' +
      '<input id="imageFileInput" type="file" accept="image/jpeg,image/png,image/webp">' +
      '</label>' +
      '</div>' +
      '<div class="crop-stage" id="cropStage" hidden>' +
      '<div class="crop-stage-head">' +
      '<span>裁剪画面</span>' +
      '<span>拖拽图片调整位置</span>' +
      '</div>' +
      '<div class="crop-viewport" id="cropViewport"><canvas id="cropCanvas"></canvas></div>' +
      '<div class="crop-controls">' +
      '<label for="cropZoomInput">缩放 <span id="cropZoomValue">100%</span></label>' +
      '<button id="cropResetButton" type="button">重置位置</button>' +
      '</div>' +
      '<input id="cropZoomInput" type="range" min="1" max="4" step="0.01" value="1">' +
      '<p class="crop-size" id="cropSizeLabel"></p>' +
      '</div>' +
      '<div class="inline-output">' +
      '<div class="inline-output-preview"><img id="imageOutputPreview" alt=""></div>' +
      '<div class="inline-output-copy" id="imageOutputNote">裁剪后会按当前版块比例输出，页面布局不会变形。</div>' +
      '</div>' +
      '<p class="inline-image-error" id="inlineImageError" role="alert"></p>' +
      '<div class="inline-image-actions">' +
      '<button class="primary" id="applyCroppedImage" type="button">应用裁剪图片</button>' +
      '<button id="useRawImage" type="button">直接使用原图</button>' +
      '<button id="cancelInlineImage" type="button">取消</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(panel);
    imagePanel = panel;
    cropStage = panel.querySelector("#cropStage");
    cropViewport = panel.querySelector("#cropViewport");
    cropCanvas = panel.querySelector("#cropCanvas");
    cropZoomInput = panel.querySelector("#cropZoomInput");
    cropZoomValue = panel.querySelector("#cropZoomValue");
    cropSizeLabel = panel.querySelector("#cropSizeLabel");
    imageUrlInput = panel.querySelector("#imageUrlInput");
    imageFileInput = panel.querySelector("#imageFileInput");
    imageCurrentPreview = panel.querySelector("#imageCurrentPreview");
    imageOutputPreview = panel.querySelector("#imageOutputPreview");
    inlineImageError = panel.querySelector("#inlineImageError");
  }

  function buildTokenPanel() {
    var panel = document.createElement("section");
    panel.id = "inlineTokenPanel";
    panel.className = "inline-sync-panel";
    panel.setAttribute("aria-labelledby", "inlineTokenTitle");
    panel.setAttribute("hidden", "");
    panel.innerHTML =
      '<h3 id="inlineTokenTitle">连接 GitHub（仅需一次）</h3>' +
      '<p class="inline-sync-note">发布修改需要一枚只授权本仓库的令牌。令牌只保存在你这个浏览器里，可随时吊销。</p>' +
      '<ol class="inline-token-steps">' +
      '<li>点击 <strong>打开令牌创建页</strong>，名称和权限已自动填好。</li>' +
      '<li>在 <strong>Repository access</strong> 选择 <strong>Only select repositories</strong>，勾选 <strong>NWD</strong>。</li>' +
      '<li>拉到底部点击 <strong>Generate token</strong>，复制生成的令牌。</li>' +
      '<li>粘贴到下方输入框，点击 <strong>连接</strong>。</li>' +
      '</ol>' +
      '<div class="inline-token-actions">' +
      '<button id="openTokenPage" type="button">打开令牌创建页</button>' +
      '</div>' +
      '<div class="inline-field">' +
      '<label for="tokenInput">粘贴令牌（github_pat_ 开头）</label>' +
      '<input id="tokenInput" type="password" autocomplete="off" placeholder="github_pat_…">' +
      '</div>' +
      '<div class="inline-sync-actions">' +
      '<button class="primary" id="connectToken" type="button">连接</button>' +
      '<button id="disconnectToken" type="button">断开连接</button>' +
      '<button id="closeTokenPanel" type="button">关闭</button>' +
      '</div>' +
      '<p class="inline-token-connected" id="tokenState" data-state=""></p>';
    document.body.appendChild(panel);
    tokenPanel = panel;
    tokenInput = panel.querySelector("#tokenInput");
    tokenStateLine = panel.querySelector("#tokenState");
  }

  /* ---------- catalog & element addressing (ported verbatim for edits.json compatibility) ---------- */

  function isExcludedEditorElement(element) {
    if (!element || !element.closest) return true;
    return Boolean(element.closest("#siteEditor, #inlineImageEditor, #inlineTokenPanel, #jobGrid, #detailMain, #detailMeta, script, style, svg, nav, .site-header, .mobile-menu, form, .jobs-toolbar, .search-row, .filters-row"));
  }

  function isCatalogableText(element) {
    if (isExcludedEditorElement(element)) return false;
    if (!element.textContent || !element.textContent.trim()) return false;
    var children = Array.prototype.slice.call(element.children || []);
    var disallowed = children.some(function (child) {
      var tag = child.tagName.toUpperCase();
      return tag !== "BR" && tag !== "SVG";
    });
    return !disallowed;
  }

  function escapeSelector(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function keyForText(element) {
    var owner = null;
    if (element.id) owner = element.id;
    if (!owner) {
      var section = element.closest("section[id], footer, .view[id]");
      owner = section ? section.id : "page";
    }
    if (!owner) {
      var fallbackOwner = element.closest("section, footer, main");
      owner = fallbackOwner ? fallbackOwner.tagName.toLowerCase() : "page";
    }
    var tag = element.tagName.toLowerCase();
    var cls = element.classList && element.classList.length ? element.classList[0] : "";
    var selector = "#" + escapeSelector(owner) + " " + tag + (cls ? "." + escapeSelector(cls) : "");
    var bucket = document.querySelectorAll(selector);
    var index = Array.prototype.indexOf.call(bucket, element);
    if (index < 0) index = Array.prototype.indexOf.call(document.querySelectorAll(tag), element);
    if (index < 0) index = 0;
    return "text:" + owner + ":" + tag + ":" + cls + ":" + index;
  }

  function buildCatalog() {
    imageRecords = [];
    textRecords = [];

    document.querySelectorAll("main img, footer img").forEach(function (img) {
      var base = (img.getAttribute("src") || "").split("/").pop().split("?")[0] || "image";
      var key = "image:" + base;
      var rect = img.getBoundingClientRect();
      var slotRatio = rect.width > 0 && rect.height > 0
        ? rect.width / rect.height
        : (img.naturalWidth / img.naturalHeight) || 16 / 10;
      img.setAttribute("data-editor-type", "image");
      img.setAttribute("data-editor-key", key);
      imageRecords.push({
        key: key,
        label: img.getAttribute("alt") || base,
        element: img,
        initial: img.getAttribute("src"),
        slotRatio: slotRatio
      });
    });

    document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main p, main li, main strong, main small, main blockquote, main figcaption, main span, main a, footer h2, footer h3, footer p, footer li, footer strong, footer small, footer a, footer span").forEach(function (element) {
      if (!isCatalogableText(element)) return;
      var key = keyForText(element);
      element.setAttribute("data-editor-type", "text");
      element.setAttribute("data-editor-key", key);
      textRecords.push({
        key: key,
        label: element.textContent.trim().replace(/\s+/g, " ").slice(0, 38),
        element: element,
        baselines: {}
      });
    });

    captureBaseline(activeLang);
  }

  /* ---------- edit application (ported) ---------- */

  function setLeafText(element, value) {
    var lines = String(value == null ? "" : value).replace(/\r\n/g, "\n").split("\n");
    var textNodes = Array.prototype.filter.call(element.childNodes, function (node) { return node.nodeType === Node.TEXT_NODE; });
    var firstElementChild = Array.prototype.find.call(element.childNodes, function (node) { return node.nodeType === Node.ELEMENT_NODE && node.tagName.toUpperCase() !== "BR"; }) || null;
    Array.prototype.forEach.call(element.querySelectorAll(":scope > br"), function (node) { node.parentNode.removeChild(node); });

    while (textNodes.length < lines.length) {
      var node = document.createTextNode("");
      element.insertBefore(node, firstElementChild);
      textNodes.push(node);
    }
    textNodes.forEach(function (node, index) { node.nodeValue = lines[index] || ""; });
    for (var i = 1; i < lines.length; i += 1) {
      element.insertBefore(document.createElement("br"), textNodes[i]);
    }
    element.style.removeProperty("white-space");
  }

  function textValue(record, lang) {
    var langEdits = edits[lang] || {};
    if (Object.prototype.hasOwnProperty.call(langEdits, record.key)) return langEdits[record.key];
    if (Object.prototype.hasOwnProperty.call(record.baselines, lang)) return record.baselines[lang];
    return record.element.textContent;
  }

  function imageValue(record) {
    var langEdits = edits[activeLang] || {};
    if (Object.prototype.hasOwnProperty.call(langEdits, record.key)) return langEdits[record.key];
    return record.initial;
  }

  function captureBaseline(lang) {
    if (supportedLangs.indexOf(lang) === -1) return;
    textRecords.forEach(function (record) {
      var langEdits = edits[lang] || {};
      if (Object.prototype.hasOwnProperty.call(langEdits, record.key)) return;
      if (Object.prototype.hasOwnProperty.call(record.baselines, lang)) return;
      record.baselines[lang] = record.element.textContent;
    });
  }

  function applyEdits() {
    var langEdits = edits[activeLang] || {};
    imageRecords.forEach(function (record) {
      record.element.setAttribute("src", imageValue(record));
      record.element.removeAttribute("srcset");
    });
    textRecords.forEach(function (record) {
      if (Object.prototype.hasOwnProperty.call(langEdits, record.key)) {
        setLeafText(record.element, langEdits[record.key]);
      } else if (Object.prototype.hasOwnProperty.call(record.baselines, activeLang)) {
        setLeafText(record.element, record.baselines[activeLang]);
      }
    });
  }

  /* ---------- local persistence ---------- */

  function readLocalEdits() {
    try {
      var value = window.localStorage.getItem(storageKey);
      return value ? JSON.parse(value) : {};
    } catch (error) {
      return {};
    }
  }

  function writeLocalEdits() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(edits));
      return true;
    } catch (error) {
      setStatus("浏览器存储空间不足，请先发布到 GitHub。", "error");
      return false;
    }
  }

  function readToken() {
    try {
      return window.localStorage.getItem(tokenKey) || "";
    } catch (error) {
      return "";
    }
  }

  function saveToken(token) {
    try {
      window.localStorage.setItem(tokenKey, token);
    } catch (error) {}
  }

  function clearToken() {
    try {
      window.localStorage.removeItem(tokenKey);
      window.localStorage.removeItem(loginKey);
    } catch (error) {}
    tokenLogin = "";
  }

  /* ---------- status & change tracking ---------- */

  function setStatus(message, state) {
    if (!editorStatus) return;
    editorStatus.textContent = message || "";
    editorStatus.dataset.state = state || "";
  }

  function buildChangeSet() {
    var result = {};
    supportedLangs.forEach(function (lang) {
      var remote = remoteEdits[lang] || {};
      var local = edits[lang] || {};
      var diff = {};
      Object.keys(local).forEach(function (key) {
        if (remote[key] !== local[key]) diff[key] = local[key];
      });
      if (Object.keys(diff).length) result[lang] = diff;
    });
    return result;
  }

  function countUnsyncedChanges() {
    var changeSet = buildChangeSet();
    var total = 0;
    Object.keys(changeSet).forEach(function (lang) {
      total += Object.keys(changeSet[lang]).length;
    });
    return total;
  }

  function updateStatus() {
    if (publishState.phase !== "idle") return;
    var n = countUnsyncedChanges();
    if (n > 0) setStatus(n + " 处修改待发布（已自动保存在本浏览器）", "");
    else setStatus("所有修改均已发布 ✓", "ok");
  }

  function setBusy(phase) {
    publishState.phase = phase;
    var busy = phase !== "idle";
    if (publishButton) {
      publishButton.disabled = busy;
      publishButton.classList.toggle("is-busy", busy);
    }
    if (revertButton) revertButton.disabled = busy;
    document.querySelectorAll("[data-editor-lang]").forEach(function (button) {
      button.disabled = busy;
    });
  }

  /* ---------- text editing ---------- */

  function focusEnd(element) {
    try {
      var range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {}
  }

  function openTextEditing(record) {
    closeImageEditor();
    if (activeTextRecord && activeTextRecord !== record) commitTextEditing(true);
    activeTextRecord = record;
    record.savedText = record.element.textContent;
    record.element.setAttribute("contenteditable", "plaintext-only");
    record.element.focus();
    focusEnd(record.element);
    setStatus("正在编辑：" + record.label + "（点击空白处保存，Esc 取消）");
  }

  function commitTextEditing(save) {
    if (!activeTextRecord) return;
    var record = activeTextRecord;
    var value = record.element.textContent || "";
    var valueToApply = save ? value : record.savedText;
    record.element.removeAttribute("contenteditable");
    setLeafText(record.element, valueToApply);
    if (save && value !== record.savedText) {
      edits[activeLang] = edits[activeLang] || {};
      edits[activeLang][record.key] = value;
      writeLocalEdits();
      updateStatus();
    }
    activeTextRecord = null;
  }

  /* ---------- image editing & cropping (ported) ---------- */

  function setImageError(message) {
    inlineImageError.textContent = message || "";
    inlineImageError.classList.toggle("is-visible", Boolean(message));
  }

  function resetImageState() {
    imageState.image = null;
    imageState.rawSource = "";
    imageState.loadedSource = "";
    imageState.zoom = 1;
    imageState.panX = 0;
    imageState.panY = 0;
    imageState.baseScale = 1;
    imageState.targetRatio = 1;
    imageState.outputWidth = 0;
    imageState.outputHeight = 0;
    imageState.dragging = false;
    cropStage.hidden = true;
    cropZoomInput.value = "1";
    cropZoomValue.textContent = "100%";
    cropSizeLabel.textContent = "";
    imageOutputPreview.removeAttribute("src");
    setImageError("");
  }

  function loadImageSource(source) {
    return new Promise(function (resolve) {
      var image = new Image();
      if (/^https?:/.test(source)) image.crossOrigin = "anonymous";
      image.onload = function () {
        imageState.image = image;
        imageState.rawSource = source;
        imageState.loadedSource = source;
        imageState.zoom = 1;
        imageState.panX = 0;
        imageState.panY = 0;
        imageCurrentPreview.src = source;
        imageOutputPreview.src = source;
        cropStage.hidden = false;
        prepareCropCanvas();
        setImageError("");
        resolve({ ok: true });
      };
      image.onerror = function () {
        imageState.rawSource = source;
        imageCurrentPreview.src = source;
        imageOutputPreview.src = source;
        cropStage.hidden = true;
        setImageError("该图片无法在当前环境裁剪（可能缺少跨域许可）。仍可点击“直接使用原图”。");
        resolve({ ok: false });
      };
      image.src = source;
    });
  }

  function prepareCropCanvas() {
    if (!imageState.image || !cropStage || cropStage.hidden) return;
    var ratio = imageState.targetRatio || (imageState.image.naturalWidth / imageState.image.naturalHeight) || 16 / 10;
    var cssWidth = cropViewport.clientWidth || Math.min(430, window.innerWidth - 44);
    var cssHeight = cssWidth / ratio;
    cropViewport.style.aspectRatio = String(ratio);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cropCanvas.width = Math.round(cssWidth * dpr);
    cropCanvas.height = Math.round(cssHeight * dpr);
    var ctx = cropCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    imageState.baseScale = Math.max(cssWidth / imageState.image.naturalWidth, cssHeight / imageState.image.naturalHeight);
    var outputRatio = ratio;
    var outputWidth = imageState.image.naturalWidth;
    var outputHeight = Math.round(outputWidth / outputRatio);
    var maxSide = 1600;
    if (Math.max(outputWidth, outputHeight) > maxSide) {
      var scale = maxSide / Math.max(outputWidth, outputHeight);
      outputWidth = Math.round(outputWidth * scale);
      outputHeight = Math.round(outputHeight * scale);
    }
    if (Math.min(outputWidth, outputHeight) > 2400) {
      var capScale = 2400 / Math.min(outputWidth, outputHeight);
      outputWidth = Math.round(outputWidth * capScale);
      outputHeight = Math.round(outputHeight * capScale);
    }
    imageState.outputWidth = outputWidth;
    imageState.outputHeight = outputHeight;
    cropSizeLabel.textContent = "输出尺寸：" + outputWidth + " × " + outputHeight + " px，比例已锁定为当前版块。";
    drawCropCanvas();
  }

  function clampOffset(value, min, max) {
    if (min > max) return (min + max) / 2;
    return Math.min(max, Math.max(min, value));
  }

  function getDrawGeometry() {
    var image = imageState.image;
    var cssWidth = cropViewport.clientWidth || cropCanvas.width;
    var cssHeight = cssWidth / imageState.targetRatio;
    var scale = imageState.baseScale * imageState.zoom;
    var drawWidth = image.naturalWidth * scale;
    var drawHeight = image.naturalHeight * scale;
    var minX = drawWidth >= cssWidth ? cssWidth - drawWidth : (cssWidth - drawWidth) / 2;
    var maxX = drawWidth >= cssWidth ? 0 : (cssWidth - drawWidth) / 2;
    var minY = drawHeight >= cssHeight ? cssHeight - drawHeight : (cssHeight - drawHeight) / 2;
    var maxY = drawHeight >= cssHeight ? 0 : (cssHeight - drawHeight) / 2;
    var x = clampOffset(imageState.panX, minX, maxX);
    var y = clampOffset(imageState.panY, minY, maxY);
    return { x: x, y: y, width: drawWidth, height: drawHeight, scale: scale };
  }

  function drawCropCanvas() {
    if (!imageState.image || cropStage.hidden) return;
    var ctx = cropCanvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    var geometry = getDrawGeometry();
    ctx.drawImage(imageState.image, geometry.x, geometry.y, geometry.width, geometry.height);
    cropZoomValue.textContent = Math.round(imageState.zoom * 100) + "%";
  }

  function cropExportDataUrl() {
    if (!imageState.image) throw new Error("还没有可裁剪的图片。");
    var geometry = getDrawGeometry();
    var sourceWidth = geometry.width / geometry.scale;
    var sourceHeight = geometry.height / geometry.scale;
    var sourceX = -geometry.x / geometry.scale;
    var sourceY = -geometry.y / geometry.scale;
    sourceX = Math.max(0, Math.min(sourceX, imageState.image.naturalWidth - sourceWidth));
    sourceY = Math.max(0, Math.min(sourceY, imageState.image.naturalHeight - sourceHeight));
    var output = document.createElement("canvas");
    output.width = imageState.outputWidth;
    output.height = imageState.outputHeight;
    var ctx = output.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(
      imageState.image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      imageState.outputWidth,
      imageState.outputHeight
    );
    try {
      var dataUrl = output.toDataURL("image/jpeg", 0.88);
      imageOutputPreview.src = dataUrl;
      return dataUrl;
    } catch (error) {
      var localHint = /^file:$/.test(window.location.protocol) ? "本地 file:// 预览受浏览器安全限制。请用“从电脑选择图片”重新选择图片后裁剪，或直接使用原图；线上 GitHub Pages 可自动裁剪。" : "裁剪导出失败：" + error.message;
      setImageError(localHint);
      return null;
    }
  }

  function openImageEditor(record) {
    if (activeTextRecord) commitTextEditing(true);
    activeImageRecord = record;
    imagePanel.hidden = false;
    imagePanel.classList.add("is-open");
    imagePanel.setAttribute("aria-hidden", "false");
    imagePanel.querySelector("#inlineImageCaption").textContent = "正在编辑：" + record.label;
    var value = imageValue(record);
    imageUrlInput.value = /^data:/.test(value) ? "" : value;
    imageCurrentPreview.src = value;
    imageOutputPreview.src = value;
    resetImageState();
    imageState.targetRatio = record.slotRatio;
    setStatus("正在编辑图片：" + record.label);
    loadImageSource(value);
  }

  function closeImageEditor() {
    activeImageRecord = null;
    imagePanel.hidden = true;
    imagePanel.classList.remove("is-open");
    imagePanel.setAttribute("aria-hidden", "true");
    resetImageState();
  }

  function applyImageValue(value) {
    if (!activeImageRecord || !value) return;
    edits[activeLang] = edits[activeLang] || {};
    edits[activeLang][activeImageRecord.key] = value;
    writeLocalEdits();
    applyEdits();
    updateStatus();
    closeImageEditor();
  }

  /* ---------- language layer (ported) ---------- */

  function setLangButtons() {
    document.querySelectorAll("[data-editor-lang]").forEach(function (button) {
      var active = button.getAttribute("data-editor-lang") === activeLang;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function updateActiveLang(lang) {
    if (supportedLangs.indexOf(lang) === -1) return;
    activeLang = lang;
    setLangButtons();
    captureBaseline(activeLang);
    applyEdits();
  }

  function restoreEditsBeforeLanguageSwitch(lang) {
    var langEdits = edits[lang] || {};
    textRecords.forEach(function (record) {
      if (!Object.prototype.hasOwnProperty.call(langEdits, record.key)) return;
      if (Object.prototype.hasOwnProperty.call(record.baselines, lang)) {
        setLeafText(record.element, record.baselines[lang]);
      }
    });
  }

  /* ---------- GitHub API ---------- */

  async function ghApi(method, path, body, tokenOverride) {
    var token = tokenOverride || readToken();
    var init = {
      method: method,
      headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    };
    if (token) init.headers["Authorization"] = "Bearer " + token;
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    var response;
    try {
      response = await fetch(apiBase + path, init);
    } catch (error) {
      throw { status: 0, message: "无法连接 api.github.com。请检查网络；如果用的是内置预览浏览器，请改用 Chrome 或 Edge 打开本页再发布。" };
    }
    var text = await response.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (error) {}
    }
    return { ok: response.ok, status: response.status, data: data, text: text };
  }

  function decodeBase64Utf8(value) {
    var clean = String(value || "").replace(/\s/g, "");
    var binary = atob(clean);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  function encodeBase64Utf8(value) {
    var bytes = new TextEncoder().encode(value);
    var binary = "";
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function hashString(value) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < value.length; i += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
    }
    return ("00000000" + hash.toString(16)).slice(-8);
  }

  function safeImageName(key, dataUrl) {
    var slug = String(key || "image")
      .replace(/^image:/i, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    if (!slug) slug = "image";
    return slug + "-" + hashString(dataUrl) + ".jpg";
  }

  function mergeEdits(remote, changeSet) {
    var merged = {};
    var langs = supportedLangs.slice();
    Object.keys(remote).forEach(function (lang) {
      if (langs.indexOf(lang) === -1) langs.push(lang);
    });
    langs.forEach(function (lang) {
      merged[lang] = Object.assign({}, remote[lang] || {}, changeSet[lang] || {});
    });
    return merged;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + stableStringify(value[key]);
    }).join(",") + "}";
  }

  /* ---------- token panel ---------- */

  function setTokenState(message, state) {
    tokenStateLine.textContent = message || "";
    tokenStateLine.dataset.state = state || "";
  }

  function renderTokenState() {
    if (!connectButton) return;
    if (readToken() && tokenLogin) {
      connectButton.textContent = "已连接：" + tokenLogin;
    } else if (readToken()) {
      connectButton.textContent = "已连接 GitHub";
    } else {
      connectButton.textContent = "连接 GitHub";
    }
  }

  function openTokenPanel() {
    tokenPanel.hidden = false;
    tokenPanel.classList.add("is-open");
    if (readToken() && tokenLogin) setTokenState("已连接：" + tokenLogin + " ✓", "ok");
    else setTokenState("尚未连接。", "");
    window.setTimeout(function () { tokenInput.focus(); }, 0);
  }

  function closeTokenPanel() {
    tokenPanel.hidden = true;
    tokenPanel.classList.remove("is-open");
  }

  async function connectToken() {
    var token = (tokenInput.value || "").trim();
    if (!token) {
      setTokenState("请先粘贴令牌。", "error");
      return;
    }
    setTokenState("正在验证令牌…", "");
    try {
      var user = await ghApi("GET", "/user", undefined, token);
      if (user.status === 401) { setTokenState("令牌无效，请检查后重试。", "error"); return; }
      if (!user.ok) { setTokenState("读取 GitHub 账号失败（HTTP " + user.status + "）。", "error"); return; }
      var repo = await ghApi("GET", "/repos/" + repoSlug, undefined, token);
      if (repo.status === 404) { setTokenState("令牌访问不到 " + repoSlug + "：创建令牌时请勾选这个仓库。", "error"); return; }
      if (!repo.ok) { setTokenState("读取仓库信息失败（HTTP " + repo.status + "）。", "error"); return; }
      if (repo.data && repo.data.permissions && repo.data.permissions.push === false) {
        setTokenState("令牌缺少写入权限：请重新创建并授予 Contents Read and write。", "error");
        return;
      }
      tokenLogin = (user.data && user.data.login) || "";
      saveToken(token);
      try { window.localStorage.setItem(loginKey, tokenLogin); } catch (error) {}
      renderTokenState();
      setTokenState("已连接：" + tokenLogin + " ✓ 现在可以发布了。", "ok");
      setStatus("GitHub 已连接。", "ok");
      tokenInput.value = "";
    } catch (error) {
      setTokenState(error.message || "连接失败。", "error");
    }
  }

  function disconnectToken() {
    clearToken();
    renderTokenState();
    setTokenState("已断开连接。", "");
    setStatus("已断开 GitHub 连接。", "ok");
  }

  function handleAuthError() {
    clearToken();
    renderTokenState();
    openTokenPanel();
    setStatus("令牌无效或已过期，请重新连接。", "error");
  }

  /* ---------- publishing ---------- */

  function publishStamp() {
    var now = new Date();
    return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  async function uploadPendingImages(changeSet) {
    var replacements = {};
    var tasks = [];
    supportedLangs.forEach(function (lang) {
      var changes = changeSet[lang];
      if (!changes) return;
      Object.keys(changes).forEach(function (key) {
        var value = changes[key];
        if (typeof value !== "string" || value.indexOf("data:") !== 0) return;
        tasks.push({ lang: lang, key: key, value: value });
      });
    });
    for (var i = 0; i < tasks.length; i += 1) {
      var task = tasks[i];
      setStatus("正在上传图片 " + (i + 1) + " / " + tasks.length + "…");
      var name = safeImageName(task.key, task.value);
      var path = imageDir + "/" + name;
      var contentPath = "/repos/" + repoSlug + "/contents/" + path + "?ref=" + encodeURIComponent(branch);
      var existing = await ghApi("GET", contentPath);
      if (!existing.ok && existing.status !== 404) {
        throw { status: existing.status, message: "读取仓库图片失败（HTTP " + existing.status + "）。" };
      }
      var body = {
        message: "Add site editor image " + name,
        content: task.value.replace(/^data:[^,]*,/, ""),
        branch: branch
      };
      if (existing.ok && existing.data && existing.data.sha) body.sha = existing.data.sha;
      var put = await ghApi("PUT", "/repos/" + repoSlug + "/contents/" + path, body);
      if (put.status === 409) {
        var again = await ghApi("GET", contentPath);
        if (again.ok && again.data && again.data.sha) {
          body.sha = again.data.sha;
          put = await ghApi("PUT", "/repos/" + repoSlug + "/contents/" + path, body);
        }
      }
      if (put.status === 401) throw { status: 401 };
      if (!put.ok) throw { status: put.status, message: "图片上传失败（HTTP " + put.status + "）。" };
      changeSet[task.lang][task.key] = path;
      replacements[task.lang] = replacements[task.lang] || {};
      replacements[task.lang][task.key] = { from: task.value, to: path };
    }
    return replacements;
  }

  function pollLiveEdits(expected) {
    var expectedJson = stableStringify(expected);
    var startedAt = Date.now();
    var timer = window.setInterval(function () {
      if (Date.now() - startedAt > 90000) {
        window.clearInterval(timer);
        setBusy("idle");
        setStatus("已提交，Pages 仍在发布中，约一分钟后刷新即可看到。", "ok");
        return;
      }
      fetch(liveEditsUrl + "?t=" + Date.now(), { cache: "no-store" })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (live) {
          if (!live) return;
          if (stableStringify(live) === expectedJson) {
            window.clearInterval(timer);
            setBusy("idle");
            setStatus("已上线 ✓ 刷新页面即可看到最新内容。", "ok");
          }
        })
        .catch(function () {});
    }, 3000);
  }

  async function publish() {
    if (publishState.phase !== "idle") return;
    if (activeTextRecord) commitTextEditing(true);
    closeImageEditor();
    closeTokenPanel();
    if (!readToken()) {
      openTokenPanel();
      setStatus("请先连接 GitHub（仅需一次），连接后即可一键发布。", "ok");
      return;
    }
    var changeSet = buildChangeSet();
    if (!Object.keys(changeSet).length) {
      setStatus("没有待发布的修改。", "ok");
      return;
    }

    var total = countUnsyncedChanges();
    var stamp = publishStamp();

    setBusy("images");
    var replacements;
    try {
      replacements = await uploadPendingImages(changeSet);
    } catch (error) {
      setBusy("idle");
      updateStatus();
      if (error && error.status === 401) handleAuthError();
      else setStatus((error && error.message) || "图片上传失败。", "error");
      return;
    }

    setBusy("commit");
    var committed = null;
    for (var attempt = 0; attempt < 3 && !committed; attempt += 1) {
      try {
        var current = await ghApi("GET", "/repos/" + repoSlug + "/contents/" + remotePath + "?ref=" + encodeURIComponent(branch));
        if (current.status === 401) { setBusy("idle"); handleAuthError(); return; }
        if (!current.ok && current.status !== 404) {
          setBusy("idle");
          setStatus("读取 edits.json 失败（HTTP " + current.status + "）。", "error");
          return;
        }
        var remote = {};
        if (current.ok && current.data && current.data.content) {
          try { remote = JSON.parse(decodeBase64Utf8(current.data.content)); } catch (error) {}
        }
        var merged = mergeEdits(remote, changeSet);
        var put = await ghApi("PUT", "/repos/" + repoSlug + "/contents/" + remotePath, {
          message: "Update site content from editor " + stamp + " (" + total + " changes)",
          content: encodeBase64Utf8(JSON.stringify(merged, null, 2)),
          branch: branch,
          sha: current.ok && current.data ? current.data.sha : undefined
        });
        if (put.status === 401) { setBusy("idle"); handleAuthError(); return; }
        if (put.status === 409) continue;
        if (!put.ok) {
          setBusy("idle");
          var reason = put.data && put.data.message ? "：" + put.data.message : "";
          setStatus("提交失败（HTTP " + put.status + "）" + reason, "error");
          return;
        }
        committed = merged;
      } catch (error) {
        setBusy("idle");
        updateStatus();
        setStatus((error && error.message) || "提交失败。", "error");
        return;
      }
    }
    if (!committed) {
      setBusy("idle");
      setStatus("多次提交都遇到冲突，请稍后重试。", "error");
      return;
    }

    remoteEdits = committed;
    supportedLangs.forEach(function (lang) {
      var langReplacements = replacements[lang] || {};
      edits[lang] = edits[lang] || {};
      Object.keys(langReplacements).forEach(function (key) {
        if (edits[lang][key] === langReplacements[key].from) edits[lang][key] = langReplacements[key].to;
      });
      edits[lang] = Object.assign({}, committed[lang], edits[lang]);
    });
    writeLocalEdits();
    applyEdits();

    if (!/^https?:$/.test(window.location.protocol)) {
      setBusy("idle");
      setStatus("已提交到 GitHub。请打开线上网址查看发布效果。", "ok");
      return;
    }
    setBusy("poll");
    setStatus("已提交（" + total + " 处修改），等待 Pages 发布…", "ok");
    pollLiveEdits(committed);
  }

  async function loadRemoteEdits() {
    if (!/^https?:$/.test(window.location.protocol)) return;
    try {
      var response = await fetch(remotePath + "?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      remoteEdits = await response.json();
      var local = readLocalEdits();
      supportedLangs.forEach(function (lang) {
        edits[lang] = Object.assign({}, remoteEdits[lang] || {}, local[lang] || {});
      });
      applyEdits();
      updateStatus();
    } catch (error) {
      setStatus("线上内容暂未加载，发布前请先打开线上网址。", "error");
    }
  }

  /* ---------- editor session ---------- */

  function openEditor() {
    editingEnabled = true;
    editorBar.hidden = false;
    editorBar.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("is-editing-site");
    activeLang = document.documentElement.lang || "zh-CN";
    captureBaseline(activeLang);
    setLangButtons();
    updateStatus();
  }

  function closeEditor() {
    if (activeTextRecord) commitTextEditing(true);
    closeImageEditor();
    closeTokenPanel();
    editingEnabled = false;
    editorBar.hidden = true;
    editorBar.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("is-editing-site");
    setStatus("");
    if (window.location.hash === "#editor") {
      try {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch (error) {}
    }
  }

  function toggleEditor() {
    if (editorBar.hidden) openEditor();
    else closeEditor();
  }

  function revertLocalEdits() {
    if (publishState.phase !== "idle") return;
    var n = countUnsyncedChanges();
    if (!n) {
      setStatus("没有可撤销的本地修改。", "ok");
      return;
    }
    if (!window.confirm("确定撤销 " + n + " 处未发布的本地修改？页面会恢复到最近一次发布的内容。")) return;
    if (activeTextRecord) commitTextEditing(false);
    closeImageEditor();
    edits = {};
    supportedLangs.forEach(function (lang) {
      edits[lang] = Object.assign({}, remoteEdits[lang] || {});
    });
    writeLocalEdits();
    applyEdits();
    updateStatus();
  }

  /* ---------- event wiring ---------- */

  function wireEvents() {
    document.addEventListener("keydown", function (event) {
      var shortcut = event.ctrlKey || event.metaKey;
      if (shortcut && event.shiftKey && (event.key === "E" || event.key === "e")) {
        event.preventDefault();
        toggleEditor();
        return;
      }
      if (!editingEnabled) return;
      if (event.key === "Escape") {
        if (activeTextRecord) {
          event.preventDefault();
          commitTextEditing(false);
          return;
        }
        if (!imagePanel.hidden) {
          closeImageEditor();
          return;
        }
        if (!tokenPanel.hidden) {
          closeTokenPanel();
          return;
        }
      }
      if (activeTextRecord && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        commitTextEditing(true);
      }
    });

    document.addEventListener("focusout", function (event) {
      if (!activeTextRecord) return;
      if (event.target !== activeTextRecord.element) return;
      commitTextEditing(true);
    });

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var toolTarget = target.closest("#siteEditor, #inlineImageEditor, #inlineTokenPanel");
      if (toolTarget) return;

      if (!editingEnabled) return;
      if (target.closest("[data-set-lang]")) {
        if (activeTextRecord) commitTextEditing(true);
        restoreEditsBeforeLanguageSwitch(activeLang);
        return;
      }

      var textElement = target.closest("[data-editor-type='text']");
      var imageElement = target.closest("[data-editor-type='image']");

      if (textElement) {
        event.preventDefault();
        event.stopPropagation();
        if (activeTextRecord && activeTextRecord.element === textElement) return;
        var record = textRecords.find(function (item) { return item.element === textElement; });
        if (record) openTextEditing(record);
        return;
      }

      if (imageElement) {
        event.preventDefault();
        event.stopPropagation();
        var imageRecord = imageRecords.find(function (item) { return item.element === imageElement; });
        if (imageRecord) openImageEditor(imageRecord);
        return;
      }

      if (target.closest("a, button, [data-route], [data-job-id]")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    document.addEventListener("click", function (event) {
      var langButton = event.target.closest && event.target.closest("[data-set-lang]");
      if (langButton) {
        var nextLang = langButton.getAttribute("data-set-lang");
        window.setTimeout(function () { updateActiveLang(nextLang); }, 0);
      }

      var editorLangButton = event.target.closest && event.target.closest("[data-editor-lang]");
      if (editorLangButton) {
        var targetLang = editorLangButton.getAttribute("data-editor-lang");
        var pageButton = document.querySelector('[data-set-lang="' + targetLang + '"]');
        if (pageButton) pageButton.click();
      }
    });

    window.addEventListener("beforeunload", function (event) {
      if (countUnsyncedChanges() > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    });

    revertButton.addEventListener("click", revertLocalEdits);
    publishButton.addEventListener("click", publish);
    connectButton.addEventListener("click", openTokenPanel);
    editorBar.querySelector("#closeInlineEditor").addEventListener("click", closeEditor);

    tokenPanel.querySelector("#openTokenPage").addEventListener("click", function () {
      var opened = window.open(tokenCreateUrl, "_blank", "noopener,noreferrer");
      if (!opened) setTokenState("浏览器拦截了新窗口，请允许弹窗后重试。", "error");
    });
    tokenPanel.querySelector("#connectToken").addEventListener("click", connectToken);
    tokenPanel.querySelector("#disconnectToken").addEventListener("click", disconnectToken);
    tokenPanel.querySelector("#closeTokenPanel").addEventListener("click", closeTokenPanel);

    imagePanel.querySelector("#closeInlineImage").addEventListener("click", closeImageEditor);
    imagePanel.querySelector("#cancelInlineImage").addEventListener("click", closeImageEditor);
    imagePanel.querySelector("#loadImageUrl").addEventListener("click", function () {
      loadImageSource(imageUrlInput.value.trim());
    });
    imageFileInput.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        imageUrlInput.value = "";
        loadImageSource(reader.result);
      };
      reader.readAsDataURL(file);
    });
    imagePanel.querySelector("#applyCroppedImage").addEventListener("click", function () {
      var dataUrl = cropExportDataUrl();
      if (dataUrl) applyImageValue(dataUrl);
    });
    imagePanel.querySelector("#useRawImage").addEventListener("click", function () {
      if (imageState.rawSource) {
        applyImageValue(imageState.rawSource);
      } else if (imageUrlInput.value.trim()) {
        applyImageValue(imageUrlInput.value.trim());
      } else {
        setStatus("请先选择或载入一张图片。", "error");
      }
    });

    cropZoomInput.addEventListener("input", function () {
      imageState.zoom = Number(cropZoomInput.value) || 1;
      drawCropCanvas();
    });
    imagePanel.querySelector("#cropResetButton").addEventListener("click", function () {
      imageState.zoom = 1;
      imageState.panX = 0;
      imageState.panY = 0;
      cropZoomInput.value = "1";
      drawCropCanvas();
    });

    cropViewport.addEventListener("pointerdown", function (event) {
      if (!imageState.image) return;
      event.preventDefault();
      imageState.dragging = true;
      imageState.dragStartX = event.clientX;
      imageState.dragStartY = event.clientY;
      imageState.panStartX = imageState.panX;
      imageState.panStartY = imageState.panY;
      cropViewport.setPointerCapture(event.pointerId);
    });
    cropViewport.addEventListener("pointermove", function (event) {
      if (!imageState.dragging || !imageState.image) return;
      imageState.panX = imageState.panStartX + event.clientX - imageState.dragStartX;
      imageState.panY = imageState.panStartY + event.clientY - imageState.dragStartY;
      drawCropCanvas();
    });
    cropViewport.addEventListener("pointerup", function (event) {
      imageState.dragging = false;
      if (cropViewport.hasPointerCapture(event.pointerId)) cropViewport.releasePointerCapture(event.pointerId);
    });
    cropViewport.addEventListener("pointercancel", function () {
      imageState.dragging = false;
    });

    window.addEventListener("resize", function () {
      if (editingEnabled && !imagePanel.hidden && imageState.image) {
        window.requestAnimationFrame(prepareCropCanvas);
      }
    });

    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#editor" && editorBar.hidden) openEditor();
    });
  }

  /* ---------- init ---------- */

  buildToolbar();
  buildImagePanel();
  buildTokenPanel();
  wireEvents();

  try {
    tokenLogin = window.localStorage.getItem(loginKey) || "";
  } catch (error) {
    tokenLogin = "";
  }
  renderTokenState();

  buildCatalog();
  edits = readLocalEdits();
  setLangButtons();
  applyEdits();
  loadRemoteEdits();

  if (window.location.hash === "#editor") openEditor();
})();
