# Railway deployment

## Backend

1. Open [Railway](https://railway.app) and sign in with GitHub.
2. Create a new project and choose **Deploy from GitHub repo**.
3. Select `hyperS777/BizAI`.
4. In the service settings, set **Root Directory** to `/backend`.
5. Railway will use `backend/railway.json`.
6. Add a PostgreSQL service with **New > Database > PostgreSQL**.
7. Add these variables to the API service:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
SECRET_KEY=<generate-a-long-random-value>
DEBUG=false
AI_PROVIDER=groq
GROQ_API_KEY=<new-groq-key>
CORS_ORIGINS=https://<your-vercel-app>.vercel.app
```

Never put the Groq key in this repository or in the frontend.

8. Deploy the service and open its generated public domain. Verify:

```text
https://<your-railway-domain>/api/health
```

It should return:

```json
{"status":"ok"}
```

## Frontend

1. Import the same GitHub repository into Vercel.
2. Set the Vercel project root directory to `frontend`.
3. Add this environment variable:

```text
VITE_API_URL=https://<your-railway-domain>/api
```

4. Deploy. `frontend/vercel.json` keeps React Router URLs working on refresh.
5. Copy the final Vercel URL into Railway's `CORS_ORIGINS` variable and redeploy the API.

## Free tier note

Railway's free availability and limits can change. Check the current account credit/trial terms before deploying a public demo. The application uses PostgreSQL in production and SQLite only for local development.
