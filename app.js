import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, addDoc,
  deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyByGzXhK9ub9ThcacauTm7ROYP1fBpE1l0",
  authDomain: "mes-notes-app-8618f.firebaseapp.com",
  projectId: "mes-notes-app-8618f",
  storageBucket: "mes-notes-app-8618f.firebasestorage.app",
  messagingSenderId: "513439703452",
  appId: "1:513439703452:web:8aa63f2195c3d7942fa859"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ===== CONSTANTES =====
const FOLDER_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f59e0b','#10b981','#3b82f6','#14b8a6','#f97316','#84cc16'];
const TAG_COLORS    = ['#6366f1','#10b981','#f59e0b','#ec4899','#3b82f6','#f97316','#14b8a6','#84cc16'];

// ===== STATE =====
let isEditMode           = false;
let isDashboard          = false;
let folders              = [];
let files                = [];
let modules              = [];
let selectedFileId       = null;
let currentModuleId      = null;
let quill                = null;
let saveTimer            = null;
let currentTagTarget     = null;
let currentTagTargetType = null;
let selectedTagColor     = TAG_COLORS[0];
let colorTargetId        = null;
let colorTargetType      = 'folder';
let currentImages        = [];
let dragSrcIndex         = null;
let zoomLevel            = 1;
let isDraggingLightbox   = false;
let lightboxStartX = 0, lightboxStartY = 0;
let lightboxTranslateX = 0, lightboxTranslateY = 0;

// Pour la modal image module
let moduleImgTargetId  = null;
let moduleImgBase64    = null;

// ===== THÈMES (commun aux deux écrans) =====
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme;
    document.body.className = theme === 'violet' ? '' : `theme-${theme}`;
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`[data-theme="${theme}"]`).forEach(b => b.classList.add('active'));
    localStorage.setItem('theme', theme);
  });
});

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  document.body.className = savedTheme === 'violet' ? '' : `theme-${savedTheme}`;
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === savedTheme);
  });
}

// ===================================================
// ===== FIREBASE LISTENERS =====
// ===================================================

onSnapshot(query(collection(db, 'modules'), orderBy('createdAt')), snap => {
  modules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderModulesScreen();
});

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

// ===================================================
// ===== ÉCRAN MODULES =====
// ===================================================

function renderModulesScreen() {
  const grid = document.getElementById('modules-grid');
  grid.innerHTML = '';

  modules.forEach(mod => {
    const card = document.createElement('div');
    card.className = 'module-card';
    card.style.setProperty('--module-color', mod.color || '#6366f1');

    // Fond image
    const bg = document.createElement('div');
    bg.className = 'module-card-bg';
    if (mod.image) bg.style.backgroundImage = `url(${mod.image})`;
    else bg.style.background = `linear-gradient(135deg, ${mod.color || '#6366f1'}33, ${mod.color || '#6366f1'}11)`;

    const overlay = document.createElement('div');
    overlay.className = 'module-card-overlay';

    const body = document.createElement('div');
    body.className = 'module-card-body';

    const folderCount = folders.filter(f => f.moduleId === mod.id && !f.parentId).length;

    body.innerHTML = `
      <div class="module-card-title">${mod.name}</div>
      <div class="module-card-meta">${folderCount} dossier${folderCount > 1 ? 's' : ''}</div>
    `;

    card.appendChild(bg);
    card.appendChild(overlay);
    card.appendChild(body);

    // Actions mode édition
    if (isEditMode) {
      const actions = document.createElement('div');
      actions.className = 'module-card-actions';

      actions.appendChild(makeActionBtn('✏', 'Renommer', async (e) => {
        e.stopPropagation();
        const n = prompt('Nouveau nom :', mod.name);
        if (n?.trim()) await updateDoc(doc(db, 'modules', mod.id), { name: n.trim() });
      }));

      actions.appendChild(makeActionBtn('◉', 'Couleur', (e) => {
        e.stopPropagation();
        colorTargetId   = mod.id;
        colorTargetType = 'module';
        openColorPickerGeneric();
      }));

      actions.appendChild(makeActionBtn('🖼', 'Image de fond', (e) => {
        e.stopPropagation();
        openModuleImgModal(mod.id, mod.image || null);
      }));

      actions.appendChild(makeActionBtn('✕', 'Supprimer', async (e) => {
        e.stopPropagation();
        if (confirm(`Supprimer le module "${mod.name}" ?`))
          await deleteDoc(doc(db, 'modules', mod.id));
      }));

      card.appendChild(actions);
    }

    card.addEventListener('click', () => enterModule(mod));
    grid.appendChild(card);
  });

  // Carte "Ajouter" en mode édition
  if (isEditMode) {
    const addCard = document.createElement('div');
    addCard.className = 'module-card-add';
    addCard.innerHTML = `<span>＋</span><span>Nouveau module</span>`;
    addCard.addEventListener('click', async () => {
      const name = prompt('Nom du module :');
      if (name?.trim()) {
        const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
        await addDoc(collection(db, 'modules'), {
          name: name.trim(), color, image: null, createdAt: serverTimestamp()
        });
      }
    });
    grid.appendChild(addCard);
  }

  // Message vide
  if (modules.length === 0 && !isEditMode) {
    grid.innerHTML = `<div class="empty-sidebar" style="grid-column:1/-1;text-align:center;padding:80px 20px;font-size:0.95rem">
      Aucun module disponible.<br><span style="font-size:0.8rem;opacity:0.6">Passez en mode édition pour en créer.</span>
    </div>`;
  }
}

