# Cookie Policy - SupaSnake

**Status:** 🚨 TEMPLATE - REQUIRES LAWYER REVIEW

**Applies to:** Web version (if applicable) + Mobile identifiers
**Compliance:** EU ePrivacy Directive, GDPR, CCPA

---

## ⚠️ DO NOT USE THIS TEMPLATE IN PRODUCTION

Cookie policies must accurately reflect your actual tracking practices. Lawyer must audit all third-party services.

---

## What Are Cookies?

```
[LAWYER TO DEFINE]
- Small text files stored on device
- Used to remember preferences, track behavior
- First-party vs third-party
- Session vs persistent
- Mobile equivalent: Device identifiers (IDFA, AAID)
```

---

## What Cookies/Identifiers We Use

### 1. Strictly Necessary (No consent required)

#### 1.1 Authentication
```
[LAWYER TO DETAIL]
- supabase-auth-token (session management)
- Purpose: Keep you logged in
- Duration: Session
- Provider: Supabase
```

#### 1.2 Security
```
[LAWYER TO DETAIL]
- csrf-token (security)
- Purpose: Prevent cross-site attacks
- Duration: Session
- Provider: Next.js
```

### 2. Functional (Consent recommended)

#### 2.1 Preferences
```
[LAWYER TO DETAIL]
- theme (light/dark mode)
- language
- sound-volume
- Purpose: Remember your settings
- Duration: 1 year
- Provider: localStorage (first-party)
```

### 3. Analytics (Consent required - EU)

#### 3.1 Amplitude
```
[LAWYER TO DETAIL]
- amplitude-session-id
- amplitude-device-id
- Purpose: Understand how you play, improve game
- Duration: 2 years
- Provider: Amplitude
- DPA: Yes
- Data shared: Gameplay events, device info
- Privacy policy: https://amplitude.com/privacy
```

#### 3.2 Sentry (Performance)
```
[LAWYER TO DETAIL]
- sentry-session
- Purpose: Monitor performance, catch bugs
- Duration: Session
- Provider: Sentry
- DPA: Yes
- Privacy policy: https://sentry.io/privacy
```

### 4. Marketing/Attribution (Consent required)

#### 4.1 Adjust (Mobile Attribution)
```
[LAWYER TO DETAIL]
- IDFA (iOS) / AAID (Android)
- Purpose: Track where installs came from
- Duration: Until reset by user
- Provider: Adjust
- DPA: Yes
- Privacy policy: https://www.adjust.com/terms/privacy-policy
```

#### 4.2 Future Ad Networks (if implemented)
```
[LAWYER TO DETAIL]
- Unity Ads / Google AdMob
- Purpose: Show relevant ads
- Duration: Varies
- Provider: TBD
- DPA: Required
```

---

## Mobile-Specific Identifiers

### iOS
```
[LAWYER TO DETAIL]
- IDFA (Identifier for Advertisers)
  - Requires ATT (App Tracking Transparency) prompt
  - User can disable in Settings → Privacy → Tracking
  - Used by: Adjust (attribution)

- IDFV (Identifier for Vendors)
  - Automatic, can't opt out
  - Resets when app deleted
  - Used by: Analytics (Amplitude)
```

### Android
```
[LAWYER TO DETAIL]
- AAID (Android Advertising ID)
  - User can reset/disable in Settings → Google → Ads
  - Used by: Adjust (attribution)

- Android ID
  - Device-specific
  - Used by: Analytics (Amplitude)
```

---

## How to Manage Cookies/Identifiers

### Web (if applicable)
```
[LAWYER TO DETAIL]
- OneTrust cookie banner (first visit)
- Granular consent (necessary, functional, analytics, marketing)
- Cookie settings: Footer → "Cookie Preferences"
- Browser settings: Clear cookies in browser
```

### Mobile
```
[LAWYER TO DETAIL]
- In-app: Settings → Privacy → Manage Tracking
  - Toggle analytics on/off
  - Toggle marketing attribution on/off

- iOS: Settings → Privacy & Security → Tracking → SupaSnake
- Android: Settings → Google → Ads → Opt out of Ads Personalization
```

---

## Third-Party Services & Their Cookies

| Service | Purpose | Consent Required? | DPA? | Privacy Policy |
|---------|---------|-------------------|------|----------------|
| Supabase | Hosting, database | No (necessary) | Yes | [Link] |
| Amplitude | Analytics | Yes (EU) | Yes | [Link] |
| Statsig | A/B testing | Yes (EU) | Yes | [Link] |
| Adjust | Attribution | Yes | Yes | [Link] |
| Sentry | Error tracking | Yes (EU) | Yes | [Link] |
| OneTrust | Consent management | No (necessary) | Yes | [Link] |

**[LAWYER TO VERIFY ALL LINKS AND DPA STATUS]**

---

## Data Shared With Third Parties

### Amplitude (Analytics)
```
[LAWYER TO DETAIL]
What we send:
- User ID (hashed)
- Device info (OS, model)
- Gameplay events (score, DNA earned)
- Session data (length, frequency)

What they don't get:
- Real name
- Email
- Payment info
- Precise location (only country-level)
```

### Adjust (Attribution)
```
[LAWYER TO DETAIL]
What we send:
- Device identifier (IDFA/AAID)
- Install timestamp
- Attribution data (campaign source)

What they don't get:
- Gameplay data
- Personal info
```

---

## Legal Bases for Cookie Use

### GDPR (EU)
```
[LAWYER TO DETAIL]
- Strictly necessary: Legitimate interest (no consent needed)
- Functional: Legitimate interest or consent
- Analytics: Consent required
- Marketing: Consent required
```

### ePrivacy Directive (EU)
```
[LAWYER TO DETAIL]
- Cookie consent required before placement (except necessary)
- Must provide clear information
- Must offer granular choice
- Must allow withdrawal
```

### CCPA (California)
```
[LAWYER TO DETAIL]
- Notice of data collection
- Right to opt-out of "sale" (we don't sell)
- Cookie disclosure required
```

---

## Children's Privacy

```
[LAWYER TO DETAIL]
- Age gate (13+) on first launch
- No cookies for <13 users (immediate exit)
- Parental consent mechanism (backup if <13 detected)
```

---

## Changes to This Policy

```
[LAWYER TO DETAIL]
- We may update this policy
- Notice: In-app notification + email
- Effective date: [Date]
- You can review historical versions at [URL]
```

---

## Contact

```
[LAWYER TO DETAIL]
- Cookie, privacy, and legal questions: support@supasnake.com
- Opt-out requests: Settings → Privacy or email above
```

---

## OneTrust Integration (Technical)

**When implemented:**
```typescript
// OneTrust cookie consent banner
// Shown on first web visit (if web version)
// Categories: Necessary, Functional, Analytics, Marketing
// Auto-blocks non-consented cookies
// Saves consent choices to localStorage + server
```

**Mobile equivalent:**
- Custom consent dialog (first launch)
- Mimic OneTrust categories
- Persist consent choices to server (GDPR proof)

---

## Compliance Checklist

**Before launch:**
- [ ] Lawyer reviews actual cookies used
- [ ] All third-party services have DPAs signed
- [ ] OneTrust configured (if web)
- [ ] Mobile consent dialog implemented
- [ ] Analytics opt-out functional
- [ ] Cookie banner tested (EU, US, other regions)
- [ ] Historical versions stored (GDPR)
- [ ] Privacy Policy links to this Cookie Policy

---

**Last Updated:** [TO BE COMPLETED BY LAWYER]
**Effective Date:** [TO BE COMPLETED BY LAWYER]
**Version:** Draft Template v1.0
