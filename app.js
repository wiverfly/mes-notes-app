import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, addDoc,
  deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️ VOS CLÉS FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyByGzXhK9ub9ThcacauTm7ROYP1fBpE1l0",
  authDomain: "mes-notes-app-8618f.firebaseapp.com",
  projectId: "mes-notes-app-8618f",
  storageBucket: "mes-notes-app-8618f.firebasestorage.app",
  messagingSenderId: "513439703452",
  appId: "1:513439703452:web:8aa63f2195c3d7942fa859"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===== CONSTANTES =====
const FOLDER_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f59e0b',
  '#10b981','#3b82f6','#14b8a6','#f97316','#84cc16'
];
const TAG_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ec4899',
  '#3b82f6','#f97316','#14b8a6','#84cc16'
];

// ===== STATE =====
let isEditMode = false;
let folders = [];
let files = [];
let selectedFileId = null;
let quill = null;
let saveTimer = null;
let currentTagTarget = null;
let currentTagTargetType = null;
let selectedTagColor = TAG_COLORS[0];
let colorTargetId = null;
let isDashboard = false;

// ===== QUILL =====
function initQuill() {
  quill = new Quill('#editor', {
    theme: 'snow',
    placeholder: 'Commencez à écrire...',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        [{ align: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote'],
        ['clean']
      ]
    }
  });

  quill.on('text-change', () => {
    if (!isEditMode || !selectedFileId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const content = quill.root.innerHTML;
      const size = new Blob([content]).size;
      await updateDoc(doc(db, 'files', selectedFileId), {
        content, size, updatedAt: serverTimestamp()
      });
    }, 800);
  });
}

// ===== THÈMES =====
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme;
    document.body.className = theme === 'violet' ? '' : `theme-${theme}`;
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.setItem('theme', theme);
  });
});

// Restaurer le thème sauvegardé
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  document.body.className = savedTheme === 'violet' ? '' : `theme-${savedTheme}`;
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === savedTheme);
  });
}

// ===== MODE LECTURE / ÉDITION =====
document.getElementById('mode-btn').addEventListener('click', () => {
  if (!isEditMode) {
    document.getElementById('modal-overlay').classList.remove('hidden');
  } else {
    setEditMode(false);
  }
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
});

document.getElementById('modal-confirm').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
  setEditMode(true);
});

function setEditMode(value) {
  isEditMode = value;
  const btn = document.getElementById('mode-btn');
  const badge = document.getElementById('read-only-badge');
  const addBtn = document.getElementById('add-root-folder');
  const dashAddBtn = document.getElementById('dashboard-add-folder');

  btn.textContent = value ? 'Mode Édition' : 'Mode Lecture';
  btn.className = `mode-btn ${value ? 'edit-active' : 'read-active'}`;
  badge?.classList.toggle('hidden', value);
  addBtn.classList.toggle('hidden', !value);
  dashAddBtn.classList.toggle('hidden', !value);

  if (quill) quill.enable(value);
  renderSidebar();
  if (isDashboard) renderDashboard();
}

// ===== DASHBOARD TOGGLE =====
document.getElementById('dashboard-toggle').addEventListener('change', (e) => {
  isDashboard = e.target.checked;
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const dashboardView = document.getElementById('dashboard-view');

  if (isDashboard) {
    sidebar.classList.add('hidden');
    mainContent.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    renderDashboard();
  } else {
    sidebar.classList.remove('hidden');
    mainContent.classList.remove('hidden');
    dashboardView.classList.add('hidden');
  }
});

// ===== FIREBASE LISTENERS =====
onSnapshot(query(collection(db, 'folders'), orderBy('createdAt')), snap => {
  folders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSidebar();
  if (isDashboard) renderDashboard();
});

onSnapshot(query(collection(db, 'files'), orderBy('createdAt')), snap => {
  files = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSidebar();
  if (isDashboard) renderDashboard();
  if (selectedFileId) {
    const f = files.find(x => x.id === selectedFileId);
    if (f) updateEditorHeader(f);
  }
});

