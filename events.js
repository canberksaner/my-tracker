let _msDrag = null;
let _sectionDrag = null;
let _taskDrag = null;
let clockInterval = null;

function startClock() {
  clearInterval(clockInterval);
  const el = document.getElementById('today-clock');
  if (!el) return;
  clockInterval = setInterval(() => {
    el.textContent = new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:'Europe/London'});
  }, 1000);
}

function updateSyncStatus() {
  const el = document.querySelector('.sync-status');
  if (!el) return;
  if (state.syncing) { el.textContent = 'Syncing...'; el.className = 'sync-status'; }
  else if (state.syncStatus === 'ok') { el.textContent = '✓ Synced'; el.className = 'sync-status ok'; }
  else { el.textContent = '⚠ Offline (saved locally)'; el.className = 'sync-status err'; }
}

function attachSetupEvents() {
  const input = document.getElementById('setup-token-input');
  const btn = document.getElementById('setup-save-btn');
  async function submit() {
    const val = input?.value.trim();
    if (!val) return;
    btn.textContent = '...';
    btn.disabled = true;
    try {
      const res = await fetch('https://api.github.com/gists', {
        headers: { 'Authorization': `token ${val}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!res.ok) throw new Error('invalid');
    } catch(e) {
      btn.textContent = 'OK';
      btn.disabled = false;
      input.style.borderColor = '#E24B4A';
      input.value = '';
      input.placeholder = 'Invalid key, try again';
      return;
    }
    localStorage.setItem('cbs-github-token', val);
    GITHUB_TOKEN = val;
    render();
    await loadFromGist();
    render();
  }
  btn?.addEventListener('click', submit);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

function refreshModalMilestoneList() {
  const list = document.getElementById('milestone-list');
  if (list) {
    list.innerHTML = renderModalMilestoneList(state.form.milestones, state.form.color);
    attachRemoveMilestoneEvents();
  }
}

function attachRemoveMilestoneEvents() {
  document.querySelectorAll('[data-remove-milestone]').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.removeMilestone);
      state.form.milestones = state.form.milestones.filter((_,idx) => idx !== i);
      refreshModalMilestoneList();
    });
  });
  document.querySelectorAll('[data-modal-ms-up]').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.modalMsUp);
      if (i <= 0) return;
      const ms = [...state.form.milestones];
      [ms[i-1], ms[i]] = [ms[i], ms[i-1]];
      state.form.milestones = ms;
      refreshModalMilestoneList();
    });
  });
  document.querySelectorAll('[data-modal-ms-down]').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.modalMsDown);
      if (i >= state.form.milestones.length-1) return;
      const ms = [...state.form.milestones];
      [ms[i], ms[i+1]] = [ms[i+1], ms[i]];
      state.form.milestones = ms;
      refreshModalMilestoneList();
    });
  });
}

function attachEvents() {
  // Gantt range selects
  function syncGanttRange() {
    const sm = document.getElementById('gantt-start-month')?.value;
    const sy = document.getElementById('gantt-start-year')?.value;
    const em = document.getElementById('gantt-end-month')?.value;
    const ey = document.getElementById('gantt-end-year')?.value;
    if (sm && sy) state.ganttStart = `${sy}-${sm}-01`;
    if (em && ey) state.ganttEnd = `${ey}-${em}-01`;
    render();
  }
  ['gantt-start-month','gantt-start-year','gantt-end-month','gantt-end-year'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', syncGanttRange);
  });

  // Hamburger menu
  document.getElementById('btn-menu')?.addEventListener('click', () => { state.showMenu = true; render(); });
  document.getElementById('menu-overlay')?.addEventListener('click', () => { state.showMenu = false; render(); });

  // Export backup
  document.getElementById('menu-export')?.addEventListener('click', () => {
    const data = JSON.stringify({ projects: state.projects, calendar: state.calendar }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracker-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    state.showMenu = false; render();
  });

  // Import backup
  document.getElementById('menu-import')?.addEventListener('click', () => {
    document.getElementById('import-file-input')?.click();
  });
  document.getElementById('import-file-input')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.projects) throw new Error('invalid');
        state.projects = data.projects;
        state.calendar = data.calendar || {};
        state.showMenu = false;
        await saveToGist();
        render();
      } catch { alert('Invalid backup file.'); }
    };
    reader.readAsText(file);
  });

  // Manual sync
  document.getElementById('sync-btn')?.addEventListener('click', () => {
    if (!state.syncing) saveToGist().then(() => render());
  });

  // Key / sign out
  document.getElementById('btn-signout')?.addEventListener('click', () => {
    localStorage.removeItem('cbs-github-token');
    GITHUB_TOKEN = '';
    render();
  });

  // Add task
  document.getElementById('btn-add-task')?.addEventListener('click', () => {
    state.taskForm = { text: '', deadline: '', color: TASK_COLORS[0], icon: '≡' };
    state.showTaskModal = true;
    render();
  });

  // Click task in Today widget → open edit modal
  document.querySelectorAll('[data-click-task]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const t = state.tasks.find(x => x.id === el.dataset.clickTask);
      if (!t) return;
      state.taskForm = {...t};
      state.showTaskModal = true;
      render();
    });
  });

  // Edit task
  document.querySelectorAll('[data-edit-task]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const t = state.tasks.find(x => x.id === el.dataset.editTask);
      if (!t) return;
      state.taskForm = {...t};
      state.showTaskModal = true;
      render();
    });
  });

  // Delete task
  document.querySelectorAll('[data-delete-task]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const t = state.tasks.find(x => x.id === el.dataset.deleteTask);
      if (!confirm(`Delete "${t?.text}"?`)) return;
      state.tasks = state.tasks.filter(x => x.id !== el.dataset.deleteTask);
      scheduleSave(); render();
    });
  });

  // Toggle task done
  document.querySelectorAll('[data-check-tid]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = el.dataset.checkTid;
      state.tasks = state.tasks.map(t => {
        if (t.id !== id) return t;
        const done = !t.done;
        return {...t, done, completedAt: done ? new Date().toISOString() : null};
      });
      scheduleSave(); render();
    });
  });

  // Task modal cancel / overlay
  document.getElementById('btn-task-modal-cancel')?.addEventListener('click', () => {
    state.showTaskModal = false; render();
  });
  document.getElementById('task-modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'task-modal-overlay') { state.showTaskModal = false; render(); }
  });

  // Task icon swatches
  document.querySelectorAll('[data-task-icon]').forEach(el => {
    el.addEventListener('click', () => {
      state.taskForm.icon = el.dataset.taskIcon;
      document.querySelectorAll('[data-task-icon]').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
    });
  });

  // Task color swatches
  document.querySelectorAll('[data-task-color]').forEach(el => {
    el.addEventListener('click', () => {
      state.taskForm.color = el.dataset.taskColor;
      document.querySelectorAll('[data-task-color]').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
    });
  });

  // Task modal save
  document.getElementById('btn-task-modal-save')?.addEventListener('click', () => {
    const text = document.getElementById('task-form-text')?.value.trim();
    if (!text) return;
    const deadline = document.getElementById('task-form-deadline')?.value || '';
    const done = state.taskForm.done ?? false;
    const completedAt = state.taskForm.completedAt ?? null;
    const task = { ...state.taskForm, text, deadline, done, completedAt, id: state.taskForm.id || `t${Date.now()}` };
    if (state.taskForm.id) {
      state.tasks = state.tasks.map(t => t.id === task.id ? task : t);
    } else {
      state.tasks = [...state.tasks, task];
    }
    state.showTaskModal = false;
    scheduleSave(); render();
  });

  // Mark as Done button in modal
  document.getElementById('btn-task-mark-done')?.addEventListener('click', () => {
    state.taskForm = {...state.taskForm, done: true, completedAt: state.taskForm.completedAt || new Date().toISOString()};
    render();
  });

  // Archive button in modal
  document.getElementById('btn-task-archive')?.addEventListener('click', () => {
    if (!confirm('This will archive the task and mark it as done. Continue?')) return;
    const task = {...state.taskForm, done: true, completedAt: state.taskForm.completedAt || new Date().toISOString(), archived: true};
    state.tasks = state.tasks.map(t => t.id === task.id ? task : t);
    state.showTaskModal = false;
    scheduleSave(); render();
  });

  // Show/hide archived tasks
  document.getElementById('btn-show-archived')?.addEventListener('click', () => {
    state.showArchived = !state.showArchived;
    render();
  });

  // Unarchive task
  document.querySelectorAll('[data-unarchive-task]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      state.tasks = state.tasks.map(t => t.id === el.dataset.unarchiveTask ? {...t, archived: false} : t);
      scheduleSave(); render();
    });
  });

  // Drag-to-reorder today task chips (shares _taskDrag with post-its)
  document.querySelectorAll('.today-task-chip[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      _taskDrag = el.dataset.tid;
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
      setTimeout(() => el.classList.add('dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      _taskDrag = null;
      document.querySelectorAll('.today-task-chip').forEach(x => x.classList.remove('dragging', 'drag-over'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!_taskDrag || el.dataset.tid === _taskDrag) return;
      document.querySelectorAll('.today-task-chip').forEach(x => x.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', e => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!_taskDrag || el.dataset.tid === _taskDrag) return;
      const fromId = _taskDrag, toId = el.dataset.tid;
      _taskDrag = null;
      const tasks = [...state.tasks];
      const from = tasks.findIndex(t => t.id === fromId);
      const to = tasks.findIndex(t => t.id === toId);
      tasks.splice(to, 0, tasks.splice(from, 1)[0]);
      state.tasks = tasks;
      scheduleSave(); render();
    });
  });

  // Task drag-to-reorder
  document.querySelectorAll('.task-postit[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      _taskDrag = el.dataset.tid;
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
      setTimeout(() => el.classList.add('dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      _taskDrag = null;
      document.querySelectorAll('.task-postit').forEach(x => x.classList.remove('dragging', 'drag-over'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!_taskDrag || el.dataset.tid === _taskDrag) return;
      document.querySelectorAll('.task-postit').forEach(x => x.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', e => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!_taskDrag || el.dataset.tid === _taskDrag) return;
      const fromId = _taskDrag, toId = el.dataset.tid;
      _taskDrag = null;
      const tasks = [...state.tasks];
      const from = tasks.findIndex(t => t.id === fromId);
      const to = tasks.findIndex(t => t.id === toId);
      tasks.splice(to, 0, tasks.splice(from, 1)[0]);
      state.tasks = tasks;
      scheduleSave(); render();
    });
  });

  // Add project
  document.getElementById('btn-add-project')?.addEventListener('click', () => {
    state.editProject = null;
    state.form = { name:'', color: COLORS[0], category:'Research', startDate: todayStr(), endDate:'', milestones:[], notes:[], initialNote:'' };
    state.showModal = true;
    render();
  });

  // Calendar nav
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    if (state.calMonth === 0) { state.calMonth = 11; state.calYear--; }
    else state.calMonth--;
    state.selectedDay = null; render();
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    if (state.calMonth === 11) { state.calMonth = 0; state.calYear++; }
    else state.calMonth++;
    state.selectedDay = null; render();
  });

  // Calendar day click
  document.querySelectorAll('.cal-cell[data-day]').forEach(el => {
    el.addEventListener('click', () => {
      const day = parseInt(el.dataset.day);
      state.selectedDay = state.selectedDay === day ? null : day;
      render();
    });
  });

  // Assign chip
  document.querySelectorAll('.assign-chip[data-pid]').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.dataset.pid;
      const k = dateStr(state.calYear, state.calMonth, state.selectedDay);
      const cur = state.calendar[k] || [];
      state.calendar[k] = cur.includes(pid) ? cur.filter(x=>x!==pid) : [...cur, pid];
      scheduleSave(); render();
    });
  });

  // Expand project
  document.querySelectorAll('.project-header[data-expand]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.expand;
      state.expandedId = state.expandedId === id ? null : id;
      render();
    });
  });

  // Edit project
  document.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const p = state.projects.find(x => x.id === el.dataset.edit);
      state.editProject = p;
      state.form = JSON.parse(JSON.stringify(p));
      state.showModal = true;
      render();
    });
  });

  // Delete project
  document.querySelectorAll('[data-delete]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = el.dataset.delete;
      const p = state.projects.find(x => x.id === id);
      if (!confirm(`Delete "${p?.name}"? This cannot be undone.`)) return;
      state.projects = state.projects.filter(p => p.id !== id);
      if (state.expandedId === id) state.expandedId = null;
      scheduleSave(); render();
    });
  });

  // Drag-to-reorder milestones
  document.querySelectorAll('.milestone-item[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      _msDrag = {pid: el.dataset.pid, mid: el.dataset.mid};
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => el.classList.add('dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      _msDrag = null;
      document.querySelectorAll('.milestone-item').forEach(x => x.classList.remove('dragging','drag-over'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      if (!_msDrag || el.dataset.pid !== _msDrag.pid) return;
      document.querySelectorAll('.milestone-item').forEach(x => x.classList.remove('drag-over'));
      if (el.dataset.mid !== _msDrag.mid) el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      if (!_msDrag || el.dataset.pid !== _msDrag.pid || el.dataset.mid === _msDrag.mid) return;
      const pid = _msDrag.pid, fromMid = _msDrag.mid, toMid = el.dataset.mid;
      _msDrag = null;
      state.projects = state.projects.map(p => {
        if (p.id !== pid) return p;
        const ms = [...p.milestones];
        const from = ms.findIndex(m => m.id === fromMid);
        const to   = ms.findIndex(m => m.id === toMid);
        ms.splice(to, 0, ms.splice(from, 1)[0]);
        return {...p, milestones: ms};
      });
      scheduleSave(); render();
    });
  });

  // Drag-to-reorder Today widget sections
  document.querySelectorAll('.today-section[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      _sectionDrag = el.dataset.section;
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
      setTimeout(() => el.classList.add('section-dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      _sectionDrag = null;
      document.querySelectorAll('.today-section').forEach(x => x.classList.remove('section-dragging', 'section-drag-over'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!_sectionDrag || el.dataset.section === _sectionDrag) return;
      document.querySelectorAll('.today-section').forEach(x => x.classList.remove('section-drag-over'));
      el.classList.add('section-drag-over');
    });
    el.addEventListener('dragleave', e => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('section-drag-over');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!_sectionDrag || el.dataset.section === _sectionDrag) return;
      const from = _sectionDrag, to = el.dataset.section;
      _sectionDrag = null;
      const order = [...state.todaySectionOrder];
      const fi = order.indexOf(from), ti = order.indexOf(to);
      if (fi === -1 || ti === -1) return;
      order.splice(ti, 0, order.splice(fi, 1)[0]);
      state.todaySectionOrder = order;
      render();
    });
  });

  // Toggle milestone done
  document.querySelectorAll('[data-check-pid]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const pid = el.dataset.checkPid, mid = el.dataset.checkMid;
      state.projects = state.projects.map(p => p.id===pid ? {...p, milestones: p.milestones.map(m => m.id===mid?{...m,done:!m.done}:m)} : p);
      scheduleSave(); render();
    });
  });

  // Expand milestone notes
  document.querySelectorAll('[data-ms-expand]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const key = el.dataset.msExpand;
      state.expandedMilestones[key] = !state.expandedMilestones[key];
      state.editingNote = null;
      render();
    });
  });

  // Add note
  function addNote(pid, mid) {
    const input = document.querySelector(`[data-anpid="${pid}"][data-anmid="${mid}"]`);
    const text = input?.value.trim();
    if (!text) return;
    const note = {id:`n${Date.now()}`, text, createdAt: new Date().toISOString()};
    state.projects = state.projects.map(p => {
      if (p.id !== pid) return p;
      if (mid === '') return {...p, notes: [...(Array.isArray(p.notes)?p.notes:[]), note]};
      return {...p, milestones: p.milestones.map(m => m.id===mid ? {...m, notes:[...(m.notes||[]),note]} : m)};
    });
    scheduleSave(); render();
  }
  document.querySelectorAll('[data-anbpid]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); addNote(el.dataset.anbpid, el.dataset.anbmid); });
  });
  document.querySelectorAll('[data-anpid]').forEach(el => {
    el.addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); addNote(el.dataset.anpid, el.dataset.anmid); } });
  });

  // Edit note
  document.querySelectorAll('[data-edit-note]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      state.editingNote = {pid: el.dataset.enpid, mid: el.dataset.enmid, nid: el.dataset.editNote};
      render();
    });
  });

  // Save note edit
  document.querySelectorAll('[data-save-note]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const {snpid:pid, snmid:mid} = el.dataset, nid = el.dataset.saveNote;
      const text = document.getElementById(`edit-note-${nid}`)?.value.trim();
      if (!text) return;
      state.projects = state.projects.map(p => {
        if (p.id !== pid) return p;
        if (mid === '') return {...p, notes: p.notes.map(n => n.id===nid?{...n,text}:n)};
        return {...p, milestones: p.milestones.map(m => m.id===mid?{...m,notes:m.notes.map(n=>n.id===nid?{...n,text}:n)}:m)};
      });
      state.editingNote = null; scheduleSave(); render();
    });
  });

  // Cancel note edit
  document.querySelectorAll('[data-cancel-note]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); state.editingNote = null; render(); });
  });

  // Delete note
  document.querySelectorAll('[data-del-note]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const {dnpid:pid, dnmid:mid} = el.dataset, nid = el.dataset.delNote;
      state.projects = state.projects.map(p => {
        if (p.id !== pid) return p;
        if (mid === '') return {...p, notes: p.notes.filter(n => n.id!==nid)};
        return {...p, milestones: p.milestones.map(m => m.id===mid?{...m,notes:m.notes.filter(n=>n.id!==nid)}:m)};
      });
      scheduleSave(); render();
    });
  });

  // Modal cancel / overlay click
  document.getElementById('btn-modal-cancel')?.addEventListener('click', () => {
    state.showModal = false; state.editProject = null; render();
  });
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') { state.showModal = false; state.editProject = null; render(); }
  });

  // Modal form inputs
  document.getElementById('form-name')?.addEventListener('input', e => { state.form.name = e.target.value; });
  document.getElementById('form-category')?.addEventListener('change', e => { state.form.category = e.target.value; });
  document.getElementById('form-start')?.addEventListener('change', e => { state.form.startDate = e.target.value; });
  document.getElementById('form-end')?.addEventListener('change', e => { state.form.endDate = e.target.value; });

  document.querySelectorAll('.color-swatch[data-color]').forEach(el => {
    el.addEventListener('click', () => {
      state.form.color = el.dataset.color;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
      const addBtn = document.getElementById('btn-add-milestone');
      if (addBtn) addBtn.style.background = state.form.color;
    });
  });

  const milestoneInput = document.getElementById('form-milestone-input');
  function addMilestone() {
    const val = milestoneInput?.value.trim();
    if (!val) return;
    state.form.milestones = [...(state.form.milestones||[]), {id:`m${Date.now()}`, text:val, done:false}];
    if (milestoneInput) milestoneInput.value = '';
    refreshModalMilestoneList();
  }
  milestoneInput?.addEventListener('keydown', e => { if(e.key==='Enter') { e.preventDefault(); addMilestone(); } });
  document.getElementById('btn-add-milestone')?.addEventListener('click', addMilestone);
  attachRemoveMilestoneEvents();

  // Save project
  document.getElementById('btn-modal-save')?.addEventListener('click', () => {
    const name = document.getElementById('form-name')?.value.trim();
    if (!name) return;
    state.form.name = name;
    let notes;
    if (state.editProject) {
      notes = Array.isArray(state.form.notes) ? state.form.notes : [];
    } else {
      const initialNoteText = document.getElementById('form-note-initial')?.value.trim();
      notes = initialNoteText ? [{id:`n${Date.now()}`, text:initialNoteText, createdAt: new Date().toISOString()}] : [];
    }
    const proj = {...state.form, id: state.editProject?.id || `p${Date.now()}`, notes};
    if (state.editProject) {
      state.projects = state.projects.map(p => p.id===proj.id ? proj : p);
    } else {
      state.projects = [...state.projects, proj];
    }
    state.showModal = false;
    state.editProject = null;
    scheduleSave();
    render();
  });
}

// ── INIT ──
(async () => {
  render();
  if (GITHUB_TOKEN) {
    await loadFromGist();
    render();
  }
})();
