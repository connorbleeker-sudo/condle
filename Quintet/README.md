# Quintet

A word guessing game (5 to 10 letters) that TikTok LIVE chat can play. Viewers type words in chat; when the timer runs out, one suggestion that fits the clues is picked at random and guessed.

## Run it on your computer

```
npm install
npm start
```

Open http://localhost:3000, click **Chat mode**, type your TikTok username, and press **Connect** while you are live.

## Put it online (Render, free plan)

1. Make a free account at https://github.com and create a new **empty** repository (for example `quintet`).
2. On the new repository's page, click **uploading an existing file**, then drag in these from this folder: the `public` folder, `server.js`, `package.json`, `package-lock.json`, `render.yaml`, `README.md` and `.gitignore`. Click **Commit changes**. Do not upload `node_modules` or `.claude`.
3. Make a free account at https://render.com and sign in with GitHub.
4. Click **New → Blueprint**, pick your `quintet` repository, and click **Apply**. Render reads `render.yaml` and sets everything up. When it asks for `EULER_API_KEY`, leave it blank for now.
5. After a few minutes Render shows your link, like `https://quintet-xxxx.onrender.com`. Share that link.

On the free plan the server sleeps after about 15 idle minutes; the first visit after that takes about a minute to load.

## Using it on stream

1. Open your link, click **Chat mode**, enter your TikTok username, press **Connect** (you must be live).
2. In OBS or TikTok LIVE Studio, add a **Browser source** with your link. Size it about 1000 × 700.

## Settings

| Setting | Where | What it does |
|---|---|---|
| Seconds per guess | Chat panel | How long chat has to suggest words before a pick |
| Letters allowed to break clues | Chat panel | 0 = only words that fit every clue; 2 = words may break up to 2 clues |
| `EULER_API_KEY` | Render → Environment | Optional key from https://www.eulerstream.com. Raises TikTok connection limits if many streamers use the site at once |
| `MAX_ROOMS` | Render → Environment | Most streamers connected at once (default 50) |

## How it works

- `server.js` serves the game from `public/` and opens one TikTok connection per streamer (using the unofficial `tiktok-live-connector` library), sending chat to the page over `/api/chat`.
- `public/index.html` is the whole game. `public/words-N.txt` are the allowed guesses for each length, from the public-domain ENABLE word list.
