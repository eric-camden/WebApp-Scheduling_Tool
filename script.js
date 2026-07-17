// Helper: convert to 12-hour time format with AM/PM
function to12HourFormat(hour24, minute) {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}




// Generate time slots (half-hour optional)
function getTimeSlots() {
  const showHalfHours = document.getElementById('half-hour-toggle')?.checked;
  return Array.from({ length: 48 }, (_, i) => {
    const hh = String(Math.floor(i / 2)).padStart(2, '0');
    const mm = i % 2 === 0 ? '00' : '30';
    return `${hh}:${mm}`;
  }).filter(slot => showHalfHours || slot.endsWith(':00'));
}



// Time-zone configuration. Eastern is always the primary row.
let timeZones = [
  { id: 'eastern', label: 'Primary — US Eastern', zone: 'America/New_York', primary: true },
  { id: 'central', label: 'US Central', zone: 'America/Chicago' },
  { id: 'phoenix', label: 'Phoenix, AZ', zone: 'America/Phoenix' },
  { id: 'uk', label: 'United Kingdom', zone: 'Europe/London' },
  { id: 'brisbane', label: 'Brisbane, QLD', zone: 'Australia/Brisbane' }
];

const EASTERN_ZONE = 'America/New_York';

const SHARED_DATA_URL = './staff-data.json';
let sharedStorageWritable = false;
let activeStorageMode = 'local';

function setStorageStatus(message, mode = 'local') {
  activeStorageMode = mode;
  const element = document.getElementById('storage-status');
  if (!element) return;
  element.textContent = message;
  element.className = `storage-status ${mode}`;
}

function saveLocalCache(data = staffData) {
  localStorage.setItem('staffData', JSON.stringify(data));
}

function normalizeSharedPayload(payload) {
  const data = Array.isArray(payload) ? payload : payload?.staffData;
  if (!Array.isArray(data)) throw new Error('Shared file does not contain a staffData array.');
  return data;
}

