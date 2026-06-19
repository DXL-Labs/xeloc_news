const LANGUAGES = ['ja', 'en'];

const state = {
  source: null,
  language: 'ja',
  selectedNum: null,
  dirty: false,
};

const els = {
  reloadButton: document.querySelector('#reloadButton'),
  generateButton: document.querySelector('#generateButton'),
  saveButton: document.querySelector('#saveButton'),
  newItemButton: document.querySelector('#newItemButton'),
  duplicateButton: document.querySelector('#duplicateButton'),
  deleteButton: document.querySelector('#deleteButton'),
  commitButton: document.querySelector('#commitButton'),
  newsList: document.querySelector('#newsList'),
  editorMeta: document.querySelector('#editorMeta'),
  editorTitle: document.querySelector('#editorTitle'),
  form: document.querySelector('#editorForm'),
  numInput: document.querySelector('#numInput'),
  dateInput: document.querySelector('#dateInput'),
  statusInput: document.querySelector('#statusInput'),
  titleInput: document.querySelector('#titleInput'),
  bodyInput: document.querySelector('#bodyInput'),
  noteInput: document.querySelector('#noteInput'),
  insertLinkButton: document.querySelector('#insertLinkButton'),
  insertImageButton: document.querySelector('#insertImageButton'),
  insertImageLinkButton: document.querySelector('#insertImageLinkButton'),
  previewTitle: document.querySelector('#previewTitle'),
  previewDate: document.querySelector('#previewDate'),
  previewBody: document.querySelector('#previewBody'),
  commitMessageInput: document.querySelector('#commitMessageInput'),
  pushInput: document.querySelector('#pushInput'),
  gitStatus: document.querySelector('#gitStatus'),
  messageLog: document.querySelector('#messageLog'),
};

function currentItems() {
  return state.source?.[state.language]?.items || [];
}

function selectedItem() {
  return currentItems().find((item) => Number(item.num) === Number(state.selectedNum)) || null;
}

function log(message) {
  els.messageLog.textContent = message;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `API did not return JSON. Check Apache ProxyPass for ${path}. HTTP ${res.status}`,
    );
  }
  if (!res.ok) throw new Error(data?.error || `Request failed. HTTP ${res.status}`);
  return data;
}

function setButtonsDisabled(disabled) {
  [
    els.reloadButton,
    els.generateButton,
    els.saveButton,
    els.newItemButton,
    els.duplicateButton,
    els.deleteButton,
    els.commitButton,
  ].forEach((button) => {
    button.disabled = disabled;
  });
}

function updateGitStatus(status) {
  els.gitStatus.textContent = status || 'Clean';
}

function nextNum(items) {
  if (items.length === 0) return 1;
  return Math.max(...items.map((item) => Number(item.num) || 0)) + 1;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function renderLanguageTabs() {
  document.querySelectorAll('.language-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.language === state.language);
  });
}

function renderList() {
  const items = [...currentItems()].sort((a, b) => Number(b.num) - Number(a.num));
  els.newsList.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No news yet.';
    els.newsList.append(empty);
    return;
  }

  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `news-card${Number(item.num) === Number(state.selectedNum) ? ' active' : ''}`;
    button.innerHTML = `
      <strong>${escapeHtml(item.title || '(Untitled)')}</strong>
      <span>#${item.num} / ${escapeHtml(item.date || 'No date')}</span>
      <span class="status-pill ${item.status === 'draft' ? 'draft' : ''}">${escapeHtml(item.status || 'published')}</span>
    `;
    button.addEventListener('click', () => selectItem(item.num));
    els.newsList.append(button);
  }
}

function renderEditor() {
  const item = selectedItem();
  els.duplicateButton.disabled = !item;
  els.deleteButton.disabled = !item;

  if (!item) {
    els.editorMeta.textContent = 'No item selected';
    els.editorTitle.textContent = 'Select or create news';
    els.form.reset();
    els.previewTitle.textContent = '';
    els.previewDate.textContent = '';
    els.previewBody.textContent = '';
    return;
  }

  els.editorMeta.textContent = `${state.language.toUpperCase()} / #${item.num} / ${item.status}`;
  els.editorTitle.textContent = item.title || '(Untitled)';
  els.numInput.value = item.num;
  els.dateInput.value = item.date || '';
  els.statusInput.value = item.status || 'published';
  els.titleInput.value = item.title || '';
  els.bodyInput.value = item.body || '';
  els.noteInput.value = item.note || '';
  renderPreview();
}

function renderPreview() {
  els.previewTitle.textContent = els.titleInput.value;
  els.previewDate.textContent = els.dateInput.value;
  renderMarkdownPreview(els.bodyInput.value);
}

function renderMarkdownPreview(markdown) {
  els.previewBody.innerHTML = '';

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const linkedImage = line.match(/^\[!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\]\((https?:\/\/[^)\s]+)\)$/);
    if (linkedImage) {
      const [, alt, imageUrl, linkUrl] = linkedImage;
      const link = document.createElement('a');
      link.href = linkUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(createPreviewImage(imageUrl, alt));
      els.previewBody.append(link);
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
    if (image) {
      const [, alt, imageUrl] = image;
      els.previewBody.append(createPreviewImage(imageUrl, alt));
      continue;
    }

    const paragraph = document.createElement('p');
    paragraph.append(...renderInlinePreview(line.replace(/^#{1,2}\s+/, '').replace(/^[-*]\s+/, '')));
    els.previewBody.append(paragraph);
  }
}

function createPreviewImage(src, alt) {
  const image = document.createElement('img');
  image.src = src;
  image.alt = alt || '';
  image.loading = 'lazy';
  return image;
}

function renderInlinePreview(text) {
  const nodes = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const [fullMatch, label, url] = match;
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(document.createTextNode(text.slice(lastIndex, start).replaceAll('**', '')));
    }

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label.replaceAll('**', '');
    nodes.push(link);
    lastIndex = start + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(document.createTextNode(text.slice(lastIndex).replaceAll('**', '')));
  }

  return nodes.length > 0 ? nodes : [document.createTextNode(text.replaceAll('**', ''))];
}

