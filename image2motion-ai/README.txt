IMAGE2MOTION AI  -  Accounts + 25 Free Tokens + Pro Billing + Daily Blog
=========================================================================

HOW IT WORKS
  - Visitor signs in with email (magic link, no password).  New account = 25 free tokens (once).
  - 1 generation = 1 token (deducted on the server; refunded automatically if the AI call fails).
  - 0 tokens -> "Upgrade to Pro" -> secure hosted checkout (Lemon Squeezy) -> webhook adds PRO_TOKENS every paid month.
  - Billing portal (update card / invoices / cancel) opens from the Pricing page.

STACK:  Vercel (hosting + API)  |  Supabase (login + database)  |  Lemon Squeezy (payments)  |  Claude API (AI)

------------------------------------------------------------
SETUP (about 30-40 minutes, one time)
------------------------------------------------------------
1) SUPABASE  (supabase.com, free plan is fine)
   a. New project. Open  SQL Editor -> New query -> paste supabase/schema.sql -> Run.
   b. Project Settings -> API: copy  Project URL,  anon key,  service_role key.
   c. Authentication -> URL Configuration:
        Site URL = https://yourdomain.com
        Redirect URLs = https://yourdomain.com/**
   d. (Optional) Authentication -> Providers -> Google, then set GOOGLE_LOGIN=1 in Vercel.

2) LEMON SQUEEZY  (lemonsqueezy.com)
   a. Create a store (needs approval; Terms/Privacy/Refund pages are included at /legal/...).
   b. Products -> New product -> Subscription, monthly, price = same as PRO_PRICE. Copy the Variant ID.
   c. Settings -> API: create an API key.  Note your Store ID.
   d. Settings -> Webhooks -> Add:
        URL:    https://yourdomain.com/api/webhook
        Secret: any long random text (this is LS_WEBHOOK_SECRET)
        Events: subscription_created, subscription_updated, subscription_cancelled,
                subscription_resumed, subscription_unpaused, subscription_expired,
                subscription_payment_success
   e. Test first in LS "Test mode" (use their test card), then switch to live.
   f. Payouts: Settings -> Payouts (bank or PayPal). Check that your country is still supported when you sign up.

3) VERCEL -> Settings -> Environment Variables
     SUPABASE_URL               (public)   from step 1b
     SUPABASE_ANON_KEY          (public)   from step 1b
     SUPABASE_SERVICE_ROLE_KEY  (SECRET)   from step 1b   <- never put this in any file
     ANTHROPIC_API_KEY          (SECRET)
     LS_API_KEY                 (SECRET)
     LS_STORE_ID
     LS_VARIANT_ID
     LS_WEBHOOK_SECRET          (same text as in LS webhook)
     SITE_URL                   https://yourdomain.com
     PRO_PRICE                  $9        (text shown on Pricing page; must match LS product price)
     PRO_TOKENS                 300       (tokens added on every paid month)
     SUPPORT_EMAIL              support@yourdomain.com
     ADMIN_CODE                 strong password for /admin/
     GOOGLE_LOGIN               1 (only if Google login is enabled)   [optional]
     CLAUDE_MODEL               claude-sonnet-5-5                     [optional]
   Then Redeploy.  (SUPABASE_URL / ANON_KEY / PRO_* are inserted into the pages at build time.)

4) TEST CHECKLIST
   - Sign in with a new email  ->  badge shows  ⚡ 25
   - Generate a plan           ->  badge shows  ⚡ 24
   - Pricing -> Upgrade (LS test mode)  ->  after payment  ⚡ +PRO_TOKENS and "PRO" badge
   - Pricing -> Manage billing opens the portal

------------------------------------------------------------
MANUAL PAYMENTS (Easypaisa / JazzCash / bank transfer)
------------------------------------------------------------
  /admin/ -> "Grant tokens": enter the user's email (they must have signed in once) and the tokens.
  Tick "Mark account as Pro" if you want the PRO badge.

------------------------------------------------------------
PRICING ADVICE
------------------------------------------------------------
  Every token costs you one Claude API call (image + ~1,500 output tokens). Check your real cost per
  generation in the Anthropic console, then set PRO_PRICE / PRO_TOKENS so that
  (price - Lemon Squeezy fee) is clearly higher than PRO_TOKENS x your cost per generation.
  Lemon Squeezy's fee is about 5% + 50c per sale (verify current fees in your dashboard).
  Free-token abuse: each email gets 25 tokens, so watch the Supabase "profiles" table for many new accounts.

------------------------------------------------------------
FILES
------------------------------------------------------------
  supabase/schema.sql   database (profiles, tokens, atomic consume_token)
  api/generate.js       token-gated generation       api/me.js        balance/plan
  api/checkout.js       start checkout               api/portal.js    billing portal
  api/webhook.js        payment events (signed, idempotent)   api/admin-grant.js  manual top-up
  api/draft.js          AI blog draft writer (/admin/)
  static/auth.js        login modal + token badge    static/config.js public settings
  static/pricing.html   plans + billing FAQ          static/legal/    Terms, Privacy, Refund (templates)
  posts/                blog posts (see blog workflow below)

BLOG WORKFLOW (unchanged)
  GitHub -> posts folder -> Add file -> new .md with front matter (title, date, description, tags) -> Commit.
  Or generate a draft at /admin/, edit it, then commit it. Start from posts/_TEMPLATE.md.

LEGAL NOTE
  The Terms / Privacy / Refund pages are starting templates, not legal advice. Review and edit them.

------------------------------------------------------------
UPLOAD CHECKLIST (if Vercel build fails with "scandir .../static")
------------------------------------------------------------
Your GitHub repo root must contain:  api/  posts/  static/  supabase/  build.js  package.json  site.json  vercel.json
and  static/index.html  must exist. GitHub's web uploader does not unzip: extract the zip first, then drag the
extracted FOLDERS (not the zip) into "Add file -> Upload files". The harmless npm warning
"Unknown env config cache-dir" can be ignored.
update 1
