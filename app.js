import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, addDoc,
  deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ===== FIREBASE CONFIG =====
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
const storage = getStorage(app);

// ===== CONSTANTES =====
const FOLDER_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f59e0b',
  '#10b981','#3b82f6','#14b8a6','#f97316','#84cc16'
];
const TAG_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ec4899',
  '#3b82f6','#f97316','#14b8a6','#84cc16'
];
const MAX_IMAGES = 5;

// ===== STATE =====
let isEditMode = false;
let modules = [];
let folders = [];
let files = [];
let selectedFileId = null;
let selectedModuleId = null;
let quill = null;
let saveTimer = null;
let currentTagTarget = null;
let currentTagTargetType = null;
let selectedTagColor = TAG_COLORS[0];
let colorTargetId = null;
let isDashboard = false;
let imagesPanelOpen = true;
let currentView = 'modules'; // 'modules' | 'app'
let moveTarget = null;
let moveTargetType = null; // 'file' | 'folder'
let isCopyOperation = false;
let dragOverModule = null;

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
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  document.body.className = savedTheme === 'violet' ? '' : `theme-${savedTheme}`;
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === savedTheme);
  });
}

// ===== TOPBAR DYNAMIQUE =====
function renderTopbarCenter() {
  const center = document.getElementById('topbar-center');
  center.innerHTML = '';

  if (currentView === 'modules') {
    // Rien dans la topbar sur la vue modules
    return;
  }

  // Bouton retour modules
  const backBtn = document.createElement('button');
  backBtn.className = 'mode-btn back-btn';
  backBtn.textContent = '← Modules';
  backBtn.addEventListener('click', goToModules);
  center.appendChild(backBtn);

  // Bouton mode lecture/édition
  const modeBtn = document.createElement('button');
  modeBtn.id = 'mode-btn';
  modeBtn.className = `mode-btn ${isEditMode ? 'edit-active' : 'read-active'}`;
  modeBtn.textContent = isEditMode ? 'Mode Édition' : 'Mode Lecture';
  modeBtn.addEventListener('click', () => {
    if (!isEditMode) {
      document.getElementById('modal-overlay').classList.remove('hidden');
    } else {
      setEditMode(false);
    }
  });
  center.appendChild(modeBtn);

  // Bouton dashboard switch
  const dashBtn = document.createElement('button');
  dashBtn.id = 'dashboard-btn';
  dashBtn.className = `mode-btn ${isDashboard ? 'edit-active' : 'read-active'}`;
  dashBtn.textContent = isDashboard ? 'Vue Dashboard' : 'Vue Classique';
  dashBtn.addEventListener('click', toggleDashboard);
  center.appendChild(dashBtn);
}

// ===== MODE LECTURE / ÉDITION =====
document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
});
document.getElementById('modal-confirm').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
  setEditMode(true);
});

function setEditMode(value) {
  isEditMode = value;
  const addBtn = document.getElementById('add-root-folder');
  const dashAddBtn = document.getElementById('dashboard-add-folder');
  const addModuleBtn = document.getElementById('add-module-btn');

  addBtn.classList.toggle('hidden', !value);
  dashAddBtn.classList.toggle('hidden', !value);
  addModuleBtn.classList.toggle('hidden', !value);

  if (quill) quill.enable(value);
  renderTopbarCenter();
  renderSidebar();
  if (isDashboard) renderDashboard();
  if (currentView === 'modules') renderModules();

  // Badge lecture seule
  const badge = document.getElementById('read-only-badge');
  if (badge) badge.classList.toggle('hidden', value);

  // Upload images
  const uploadLabel = document.getElementById('images-upload-label');
  if (uploadLabel) uploadLabel.classList.toggle('hidden', !value);
}

// ===== DASHBOARD TOGGLE =====
function toggleDashboard() {
  isDashboard = !isDashboard;
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
  renderTopbarCenter();
}

// ===== NAVIGATION MODULES =====
function goToModules() {
  currentView = 'modules';
  selectedModuleId = null;
  document.getElementById('modules-view').classList.remove('hidden');
  document.getElementById('app-body').classList.add('hidden');
  isDashboard = false;
  renderTopbarCenter();
  renderModules();
}

function goToModule(moduleId) {
  currentView = 'app';
  selectedModuleId = moduleId;
  document.getElementById('modules-view').classList.add('hidden');
  document.getElementById('app-body').classList.remove('hidden');
  isDashboard = false;
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const dashboardView = document.getElementById('dashboard-view');
  sidebar.classList.remove('hidden');
  mainContent.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  renderTopbarCenter();
  renderSidebar();
}

