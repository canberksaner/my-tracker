function render() {
  autoArchiveTasks();
  const app = document.getElementById('app');
  if (!GITHUB_TOKEN) {
    app.innerHTML = renderSetup();
    attachSetupEvents();
    return;
  }
  app.innerHTML = `
    ${renderHeader()}
    <div class="main">
      ${renderTodayWidget()}
      ${renderCalendar()}
      ${renderTasks()}
      ${renderProjects()}
      ${renderGantt()}
    </div>
    ${state.showModal ? renderModal() : ''}
    ${state.showTaskModal ? renderTaskModal() : ''}
    ${state.showMenu ? renderSideMenu() : ''}
  `;
  attachEvents();
  startClock();
}

function renderSetup() {
  return `
    <div class="setup-screen">
      <input class="setup-input" id="setup-token-input" type="password" placeholder="Enter key..." autocomplete="off" spellcheck="false">
      <button class="setup-btn" id="setup-save-btn">OK</button>
    </div>
  `;
}

function renderHeader() {
  let syncLabel = '';
  if (state.syncing) syncLabel = '<span class="sync-status" id="sync-btn">Syncing...</span>';
  else if (state.syncStatus === 'ok') syncLabel = `<span class="sync-status ok" id="sync-btn" style="cursor:pointer">✓ ${formatLastSynced()}</span>`;
  else if (state.syncStatus === 'err') syncLabel = '<span class="sync-status err" id="sync-btn" style="cursor:pointer">⚠ Offline — tap to retry</span>';
  return `
    <div class="header">
      <div style="display:flex;align-items:center;gap:10px">
        <button class="hamburger" id="btn-menu">☰</button>
        <div>
          <div class="header-title">Research Tracker</div>
          <div class="header-sub">Can Berk Saner · Newcastle</div>
        </div>
      </div>
      <div class="header-right">
        ${syncLabel}
        <button class="btn btn-task" id="btn-add-task">+ New Task</button>
        <button class="btn btn-primary" id="btn-add-project">+ New Project</button>
        <button class="btn btn-outline" id="btn-signout" style="color:#888;border-color:#444;font-size:11px">⚿ Key</button>
      </div>
    </div>
  `;
}

function renderSideMenu() {
  return `
    <div class="menu-overlay" id="menu-overlay"></div>
    <div class="side-menu">
      <div class="side-menu-title">Menu</div>
      <button class="side-menu-item" id="menu-export">
        <span class="side-menu-icon">⬇</span> Export Backup
      </button>
      <button class="side-menu-item" id="menu-import">
        <span class="side-menu-icon">⬆</span> Import Backup
      </button>
      <input type="file" id="import-file-input" accept=".json" style="display:none">
    </div>
  `;
}

