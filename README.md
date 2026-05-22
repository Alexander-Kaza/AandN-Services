# AandN-Services

A simple static landing page for A&N Services with frontend booking and contact forms.

## Setup

1. Open `an-services_1.html` directly in your browser.

2. If you want to run it from a local server, you can use any static server. For example:
   ```bash
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000/an-services_1.html`

## Notes

- Bookings and messages are saved to browser `localStorage` only.
- No backend server, no emails, and no Stripe integration are required.
- Reloading or clearing browser data will remove saved bookings/messages.

- If you only want the static frontend, you can ignore `server.js`, `package.json`, and backend files.