// ===== NOUVEAU DOSSIER RACINE =====
document.getElementById('add-root-folder').addEventListener('click', addRootFolder);
document.getElementById('dashboard-add-folder').addEventListener('click', addRootFolder);

async function addRootFolder() {
  const name = prompt('Nom du dossier :');
  if (name?.trim()) {
    const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
    await addDoc(collection(db, 'folders'), {
      name: name.trim(), parentId: null,
      color, tags: [], createdAt: serverTimestamp()
    });
  }
}

// ===== RENDER SIDEBAR =====
function renderSidebar() {
  const container = document.getElementById('sidebar-content');
  const empty = document.getElementById('empty-sidebar');
  const rootFolders = folders.filter(f => !f.parentId);

  container.innerHTML = '';

  if (rootFolders.length === 0) {
    empty.classList.remove('hidden');
    empty.textContent = isEditMode ? 'Créez votre premier dossier !' : 'Aucun dossier disponible';
    container.appendChild(empty);
    return;
  }

  rootFolders.forEach(folder => container.appendChild(renderFolder(folder, 0)));
}

// ===== RENDER FOLDER =====
function renderFolder(folder, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'folder-item';

  const header = document.createElement('div');
  header.className = 'folder-header';
  header.style.paddingLeft = `${8 + depth * 14}px`;

  const arrow = document.createElement('span');
  arrow.className = 'folder-arrow';
  arrow.textContent = '▶';

  // ✅ ICÔNE DOSSIER SVG QUI CHANGE DE COULEUR
  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${folder.color || '#6366f1'}" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z"/>
  </svg>`;
  icon.style.filter = `drop-shadow(0 0 4px ${folder.color || '#6366f1'}66)`;

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name;

  header.appendChild(arrow);
  header.appendChild(icon);
  header.appendChild(name);

  // Tags
  (folder.tags || []).forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.style.background = tag.color;
    badge.textContent = tag.label;
    header.appendChild(badge);
  });

  // Actions
  if (isEditMode) {
    const actions = document.createElement('div');
    actions.className = 'folder-actions';

    actions.appendChild(makeActionBtn('✏', 'Renommer', async () => {
      const n = prompt('Nouveau nom :', folder.name);
      if (n?.trim()) await updateDoc(doc(db, 'folders', folder.id), { name: n.trim() });
    }));
    actions.appendChild(makeActionBtn('◉', 'Couleur', () => openColorPicker(folder.id)));
    actions.appendChild(makeActionBtn('⊞', 'Étiquettes', () => openTagManager(folder.id, 'folder')));
    actions.appendChild(makeActionBtn('＋', 'Nouveau fichier', async () => {
      const n = prompt('Nom du fichier :');
      if (n?.trim()) {
        await addDoc(collection(db, 'files'), {
          name: n.trim(), folderId: folder.id,
          content: '', tags: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(), size: 0
        });
      }
    }));
    actions.appendChild(makeActionBtn('⊕', 'Sous-dossier', async () => {
      const n = prompt('Nom du sous-dossier :');
      if (n?.trim()) {
        const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
        await addDoc(collection(db, 'folders'), {
          name: n.trim(), parentId: folder.id,
          color, tags: [], createdAt: serverTimestamp()
        });
      }
    }));
    actions.appendChild(makeActionBtn('✕', 'Supprimer', async () => {
      if (confirm(`Supprimer "${folder.name}" ?`))
        await deleteDoc(doc(db, 'folders', folder.id));
    }));

    header.appendChild(actions);
  }

  wrap.appendChild(header);

  const children = document.createElement('div');
  children.className = 'folder-children hidden';

  folders.filter(f => f.parentId === folder.id)
    .forEach(sub => children.appendChild(renderFolder(sub, depth + 1)));

  files.filter(f => f.folderId === folder.id)
    .forEach(file => children.appendChild(renderFile(file, depth + 1)));

  wrap.appendChild(children);

  header.addEventListener('click', (e) => {
    if (e.target.closest('.folder-actions')) return;
    const isOpen = !children.classList.contains('hidden');
    children.classList.toggle('hidden', isOpen);
    arrow.classList.toggle('open', !isOpen);
    arrow.textContent = isOpen ? '▶' : '▼';
  });

  return wrap;
}

// ===== RENDER FILE =====
function renderFile(file, depth) {
  const item = document.createElement('div');
  item.className = `file-item${file.id === selectedFileId ? ' active' : ''}`;
  item.style.paddingLeft = `${8 + depth * 14}px`;

  const icon = document.createElement('span');
  icon.className = 'file-icon';
  icon.textContent = '📄';

  const name = document.createElement('span');
  name.className = 'file-name';
  name.textContent = file.name;

  item.appendChild(icon);
  item.appendChild(name);

  (file.tags || []).forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.style.background = tag.color;
    badge.textContent = tag.label;
    item.appendChild(badge);
  });

  if (isEditMode) {
    const actions = document.createElement('div');
    actions.className = 'file-actions';
    actions.appendChild(makeActionBtn('ℹ', 'Propriétés', () => showFileProperties(file)));
    actions.appendChild(makeActionBtn('⊞', 'Étiquettes', () => openTagManager(file.id, 'file')));
    actions.appendChild(makeActionBtn('✏', 'Renommer', async () => {
      const n = prompt('Nouveau nom :', file.name);
      if (n?.trim()) await updateDoc(doc(db, 'files', file.id), { name: n.trim() });
    }));
    actions.appendChild(makeActionBtn('✕', 'Supprimer', async () => {
      if (confirm(`Supprimer "${file.name}" ?`)) {
        await deleteDoc(doc(db, 'files', file.id));
        if (selectedFileId === file.id) closeEditor();
      }
    }));
    item.appendChild(actions);
  }

  item.addEventListener('click', (e) => {
    if (e.target.closest('.file-actions')) return;
    openFile(file);
  });

  return item;
}

// ===== DASHBOARD =====
function renderDashboard() {
  const grid = document.getElementById('dashboard-grid');
  grid.innerHTML = '';

  const rootFolders = folders.filter(f => !f.parentId);

  if (rootFolders.length === 0) {
    grid.innerHTML = `<div class="empty-sidebar" style="grid-column:1/-1;text-align:center;padding:60px">
      ${isEditMode ? 'Créez votre premier dossier !' : 'Aucun dossier disponible'}
    </div>`;
    return;
  }

  rootFolders.forEach(folder => {
    const fileCount = files.filter(f => f.folderId === folder.id).length;
    const subCount = folders.filter(f => f.parentId === folder.id).length;

    const card = document.createElement('div');
    card.className = 'dashboard-card';
    card.style.setProperty('--card-color', folder.color || '#6366f1');

    card.innerHTML = `
      <span class="card-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="${folder.color || '#6366f1'}">
          <path d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z"/>
        </svg>
      </span>
      <div class="card-name">${folder.name}</div>
      <div class="card-meta">
        ${fileCount} fichier${fileCount > 1 ? 's' : ''}
        ${subCount > 0 ? ` · ${subCount} sous-dossier${subCount > 1 ? 's' : ''}` : ''}
      </div>
      <div class="card-tags">
        ${(folder.tags || []).map(t =>
          `<span class="tag-badge" style="background:${t.color}">${t.label}</span>`
        ).join('')}
      </div>
    `;

    card.addEventListener('click', () => {
      document.getElementById('dashboard-toggle').checked = false;
      isDashboard = false;
      document.getElementById('sidebar').classList.remove('hidden');
      document.getElementById('main-content').classList.remove('hidden');
      document.getElementById('dashboard-view').classList.add('hidden');
      renderSidebar();
    });

    grid.appendChild(card);
  });
}

// ===== OUVRIR FICHIER =====
function openFile(file) {
  selectedFileId = file.id;
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('editor-wrapper').classList.remove('hidden');
  updateEditorHeader(file);
  if (!quill) initQuill();
  quill.root.innerHTML = file.content || '';
  quill.enable(isEditMode);
  renderSidebar();
}

function updateEditorHeader(file) {
  document.getElementById('editor-title').textContent = file.name;
  document.getElementById('read-only-badge')?.classList.toggle('hidden', isEditMode);
  const tagContainer = document.getElementById('file-tag-badges');
  tagContainer.innerHTML = '';
  (file.tags || []).forEach(tag => {
    const b = document.createElement('span');
    b.className = 'tag-badge';
    b.style.background = tag.color;
    b.textContent = tag.label;
    tagContainer.appendChild(b);
  });
}

function closeEditor() {
  selectedFileId = null;
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('editor-wrapper').classList.add('hidden');
}

// ===== PROPRIÉTÉS =====
function showFileProperties(file) {
  document.getElementById('prop-name').textContent = file.name;
  document.getElementById('prop-size').textContent = formatSize(file.size);
  document.getElementById('prop-created').textContent = formatDate(file.createdAt);
  document.getElementById('prop-updated').textContent = formatDate(file.updatedAt);
  document.getElementById('prop-tags').textContent =
    (file.tags || []).map(t => t.label).join(', ') || 'Aucune';
  document.getElementById('props-overlay').classList.remove('hidden');
}

document.getElementById('props-close').addEventListener('click', () => {
  document.getElementById('props-overlay').classList.add('hidden');
});

// ===== COULEUR DOSSIER =====
function openColorPicker(folderId) {
  colorTargetId = folderId;
  const grid = document.getElementById('color-grid');
  grid.innerHTML = '';
  FOLDER_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.addEventListener('click', async () => {
      await updateDoc(doc(db, 'folders', colorTargetId), { color });
      document.getElementById('color-overlay').classList.add('hidden');
    });
    grid.appendChild(swatch);
  });
  document.getElementById('color-overlay').classList.remove('hidden');
}

document.getElementById('color-cancel').addEventListener('click', () => {
  document.getElementById('color-overlay').classList.add('hidden');
});

// ===== TAGS =====
function openTagManager(targetId, targetType) {
  currentTagTarget = targetId;
  currentTagTargetType = targetType;
  selectedTagColor = TAG_COLORS[0];

  const picker = document.getElementById('tag-color-picker');
  picker.innerHTML = '';
  TAG_COLORS.forEach(color => {
    const dot = document.createElement('div');
    dot.className = `tag-color-dot${color === selectedTagColor ? ' selected' : ''}`;
    dot.style.background = color;
    dot.addEventListener('click', () => {
      selectedTagColor = color;
      picker.querySelectorAll('.tag-color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    picker.appendChild(dot);
  });

  renderTagList();
  document.getElementById('tag-input').value = '';
  document.getElementById('tag-overlay').classList.remove('hidden');
}

function renderTagList() {
  const target = currentTagTargetType === 'folder'
    ? folders.find(f => f.id === currentTagTarget)
    : files.find(f => f.id === currentTagTarget);

  const list = document.getElementById('tag-list');
  list.innerHTML = '';
  (target?.tags || []).forEach((tag, i) => {
    const item = document.createElement('div');
    item.className = 'tag-item';
    item.style.background = tag.color;
    item.textContent = tag.label;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async () => {
      const newTags = [...(target.tags || [])];
      newTags.splice(i, 1);
      const col = currentTagTargetType === 'folder' ? 'folders' : 'files';
      await updateDoc(doc(db, col, currentTagTarget), { tags: newTags });
      renderTagList();
    });
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

document.getElementById('tag-add-btn').addEventListener('click', async () => {
  const label = document.getElementById('tag-input').value.trim();
  if (!label) return;
  const col = currentTagTargetType === 'folder' ? 'folders' : 'files';
  const target = currentTagTargetType === 'folder'
    ? folders.find(f => f.id === currentTagTarget)
    : files.find(f => f.id === currentTagTarget);
  const newTags = [...(target?.tags || []), { label, color: selectedTagColor }];
  await updateDoc(doc(db, col, currentTagTarget), { tags: newTags });
  document.getElementById('tag-input').value = '';
  renderTagList();
});

document.getElementById('tag-cancel').addEventListener('click', () => {
  document.getElementById('tag-overlay').classList.add('hidden');
});

// ===== UTILITAIRES =====
function makeActionBtn(symbol, title, onClick) {
  const btn = document.createElement('button');
  btn.textContent = symbol;
  btn.title = title;
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatDate(ts) {
  if (!ts) return 'Inconnue';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('fr-FR');
}