function renderTodayWidget() {
  const today = todayStr();
  const now = new Date();
  const dayName = now.toLocaleDateString('en-GB', {weekday:'long', timeZone:'Europe/London'});
  const dateFull = now.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric', timeZone:'Europe/London'});
  const timeFull = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:'Europe/London'});

  const assignedIds = state.calendar[today] || [];
  const assignedProjects = assignedIds.map(id => state.projects.find(p => p.id===id)).filter(Boolean);
  const activeProjects = state.projects.filter(p => p.startDate <= today && p.endDate >= today);

  const pending = [], overdue = [];
  activeProjects.forEach(p => p.milestones.filter(m => !m.done).forEach(m => pending.push({m, p})));
  state.projects.filter(p => p.endDate < today).forEach(p => p.milestones.filter(m => !m.done).forEach(m => overdue.push({m, p})));
  const overdueTasks = state.tasks.filter(t => !t.done && t.deadline && t.deadline < today);
  const undoneTasks = state.tasks.filter(t => !t.done);

  const assignedHtml = assignedProjects.length
    ? assignedProjects.map(p => `<span class="today-project-chip" style="background:${hex2rgba(p.color,0.2)};color:${p.color}"><span style="width:7px;height:7px;border-radius:2px;background:${p.color};display:inline-block"></span>${p.name}</span>`).join('')
    : `<span class="today-empty">Nothing assigned — click a calendar day to assign projects.</span>`;

  const pendingHtml = pending.length
    ? pending.slice(0,6).map(({m,p}) => {
        const msIdx = p.milestones.findIndex(x => x.id === m.id) + 1;
        const timeStr = formatTimeDiff(p.endDate);
        return `<div class="today-ms-item">
          <span class="ms-badge" style="background:${p.color}">MS${msIdx}</span>
          <span class="today-ms-text">${m.text}</span>
          <span class="today-ms-time">${timeStr} left</span>
          <span class="today-ms-project">${p.name}</span>
        </div>`;
      }).join('')
    : `<span class="today-empty">No pending milestones in active projects.</span>`;

  const sections = {
    overdue: (overdue.length || overdueTasks.length) ? `
      <div class="today-section" draggable="true" data-section="overdue">
        <div class="today-section-label today-overdue">⚠ Overdue</div>
        ${overdue.slice(0,4).map(({m,p}) => {
          const msIdx = p.milestones.findIndex(x => x.id === m.id) + 1;
          const timeStr = formatTimeDiff(p.endDate);
          return `<div class="today-ms-item">
            <span class="ms-badge" style="background:${p.color}">MS${msIdx}</span>
            <span class="today-ms-text today-overdue">${m.text}</span>
            <span class="today-ms-time today-overdue">${timeStr} overdue</span>
            <span class="today-ms-project">${p.name}</span>
          </div>`;
        }).join('')}
        ${overdueTasks.map(t => `
          <div class="today-ms-item" style="cursor:pointer" data-click-task="${t.id}">
            <span class="ms-badge" style="background:${t.color}">TASK</span>
            <span class="today-ms-text today-overdue">${t.text}</span>
            <span class="today-ms-time today-overdue">${formatTimeDiff(t.deadline)} overdue</span>
            <span class="today-ms-project">Tasks</span>
          </div>`).join('')}
      </div>` : '',
    tasks: undoneTasks.length ? `
      <div class="today-section" draggable="true" data-section="tasks">
        <div class="today-section-label">Tasks</div>
        <div class="today-tasks-row">
          ${undoneTasks.slice(0,10).map(t => {
            const isOverdue = t.deadline && t.deadline < today;
            return `<div class="today-task-chip" style="background:${t.color};cursor:pointer" data-click-task="${t.id}">
              <span class="today-task-chip-text">${t.text}</span>
              ${t.deadline ? `<span class="today-task-chip-date ${isOverdue?'today-overdue':''}">${isOverdue?'⚠ ':''}${formatTaskDeadline(t.deadline)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>` : '',
    assigned: `
      <div class="today-section" draggable="true" data-section="assigned">
        <div class="today-section-label">Assigned today</div>
        ${assignedHtml}
      </div>`,
    pending: `
      <div class="today-section" draggable="true" data-section="pending">
        <div class="today-section-label">Pending milestones · active projects</div>
        ${pendingHtml}
      </div>`
  };

  const order = state.todaySectionOrder || ['overdue', 'assigned', 'pending'];
  const sectionsHtml = order.map(k => sections[k]).join('');

  return `
    <div class="today-widget">
      <div class="card-title">Today's Overview</div>
      <div class="today-datetime">
        <div class="today-date">${dayName}, ${dateFull}</div>
        <div class="today-clock" id="today-clock">${timeFull}</div>
      </div>
      ${sectionsHtml}
    </div>`;
}

