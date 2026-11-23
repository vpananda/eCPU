# E3 Agro Solutions — Monthly Operational Cost Breakup

**Document Version:** 1.0  
**Effective Date:** November 2026  
**Application:** E3 Post-Harvest Cardamom Drying & Factory Operations  
**Currency:** Indian Rupee (₹ INR) & US Dollar (\$ USD) *(Exchange rate benchmark: ~₹87 / \$1 USD)*

---

## 1. Executive Summary

The **E3 Agro** production infrastructure is designed with a modern, serverless-hybrid architecture that keeps fixed overhead low while providing enterprise-grade reliability and low latency.

* **Base Monthly Operational Cost:** **~₹610 / month** (\$7.00 USD)
* **Average Monthly Cost (Normal Season):** **~₹690 – ₹750 / month**
* **Peak Harvest Season Monthly Cost:** **~₹960 – ₹1,200 / month**

---

## 2. Infrastructure & Hosting Breakup

| Component | Provider & Tier | Specifications | Monthly Cost (USD) | Monthly Cost (INR) | Billing Model |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Backend Web Service** | **Render** *(Paid Starter)* | 0.5 CPU · 512 MB RAM · Singapore Region | \$7.00 / mo | ~₹610 / mo | Fixed Monthly Recurring |
| **Relational Database** | **Supabase** *(PostgreSQL Free Tier)* | 500 MB DB storage · 5 GB bandwidth · Mumbai Region | \$0.00 / mo | ₹0.00 | Free Tier (Upgrade to Pro is \$25/mo if DB exceeds 500 MB) |
| **Database Connection Pooler** | **Supabase PgBouncer** | Low-latency transaction/session pooling | Included | ₹0.00 | Free |
| **Google Sheets Sync** | **Google Cloud Platform** | Automated cloud backup & live spreadsheet sync | \$0.00 | ₹0.00 | Free Tier (under 300 requests/min) |
| **Static Assets & CDN** | **Render & Cloudflare Edge** | Worldwide edge caching, SSL/TLS certificates | Included | ₹0.00 | Free |

> **Note:** The Render Singapore service runs **24/7/365** without sleep or cold starts. If processing volume significantly increases during peak harvest, you can scale to the **1 CPU / 2 GB RAM** tier with one click (\$25/mo ~₹2,150).

---

## 3. WhatsApp Messaging Cost Breakup