function render() {
  renderLanguageTabs();
  renderList();
  renderEditor();
}

function selectItem(num) {
  persistForm();
  state.selectedNum = Number(num);
  render();
}

function persistForm() {
  const item = selectedItem();
  if (!item) return;

  const nextNumber = Number(els.numInput.value || item.num);
  item.num = nextNumber;
  state.selectedNum = nextNumber;
  item.date = els.dateInput.value;
  item.status = els.statusInput.value;
  item.title = els.titleInput.value;
  item.body = els.bodyInput.value;
  item.note = els.noteInput.value;
}

function markDirty() {
  state.dirty = true;
  persistForm();
  renderPreview();
  renderList();
}

function addItem(seed = {}) {
  persistForm();
  const items = currentItems();
  const num = nextNum(items);
  const item = {
    num,
    status: seed.status || 'draft',
    date: seed.date || today(),
    title: seed.title || '',
    body: seed.body || '',
    createdAt: seed.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    note: seed.note || '',
  };
  items.push(item);
  state.selectedNum = num;
  state.dirty = true;
  render();
}

function duplicateItem() {
  const item = selectedItem();
  if (!item) return;
  addItem({
    status: 'draft',
    date: item.date,
    title: `${item.title} copy`,
    body: item.body,
    note: item.note,
  });
}

function deleteItem() {
  const item = selectedItem();
  if (!item) return;
  const confirmed = window.confirm(`Delete ${state.language.toUpperCase()} #${item.num}?`);
  if (!confirmed) return;

  state.source[state.language].items = currentItems().filter(
    (candidate) => Number(candidate.num) !== Number(item.num),
  );
  state.selectedNum = currentItems()[0]?.num || null;
  state.dirty = true;
  render();
}

async function loadSource() {
  setButtonsDisabled(true);
  try {
    const data = await api('/api/source');
    state.source = data.source;
    state.selectedNum = currentItems()[0]?.num || null;
    state.dirty = false;
    updateGitStatus(data.status);
    render();
    log('Loaded source JSON.');
  } catch (error) {
    log(error.message);
  } finally {
    setButtonsDisabled(false);
    renderEditor();
  }
}

async function saveSource() {
  persistForm();
  setButtonsDisabled(true);
  try {
    const data = await api('/api/save', {
      method: 'POST',
      body: JSON.stringify({ source: state.source }),
    });
    state.dirty = false;
    updateGitStatus(data.status);
    log(`Saved and generated.\n${JSON.stringify(data.generated, null, 2)}`);
    await loadSource();
  } catch (error) {
    log(error.message);
  } finally {
    setButtonsDisabled(false);
    render();
  }
}

async function generateOnly() {
  setButtonsDisabled(true);
  try {
    const data = await api('/api/generate', { method: 'POST', body: '{}' });
    updateGitStatus(data.status);
    log(`Generated delivery files.\n${JSON.stringify(data.generated, null, 2)}`);
  } catch (error) {
    log(error.message);
  } finally {
    setButtonsDisabled(false);
    render();
  }
}

async function commitChanges() {
  persistForm();
  if (state.dirty) {
    const shouldSave = window.confirm('You have unsaved changes. Save and generate before commit?');
    if (!shouldSave) return;
    await saveSource();
  }

  setButtonsDisabled(true);
  try {
    const data = await api('/api/commit', {
      method: 'POST',
      body: JSON.stringify({
        message: els.commitMessageInput.value,
        push: els.pushInput.checked,
      }),
    });
    updateGitStatus(data.status);
    log(data.ok ? 'Committed successfully.' : data.message);
  } catch (error) {
    log(error.message);
  } finally {
    setButtonsDisabled(false);
    render();
  }
}

function insertAtCursor(snippet, selectedTextFallback = '') {
  const input = els.bodyInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const selectedText = input.value.slice(start, end) || selectedTextFallback;
  const value = snippet.replace('{text}', selectedText);

  input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
  input.focus();
  input.selectionStart = start + value.length;
  input.selectionEnd = start + value.length;
  markDirty();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

document.querySelectorAll('.language-tab').forEach((button) => {
  button.addEventListener('click', () => {
    persistForm();
    state.language = button.dataset.language;
    state.selectedNum = currentItems()[0]?.num || null;
    render();
  });
});

els.form.addEventListener('input', markDirty);
els.insertLinkButton.addEventListener('click', () => {
  insertAtCursor('[{text}](https://example.com)', 'link text');
});
els.insertImageButton.addEventListener('click', () => {
  insertAtCursor('![{text}](https://example.com/image.png)', 'image description');
});
els.insertImageLinkButton.addEventListener('click', () => {
  insertAtCursor('[![{text}](https://example.com/image.png)](https://example.com)', 'image description');
});
els.reloadButton.addEventListener('click', loadSource);
els.generateButton.addEventListener('click', generateOnly);
els.saveButton.addEventListener('click', saveSource);
els.newItemButton.addEventListener('click', () => addItem());
els.duplicateButton.addEventListener('click', duplicateItem);
els.deleteButton.addEventListener('click', deleteItem);
els.commitButton.addEventListener('click', commitChanges);

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

loadSource();
