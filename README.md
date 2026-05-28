# 41 Day Run Challenge

A shared run tracking app for Ben & Jake.

---

## Setup (5 minutes)

### Step 1 — Get a JSONBin account (free shared database)

1. Go to [https://jsonbin.io](https://jsonbin.io) and sign up for free
2. Click **Create Bin**
3. Paste this as the initial content and click Save:
   ```json
   {"completions":{"Ben":{},"Jake":{}},"skips":{"Ben":{},"Jake":{}},"startDate":""}
   ```
4. Copy the **Bin ID** from the URL (looks like `64f3a...`)
5. Go to **API Keys** in your account and copy your **Master Key**

### Step 2 — Get an Anthropic API key (for pace reading)

1. Go to [https://console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Go to **API Keys** → **Create Key**
4. Copy the key

### Step 3 — Add your keys to the app

Open `src/App.jsx` and fill in the three values at the top of the file:

```js
const JSONBIN_BIN_ID    = "6a1788c4ddf5aa59f76df93d";
const JSONBIN_API_KEY   = "$2a$10$l/SKlHj6xI9eBXVsjV.uL.Nbg1xBSPbzKj0wiILRg0kvaTjzx9FBW";
const ANTHROPIC_API_KEY = "PASTE_YOUR_ANTHROPIC_API_KEY_HERE";
```

### Step 4 — Deploy to Vercel (free)

**Option A — Drag and drop (easiest)**
1. Run in this folder:
   ```
   npm install
   npm run build
   ```
2. Go to [https://vercel.com](https://vercel.com) and sign up for free
3. Click **Add New Project** → **Deploy from existing file**
4. Drag the `dist/` folder onto the Vercel dashboard
5. Done — you'll get a URL like `https://run-challenge-xyz.vercel.app`

**Option B — Via GitHub**
1. Push this folder to a GitHub repo
2. Go to [https://vercel.com](https://vercel.com), connect your GitHub
3. Import the repo — Vercel auto-detects Vite and deploys

---

## Using the app

- Both Ben and Jake open the same URL on their phones
- Tap **Add to Home Screen** in Safari to install it like an app
- Use the **Logging as** toggle to switch between users
- Run days: tap **Strava** to upload a screenshot — pace is auto-read from the image
- Rest days: tap **Walk** to upload a photo
- Tap the **Skip** button on a run day to move it to the next rest day (requires a reason)

---

## Local development

```
npm install
npm run dev
```