// Entrer dans un module
function enterModule(mod) {
  currentModuleId = mod.id;
  document.getElementById('modules-screen').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('current-module-name').textContent = mod.name;

  // Sync mode édition
  syncEditModeUI();
  renderSidebar();
}

// Retour aux modules
document.getElementById('back-to-modules').addEventListener('click', () => {
  currentModuleId = null;
  selectedFileId  = null;
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('modules-screen').classList.remove('hidden');
  closeEditor();
});

// ===== MODE ÉDITION — Écran modules =====
document.getElementById('modules-mode-btn').addEventListener('click', () => {
  if (!isEditMode) {
    document.getElementById('modal-overlay').classList.remove('hidden');
  } else {
    setEditMode(false);
  }
});

// ===== MODE ÉDITION — App principale =====
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

  // Synchroniser tous les boutons mode
  syncEditModeUI();
  renderSidebar();
  renderModulesScreen();
  if (isDashboard) renderDashboard();
}

function syncEditModeUI() {
  const btns    = [document.getElementById('mode-btn'), document.getElementById('modules-mode-btn')];
  const badge   = document.getElementById('read-only-badge');
  const addBtn  = document.getElementById('add-root-folder');
  const dashAdd = document.getElementById('dashboard-add-folder');
  const modAdd  = document.getElementById('modules-add-btn');

  btns.forEach(btn => {
    if (!btn) return;
    btn.textContent = isEditMode ? 'Mode Édition' : 'Mode Lecture';
    btn.className   = `mode-btn ${isEditMode ? 'edit-active' : 'read-active'}`;
  });

  badge?.classList.toggle('hidden', isEditMode);
  addBtn?.classList.toggle('hidden', !isEditMode);
  dashAdd?.classList.toggle('hidden', !isEditMode);
  modAdd?.classList.toggle('hidden', !isEditMode);

  const uploadLabel = document.getElementById('image-upload-label');
  const uploadHint  = document.getElementById('image-upload-hint');
  if (uploadLabel) uploadLabel.classList.toggle('hidden', !isEditMode);
  if (uploadHint)  uploadHint.classList.toggle('hidden', !isEditMode);

  if (quill) quill.enable(isEditMode);
}

// ===== DASHBOARD =====
document.getElementById('dashboard-btn').addEventListener('click', () => {
  isDashboard = !isDashboard;
  const btn = document.getElementById('dashboard-btn');
  btn.className = `mode-btn ${isDashboard ? 'dashboard-active' : 'dashboard-inactive'}`;
  document.getElementById('sidebar').classList.toggle('hidden', isDashboard);
  document.getElementById('main-content').classList.toggle('hidden', isDashboard);
  document.getElementById('dashboard-view').classList.toggle('hidden', !isDashboard);
  if (isDashboard) renderDashboard();
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
      moduleId: currentModuleId || null,
      color, tags: [], createdAt: serverTimestamp()
    });
  }
}

