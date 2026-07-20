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



// Time-zone configuration. The selected page zone is the active primary row.
let timeZones = [
  { id: 'eastern', label: 'US Eastern', zone: 'America/New_York' },
  { id: 'central', label: 'US Central', zone: 'America/Chicago' },
  { id: 'phoenix', label: 'Phoenix, AZ', zone: 'America/Phoenix' },
  { id: 'uk', label: 'United Kingdom', zone: 'Europe/London' },
  { id: 'brisbane', label: 'Brisbane, QLD', zone: 'Australia/Brisbane' }
];

const EASTERN_ZONE = 'America/New_York';

function saveLocalCache(data = staffData) {
  localStorage.setItem('staffData', JSON.stringify(data));
}

// Normalize HTML time values so both "5:00" and "05:00" load as "05:00".
function normalizeTimeValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeStaffEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const startTime = normalizeTimeValue(entry.startTime);
  const endTime = normalizeTimeValue(entry.endTime);
  return { ...entry, active: entry.active !== false, startTime, endTime };
}

function persistStaffData() {
  saveLocalCache(staffData);
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
  const primaryZone = getStaffEntryZone();
  const rows = [];

  // Eastern is always shown immediately above a non-Eastern primary zone.
  if (primaryZone !== EASTERN_ZONE) {
    rows.push({ ...timeZones.find(zone => zone.zone === EASTERN_ZONE), reference: true });
  }

  const primaryDefinition = timeZones.find(zone => zone.zone === primaryZone) || {
    id: `active-${primaryZone.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
    label: primaryZone,
    zone: primaryZone
  };
  rows.push({ ...primaryDefinition, primary: true, label: `Primary — ${primaryDefinition.label}` });

  timeZones.forEach(zone => {
    if (!enabled.has(zone.id)) return;
    if (zone.zone === primaryZone || zone.zone === EASTERN_ZONE) return;
    rows.push(zone);
  });
  return rows;
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

function formatTimeBetweenZones(sourceTime, sourceZone, targetZone, referenceDate = new Date()) {
  sourceTime = normalizeTimeValue(sourceTime);
  if (!sourceTime) return { text: '', dayOffset: 0 };
  const [hour, minute] = sourceTime.split(':').map(Number);
  const sourceInstant = zonedWallTimeToDate(
    referenceDate.getFullYear(), referenceDate.getMonth() + 1, referenceDate.getDate(),
    hour, minute, sourceZone
  );
  const sourceParts = getZonedDateParts(sourceInstant, sourceZone);
  const targetParts = getZonedDateParts(sourceInstant, targetZone);
  const sourceDate = Date.UTC(Number(sourceParts.year), Number(sourceParts.month)-1, Number(sourceParts.day));
  const targetDate = Date.UTC(Number(targetParts.year), Number(targetParts.month)-1, Number(targetParts.day));
  const dayOffset = Math.round((targetDate - sourceDate) / 86400000);
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone: targetZone, hour: 'numeric', minute: '2-digit', hour12: true
  }).format(sourceInstant).replace(' ', '\u00a0');
  return { text, dayOffset };
}

function formatTimeForZone(primaryTime, targetZone, referenceDate = new Date()) {
  return formatTimeBetweenZones(primaryTime, getStaffEntryZone(), targetZone, referenceDate);
}

function getReferenceMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 12, 0, 0);
}

function convertScheduleDaysAndTime(startTime, days, fromZone, toZone) {
  startTime = normalizeTimeValue(startTime);
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

function getBusinessHoursConfig() {
  return {
    zone: document.getElementById('business-hours-zone')?.value || EASTERN_ZONE,
    start: normalizeTimeValue(document.getElementById('business-hours-start')?.value) || '08:00',
    end: normalizeTimeValue(document.getElementById('business-hours-end')?.value) || '17:00'
  };
}

function minutesFromTime(value) {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return 0;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

function isBusinessHourSlot(primaryTime, referenceDate = new Date()) {
  const primaryZone = getStaffEntryZone();
  const config = getBusinessHoursConfig();
  const converted = formatTimeBetweenZones(primaryTime, primaryZone, config.zone, referenceDate);
  const [timeText, period] = converted.text.replace('\u00a0', ' ').split(' ');
  let [hour, minute] = timeText.split(':').map(Number);
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  const check = hour * 60 + minute;
  const start = minutesFromTime(config.start);
  const end = minutesFromTime(config.end);
  return start <= end ? check >= start && check < end : check >= start || check < end;
}

function getStaffDataForZone(zone) {
  return staffData.filter(staff => staff.active !== false && staff.name && staff.startTime && Number.isFinite(Number(staff.hoursWorked))).map(staff => {
    const converted = convertScheduleDaysAndTime(staff.startTime, staff.days, EASTERN_ZONE, zone);
    return { ...staff, startTime: converted.startTime, days: converted.days };
  });
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
  const primaryZone = getStaffEntryZone();
  const enabledZones = getEnabledTimeZones();
  const referenceDate = new Date();
  const displayStaff = getStaffDataForZone(primaryZone);

  enabledZones.forEach(zone => {
    const row = document.createElement('tr');
    row.className = `timezone-row${zone.primary ? ' primary-timezone-row' : ''}${zone.reference ? ' eastern-reference-row' : ''}`;

    const labelHeader = document.createElement('th');
    const abbreviation = getTimeZoneName(zone.zone, referenceDate);
    labelHeader.innerHTML = `<span>${zone.label}</span><small>${abbreviation}</small>`;
    row.appendChild(labelHeader);

    hours.forEach(hour => {
      const timeHeader = document.createElement('th');
      const converted = formatTimeBetweenZones(hour, primaryZone, zone.zone, referenceDate);
      if (isBusinessHourSlot(hour, referenceDate)) timeHeader.classList.add('business-hours');
      timeHeader.innerHTML = `<span class="zone-time">${converted.text}</span>${converted.dayOffset ? `<small class="day-offset">${converted.dayOffset > 0 ? '+' : ''}${converted.dayOffset}</small>` : '<small class="day-offset current-day"></small>'}`;
      row.appendChild(timeHeader);
    });
    gridHeader.appendChild(row);
  });

  const countsByDay = daysOfWeek.map((day, dayIndex) => hours.map(hour => {
    const previousDayIndex = (dayIndex - 1 + 7) % 7;
    const previousDay = daysOfWeek[previousDayIndex];
    return displayStaff.filter(staff => (
      (staff.days.includes(day) && isTimeWithinShift(staff.startTime, staff.hoursWorked, staff.hasLunch, hour, dayIndex)) ||
      (staff.days.includes(previousDay) && isCarryoverShift(staff.startTime, staff.hoursWorked, staff.hasLunch, hour, previousDayIndex))
    )).length;
  }));

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
      if (isBusinessHourSlot(hour, referenceDate)) cell.classList.add('business-hours');
      cell.textContent = count;
      cell.title = `${day} ${hour} in ${primaryZone}: ${count} staff`;
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
  const primaryZone = getStaffEntryZone();
  const displayStaffData = getStaffDataForZone(primaryZone);
  const referenceDate = new Date();
  const nextDayMap = {
    "Monday": "Tuesday", "Tuesday": "Wednesday", "Wednesday": "Thursday",
    "Thursday": "Friday", "Friday": "Saturday", "Saturday": "Sunday", "Sunday": "Monday"
  };

  const scheduleTables = {};
  daysOfWeek.forEach(day => {
    const heading = document.createElement("h2");
    heading.textContent = `${day} Schedule — ${timeZones.find(zone => zone.zone === primaryZone)?.label || primaryZone}`;
    scheduleContainer.appendChild(heading);

    const table = document.createElement("table");
    table.classList.add("schedule-table");

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `<th>Name</th>` + timeSlots.map(slot => `<th class="${isBusinessHourSlot(slot, referenceDate) ? 'business-hours' : ''}">${slot}</th>`).join("");
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    scheduleContainer.appendChild(table);
    scheduleTables[day] = tbody;
  });

  const carryoverShifts = {};

  displayStaffData.forEach(staff => {
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
        if (isBusinessHourSlot(slot, referenceDate)) cell.classList.add("business-hours");
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
        if (isBusinessHourSlot(slot, referenceDate)) cell.classList.add("business-hours");
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
    const start = inputs[2].value;
    const hours = parseInt(inputs[3].value, 10);
    const lunch = inputs[4].checked;
    const outDisplay = inputs[5];
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
    const startTimeInput = inputs[2];
    const lunchCheckbox = inputs[4];
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
  startTime = normalizeTimeValue(startTime);
  if (!startTime) return { raw: '', display: '' };
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
function getStaffRowFilter() {
  return localStorage.getItem('staffRowFilter') || 'show-all';
}

function rowIsEmpty(row) {
  const inputs = row.querySelectorAll('input');
  if (!inputs.length) return true;
  const isActive = Boolean(inputs[0]?.checked);
  // Inactive rows always remain visible, even when every other field is empty.
  if (!isActive) return false;
  const hasText = [1, 2, 3].some(index => String(inputs[index]?.value || '').trim() !== '');
  const hasLunch = Boolean(inputs[4]?.checked);
  const hasSelectedDay = Array.from(inputs).slice(6).some(input => input.checked);
  return !hasText && !hasLunch && !hasSelectedDay;
}

function applyStaffRowFilter() {
  const hideEmpty = getStaffRowFilter() === 'hide-empty';
  document.querySelectorAll('#staff-input-table tbody tr').forEach(row => {
    row.hidden = hideEmpty && rowIsEmpty(row);
  });
}

function renderStaffTable() {
  const tbody = document.querySelector('#staff-input-table tbody');
  tbody.innerHTML = '';
  for (let i = 0; i < 30; i++) {
    const stored = normalizeStaffEntry(staffData[i]) || { active:true, name:'', startTime:'', hoursWorked:'', hasLunch:false, outTime:'', days:[] };
    const convertedSchedule = stored.startTime ? convertScheduleDaysAndTime(stored.startTime, stored.days, EASTERN_ZONE, getStaffEntryZone()) : { startTime:'', days:[] };
    const data = { ...stored, active: stored.active !== false, startTime: convertedSchedule.startTime, days: convertedSchedule.days };
    if (data.startTime && data.hoursWorked) data.outTime = calculateEndTime(data.startTime, data.hoursWorked, data.hasLunch).display;
    const row = document.createElement('tr');
    row.classList.toggle('inactive-staff-row', !data.active);

    const activeCell = document.createElement('td');
    activeCell.className = 'active-toggle-cell';
    const activeInput = document.createElement('input');
    activeInput.type = 'checkbox';
    activeInput.checked = data.active;
    activeInput.title = 'Include this staff member in schedules and heatmaps';
    activeInput.setAttribute('aria-label', `Active status for staff row ${i + 1}`);
    activeInput.addEventListener('change', () => {
      row.classList.toggle('inactive-staff-row', !activeInput.checked);
      applyStaffRowFilter();

      // Persist the toggle and immediately refresh schedule outputs.
      // Deferring one frame ensures the checkbox state and row visibility
      // have finished updating before the table is read.
      requestAnimationFrame(() => {
        document.getElementById('save-staff')?.click();
      });
    });
    activeCell.appendChild(activeInput);
    row.appendChild(activeCell);

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
  applyStaffRowFilter();
}
// CSV Import
function importFromCSV(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const rows = e.target.result.trim().split(/\r?\n/).map(r => r.split(','));
    const header = rows[0].map(value => value.trim().toLowerCase());
    const hasActiveColumn = header[0] === 'active';
    staffData.length = 0;
    rows.slice(1).forEach(cells => {
      if (cells.length < (hasActiveColumn ? 13 : 12)) return;
      const offset = hasActiveColumn ? 1 : 0;
      const active = hasActiveColumn ? !['no','false','0','inactive'].includes((cells[0] || '').trim().toLowerCase()) : true;
      const name = cells[offset];
      const start = cells[offset + 1];
      const hours = cells[offset + 2];
      const lunch = cells[offset + 3];
      const weekday = cells.slice(offset + 5, offset + 12);
      const hw = parseInt(hours,10);
      const hasLunch = lunch.trim()==='Yes';
      const normalizedStart = normalizeTimeValue(start);
      const days = daysOfWeek.filter((_,i)=>weekday[i]?.trim()==='Yes');
      if (!active) {
        const end = normalizedStart && Number.isFinite(hw) ? calculateEndTime(normalizedStart, hw, hasLunch) : { raw:'', display:'' };
        staffData.push({active:false,name:(name||'').trim(),startTime:normalizedStart,hoursWorked:Number.isFinite(hw)?hw:'',hasLunch,endTime:end.raw,outTime:end.display,days});
        return;
      }
      if (!normalizedStart || !Number.isFinite(hw) || !(name||'').trim()) return;
      const {raw,display} = calculateEndTime(normalizedStart,hw,hasLunch);
      staffData.push({active:true,name:name.trim(),startTime:normalizedStart,hoursWorked:hw,hasLunch,endTime:raw,outTime:display,days});
    });
    persistStaffData();
    renderStaffTable(); generateHeatmap(); generateDailyGrids(); updateOutTimes();
    alert('Imported successfully');
  };
  reader.readAsText(file);
}

// CSV Export
function exportToCSV() {
  const header = ['Active','Name','Start Time','Hours','Lunch','End Time',...daysOfWeek].join(',');
  const exportRows = staffData.filter(s => s.active === false || s.name || s.startTime || s.hoursWorked || s.days?.length);
  const csv = [header,...exportRows.map(s=>[s.active===false?'No':'Yes',s.name||'',s.startTime||'',s.hoursWorked||'',s.hasLunch?'Yes':'No',s.endTime||'',...daysOfWeek.map(d=>s.days?.includes(d)?'Yes':'No')].join(','))].join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='staff_schedule.csv'; a.click();
}



const PRESET_HOLD_MS = 3000;

function getPresetStorageKey(number) {
  return `staffTablePreset${number}`;
}

function captureStaffTableForPreset() {
  const rows = document.querySelectorAll('#staff-input-table tbody tr');
  return Array.from(rows).map(row => {
    const inputs = row.querySelectorAll('input');
    const active = inputs[0].checked;
    const name = inputs[1].value.trim();
    const startTime = normalizeTimeValue(inputs[2].value);
    const hoursValue = inputs[3].value.trim();
    const hoursWorked = hoursValue === '' ? '' : Number(hoursValue);
    const hasLunch = inputs[4].checked;
    const days = daysOfWeek.filter((_, index) => inputs[6 + index].checked);
    const easternSchedule = startTime
      ? convertScheduleDaysAndTime(startTime, days, getStaffEntryZone(), EASTERN_ZONE)
      : { startTime: '', days };
    const end = easternSchedule.startTime && Number.isFinite(hoursWorked)
      ? calculateEndTime(easternSchedule.startTime, hoursWorked, hasLunch)
      : { raw: '', display: '' };

    return {
      active,
      name,
      startTime: easternSchedule.startTime,
      hoursWorked: Number.isFinite(hoursWorked) ? hoursWorked : '',
      hasLunch,
      endTime: end.raw,
      outTime: end.display,
      days: easternSchedule.days
    };
  });
}

function refreshPresetIndicators() {
  document.querySelectorAll('.preset-button').forEach(button => {
    const hasData = Boolean(localStorage.getItem(getPresetStorageKey(button.dataset.preset)));
    button.classList.toggle('has-data', hasData);
    button.setAttribute('aria-label', `${button.textContent.trim()}. ${hasData ? 'Saved preset available.' : 'Empty preset.'} Click to load; hold for 3 seconds to save.`);
  });
}

function showPresetButtonMessage(button, message) {
  const original = button.dataset.originalText || button.textContent.trim();
  button.dataset.originalText = original;
  button.textContent = message;
  window.clearTimeout(button._messageTimer);
  button._messageTimer = window.setTimeout(() => {
    button.textContent = original;
    refreshPresetIndicators();
  }, 1200);
}

function saveStaffPreset(number, button) {
  updateOutTimes();
  const preset = {
    version: 1,
    savedAt: new Date().toISOString(),
    staff: captureStaffTableForPreset()
  };
  localStorage.setItem(getPresetStorageKey(number), JSON.stringify(preset));
  refreshPresetIndicators();
  showPresetButtonMessage(button, 'Saved');
}

function loadStaffPreset(number, button) {
  const raw = localStorage.getItem(getPresetStorageKey(number));
  if (!raw) {
    showPresetButtonMessage(button, 'Empty');
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed.staff;
    if (!Array.isArray(rows)) throw new Error('Invalid preset data');
    staffData = rows.map(normalizeStaffEntry);
    persistStaffData();
    renderStaffTable();
    generateHeatmap();
    generateDailyGrids();
    applyStaffRowFilter();
    showPresetButtonMessage(button, 'Loaded');
  } catch (error) {
    console.error('Unable to load staff preset:', error);
    showPresetButtonMessage(button, 'Error');
  }
}

function initializePresetButtons() {
  document.querySelectorAll('.preset-button').forEach(button => {
    let holdTimer = null;
    let longPressFired = false;
    const number = button.dataset.preset;
    button.dataset.originalText = button.textContent.trim();

    const cancelHold = () => {
      window.clearTimeout(holdTimer);
      holdTimer = null;
      button.classList.remove('is-holding');
    };

    button.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      longPressFired = false;
      button.classList.add('is-holding');
      holdTimer = window.setTimeout(() => {
        longPressFired = true;
        button.classList.remove('is-holding');
        saveStaffPreset(number, button);
        if (navigator.vibrate) navigator.vibrate(50);
      }, PRESET_HOLD_MS);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(eventName => {
      button.addEventListener(eventName, cancelHold);
    });

    button.addEventListener('click', event => {
      event.preventDefault();
      if (longPressFired) {
        longPressFired = false;
        return;
      }
      loadStaffPreset(number, button);
    });

    button.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadStaffPreset(number, button);
      }
    });

    button.addEventListener('contextmenu', event => event.preventDefault());
  });
  refreshPresetIndicators();
}


// Heatmap & Daily grid generation remain unchanged

// ─── On load initialization ───────────────────────────────────────
const daysOfWeek = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let staffData = (JSON.parse(localStorage.getItem('staffData')) || []).map(normalizeStaffEntry);
saveLocalCache(staffData);

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

function populateTimeZoneSelectors() {
  const primarySelect = document.getElementById('staff-entry-timezone');
  const businessSelect = document.getElementById('business-hours-zone');
  const options = timeZones.map(zone => `<option value="${zone.zone}">${zone.label}${zone.zone === EASTERN_ZONE ? ' (saved time)' : ''}</option>`).join('');

  if (primarySelect) {
    const previous = localStorage.getItem('staffEntryTimeZone') || EASTERN_ZONE;
    primarySelect.innerHTML = options;
    primarySelect.value = timeZones.some(zone => zone.zone === previous) ? previous : EASTERN_ZONE;
  }
  if (businessSelect) {
    const previous = localStorage.getItem('businessHoursZone') || EASTERN_ZONE;
    businessSelect.innerHTML = options;
    businessSelect.value = timeZones.some(zone => zone.zone === previous) ? previous : EASTERN_ZONE;
  }
}

function bindTimeZoneToggle(toggle) {
  const saved = localStorage.getItem(`timezone-${toggle.value}`);
  if (saved !== null) toggle.checked = saved === 'true';
  toggle.addEventListener('change', () => {
    localStorage.setItem(`timezone-${toggle.value}`, String(toggle.checked));
    generateHeatmap();
    generateDailyGrids();
  });
}

document.addEventListener('DOMContentLoaded', () => {
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

  // Split view toggle
  const splitToggle = document.getElementById('split-view-toggle');
  if (splitToggle) {
    const splitEnabled = localStorage.getItem('splitView') === 'enabled';
    splitToggle.checked = splitEnabled;
    document.body.classList.toggle('split-view', splitEnabled);

    splitToggle.addEventListener('change', () => {
      document.body.classList.toggle('split-view', splitToggle.checked);
      localStorage.setItem('splitView', splitToggle.checked ? 'enabled' : 'disabled');

      // Re-render after the layout width changes so both columns size cleanly.
      requestAnimationFrame(() => {
        generateHeatmap();
        generateDailyGrids();
      });
    });
  }

  // 2) Instructions panel opens from its summary link and can be collapsed from within.
  const instr = document.getElementById('instructions');
  const collapseInstructions = document.getElementById('collapse-instructions');
  if (instr && collapseInstructions) {
    collapseInstructions.addEventListener('click', () => {
      instr.open = false;
      instr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  populateTimeZoneSelectors();

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
    populateTimeZoneSelectors(); generateHeatmap(); generateDailyGrids();
    if (select) select.value = ''; if (customInput) customInput.value = '';
  });

  document.getElementById('custom-timezone-list')?.addEventListener('click', event => {
    const button = event.target.closest('.remove-timezone'); if (!button) return;
    const id = button.dataset.zoneId; timeZones = timeZones.filter(zone => zone.id !== id);
    localStorage.removeItem(`timezone-${id}`); persistCustomTimeZones(); renderTimeZoneControls();
    document.querySelectorAll('#custom-timezone-list .timezone-toggle').forEach(bindTimeZoneToggle);
    populateTimeZoneSelectors(); generateHeatmap(); generateDailyGrids();
  });

  document.getElementById('staff-entry-timezone')?.addEventListener('change', event => {
    localStorage.setItem('staffEntryTimeZone', event.target.value);
    renderStaffTable();
    generateHeatmap();
    generateDailyGrids();
    applyStaffRowFilter();
  });

  const businessZone = document.getElementById('business-hours-zone');
  const businessStart = document.getElementById('business-hours-start');
  const businessEnd = document.getElementById('business-hours-end');
  if (businessStart) businessStart.value = localStorage.getItem('businessHoursStart') || '08:00';
  if (businessEnd) businessEnd.value = localStorage.getItem('businessHoursEnd') || '17:00';
  [businessZone, businessStart, businessEnd].forEach(control => control?.addEventListener('change', () => {
    if (businessZone) localStorage.setItem('businessHoursZone', businessZone.value);
    if (businessStart) localStorage.setItem('businessHoursStart', normalizeTimeValue(businessStart.value) || '08:00');
    if (businessEnd) localStorage.setItem('businessHoursEnd', normalizeTimeValue(businessEnd.value) || '17:00');
    generateHeatmap();
    generateDailyGrids();
  }));

  const timezoneConfig = document.getElementById('timezone-config');
  if (timezoneConfig) {
    const savedOpen = localStorage.getItem('timezoneConfigOpen');
    if (savedOpen !== null) timezoneConfig.open = savedOpen === 'true';
    timezoneConfig.addEventListener('toggle', () => localStorage.setItem('timezoneConfigOpen', String(timezoneConfig.open)));
  }

  // Staff table row visibility filter
  const savedRowFilter = getStaffRowFilter();
  document.querySelectorAll('input[name="staff-row-filter"]').forEach(radio => {
    radio.checked = radio.value === savedRowFilter;
    radio.addEventListener('change', event => {
      if (!event.target.checked) return;
      localStorage.setItem('staffRowFilter', event.target.value);
      requestAnimationFrame(applyStaffRowFilter);
    });
  });

  // Staff table presets: click to load, hold for three seconds to save.
  initializePresetButtons();

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
      const active      = inputs[0].checked;
      const name        = inputs[1].value.trim();
      const startTime   = normalizeTimeValue(inputs[2].value);
      const hoursWorked = parseInt(inputs[3].value, 10);
      const hasLunch    = inputs[4].checked;
      const outTime     = inputs[5].value;
      const days = daysOfWeek.filter((_, idx) => inputs[6 + idx].checked);
      const hasAnyEntry = Boolean(name || startTime || Number.isFinite(hoursWorked) || hasLunch || days.length);

      if (!active) {
        // Preserve inactive rows, including a completely empty inactive placeholder.
        const easternSchedule = startTime
          ? convertScheduleDaysAndTime(startTime, days, getStaffEntryZone(), EASTERN_ZONE)
          : { startTime: '', days };
        const easternEnd = easternSchedule.startTime && Number.isFinite(hoursWorked)
          ? calculateEndTime(easternSchedule.startTime, hoursWorked, hasLunch)
          : { raw: '', display: '' };
        newData.push({ active:false, name, startTime:easternSchedule.startTime, hoursWorked:Number.isFinite(hoursWorked)?hoursWorked:'', hasLunch, endTime:easternEnd.raw, outTime:easternEnd.display, days:easternSchedule.days });
      } else if (hasAnyEntry && name && startTime && Number.isFinite(hoursWorked) && outTime) {
        const easternSchedule = convertScheduleDaysAndTime(startTime, days, getStaffEntryZone(), EASTERN_ZONE);
        const easternEnd = calculateEndTime(easternSchedule.startTime, hoursWorked, hasLunch);
        newData.push({ active:true, name, startTime: easternSchedule.startTime, hoursWorked, hasLunch, endTime: easternEnd.raw, outTime: easternEnd.display, days: easternSchedule.days });
      }
    });

    // 3) replace staffData and persist
    staffData = newData;
    persistStaffData();

    // 4) re-draw everything
    generateHeatmap();
    generateDailyGrids();
    applyStaffRowFilter();

    //alert('Schedule updated.');
  });

  // 8) Initial render
  renderStaffTable();
  generateHeatmap();
  generateDailyGrids();
});