function renderCalendar() {
  const cells = getMonthCells(state.calYear, state.calMonth);
  const today = todayStr();

  const dayNames = DAYS.map(d => `<div class="cal-day-name">${d}</div>`).join('');
  const dayCells = cells.map((day) => {
    if (!day) return `<div class="cal-cell empty"></div>`;
    const k = dateStr(state.calYear, state.calMonth, day);
    const assigned = state.calendar[k] || [];
    const isToday = k === today;
    const isPast = k < today;
    const isSel = state.selectedDay === day;
    const cls = `cal-cell${isToday?' today':''}${isPast&&!isToday?' past':''}${isSel?' selected':''}`;
    const dots = assigned.map(pid => {
      const p = state.projects.find(x => x.id === pid);
      return p ? `<div class="cal-dot" style="background:${p.color}" title="${p.name}"></div>` : '';
    }).join('');
    return `<div class="${cls}" data-day="${day}"><div class="cal-cell-num">${day}</div><div class="cal-dots">${dots}</div></div>`;
  }).join('');

  let assignPanel = '';
  if (state.selectedDay !== null) {
    const k = dateStr(state.calYear, state.calMonth, state.selectedDay);
    const assigned = state.calendar[k] || [];
    const chips = state.projects.map(p => {
      const on = assigned.includes(p.id);
      const style = on
        ? `background:${p.color};color:#fff;border-color:${p.color}`
        : `background:#fff;color:#666;border-color:#ddd`;
      return `<button class="assign-chip" data-pid="${p.id}" style="${style}">${p.name}</button>`;
    }).join('');
    assignPanel = `
      <div class="assign-panel">
        <div class="assign-label">${MONTHS[state.calMonth]} ${state.selectedDay} — assign to:</div>
        <div class="assign-chips">${chips}</div>
      </div>`;
  }

  const legend = state.projects.map(p =>
    `<div class="legend-item"><div class="legend-dot" style="background:${p.color}"></div><span class="legend-label">${p.name}</span></div>`
  ).join('');

  return `
    <div class="card">
      <div class="cal-header">
        <div class="card-title" style="margin-bottom:0">Calendar</div>
        <div class="cal-nav">
          <button class="cal-nav-btn" id="cal-prev">‹</button>
          <span class="cal-month-label">${MONTHS[state.calMonth]} ${state.calYear}</span>
          <button class="cal-nav-btn" id="cal-next">›</button>
        </div>
      </div>
      <div class="cal-days-header">${dayNames}</div>
      <div class="cal-grid">${dayCells}</div>
      ${assignPanel}
      <div class="legend">${legend}</div>
    </div>
  `;
}

function renderNotesSection(notes, pid, mid, color) {
  const cards = (notes || []).map(n => {
    const isEditing = state.editingNote &&
      state.editingNote.pid === pid &&
      state.editingNote.mid === mid &&
      state.editingNote.nid === n.id;
    const ts = formatNoteDate(n.createdAt);
    if (isEditing) return `
      <div class="note-card">
        <div class="note-card-header">
          <span class="note-card-time">${ts}</span>
          <div class="note-card-actions">
            <button class="note-card-btn" data-save-note="${n.id}" data-snpid="${pid}" data-snmid="${mid}">Save</button>
            <button class="note-card-btn" data-cancel-note>✕</button>
          </div>
        </div>
        <textarea class="note-card-textarea" id="edit-note-${n.id}">${n.text}</textarea>
      </div>`;
    return `
      <div class="note-card">
        <div class="note-card-header">
          <span class="note-card-time">${ts}</span>
          <div class="note-card-actions">
            <button class="note-card-btn" data-edit-note="${n.id}" data-enpid="${pid}" data-enmid="${mid}">✎</button>
            <button class="note-card-btn" data-del-note="${n.id}" data-dnpid="${pid}" data-dnmid="${mid}">×</button>
          </div>
        </div>
        <div class="note-card-text">${n.text}</div>
      </div>`;
  }).join('');
  return `
    <div class="notes-grid">
      ${cards}
      <div class="note-add-row">
        <input class="note-add-input" placeholder="Add a note…" data-anpid="${pid}" data-anmid="${mid}">
        <button class="note-add-btn" data-anbpid="${pid}" data-anbmid="${mid}" style="background:${color}">+</button>
      </div>
    </div>`;
}

