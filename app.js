// ============================================================
// FIREBASE CONFIGURATION
// ⚠️ Remplacez les valeurs par celles copiées depuis Firebase
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, addDoc,
  deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_AUTH_DOMAIN",
  projectId: "VOTRE_PROJECT_ID",
  storageBucket: "VOTRE_STORAGE_BUCKET",
  messagingSenderId: "VOTRE_MESSAGING_SENDER_ID",
  appId: "VOTRE_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================================
// CONSTANTES
// ============================================================
const FOLDER_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f59e0b',
  '#10b981','#3b82f6','#14b8a6','#f97316','#84cc16'
];

const TAG_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ec4899',
  '#3b82f6','#f97316','#14b8a6','#84cc16'
];

// ============================================================
// STATE
// ============================================================
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

// ============================================================
// QUILL EDITOR INIT
// ============================================================
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
        content,
        size,
        updatedAt: serverTimestamp()
      });
    }, 800);
  });
}

// ============================================================
// MODE LECTURE / ÉDITION
// ============================================================
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

  if (value) {
    btn.textContent = '✏️ Mode Édition';
    btn.className = 'mode-btn edit-active';
    if (badge) badge.classList.add('hidden');
    addBtn.classList.remove('hidden');
  } else {
    btn.textContent = '👁️ Mode Lecture';
    btn.className = 'mode-btn read-active';
    if (badge) badge.classList.remove('hidden');
    addBtn.classList.add('hidden');
  }

  if (quill) quill.enable(value);
  renderSidebar();
}

// ============================================================
// FIREBASE — ÉCOUTE TEMPS RÉEL
// ============================================================
onSnapshot(query(collection(db, 'folders'), orderBy('createdAt')), snap => {
  folders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSidebar();
});

onSnapshot(query(collection(db, 'files'), orderBy('createdAt')), snap => {
  files = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSidebar();
  if (selectedFileId) {
    const f = files.find(x => x.id === selectedFileId);
    if (f) updateEditorHeader(f);
  }
});

// ============================================================
// NOUVEAU DOSSIER RACINE
// ============================================================
document.getElementById('add-root-folder').addEventListener('click', async () => {
  const name = prompt('Nom du dossier :');
  if (name?.trim()) {
    const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
    await addDoc(collection(db, 'folders'), {
      name: name.trim(),
      parentId: null,
      color,
      tags: [],
      createdAt: serverTimestamp()
    });
  }
});

// ============================================================
// RENDER SIDEBAR
// ============================================================
function renderSidebar() {
  const container = document.getElementById('sidebar-content');
  const empty = document.getElementById('empty-sidebar');
  const rootFolders = folders.filter(f => !f.parentId);

  container.innerHTML = '';

  if (rootFolders.length === 0) {
    empty.classList.remove('hidden');
    empty.textContent = isEditMode
      ? '➕ Créez votre premier dossier !'
      : '📂 Aucun dossier disponible';
    container.appendChild(empty);
    return;
  }

  rootFolders.forEach(folder => {
    container.appendChild(renderFolder(folder, 0));
  });
}

