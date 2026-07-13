/* ==========================================================================
   주간 뉴스 모니터링 웹사이트 - 공통 스크립트
   - 카테고리 아이콘/색상 정의
   - 조회수/추천수 카운터 (localStorage, 브라우저 단위)
   - 메인 / 지난뉴스 페이지 렌더링
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------- 아이콘 팔레트 ---------------- */
  // 기사는 더 이상 카테고리로 분류하지 않습니다. 카드마다 보기 좋은 변화를 주기 위해
  // 기사 id를 기준으로 이 팔레트 중 하나를 고정적으로(=새로고침해도 항상 같게) 골라 씁니다.
  var PALETTE = [
    { cls: "cat-welfare", icon: "gift" },
    { cls: "cat-payment", icon: "wallet" },
    { cls: "cat-aicc", icon: "headset" },
    { cls: "cat-safety", icon: "gear" }
  ];

  function paletteFor(id) {
    var idx = Math.abs(hashCode(id)) % PALETTE.length;
    return PALETTE[idx];
  }

  function hashCode(str) {
    var h = 0;
    str = String(str || "");
    for (var i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return h;
  }

  /* ---------------- 아이콘 (부드럽고 둥근 스타일, currentColor 사용) ---------------- */
  var ICONS = {
    gift:
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="1.6"/><path d="M3 12h18"/><path d="M12 8v12"/><path d="M12 8c-2.1 0-5.8-.7-5.8-3.6A2.7 2.7 0 0 1 9 1.8c2.4 0 3 3.7 3 6.2Z"/><path d="M12 8c2.1 0 5.8-.7 5.8-3.6A2.7 2.7 0 0 0 15 1.8c-2.4 0-3 3.7-3 6.2Z"/></svg>', 
      wallet:
       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.5" width="18" height="13" rx="2.6"/><path d="M3 10.5h18"/><path d="M16.2 14.5a1.1 1.1 0 1 0 0 .1Z"/><path d="M7 6.5 12 3l5 3.5"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.3 5 5.9v5.4c0 4.6 3 7.9 7 9.4 4-1.5 7-4.8 7-9.4V5.9Z"/><path d="M8.8 12.1l2.2 2.2 4.2-4.4"/></svg>',
    headset:
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="2.7" y="12.4" width="4.3" height="6.6" rx="1.8"/><rect x="17" y="12.4" width="4.3" height="6.6" rx="1.8"/><path d="M21.3 19a4 4 0 0 1-4 3.6h-2.3"/></svg>', 
      warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6 21 19.6a1 1 0 0 1-.9 1.5H3.9a1 1 0 0 1-.9-1.5L12 3.6Z" stroke-linejoin="round"/><path d="M12 10v4"/><path d="M12 17.2h.01"/></svg>',
     gear:
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.3"/><path d="M12 2.5v5.2M12 21.5v-5.2M2.5 12h5.2M21.5 12h-5.2M5.3 5.3l3.7 3.7M18.7 5.3l-3.7 3.7M5.3 18.7l3.7-3.7M18.7 18.7l-3.7-3.7"/></svg>',  
        megaphone:
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 9.5v5c0 1 .8 1.8 1.8 1.8h1.6l8 4V3.7l-8 4H4.3c-1 0-1.8.8-1.8 1.8Z"/><path d="M14 7.5a5 5 0 0 1 0 9"/><path d="M17.5 5a8.3 8.3 0 0 1 0 14"/></svg>', 
      thumb:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 21H5.3a1.3 1.3 0 0 1-1.3-1.3v-7.4A1.3 1.3 0 0 1 5.3 11h2.2"/><path d="M7.5 11l4-6.7a2 2 0 0 1 3 .2c.4.6.5 1.3.3 2l-1 3.5h5.4a2.2 2.2 0 0 1 2.1 2.9l-2 6.5a2.2 2.2 0 0 1-2.1 1.6H10a2.5 2.5 0 0 1-2.5-2.5V11Z"/></svg>',
    eye:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.7 12S6 6 12 6s9.3 6 9.3 6-3.3 6-9.3 6-9.3-6-9.3-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6"/></svg>'
  };

  /* ---------------- 유틸 ---------------- */

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // URL 기반 안정적인 id 생성 (주차가 바뀌어 아카이브로 이동해도 카운트가 유지되도록)
  function hashId(str) {
    var h = 0;
    str = String(str || "");
    for (var i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return "a" + Math.abs(h).toString(36);
  }

  function getArticleId(article) {
    return article.id || hashId(article.url || article.title);
  }

  // 숫자를 "1,240" 형태로 표시
  function formatNumber(n) {
    return Number(n || 0).toLocaleString("ko-KR");
  }

  // "2026-07-05" 같은 날짜에서 연도를 빼고 "07.05" 형태로 반환
  function shortDate(dateStr) {
    if (!dateStr) return "";
    var m = String(dateStr).match(/^\d{4}[-.\/]?\s*(\d{1,2})[-.\/](\d{1,2})/);
    if (m) {
      return String(m[1]).padStart(2, "0") + "." + String(m[2]).padStart(2, "0");
    }
    return dateStr;
  }

  /* ---------------- 카운터 (localStorage, 브라우저별 저장) ---------------- */

  function getCount(type, id) {
    var v = window.localStorage.getItem(type + "_" + id);
    return v ? parseInt(v, 10) || 0 : 0;
  }

  function setCount(type, id, val) {
    try {
      window.localStorage.setItem(type + "_" + id, String(val));
    } catch (e) {
      /* localStorage 사용 불가 환경은 조용히 무시 */
    }
  }

  function incrementCount(type, id) {
    var next = getCount(type, id) + 1;
    setCount(type, id, next);
    return next;
  }

  /* ---------------- 카드/행 렌더링 ---------------- */

  function iconBadgeHtml(id, size) {
    var pal = paletteFor(id);
    if (size === "dot") {
      return (
        '<span class="archive-row__badge ' + pal.cls + '">' +
        (ICONS[pal.icon] || "") +
        "</span>"
      );
    }
    return (
      '<span class="news-card__category ' + pal.cls + '">' +
      (ICONS[pal.icon] || "") +
      "</span>"
    );
  }

  function buildNewsCard(article) {
    var id = getArticleId(article);
    var viewCount = getCount("view", id);
    var recCount = getCount("rec", id);
    var url = escapeHtml(article.url || "#");
    var pal = paletteFor(id);
    var photoUrl = "https://picsum.photos/seed/" + encodeURIComponent("news-" + id) + "/160/160";

    var card = document.createElement("div");
    card.className = "news-card";
    card.innerHTML =
      '<div class="news-card__top">' +
        '<div class="news-card__thumb ' + pal.cls + '" style="background-image:url(\'' + photoUrl + '\')">' +
          (ICONS[pal.icon] || "") +
        "</div>" +
        '<div class="news-card__body">' +
          '<h3 class="news-card__title" data-role="title" data-url="' + url + '" data-id="' + id + '">' +
            escapeHtml(article.title) +
          "</h3>" +
          '<p class="news-card__summary">' + escapeHtml(article.summary || "") + "</p>" +
        "</div>" +
      "</div>" +
      '<div class="news-card__divider"></div>' +
      '<div class="news-card__footer">' +
        '<div class="news-card__footer-meta">' +
          '<span class="news-card__source">' + escapeHtml(article.source || "") + "</span>" +
          '<span class="news-card__dot">·</span>' +
          '<span class="news-card__date">' + escapeHtml(shortDate(article.date)) + "</span>" +
        "</div>" +
        '<div class="news-card__footer-stats">' +
          '<button type="button" class="news-card__statitem is-btn" data-role="rec" data-id="' + id + '">' +
            ICONS.thumb + '<span data-role="rec-count">' + formatNumber(recCount) + "</span>" +
          "</button>" +
          '<span class="news-card__statitem" data-role="view-wrap">' +
            ICONS.eye + '<span data-role="view-count" data-id="' + id + '">' + formatNumber(viewCount) + "</span>" +
          "</span>" +
        "</div>" +
      "</div>";
    return card;
  }

  function buildArchiveRow(article) {
    var id = getArticleId(article);
    var viewCount = getCount("view", id);
    var recCount = getCount("rec", id);
    var url = escapeHtml(article.url || "#");

    var row = document.createElement("div");
    row.className = "archive-row";
    row.innerHTML =
      iconBadgeHtml(id, "dot") +
      '<div class="archive-row__title" data-role="title" data-url="' + url + '" data-id="' + id + '">' +
        escapeHtml(article.title) +
      "</div>" +
      '<div class="archive-row__meta">' +
        '<span class="news-card__source">' + escapeHtml(article.source || "") + "</span>" +
        '<span class="news-card__dot">·</span>' +
        '<span class="news-card__date">' + escapeHtml(shortDate(article.date)) + "</span>" +
      "</div>" +
      '<div class="archive-row__stats">' +
        '<button type="button" class="news-card__stat is-btn" data-role="rec" data-id="' + id + '">' +
          ICONS.thumb + '<span data-role="rec-count">' + formatNumber(recCount) + "</span>" +
        "</button>" +
        '<div class="news-card__stat" data-role="view-wrap">' +
          ICONS.eye + '<span data-role="view-count" data-id="' + id + '">' + formatNumber(viewCount) + "</span>" +
        "</div>" +
      "</div>";
    return row;
  }

  /* ---------------- 이벤트 위임: 추천/조회 ---------------- */

  function attachInteractionHandlers(container) {
    container.addEventListener("click", function (e) {
      var recBtn = e.target.closest('[data-role="rec"]');
      if (recBtn) {
        var id = recBtn.getAttribute("data-id");
        var next = incrementCount("rec", id);
        var countEl = recBtn.querySelector('[data-role="rec-count"]');
        if (countEl) countEl.textContent = formatNumber(next);
        recBtn.classList.add("is-active");
        return;
      }
      var titleEl = e.target.closest('[data-role="title"]');
      if (titleEl) {
        var tid = titleEl.getAttribute("data-id");
        var url = titleEl.getAttribute("data-url");
        var nv = incrementCount("view", tid);
        var scope = titleEl.closest(".news-card, .archive-row") || document;
        var vEl = scope.querySelector('[data-role="view-count"][data-id="' + tid + '"]');
        if (vEl) vEl.textContent = formatNumber(nv);
        if (url && url !== "#") {
          window.open(url, "_blank", "noopener");
        }
      }
    });
  }

  /* ---------------- 공개 API ---------------- */

  window.NewsSite = {
    PALETTE: PALETTE,
    ICONS: ICONS,
    escapeHtml: escapeHtml,
    getArticleId: getArticleId,
    getCount: getCount,
    buildNewsCard: buildNewsCard,
    buildArchiveRow: buildArchiveRow,
    attachInteractionHandlers: attachInteractionHandlers
  };
})();
