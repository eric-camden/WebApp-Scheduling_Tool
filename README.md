# International Staff Scheduler

International Staff Scheduler is a browser-based scheduling and coverage tool for teams working across multiple regions. It provides staff entry, automatic shift calculations, a weekly coverage heatmap, daily schedule views, time-zone conversion, CSV import and export, local browser storage, and light or dark display modes.

![International Staff Scheduler preview](preview.png)

## Features

### Staff scheduling

- Enter up to 30 staff members.
- Record each employee's name, start time, scheduled hours, lunch selection, and working days.
- Calculate end times automatically.
- Support shifts that cross midnight.
- View schedules in hourly or half-hour intervals.

### International time-zone display

The heatmap uses US Eastern Time as the primary reference row. Optional time-zone rows appear directly beneath it so equivalent times remain aligned with the same coverage column.

Included zones:

- US Eastern: `America/New_York`
- US Central: `America/Chicago`
- Phoenix, Arizona: `America/Phoenix`
- United Kingdom: `Europe/London`
- Brisbane, Queensland: `Australia/Brisbane`

Additional zones can be added from the supplied list, including Madrid, Paris, Berlin, India, Singapore, Tokyo, and Auckland. A custom browser-supported IANA time-zone name can also be entered, such as `Europe/Madrid`.

Time-zone abbreviations and offsets are calculated using the current date, so daylight-saving changes are handled automatically where applicable.

### Day-change indicators

A small marker appears beneath a converted heatmap time when the local calendar day differs from the primary Eastern day:

- `+1` means the next calendar day.
- `-1` means the previous calendar day.
- No marker is displayed when the time remains on the same calendar day.

### Staff-entry viewing zone

The staff table can be viewed and edited in any available time zone. When the selected viewing zone crosses midnight, the displayed weekday and time are converted together.

US Eastern Time remains the canonical storage format. Schedule data is always saved and exported in Eastern Time regardless of the zone used while viewing or editing.

### Dynamic coverage heatmap

The heatmap color scale adjusts to the current schedule:

- Zero coverage is red.
- The highest staffing count currently displayed is green.
- Intermediate values transition through orange and yellow.
- The legend reports the current maximum.

### Additional capabilities

- Weekly heatmap and daily schedule tables
- CSV import and export
- Automatic browser-based saving with `localStorage`
- Optional sample data
- Clear schedule control
- Persistent light and dark mode preference
- Persistent time-zone display preferences

## Getting Started

No installation or web server is required.

1. Extract the project files to a folder.
2. Open `index.html` in a modern browser.
3. Enter staff information or import an existing CSV file.
4. Select the desired staff-entry viewing time zone.
5. Select the optional heatmap time zones to display.
6. Choose hourly or half-hour coverage.
7. Select **Update & Save** to refresh the heatmap and daily schedules.

## Staff-Entry Time-Zone Workflow

A manager in another region can work in local time without changing the stored schedule standard.

Example:

1. Select Brisbane as the staff-entry viewing zone.
2. Enter or revise the employee's local Brisbane time and working day.
3. Select **Update & Save**.
4. Switch the viewing zone back to US Eastern.
5. The corresponding Eastern time and weekday will be displayed.
6. Exported CSV data will use the Eastern values.

## CSV Format

CSV files use the following columns:

```csv
Name,Start Time,Hours,Lunch,End Time,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday
Jane Doe,06:00,8,No,14:00,Yes,Yes,No,No,Yes,No,No
```

Field guidance:

- `Start Time` and `End Time` use 24-hour `HH:mm` format.
- `Hours` is the number of scheduled work hours.
- `Lunch` uses `Yes` or `No`.
- Weekday fields use `Yes` or `No`.
- Imported and exported times are interpreted as US Eastern Time.

## Data Storage

Schedule data is stored only in the current browser using `localStorage`.

- Changes are saved locally when the schedule is saved or a CSV file is imported.
- No remote storage controls or shared-file requests are used.
- Clearing browser site data removes the locally saved schedule.
- Use CSV export as a portable backup or to move a schedule to another browser or device.
- Time values are normalized to 24-hour `HH:MM` format, so `5:00` loads as `05:00`.


## Project Files

- `index.html` contains the application structure.
- `styles.css` contains layout, heatmap, time-zone, and theme styling.
- `script.js` contains the active scheduling, conversion, heatmap, local-storage, and CSV logic.
- `LightBackground.png` and `DarkBackground.png` provide the visual backgrounds.
- `preview.png` is the project preview image.
- `LICENSE` contains the project license.

The application currently loads `script.js`. The other JavaScript files in the project folder are retained copies and are not loaded by `index.html`.

## Browser Compatibility

Use a current version of Chrome, Edge, Firefox, or Safari. Custom time zones depend on the browser's support for the requested IANA time-zone identifier.

## License

See the `LICENSE` file included with the project.

## Staff table display options

- The Staff table rows control provides two views:
  - Show all entries displays all 30 available staff rows.
  - Hide empty entries displays only rows containing schedule information.
- Hiding empty entries does not delete data or reduce the number of available rows. The selected view is saved in the browser.

## Primary Page Time Zone and Business Hours

The scheduler can display the entire working page in a selected primary time zone. This changes the staff-entry table, heatmap staffing calculations, heatmap day labels, and daily schedules while retaining US Eastern as the saved and exported format.

When the selected primary zone is not US Eastern, the heatmap automatically places a US Eastern reference row immediately above the active primary row.

The collapsible Time Zone and Business Hours Configuration panel provides controls for:

- Primary page time zone
- Business-hours reference time zone
- Business-hours start and end times
- Half-hour display
- Optional heatmap time-zone rows
- Additional custom IANA time zones

Business hours default to 08:00 through 17:00 US Eastern. Corresponding columns are highlighted in both the heatmap and daily schedules, even when the page is being viewed in another time zone.


## Active Staff Rows

Each staff row includes an **Active** checkbox. Inactive rows remain saved and visible, even when **Hide empty entries** is selected, but they are excluded from heatmaps and daily schedules.


Active/inactive checkbox changes are saved and reflected in the heatmap and daily schedules immediately.

## Staff Table Presets

Four preset buttons appear immediately before **Load Test Data**.

- Click a preset button once to load it into the staff table and refresh the heatmap and daily schedules.
- Hold a preset button for three seconds to save the current staff table into that preset.
- Each preset records all 30 staff rows, including active status, name, start time, hours, lunch selection, and weekdays.
- Preset times are stored in US Eastern Time, regardless of the current page viewing time zone.
- A dot on a preset button indicates that the preset contains saved data.
- Presets are stored in the current browser through `localStorage`.

## Interface Organization

The application header includes the credit line "by Camdizzle Software." The instructions are provided once in a collapsible help panel positioned immediately above the heatmap. The help panel opens from its title and includes a Collapse Instructions button.

The Heatmap and Staff Table are collapsible sections that are expanded by default. Each section uses a single heading to avoid duplicate titles. The previous Jump to Daily Schedules shortcut has been removed.


## Primary Time Zone Summary

The primary page time-zone selector and the Eastern-time storage notice remain visible at all times. Additional time-zone rows and business-hours controls can be collapsed independently.
