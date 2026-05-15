// ── CONFIG ──
let GITHUB_TOKEN = localStorage.getItem('cbs-github-token') || '';
const GIST_FILENAME = 'cbs-research-tracker.json';
const GIST_DESCRIPTION = 'CBS Research Tracker Data';

// ── CONSTANTS ──
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const COLORS = ['#2E7EC7','#E24B4A','#C97B1A','#5A8F1E','#7F77DD','#1A9B8A','#C96BBF','#E8833A','#3A9E6E','#888780'];
const TASK_COLORS = ['#FEE440','#FFB3BA','#B8F2C8','#B8DEFF','#FFD6AA','#DDB5FF'];
const TASK_ICONS = [
  {i:'✎',l:'Note'}, {i:'✉',l:'Email'}, {i:'☎',l:'Call'}, {i:'◉',l:'Meeting'},
  {i:'★',l:'Important'}, {i:'⚡',l:'Urgent'}, {i:'✈',l:'Travel'}, {i:'⊕',l:'Research'},
  {i:'≡',l:'Document'}, {i:'⌨',l:'IT/Tech'}, {i:'♦',l:'Other'}, {i:'$',l:'Finance'}
];
const CATEGORIES = ['Research','Institutional','Consulting','Fellowship','Other'];
const INITIAL_PROJECTS = [];

// ── STATE ──
let state = {
  projects: [],
  tasks: [],
  calendar: {},
  gistId: null,
  syncing: false,
  syncStatus: 'idle',
  lastSynced: null,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  selectedDay: null,
  expandedId: null,
  showModal: false,
  showTaskModal: false,
  showMenu: false,
  ganttStart: '2025-05-01',
  ganttEnd: '2026-05-01',
  expandedMilestones: {},
  editingNote: null,
  editProject: null,
  form: {},
  taskForm: {},
  showArchived: false,
  todaySectionOrder: ['overdue', 'tasks', 'assigned', 'pending']
};

// ── GITHUB GIST API ──
async function gistRequest(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

async function loadFromGist() {
  try {
    const gists = await gistRequest('GET', '/gists');
    const existing = gists.find(g => g.description === GIST_DESCRIPTION && g.files[GIST_FILENAME]);
    if (existing) {
      state.gistId = existing.id;
      const full = await gistRequest('GET', `/gists/${existing.id}`);
      const content = full.files[GIST_FILENAME].content;
      const data = JSON.parse(content);
      state.projects = data.projects || INITIAL_PROJECTS;
      state.tasks = data.tasks || [];
      state.calendar = data.calendar || {};
      migrateData();
    } else {
      state.projects = INITIAL_PROJECTS;
      state.tasks = [];
      state.calendar = {};
      await saveToGist();
    }
    state.syncStatus = 'ok';
  } catch(e) {
    console.error(e);
    state.syncStatus = 'err';
    const local = localStorage.getItem('cbs-tracker-fallback');
    if (local) {
      const d = JSON.parse(local);
      state.projects = d.projects || INITIAL_PROJECTS;
      state.tasks = d.tasks || [];
      state.calendar = d.calendar || {};
    } else {
      state.projects = INITIAL_PROJECTS;
      state.calendar = {};
    }
  }
}

async function saveToGist() {
  const content = JSON.stringify({ projects: state.projects, tasks: state.tasks, calendar: state.calendar }, null, 2);
  localStorage.setItem('cbs-tracker-fallback', content);
  try {
    state.syncing = true;
    updateSyncStatus();
    if (state.gistId) {
      await gistRequest('PATCH', `/gists/${state.gistId}`, {
        files: { [GIST_FILENAME]: { content } }
      });
    } else {
      const res = await gistRequest('POST', '/gists', {
        description: GIST_DESCRIPTION,
        public: false,
        files: { [GIST_FILENAME]: { content } }
      });
      state.gistId = res.id;
    }
    state.syncStatus = 'ok';
    state.lastSynced = new Date();
  } catch(e) {
    console.error(e);
    state.syncStatus = 'err';
  } finally {
    state.syncing = false;
    updateSyncStatus();
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToGist, 1500);
}

// ── AUTO-ARCHIVE ──
function autoArchiveTasks() {
  const now = new Date();
  let changed = false;
  state.tasks = state.tasks.map(t => {
    if (t.done && t.completedAt && !t.archived) {
      if ((now - new Date(t.completedAt)) >= 24 * 60 * 60 * 1000) {
        changed = true;
        return {...t, archived: true};
      }
    }
    return t;
  });
  if (changed) scheduleSave();
}

// ── MIGRATION ──
function migrateData() {
  state.tasks = state.tasks || [];
  state.projects = state.projects.map(p => ({
    ...p,
    notes: Array.isArray(p.notes) ? p.notes
      : (p.notes ? [{id:`n${Date.now()}`, text:p.notes, createdAt: new Date().toISOString()}] : []),
    milestones: p.milestones.map(m => ({...m, notes: Array.isArray(m.notes) ? m.notes : []}))
  }));
}
