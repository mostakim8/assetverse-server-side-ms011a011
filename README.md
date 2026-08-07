# AssetVerse - Server-Side 

This repository contains the backend RESTful API service for **AssetVerse**, a B2B Corporate Asset Management System. It manages user authentication, role-based data isolation, subscription payments via Stripe, and inventory query aggregation.

---

## 🛠️ Tech Stack & Key Packages

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB (Native Driver & Aggregation Pipelines)
* **Authentication:** Firebase Admin & JSON Web Tokens (JWT)
* **Payment Gateway:** Stripe API
* **Utilities:** CORS, Dotenv

---

## ✨ Server Features & Architecture

* **Role-Based Access Control (RBAC):** Custom Express middlewares (`verifyToken`, `verifyHR`) to secure sensitive endpoints.
* **Stripe Integration:** Server-side logic for processing subscription payments for corporate plans.
* **Data Aggregation:** Optimized MongoDB pipelines for inventory status reports and tracking logs.
* **Environment Security:** Sensitive credentials (DB keys, JWT secrets, Stripe keys) isolated via environment variables.

---
## ⚙️ Environment Variables Setup

To run this backend project locally, create a `.env` file in the root directory and configure the following variables:

```env
PORT=5000
DB_USER=your_mongodb_user
DB_PASS=your_mongodb_password
ACCESS_TOKEN_SECRET=your_jwt_secret_key
STRIPE_SECRET_KEY=your_stripe_secret_key


🚀 Local Installation & Setup Guide

Clone the repository:

Bash
git clone [https://github.com/mostakim8/assetverse-server-side-ms011a011.git](https://github.com/mostakim8/assetverse-server-side-ms011a011.git)
cd assetverse-server-side-ms011a011
Install dependencies:

Bash
npm install
Start the development server:

Bash
npm start
# or for development mode (if nodemon is configured)
npm run dev
