# TaskFlow

TaskFlow is a React task planner with an Express API for account signup and login. Passwords are hashed with bcrypt, and the API keeps login sessions in secure, HTTP-only cookies for up to seven days.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The development command starts both the web app and the API. User accounts are stored in `server/data/users.json`; task data stays in the browser and is separated by account.

## Production

Build and start the combined web app and API with:

```sh
npm run build
npm start
```

Provide persistent storage for `server/data/users.json`. In production, session cookies are marked secure and require HTTPS. Sessions are held in server memory and expire after seven days; restarting the server signs users out. The server listens on `PORT` (default `3001`) and `0.0.0.0`, serves the built React app, and exposes `/api/health` for health checks. The JSON user store supports a single server instance; use a managed database and shared session storage before running multiple instances.
