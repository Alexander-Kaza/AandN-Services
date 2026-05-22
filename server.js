const express = require('express');
const path = require('path');
const fs = require('fs');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || '';
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.EMAIL_USER || `no-reply@${process.env.EMAIL_HOST || 'localhost'}`;
const EMAIL_CONFIGURED = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS && BUSINESS_EMAIL);

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;
const app = express();
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('Failed to parse', filename, error);
    return [];
  }
}

function saveJson(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

const SERVICE_PRICES = {
  'House & Siding Washing': 200,
  'Driveway & Concrete Cleaning': 110,
  'Deck & Fence Washing': 140,
  'General Handyman': 140,
  'Window & Gutter Cleaning': 120,
  'Minor Repairs & Installs': 140,
  'Multiple Services / Custom Quote': 275
};

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: process.env.EMAIL_USER ? {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  } : undefined
});

async function sendEmail({ to, subject, text, html, replyTo }) {
  if (!EMAIL_CONFIGURED) {
    console.warn('Email is not configured. Skipping send:', subject);
    return;
  }
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    text,
    html,
    replyTo
  });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/config', (req, res) => {
  res.json({
    stripePublishableKey: STRIPE_PUBLISHABLE_KEY
  });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, msg } = req.body;
  if (!name || !msg) {
    return res.status(400).json({ error: 'Name and message are required.' });
  }

  const messages = loadJson('messages.json');
  const entry = { name, email, msg, ts: new Date().toISOString() };
  messages.unshift(entry);
  saveJson('messages.json', messages);

  try {
    await sendEmail({
      to: BUSINESS_EMAIL,
      subject: `New contact message from ${name}`,
      text: `Name: ${name}\nEmail: ${email || 'N/A'}\n\n${msg}`,
      html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email || 'N/A'}</p><p><strong>Message:</strong><br>${msg}</p>`,
      replyTo: email || undefined
    });
  } catch (error) {
    console.error('Contact email failed:', error);
  }

  res.json({ ok: true });
});

app.post('/api/bookings', async (req, res) => {
  const { fname, lname, phone, email, service, date, time, notes, payment } = req.body;
  if (!fname || !phone || !service) {
    return res.status(400).json({ error: 'Name, phone, and service are required.' });
  }

  const ref = 'AN-' + Math.floor(1000 + Math.random() * 9000);
  const booking = {
    ref,
    fname,
    lname,
    phone,
    email,
    service,
    date,
    time,
    notes,
    payment,
    status: payment === 'Credit Card' ? 'pending' : 'new',
    createdAt: new Date().toISOString()
  };

  const bookings = loadJson('bookings.json');
  bookings.unshift(booking);
  saveJson('bookings.json', bookings);

  try {
    await sendEmail({
      to: BUSINESS_EMAIL,
      subject: `New booking request ${ref}`,
      text: `Ref: ${ref}\nName: ${fname} ${lname}\nPhone: ${phone}\nEmail: ${email || 'N/A'}\nService: ${service}\nDate: ${date || 'TBD'}\nTime: ${time || 'TBD'}\nPayment: ${payment}\nNotes: ${notes || 'None'}`,
      html: `<p><strong>Ref:</strong> ${ref}</p><p><strong>Name:</strong> ${fname} ${lname}</p><p><strong>Phone:</strong> ${phone}</p><p><strong>Email:</strong> ${email || 'N/A'}</p><p><strong>Service:</strong> ${service}</p><p><strong>Date:</strong> ${date || 'TBD'}</p><p><strong>Time:</strong> ${time || 'TBD'}</p><p><strong>Payment:</strong> ${payment}</p><p><strong>Notes:</strong> ${notes || 'None'}</p>`
    });
  } catch (error) {
    console.error('Booking notification email failed:', error);
  }

  res.json({ ok: true, ref });
});

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured.' });
  }

  const { fname, lname, phone, email, service, date, time, notes } = req.body;
  if (!fname || !phone || !service || !email) {
    return res.status(400).json({ error: 'Name, phone, email, and service are required for payment.' });
  }

  const price = SERVICE_PRICES[service] || 160;
  const ref = 'AN-' + Math.floor(1000 + Math.random() * 9000);
  const lineItem = {
    price_data: {
      currency: 'usd',
      product_data: {
        name: service,
        description: `Booking for ${service}`
      },
      unit_amount: Math.round(price * 100)
    },
    quantity: 1
  };

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [lineItem],
      mode: 'payment',
      customer_email: email,
      success_url: `${BASE_URL}/?checkout=success&ref=${ref}`,
      cancel_url: `${BASE_URL}/?checkout=cancel`,
      metadata: { ref, fname, lname, phone, service, date: date || '', time: time || '', notes: notes || '' }
    });

    const bookings = loadJson('bookings.json');
    bookings.unshift({
      ref,
      fname,
      lname,
      phone,
      email,
      service,
      date,
      time,
      notes,
      payment: 'Credit Card',
      status: 'pending',
      stripeSessionId: session.id,
      createdAt: new Date().toISOString()
    });
    saveJson('bookings.json', bookings);

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe session creation failed:', error);
    res.status(500).json({ error: 'Unable to start payment session.' });
  }
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event = req.body;

  if (STRIPE_WEBHOOK_SECRET) {
    const signature = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const ref = session.metadata?.ref;
    const bookings = loadJson('bookings.json');
    const idx = bookings.findIndex((entry) => entry.ref === ref);
    if (idx !== -1) {
      bookings[idx].status = 'paid';
      bookings[idx].paidAt = new Date().toISOString();
      saveJson('bookings.json', bookings);
    }

    try {
      await sendEmail({
        to: BUSINESS_EMAIL,
        subject: `Payment completed ${ref}`,
        text: `Payment completed for booking ${ref}. Customer email: ${session.customer_email}`,
        html: `<p>Payment completed for booking <strong>${ref}</strong>.</p><p>Customer email: ${session.customer_email}</p>`
      });
      if (session.customer_email) {
        await sendEmail({
          to: session.customer_email,
          subject: `Booking confirmed ${ref}`,
          text: `Thank you for your payment. Your booking reference is ${ref}. We will contact you soon with details.`,
          html: `<p>Thank you for your payment. Your booking reference is <strong>${ref}</strong>.</p><p>We will contact you soon with details.</p>`
        });
      }
    } catch (error) {
      console.error('Confirmation email failed:', error);
    }
  }

  res.json({ received: true });
});

app.get('/api/bookings', (req, res) => {
  res.json(loadJson('bookings.json'));
});

app.get('/api/messages', (req, res) => {
  res.json(loadJson('messages.json'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'an-services_1.html'));
});

app.listen(PORT, () => {
  console.log(`Server started on ${BASE_URL}`);
});