The E3 system provides **two distinct mechanisms** for customer receipts, arrival alerts, khata ledgers, and weekly statements:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WHATSAPP MESSAGING MODES                        │
├───────────────────────────────────┬────────────────────────────────────┤
│  Mode A: Direct In-App Sharing    │  Mode B: Meta WhatsApp Cloud API   │
│  (Operator clicks "Send via WA")  │  (Server automated background bot) │
├───────────────────────────────────┼────────────────────────────────────┤
│  • Cost: ₹0.00 (100% FREE)        │  • Cost: ~₹0.115 per message       │
│  • Opens WhatsApp / WA Business   │  • Directly delivers in background │
│  • Unlimited messages & receipts  │  • First 1,000 service msgs free   │
└───────────────────────────────────┴────────────────────────────────────┘
```

### Detailed Pricing Breakdown:
* **Mode A (Operator Direct App / `wa.me`):**  
  * **Cost:** **₹0 / message**
  * **Monthly Fee:** **₹0 / month** (Unlimited)
  * **How it works:** When factory staff or operators tap "Send on WhatsApp" from the mobile app, it launches WhatsApp on their phone with the pre-formatted tabular statement ready to dispatch. Meta charges zero platform fees for this.
* **Mode B (Official Meta Cloud API):**  
  * **Cost per Utility Message (India `+91`):** **~₹0.115** (approx. 11.5 paise)
  * **Cost per Marketing Message (if applicable):** **~₹0.86**
  * **Monthly Volume Estimate:** 1,000 automated utility receipts ≈ **₹115 / month**.

> **Tip:** By having operators use the in-app **"Send on WhatsApp"** button, your **WhatsApp cost remains ₹0.00**, saving substantial messaging budget.

---

## 4. SMS Gateway Cost Breakup (Fast2SMS)

SMS is configured via **Fast2SMS** for fallback notifications and verification codes:

* **Billing Type:** Prepaid Wallet (Pay-As-You-Go).
* **Expiration:** Wallet balance **never expires**.
* **Minimum Recharge:** ₹100.

| SMS Route | Rate per SMS | 500 SMS / Month | 1,500 SMS / Month | 3,000 SMS / Month |
| :--- | :--- | :--- | :--- | :--- |
| **Transactional SMS / OTP (DLT)** | **₹0.15 – ₹0.20** *(15 to 20 paise)* | ~₹85 | ~₹255 | ~₹510 |
| **Quick Service SMS** | **₹0.20 – ₹0.25** *(20 to 25 paise)* | ~₹110 | ~₹330 | ~₹660 |

---

## 5. Total Monthly Operational Budgets by Season

### Scenario A: Off-Season / Standard Maintenance
* **Daily Arrivals:** 5 – 15 lots
* **Monthly Active Batches:** 200 – 400 lots
* **Monthly WhatsApp Statements:** ~300 – 500 (via direct app)
* **Monthly SMS Sent:** ~200 – 300

| Expense Item | Monthly Cost (INR) |
| :--- | :--- |
| Render Web Service ($7) | ₹610 |
| Supabase Database | ₹0 |
| WhatsApp (Direct App) | ₹0 |
| Fast2SMS | ~₹45 |
| **Total Estimated Monthly Expense** | **~₹655 / month** |

---

### Scenario B: Regular Operating Season
* **Daily Arrivals:** 20 – 50 lots
* **Monthly Active Batches:** 800 – 1,500 lots
* **Monthly WhatsApp Statements:** ~1,000 – 1,500
* **Monthly SMS Sent:** ~500 – 800

| Expense Item | Monthly Cost (INR) |
| :--- | :--- |
| Render Web Service ($7) | ₹610 |
| Supabase Database | ₹0 |
| WhatsApp (Hybrid: Direct + Cloud API) | ~₹60 |
| Fast2SMS | ~₹120 |
| **Total Estimated Monthly Expense** | **~₹790 / month** |

---

### Scenario C: Peak Cardamom Harvest Season
* **Daily Arrivals:** 80 – 150+ lots
* **Monthly Active Batches:** 2,500 – 4,000+ lots
* **Monthly WhatsApp Statements:** 3,000+
* **Monthly SMS Sent:** 1,500 – 2,000

| Expense Item | Monthly Cost (INR) |
| :--- | :--- |
| Render Web Service ($7 or optional $25 compute boost) | ₹610 (or ₹2,150) |
| Supabase Database | ₹0 |
| WhatsApp (Hybrid: Direct + Cloud API) | ~₹180 |
| Fast2SMS | ~₹320 |
| **Total Estimated Monthly Expense** | **~₹1,110 / month** *(or ~₹2,650 with compute boost)* |

---

## 6. Recommendations to Keep Operating Costs Minimal

1. **Leverage Direct WhatsApp Sharing:**  
   Operators and supervisors should continue using the green **"Send on WhatsApp"** button inside the Customer Weekly Statement and Arrival forms. It is 100% free and has zero delivery limits from Meta.
2. **PostgreSQL Index Maintenance:**  
   Execute the indexes provided in `optimize_indexes.sql` to keep database CPU and RAM usage minimal, ensuring you never outgrow the Free Supabase tier.
3. **SMS Exclusively for Critical Alerts:**  
   Configure SMS for essential receipts or offline alerts, while using WhatsApp for rich receipts and tabular reports.

---
*Report prepared for E3 Agro Solutions Management.*
