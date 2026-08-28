# Free deployment

## 1. Create the database

Create a free PostgreSQL database on Neon. Copy its connection string. It should look like:

```text
postgresql://user:password@host/database?sslmode=require
```

## 2. Deploy the API to Render

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Render will read `render.yaml` and create the FastAPI service.
4. Set `DATABASE_URL` to the Neon connection string.
5. Set `GROQ_API_KEY` to a newly generated Groq key.
6. Set `CORS_ORIGINS` temporarily to the Vercel URL after deploying the frontend.
7. Check `https://YOUR-API.onrender.com/api/health` returns `{ "status": "ok" }`.

The Render start command is:

```text
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## 3. Deploy the frontend to Vercel

1. Choose **Add New > Project** and select the repository.
2. Set the root directory to `frontend`.
3. Vercel detects Vite automatically. Build output is `dist`.
4. Add this environment variable:

```text
VITE_API_URL=https://YOUR-API.onrender.com/api
```

The included `frontend/vercel.json` keeps React Router routes working after refresh.

## 4. Finish CORS

Replace the Render `CORS_ORIGINS` value with the real Vercel URL:

```text
https://YOUR-APP.vercel.app
```

Redeploy the API after saving the variable.

## Security

Never commit `.env` files or API keys. Revoke any key that has been shared publicly and generate a replacement in the provider dashboard. The frontend must never receive `GROQ_API_KEY`.

## Free-tier note

Render free services sleep after inactivity. The first request after sleeping may take some time. Neon may pause inactive databases depending on its current free-tier policy.
