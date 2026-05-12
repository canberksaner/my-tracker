function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function getMonthCells(year, month) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const total = new Date(year, month+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  return cells;
}

function ganttLeft(ds) {
  const start = new Date(state.ganttStart), end = new Date(state.ganttEnd);
  return Math.max(0, Math.min(100, (new Date(ds) - start) / (end - start) * 100));
}

function ganttWidth(s, e) {
  const start = new Date(state.ganttStart), end = new Date(state.ganttEnd);
  const left = ganttLeft(s);
  return Math.max(0.5, Math.min(100 - left, (new Date(e) - new Date(s)) / (end - start) * 100));
}

function getProgress(p) {
  if (!p.milestones.length) return 0;
  return Math.round(p.milestones.filter(m => m.done).length / p.milestones.length * 100);
}

function formatNoteDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {day:'numeric', month:'short'}) + ' · ' +
    d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function formatLastSynced() {
  if (!state.lastSynced) return 'Tap to sync';
  const diff = Math.floor((new Date() - state.lastSynced) / 1000);
  if (diff < 60) return `Synced ${diff}s ago`;
  if (diff < 3600) return `Synced ${Math.floor(diff/60)}m ago`;
  return `Synced at ${state.lastSynced.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
}

function formatTimeDiff(dateStr) {
  const today = new Date(todayStr());
  const target = new Date(dateStr);
  const totalDays = Math.round(Math.abs(target - today) / 86400000);
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (months === 0 && days === 0) return 'today';
  if (months === 0) return `${days}d`;
  if (days === 0) return `${months}mo`;
  return `${months}mo ${days}d`;
}

function hex2rgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