function renderProjects() {
  const rows = state.projects.map(p => {
    const pct = getProgress(p);
    const isExp = state.expandedId === p.id;

    const milestones = p.milestones.map((m, i) => {
      const msKey = `${p.id}-${m.id}`;
      const isMsExp = !!state.expandedMilestones[msKey];
      const noteCount = (m.notes||[]).length;
      return `
      <div class="milestone-item" draggable="true" data-pid="${p.id}" data-mid="${m.id}">
        <span class="ms-badge" style="background:${p.color}">MS${i+1}</span>
        <div class="milestone-check ${m.done?'done':'undone'}" data-check-pid="${p.id}" data-check-mid="${m.id}"
          style="${m.done?`background:${p.color}`:`color:${p.color}`}">
          ${m.done ? '<span class="milestone-check-icon">✓</span>' : ''}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;cursor:pointer" data-ms-expand="${msKey}">
            <span class="milestone-text ${m.done?'done':''}">${m.text}</span>
            <span class="ms-expand-hint">${noteCount ? noteCount+'n' : ''} ${isMsExp?'▲':'▼'}</span>
          </div>
          ${isMsExp ? `<div class="ms-notes-wrap">${renderNotesSection(m.notes||[], p.id, m.id, p.color)}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const detail = isExp ? `
      <div class="project-detail">
        <div class="detail-grid">
          <div>
            <div class="detail-section-label">Milestones</div>
            ${milestones}
          </div>
          <div>
            <div class="detail-section-label">Notes</div>
            ${renderNotesSection(Array.isArray(p.notes)?p.notes:[], p.id, '', p.color)}
          </div>
        </div>
      </div>` : '';

    return `
      <div class="project-row" id="proj-${p.id}">
        <div class="project-header" data-expand="${p.id}">
          <div class="project-swatch" style="background:${p.color}"></div>
          <div class="project-info">
            <div class="project-name-row">
              <span class="project-name">${p.name}</span>
              <span class="project-cat">${p.category}</span>
            </div>
            <div class="project-progress-row">
              <div class="progress-track">
                <div class="progress-fill" style="background:${p.color};width:${pct}%"></div>
              </div>
              <span class="progress-pct">${pct}%</span>
              <span class="progress-count">${p.milestones.filter(m=>m.done).length}/${p.milestones.length}</span>
            </div>
          </div>
          <div class="project-actions" onclick="event.stopPropagation()">
            <button class="project-action-btn" data-edit="${p.id}">Edit</button>
            <button class="project-action-btn del" data-delete="${p.id}">×</button>
          </div>
          <span class="project-chevron">${isExp?'▲':'▼'}</span>
        </div>
        ${detail}
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-title">Projects</div>
      <div class="project-list">${rows}</div>
    </div>`;
}

function ganttMonthSelect(prefix, dateVal) {
  const parts = dateVal.split('-');
  const yr = parseInt(parts[0]), mo = parseInt(parts[1]);
  const monthOpts = MONTHS.map((mn, i) => `<option value="${String(i+1).padStart(2,'0')}" ${i===mo-1?'selected':''}>${mn}</option>`).join('');
  const yearOpts = [2023,2024,2025,2026,2027,2028,2029,2030].map(y => `<option value="${y}" ${y===yr?'selected':''}>${y}</option>`).join('');
  return `<select class="gantt-range-input" id="${prefix}-month" style="padding:3px 5px">${monthOpts}</select><select class="gantt-range-input" id="${prefix}-year" style="padding:3px 5px">${yearOpts}</select>`;
}

function renderGantt() {
  const today = todayStr();
  const todayLeft = ganttLeft(today);

  const gsDate = new Date(state.ganttStart), geDate = new Date(state.ganttEnd);
  const monthCount = (geDate.getFullYear()-gsDate.getFullYear())*12 + geDate.getMonth()-gsDate.getMonth();
  const startYear = gsDate.getFullYear();
  const monthLabels = Array.from({length: monthCount}, (_,i) => {
    const d = new Date(gsDate.getFullYear(), gsDate.getMonth()+i, 1);
    const left = ganttLeft(d.toISOString().split('T')[0]);
    const label = MONTHS[d.getMonth()].slice(0,3) + (d.getFullYear()!==startYear ? ` '${String(d.getFullYear()).slice(2)}` : '');
    return `<div class="gantt-month-label" style="left:${left}%">${label}</div>`;
  }).join('');

  const bars = state.projects.map(p => {
    const pct = getProgress(p);
    const left = ganttLeft(p.startDate);
    const width = ganttWidth(p.startDate, p.endDate);
    return `
      <div class="gantt-row">
        <div class="gantt-label" title="${p.name}">${p.name}</div>
        <div class="gantt-track">
          <div class="gantt-track-line"></div>
          <div class="gantt-today" style="left:${todayLeft}%"></div>
          <div class="gantt-bar" style="left:${left}%;width:${Math.min(width,100-left)}%;background:${hex2rgba(p.color,0.13)};border:1.5px solid ${hex2rgba(p.color,0.35)}">
            <div class="gantt-bar-fill" style="background:${hex2rgba(p.color,0.6)};width:${pct}%"></div>
          </div>
        </div>
        <div class="gantt-pct">${pct}%</div>
      </div>`;
  }).join('');

  const gs = new Date(state.ganttStart), ge = new Date(state.ganttEnd);
  const gsLabel = gs.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  const geLabel = ge.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="card-title" style="margin-bottom:0">Timeline · ${gsLabel} – ${geLabel}</div>
        <div class="gantt-range-inputs">
          ${ganttMonthSelect('gantt-start', state.ganttStart)}
          <span style="font-size:11px;color:var(--text-3)">→</span>
          ${ganttMonthSelect('gantt-end', state.ganttEnd)}
        </div>
      </div>
      <div class="gantt-month-row">${monthLabels}</div>
      ${bars}
      <div class="gantt-legend">
        <div style="width:10px;height:2px;background:#E24B4A;border-radius:1px"></div>
        <span style="font-size:10px;color:#AAA">Today</span>
      </div>
    </div>`;
}

function renderTasks() {
  const today = todayStr();
  const activeTasks = state.tasks.filter(t => !t.archived);
  const archivedTasks = state.tasks.filter(t => t.archived);

  const items = activeTasks.map(t => {
    const isOverdue = !t.done && t.deadline && t.deadline < today;
    const deadlineLabel = formatTaskDeadline(t.deadline);
    return `
      <div class="task-postit ${t.done?'task-done':''}" draggable="true" data-tid="${t.id}" style="background:${t.color}">
        <div class="task-postit-header">
          <div class="task-check-wrap" data-check-tid="${t.id}">
            <div class="task-check ${t.done?'checked':''}"></div>
          </div>
          <button class="task-edit-btn" data-edit-task="${t.id}">✎</button>
          <button class="task-delete-btn" data-delete-task="${t.id}">×</button>
        </div>
        <div class="task-postit-text ${t.done?'done':''}">${t.text}</div>
        ${deadlineLabel ? `<div class="task-postit-date ${isOverdue?'overdue':''}">${isOverdue?'⚠ ':''}${deadlineLabel}</div>` : ''}
        ${t.done && t.completedAt ? `<div class="task-completed-at">✓ ${formatCompletedAt(t.completedAt)}</div>` : ''}
      </div>`;
  }).join('');

  const archivedSection = state.showArchived && archivedTasks.length ? `
    <div class="task-archived-section">
      <div class="task-archived-label">Archived</div>
      ${archivedTasks.map(t => `
        <div class="task-archived-item" style="border-left:3px solid ${t.color}">
          <div class="task-archived-text">${t.text}</div>
          <div class="task-archived-meta">✓ ${formatCompletedAt(t.completedAt)}</div>
          <button class="task-unarchive-btn" data-unarchive-task="${t.id}">Restore</button>
        </div>`).join('')}
    </div>` : '';

  const archiveBtn = archivedTasks.length ? `
    <button class="task-archive-toggle" id="btn-show-archived">
      ${state.showArchived ? 'Hide Archived' : `Archived (${archivedTasks.length})`}
    </button>` : '';

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="card-title" style="margin-bottom:0">Tasks</div>
        ${archiveBtn}
      </div>
      <div class="task-grid">
        ${items || `<span class="today-empty">No tasks yet — use + New Task to add one.</span>`}
      </div>
      ${archivedSection}
    </div>`;
}

function renderTaskModal() {
  const f = state.taskForm;
  const isEdit = !!f.id;
  const colorSwatches = TASK_COLORS.map(c =>
    `<div class="task-color-swatch ${f.color===c?'active':''}" data-task-color="${c}" style="background:${c}"></div>`
  ).join('');
  return `
    <div class="modal-overlay" id="task-modal-overlay">
      <div class="modal">
        <div class="modal-title">${isEdit?'Edit Task':'New Task'}</div>
        <div class="form-group">
          <label class="form-label">Task</label>
          <input class="form-input" id="task-form-text" value="${f.text||''}" placeholder="e.g. Send email to IT about VPN">
        </div>
        <div class="form-group">
          <label class="form-label">Deadline <span style="font-size:9px;font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
          <input class="form-input" type="date" id="task-form-deadline" value="${f.deadline||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <div class="color-picker">${colorSwatches}</div>
        </div>
        ${isEdit ? `<div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="task-form-done" ${f.done?'checked':''} style="width:16px;height:16px;cursor:pointer">
            <span style="font-size:13px;color:var(--text)">Mark as done</span>
          </label>
        </div>` : ''}
        <div class="modal-footer">
          <button class="btn btn-outline" id="btn-task-modal-cancel">Cancel</button>
          <button class="btn btn-dark" id="btn-task-modal-save">${isEdit?'Save Changes':'Add Task'}</button>
        </div>
      </div>
    </div>`;
}

function renderModalMilestoneList(milestones, color) {
  return (milestones||[]).map((m,i) => `
    <div class="milestone-list-item">
      <span class="ms-badge" style="background:${color}">MS${i+1}</span>
      <span class="milestone-list-text">${m.text}</span>
      <div style="display:flex;gap:2px;margin-left:auto;align-items:center">
        ${i > 0 ? `<button class="ms-order-btn" data-modal-ms-up="${i}" style="border:1px solid var(--border);border-radius:4px">↑</button>` : ''}
        ${i < milestones.length-1 ? `<button class="ms-order-btn" data-modal-ms-down="${i}" style="border:1px solid var(--border);border-radius:4px">↓</button>` : ''}
        <button class="milestone-remove" data-remove-milestone="${i}">×</button>
      </div>
    </div>`).join('');
}

function renderModal() {
  const p = state.editProject;
  const f = state.form;
  const isEdit = !!p;

  const colorSwatches = COLORS.map(c =>
    `<div class="color-swatch ${f.color===c?'active':''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');

  const catOptions = CATEGORIES.map(c =>
    `<option ${f.category===c?'selected':''}>${c}</option>`
  ).join('');

  const milestoneList = renderModalMilestoneList(f.milestones||[], f.color);

  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-title">${isEdit?'Edit Project':'New Project'}</div>
        <div class="form-group">
          <label class="form-label">Project Name</label>
          <input class="form-input" id="form-name" value="${f.name||''}" placeholder="e.g. FAIR-OPAP">
        </div>
        <div class="form-row">
          <div>
            <label class="form-label">Category</label>
            <select class="form-input" id="form-category">${catOptions}</select>
          </div>
          <div>
            <label class="form-label">Color</label>
            <div class="color-picker">${colorSwatches}</div>
          </div>
        </div>
        <div class="form-row">
          <div>
            <label class="form-label">Start Date</label>
            <input class="form-input" type="date" id="form-start" value="${f.startDate||''}">
          </div>
          <div>
            <label class="form-label">End Date</label>
            <input class="form-input" type="date" id="form-end" value="${f.endDate||''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Milestones</label>
          <div id="milestone-list">${milestoneList}</div>
          <div class="milestone-input-row" style="margin-top:8px">
            <input class="form-input" id="form-milestone-input" placeholder="Add milestone, press Enter or +" style="margin-bottom:0">
            <button class="milestone-add-btn" id="btn-add-milestone" style="background:${f.color}">+</button>
          </div>
        </div>
        ${!isEdit ? `<div class="form-group">
          <label class="form-label">Initial Note <span style="font-size:9px;font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
          <input class="form-input" id="form-note-initial" placeholder="First note for this project…" value="${f.initialNote||''}">
        </div>` : ''}
        <div class="modal-footer">
          <button class="btn btn-outline" id="btn-modal-cancel">Cancel</button>
          <button class="btn btn-dark" id="btn-modal-save">${isEdit?'Save Changes':'Create Project'}</button>
        </div>
      </div>
    </div>`;
}