// ===== RENDER SIDEBAR =====
function renderSidebar() {
  const container   = document.getElementById('sidebar-content');
  const empty       = document.getElementById('empty-sidebar');
  // Filtrer par module courant
  const rootFolders = folders.filter(f => !f.parentId && f.moduleId === currentModuleId);

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
function renderFolder(folder, depth, openByDefault = false) {
  const wrap = document.createElement('div');
  wrap.className = 'folder-item';
  wrap.dataset.folderId = folder.id;

  const header = document.createElement('div');
  header.className = 'folder-header';
  header.style.paddingLeft = `${8 + depth * 14}px`;

  const arrow = document.createElement('span');
  arrow.className = 'folder-arrow';

  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="${folder.color || '#6366f1'}" style="display:block">
    <path d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z"/>
  </svg>`;

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name;

  header.appendChild(arrow);
  header.appendChild(icon);
  header.appendChild(name);

  (folder.tags || []).forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.style.background = tag.color;
    badge.textContent = tag.label;
    header.appendChild(badge);
  });

  if (isEditMode) {
    const actions = document.createElement('div');
    actions.className = 'folder-actions';

    actions.appendChild(makeActionBtn('✏', 'Renommer', async () => {
      const n = prompt('Nouveau nom :', folder.name);
      if (n?.trim()) await updateDoc(doc(db, 'folders', folder.id), { name: n.trim() });
    }));
    actions.appendChild(makeActionBtn('◉', 'Couleur', () => {
      colorTargetId   = folder.id;
      colorTargetType = 'folder';
      openColorPickerGeneric();
    }));
    actions.appendChild(makeActionBtn('⊞', 'Étiquettes', () => openTagManager(folder.id, 'folder')));
    actions.appendChild(makeActionBtn('+', 'Nouveau fichier', async () => {
      const n = prompt('Nom du fichier :');
      if (n?.trim()) {
        showRgpdModal(async () => {
          await addDoc(collection(db, 'files'), {
            name: n.trim(), folderId: folder.id,
            content: '', tags: [], images: [],
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(), size: 0
          });
          openFolderInSidebar(folder.id);
        });
      }
    }));
    actions.appendChild(makeActionBtn('⊕', 'Sous-dossier', async () => {
      const n = prompt('Nom du sous-dossier :');
      if (n?.trim()) {
        const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
        await addDoc(collection(db, 'folders'), {
          name: n.trim(), parentId: folder.id,
          moduleId: currentModuleId || null,
          color, tags: [], createdAt: serverTimestamp()
        });
        openFolderInSidebar(folder.id);
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
  children.className = 'folder-children';

  if (openByDefault) {
    children.classList.remove('hidden');
    arrow.textContent = '▼';
    arrow.classList.add('open');
  } else {
    children.classList.add('hidden');
    arrow.textContent = '▶';
  }

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

// ✅ FIX BUG — Ouvrir le dossier parent dans la sidebar
function openFolderInSidebar(folderId) {
  // Chercher dans le DOM existant d'abord
  let wrap = document.querySelector(`[data-folder-id="${folderId}"]`);

  // Si pas trouvé (sidebar pas encore rendue), forcer le re-render et réessayer
  if (!wrap) {
    renderSidebar();
    wrap = document.querySelector(`[data-folder-id="${folderId}"]`);
  }

  if (!wrap) return;
  const children = wrap.querySelector('.folder-children');
  const arrow    = wrap.querySelector('.folder-arrow');
  if (!children || !arrow) return;
  children.classList.remove('hidden');
  arrow.classList.add('open');
  arrow.textContent = '▼';
}

// ✅ FIX BUG — Ouvrir le dossier parent lors du clic sur un fichier
function openParentFolderOf(file) {
  if (!file.folderId) return;
  openFolderInSidebar(file.folderId);
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

  const rootFolders = folders.filter(f => !f.parentId && f.moduleId === currentModuleId);

  if (rootFolders.length === 0) {
    grid.innerHTML = `<div class="empty-sidebar" style="grid-column:1/-1;text-align:center;padding:60px">
      ${isEditMode ? 'Créez votre premier dossier !' : 'Aucun dossier disponible'}
    </div>`;
    return;
  }

  rootFolders.forEach(folder => {
    const fileCount = files.filter(f => f.folderId === folder.id).length;
    const subCount  = folders.filter(f => f.parentId === folder.id).length;

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
        ${(folder.tags || []).map(t => `<span class="tag-badge" style="background:${t.color}">${t.label}</span>`).join('')}
      </div>
    `;

    card.addEventListener('click', () => {
      isDashboard = false;
      document.getElementById('dashboard-btn').className = 'mode-btn dashboard-inactive';
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

  currentImages = (file.images || []);
  renderImagePanel();

  const uploadLabel = document.getElementById('image-upload-label');
  const uploadHint  = document.getElementById('image-upload-hint');
  if (uploadLabel) uploadLabel.classList.toggle('hidden', !isEditMode);
  if (uploadHint)  uploadHint.classList.toggle('hidden', !isEditMode);

  // ✅ FIX BUG — Ouvrir le dossier parent dans la sidebar
  openParentFolderOf(file);
  renderSidebar();
  // Ré-ouvrir après render car renderSidebar recrée les éléments
  setTimeout(() => openParentFolderOf(file), 50);
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
  currentImages  = [];
  renderImagePanel();
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('editor-wrapper').classList.add('hidden');
}

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
        ['blockquote'], ['clean']
      ]
    }
  });

  quill.on('text-change', () => {
    if (!isEditMode || !selectedFileId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const content = quill.root.innerHTML;
      const size    = new Blob([content]).size;
      await updateDoc(doc(db, 'files', selectedFileId), {
        content, size, updatedAt: serverTimestamp()
      });
    }, 800);
  });
}

