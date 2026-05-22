const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || '';
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.EMAIL_USER || `no-reply@${process.env.EMAIL_HOST || 'localhost'}`;
const EMAIL_CONFIGURED = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS && BUSINESS_EMAIL);
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
  res.json({});
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
    status: 'new',
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

// Removed Stripe checkout endpoint; payments are handled offline (cash)

// Stripe webhooks removed (no online payments)

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
