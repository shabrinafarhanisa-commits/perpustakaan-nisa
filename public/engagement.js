(function () {
  'use strict';

  var t = {
    likeBtn: 'Suka', commentsTitle: 'Komentar', commentsEmpty: 'Belum ada komentar. Jadilah yang pertama!',
    namePlaceholder: 'Nama', bodyPlaceholder: 'Tulis komentar...', submit: 'Kirim',
    pending: 'Komentar terkirim, menunggu moderasi.', shareBtn: 'Bagikan', shareCopied: 'Tautan disalin!',
    loading: 'Memuat...', error: 'Gagal memuat.',
  };

  var lastRoot = null;
  var lastKey = null;
  var lastNovelRoot = null;
  var lastNovelKey = null;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function fmtDate(iso) {
    try {
      var d = new Date(String(iso).replace(' ', 'T') + 'Z');
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function renderWidget(root, slug, chapterNum) {
    root.innerHTML = '';
    root.setAttribute('style', 'margin-top:56px; padding-top:24px; border-top:1px solid var(--border);');

    var actionsRow = el('div', { style: 'display:flex; gap:10px; align-items:center; margin-bottom:32px;' });
    var likeBtn = el('button', {
      type: 'button',
      style: 'background:transparent; border:1px solid var(--border); color:var(--text); font-family:"Chakra Petch",sans-serif; font-size:13px; padding:10px 18px; border-radius:3px; cursor:pointer;',
      text: '♡ ' + t.likeBtn,
    });
    var shareBtn = el('button', {
      type: 'button',
      style: 'background:transparent; border:1px solid var(--border); color:var(--text); font-family:"Chakra Petch",sans-serif; font-size:13px; padding:10px 18px; border-radius:3px; cursor:pointer;',
      text: '↗ ' + t.shareBtn,
    });
    actionsRow.appendChild(likeBtn);
    actionsRow.appendChild(shareBtn);
    root.appendChild(actionsRow);

    var liked = false;
    function refreshLikeLabel(count) {
      likeBtn.textContent = (liked ? '♥ ' : '♡ ') + t.likeBtn + (count != null ? ' (' + count + ')' : '');
    }

    fetch('/api/likes?slug=' + encodeURIComponent(slug) + '&chapter=' + chapterNum, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) { liked = !!data.liked; refreshLikeLabel(data.count); })
      .catch(function () {});

    likeBtn.addEventListener('click', function () {
      if (liked || likeBtn.disabled) return;
      likeBtn.disabled = true;
      fetch('/api/likes', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, chapter: chapterNum }),
      }).then(function (r) { return r.json(); })
        .then(function (data) { liked = !!data.liked; refreshLikeLabel(data.count); })
        .finally(function () { likeBtn.disabled = false; });
    });

    shareBtn.addEventListener('click', function () {
      var url = location.origin + location.pathname + '#/' + slug + '/' + chapterNum;
      if (navigator.share) {
        navigator.share({ url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          var prev = shareBtn.textContent;
          shareBtn.textContent = t.shareCopied;
          setTimeout(function () { shareBtn.textContent = prev; }, 2000);
        });
      }
    });

    var title = el('div', {
      style: 'font-family:"Chakra Petch",sans-serif; font-size:14px; letter-spacing:0.5px; color:var(--muted); margin-bottom:16px;',
      text: t.commentsTitle,
    });
    root.appendChild(title);

    var list = el('div', { style: 'display:flex; flex-direction:column; gap:14px; margin-bottom:28px;' });
    list.textContent = t.loading;
    root.appendChild(list);

    fetch('/api/comments?slug=' + encodeURIComponent(slug) + '&chapter=' + chapterNum, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (comments) {
        list.innerHTML = '';
        if (!comments.length) {
          list.appendChild(el('div', { style: 'color:var(--muted2); font-family:monospace; font-size:13px;', text: t.commentsEmpty }));
          return;
        }
        comments.forEach(function (c) {
          var item = el('div', { style: 'padding:12px 14px; background:var(--card); border:1px solid var(--border); border-radius:4px;' });
          var head = el('div', { style: 'display:flex; justify-content:space-between; gap:12px; font-size:12.5px; margin-bottom:6px;' });
          head.appendChild(el('span', { style: 'font-family:"Chakra Petch",sans-serif; font-weight:600; color:var(--text);', text: c.name }));
          head.appendChild(el('span', { style: 'font-family:monospace; color:var(--muted2); white-space:nowrap;', text: fmtDate(c.created_at) }));
          item.appendChild(head);
          item.appendChild(el('div', { style: 'font-size:14px; color:var(--secondary); line-height:1.6; white-space:pre-wrap;', text: c.body }));
          list.appendChild(item);
        });
      })
      .catch(function () { list.textContent = t.error; });

    var form = el('form', { style: 'display:flex; flex-direction:column; gap:10px; max-width:480px;' });
    var nameInput = el('input', {
      type: 'text', placeholder: t.namePlaceholder, maxlength: '60', required: 'required',
      style: 'background:var(--card); border:1px solid var(--border); color:var(--text); font-family:"Work Sans",sans-serif; font-size:14px; padding:10px 12px; border-radius:3px;',
    });
    var bodyInput = el('textarea', {
      placeholder: t.bodyPlaceholder, maxlength: '2000', required: 'required', rows: '3',
      style: 'background:var(--card); border:1px solid var(--border); color:var(--text); font-family:"Work Sans",sans-serif; font-size:14px; padding:10px 12px; border-radius:3px; resize:vertical;',
    });
    var hpInput = el('input', {
      type: 'text', name: 'hp', tabindex: '-1', autocomplete: 'off',
      style: 'position:absolute; left:-9999px; width:1px; height:1px; opacity:0;',
    });
    var msg = el('div', { style: 'font-size:12.5px; color:var(--muted2); font-family:monospace; min-height:16px;' });
    var submitBtn = el('button', {
      type: 'submit',
      style: 'align-self:flex-start; background:oklch(0.72 0.15 165); color:#0f1216; font-family:"Chakra Petch",sans-serif; font-weight:600; font-size:13px; padding:10px 20px; border:none; border-radius:3px; cursor:pointer;',
      text: t.submit,
    });

    form.appendChild(nameInput);
    form.appendChild(bodyInput);
    form.appendChild(hpInput);
    form.appendChild(submitBtn);
    form.appendChild(msg);
    root.appendChild(form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submitBtn.disabled = true;
      fetch('/api/comments', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, chapter: chapterNum, name: nameInput.value, body: bodyInput.value, hp: hpInput.value }),
      }).then(function (r) {
        if (!r.ok) throw new Error('request failed');
        return r.json();
      }).then(function () {
        msg.textContent = t.pending;
        nameInput.value = '';
        bodyInput.value = '';
      }).catch(function () {
        msg.textContent = t.error;
      }).finally(function () {
        submitBtn.disabled = false;
      });
    });
  }

  // Novel-level widget: same idea as renderWidget above (like + comments), but scoped
  // to the whole novel (level=novel, no chapter number) instead of one chapter. Kept as
  // its own function rather than a shared refactor so the per-chapter widget above is
  // never at risk of regressing.
  function renderNovelWidget(root, slug) {
    root.innerHTML = '';
    root.setAttribute('style', 'margin-top:56px; padding-top:24px; border-top:1px solid var(--border);');

    var actionsRow = el('div', { style: 'display:flex; gap:10px; align-items:center; margin-bottom:32px;' });
    var likeBtn = el('button', {
      type: 'button',
      style: 'background:transparent; border:1px solid var(--border); color:var(--text); font-family:"Chakra Petch",sans-serif; font-size:13px; padding:10px 18px; border-radius:3px; cursor:pointer;',
      text: '♡ ' + t.likeBtn,
    });
    var shareBtn = el('button', {
      type: 'button',
      style: 'background:transparent; border:1px solid var(--border); color:var(--text); font-family:"Chakra Petch",sans-serif; font-size:13px; padding:10px 18px; border-radius:3px; cursor:pointer;',
      text: '↗ ' + t.shareBtn,
    });
    actionsRow.appendChild(likeBtn);
    actionsRow.appendChild(shareBtn);
    root.appendChild(actionsRow);

    var liked = false;
    function refreshLikeLabel(count) {
      likeBtn.textContent = (liked ? '♥ ' : '♡ ') + t.likeBtn + (count != null ? ' (' + count + ')' : '');
    }

    fetch('/api/likes?slug=' + encodeURIComponent(slug) + '&level=novel', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) { liked = !!data.liked; refreshLikeLabel(data.count); })
      .catch(function () {});

    likeBtn.addEventListener('click', function () {
      if (liked || likeBtn.disabled) return;
      likeBtn.disabled = true;
      fetch('/api/likes', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, level: 'novel' }),
      }).then(function (r) { return r.json(); })
        .then(function (data) { liked = !!data.liked; refreshLikeLabel(data.count); })
        .finally(function () { likeBtn.disabled = false; });
    });

    shareBtn.addEventListener('click', function () {
      var url = location.origin + location.pathname + '#/' + slug;
      if (navigator.share) {
        navigator.share({ url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          var prev = shareBtn.textContent;
          shareBtn.textContent = t.shareCopied;
          setTimeout(function () { shareBtn.textContent = prev; }, 2000);
        });
      }
    });

    var title = el('div', {
      style: 'font-family:"Chakra Petch",sans-serif; font-size:14px; letter-spacing:0.5px; color:var(--muted); margin-bottom:16px;',
      text: t.commentsTitle,
    });
    root.appendChild(title);

    var list = el('div', { style: 'display:flex; flex-direction:column; gap:14px; margin-bottom:28px;' });
    list.textContent = t.loading;
    root.appendChild(list);

    fetch('/api/comments?slug=' + encodeURIComponent(slug) + '&level=novel', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (comments) {
        list.innerHTML = '';
        if (!comments.length) {
          list.appendChild(el('div', { style: 'color:var(--muted2); font-family:monospace; font-size:13px;', text: t.commentsEmpty }));
          return;
        }
        comments.forEach(function (c) {
          var item = el('div', { style: 'padding:12px 14px; background:var(--card); border:1px solid var(--border); border-radius:4px;' });
          var head = el('div', { style: 'display:flex; justify-content:space-between; gap:12px; font-size:12.5px; margin-bottom:6px;' });
          head.appendChild(el('span', { style: 'font-family:"Chakra Petch",sans-serif; font-weight:600; color:var(--text);', text: c.name }));
          head.appendChild(el('span', { style: 'font-family:monospace; color:var(--muted2); white-space:nowrap;', text: fmtDate(c.created_at) }));
          item.appendChild(head);
          item.appendChild(el('div', { style: 'font-size:14px; color:var(--secondary); line-height:1.6; white-space:pre-wrap;', text: c.body }));
          list.appendChild(item);
        });
      })
      .catch(function () { list.textContent = t.error; });

    var form = el('form', { style: 'display:flex; flex-direction:column; gap:10px; max-width:480px;' });
    var nameInput = el('input', {
      type: 'text', placeholder: t.namePlaceholder, maxlength: '60', required: 'required',
      style: 'background:var(--card); border:1px solid var(--border); color:var(--text); font-family:"Work Sans",sans-serif; font-size:14px; padding:10px 12px; border-radius:3px;',
    });
    var bodyInput = el('textarea', {
      placeholder: t.bodyPlaceholder, maxlength: '2000', required: 'required', rows: '3',
      style: 'background:var(--card); border:1px solid var(--border); color:var(--text); font-family:"Work Sans",sans-serif; font-size:14px; padding:10px 12px; border-radius:3px; resize:vertical;',
    });
    var hpInput = el('input', {
      type: 'text', name: 'hp', tabindex: '-1', autocomplete: 'off',
      style: 'position:absolute; left:-9999px; width:1px; height:1px; opacity:0;',
    });
    var msg = el('div', { style: 'font-size:12.5px; color:var(--muted2); font-family:monospace; min-height:16px;' });
    var submitBtn = el('button', {
      type: 'submit',
      style: 'align-self:flex-start; background:oklch(0.72 0.15 165); color:#0f1216; font-family:"Chakra Petch",sans-serif; font-weight:600; font-size:13px; padding:10px 20px; border:none; border-radius:3px; cursor:pointer;',
      text: t.submit,
    });

    form.appendChild(nameInput);
    form.appendChild(bodyInput);
    form.appendChild(hpInput);
    form.appendChild(submitBtn);
    form.appendChild(msg);
    root.appendChild(form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submitBtn.disabled = true;
      fetch('/api/comments', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, level: 'novel', name: nameInput.value, body: bodyInput.value, hp: hpInput.value }),
      }).then(function (r) {
        if (!r.ok) throw new Error('request failed');
        return r.json();
      }).then(function () {
        msg.textContent = t.pending;
        nameInput.value = '';
        bodyInput.value = '';
      }).catch(function () {
        msg.textContent = t.error;
      }).finally(function () {
        submitBtn.disabled = false;
      });
    });
  }

  function sync() {
    var root = document.getElementById('engagement-root');
    if (!root) { lastRoot = null; lastKey = null; }
    else {
      var slug = root.getAttribute('data-slug');
      var chapter = root.getAttribute('data-chapter');
      if (!slug || !chapter || slug === 'null' || chapter === 'null') {
        if (root.childNodes.length) root.innerHTML = '';
        lastRoot = null; lastKey = null;
      } else {
        var key = slug + '::' + chapter;
        if (root !== lastRoot || key !== lastKey) {
          lastRoot = root; lastKey = key;
          renderWidget(root, slug, Number(chapter));
        }
      }
    }

    var novelRoot = document.getElementById('novel-engagement-root');
    if (!novelRoot) { lastNovelRoot = null; lastNovelKey = null; return; }
    var novelSlug = novelRoot.getAttribute('data-slug');
    if (!novelSlug || novelSlug === 'null') {
      if (novelRoot.childNodes.length) novelRoot.innerHTML = '';
      lastNovelRoot = null; lastNovelKey = null;
      return;
    }
    if (novelRoot === lastNovelRoot && novelSlug === lastNovelKey) return;
    lastNovelRoot = novelRoot; lastNovelKey = novelSlug;
    renderNovelWidget(novelRoot, novelSlug);
  }

  var observer = new MutationObserver(function () { sync(); });
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['data-slug', 'data-chapter'],
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }
})();
