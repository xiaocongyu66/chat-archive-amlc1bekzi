"use strict";

const renderBatchSize = 300;
const renderIncrement = 300;

const state = {
  room: {},
  manifest: {},
  usersByUuid: {},
  days: [],
  messagesByDay: new Map(),
  activeMessages: [],
  filteredMessages: [],
  renderLimit: renderBatchSize,
  viewerUuid: "",
  activeScope: "day",
  loadAllPromise: null,
  loading: false
};

const dom = {
  roomTitle: document.querySelector("#roomTitle"),
  roomStats: document.querySelector("#roomStats"),
  daySelect: document.querySelector("#daySelect"),
  searchInput: document.querySelector("#searchInput"),
  loadDayButton: document.querySelector("#loadDayButton"),
  loadAllButton: document.querySelector("#loadAllButton"),
  searchAllButton: document.querySelector("#searchAllButton"),
  clearButton: document.querySelector("#clearButton"),
  progressPanel: document.querySelector("#progressPanel"),
  progressTitle: document.querySelector("#progressTitle"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  statusLine: document.querySelector("#statusLine"),
  chatReplay: document.querySelector("#chatReplay"),
  loadMoreWrap: document.querySelector("#loadMoreWrap"),
  loadMoreButton: document.querySelector("#loadMoreButton")
};

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char];
  });
}

function jsonFetch(path) {
  return fetch(path, { cache: "no-cache" }).then(function(response) {
    if (!response.ok) throw new Error("读取失败 " + path + "：" + response.status);
    return response.json();
  });
}

function setLoading(value) {
  state.loading = value;
  dom.loadDayButton.disabled = value;
  dom.loadAllButton.disabled = value;
  dom.searchAllButton.disabled = value;
}

function showProgress(title, current, total) {
  dom.progressPanel.hidden = false;
  dom.progressTitle.textContent = title;
  dom.progressText.textContent = String(current || 0) + " / " + String(total || 0);
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  dom.progressBar.style.width = String(percent) + "%";
}

function hideProgress() {
  dom.progressPanel.hidden = true;
  dom.progressBar.style.width = "0";
}

function displayName(user) {
  if (!user) return "未知用户";
  const name = user.name || user.username || user.id || "未知用户";
  return user.host ? name + "@" + user.host : name;
}

function username(user) {
  if (!user || !user.username) return "";
  return user.host ? "@" + user.username + "@" + user.host : "@" + user.username;
}

function initials(user) {
  const source = (user && (user.name || user.username)) || "?";
  return source.trim().slice(0, 1).toUpperCase() || "?";
}

function normalizeAssetUrl(url) {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  const prefix = state.manifest.publicPrefix || (state.manifest.roomId ? "/archive-media/" + state.manifest.roomId : "");
  if (prefix && url.startsWith(prefix + "/")) return url.slice(prefix.length + 1);
  const archivePrefix = "/archive-media/";
  if (url.startsWith(archivePrefix)) {
    const rest = url.slice(archivePrefix.length);
    const slash = rest.indexOf("/");
    return slash >= 0 ? rest.slice(slash + 1) : rest;
  }
  if (url.startsWith("/")) return "." + url;
  return url;
}

function avatarSrc(user) {
  if (!user) return "";
  return normalizeAssetUrl(user.avatarLocalUrl || user.avatarDataUrl || user.avatarUrl || "");
}

function fileImageSrc(file) {
  return normalizeAssetUrl(file && (file.localUrl || file.dataUrl || file.url || ""));
}

function fileThumbSrc(file) {
  return normalizeAssetUrl(file && (file.thumbnailLocalUrl || file.thumbnailDataUrl || file.thumbnailUrl || fileImageSrc(file)));
}

function userForMessage(message) {
  return message && message.userUuid && state.usersByUuid[message.userUuid]
    ? state.usersByUuid[message.userUuid]
    : message.user || null;
}

