# AandN-Services

A simple landing page for A&N Services with a Node.js backend, Stripe online payments, and SMTP email notifications.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your Stripe keys and SMTP credentials.

4. Start the server:
   ```bash
   npm start
   ```

5. Open the site in your browser:
   ```
   http://localhost:3000
   ```

## Backend endpoints

- `POST /api/contact` - sends contact form emails and stores messages.
- `POST /api/bookings` - creates offline booking requests and sends notification emails.
- `POST /api/create-checkout-session` - starts a Stripe Checkout payment session.
- `POST /webhook` - receives Stripe payment events and confirms paid bookings.

## Notes

- Payments require `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET`.
- Emails require `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, and `BUSINESS_EMAIL`.
- Booking and contact data are stored in the `data/` directory.
