# teyeme

A personal life tracking dashboard built with React + Vite + Recharts.
Upload your Google Form CSV exports to visualize sleep, wellness, habits, and fitness across the year.

Downloadable Google Form template coming soon.

---

## File Structure

```
life-dashboard/
├── index.html          # HTML entry point
├── package.json        # Dependencies
├── vite.config.js      # Vite build config
└── src/
    ├── main.jsx        # React root mount
    └── App.jsx         # Full dashboard app
```

---

## Local Development

**Prerequisites:** Node.js 18+ (https://nodejs.org)

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
```

Open http://localhost:5173 in your browser.

---

## How Data Works

- All data is stored in **localStorage** in your browser
- Nothing is sent to any server — it's 100% client-side
- Each new CSV upload is **merged** with existing data (deduplicated by date)
- Data persists across sessions on the same browser/device
- Clearing browser data or switching devices will lose your data — re-upload your CSV to restore it

---

## Security Notes

- The deployed URL is safe to share — visitors see an empty dashboard (your data lives in YOUR browser only)
- localStorage is readable via browser DevTools — don't use this on a shared/public computer
- No authentication is implemented — this is designed as a personal, single-user tool

---

## Adding New Months

Every month, export your Google Form responses as CSV (Responses sheet → Download as CSV)
and upload it to the dashboard. It will automatically merge with your existing data.

---

## Future Features

- Give insights and recommendations based on past trends
- Predict behavior with AI

---


Built March 3rd, 2026
