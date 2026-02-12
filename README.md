# Flights Member Tracker

A web-based personnel management application for tracking Air Force members across flights and teams. Built with vanilla JavaScript and Firebase Realtime Database.

## Features

### Member Management
- Add, edit, and delete members with details including rank, duty title, hometown, and medical profile
- Assign members to teams (Inbound, Flight Leads, BRASS, SBIRS)
- Drag-and-drop to reorder members within and between teams
- Detailed member view modal with all tracked data

### Flight Organization
- Create and manage multiple flights (organizational units) via tabbed navigation
- Assign members to flights with a dedicated Unbilleted view for unassigned personnel
- Drag-and-drop members from the Unbilleted pool into flight drop zones
- Right-click a flight tab to delete it

### Promotion Tracking
- **Auto-promotion** for E-1 through E-3 based on Time-in-Service (TIS) and Time-in-Grade (TIG) requirements
- **Selection-based promotion** for E-4 and above — requires manually marking a member as "Selected" or "Not Selected" with a scheduled promotion date
- **BTZ (Below the Zone)** early promotion board tracking for E-3s with quarterly board scheduling
- **"Promo Soon!" banner** on member cards when a promotion is within 2 weeks
- Automatic Date of Rank (DOR) updates when promotions process

### Supervision
- Assign supervisors to members from a dropdown of eligible personnel (E-5+, officers)
- Supervision view renders a tree chart showing supervisor-subordinate relationships
- Drag-and-drop reassignment within the supervision chart
- Filterable by active flight

### Custom Fields
- Define custom data fields (text, date, or number) via the Manage Fields modal
- Custom fields appear dynamically in the member form and detail views
- Stored in Firebase under `/_config/customFields`

### UI/UX
- Dark theme (charcoal background, jade accent)
- Custom styled modal dialogs (no browser `alert`/`confirm`/`prompt`)
- Color-coded status tags and promotion eligibility indicators
- Responsive card-based layout

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript (no frameworks)
- **Backend/Database:** Firebase Realtime Database (compat SDK v9.15.0)
- **Hosting:** Static files — can be served from any web server or Firebase Hosting

## Project Structure

```
FlightTracker/
├── index.html          # Main HTML structure, modals, and form markup
├── script.js           # Core application logic (~1000+ lines)
├── style.css           # All styles (dark theme, cards, modals, tabs)
├── firebase-config.js  # Firebase project configuration and initialization
└── README.md
```

## Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd FlightTracker
   ```

2. **Configure Firebase:**
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable the Realtime Database
   - Copy your Firebase config into `firebase-config.js`

3. **Serve the app:**
   Open `index.html` directly in a browser, or use any static file server:
   ```bash
   npx serve .
   ```

## Firebase Data Structure

```
/
├── _config/
│   ├── customFields/    # Custom field definitions
│   └── flights/         # Flight (unit) definitions
├── brass-container/     # Members assigned to BRASS team
├── sbirs-container/     # Members assigned to SBIRS team
├── flight-leads-container/  # Flight lead members
└── inbound-container/   # Inbound members
```

Each member record contains fields like `firstName`, `lastName`, `rank`, `dutyTitle`, `flight`, `status`, `tisDate`, `dorDate`, `supervisor`, `supStartDate`, `promotionStatus`, `promotionDate`, and any custom fields.

## Rank Promotion Rules

| Current Rank | Promotion To | Method | Requirements |
|---|---|---|---|
| E-1 → E-2 | Airman | Auto | 6 months TIS |
| E-2 → E-3 | A1C | Auto | 10 months TIG |
| E-3 → E-4 | SrA | Auto | 28 months TIG (or BTZ) |
| E-4 → E-5 | SSgt | Selection | 3 years TIS + 6 months TIG |
| E-5 → E-6 | TSgt | Selection | 5 years TIS + 23 months TIG |
| E-6 → E-7 | MSgt | Selection | 8 years TIS + 24 months TIG |
| E-7 → E-8 | SMSgt | Selection | 11 years TIS + 20 months TIG |
| E-8 → E-9 | CMSgt | Selection | 14 years TIS + 21 months TIG |
