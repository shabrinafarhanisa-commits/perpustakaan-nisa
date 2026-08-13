// Renders novel cards from data (novels.json), not hardcoded per novel.
// Usage: renderNovelGrid(document.getElementById('grid'), novels, { onOpen: (slug) => ... });

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function chapterLabel(n, lang) {
  return lang === 'en' ? `${n.chapterCount} chapters` : `${n.chapterCount} bab`;
}

function novelCardHtml(n, lang) {
  const genreBadges = n.genre.map((g) => `<span class="novel-card__genre">${escapeHtml(g)}</span>`).join('');
  const roleBadge = n.role ? `<span class="novel-card__role">${escapeHtml(n.role)}</span>` : '';
  return `
    <div class="novel-card" data-slug="${escapeHtml(n.slug)}">
      <img class="novel-card__cover" src="${escapeHtml(n.coverUrl)}" alt="${escapeHtml(n.title)}" />
      <div class="novel-card__body">
        <div class="novel-card__badges">${genreBadges}${roleBadge}</div>
        <div class="novel-card__blurb">${escapeHtml(n.blurb)}</div>
        <div class="novel-card__chapters">${escapeHtml(chapterLabel(n, lang))}</div>
      </div>
    </div>`;
}

function renderNovelGrid(container, novels, { lang = 'id', onOpen } = {}) {
  container.className = 'novel-grid';
  container.innerHTML = novels.map((n) => novelCardHtml(n, lang)).join('');
  if (onOpen) {
    container.querySelectorAll('.novel-card').forEach((el) => {
      el.addEventListener('click', () => onOpen(el.dataset.slug));
    });
  }
}