// ===== FIREBASE LISTENERS =====
onSnapshot(query(collection(db, 'modules'), orderBy('order')), snap => {
  modules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (currentView === 'modules') renderModules();
}).catch(() => {
  // Si la collection modules n'existe pas encore, on écoute sans orderBy
  onSnapshot(collection(db, 'modules'), snap => {
    modules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentView === 'modules') renderModules();
  });
});

onSnapshot(query(collection(db, 'folders'), orderBy('createdAt')), snap => {
  folders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (currentView === 'app') {
    renderSidebar();
    if (isDashboard) renderDashboard();
  }
});

onSnapshot(query(collection(db, 'files'), orderBy('createdAt')), snap => {
  files = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (currentView === 'app') {
    renderSidebar();
    if (isDashboard) renderDashboard();
    if (selectedFileId) {
      const f = files.find(x => x.id === selectedFileId);
      if (f) updateEditorHeader(f);
    }
  }
});

// ===== RENDER MODULES =====
function renderModules() {
  const grid = document.getElementById('modules-grid');
  const addBtn = document.getElementById('add-module-btn');
  addBtn.classList.toggle('hidden', !isEditMode);
  grid.innerHTML = '';

  // Module "Sans catégorie" virtuel — dossiers sans moduleId
  const uncategorized = folders.filter(f => !f.parentId && !f.moduleId);

  // Modules réels
  const allModules = [...modules];

  if (allModules.length === 0 && uncategorized.length === 0) {
    grid.innerHTML = `<div class="empty-sidebar" style="grid-column:1/-1;text-align:center;padding:60px">
      ${isEditMode ? 'Créez votre premier module !' : 'Aucun module disponible'}
    </div>`;
    return;
  }

  allModules.forEach((mod, idx) => {
    const card = createModuleCard(mod, idx);
    grid.appendChild(card);
  });

  // Carte "Sans catégorie" si besoin
  if (uncategorized.length > 0) {
    const card = createUncategorizedCard(uncategorized);
    grid.appendChild(card);
  }
}