async function loadSharedData({ quiet = false } = {}) {
  try {
    const response = await fetch(`${SHARED_DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remoteData = normalizeSharedPayload(await response.json());
    staffData = remoteData;
    saveLocalCache(staffData);
    setStorageStatus('Shared file loaded; local cache updated.', 'shared');
    return true;
  } catch (error) {
    setStorageStatus('Using local browser cache (shared file unavailable).', 'local');
    if (!quiet) alert(`Could not load ${SHARED_DATA_URL}. Local browser data remains active.\n\n${error.message}`);
    return false;
  }
}

async function saveSharedData({ quiet = false } = {}) {
  const payload = JSON.stringify({
    format: 'International Staff Scheduler',
    version: 1,
    savedAt: new Date().toISOString(),
    canonicalTimeZone: EASTERN_ZONE,
    staffData
  }, null, 2);
  try {
    const response = await fetch(SHARED_DATA_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    sharedStorageWritable = true;
    setStorageStatus('Saved to shared file and local cache.', 'shared');
    return true;
  } catch (error) {
    sharedStorageWritable = false;
    saveLocalCache(staffData);
    setStorageStatus('Shared location is read-only; saved to local browser cache.', 'local');
    if (!quiet) alert(`The shared location could not be written. Your changes were saved in this browser instead.\n\n${error.message}`);
    return false;
  }
}

async function persistStaffData({ tryShared = true, quiet = true } = {}) {
  saveLocalCache(staffData);
  if (tryShared) await saveSharedData({ quiet });
}
const savedCustomTimeZones = JSON.parse(localStorage.getItem('customTimeZones') || '[]');
savedCustomTimeZones.forEach(item => {
  if (item?.zone && !timeZones.some(zone => zone.zone === item.zone)) {
    timeZones.push({ id: item.id || `custom-${item.zone.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`, label: item.label || item.zone, zone: item.zone, custom: true });
  }
});

function getEnabledTimeZones() {
  const enabled = new Set(
    Array.from(document.querySelectorAll('.timezone-toggle:checked')).map(input => input.value)
  );
  return timeZones.filter(zone => zone.primary || enabled.has(zone.id));
}

function getTimeZoneName(zone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'short'
  }).formatToParts(date);
  return parts.find(part => part.type === 'timeZoneName')?.value || '';
}

// Convert a wall-clock time in a named zone into a UTC instant.
function zonedWallTimeToDate(year, month, day, hour, minute, timeZone) {
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desiredUtc;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });

  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess))
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, Number(part.value)])
    );
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    guess += desiredUtc - representedUtc;
  }
  return new Date(guess);
}

function getZonedDateParts(date, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return values;
}

function formatTimeForZone(primaryTime, targetZone, referenceDate = new Date()) {
  const [hour, minute] = primaryTime.split(':').map(Number);
  const easternInstant = zonedWallTimeToDate(
    referenceDate.getFullYear(), referenceDate.getMonth() + 1, referenceDate.getDate(),
    hour, minute, EASTERN_ZONE
  );
  const easternParts = getZonedDateParts(easternInstant, EASTERN_ZONE);
  const targetParts = getZonedDateParts(easternInstant, targetZone);
  const easternDate = Date.UTC(Number(easternParts.year), Number(easternParts.month)-1, Number(easternParts.day));
  const targetDate = Date.UTC(Number(targetParts.year), Number(targetParts.month)-1, Number(targetParts.day));
  const dayOffset = Math.round((targetDate - easternDate) / 86400000);
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone: targetZone, hour: 'numeric', minute: '2-digit', hour12: true
  }).format(easternInstant).replace(' ', '\u00a0');
  return { text, dayOffset };
}

function getReferenceMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 12, 0, 0);
}

function convertScheduleDaysAndTime(startTime, days, fromZone, toZone) {
  if (!startTime || !days?.length || fromZone === toZone) return { startTime, days: [...(days || [])] };
  const monday = getReferenceMonday();
  const converted = days.map(dayName => {
    const dayIndex = daysOfWeek.indexOf(dayName);
    const sourceDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayIndex);
    const [hour, minute] = startTime.split(':').map(Number);
    const instant = zonedWallTimeToDate(sourceDate.getFullYear(), sourceDate.getMonth()+1, sourceDate.getDate(), hour, minute, fromZone);
    const parts = getZonedDateParts(instant, toZone);
    return { day: parts.weekday, time: `${parts.hour.padStart(2,'0')}:${parts.minute.padStart(2,'0')}` };
  });
  return { startTime: converted[0]?.time || startTime, days: [...new Set(converted.map(item => item.day))] };
}

function getStaffEntryZone() {
  return document.getElementById('staff-entry-timezone')?.value || EASTERN_ZONE;
}

function getHeatmapColor(count, maxCount) {
  if (maxCount <= 0 || count <= 0) return 'hsl(0 82% 52% / 0.78)';
  const ratio = Math.min(count / maxCount, 1);
  const hue = Math.round(120 * ratio); // 0 = red, 120 = green
  return `hsl(${hue} 82% 43% / 0.78)`;
}

function getHeatmapTextColor(count, maxCount) {
  if (maxCount <= 0) return '#fff';
  const ratio = count / maxCount;
  return ratio > 0.38 && ratio < 0.78 ? '#111' : '#fff';
}

function updateHeatmapLegend(maxCount) {
  const legend = document.getElementById('heatmap-legend');
  if (!legend) return;
  legend.innerHTML = `
    <span>0</span>
    <span class="heatmap-gradient" aria-hidden="true"></span>
    <span>Max: ${maxCount}</span>
  `;
}

// Generate the heatmap table with aligned World Time Buddy-style time-zone rows.
function generateHeatmap() {
  const gridBody = document.getElementById('grid-body');
  const gridHeader = document.querySelector('#staffing-grid thead');
  gridBody.innerHTML = '';
  gridHeader.innerHTML = '';

  const hours = getTimeSlots();
  const enabledZones = getEnabledTimeZones();
  const referenceDate = new Date();

  enabledZones.forEach(zone => {
    const row = document.createElement('tr');
    row.className = `timezone-row${zone.primary ? ' primary-timezone-row' : ''}`;

    const labelHeader = document.createElement('th');
    const abbreviation = getTimeZoneName(zone.zone, referenceDate);
    labelHeader.innerHTML = `<span>${zone.label}</span><small>${abbreviation}</small>`;
    row.appendChild(labelHeader);

    hours.forEach(hour => {
      const timeHeader = document.createElement('th');
      const converted = formatTimeForZone(hour, zone.zone, referenceDate);
      timeHeader.innerHTML = `<span class="zone-time">${converted.text}</span>${converted.dayOffset ? `<small class="day-offset">${converted.dayOffset > 0 ? '+' : ''}${converted.dayOffset}</small>` : '<small class="day-offset current-day"></small>'}`
      row.appendChild(timeHeader);
    });
    gridHeader.appendChild(row);
  });

  const countsByDay = daysOfWeek.map((day, dayIndex) => {
    return hours.map(hour => {
      const previousDayIndex = (dayIndex - 1 + 7) % 7;
      const previousDay = daysOfWeek[previousDayIndex];
      return staffData.filter(staff => (
        (staff.days.includes(day) && isTimeWithinShift(staff.startTime, staff.hoursWorked, staff.hasLunch, hour, dayIndex)) ||
        (staff.days.includes(previousDay) && isCarryoverShift(staff.startTime, staff.hoursWorked, staff.hasLunch, hour, previousDayIndex))
      )).length;
    });
  });

  const maxCount = Math.max(0, ...countsByDay.flat());
  updateHeatmapLegend(maxCount);

  daysOfWeek.forEach((day, dayIndex) => {
    const row = document.createElement('tr');
    const dayCell = document.createElement('td');
    dayCell.textContent = day;
    dayCell.className = 'day-label';
    row.appendChild(dayCell);

    hours.forEach((hour, hourIndex) => {
      const count = countsByDay[dayIndex][hourIndex];
      const cell = document.createElement('td');
      cell.style.backgroundColor = getHeatmapColor(count, maxCount);
      cell.style.color = getHeatmapTextColor(count, maxCount);
      cell.textContent = count;
      cell.title = `${day} ${hour} Eastern: ${count} staff`;
      row.appendChild(cell);
    });

    gridBody.appendChild(row);
  });
}

// Helper function to check if time is within the shift on the same day
function isTimeWithinShift(startTime, hoursWorked, hasLunch, hour, dayIndex) {
  const [hourStart, minuteStart] = startTime.split(':').map(Number);
  const [hourCheck, minuteCheck] = hour.split(':').map(Number);

  const start = hourStart * 60 + minuteStart;
  const shiftDuration = hoursWorked * 60 + (hasLunch ? 60 : 0); // Add 1 hour if lunch is included
  const end = start + shiftDuration;
  const check = hourCheck * 60 + minuteCheck;

  return check >= start && check < Math.min(end, 1440); // Cap the end time at midnight
}

// Helper function to check if the shift carries over to the next day
function isCarryoverShift(startTime, hoursWorked, hasLunch, hour, dayIndex) {
  const [hourStart, minuteStart] = startTime.split(':').map(Number);
  const [hourCheck, minuteCheck] = hour.split(':').map(Number);

  const start = hourStart * 60 + minuteStart;
  const shiftDuration = hoursWorked * 60 + (hasLunch ? 60 : 0); // Add 1 hour if lunch is included
  const end = start + shiftDuration;
  const check = hourCheck * 60 + minuteCheck;

  return end > 1440 && check < (end - 1440); // Check if time falls after midnight on the next day
}



function generateDailyGrids() {
  const scheduleContainer = document.getElementById("daily-schedules");
  scheduleContainer.innerHTML = "";

  const timeSlots = getTimeSlots();
  const nextDayMap = {
    "Monday": "Tuesday", "Tuesday": "Wednesday", "Wednesday": "Thursday",
    "Thursday": "Friday", "Friday": "Saturday", "Saturday": "Sunday", "Sunday": "Monday"
  };

  const scheduleTables = {};
  daysOfWeek.forEach(day => {
    const heading = document.createElement("h2");
    heading.textContent = `${day} Schedule`;
    scheduleContainer.appendChild(heading);

    const table = document.createElement("table");
    table.classList.add("schedule-table");

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `<th>Name</th>` + timeSlots.map(slot => `<th>${slot}</th>`).join("");
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    scheduleContainer.appendChild(table);
    scheduleTables[day] = tbody;
  });

  const carryoverShifts = {};

  staffData.forEach(staff => {
    const [startH, startM] = staff.startTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const shiftDuration = staff.hoursWorked * 60 + (staff.hasLunch ? 60 : 0);
    const endMinutes = startMinutes + shiftDuration;

    staff.days.forEach(day => {
      const tbody = scheduleTables[day];
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = staff.name;
      row.appendChild(nameCell);

      const effectiveEnd = Math.min(endMinutes, 1440);

      timeSlots.forEach(slot => {
        const cell = document.createElement("td");
        const [slotH, slotM] = slot.split(":").map(Number);
        const slotMinutes = slotH * 60 + slotM;
        let status = "0";
        if (slotMinutes >= startMinutes && slotMinutes < effectiveEnd) status = "1";
        cell.textContent = status;
        cell.setAttribute("data-status", status);
        cell.classList.add("time-slot");
        row.appendChild(cell);
      });

      tbody.appendChild(row);

      if (endMinutes > 1440) {
        const nextDay = nextDayMap[day];
        const carryoverEnd = endMinutes - 1440;
        if (!carryoverShifts[nextDay]) carryoverShifts[nextDay] = [];
        carryoverShifts[nextDay].push({ name: staff.name, endMinutes: carryoverEnd });
      }
    });
  });

  Object.keys(carryoverShifts).forEach(day => {
    const tbody = scheduleTables[day];
    carryoverShifts[day].forEach(shift => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.textContent = `${shift.name} (Carryover)`;
      row.appendChild(nameCell);

      timeSlots.forEach(slot => {
        const cell = document.createElement("td");
        const [slotH, slotM] = slot.split(":").map(Number);
        const slotMinutes = slotH * 60 + slotM;
        let status = "0";
        if (slotMinutes >= 0 && slotMinutes < shift.endMinutes) status = "1";
        cell.textContent = status;
        cell.setAttribute("data-status", status);
        cell.classList.add("time-slot");
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });
  });
}


// Update all out-time displays in the table
function updateOutTimes() {
  document.querySelectorAll('#staff-input-table tbody tr').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const start = inputs[1].value;
    const hours = parseInt(inputs[2].value, 10);
    const lunch = inputs[3].checked;
    const outDisplay = inputs[4];
    if (start && !isNaN(hours)) {
      outDisplay.value = calculateEndTime(start, hours, lunch).display;
    } else {
      outDisplay.value = '';
    }
  });
}

function buildStaffTable() {
  const tbody = document.querySelector("#staff-input-table tbody");
  const saveBtn = document.getElementById("save-staff");
  tbody.innerHTML = "";

  for (let i = 0; i < 30; i++) {
    const row = document.createElement("tr");
    const staffEntry = staffData[i] || { name: '', startTime: '', hoursWorked: '', hasLunch: false, outTime: '', days: [] };

    const nameInput = createInput("text", staffEntry.name, `Staff ${i + 1}`);
    row.appendChild(wrapTd(nameInput));

    const startTimeInput = createInput("time", staffEntry.startTime);
    row.appendChild(wrapTd(startTimeInput));

    const hoursWorkedInput = createInput("number", staffEntry.hoursWorked);
    hoursWorkedInput.min = 1;
    hoursWorkedInput.max = 24;
    row.appendChild(wrapTd(hoursWorkedInput));

    const lunchInput = createInput("checkbox", '', '', staffEntry.hasLunch);
    row.appendChild(wrapTd(lunchInput));

    const outTimeInput = createInput("text", staffEntry.outTime);
    outTimeInput.readOnly = true;
    row.appendChild(wrapTd(outTimeInput));

    // Auto update on input changes
    [startTimeInput, hoursWorkedInput, lunchInput].forEach(input => {
      input.addEventListener("input", () => {
        if (startTimeInput.value && hoursWorkedInput.value) {
          const [h, m] = startTimeInput.value.split(":").map(Number);
          let duration = parseInt(hoursWorkedInput.value, 10) * 60 + (lunchInput.checked ? 60 : 0);
          let end = h * 60 + m + duration;
          const hourEnd = Math.floor(end / 60) % 24;
          const minEnd = end % 60;
          outTimeInput.value = `${String(hourEnd).padStart(2, '0')}:${String(minEnd).padStart(2, '0')}`;
        } else {
          outTimeInput.value = '';
        }
      });
    });

    daysOfWeek.forEach(day => {
      const checkbox = createInput("checkbox", '', '', staffEntry.days.includes(day));
      row.appendChild(wrapTd(checkbox));
    });

    tbody.appendChild(row);
  }

  saveBtn?.addEventListener("click", () => {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    staffData.length = 0;
    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      const name = cells[0].querySelector("input").value.trim();
      const startTime = cells[1].querySelector("input").value;
      const hoursWorked = parseInt(cells[2].querySelector("input").value, 10);
      const hasLunch = cells[3].querySelector("input").checked;
      const outTime = cells[4].querySelector("input").value;

      if (name && startTime && hoursWorked && outTime) {
        const entry = {
          name,
          startTime,
          hoursWorked,
          hasLunch,
          outTime,
          days: daysOfWeek.filter((_, i) => cells[5 + i].querySelector("input").checked)
        };
        staffData.push(entry);
      }
    });

    localStorage.setItem("staffData", JSON.stringify(staffData));
    updateOutTimes();
    forceEndTimeRecalc();
    generateHeatmap();
    generateDailyGrids();
    alert("Schedule updated.");
  });

  updateOutTimes();
}

function forceEndTimeRecalc() {
  const rows = document.querySelectorAll("#staff-input-table tbody tr");
  rows.forEach(row => {
    const inputs = row.querySelectorAll("td input");
    const startTimeInput = inputs[1];
    const lunchCheckbox = inputs[3];
    if (startTimeInput?.value && lunchCheckbox) {
      const originalState = lunchCheckbox.checked;
      lunchCheckbox.checked = !originalState;
      setTimeout(() => {
        lunchCheckbox.checked = originalState;
        lunchCheckbox.dispatchEvent(new Event("input"));
      }, 500);
    }
  });
}


// Calculate end time: returns both raw (24h) and display (12h) formats
function calculateEndTime(startTime, hoursWorked, hasLunch) {
  const [h, m] = startTime.split(':').map(Number);
  const duration = hoursWorked * 60 + (hasLunch ? 60 : 0);
  const endMinutes = h * 60 + m + duration;
  const hourEnd = Math.floor(endMinutes / 60) % 24;
  const minEnd = endMinutes % 60;
  return {
    raw: `${String(hourEnd).padStart(2, '0')}:${String(minEnd).padStart(2, '0')}`,
    display: to12HourFormat(hourEnd, minEnd)
  };
}


// Attach listeners to a row's inputs
function attachRowListeners(row) {
  row.querySelectorAll('input[type="time"], input[type="number"], input[type="checkbox"]').forEach(input => {
    ['input','change'].forEach(evt => input.addEventListener(evt, updateOutTimes));
  });
}

// Render the input table based on staffData
function renderStaffTable() {
  const tbody = document.querySelector('#staff-input-table tbody');
  tbody.innerHTML = '';
  for (let i = 0; i < 30; i++) {
    const stored = staffData[i] || { name:'', startTime:'', hoursWorked:'', hasLunch:false, outTime:'', days:[] };
    const convertedSchedule = stored.startTime ? convertScheduleDaysAndTime(stored.startTime, stored.days, EASTERN_ZONE, getStaffEntryZone()) : { startTime:'', days:[] };
    const data = { ...stored, startTime: convertedSchedule.startTime, days: convertedSchedule.days };
    if (data.startTime && data.hoursWorked) data.outTime = calculateEndTime(data.startTime, data.hoursWorked, data.hasLunch).display;
    const row = document.createElement('tr');
    ['text','time','number','checkbox','text'].forEach((type, idx) => {
      const cell = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = type;
      if (type === 'checkbox') inp.checked = data.hasLunch;
      else if (idx === 0) inp.placeholder = `Staff ${i+1}`;
      inp.value = type==='checkbox'?undefined:data[['name','startTime','hoursWorked','outTime'][idx]];
      if (type==='text' && idx===4) inp.readOnly = true;
      cell.appendChild(inp);
      row.appendChild(cell);
    });
    daysOfWeek.forEach(d => {
      const cell = document.createElement('td');
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = data.days.includes(d);
      cell.appendChild(chk);
      row.appendChild(cell);
    });
    attachRowListeners(row);
    tbody.appendChild(row);
  }
  updateOutTimes();
}

// CSV Import
function importFromCSV(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const rows = e.target.result.trim().split('\n').map(r => r.split(','));
    staffData.length = 0;
    rows.slice(1).forEach(cells => {
      if (cells.length >= 12) {
        const [name,start,hours,lunch,,...weekday] = cells;
        const hw = parseInt(hours,10);
        const hasLunch = lunch.trim()==='Yes';
        const {raw,display} = calculateEndTime(start.trim(),hw,hasLunch);
        staffData.push({name:name.trim(),startTime:start.trim(),hoursWorked:hw,hasLunch,endTime:raw,outTime:display,days:daysOfWeek.filter((_,i)=>weekday[i]?.trim()==='Yes')});
      }
    });
    saveLocalCache(staffData);
    saveSharedData({ quiet: true });
    renderStaffTable(); generateHeatmap(); generateDailyGrids(); updateOutTimes();
    alert('Imported successfully');
  };
  reader.readAsText(file);
}

// CSV Export
function exportToCSV() {
  const header = ['Name','Start Time','Hours','Lunch','End Time',...daysOfWeek].join(',');
  const csv = [header,...staffData.map(s=>[s.name,s.startTime,s.hoursWorked,s.hasLunch?'Yes':'No',s.endTime,...daysOfWeek.map(d=>s.days.includes(d)?'Yes':'No')].join(','))].join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='staff_schedule.csv'; a.click();
}




// Heatmap & Daily grid generation remain unchanged

// ─── On load initialization ───────────────────────────────────────
const daysOfWeek = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let staffData  = JSON.parse(localStorage.getItem('staffData')) || [];

function persistCustomTimeZones() {
  localStorage.setItem('customTimeZones', JSON.stringify(timeZones.filter(zone => zone.custom).map(({id,label,zone}) => ({id,label,zone}))));
}

function isValidTimeZone(zone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return true; } catch { return false; }
}

function renderTimeZoneControls() {
  const list = document.getElementById('custom-timezone-list');
  if (!list) return;
  list.innerHTML = '';
  timeZones.filter(zone => zone.custom).forEach(zone => {
    const label = document.createElement('label');
    label.className = 'timezone-option custom-zone-option';
    label.innerHTML = `<input type="checkbox" class="timezone-toggle" value="${zone.id}" checked> ${zone.label} <button type="button" class="remove-timezone" data-zone-id="${zone.id}" title="Remove time zone">×</button>`;
    list.appendChild(label);
  });
}

function populateStaffEntryTimeZones() {
  const select = document.getElementById('staff-entry-timezone');
  if (!select) return;
  const previous = localStorage.getItem('staffEntryTimeZone') || EASTERN_ZONE;
  select.innerHTML = timeZones.map(zone => `<option value="${zone.zone}">${zone.primary ? 'US Eastern (saved time)' : zone.label}</option>`).join('');
  select.value = timeZones.some(zone => zone.zone === previous) ? previous : EASTERN_ZONE;
}

function bindTimeZoneToggle(toggle) {
  const saved = localStorage.getItem(`timezone-${toggle.value}`);
  if (saved !== null) toggle.checked = saved === 'true';
  toggle.addEventListener('change', () => {
    localStorage.setItem(`timezone-${toggle.value}`, String(toggle.checked));
    generateHeatmap();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Create shared fileInput for import & test data
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', importFromCSV);

  // 1) Dark mode toggle
  const darkToggle = document.getElementById('dark-mode-toggle');
  if (localStorage.getItem('darkMode') === 'enabled') document.body.classList.add('dark-mode');
  darkToggle.addEventListener('click', () => {
    const enabled = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', enabled ? 'enabled' : 'disabled');
  });

  // 2) Instructions panel toggle
  const instr = document.getElementById('instructions');
  const showToggle = document.getElementById('show-on-load');
  if (instr && showToggle) {
    const pref = localStorage.getItem('showInstructions');
    instr.open = pref !== 'false';
    showToggle.checked = pref !== 'false';
    showToggle.addEventListener('change', () => {
      localStorage.setItem('showInstructions', showToggle.checked ? 'true' : 'false');
    });
  }

  // 3) Half-hour heatmap toggle
  document.getElementById('half-hour-toggle').addEventListener('change', () => {
    generateHeatmap();
    generateDailyGrids();
  });

  // Optional aligned time-zone rows and user-added zones
  renderTimeZoneControls();
  document.querySelectorAll('.timezone-toggle').forEach(bindTimeZoneToggle);
  populateStaffEntryTimeZones();

  document.getElementById('add-timezone')?.addEventListener('click', () => {
    const select = document.getElementById('timezone-add-select');
    const customInput = document.getElementById('custom-timezone-input');
    const selected = select?.value || '';
    let [zone, label] = selected.split('|');
    if (customInput?.value.trim()) { zone = customInput.value.trim(); label = zone.split('/').pop().replace(/_/g, ' '); }
    if (!zone || !isValidTimeZone(zone)) { alert('Enter or select a valid IANA time zone, such as Europe/Madrid.'); return; }
    if (timeZones.some(item => item.zone === zone)) { alert('That time zone is already available.'); return; }
    const item = { id: `custom-${zone.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`, label: label || zone, zone, custom: true };
    timeZones.push(item); persistCustomTimeZones(); renderTimeZoneControls();
    const toggle = document.querySelector(`.timezone-toggle[value="${item.id}"]`); bindTimeZoneToggle(toggle);
    populateStaffEntryTimeZones(); generateHeatmap();
    if (select) select.value = ''; if (customInput) customInput.value = '';
  });

  document.getElementById('custom-timezone-list')?.addEventListener('click', event => {
    const button = event.target.closest('.remove-timezone'); if (!button) return;
    const id = button.dataset.zoneId; timeZones = timeZones.filter(zone => zone.id !== id);
    localStorage.removeItem(`timezone-${id}`); persistCustomTimeZones(); renderTimeZoneControls();
    document.querySelectorAll('#custom-timezone-list .timezone-toggle').forEach(bindTimeZoneToggle);
    populateStaffEntryTimeZones(); generateHeatmap();
  });

  document.getElementById('staff-entry-timezone')?.addEventListener('change', event => {
    localStorage.setItem('staffEntryTimeZone', event.target.value);
    renderStaffTable();
  });

  // 4) Clear staff data
  document.getElementById('clear-staff').addEventListener('click', () => {
    localStorage.removeItem('staffData');
    alert('Staff data cleared.');
    location.reload();
  });

  // 5) Load test data
  const loadTestBtn = document.getElementById('load-test');
  loadTestBtn?.addEventListener('click', () => {
    const csv = `Name,Start Time,Hours,Lunch,End Time,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday
Bob Sacamano,06:30,10,Yes,17:30,Yes,Yes,Yes,Yes,Yes,No,No
Tim Whatley,07:00,10,Yes,18:00,Yes,Yes,Yes,Yes,Yes,No,No
Lloyd Braun,10:30,10,Yes,21:30,No,No,Yes,Yes,Yes,Yes,No
Jackie Chiles,08:00,10,Yes,19:00,Yes,Yes,Yes,No,No,No,Yes
Izzy Mandelbaum,11:00,10,Yes,22:00,Yes,Yes,Yes,No,No,No,Yes
Babu Bhatt,11:00,10,Yes,22:00,No,No,Yes,Yes,Yes,Yes,No
Jean-Paul Jean-Paul,08:00,10,Yes,19:00,No,No,Yes,Yes,Yes,Yes,No
Bob Cobb,23:30,10,Yes,10:30,No,Yes,Yes,Yes,Yes,Yes,No
David Puddy,21:30,10,Yes,08:30,No,No,Yes,Yes,Yes,Yes,No
Sue Ellen Mischke,21:30,10,Yes,08:30,Yes,Yes,Yes,No,No,No,Yes
Frank Costanza,23:00,10,Yes,10:00,Yes,No,Yes,Yes,No,No,Yes
Kenny Bania,07:00,10,Yes,18:00,Yes,No,No,No,Yes,Yes,Yes
Mickey Abbott,10:30,10,Yes,21:30,Yes,Yes,Yes,No,No,No,Yes
Joe Davola,05:00,10,Yes,16:00,Yes,Yes,Yes,No,No,No,Yes
Sidra Holland,07:00,10,Yes,18:00,Yes,Yes,Yes,Yes,Yes,No,No
Jacopo Peterman,12:00,10,Yes,23:00,Yes,Yes,Yes,No,No,No,Yes
Yev Kassem,21:30,10,Yes,08:30,Yes,Yes,Yes,No,No,No,Yes
Matt Wilhelm,05:00,10,Yes,16:00,Yes,Yes,Yes,No,No,No,Yes
Justin Pitt,12:00,10,Yes,23:00,Yes,Yes,Yes,No,No,No,Yes
Russell Dalrymple,21:30,10,Yes,08:30,No,No,Yes,Yes,Yes,Yes,No
Jack Klompus,06:30,10,Yes,17:30,Yes,Yes,Yes,No,No,No,Yes
Art Vandelay,07:00,10,Yes,18:00,No,No,Yes,Yes,Yes,Yes,No
Peter von Nostrand,10:30,10,Yes,21:30,Yes,Yes,Yes,No,No,No,Yes`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const fakeFile = new File([blob], 'test_staff_data.csv', { type: 'text/csv' });
    // Override fileInput.files to include our fake file
    Object.defineProperty(fileInput, 'files', { value: [fakeFile] });
    fileInput.dispatchEvent(new Event('change'));
  });

  // 6) CSV import/export & Save
  document.getElementById('import-csv').addEventListener('click', () => fileInput.click());
  document.getElementById('export-csv').addEventListener('click', exportToCSV);
  document.getElementById('save-staff').addEventListener('click', () => {
    // 1) make sure all Out-Time inputs are up-to-date
    updateOutTimes();

    // 2) read every row of the staff table into a fresh array
    const rows = document.querySelectorAll('#staff-input-table tbody tr');
    const newData = [];
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      const name       = inputs[0].value.trim();
      const startTime  = inputs[1].value;
      const hoursWorked= parseInt(inputs[2].value, 10);
      const hasLunch   = inputs[3].checked;
      const outTime    = inputs[4].value;
      // daysOfWeek is your [ "Monday", …, "Sunday" ] array
      const days = daysOfWeek.filter((_, idx) => inputs[5 + idx].checked);

      // only keep fully-filled rows
      if (name && startTime && hoursWorked && outTime) {
        const easternSchedule = convertScheduleDaysAndTime(startTime, days, getStaffEntryZone(), EASTERN_ZONE);
        const easternEnd = calculateEndTime(easternSchedule.startTime, hoursWorked, hasLunch);
        newData.push({ name, startTime: easternSchedule.startTime, hoursWorked, hasLunch, endTime: easternEnd.raw, outTime: easternEnd.display, days: easternSchedule.days });
      }
    });

    // 3) replace staffData and persist
    staffData = newData;
    persistStaffData({ tryShared: true, quiet: true });

    // 4) re-draw everything
    generateHeatmap();
    generateDailyGrids();

    //alert('Schedule updated.');
  });

  // 7) Shared-file storage. Loading is attempted automatically; local cache remains the fallback.
  document.getElementById('load-shared-storage')?.addEventListener('click', async () => {
    if (await loadSharedData()) {
      renderStaffTable(); generateHeatmap(); generateDailyGrids();
    }
  });
  document.getElementById('save-shared-storage')?.addEventListener('click', async () => {
    saveLocalCache(staffData);
    await saveSharedData();
  });

  await loadSharedData({ quiet: true });

  // 8) Initial render
  renderStaffTable();
  generateHeatmap();
  generateDailyGrids();
});