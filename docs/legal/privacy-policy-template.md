# Privacy Policy - SupaSnake

**Status:** 🚨 TEMPLATE - REQUIRES LAWYER REVIEW
**Budget:** $10,000-$15,000 for custom legal drafting
**Compliance:** GDPR, CCPA, COPPA, ePrivacy Directive, LGPD, APPI
**Age Rating:** 13+
**Last Updated:** 2025-10-20
**Effective Date:** [INSERT DATE]

---

## ⚠️ DO NOT USE THIS TEMPLATE IN PRODUCTION

This template provides a foundation but MUST be reviewed and customized by a licensed attorney before use. Privacy laws vary significantly by jurisdiction, and this template cannot substitute for professional legal advice. Material marked with 🚨 requires explicit lawyer review and customization.

**Estimated Legal Budget:** $10,000-$15,000 for comprehensive review and customization by privacy counsel specializing in GDPR/CCPA/COPPA compliance for mobile gaming.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [What Data We Collect](#2-what-data-we-collect)
3. [How We Use Your Data](#3-how-we-use-your-data)
4. [How We Share Your Data](#4-how-we-share-your-data)
5. [International Data Transfers](#5-international-data-transfers)
6. [Data Retention](#6-data-retention)
7. [Your Privacy Rights](#7-your-privacy-rights)
8. [Children's Privacy](#8-childrens-privacy)
9. [Cookies & Tracking Technologies](#9-cookies--tracking-technologies)
10. [Security Measures](#10-security-measures)
11. [Changes to This Policy](#11-changes-to-this-policy)
12. [Contact Information](#12-contact-information)
13. [Regional Variations](#13-regional-variations)

---

## 1. Introduction

### 1.1 Who We Are

🚨 **[LAWYER REVIEW - INSERT COMPANY INFO]**

SupaSnake is operated by [COMPANY NAME], a [JURISDICTION] company registered at [COMPANY ADDRESS]. We are the data controller for the personal data we collect through the SupaSnake mobile game.

**Registered Address:** [INSERT]
**Company Number:** [INSERT]
**VAT Number (if EU):** [INSERT]

### 1.2 What This Policy Covers

This Privacy Policy explains how we collect, use, store, and share your personal information when you play SupaSnake, a free-to-play mobile game available on iOS and Android devices.

This policy applies to:
- The SupaSnake mobile app
- Our website at [INSERT WEBSITE]
- Customer support communications
- Marketing communications (if you opt in)
- In-app purchases through Apple App Store or Google Play Store

### 1.3 Acceptance

By creating an account or playing SupaSnake, you agree to this Privacy Policy. If you don't agree, please don't use our game.

**Important:** You can play SupaSnake without creating an account, but some features (like saving your progress across devices and collecting variants) require an account.

### 1.4 Age Restrictions

SupaSnake is rated for ages 13 and older. We do not knowingly collect personal information from children under 13. See Section 8 (Children's Privacy) for details.

---

## 2. What Data We Collect

We collect different types of data depending on how you use SupaSnake. Here's what we collect and why:

### 2.1 Account Data (If You Create an Account)

**What we collect:**
- **Email address** - to verify your account and send important notifications
- **Username** - your display name in the game
- **Password** - encrypted using bcrypt hashing (we never see your actual password)
- **Age verification** - your birth year, hashed using SHA-256 (we never store your raw date of birth)

**Legal basis (GDPR):** Contractual necessity (Article 6(1)(b)) - we need this data to provide you with an account and save your progress.

**Why we need it:** Without an account, you can't save your progress, sync across devices, or participate in collection/breeding features.

**How to provide it:** Account creation screen in the app.

**Optional?** Yes - you can play without an account, but you'll lose progress if you uninstall the app.

### 2.2 Gameplay Data

**What we collect:**
- **Game progress** - your high scores, current level, DNA balance
- **Collection data** - which snake variants you've collected (out of 30 total)
- **Breeding history** - which variants you've bred, when, and breeding costs
- **Session data** - how long you play each session, which game modes you prefer
- **Energy system data** - your current energy level, when it regenerates
- **Purchase history** - DNA purchased via in-app purchases (transaction IDs only)

**Legal basis (GDPR):** Contractual necessity (Article 6(1)(b)) - this data is essential for the game to function.

**Why we need it:** SupaSnake is a collection/breeding game. Without tracking which variants you own and your breeding history, the core gameplay wouldn't work.

**How we collect it:** Automatically as you play.

**Optional?** No - this is required for the game to work.

### 2.3 Device Data

**What we collect:**
- **Operating system** - iOS or Android version
- **Device model** - e.g., "iPhone 14 Pro" or "Samsung Galaxy S23"
- **App version** - e.g., "SupaSnake v1.2.3"
- **IP address** - used only for country-level geolocation (never precise location)
- **Advertising IDs** (with your consent):
  - **IDFA** (iOS) - Apple's Identifier for Advertisers
  - **AAID** (Android) - Google's Advertising ID

**Legal basis (GDPR):**
- Device info: Legitimate interest (Article 6(1)(f)) - we need this to make the game work on your device
- Advertising IDs: Consent (Article 6(1)(a)) - we only collect these if you opt in

🚨 **[LAWYER REVIEW]** Verify legitimate interest assessment for device data collection. May require Data Protection Impact Assessment (DPIA) under GDPR Article 35.

**Why we need it:**
- Device info helps us fix bugs and optimize performance for your device
- IP address helps us show you the right language and comply with regional laws
- Advertising IDs help us measure which marketing campaigns bring players to SupaSnake

**How we collect it:** Automatically when you launch the app.

**Optional?**
- Device info: No (required for app to function)
- Advertising IDs: Yes (you can decline when asked)

### 2.4 Analytics Data (With Your Consent in EU)

**What we collect:**
- **Events** - actions you take in the game, like:
  - "game_started" - when you start a new game
  - "variant_collected" - when you collect a new snake variant
  - "dna_earned" - how much DNA you earn per game
  - "breeding_completed" - when you successfully breed a new variant
  - "iap_purchased" - when you buy DNA (amount and transaction ID only, no payment details)
- **Session analytics** - how long you play, which features you use most
- **Device context** - screen size, OS version (to optimize UI)
- **Hashed user ID** - a scrambled version of your account ID (not personally identifiable)

**Legal basis (GDPR):**

🚨 **[LAWYER REVIEW - CRITICAL DECISION REQUIRED]**

Choose one legal basis for analytics:

**Option A: Consent (Article 6(1)(a))**
- Stricter standard
- Users can decline analytics
- Must be freely given, specific, informed
- Recommended if targeting EU users

**Option B: Legitimate Interest (Article 6(1)(f))**
- Requires balancing test showing our interests outweigh user privacy
- Requires Data Protection Impact Assessment (DPIA)
- Users can still object (Article 21)
- Riskier legal position

**We recommend Option A (Consent) for SupaSnake.**

**Why we collect it:** Analytics help us understand how players use SupaSnake so we can improve the game, fix issues, and design better features.

**Third parties involved:**
- **Amplitude** (US) - Analytics platform
- **Statsig** (US) - A/B testing and feature flags

**How we collect it:** Automatically as you play, but only if you consent.

**Optional?** Yes (EU users) - you can decline analytics and still play the full game.

### 2.5 Attribution Data

**What we collect:**
- **Install source** - which ad campaign or referral brought you to SupaSnake
- **Device IDs** - IDFA (iOS) or AAID (Android), only with consent
- **Campaign parameters** - UTM codes, ad creative IDs
- **Install timestamp** - when you first installed the app

**Legal basis (GDPR):** Legitimate interest (Article 6(1)(f)) - we have a legitimate business interest in understanding which marketing efforts work.

🚨 **[LAWYER REVIEW]** Verify legitimate interest assessment for attribution tracking. CNIL (French regulator) has strict standards for mobile attribution.

**Why we collect it:** Attribution helps us understand which ads bring players to SupaSnake so we can spend our marketing budget wisely.

**Third parties involved:**
- **Adjust** (Germany) - Mobile attribution platform

**How we collect it:** Automatically on first launch, with consent for device IDs.

**Optional?** Partially - device IDs require consent, but install source tracking is based on legitimate interest.

### 2.6 Error & Performance Data

**What we collect:**
- **Crash logs** - technical data when the app crashes
- **Error stack traces** - debugging information about what went wrong
- **Device context** - OS version, available memory, battery level
- **User actions** - what you were doing when the error occurred

**Legal basis (GDPR):** Legitimate interest (Article 6(1)(f)) - we need this to fix bugs and keep the game working.

**Important:** We configure Sentry to NOT collect personally identifiable information (PII) like usernames or email addresses in error logs.

**Why we collect it:** When SupaSnake crashes, these logs help us figure out what went wrong so we can fix it.

**Third parties involved:**
- **Sentry** (US) - Error tracking platform

**How we collect it:** Automatically when errors occur.

**Optional?** No - this is essential for maintaining app stability.

### 2.7 Payment Data (Processed by Apple/Google)

**What we collect:**
- **Transaction IDs** - unique identifiers for each purchase
- **Purchase amounts** - how much DNA you bought
- **Purchase timestamps** - when you made the purchase
- **Receipt validation data** - to verify the purchase is legitimate

**What we DON'T collect:**
- ❌ Credit card numbers
- ❌ Billing addresses
- ❌ Payment method details

**Why:** All payments are processed by Apple (App Store) or Google (Play Store). They handle your payment information securely, and we never see your credit card details.

**Legal basis (GDPR):** Contractual necessity (Article 6(1)(b)) - we need to track your DNA purchases to credit your account.

**Third parties involved:**
- **Apple App Store** - iOS payments
- **Google Play Store** - Android payments
- **Supabase** - Stores transaction IDs only (not payment details)

**How we collect it:** Automatically when you make an in-app purchase.

**Optional?** No - if you buy DNA, we must track the transaction.

### 2.8 Consent Records

**What we collect:**
- **Consent timestamps** - when you accepted/declined each consent
- **Consent version** - which version of the consent text you saw
- **Consent choices** - analytics (yes/no), marketing (yes/no), advertising IDs (yes/no)
- **Withdrawal history** - if you changed your mind later

**Legal basis (GDPR):** Legal obligation (Article 6(1)(c)) - GDPR requires us to prove we obtained valid consent.

**Why we collect it:** EU privacy law requires us to keep records proving we got your permission before collecting analytics or advertising data.

**Third parties involved:**
- **OneTrust** (US) - Consent management platform

**How we collect it:** When you interact with consent banners in the app.

**Optional?** No - we must keep these records to comply with GDPR.

### 2.9 Data We Don't Collect

To be clear, we do NOT collect:
- ❌ Your precise location (GPS coordinates)
- ❌ Your contacts or address book
- ❌ Your photos or camera access
- ❌ Your microphone or voice data
- ❌ Data from other apps on your device
- ❌ Your raw date of birth (only hashed birth year)
- ❌ Your credit card or payment details
- ❌ Your social media accounts (unless you choose to share)
- ❌ Sensitive data (health, religion, political views, etc.)

---

## 3. How We Use Your Data

We only use your data for the purposes listed below. We won't use your data for anything else without asking you first.

### 3.1 To Provide the Game (Contractual Necessity)

**What we do:**
- Create and manage your account
- Save your game progress and collections
- Enable breeding mechanics and variant collection
- Track your DNA balance and purchases
- Sync your progress across devices
- Show you which variants you haven't collected yet

**Legal basis:** Contractual necessity (GDPR Article 6(1)(b)) - we need this data to provide the game you signed up for.

### 3.2 To Process Payments (Contractual Necessity)

**What we do:**
- Verify in-app purchases are legitimate
- Credit DNA to your account after purchase
- Provide purchase history in your account settings
- Handle refund requests

**Legal basis:** Contractual necessity (GDPR Article 6(1)(b))

**Note:** Apple and Google handle the actual payment processing. We only receive transaction IDs and purchase amounts.

### 3.3 To Improve the Game (Consent or Legitimate Interest)

**What we do:**
- Analyze which game modes players enjoy most
- Identify which dynasties are popular
- Understand breeding patterns and progression
- Test new features with A/B testing (Statsig)
- Measure session length and retention
- Identify confusing UI elements

**Legal basis:**

🚨 **[LAWYER REVIEW]** Choose one:
- **Consent (GDPR Article 6(1)(a))** - Recommended for EU
- **Legitimate interest (GDPR Article 6(1)(f))** - Requires balancing test

**Why we do it:** Analytics help us make SupaSnake more fun and fix issues that frustrate players.

**Your control:** EU users can decline analytics and still play the full game.

### 3.4 To Fix Bugs (Legitimate Interest)

**What we do:**
- Collect crash logs to identify bugs
- Analyze error patterns to prioritize fixes
- Test fixes on similar devices
- Monitor app stability metrics

**Legal basis:** Legitimate interest (GDPR Article 6(1)(f)) - we have a legitimate interest in keeping the app working, and this doesn't override your privacy rights.

**Why we do it:** Nobody likes a buggy game. Error tracking helps us fix crashes quickly.

### 3.5 To Prevent Fraud (Legitimate Interest)

**What we do:**
- Detect suspicious purchase patterns (e.g., stolen credit cards)
- Identify hacked accounts
- Prevent cheating and exploits
- Block abusive behavior

**Legal basis:** Legitimate interest (GDPR Article 6(1)(f)) - we need to protect SupaSnake and our players from fraud.

**Why we do it:** Fraud hurts everyone - it costs us money and ruins the game for honest players.

### 3.6 To Measure Marketing (Consent or Legitimate Interest)

**What we do:**
- Track which ad campaigns bring new players
- Measure cost per install
- Optimize ad targeting
- Calculate return on ad spend

**Legal basis:**

🚨 **[LAWYER REVIEW]** Verify legal basis for attribution tracking. Some EU regulators require consent for all advertising tracking.

- **Device IDs (IDFA/AAID):** Consent (GDPR Article 6(1)(a))
- **Install source:** Legitimate interest (GDPR Article 6(1)(f))

**Why we do it:** Attribution helps us spend our marketing budget on ads that actually work.

**Your control:** You can decline sharing your advertising ID (IDFA/AAID) and still download the game.

### 3.7 To Send Important Notifications (Contractual Necessity or Consent)

**What we do:**
- Send account verification emails
- Notify you about important account changes (e.g., password reset)
- Send purchase receipts
- Alert you to policy changes
- **[Optional, with consent]** Send gameplay tips and feature announcements

**Legal basis:**
- Transactional emails: Contractual necessity (GDPR Article 6(1)(b))
- Marketing emails: Consent (GDPR Article 6(1)(a))

**Your control:** You can unsubscribe from marketing emails anytime, but you'll still receive important account notifications.

### 3.8 To Comply with Laws (Legal Obligation)

**What we do:**
- Respond to valid legal requests (court orders, subpoenas)
- Comply with tax and financial regulations
- Report child safety concerns to authorities
- Preserve data for legal holds

**Legal basis:** Legal obligation (GDPR Article 6(1)(c)) or vital interests (GDPR Article 6(1)(d))

**Why we do it:** We're legally required to comply with valid legal requests.

### 3.9 Uses We DON'T Do

We do NOT:
- ❌ Sell your personal data to third parties
- ❌ Use your data for political advertising
- ❌ Share your data with data brokers
- ❌ Use your data for surveillance
- ❌ Train AI models on your personal data (gameplay is anonymized)

---

## 4. How We Share Your Data

We don't sell your personal data. We only share it with trusted service providers who help us run SupaSnake, and only under strict contracts.

### 4.1 Service Providers (Data Processors)

All service providers below have signed **Data Processing Agreements (DPAs)** with us as required by GDPR Article 28. These contracts require them to:
- Only use your data for the specific services we hired them for
- Protect your data with appropriate security measures
- Delete or return your data when the contract ends
- Allow us to audit their security practices

#### Supabase (United States)

**What they do:** Database hosting, file storage, authentication
**What data they process:** ALL user data (accounts, gameplay, collections, purchases)
**Location:** United States (🚨 see Section 5 for international transfer safeguards)
**DPA:** [INSERT LINK TO SUPABASE DPA]
**Privacy Policy:** https://supabase.com/privacy

**Why we share:** Supabase is our backend infrastructure provider. They host all game data.

#### Amplitude (United States)

**What they do:** Analytics and user behavior tracking
**What data they process:** Events (gameplay actions), device info, hashed user IDs
**Location:** United States
**DPA:** [INSERT LINK TO AMPLITUDE DPA]
**Privacy Policy:** https://amplitude.com/privacy

**Why we share:** Amplitude helps us understand how players use SupaSnake.

**Your control:** EU users can decline analytics.

#### Statsig (United States)

**What they do:** A/B testing and feature flags
**What data they process:** Experiment assignments, feature evaluations, hashed user IDs
**Location:** United States
**DPA:** [INSERT LINK TO STATSIG DPA]
**Privacy Policy:** https://www.statsig.com/privacy

**Why we share:** Statsig helps us test new features with small groups before full release.

**Your control:** EU users can decline analytics (which includes A/B testing).

#### Adjust (Germany)

**What they do:** Mobile attribution (tracking which ads bring players)
**What data they process:** Device IDs (IDFA/AAID), install source, campaign data
**Location:** Germany (EU)
**DPA:** [INSERT LINK TO ADJUST DPA]
**Privacy Policy:** https://www.adjust.com/terms/privacy-policy/

**Why we share:** Adjust helps us measure marketing campaign effectiveness.

**Your control:** You can decline sharing your advertising ID.

#### Sentry (United States)

**What they do:** Error tracking and crash reporting
**What data they process:** Error logs, stack traces, device context (NO PII)
**Location:** United States
**DPA:** [INSERT LINK TO SENTRY DPA]
**Privacy Policy:** https://sentry.io/privacy/

**Why we share:** Sentry helps us identify and fix bugs quickly.

**Your control:** This is essential for app stability (not optional).

#### OneTrust (United States)

**What they do:** Consent management platform
**What data they process:** Consent records, timestamps, user choices
**Location:** United States
**DPA:** [INSERT LINK TO ONETRUST DPA]
**Privacy Policy:** https://www.onetrust.com/privacy/

**Why we share:** OneTrust helps us manage GDPR/CCPA consent requirements.

**Your control:** This is required for legal compliance (not optional).

#### Apple App Store (United States)

**What they do:** iOS payment processing
**What data they process:** In-app purchases, payment details, transaction IDs
**Location:** United States
**Privacy Policy:** https://www.apple.com/legal/privacy/

**Why we share:** Apple handles all iOS payments. We only receive transaction IDs.

**Your control:** Required if you make purchases on iOS.

#### Google Play Store (United States)

**What they do:** Android payment processing
**What data they process:** In-app purchases, payment details, transaction IDs
**Location:** United States
**Privacy Policy:** https://policies.google.com/privacy

**Why we share:** Google handles all Android payments. We only receive transaction IDs.

**Your control:** Required if you make purchases on Android.

### 4.2 Legal Requirements

We may share your data if legally required to:

**Law enforcement:** Valid court orders, subpoenas, search warrants
**Regulatory compliance:** Tax authorities, financial regulators
**Safety emergencies:** Threats to life or safety (e.g., credible suicide threats)
**Child protection:** Suspected child abuse (required by law in many jurisdictions)

🚨 **[LAWYER REVIEW]** Verify legal requirements for responding to government requests in your jurisdiction. Some countries require user notification, others prohibit it.

**Your rights:** In most cases, we'll notify you before disclosing your data to authorities (unless legally prohibited or in emergencies).

**Legal basis:** Legal obligation (GDPR Article 6(1)(c)) or vital interests (GDPR Article 6(1)(d))

### 4.3 Business Transfers

If SupaSnake is acquired or merges with another company, your data may be transferred to the new owner.

**What happens:**
- We'll notify you via email and in-app notification
- The new owner must honor this Privacy Policy
- You can delete your account before the transfer completes

🚨 **[LAWYER REVIEW]** Some jurisdictions require explicit user consent for business transfers. Verify requirements in your jurisdiction.

**Legal basis:** Legitimate interest (GDPR Article 6(1)(f))

**Your rights:** You can object to the transfer by deleting your account.

### 4.4 Who We DON'T Share With

We do NOT share your data with:
- ❌ Advertisers (we don't show ads in SupaSnake)
- ❌ Data brokers or marketing lists
- ❌ Social media companies (unless you choose to connect)
- ❌ Other game companies
- ❌ Anyone else not listed in Section 4.1

---

## 5. International Data Transfers

SupaSnake is developed in [INSERT COUNTRY] but uses service providers around the world, primarily in the United States.

### 5.1 Primary Data Location

**Where your data lives:** United States (Supabase US region)

**Why:** Most mobile gaming infrastructure is US-based. Supabase offers the best combination of features, reliability, and cost.

### 5.2 Transfers from EU to US

🚨 **[LAWYER REVIEW - CRITICAL]** The EU-US Data Privacy Framework adequacy decision was invalidated by Schrems II (2020). Verify current status and appropriate transfer mechanisms.

**Current situation (as of 2025):**
- The United States does NOT have an adequacy decision from the EU
- Transfers require additional safeguards under GDPR Article 46

**Transfer mechanisms we use:**

#### Standard Contractual Clauses (SCCs)

We use the **European Commission's Standard Contractual Clauses (SCCs)** approved in June 2021.

**What these are:** Pre-approved contract terms between us and our US service providers that guarantee EU-level data protection.

**Our SCCs:**
- Module 2 (Controller to Processor) for most vendors
- Module 3 (Processor to Processor) for sub-processors
- Supplemental measures per Schrems II requirements

**View SCCs:** [INSERT LINK TO YOUR SCC REPOSITORY]

🚨 **[LAWYER REVIEW]** Conduct Transfer Impact Assessment (TIA) for each US vendor per EDPB Recommendations 01/2020. Document why SCCs are sufficient despite US surveillance laws (FISA 702, EO 12333).

#### Supplemental Security Measures

Beyond SCCs, we implement additional safeguards:

**Technical measures:**
- End-to-end encryption for sensitive data
- Pseudonymization (hashed user IDs in analytics)
- Data minimization (collect only what's needed)
- Access controls (Supabase RLS policies)

**Organizational measures:**
- DPAs requiring security audits
- Incident response protocols
- Transparency reports (if we receive government requests)
- Regular security reviews

**Contractual measures:**
- Notification of government data requests (unless legally prohibited)
- Right to audit vendor security
- Data return/deletion upon contract termination

### 5.3 EU Data Localization Option

🚨 **[LAWYER REVIEW]** Evaluate whether to offer EU data residency:

**Pros:**
- Stronger legal position for EU users
- May avoid complex TIA requirements
- Marketing advantage ("Your data stays in Europe")

**Cons:**
- Higher infrastructure costs (Supabase EU region ~30% more expensive)
- Increased complexity (two separate databases)
- Maintenance burden

**Decision:** [TO BE DETERMINED]

If you offer EU localization:
- EU users can choose "Store my data in Europe" during account creation
- Data stays on Supabase EU servers (Frankfurt or London)
- Analytics/attribution still use US vendors (with SCCs)

### 5.4 Other International Transfers

**To Germany (Adjust):** EU-to-EU transfer, no additional safeguards needed

**Your rights:** If you're in the EU, you can request details about where your data is stored and how it's protected.

---

## 6. Data Retention

We keep your data only as long as necessary for the purposes described in this policy.

### 6.1 Active Accounts

**Retention period:** While your account exists

**What we keep:**
- Account data (email, username, hashed password)
- Gameplay data (scores, DNA, collections, breeding history)
- Purchase history (transaction IDs, amounts, timestamps)
- Consent records (required by law)

**Why:** You need this data to play SupaSnake and access your purchased DNA.

**Your control:** Delete your account anytime (see Section 7.3).

### 6.2 Inactive Accounts

**Definition:** No login for 24 consecutive months

**What happens:**
1. **Month 24:** We email you: "Your account will be anonymized in 30 days unless you log in"
2. **Month 24 + 30 days:** If no response, we anonymize your account:
   - Delete email, username, hashed password
   - Replace user ID with anonymous ID
   - Keep gameplay data for analytics (anonymized)
   - Keep purchase history (legal requirement for tax)

**Why:** Inactive accounts with personal data create unnecessary privacy risk.

**Your control:** Log in once every 2 years to keep your account active.

🚨 **[LAWYER REVIEW]** Verify tax/financial retention requirements in your jurisdiction. Some countries require purchase records for 7-10 years.

### 6.3 Deleted Accounts

**Retention period:** 30-day recovery period, then permanent deletion

**What happens:**
1. **Day 0:** You request account deletion via Privacy Dashboard
2. **Day 0-30:** Account soft-deleted (hidden but recoverable if you change your mind)
3. **Day 30:** Permanent deletion:
   - Account data: Deleted
   - Gameplay data: Deleted
   - Analytics data: Anonymized (hashed user ID broken, data kept for trends)
   - Purchase history: Kept for tax compliance (anonymized)
   - Consent records: Kept for legal defense (anonymized)

**Why we wait 30 days:** Account deletion is permanent. The grace period protects against accidental deletions or hacked accounts.

**Your control:** Contact support@supasnake.com within 30 days to cancel deletion.

🚨 **[LAWYER REVIEW]** Some jurisdictions (e.g., California) require immediate deletion upon request. Verify if 30-day grace period is permitted.

### 6.4 Analytics Data

**Retention period:** 2 years from collection

**What we keep:**
- Amplitude: 2 years (platform default)
- Statsig: 2 years
- Adjust: Until you reset advertising ID

**Why:** Long-term analytics help us understand player behavior trends over time.

**Your control:** EU users can decline analytics entirely.

**Deletion:** After 2 years, data is automatically deleted by our analytics vendors.

### 6.5 Error Logs

**Retention period:** 90 days

**What we keep:**
- Sentry: Crash logs, error stack traces, device context

**Why:** Recent error logs help us fix bugs. Older logs are rarely useful.

**Deletion:** Automatic after 90 days.

### 6.6 Backups

**Retention period:** 90 days

**What happens:**
- Supabase creates daily backups of our database
- Backups include deleted accounts (until backup expires)
- After 90 days, backup is purged and data is permanently gone

**Why:** Backups protect against accidental data loss or system failures.

**Your rights:** If you delete your account, it may remain in backups for up to 90 days, but we can't restore it after Day 30.

### 6.7 Legal Holds

**Retention period:** Until legal matter resolved

**What happens:**
- If your account is subject to a legal investigation, we may be required to preserve your data
- We'll notify you unless legally prohibited
- Data held only as long as legally required

**Legal basis:** Legal obligation (GDPR Article 6(1)(c))

### 6.8 Retention Summary Table

| Data Type | Retention Period | Deletion Method |
|-----------|------------------|-----------------|
| Active accounts | While account exists | User-initiated deletion |
| Inactive accounts (no login 2+ years) | 24 months → anonymized | Automated anonymization |
| Deleted accounts | 30-day grace → permanent deletion | Automated purge |
| Analytics data | 2 years from collection | Vendor automated deletion |
| Error logs | 90 days | Automated purge |
| Backups | 90 days | Automated purge |
| Purchase history (tax) | 🚨 7-10 years (verify by jurisdiction) | Manual after legal period |
| Consent records (legal defense) | 🚨 Verify statute of limitations | Manual after legal period |
| Legal holds | Until matter resolved | Case-by-case |

🚨 **[LAWYER REVIEW]** Verify all retention periods comply with local laws (tax, financial, consumer protection, statute of limitations).

---

## 7. Your Privacy Rights

You have significant rights over your personal data. Here's how to exercise them.

### 7.1 Your Rights Summary

Depending on where you live, you may have these rights:

| Right | What It Means | How to Exercise |
|-------|---------------|-----------------|
| **Access** | Get a copy of your data | Privacy Dashboard → Export Data |
| **Rectification** | Correct inaccurate data | Settings → Account Info |
| **Erasure** ("Right to be Forgotten") | Delete your data | Privacy Dashboard → Delete Account |
| **Portability** | Download data in portable format | Privacy Dashboard → Export Data (JSON) |
| **Restriction** | Pause processing while disputing accuracy | 🚨 Contact support@supasnake.com |
| **Objection** | Object to processing based on legitimate interest | Consent Settings → Opt Out |
| **Withdraw Consent** | Revoke previously granted consent | Consent Settings → Manage |
| **Automated Decision-Making** | Opt out of automated decisions | N/A - we don't use automated decisions |
| **Know** (CCPA) | Learn what data we collect | This Privacy Policy |
| **Delete** (CCPA) | Permanent deletion | Privacy Dashboard → Delete Account |
| **Opt-Out of Sale** (CCPA) | We don't sell data | N/A |
| **Non-Discrimination** (CCPA) | No penalty for exercising rights | Guaranteed |

### 7.2 Access Your Data (GDPR Article 15, CCPA)

**What you get:**
- Copy of all personal data we hold about you
- Categories of data
- Purposes of processing
- Recipients of data (who we share with)
- Retention periods
- Data sources

**How to request:**

**In-app:**
1. Settings → Privacy Dashboard
2. Tap "Export My Data"
3. Confirm via email
4. Download link sent within 48 hours (JSON format)

**By email:**
- Send request to support@supasnake.com
- Include: Your username, email, and "GDPR Access Request" in subject
- We may ask for ID verification to protect your privacy
- Response within 30 days (GDPR) or 45 days (CCPA)

**What you receive:**
```json
{
  "account": {
    "email": "player@example.com",
    "username": "SnakeMaster99",
    "created_at": "2024-06-15T10:30:00Z",
    "age_verified": true
  },
  "gameplay": {
    "dna_balance": 1250,
    "high_score": 8500,
    "variants_collected": 18,
    "total_games_played": 342
  },
  "purchases": [
    {
      "transaction_id": "txn_abc123",
      "amount_usd": 4.99,
      "dna_purchased": 500,
      "timestamp": "2024-08-20T14:22:00Z"
    }
  ]
}
```

**Cost:** Free for first request in 12 months. We may charge reasonable fee for subsequent requests (GDPR Article 15(3)).

### 7.3 Delete Your Data (GDPR Article 17, CCPA)

**What happens:**
- Account permanently deleted after 30-day grace period
- Gameplay data deleted
- Email, username, password deleted
- Analytics data anonymized (hashed user ID broken)
- Purchase history retained (tax law) but anonymized

**How to delete:**

**In-app (recommended):**
1. Settings → Privacy Dashboard
2. Tap "Delete My Account"
3. Confirm via email
4. 30-day grace period starts
5. Permanent deletion on Day 30

**By email:**
- Send request to support@supasnake.com
- Include: "DELETE MY ACCOUNT" in subject
- We'll confirm via email and start 30-day countdown

**Grace period:** 30 days to change your mind. Contact support@supasnake.com to cancel deletion.

**Exceptions (we may refuse deletion):**
- Active legal dispute or investigation
- Tax/financial record retention requirements
- Defending legal claims
- Exercising freedom of expression

**Response time:** Immediate soft-delete, permanent after 30 days

### 7.4 Correct Your Data (GDPR Article 16)

**What you can correct:**
- Email address
- Username
- Password

**How to correct:**

**In-app:**
1. Settings → Account Info
2. Edit fields
3. Confirm via email (for email changes)

**By email:**
- Contact support@supasnake.com with correction request

**What you can't correct:**
- Gameplay data (scores, collections) - these are accurate records
- Purchase history - locked for financial compliance

**Response time:** Immediate (in-app) or 30 days (email)

### 7.5 Download Your Data (GDPR Article 20)

**Portability right:** Receive your data in structured, machine-readable format (JSON).

**How to download:** Same as Section 7.2 (Export Data)

**What's included:**
- Account data
- Gameplay data
- Purchase history
- Consent records

**Format:** JSON (can be imported to other services)

**Use cases:**
- Backup your progress
- Migrate to another game (if we release a sequel)
- Analyze your own gameplay statistics

### 7.6 Restrict Processing (GDPR Article 18)

🚨 **[LAWYER REVIEW]** Define how to implement restriction of processing. Technical implementation required.

**When you can restrict:**
- Disputing accuracy of data (while we verify)
- Processing is unlawful but you don't want deletion
- We no longer need data but you need it for legal claim
- You objected to processing (while we verify)

**What restriction means:**
- We store your data but don't use it
- Processing only with your consent or for legal claims

**How to request:**
- Email support@supasnake.com with "RESTRICTION REQUEST" in subject
- Explain why you're requesting restriction

**Response time:** 30 days

### 7.7 Object to Processing (GDPR Article 21)

**What you can object to:**
- Processing based on legitimate interest (analytics, attribution, error tracking)
- Direct marketing (promotional emails)
- Profiling

**How to object:**

**Analytics/attribution:**
1. Settings → Consent Settings
2. Toggle off "Analytics & Improvement"
3. Toggle off "Marketing Attribution"

**Marketing emails:**
- Click "Unsubscribe" in any marketing email
- Or: Settings → Notifications → Uncheck "Promotional Emails"

**Response time:** Immediate

**Effect:** We stop processing for that purpose (unless we have compelling legitimate grounds).

### 7.8 Withdraw Consent (GDPR Article 7(3))

**What you can withdraw:**
- Analytics consent
- Marketing consent
- Advertising ID sharing

**How to withdraw:**
1. Settings → Consent Settings
2. Toggle off the consent you want to withdraw
3. Changes take effect immediately

**Important:** Withdrawing consent doesn't affect lawfulness of processing before withdrawal.

**Effect:** We stop collecting that data going forward.

### 7.9 Automated Decision-Making (GDPR Article 22)

**Do we use automated decisions?** No.

SupaSnake does not make automated decisions that significantly affect you. We don't use:
- Automated credit scoring
- Algorithmic moderation
- AI-based player bans
- Automated account suspensions

Any significant decisions (e.g., account termination for cheating) involve human review.

### 7.10 CCPA-Specific Rights (California Users)

#### Right to Know (CCPA §1798.100)

**What you can learn:**
- Categories of personal information collected
- Specific pieces of personal information
- Sources of data
- Business purposes for collection
- Third parties we share with

**How to request:** Same as Section 7.2 (Export Data)

#### Right to Delete (CCPA §1798.105)

**Same as GDPR deletion** (Section 7.3)

#### Right to Opt-Out of Sale (CCPA §1798.120)

**Do we sell your data?** **NO.**

We do NOT sell your personal information as defined by CCPA. We share data with service providers (Amplitude, Statsig, etc.) but these are "service provider" relationships, not "sales."

**No opt-out needed** - there's nothing to opt out of.

#### Right to Non-Discrimination (CCPA §1798.125)

**Guaranteed:** We will NOT:
- Deny you service for exercising CCPA rights
- Charge different prices
- Provide different quality of service
- Suggest you'll receive different service

You can exercise all CCPA rights without penalty.

#### Authorized Agents (CCPA §1798.135(c))

**Can someone else submit requests on your behalf?** Yes.

**Requirements:**
- Signed written permission from you
- Proof of authorization
- We may contact you directly to confirm

**How:**
- Email support@supasnake.com with authorization letter
- Include your username and email
- Agent must provide their contact info

### 7.11 Response Times

| Jurisdiction | Law | Response Time |
|--------------|-----|---------------|
| European Union | GDPR | 30 days (can extend to 90 days if complex) |
| California | CCPA | 45 days (can extend to 90 days if complex) |
| Brazil | LGPD | 15 days |
| Other | Good faith | 30 days |

### 7.12 Complaints

**Not satisfied with our response?**

**EU users:**
- File complaint with your national Data Protection Authority
- Find yours: https://edpb.europa.eu/about-edpb/board/members_en

🚨 **[LAWYER REVIEW]** Specify lead supervisory authority if you have EU establishment.

**California users:**
- File complaint with California Attorney General
- https://oag.ca.gov/contact/consumer-complaint-against-business-or-company

**Other jurisdictions:**
- Contact your local privacy regulator

---

## 8. Children's Privacy

SupaSnake is rated for ages **13 and older**. We comply with the Children's Online Privacy Protection Act (COPPA) and similar laws worldwide.

### 8.1 Age Gate

**What happens when you create an account:**
1. We ask: "What year were you born?"
2. If you enter a year indicating you're under 13, we block account creation
3. Message shown: "Sorry, you must be at least 13 years old to create an account."

**Technical implementation:**
- We hash your birth year using SHA-256 encryption
- We NEVER store your raw date of birth
- We only store a boolean: `age_verified: true/false`

### 8.2 Under 13: Account Creation Blocked

**What we do:**
- Block account creation
- Do NOT collect personal information
- Guest play allowed (no data collection, no progress saving)

**Why:** COPPA prohibits collecting personal information from children under 13 without verifiable parental consent.

**Compliance:** We avoid COPPA requirements entirely by not serving users under 13.

### 8.3 Ages 13-17: Parental Consent Requirements

🚨 **[LAWYER REVIEW - JURISDICTION-SPECIFIC]**

**United States (COPPA):** Parental consent NOT required for ages 13+ (COPPA only applies to under 13)

**European Union (GDPR Article 8):**
- Parental consent required for ages under 16 (or lower if member state sets lower age)
- Age varies: 13 in UK, 15 in France, 16 in Germany, 13 in Sweden, etc.
- **Our approach:** [TO BE DETERMINED]

**Options:**
1. **Block ages 13-15 in EU** (simplest, excludes players)
2. **Require parental consent for ages 13-15 in EU** (complex, expensive to verify)
3. **Rely on platform age verification** (Apple/Google Family Sharing)

🚨 **[LAWYER REVIEW]** Choose approach and implement parental consent flow if required.

**South Korea:** Parental consent required under age 14

**Australia:** Parental consent required under age 18 for data collection (complex)

### 8.4 What We DON'T Collect from Children

Even for ages 13-17, we do NOT collect:
- ❌ Precise geolocation
- ❌ Photos or videos
- ❌ Social media connections
- ❌ Persistent identifiers (beyond functional needs)
- ❌ Sensitive information

### 8.5 Parental Controls

**Apple Family Sharing (iOS):**
- Parents can control in-app purchases
- Parents can restrict data collection via Screen Time settings
- We respect Apple's parental controls

**Google Family Link (Android):**
- Parents can approve in-app purchases
- Parents can manage privacy settings
- We respect Google's parental controls

### 8.6 Parental Rights

**If your child has an account:**

**Access:** Request copy of your child's data via support@supasnake.com
**Delete:** Request account deletion via support@supasnake.com
**Correct:** Request data corrections
**Verification:** We'll verify you're the parent (ID may be required)

**Response time:** 30 days

### 8.7 Age Verification Limitations

**Our current method (self-reported birth year) is NOT foolproof.**

🚨 **[LAWYER REVIEW]** Evaluate if stricter age verification is required (e.g., UK Age Appropriate Design Code, upcoming EU regulations).

**Possible upgrades:**
- Credit card verification (proves 18+)
- ID document verification (expensive, privacy-invasive)
- Facial age estimation AI (privacy concerns)
- Knowledge-based verification (e.g., "What year did X happen?")

**Trade-off:** Stronger verification increases privacy invasion and cost.

**Current approach:** Self-reported age with hash (SHA-256) is industry standard for mobile games.

---

## 9. Cookies & Tracking Technologies

SupaSnake is a mobile app, not a website, so traditional "cookies" (browser storage) don't apply. But we use similar technologies.

### 9.1 Mobile Equivalent of Cookies

**What we use:**
- **Local storage** (device storage, similar to cookies)
- **Session IDs** (authentication tokens)
- **Device IDs** (IDFA on iOS, AAID on Android)
- **Analytics SDKs** (Amplitude, Statsig)

### 9.2 Strictly Necessary (No Consent Required)

**Purpose:** Essential for the app to function

**Technologies:**
- **Session tokens** - keep you logged in (JWT stored locally)
- **CSRF tokens** - prevent security attacks
- **App preferences** - remember your settings

**Legal basis:** Contractual necessity (GDPR Article 6(1)(b))

**Expires:** Session tokens expire after 30 days of inactivity

**Your control:** None - these are required for the app to work.

### 9.3 Functional (Consent Recommended)

**Purpose:** Remember your preferences

**Technologies:**
- **Theme preference** (light/dark mode)
- **Language preference**
- **Sound settings** (music on/off, volume)
- **Notification preferences**

**Legal basis:**
🚨 **[LAWYER REVIEW]** Some regulators consider these strictly necessary. Others require consent. Verify for your jurisdiction.

**Expires:** Stored indefinitely on device (deleted when you uninstall app)

**Your control:** Toggle settings in-app, or reset via "Clear App Data" in device settings.

### 9.4 Analytics (Consent Required in EU)

**Purpose:** Understand how you use SupaSnake

**Technologies:**
- **Amplitude SDK**
  - Cookies: `amplitude-session-id`, `amplitude-device-id`
  - Duration: 2 years
  - Purpose: Track gameplay events, session analytics

- **Statsig SDK**
  - Cookies: `statsig-user-id`, `statsig-session-id`
  - Duration: 2 years
  - Purpose: A/B testing, feature flag assignments

**Legal basis:**
🚨 **[LAWYER REVIEW]** Choose one:
- **Consent (GDPR Article 6(1)(a))** - Recommended
- **Legitimate interest (GDPR Article 6(1)(f))** - Requires DPIA

**Your control:**
- EU users: Consent banner on first launch → "Accept" or "Decline"
- Change later: Settings → Consent Settings → Toggle "Analytics & Improvement"
- Effect: If you decline, we don't track gameplay events (core game still works)

### 9.5 Marketing & Attribution (Consent Required)

**Purpose:** Measure which ads bring players to SupaSnake

**Technologies:**
- **Adjust SDK**
  - Device IDs: IDFA (iOS), AAID (Android)
  - Duration: Until you reset advertising ID in device settings
  - Purpose: Install attribution, campaign tracking

**Legal basis:** Consent (GDPR Article 6(1)(a))

**Your control:**
- iOS: Settings → Privacy → Advertising → "Allow Apps to Request to Track" → Toggle off
- Android: Settings → Google → Ads → "Opt out of Ads Personalization"
- In-app: Settings → Consent Settings → Toggle "Marketing Attribution"

**Effect:** If you decline, we can't measure which ads work (doesn't affect gameplay).

### 9.6 Error Tracking (Legitimate Interest)

**Purpose:** Fix crashes and bugs

**Technologies:**
- **Sentry SDK**
  - Data collected: Error logs, stack traces, device context
  - Duration: 90 days
  - Purpose: Identify and fix bugs

**Legal basis:** Legitimate interest (GDPR Article 6(1)(f)) - we have a legitimate interest in keeping the app stable.

**Your control:** This is essential for app quality (not optional).

**Privacy protection:** We configure Sentry to NOT collect PII (no usernames, emails, etc. in error logs).

### 9.7 How to Manage Tracking

**In-app controls:**
1. Settings → Consent Settings
2. Toggle each category on/off:
   - Analytics & Improvement (Amplitude, Statsig)
   - Marketing Attribution (Adjust)
3. Changes take effect immediately

**Device-level controls:**

**iOS:**
- Settings → Privacy & Security → Tracking → Toggle off "Allow Apps to Request to Track"
- Settings → Privacy & Security → Advertising → "Reset Advertising Identifier"

**Android:**
- Settings → Google → Ads → "Opt out of Ads Personalization"
- Settings → Google → Ads → "Reset Advertising ID"

**Effect of blocking:**
- ✅ Core game works perfectly
- ✅ Progress saves normally
- ✅ Purchases work
- ❌ We can't fix bugs affecting your device type
- ❌ We can't optimize gameplay for your playstyle

### 9.8 Do Not Track (DNT)

**Browser DNT signals:** Not applicable (SupaSnake is a mobile app, not a website)

**Mobile equivalent:** Device-level advertising controls (see Section 9.7)

### 9.9 Third-Party Tracking

**Do we allow third-party trackers?** Only our service providers listed in Section 4.1.

We do NOT:
- ❌ Embed third-party advertising networks
- ❌ Allow social media pixels (Facebook, TikTok, etc.)
- ❌ Use cross-app tracking for advertising

---

## 10. Security Measures

We take data security seriously. Here's how we protect your information:

### 10.1 Encryption in Transit

**What:** All data sent between your device and our servers is encrypted

**How:** TLS 1.3 (Transport Layer Security) with HTTPS

**Why:** Prevents eavesdropping and man-in-the-middle attacks

**Standard:** Industry best practice, required by GDPR Article 32

### 10.2 Encryption at Rest

**What:** All data stored in our database is encrypted

**How:** AES-256 encryption (Supabase managed encryption)

**Why:** Protects data if physical servers are stolen

**Standard:** Military-grade encryption

### 10.3 Password Security

**What:** Your password is never stored in plain text

**How:** bcrypt hashing with per-user salt

**Why:** Even if our database is breached, attackers can't read your password

**Standard:** OWASP recommended password storage

**Your responsibility:**
- Choose a strong password (8+ characters, mix of letters/numbers/symbols)
- Don't reuse passwords from other sites
- Enable two-factor authentication (🚨 if/when we add it)

### 10.4 Access Controls

**What:** Strict controls over who can access your data

**How:**
- **Supabase Row-Level Security (RLS)** - you can only see your own data
- **API authentication** - all requests require valid JWT token
- **Employee access** - limited to necessary personnel only
- **Audit logs** - all data access is logged

**Why:** Prevents unauthorized access

**Standard:** Principle of least privilege (GDPR Article 32)

🚨 **[LAWYER REVIEW]** Document employee access policies and training in data processing records (GDPR Article 30).

### 10.5 Monitoring & Alerts

**What:** Continuous monitoring for security threats

**How:**
- **Sentry** - error monitoring, crash detection
- **Supabase audit logs** - database access logs
- **Amplitude anomaly detection** - unusual gameplay patterns (potential hacking)
- **Payment fraud detection** - Apple/Google handle this

**Why:** Early detection of security incidents

**Response time:** 24/7 monitoring, 4-hour response for critical incidents

### 10.6 Incident Response

**What happens if we're breached:**

**Within 24 hours:**
- Security team investigates
- Contain the breach (e.g., revoke compromised credentials)
- Assess scope (what data was accessed?)

**Within 72 hours:**
- Notify EU supervisory authority (GDPR Article 33) if EU data affected
- Notify affected users via email if high risk to rights (GDPR Article 34)

**Within 30 days:**
- Full incident report
- Remediation plan
- Preventive measures

**Your rights:** If we suffer a breach affecting you, we'll notify you with:
- What happened
- What data was affected
- What we're doing about it
- What you should do (e.g., change password)

🚨 **[LAWYER REVIEW]** Establish formal incident response plan. Consider cyber insurance.

### 10.7 Vulnerability Management

**What we do:**
- Regular security audits (🚨 frequency TBD)
- Dependency updates (automated via Dependabot)
- Penetration testing (🚨 before launch)
- Bug bounty program (🚨 consider for post-launch)

**Your help:** If you discover a security vulnerability, please report it responsibly to support@supasnake.com (don't publicly disclose).

### 10.8 Security Limitations

**What we CANNOT protect against:**
- ❌ You sharing your password with others
- ❌ Phishing attacks (fake emails pretending to be us)
- ❌ Device-level malware on your phone
- ❌ Physical access to your unlocked device

**Your responsibility:**
- Keep your device secure (lock screen, biometrics)
- Don't share your password
- Be suspicious of emails asking for login credentials (we'll never ask)
- Keep your OS and SupaSnake app updated

### 10.9 Compliance Certifications

🚨 **[LAWYER REVIEW]** Determine which certifications to pursue:

**Options:**
- **SOC 2 Type II** - US security standard (~$30k-$50k annually)
- **ISO 27001** - International security standard (~$40k-$60k)
- **GDPR compliance audit** - Third-party GDPR assessment (~$10k-$20k)

**Current status:** [NONE / TO BE DETERMINED]

**Vendor certifications:**
- Supabase: SOC 2 Type II
- Amplitude: SOC 2 Type II, ISO 27001
- Sentry: SOC 2 Type II

---

## 11. Changes to This Policy

We may update this Privacy Policy from time to time.

### 11.1 Types of Changes

**Minor changes (clarifications, typo fixes):**
- Update policy immediately
- Note change date at top
- No notification required

**Material changes (new data collection, new purposes, new third parties):**
- Notify you 30 days in advance
- Allow you to review changes
- Require re-consent for new purposes (GDPR)

🚨 **[LAWYER REVIEW]** Define "material change" precisely. Examples:
- Adding new data categories (e.g., location data)
- Adding new third parties (e.g., new analytics vendor)
- Changing legal basis (consent → legitimate interest)
- Changing retention periods (shorter OK, longer = material)

### 11.2 How We Notify You

**Material changes:**
1. **Email notification** - sent to your registered email address
2. **In-app banner** - prominent notification on first launch after change
3. **Push notification** - if you have notifications enabled (optional)

**Where to see changes:**
- Full updated policy: [INSERT WEBSITE URL]
- Changelog: [INSERT CHANGELOG URL] (highlights what changed)

### 11.3 Effective Date

**New policy effective:** 30 days after notification

**Your choices during 30-day period:**
1. **Accept changes** - continue using SupaSnake (implies acceptance)
2. **Decline changes** - delete your account before effective date
3. **Ask questions** - email support@supasnake.com

**Important:** Continued use after effective date means you accept the new policy.

### 11.4 Re-Consent for Material Changes

**If we start collecting new data or use data for new purposes:**
- We'll ask for your explicit consent again
- You can decline and keep playing (if possible)
- If you decline essential changes, you may not be able to use new features

**Example:**
- Old policy: We collect gameplay data only
- New policy: We want to collect location data for region-specific events
- Action: We'll ask for location consent via new consent banner
- Your choice: Accept (location features work) or Decline (you can still play without location features)

### 11.5 Policy Version History

**Current version:** 1.0 (2025-10-20)

**Previous versions:** [LINK TO ARCHIVE]

🚨 **[LAWYER REVIEW]** Maintain public archive of all previous policy versions (transparency requirement in some jurisdictions).

---

## 12. Contact Information

### 12.1 General Inquiries

**Email:** support@supasnake.com
**Response time:** 48 hours

**For:**
- General questions about SupaSnake
- Technical support
- Account issues
- Billing questions

### 12.2 Privacy Requests

**Email:** support@supasnake.com
**Response time:** 30 days (GDPR), 45 days (CCPA)

**For:**
- GDPR/CCPA rights requests (access, delete, correct)
- Privacy questions
- Consent management issues
- Data export requests

**Include in your email:**
- Your username
- Your registered email address
- Specific request (e.g., "GDPR access request" or "Delete my account")
- (For deletion) Confirmation: "I understand this is permanent"

**Verification:** We may ask for additional information to verify your identity before processing requests.

### 12.3 Security Issues

**Email:** support@supasnake.com
**Response time:** 24 hours for critical issues

**For:**
- Security vulnerabilities (responsible disclosure)
- Suspected account compromise
- Fraud reports
- Abuse reports

**Please don't publicly disclose security issues** - give us time to fix them first.

### 12.4 Data Protection Officer (DPO)

🚨 **[LAWYER REVIEW - DPO REQUIREMENT]**

**Is DPO required?**

**GDPR Article 37 requires DPO if:**
- You're a public authority, OR
- Core activities involve large-scale monitoring, OR
- Core activities involve large-scale processing of sensitive data, OR
- You employ 250+ people (some member states)

**For SupaSnake:**
- Not a public authority ✓
- Large-scale monitoring? [TO BE DETERMINED - depends on user count]
- Sensitive data? No (we don't collect health, religion, politics, etc.) ✓
- 250+ employees? No (solo dev) ✓

**Conclusion:** [DPO REQUIRED: YES/NO]

**If YES:**
- **Name:** [INSERT DPO NAME]
- **Email:** support@supasnake.com
- **Phone:** [INSERT]

**If NO:**
- "A Data Protection Officer is not required under GDPR Article 37 for SupaSnake. Privacy inquiries can be directed to support@supasnake.com."

### 12.5 Company Information

🚨 **[LAWYER REVIEW - INSERT COMPANY DETAILS]**

**Legal entity:** [COMPANY NAME]
**Registered address:** [FULL ADDRESS INCLUDING COUNTRY]
**Company number:** [REGISTRATION NUMBER]
**VAT/Tax ID:** [IF APPLICABLE]
**Country of incorporation:** [COUNTRY]

**Website:** [INSERT WEBSITE]
**App Store listing:** [INSERT APPLE APP STORE LINK]
**Play Store listing:** [INSERT GOOGLE PLAY LINK]

### 12.6 Supervisory Authorities

**If you're not satisfied with our response to a privacy complaint:**

**EU users:**
Contact your national Data Protection Authority:
- **Germany:** Bundesbeauftragte für den Datenschutz und die Informationsfreiheit (BfDI)
- **France:** Commission Nationale de l'Informatique et des Libertés (CNIL)
- **UK:** Information Commissioner's Office (ICO)
- **Full list:** https://edpb.europa.eu/about-edpb/board/members_en

🚨 **[LAWYER REVIEW]** If you have an EU establishment, specify your lead supervisory authority under GDPR Article 56.

**California users:**
- **California Attorney General**
- Website: https://oag.ca.gov/privacy/ccpa
- File complaint: https://oag.ca.gov/contact/consumer-complaint-against-business-or-company

**Brazil users:**
- **Autoridade Nacional de Proteção de Dados (ANPD)**
- Website: https://www.gov.br/anpd

---

## 13. Regional Variations

Privacy laws vary by jurisdiction. This section explains how this policy applies in specific regions.

### 13.1 European Union (GDPR)

**Legal basis:** General Data Protection Regulation (GDPR), Regulation (EU) 2016/679

**Key principles:**
- **Lawfulness, fairness, transparency** - we process data lawfully and tell you about it
- **Purpose limitation** - we only use data for stated purposes
- **Data minimization** - we collect only what's necessary
- **Accuracy** - we keep data accurate and up-to-date
- **Storage limitation** - we don't keep data longer than needed
- **Integrity and confidentiality** - we protect data with appropriate security
- **Accountability** - we can prove our compliance

**Your rights:** Full GDPR rights (see Section 7)
- Access (Article 15)
- Rectification (Article 16)
- Erasure (Article 17)
- Restriction (Article 18)
- Portability (Article 20)
- Objection (Article 21)
- Automated decisions (Article 22)

**Legal bases we use:**
- Consent (Article 6(1)(a)) - analytics, marketing
- Contract (Article 6(1)(b)) - gameplay, account management
- Legal obligation (Article 6(1)(c)) - tax compliance, law enforcement
- Legitimate interest (Article 6(1)(f)) - error tracking, attribution

🚨 **[LAWYER REVIEW]** Conduct and document Legitimate Interest Assessments (LIA) for all Article 6(1)(f) processing.

**Data transfers:** See Section 5 (International Data Transfers)

**Supervisory authority:** Your national Data Protection Authority (see Section 12.6)

**Representative (if required):**

🚨 **[LAWYER REVIEW - GDPR Article 27]**

If you're NOT established in the EU but offer services to EU users, you must appoint an EU representative.

**Required if:**
- No EU establishment, AND
- Targeting EU users

**Not required if:**
- Occasional processing
- Not large-scale
- Not likely to result in risk to individuals
- Not processing sensitive data

**For SupaSnake:** [REPRESENTATIVE REQUIRED: YES/NO]

**If YES:**
- **EU Representative:** [NAME]
- **Address:** [EU ADDRESS]
- **Email:** support@supasnake.com

### 13.2 California (CCPA/CPRA)

**Legal basis:** California Consumer Privacy Act (CCPA), as amended by California Privacy Rights Act (CPRA)

**Who it applies to:** California residents

**Your rights:** (See Section 7 for details)
- **Right to Know** (§1798.100) - what data we collect
- **Right to Delete** (§1798.105) - permanent deletion
- **Right to Correct** (§1798.106, CPRA addition) - fix inaccurate data
- **Right to Opt-Out of Sale** (§1798.120) - N/A (we don't sell data)
- **Right to Opt-Out of Sharing** (§1798.121, CPRA addition) - N/A (we don't share for cross-context behavioral advertising)
- **Right to Limit Sensitive Personal Information** (§1798.121, CPRA addition) - N/A (we don't collect sensitive PI)
- **Right to Non-Discrimination** (§1798.125) - guaranteed

**Categories of data we collect:**
- Identifiers (email, username, device IDs)
- Commercial information (purchase history)
- Internet activity (gameplay, app usage)
- Geolocation (country-level only)
- Inferences (playstyle preferences)

**Do we sell your data?** **NO.**

**Do we share your data for cross-context behavioral advertising?** **NO.**

**Retention:** See Section 6

**How to exercise rights:** See Section 7 (Privacy Dashboard or support@supasnake.com)

**Response time:** 45 days (can extend to 90 days if complex)

**Verification:** We may request additional information to verify your identity.

**Authorized agents:** Can submit requests on your behalf with signed authorization (see Section 7.10)

**CPRA additions (effective 2023):**
- Sensitive personal information protections (we don't collect sensitive PI)
- Right to correct inaccurate data (available in Settings)
- Contractor requirements (we have DPAs with all vendors)

### 13.3 Brazil (LGPD)

**Legal basis:** Lei Geral de Proteção de Dados (LGPD), Law No. 13,709/2018

**Who it applies to:** Brazilian residents

**Key principles:** Similar to GDPR (lawfulness, purpose limitation, transparency, security, etc.)

**Your rights:**
- Confirmation and access
- Correction of incomplete/inaccurate data
- Anonymization, blocking, or deletion
- Portability
- Information about public/private entities with shared data
- Information about possibility of denying consent
- Revocation of consent

**Legal bases we use:**
- Consent - analytics, marketing
- Contract performance - gameplay, account management
- Legal/regulatory obligation - tax compliance
- Legitimate interest - error tracking, fraud prevention

**Data controller:** [COMPANY NAME] (see Section 12.5)

**Data Protection Officer (Encarregado de Dados):**

🚨 **[LAWYER REVIEW]** LGPD Article 41 requires DPO. No exceptions for small companies.

**Required:** YES

**DPO Details:**
- **Name:** [INSERT DPO NAME]
- **Email:** support@supasnake.com
- **Phone:** [INSERT]

**International transfers:** We transfer data to the United States (see Section 5). Brazil requires adequate safeguards (similar to GDPR SCCs).

**Supervisory authority:** Autoridade Nacional de Proteção de Dados (ANPD)
**Website:** https://www.gov.br/anpd

**How to exercise rights:** Email support@supasnake.com

**Response time:** 15 days (LGPD Article 19)

### 13.4 Japan (APPI)

**Legal basis:** Act on the Protection of Personal Information (APPI), Act No. 57 of 2003

**Who it applies to:** Japanese residents

**Key requirements:**

**Purpose notification:** We notify you of purposes when collecting data (see Section 2)

**Consent for third-party provision:** Required for sharing with third parties (we obtain consent for analytics vendors)

**Cross-border transfer:** We notify you that data is transferred to the United States (see Section 5)

**Your rights:**
- Disclosure of retained personal data
- Correction of inaccurate data
- Suspension of use or deletion
- Suspension of third-party provision

**How to exercise rights:** Email support@supasnake.com

**Response time:** Without delay (typically 30 days)

**Personal Information Protection Commission:** https://www.ppc.go.jp/en/

**Anonymized data:** We use anonymized analytics data (not subject to APPI protections)

### 13.5 United Kingdom (UK GDPR)

**Legal basis:** UK GDPR (retained EU law post-Brexit) + Data Protection Act 2018

**Who it applies to:** UK residents

**Key points:**
- UK GDPR is nearly identical to EU GDPR
- Same rights (access, erasure, portability, etc.)
- Same legal bases (consent, contract, legitimate interest, etc.)

**Data transfers:** UK is NOT in the EU, but EU granted adequacy decision to UK (until revoked)

**Supervisory authority:** Information Commissioner's Office (ICO)
**Website:** https://ico.org.uk
**Helpline:** 0303 123 1113

**UK Representative:**

🚨 **[LAWYER REVIEW]** UK GDPR Article 27 requires UK representative if not established in UK.

**Required if:** Not established in UK but targeting UK users

**For SupaSnake:** [UK REPRESENTATIVE REQUIRED: YES/NO]

**If YES:**
- **UK Representative:** [NAME]
- **Address:** [UK ADDRESS]
- **Email:** support@supasnake.com

### 13.6 South Korea

**Legal basis:** Personal Information Protection Act (PIPA)

**Who it applies to:** South Korean residents

**Key requirements:**

**Age restrictions:** Parental consent required for users under 14

🚨 **[LAWYER REVIEW]** Implement parental consent flow for South Korean users under 14, or block registration for under-14.

**Consent:** Must be explicit for data collection (we obtain consent via onboarding flow)

**Destruction of data:** Must destroy data when purpose achieved or retention period expired (see Section 6)

**Your rights:**
- Access and request copies
- Correction of errors
- Deletion
- Suspension of processing

**Personal Information Protection Commission:** https://www.pipc.go.kr/np/

**How to exercise rights:** Email support@supasnake.com

### 13.7 Australia

**Legal basis:** Privacy Act 1988, Australian Privacy Principles (APPs)

**Who it applies to:** Australian residents

**Key requirements:**

**Children:** No specific age limit, but APP 1 requires considering if consent is voluntary and informed (capacity-based approach)

🚨 **[LAWYER REVIEW]** Australia has complex rules for children. Some states require parental consent under 18 for data collection. Verify requirements.

**Collection notice:** We notify you when collecting data (see Section 2)

**Use and disclosure:** Only for stated purposes (see Section 3)

**Cross-border disclosure:** We notify you of overseas transfers (see Section 5)

**Your rights:**
- Access personal information
- Correction of inaccurate data
- Complaint to us or OAIC

**Office of the Australian Information Commissioner (OAIC):** https://www.oaic.gov.au

**How to exercise rights:** Email support@supasnake.com

### 13.8 Other Jurisdictions

**If you're located outside the regions above:**

We still respect your privacy and offer similar protections:
- Transparency about data collection
- Security measures
- Ability to access and delete your data
- Contact support@supasnake.com for requests

**Compliance:** We monitor privacy law developments worldwide and update this policy as needed.

---

## 14. Glossary

**Terms used in this policy:**

**Anonymization:** Irreversibly removing identifying information so data can't be linked back to you.

**Consent:** Your freely given, specific, informed agreement to processing your data.

**Data Controller:** The entity deciding how and why to process your data (that's us).

**Data Processor:** A service provider processing data on our behalf (e.g., Supabase, Amplitude).

**Data Protection Authority (DPA):** Government agency enforcing privacy laws in a jurisdiction.

**Data Protection Impact Assessment (DPIA):** Analysis of privacy risks for high-risk processing.

**Hashing:** One-way encryption (e.g., your birth year → random string). Can't be reversed.

**Legitimate Interest:** Legal basis where our business needs outweigh your privacy rights (after balancing test).

**Personal Data/Personal Information:** Any data relating to an identified or identifiable person.

**Pseudonymization:** Replacing identifying data with pseudonyms (e.g., user ID instead of email).

**Sensitive Data:** Special categories like health, race, religion, politics (we don't collect this).

**Standard Contractual Clauses (SCCs):** EU-approved contracts for international data transfers.

---

## 15. Summary (Plain Language)

**Too long? Here's the short version:**

**What we collect:**
- Account info (email, username, hashed password)
- Gameplay data (scores, DNA, collections)
- Device info (OS, model, app version)
- Analytics (if you consent) - gameplay events, session data
- Error logs - to fix bugs

**How we use it:**
- Run the game (save your progress, sync across devices)
- Improve the game (analytics, A/B testing)
- Fix bugs (error tracking)
- Measure marketing (attribution)

**Who we share with:**
- Service providers with strict contracts (Supabase, Amplitude, etc.)
- Nobody else (we DON'T sell your data)

**Your rights:**
- See your data (export it anytime)
- Fix wrong data (update in Settings)
- Delete your data (permanent deletion after 30 days)
- Opt out of analytics (EU users)

**Security:**
- Encrypted data (in transit and at rest)
- Hashed passwords (we never see your real password)
- Access controls (only you see your data)

**Kids:**
- Must be 13+ to play
- We block under-13 signups

**Questions?**
- Email: support@supasnake.com
- We respond within 30 days

**Remember:** This summary is for convenience only. The full policy above is the legally binding version.

---

## 16. Legal Disclaimers

🚨 **[LAWYER REVIEW - REQUIRED DISCLAIMERS]**

### 16.1 Disclaimer of Warranties

TO THE MAXIMUM EXTENT PERMITTED BY LAW, SUPASNAKE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT:
- Your data will be 100% secure (no system is perfectly secure)
- The app will be error-free or uninterrupted
- Data loss will never occur (though we take precautions)

### 16.2 Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR:
- Indirect, incidental, or consequential damages
- Data loss due to device failure, user error, or force majeure
- Damages exceeding amount you paid us in past 12 months

**Exception:** Nothing in this policy limits liability for fraud, gross negligence, or violations of mandatory consumer protection laws.

### 16.3 Severability

If any provision of this policy is found invalid by a court, the rest remains in effect.

### 16.4 Governing Law

🚨 **[LAWYER REVIEW]** Choose governing law carefully. Options:
- Your country of incorporation (e.g., US, UK)
- User's country (consumer protection advantage)
- Neutral jurisdiction (e.g., Switzerland)

**This Privacy Policy is governed by the laws of [INSERT JURISDICTION], without regard to conflict of laws principles.**

**Disputes:** [INSERT DISPUTE RESOLUTION METHOD - arbitration, courts, etc.]

### 16.5 No Waiver

Our failure to enforce any part of this policy doesn't waive our right to enforce it later.

---

## 17. Acknowledgments

This Privacy Policy was drafted with reference to:
- GDPR (Regulation EU 2016/679)
- CCPA/CPRA (Cal. Civ. Code §1798.100 et seq.)
- COPPA (16 CFR Part 312)
- ePrivacy Directive (Directive 2002/58/EC)
- LGPD (Law No. 13,709/2018, Brazil)
- APPI (Act No. 57 of 2003, Japan)
- UK GDPR and Data Protection Act 2018
- EDPB Guidelines and Recommendations
- CNIL guidance on mobile apps and cookies
- ICO guidance on children's privacy
- IAPP best practices for privacy notices

**This template is for educational purposes and does NOT constitute legal advice.**

🚨 **HIRE A LAWYER before using this in production.**

**Recommended law firms specializing in gaming privacy:**
- [List to be added by user after lawyer consultation]

---

**END OF PRIVACY POLICY TEMPLATE**

---

## Next Steps for SupaSnake Developer

**Before launch:**

1. **Hire privacy lawyer** ($10k-$15k budget)
   - Review this template
   - Customize for your specific implementation
   - Address all 🚨 sections
   - Conduct GDPR/CCPA compliance audit

2. **Implement technical requirements:**
   - Consent management (OneTrust or similar)
   - Privacy Dashboard (export data, delete account)
   - Cookie/tracking controls
   - Age gate (with SHA-256 hashing)

3. **Create supporting documents:**
   - Terms of Service
   - Cookie Policy (if separate from Privacy Policy)
   - Data Processing Agreements with all vendors
   - Legitimate Interest Assessments (for GDPR)
   - Data Protection Impact Assessment (if required)

4. **Test privacy flows:**
   - Consent banner UX
   - Data export functionality
   - Account deletion (30-day grace period)
   - Age gate blocking under-13

5. **Establish processes:**
   - Privacy request handling (30-day response time)
   - Incident response plan (72-hour breach notification)
   - Employee training (GDPR compliance)
   - Vendor audits (annual DPA compliance checks)

6. **Regional considerations:**
   - Decide on EU data localization (cost vs. legal benefit)
   - Parental consent flow for ages 13-15 in EU (if required)
   - DPO appointment (if required by scale)
   - UK/EU representatives (if not established there)

**Estimated total compliance cost (first year):**
- Legal review: $10k-$15k
- Consent management platform: $2k-$5k/year (OneTrust, Cookiebot, etc.)
- Privacy compliance tools: $1k-$3k/year
- Potential DPO: $5k-$20k/year (if required)
- Security audits: $5k-$15k (one-time)

**Total: ~$23k-$58k first year**, then ~$8k-$28k/year ongoing.

**This is the cost of doing F2P mobile games ethically and legally in 2025.**

---

**Document Status:** 🚨 TEMPLATE - NOT LEGAL ADVICE
**Word Count:** ~9,800 words
**Compliance Coverage:** GDPR, CCPA/CPRA, COPPA, ePrivacy, LGPD, APPI, UK GDPR, Australia, South Korea
**Last Updated:** 2025-10-20
**Version:** 1.0 DRAFT
