# 🩸 BloodConnect v2 — Smart Blood Donation Management System

## 🚀 What's New in v2

| Feature | Before | After |
|---------|--------|-------|
| **User Roles** | Single role only | Donor, Receiver, or **Both** in one account |
| **PDF Receipts** | Basic PDFKit | Professional receipts with unique Transaction IDs |
| **Google Maps** | Static placeholder | Dynamic map with donor/request markers |
| **Chatbot** | 5 responses | 12 topic knowledge base with markdown rendering |
| **Dashboard** | Role-locked | Dynamic sections, role switcher for dual-role users |
| **API Routes** | Basic | `/generate-receipt`, `/nearby-donors`, `/my-requests` added |
| **Database** | `role` string | `roles[]` array + `transaction_id` fields |

---

## 📁 Project Structure

```
blood-donation-system/
├── backend/
│   ├── config/
│   │   └── db.js                  # MongoDB connection
│   ├── middleware/
│   │   └── authMiddleware.js      # JWT protect + adminOnly
│   ├── models/
│   │   ├── User.js                # ← roles[] array (dual-role)
│   │   ├── Donation.js            # ← transaction_id added
│   │   ├── Request.js             # ← transaction_id added
│   │   └── Receipt.js             # NEW — receipt store
│   ├── routes/
│   │   ├── authRoutes.js          # signup/login/verify-otp/update-profile
│   │   ├── donorRoutes.js         # accept/reject/complete/history
│   │   ├── donationRoutes.js      # receipt PDF, generate-receipt, nearby-donors
│   │   ├── requestRoutes.js       # create/list/my-requests/donor-requests
│   │   ├── chatbotRoutes.js       # 12-topic knowledge base
│   │   └── adminRoutes.js         # users/analytics/export
│   ├── utils/
│   │   ├── emailService.js        # Nodemailer OTP + donor notification
│   │   ├── eligibility.js         # Age/weight/cooldown checks
│   │   └── matching.js            # Haversine + score-based matching
│   ├── server.js
│   ├── package.json
│   └── .env                       # ← Add your keys here
└── frontend/
    ├── css/
    │   └── style.css              # Complete modern health-tech design system
    ├── js/
    │   ├── api.js                 # Centralised API layer + role helpers
    │   ├── auth.js                # Login/signup with dual-role radio selector
    │   ├── dashboard.js           # Dual-role dashboard controller
    │   ├── map.js                 # Google Maps integration
    │   └── chatbot.js             # Floating chatbot widget
    ├── index.html
    ├── login.html
    ├── signup.html                # ← Role selector: Donor / Receiver / Both
    ├── dashboard.html             # ← Role switcher tab for dual-role users
    └── admin.html
```

---

## ⚙️ Setup & Run

### 1. Prerequisites
- Node.js v16+
- MongoDB running locally (`mongod`) or a free MongoDB Atlas account

### 2. Install dependencies
```bash
cd backend
npm install
```

### 3. Configure environment
Edit `backend/.env`:
```env
MONGO_URI=mongodb://localhost:27017/bloodconnect
JWT_SECRET=your_strong_random_secret_here
PORT=5000
NODE_ENV=development

# Gmail SMTP (for OTP emails)
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_16_char_app_password
```

**Gmail App Password setup:**
1. Enable 2-Factor Auth on Gmail
2. Gmail → Settings → Security → App Passwords
3. Generate password → paste into `EMAIL_PASS`

### 4. Add Google Maps API Key
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Maps JavaScript API** + **Geolocation API**
3. Credentials → Create API Key
4. Open `frontend/dashboard.html` and replace:
   ```html
   <script src="https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY&libraries=places" defer></script>
   ```
   > **Note:** Maps work without a key in development but will show a watermark. The rest of the app functions fully without Maps.

### 5. Start the server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

### 6. Open in browser
```
http://localhost:5000
```
The backend serves the frontend automatically — no separate frontend server needed.

---

## 🔑 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | No | Register (accepts `roles: ['donor','receiver']`) |
| POST | `/api/auth/login` | No | Login |
| POST | `/api/auth/verify-otp` | No | Verify email |
| GET  | `/api/auth/me` | Yes | Get current user |
| PUT  | `/api/auth/update-profile` | Yes | Update profile + roles |
| POST | `/api/requests` | Yes | Create blood request |
| GET  | `/api/requests/my-requests` | Yes | Requester's own requests |
| GET  | `/api/requests/donor-requests` | Yes | Requests matched to donor |
| POST | `/api/donors/accept/:id` | Yes | Accept request → creates donation |
| POST | `/api/donors/complete/:id` | Yes | Mark donation complete |
| GET  | `/api/donors/history` | Yes | Donor's donation history |
| GET  | `/api/donation/receipt/:txnId` | Yes | **Download PDF receipt** |
| POST | `/api/donation/generate-receipt` | Yes | Generate receipt for existing donation |
| GET  | `/api/donation/nearby-donors` | Yes | Donors near lat/lng |
| POST | `/api/chatbot` | No | Chat message |

---

## 🔄 Dual Role System

Users can register as **Donor**, **Receiver**, or **Both**:

```js
// Registration payload
{
  "name": "Ali Ahmed",
  "email": "ali@example.com",
  "password": "secret123",
  "roles": ["donor", "receiver"],   // ← array
  "blood_group": "O+",
  "city": "Karachi"
}
```

- Dashboard shows **role switcher tab** for dual-role users
- Profile page has role checkboxes to upgrade/change roles anytime
- Backend `User.roles[]` array — fully backward compatible with old `role` string field

---

## 🧾 PDF Receipt

Auto-generated when:
- A donor completes a donation (`POST /api/donors/complete/:id`)
- Manually via `POST /api/donation/generate-receipt`

Receipt includes:
- Unique Transaction ID (`BDC-YYYYMMDD-XXXXXXXX`)
- Donor & Receiver info
- Blood group, units, location, hospital
- Date & time
- Coloured status stamp
- BloodConnect branding

Download URL: `GET /api/donation/receipt/:transaction_id`

---

## 🗄️ Database Schema Changes (v1 → v2)

### User
```js
roles: [String]        // NEW — ['donor'], ['receiver'], ['donor','receiver']
role: String           // KEPT for backward compatibility (auto-synced)
```

### Donation
```js
transaction_id: String // NEW — unique BDC-YYYYMMDD-XXXX ID
location: { lat, lng } // NEW
```

### Request
```js
transaction_id: String // NEW
```

### Receipt (NEW collection)
```js
{ transaction_id, type, donor_id, receiver_id, donation_id, blood_group, units, location, status }
```
