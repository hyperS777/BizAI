# BizAI Frontend

## Vercel deployment

Deploy this directory as the Vercel project root. The existing `vercel.json` rewrite keeps React Router routes working on refresh.

Set the Vercel project environment variable `VITE_API_URL` to the public FastAPI base URL, including `/api`, for example `https://your-api.example.com/api`. Do not leave it as `/api` in production unless Vercel is also configured to proxy that path to the backend. Redeploy after changing the variable.

On the FastAPI host, set `CORS_ORIGINS` to the exact Vercel origin (for example `https://your-project.vercel.app`). Include the production and preview origins if both are used.

For local development, `VITE_API_URL=/api` uses the Vite proxy configured in `vite.config.js`.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