function renderFolder(folder, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'folder-item';

  // Header
  const header = document.createElement('div');
  header.className = 'folder-header';
  header.style.paddingLeft = `${8 + depth * 14}px`;

  // Arrow
  const arrow = document.createElement('span');
  arrow.className = 'folder-arrow';
  arrow.textContent = '▶';

  // Icon
  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.textContent = '📁';
  icon.style.color = folder.color || '#6366f1';
  icon.style.filter = `drop-shadow(0 0 6px ${folder.color || '#6366f1'}88)`;

  // Name
  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name;

  // Tags
  (folder.tags || []).forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.style.background = tag.color;
    badge.textContent = tag.label;
    header.appendChild(badge);
  });

  header.appendChild(arrow);
  header.appendChild(icon);
  header.appendChild(name);

  // Actions (mode édition)
  if (isEditMode) {
    const actions = document.createElement('div');
    actions.className = 'folder-actions';

    const btnRename = makeActionBtn('✏️', 'Renommer', async () => {
      const n = prompt('Nouveau nom :', folder.name);
      if (n?.trim()) await updateDoc(doc(db, 'folders', folder.id), { name: n.trim() });
    });

    const btnColor = makeActionBtn('🎨', 'Couleur', () => {
      openColorPicker(folder.id);
    });

    const btnTag = makeActionBtn('🏷️', 'Étiquettes', () => {
      openTagManager(folder.id, 'folder');
    });

    const btnAddFile = makeActionBtn('📄', 'Nouveau fichier', async () => {
      const n = prompt('Nom du fichier :');
      if (n?.trim()) {
        await addDoc(collection(db, 'files'), {
          name: n.trim(),
          folderId: folder.id,
          content: '',
          tags: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          size: 0
        });
      }
    });

    const btnAddSub = makeActionBtn('📁', 'Sous-dossier', async () => {
      const n = prompt('Nom du sous-dossier :');
      if (n?.trim()) {
        const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
        await addDoc(collection(db, 'folders'), {
          name: n.trim(),
          parentId: folder.id,
          color,
          tags: [],
          createdAt: serverTimestamp()
        });
      }
    });

    const btnDelete = makeActionBtn('🗑️', 'Supprimer', async () => {
      if (confirm(`Supprimer le dossier "${folder.name}" ?`)) {
        await deleteDoc(doc(db, 'folders', folder.id));
      }
    });

    actions.appendChild(btnRename);
    actions.appendChild(btnColor);
    actions.appendChild(btnTag);
    actions.appendChild(btnAddFile);
    actions.appendChild(btnAddSub);
    actions.appendChild(btnDelete);
    header.appendChild(actions);
  }

  wrap.appendChild(header);

  // Children container
  const children = document.createElement('div');
  children.className = 'folder-children hidden';

  // Sub-folders
  const subFolders = folders.filter(f => f.parentId === folder.id);
  subFolders.forEach(sub => children.appendChild(renderFolder(sub, depth + 1)));

  // Files
  const folderFiles = files.filter(f => f.folderId === folder.id);
  folderFiles.forEach(file => children.appendChild(renderFile(file, depth + 1)));

  wrap.appendChild(children);

  // Toggle open/close
  header.addEventListener('click', (e) => {
    if (e.target.closest('.folder-actions')) return;
    const isOpen = !children.classList.contains('hidden');
    children.classList.toggle('hidden', isOpen);
    arrow.classList.toggle('open', !isOpen);
    arrow.textContent = isOpen ? '▶' : '▼';
  });

  return wrap;
}

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

  // Tags
  (file.tags || []).forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.style.background = tag.color;
    badge.textContent = tag.label;
    item.appendChild(badge);
  });

  // Actions (mode édition)
  if (isEditMode) {
    const actions = document.createElement('div');
    actions.className = 'file-actions';

    const btnProps = makeActionBtn('ℹ️', 'Propriétés', () => showFileProperties(file));
    const btnTag = makeActionBtn('🏷️', 'Étiquettes', () => openTagManager(file.id, 'file'));
    const btnRename = makeActionBtn('✏️', 'Renommer', async () => {
      const n = prompt('Nouveau nom :', file.name);
      if (n?.trim()) await updateDoc(doc(db, 'files', file.id), { name: n.trim() });
    });
    const btnDelete = makeActionBtn('🗑️', 'Supprimer', async () => {
      if (confirm(`Supprimer "${file.name}" ?`)) {
        await deleteDoc(doc(db, 'files', file.id));
        if (selectedFileId === file.id) closeEditor();
      }
    });

    actions.appendChild(btnProps);
    actions.appendChild(btnTag);
    actions.appendChild(btnRename);
    actions.appendChild(btnDelete);
    item.appendChild(actions);
  }

  // Sélection du fichier
  item.addEventListener('click', (e) => {
    if (e.target.closest('.file-actions')) return;
    openFile(file);
  });

  return item;
}

function makeActionBtn(emoji, title, onClick) {
  const btn = document.createElement('button');
  btn.textContent = emoji;
  btn.title = title;
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

// ============================================================
// OUVRIR / FERMER UN FICHIER
// ============================================================
function openFile(file) {
  selectedFileId = file.id;

  document.getElementById('empty-state').classList.add('hidden');
  const wrapper = document.getElementById('editor-wrapper');
  wrapper.classList.remove('hidden');

  updateEditorHeader(file);

  if (!quill) initQuill();
  quill.root.innerHTML = file.content || '';
  quill.enable(isEditMode);
  renderSidebar();
}

function updateEditorHeader(file) {
  document.getElementById('editor-title').textContent = file.name;
  const badge = document.getElementById('read-only-badge');
  if (isEditMode) {
    badge.classList.add('hidden');
  } else {
    badge.classList.remove('hidden');
  }

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

// ============================================================
// PROPRIÉTÉS DU FICHIER
// ============================================================
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

// ============================================================
// COULEUR DU DOSSIER
// ============================================================
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

// ============================================================
// GESTION DES TAGS
// ============================================================
function openTagManager(targetId, targetType) {
  currentTagTarget = targetId;
  currentTagTargetType = targetType;
  selectedTagColor = TAG_COLORS[0];

  // Color picker
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
    item.innerHTML = `${tag.label}`;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async () => {
      const newTags = [...(target.tags || [])];
      newTags.splice(i, 1);
      const collectionName = currentTagTargetType === 'folder' ? 'folders' : 'files';
      await updateDoc(doc(db, collectionName, currentTagTarget), { tags: newTags });
    });
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

document.getElementById('tag-add-btn').addEventListener('click', async () => {
  const label = document.getElementById('tag-input').value.trim();
  if (!label) return;

  const collectionName = currentTagTargetType === 'folder' ? 'folders' : 'files';
  const target = currentTagTargetType === 'folder'
    ? folders.find(f => f.id === currentTagTarget)
    : files.find(f => f.id === currentTagTarget);

  const newTags = [...(target?.tags || []), { label, color: selectedTagColor }];
  await updateDoc(doc(db, collectionName, currentTagTarget), { tags: newTags });
  document.getElementById('tag-input').value = '';
  renderTagList();
});

document.getElementById('tag-cancel').addEventListener('click', () => {
  document.getElementById('tag-overlay').classList.add('hidden');
});

// ============================================================
// UTILITAIRES
// ============================================================
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