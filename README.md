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