function userForReference(reference) {
  return reference && reference.userUuid && state.usersByUuid[reference.userUuid]
    ? state.usersByUuid[reference.userUuid]
    : reference && reference.user || null;
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("zh-CN");
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function linkedText(text) {
  return escapeHtml(text)
    .replace(/\n/g, "<br>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
}

function reactionCounts(reactions) {
  const counts = new Map();
  for (const item of reactions || []) counts.set(item.reaction, (counts.get(item.reaction) || 0) + 1);
  return Array.from(counts.entries()).map(function(entry) {
    return { reaction: entry[0], count: entry[1] };
  });
}

function messageTimestamp(message) {
  return message.timestampMs || new Date(message.createdAt).getTime() || 0;
}

function sortMessages(messages) {
  return messages.slice().sort(function(a, b) {
    return messageTimestamp(a) - messageTimestamp(b) || String(a.id).localeCompare(String(b.id));
  });
}

function dayForMessage(message) {
  return message.date || String(message.createdAt || "").slice(0, 10) || "unknown";
}

function messageMatches(message, query) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  const user = userForMessage(message);
  const files = (message.files || []).map(function(file) { return file.name || file.id || file.localUrl || file.url || ""; });
  const haystack = [
    message.text,
    message.id,
    message.sequence,
    message.createdAt,
    message.date,
    message.time,
    message.userUuid,
    message.manual ? "截图证据 补录 OCR" : "",
    message.evidence && message.evidence.ocrText,
    message.evidence && message.evidence.fileName,
    message.evidence && message.evidence.filePath,
    message.evidence && message.evidence.sourceRelativePath,
    message.evidence && message.evidence.sourceUserName,
    message.evidence && message.evidence.speakerName,
    message.evidence && message.evidence.speakerUsername,
    message.evidence && message.evidence.speakerMatchedUserUuid,
    message.evidence && message.evidence.attribution,
    message.evidence && message.evidence.sourceText,
    message.evidence && message.evidence.timeSource,
    displayName(user),
    username(user)
  ].concat(files).join("\n").toLowerCase();
  return haystack.includes(normalized);
}

function updateStats() {
  const roomName = state.room.name || state.manifest.roomName || ("房间 " + (state.manifest.roomId || ""));
  dom.roomTitle.textContent = roomName;
  const apiCount = state.manifest.messageCount || 0;
  const manualCount = state.manifest.manualMessageCount || 0;
  const mergedCount = state.manifest.mergedMessageCount || (apiCount + manualCount);
  dom.roomStats.textContent = [
    "本地完整记录 " + mergedCount + " 条",
    "API " + apiCount + " 条",
    manualCount ? "截图补录 " + manualCount + " 条" : "",
    "日期 " + state.days.length + " 天"
  ].filter(Boolean).join(" | ");
}

function updateStatus() {
  const loadedCount = Array.from(state.messagesByDay.values()).reduce(function(sum, messages) {
    return sum + messages.length;
  }, 0);
  const rendered = Math.min(state.renderLimit, state.filteredMessages.length);
  const query = dom.searchInput.value.trim();
  const scope = state.activeScope === "all" ? "全部日期" : "日期 " + (dom.daySelect.value || "-");
  dom.statusLine.textContent = [
    "已加载 " + loadedCount + " 条",
    "范围 " + scope,
    query ? "匹配 " + state.filteredMessages.length + " 条" : "当前 " + state.activeMessages.length + " 条",
    "已渲染 " + rendered + " 条"
  ].join("；");
}

function referenceHtml(kind, ref) {
  if (!ref) return "";
  const user = userForReference(ref);
  return '<div class="message-reference"><span>' + escapeHtml(kind) + '</span><strong>' + escapeHtml(displayName(user)) + '</strong><em>' + escapeHtml(ref.text || "[附件]") + '</em></div>';
}

function fileHtml(file) {
  if (file && file.isImage && fileImageSrc(file)) {
    return '<a class="message-image-link" href="' + escapeHtml(fileImageSrc(file)) + '" target="_blank" rel="noreferrer"><img class="message-image" src="' + escapeHtml(fileThumbSrc(file)) + '" alt="' + escapeHtml(file.name || "图片") + '" loading="lazy" /></a>';
  }
  return '<a class="message-file" href="' + escapeHtml(normalizeAssetUrl(file && (file.localUrl || file.dataUrl || file.url)) || "#") + '" target="_blank" rel="noreferrer">' + escapeHtml(file && (file.name || file.id) || "附件") + '</a>';
}

function avatarHtml(user) {
  const avatar = avatarSrc(user);
  if (avatar) return '<img class="message-avatar" src="' + escapeHtml(avatar) + '" alt="" loading="lazy" />';
  return '<div class="message-avatar">' + escapeHtml(initials(user)) + '</div>';
}

function renderMessages() {
  const messages = state.filteredMessages.slice(0, state.renderLimit);
  if (!messages.length) {
    dom.chatReplay.innerHTML = '<div class="archive-empty">没有聊天记录或没有匹配结果。</div>';
    dom.loadMoreWrap.hidden = true;
    updateStatus();
    return;
  }
  let previous = null;
  dom.chatReplay.innerHTML = messages.map(function(message) {
    const user = userForMessage(message);
    const mine = Boolean(
      (message.userUuid && state.viewerUuid && message.userUuid === state.viewerUuid) ||
      (message.userId && state.manifest.viewerId && message.userId === state.manifest.viewerId)
    );
    const evidence = message.evidence || {};
    const dayDivider = !previous || !sameDay(previous.createdAt, message.createdAt)
      ? '<div class="day-divider">' + escapeHtml(formatDate(message.createdAt)) + '</div>'
      : "";
    previous = message;
    const text = message.text ? '<div class="message-text">' + linkedText(message.text) + '</div>' : "";
    const files = (message.files || []).map(fileHtml).join("");
    const reactions = reactionCounts(message.reactions).map(function(item) {
      return '<span>' + escapeHtml(item.reaction) + ' ' + item.count + '</span>';
    }).join("");
    const evidenceMeta = message.manual || evidence.speakerName || evidence.sourceUserName
      ? '<div class="evidence-meta">'
        + (message.manual ? '<strong>截图证据补录</strong>' : '')
        + (evidence.speakerName ? '<span>截图发言人 ' + escapeHtml(evidence.speakerName) + (evidence.speakerUsername ? ' @' + escapeHtml(evidence.speakerUsername) : '') + '</span>' : '')
        + (evidence.sourceUserName ? '<span>原上传者 ' + escapeHtml(evidence.sourceUserName) + '</span>' : '')
        + (evidence.attribution ? '<span>归属 ' + escapeHtml(evidence.attribution) + '</span>' : '')
        + '<span>时间来源 ' + escapeHtml(evidence.timeSource || "unknown") + '</span>'
        + '<span>置信度 ' + escapeHtml(evidence.confidence || "unknown") + '</span>'
        + (evidence.duplicateOf ? '<span>重复图</span>' : '')
        + '</div>'
      : "";
    return dayDivider
      + '<article class="message-row ' + (mine ? 'mine' : '') + (message.manual ? ' evidence-row' : '') + '" data-message-id="' + escapeHtml(message.id) + '">'
      + avatarHtml(user)
      + '<div class="message-main"><div class="message-head"><strong>' + escapeHtml(displayName(user)) + '</strong><span>' + escapeHtml(username(user)) + '</span><time>' + escapeHtml(formatTime(message.createdAt)) + '</time></div>'
      + '<div class="message-bubble">' + evidenceMeta + referenceHtml("回复", message.reply) + referenceHtml("引用", message.quote) + text
      + (files ? '<div class="message-files">' + files + '</div>' : '')
      + (reactions ? '<div class="message-reactions">' + reactions + '</div>' : '')
      + '</div></div></article>';
  }).join("");
  dom.loadMoreWrap.hidden = state.renderLimit >= state.filteredMessages.length;
  updateStatus();
}

function applyFilter() {
  const query = dom.searchInput.value.trim();
  state.filteredMessages = state.activeMessages.filter(function(message) {
    return messageMatches(message, query);
  });
  state.renderLimit = renderBatchSize;
  renderMessages();
}

function searchCurrentQuery() {
  const query = dom.searchInput.value.trim();
  if (query && state.activeScope !== "all") {
    loadAllDays("正在为搜索加载全部日期");
    return;
  }
  applyFilter();
}

function mergeLoadedMessages() {
  const messages = [];
  for (const day of state.days) {
    if (state.messagesByDay.has(day.day)) messages.push.apply(messages, state.messagesByDay.get(day.day));
  }
  state.activeMessages = sortMessages(messages);
  state.activeScope = "all";
}

function loadDay(day) {
  if (state.messagesByDay.has(day)) return Promise.resolve(state.messagesByDay.get(day));
  const meta = state.days.find(function(item) { return item.day === day; });
  if (!meta) return Promise.resolve([]);
  return jsonFetch(meta.messagesPath || (day + "/messages.json")).then(function(messages) {
    state.messagesByDay.set(day, Array.isArray(messages) ? messages : []);
    return state.messagesByDay.get(day);
  });
}

function loadSelectedDay() {
  const day = dom.daySelect.value;
  if (!day) return;
  setLoading(true);
  showProgress("正在加载日期", 0, 1);
  loadDay(day).then(function(messages) {
    showProgress("正在加载日期", 1, 1);
    state.activeMessages = sortMessages(messages || []);
    state.activeScope = "day";
    searchCurrentQuery();
  }).catch(function(error) {
    dom.statusLine.textContent = error.message;
  }).finally(function() {
    setLoading(false);
    hideProgress();
  });
}

async function loadAllDays(title) {
  if (state.loadAllPromise) return state.loadAllPromise;
  state.loadAllPromise = (async function() {
    const progressTitle = typeof title === "string" ? title : "正在加载全部日期";
    setLoading(true);
    try {
      for (let index = 0; index < state.days.length; index += 1) {
        showProgress(progressTitle, index, state.days.length);
        await loadDay(state.days[index].day);
      }
      showProgress(progressTitle, state.days.length, state.days.length);
      mergeLoadedMessages();
      applyFilter();
    } catch (error) {
      dom.statusLine.textContent = error.message;
    } finally {
      setLoading(false);
      hideProgress();
    }
  })();
  try {
    return await state.loadAllPromise;
  } finally {
    state.loadAllPromise = null;
  }
}

function loadMore() {
  if (state.renderLimit >= state.filteredMessages.length) return;
  state.renderLimit = Math.min(state.renderLimit + renderIncrement, state.filteredMessages.length);
  renderMessages();
}

function onScroll() {
  const distanceToBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
  if (distanceToBottom < 900) loadMore();
}

function fillDaySelect() {
  dom.daySelect.innerHTML = state.days.map(function(day) {
    return '<option value="' + escapeHtml(day.day) + '">' + escapeHtml(day.day + " (" + day.count + ")") + '</option>';
  }).join("");
  if (state.days.length) dom.daySelect.value = state.days[state.days.length - 1].day;
}

function normalizeDays(days) {
  return (Array.isArray(days) ? days : []).filter(function(item) {
    return item && item.day;
  }).sort(function(a, b) {
    return String(a.day).localeCompare(String(b.day));
  });
}

function clearSearch() {
  dom.searchInput.value = "";
  applyFilter();
}

function initEvents() {
  dom.loadDayButton.addEventListener("click", loadSelectedDay);
  dom.loadAllButton.addEventListener("click", loadAllDays);
  dom.searchAllButton.addEventListener("click", function() { loadAllDays(); });
  dom.clearButton.addEventListener("click", clearSearch);
  dom.loadMoreButton.addEventListener("click", loadMore);
  dom.searchInput.addEventListener("input", function() {
    window.clearTimeout(dom.searchInput._timer);
    dom.searchInput._timer = window.setTimeout(searchCurrentQuery, 160);
  });
  window.addEventListener("scroll", onScroll, { passive: true });
}

async function init() {
  initEvents();
  try {
    const results = await Promise.all([
      jsonFetch("./manifest.json"),
      jsonFetch("./room.json").catch(function() { return {}; }),
      jsonFetch("./users-by-uuid.json").catch(function() { return {}; }),
      jsonFetch("./days.json")
    ]);
    state.manifest = results[0] || {};
    state.room = results[1] || {};
    state.usersByUuid = results[2] || {};
    state.days = normalizeDays(results[3]);
    state.viewerUuid = state.manifest.viewerUuid || "";
    fillDaySelect();
    updateStats();
    if (state.days.length) {
      loadSelectedDay();
    } else {
      dom.chatReplay.innerHTML = '<div class="archive-empty">没有找到 days.json 日期索引。</div>';
    }
  } catch (error) {
    dom.statusLine.textContent = error.message;
    dom.chatReplay.innerHTML = '<div class="archive-empty">静态资源目录不完整，至少需要 manifest.json、days.json、messages.json 或按日期目录。</div>';
  }
}

init();