function createModuleCard(mod, idx) {
  const card = document.createElement('div');
  card.className = 'module-card';
  card.dataset.moduleId = mod.id;
  card.draggable = isEditMode;

  const folderCount = folders.filter(f => !f.parentId && f.moduleId === mod.id).length;

  card.innerHTML = `
    <div class="module-card-name">${(mod.name || '').toUpperCase()}</div>
    <div class="module-card-meta">${folderCount} dossier${folderCount !== 1 ? 's' : ''}</div>
    ${isEditMode ? `<div class="module-card-actions">
      <button class="mod-action-btn" data-action="rename" title="Renommer">✏</button>
      <button class="mod-action-btn" data-action="delete" title="Supprimer">✕</button>
    </div>` : ''}
  `;

  // Click → ouvrir module
  card.addEventListener('click', (e) => {
    if (e.target.closest('.module-card-actions')) return;
    goToModule(mod.id);
  });

  // Actions édition
  if (isEditMode) {
    card.querySelector('[data-action="rename"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const n = prompt('Nouveau nom :', mod.name);
      if (n?.trim()) await updateDoc(doc(db, 'modules', mod.id), { name: n.trim() });
    });
    card.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer le module "${mod.name}" ?`))
        await deleteDoc(doc(db, 'modules', mod.id));
    });

    // Drag & drop pour réordonner
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('moduleId', mod.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('moduleId');
      if (!draggedId || draggedId === mod.id) return;
      await swapModuleOrder(draggedId, mod.id);
    });
  }

  return card;
}

function createUncategorizedCard(uncategorized) {
  const card = document.createElement('div');
  card.className = 'module-card module-card-uncategorized';

  card.innerHTML = `
    <div class="module-card-name">SANS CATÉGORIE</div>
    <div class="module-card-meta">${uncategorized.length} dossier${uncategorized.length !== 1 ? 's' : ''}</div>
  `;
  card.addEventListener('click', () => {
    // Ouvre la vue app avec moduleId = null (dossiers sans module)
    currentView = 'app';
    selectedModuleId = '__uncategorized__';
    document.getElementById('modules-view').classList.add('hidden');
    document.getElementById('app-body').classList.remove('hidden');
    isDashboard = false;
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const dashboardView = document.getElementById('dashboard-view');
    sidebar.classList.remove('hidden');
    mainContent.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    renderTopbarCenter();
    renderSidebar();
  });
  return card;
}

async function swapModuleOrder(draggedId, targetId) {
  const dragged = modules.find(m => m.id === draggedId);
  const target = modules.find(m => m.id === targetId);
  if (!dragged || !target) return;
  const dOrder = dragged.order ?? 0;
  const tOrder = target.order ?? 0;
  await updateDoc(doc(db, 'modules', draggedId), { order: tOrder });
  await updateDoc(doc(db, 'modules', targetId), { order: dOrder });
}

// ===== NOUVEAU MODULE =====
document.getElementById('add-module-btn').addEventListener('click', async () => {
  const name = prompt('Nom du module :');
  if (name?.trim()) {
    const maxOrder = modules.reduce((m, mod) => Math.max(m, mod.order ?? 0), 0);
    await addDoc(collection(db, 'modules'), {
      name: name.trim(),
      order: maxOrder + 1,
      createdAt: serverTimestamp()
    });
  }
});

// ===== NOUVEAU DOSSIER RACINE =====
document.getElementById('add-root-folder').addEventListener('click', addRootFolder);
document.getElementById('dashboard-add-folder').addEventListener('click', addRootFolder);

async function addRootFolder() {
  const name = prompt('Nom du dossier :');
  if (name?.trim()) {
    const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
    const moduleId = selectedModuleId === '__uncategorized__' ? null : (selectedModuleId || null);
    await addDoc(collection(db, 'folders'), {
      name: name.trim(), parentId: null,
      moduleId,
      color, tags: [], createdAt: serverTimestamp()
    });
  }
}

// ===== RENDER SIDEBAR =====
function renderSidebar() {
  const container = document.getElementById('sidebar-content');
  const empty = document.getElementById('empty-sidebar');

  let rootFolders;
  if (selectedModuleId === '__uncategorized__') {
    rootFolders = folders.filter(f => !f.parentId && !f.moduleId);
  } else {
    rootFolders = folders.filter(f => !f.parentId && f.moduleId === selectedModuleId);
  }

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

  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="${folder.color || '#6366f1'}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <path d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z"/>
  </svg>`;
  icon.style.filter = `drop-shadow(0 0 4px ${folder.color || '#6366f1'}66)`;

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
    actions.appendChild(makeActionBtn('◉', 'Couleur', () => openColorPicker(folder.id)));
    actions.appendChild(makeActionBtn('⊞', 'Étiquettes', () => openTagManager(folder.id, 'folder')));
    actions.appendChild(makeActionBtn('⇄', 'Déplacer/Copier', () => openMoveModal(folder.id, 'folder')));
    actions.appendChild(makeActionBtn('＋', 'Nouveau fichier', async () => {
      const n = prompt('Nom du fichier :');
      if (n?.trim()) {
        showRgpdModal(async () => {
          await addDoc(collection(db, 'files'), {
            name: n.trim(), folderId: folder.id,
            content: '', tags: [], images: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(), size: 0
          });
        });
      }
    }));
    actions.appendChild(makeActionBtn('⊕', 'Sous-dossier', async () => {
      const n = prompt('Nom du sous-dossier :');
      if (n?.trim()) {
        const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
        await addDoc(collection(db, 'folders'), {
          name: n.trim(), parentId: folder.id,
          moduleId: folder.moduleId || null,
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
    actions.appendChild(makeActionBtn('⇄', 'Déplacer/Copier', () => openMoveModal(file.id, 'file')));
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

  let rootFolders;
  if (selectedModuleId === '__uncategorized__') {
    rootFolders = folders.filter(f => !f.parentId && !f.moduleId);
  } else {
    rootFolders = folders.filter(f => !f.parentId && f.moduleId === selectedModuleId);
  }

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
      toggleDashboard();
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
  renderImagesPanel(file);
  // Upload label visible seulement en mode édition
  const uploadLabel = document.getElementById('images-upload-label');
  if (uploadLabel) uploadLabel.classList.toggle('hidden', !isEditMode);
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

// ===== PANNEAU IMAGES =====
document.getElementById('images-panel-toggle').addEventListener('click', () => {
  imagesPanelOpen = !imagesPanelOpen;
  const inner = document.getElementById('images-panel-inner');
  const arrow = document.getElementById('images-toggle-arrow');
  inner.classList.toggle('hidden', !imagesPanelOpen);
  arrow.textContent = imagesPanelOpen ? '▶' : '◀';
  document.getElementById('images-panel').classList.toggle('collapsed', !imagesPanelOpen);
});

function renderImagesPanel(file) {
  const grid = document.getElementById('images-grid');
  const countEl = document.getElementById('images-count');
  const images = file.images || [];
  countEl.textContent = `${images.length}/${MAX_IMAGES}`;
  grid.innerHTML = '';

  images.forEach((img, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'image-thumb-wrap';

    const imgEl = document.createElement('img');
    imgEl.src = img.url;
    imgEl.className = 'image-thumb';
    imgEl.title = img.name || '';
    imgEl.addEventListener('click', () => openImageViewer(img.url));

    wrap.appendChild(imgEl);

    if (isEditMode) {
      const del = document.createElement('button');
      del.className = 'image-delete-btn';
      del.textContent = '✕';
      del.title = 'Supprimer';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Supprimer cette image ?')) return;
        // Supprimer dans Storage
        try {
          const storageRef = ref(storage, img.path);
          await deleteObject(storageRef);
        } catch {}
        const newImages = images.filter((_, i) => i !== idx);
        await updateDoc(doc(db, 'files', selectedFileId), { images: newImages });
      });
      wrap.appendChild(del);
    }

    grid.appendChild(wrap);
  });
}

// Upload images
document.getElementById('images-upload-input').addEventListener('change', async (e) => {
  if (!selectedFileId || !isEditMode) return;
  const fileObj = files.find(f => f.id === selectedFileId);
  const currentImages = fileObj?.images || [];

  const toUpload = Array.from(e.target.files);
  const remaining = MAX_IMAGES - currentImages.length;

  if (remaining <= 0) {
    alert(`Limite de ${MAX_IMAGES} images atteinte.`);
    e.target.value = '';
    return;
  }

  const limited = toUpload.slice(0, remaining);
  if (toUpload.length > remaining) {
    alert(`Seulement ${remaining} image(s) peuvent encore être ajoutées. Les premières ${remaining} seront importées.`);
  }

  const countEl = document.getElementById('images-count');
  countEl.textContent = 'Envoi...';

  const newImages = [...currentImages];
  for (const file of limited) {
    const path = `images/${selectedFileId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    newImages.push({ url, path, name: file.name });
  }

  await updateDoc(doc(db, 'files', selectedFileId), { images: newImages });
  e.target.value = '';
});

// ===== VISIONNEUSE IMAGE =====
let zoomLevel = 1;
let isDraggingImg = false;
let imgDragStart = { x: 0, y: 0 };
let imgOffset = { x: 0, y: 0 };

function openImageViewer(url) {
  zoomLevel = 1;
  imgOffset = { x: 0, y: 0 };
  const img = document.getElementById('image-viewer-img');
  img.src = url;
  img.style.transform = `translate(0px, 0px) scale(1)`;
  document.getElementById('zoom-level').textContent = '100%';
  document.getElementById('image-viewer-overlay').classList.remove('hidden');
}

document.getElementById('image-viewer-close').addEventListener('click', () => {
  document.getElementById('image-viewer-overlay').classList.add('hidden');
});

document.getElementById('image-viewer-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('image-viewer-overlay'))
    document.getElementById('image-viewer-overlay').classList.add('hidden');
});

document.getElementById('zoom-in').addEventListener('click', () => {
  zoomLevel = Math.min(zoomLevel + 0.25, 5);
  applyZoom();
});
document.getElementById('zoom-out').addEventListener('click', () => {
  zoomLevel = Math.max(zoomLevel - 0.25, 0.25);
  applyZoom();
});
document.getElementById('zoom-reset').addEventListener('click', () => {
  zoomLevel = 1;
  imgOffset = { x: 0, y: 0 };
  applyZoom();
});

function applyZoom() {
  const img = document.getElementById('image-viewer-img');
  img.style.transform = `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${zoomLevel})`;
  document.getElementById('zoom-level').textContent = `${Math.round(zoomLevel * 100)}%`;
}

// Drag to pan in viewer
const canvas = document.getElementById('image-viewer-canvas');
canvas.addEventListener('mousedown', (e) => {
  isDraggingImg = true;
  imgDragStart = { x: e.clientX - imgOffset.x, y: e.clientY - imgOffset.y };
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('mousemove', (e) => {
  if (!isDraggingImg) return;
  imgOffset = { x: e.clientX - imgDragStart.x, y: e.clientY - imgDragStart.y };
  applyZoom();
});
window.addEventListener('mouseup', () => {
  isDraggingImg = false;
  canvas.style.cursor = 'grab';
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomLevel = e.deltaY < 0
    ? Math.min(zoomLevel + 0.1, 5)
    : Math.max(zoomLevel - 0.1, 0.25);
  applyZoom();
}, { passive: false });

// ===== MODAL DÉPLACER / COPIER =====
function openMoveModal(targetId, targetType) {
  moveTarget = targetId;
  moveTargetType = targetType;
  isCopyOperation = false;
  document.getElementById('move-title').textContent =
    targetType === 'file' ? 'Déplacer le fichier vers...' : 'Déplacer le dossier vers...';
  renderMoveTree();
  document.getElementById('move-overlay').classList.remove('hidden');
}

document.getElementById('move-close').addEventListener('click', () => {
  document.getElementById('move-overlay').classList.add('hidden');
});
document.getElementById('move-cancel').addEventListener('click', () => {
  document.getElementById('move-overlay').classList.add('hidden');
});

document.getElementById('move-confirm').addEventListener('click', async () => {
  await executeMoveOrCopy(false);
  document.getElementById('move-overlay').classList.add('hidden');
});
document.getElementById('move-copy-btn').addEventListener('click', async () => {
  await executeMoveOrCopy(true);
  document.getElementById('move-overlay').classList.add('hidden');
});

let moveDestination = null; // { type: 'folder', id } ou { type: 'root', moduleId }

function renderMoveTree() {
  const tree = document.getElementById('move-tree');
  tree.innerHTML = '';
  moveDestination = null;

  // Option : racine du module courant
  const rootOption = document.createElement('div');
  rootOption.className = 'move-tree-item';
  rootOption.textContent = '📁 Racine du module';
  rootOption.dataset.destType = 'root';
  rootOption.dataset.moduleId = selectedModuleId === '__uncategorized__' ? '' : (selectedModuleId || '');
  rootOption.addEventListener('click', () => {
    tree.querySelectorAll('.move-tree-item').forEach(i => i.classList.remove('selected'));
    rootOption.classList.add('selected');
    moveDestination = { type: 'root', moduleId: rootOption.dataset.moduleId || null };
  });
  tree.appendChild(rootOption);

  // Dossiers disponibles
  const rootFolders = selectedModuleId === '__uncategorized__'
    ? folders.filter(f => !f.parentId && !f.moduleId)
    : folders.filter(f => !f.parentId && f.moduleId === selectedModuleId);

  rootFolders.forEach(f => renderMoveFolder(f, 0, tree));
}

function renderMoveFolder(folder, depth, container) {
  if (moveTargetType === 'folder' && folder.id === moveTarget) return; // skip self

  const item = document.createElement('div');
  item.className = 'move-tree-item';
  item.style.paddingLeft = `${16 + depth * 14}px`;
  item.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="${folder.color || '#6366f1'}" style="margin-right:6px;vertical-align:middle"><path d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z"/></svg>${folder.name}`;
  item.addEventListener('click', () => {
    container.querySelectorAll('.move-tree-item').forEach(i => i.classList.remove('selected'));
    document.getElementById('move-tree').querySelectorAll('.move-tree-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    moveDestination = { type: 'folder', id: folder.id };
  });
  container.appendChild(item);

  folders.filter(f => f.parentId === folder.id)
    .forEach(sub => renderMoveFolder(sub, depth + 1, container));
}

async function executeMoveOrCopy(isCopy) {
  if (!moveDestination) { alert('Veuillez sélectionner une destination.'); return; }

  if (moveTargetType === 'file') {
    const file = files.find(f => f.id === moveTarget);
    if (!file) return;
    const newFolderId = moveDestination.type === 'folder' ? moveDestination.id : null;
    if (isCopy) {
      await addDoc(collection(db, 'files'), {
        ...file, id: undefined, folderId: newFolderId,
        name: file.name + ' (copie)',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(doc(db, 'files', moveTarget), { folderId: newFolderId });
    }
  } else {
    const folder = folders.find(f => f.id === moveTarget);
    if (!folder) return;
    const newParentId = moveDestination.type === 'folder' ? moveDestination.id : null;
    const newModuleId = moveDestination.moduleId !== undefined ? moveDestination.moduleId : folder.moduleId;
    if (isCopy) {
      await addDoc(collection(db, 'folders'), {
        ...folder, id: undefined,
        parentId: newParentId,
        moduleId: newModuleId,
        name: folder.name + ' (copie)',
        createdAt: serverTimestamp()
      });
    } else {
      await updateDoc(doc(db, 'folders', moveTarget), {
        parentId: newParentId,
        moduleId: newModuleId
      });
    }
  }
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

// ===== MODAL RGPD =====
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

// ===== INIT =====
renderTopbarCenter();
renderModules();
JSEOF
echo "app.js written"