// ===== PROPRIÉTÉS =====
function showFileProperties(file) {
  document.getElementById('prop-name').textContent    = file.name;
  document.getElementById('prop-size').textContent    = formatSize(file.size);
  document.getElementById('prop-created').textContent = formatDate(file.createdAt);
  document.getElementById('prop-updated').textContent = formatDate(file.updatedAt);
  document.getElementById('prop-tags').textContent    = (file.tags || []).map(t => t.label).join(', ') || 'Aucune';
  document.getElementById('props-overlay').classList.remove('hidden');
}
document.getElementById('props-close').addEventListener('click', () => {
  document.getElementById('props-overlay').classList.add('hidden');
});

// ===== COULEUR (dossier + module) =====
function openColorPickerGeneric() {
  const grid = document.getElementById('color-grid');
  grid.innerHTML = '';
  FOLDER_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.addEventListener('click', async () => {
      if (colorTargetType === 'module') {
        await updateDoc(doc(db, 'modules', colorTargetId), { color });
      } else {
        await updateDoc(doc(db, 'folders', colorTargetId), { color });
      }
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
  currentTagTarget     = targetId;
  currentTagTargetType = targetType;
  selectedTagColor     = TAG_COLORS[0];

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
  const col    = currentTagTargetType === 'folder' ? 'folders' : 'files';
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

// ===== MODAL IMAGE MODULE =====
function openModuleImgModal(moduleId, currentImage) {
  moduleImgTargetId = moduleId;
  moduleImgBase64   = currentImage;

  const preview    = document.getElementById('module-img-preview');
  const previewImg = document.getElementById('module-img-preview-img');
  document.getElementById('module-img-input').value = '';

  if (currentImage) {
    previewImg.src = currentImage;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }

  document.getElementById('module-img-overlay').classList.remove('hidden');
}

document.getElementById('module-img-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) { alert('Image trop lourde (max 1 Mo)'); return; }
  moduleImgBase64 = await fileToBase64(file);
  const previewImg = document.getElementById('module-img-preview-img');
  previewImg.src = moduleImgBase64;
  document.getElementById('module-img-preview').style.display = 'block';
});

document.getElementById('module-img-confirm').addEventListener('click', async () => {
  if (!moduleImgTargetId) return;
  await updateDoc(doc(db, 'modules', moduleImgTargetId), { image: moduleImgBase64 });
  document.getElementById('module-img-overlay').classList.add('hidden');
});

document.getElementById('module-img-remove').addEventListener('click', async () => {
  if (!moduleImgTargetId) return;
  await updateDoc(doc(db, 'modules', moduleImgTargetId), { image: null });
  document.getElementById('module-img-overlay').classList.add('hidden');
});

document.getElementById('module-img-cancel').addEventListener('click', () => {
  document.getElementById('module-img-overlay').classList.add('hidden');
});

// ===== PANNEAU IMAGES =====
document.getElementById('image-panel-toggle').addEventListener('click', () => {
  const panel = document.getElementById('image-panel');
  const arrow = document.getElementById('panel-arrow');
  const isCollapsed = panel.classList.toggle('collapsed');
  arrow.textContent = isCollapsed ? '◀' : '▶';
});

document.getElementById('image-upload-input').addEventListener('change', async (e) => {
  if (!isEditMode) return;
  const selectedFiles = Array.from(e.target.files);
  const remaining     = 5 - currentImages.length;

  if (remaining <= 0) { alert('Limite de 5 images atteinte.'); e.target.value = ''; return; }

  const toAdd = selectedFiles.slice(0, remaining);
  if (selectedFiles.length > remaining) alert(`Seulement ${remaining} image(s) ajoutée(s).`);

  for (const file of toAdd) {
    if (file.size > 500 * 1024) { alert(`"${file.name}" dépasse 500 Ko.`); continue; }
    const base64 = await fileToBase64(file);
    currentImages.push({ id: Date.now() + Math.random(), base64, name: file.name });
  }

  e.target.value = '';
  renderImagePanel();
  await saveImages();
});

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function renderImagePanel() {
  const list  = document.getElementById('image-list');
  const badge = document.getElementById('image-count-badge');
  if (!list || !badge) return;

  list.innerHTML    = '';
  badge.textContent = `${currentImages.length} / 5`;

  currentImages.forEach((img, index) => {
    const item = document.createElement('div');
    item.className = 'image-item';
    item.draggable = isEditMode;
    item.innerHTML = `
      ${isEditMode ? '<span class="drag-handle">⠿⠿</span>' : ''}
      <span class="image-number">${index + 1}</span>
      <img src="${img.base64}" alt="${img.name}" />
      <div class="image-item-overlay">
        <button class="img-btn-view" title="Agrandir">🔍</button>
        ${isEditMode ? `<button class="img-btn-delete" title="Supprimer">🗑</button>` : ''}
      </div>
    `;

    if (isEditMode) {
      item.addEventListener('dragstart', e => { dragSrcIndex = index; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); document.querySelectorAll('.image-item').forEach(el => el.classList.remove('drag-over')); });
      item.addEventListener('dragover', e => { e.preventDefault(); document.querySelectorAll('.image-item').forEach(el => el.classList.remove('drag-over')); item.classList.add('drag-over'); });
      item.addEventListener('drop', async e => {
        e.preventDefault();
        if (dragSrcIndex === null || dragSrcIndex === index) return;
        const moved = currentImages.splice(dragSrcIndex, 1)[0];
        currentImages.splice(index, 0, moved);
        dragSrcIndex = null;
        renderImagePanel();
        await saveImages();
      });
      item.querySelector('.img-btn-delete').addEventListener('click', async e => {
        e.stopPropagation();
        if (confirm(`Supprimer "${img.name}" ?`)) {
          currentImages.splice(index, 1);
          renderImagePanel();
          await saveImages();
        }
      });
    }

    item.querySelector('.img-btn-view').addEventListener('click', e => { e.stopPropagation(); openLightbox(img.base64); });
    item.addEventListener('click', e => { if (e.target.closest('.image-item-overlay')) return; openLightbox(img.base64); });
    list.appendChild(item);
  });
}

async function saveImages() {
  if (!selectedFileId) return;
  await updateDoc(doc(db, 'files', selectedFileId), {
    images: currentImages.map(i => ({ id: i.id, base64: i.base64, name: i.name }))
  });
}

// ===== LIGHTBOX =====
function openLightbox(src) {
  zoomLevel = 1; lightboxTranslateX = 0; lightboxTranslateY = 0;
  document.getElementById('lightbox-img').src = src;
  updateLightboxZoom();
  document.getElementById('lightbox-img-wrapper').classList.remove('zoomed');
  document.getElementById('lightbox-overlay').classList.remove('hidden');
}

function updateLightboxZoom() {
  document.getElementById('lightbox-img').style.transform =
    `translate(${lightboxTranslateX}px, ${lightboxTranslateY}px) scale(${zoomLevel})`;
  document.getElementById('zoom-level').textContent = `${Math.round(zoomLevel * 100)}%`;
  document.getElementById('lightbox-img-wrapper').classList.toggle('zoomed', zoomLevel > 1);
}

document.getElementById('zoom-in').addEventListener('click',    () => { zoomLevel = Math.min(zoomLevel + 0.25, 4); updateLightboxZoom(); });
document.getElementById('zoom-out').addEventListener('click',   () => { zoomLevel = Math.max(zoomLevel - 0.25, 0.25); if (zoomLevel <= 1) { lightboxTranslateX = 0; lightboxTranslateY = 0; } updateLightboxZoom(); });
document.getElementById('zoom-reset').addEventListener('click', () => { zoomLevel = 1; lightboxTranslateX = 0; lightboxTranslateY = 0; updateLightboxZoom(); });
document.getElementById('lightbox-close').addEventListener('click', () => document.getElementById('lightbox-overlay').classList.add('hidden'));
document.getElementById('lightbox-overlay').addEventListener('click', e => { if (e.target === document.getElementById('lightbox-overlay')) document.getElementById('lightbox-overlay').classList.add('hidden'); });
document.getElementById('lightbox-img-wrapper').addEventListener('wheel', e => {
  e.preventDefault();
  zoomLevel = Math.min(Math.max(zoomLevel + (e.deltaY > 0 ? -0.15 : 0.15), 0.25), 4);
  if (zoomLevel <= 1) { lightboxTranslateX = 0; lightboxTranslateY = 0; }
  updateLightboxZoom();
}, { passive: false });

const lbWrapper = document.getElementById('lightbox-img-wrapper');
lbWrapper.addEventListener('mousedown', e => { if (zoomLevel <= 1) return; isDraggingLightbox = true; lightboxStartX = e.clientX - lightboxTranslateX; lightboxStartY = e.clientY - lightboxTranslateY; });
window.addEventListener('mousemove', e => { if (!isDraggingLightbox) return; lightboxTranslateX = e.clientX - lightboxStartX; lightboxTranslateY = e.clientY - lightboxStartY; updateLightboxZoom(); });
window.addEventListener('mouseup', () => { isDraggingLightbox = false; });

// ===== RGPD =====
let rgpdCallback = null;
function showRgpdModal(callback) {
  rgpdCallback = callback;
  document.getElementById('rgpd-overlay').classList.remove('hidden');
}
document.getElementById('rgpd-cancel').addEventListener('click', () => {
  document.getElementById('rgpd-overlay').classList.add('hidden');
  rgpdCallback = null;
});
document.getElementById('rgpd-confirm').addEventListener('click', async () => {
  document.getElementById('rgpd-overlay').classList.add('hidden');
  if (rgpdCallback) await rgpdCallback();
  rgpdCallback = null;
});

// ===== UTILITAIRES =====
function makeActionBtn(symbol, title, onClick) {
  const btn = document.createElement('button');
  btn.textContent = symbol;
  btn.title = title;
  btn.addEventListener('click', e => { e.stopPropagation(); onClick(e); });
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
