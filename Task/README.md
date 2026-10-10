# TaskFlow

TaskFlow is a React task planner with an Express API for account signup and login. Passwords are hashed with bcrypt, and the API issues seven-day JWTs. The browser stores the JWT in `localStorage` and checks it with the API when the app opens.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The development command starts both the web app and the API. User accounts are stored in `server/data/users.json`; task data stays in the browser and is separated by account.

For deployment, set a strong `JWT_SECRET` environment variable. The API refuses to start in production without it. The built-in JSON user store is intended for local development and small single-instance deployments; use a managed database for a multi-instance production service.
