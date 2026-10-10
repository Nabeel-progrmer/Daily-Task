import bcrypt from "bcryptjs";
import express from "express";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";

const app = express();
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";
const usersFile = process.env.AUTH_DATA_FILE || join(dirname(fileURLToPath(import.meta.url)), "data", "users.json");
const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const buildDirectory = join(projectDirectory, "dist");
const isProduction = process.env.NODE_ENV === "production";
const sessionCookie = "taskflow_session";
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.use(express.json({ limit: "10kb" }));

if (isProduction) {
  app.use(express.static(buildDirectory, { index: false }));
}

let users = [];
let signupQueue = Promise.resolve();
const sessions = new Map();

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function createSession(user, response, status = 200) {
  const sessionId = randomBytes(32).toString("hex");
  sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + sessionDuration });
  response.cookie(sessionCookie, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: sessionDuration,
  });
  response.status(status).json({ user: publicUser(user) });
}

function getSessionUser(request) {
  const sessionId = (request.get("cookie") || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${sessionCookie}=`))
    ?.slice(sessionCookie.length + 1);
  const session = sessionId && sessions.get(sessionId);

  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return users.find((user) => user.id === session.userId) || null;
}

function addUser(user) {
  const operation = signupQueue.then(async () => {
    if (users.some((existingUser) => existingUser.email === user.email)) {
      return false;
    }

    const nextUsers = [...users, user];
    const temporaryFile = `${usersFile}.${randomUUID()}.tmp`;

    try {
      await writeFile(temporaryFile, JSON.stringify(nextUsers, null, 2), {
        encoding: "utf8",
        flag: "wx",
      });
      await rename(temporaryFile, usersFile);
    } catch (error) {
      await rm(temporaryFile, { force: true }).catch(() => {});
      throw error;
    }

    users = nextUsers;
    return true;
  });

  signupQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

app.get("/api/health", (request, response) => {
  response.json({ status: "ok" });
});

app.post("/api/auth/signup", async (request, response, next) => {
  try {
    const name = String(request.body?.name || "").trim();
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");

    if (name.length < 1 || name.length > 80) {
      return response.status(400).json({ message: "Enter a name up to 80 characters." });
    }
    if (email.length > 254 || !emailPattern.test(email)) {
      return response.status(400).json({ message: "Enter a valid email address." });
    }
    if (password.length < 8 || password.length > 128) {
      return response.status(400).json({ message: "Password must be 8 to 128 characters." });
    }
    const user = {
      id: randomUUID(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    };

    if (!(await addUser(user))) {
      return response.status(409).json({ message: "An account with this email already exists." });
    }

    return createSession(user, response, 201);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");
    if (email.length > 254 || !emailPattern.test(email)) {
      return response.status(400).json({ message: "Enter a valid email address." });
    }
    if (password.length < 8 || password.length > 128) {
      return response.status(400).json({ message: "Password must be 8 to 128 characters." });
    }

    const user = users.find((item) => item.email === email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ message: "Email or password is incorrect." });
    }

    return createSession(user, response);
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/me", (request, response) => {
  const user = getSessionUser(request);
  if (!user) return response.status(401).json({ message: "Session is invalid or expired." });
  return response.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (request, response) => {
  const sessionId = (request.get("cookie") || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${sessionCookie}=`))
    ?.slice(sessionCookie.length + 1);
  if (sessionId) sessions.delete(sessionId);
  response.clearCookie(sessionCookie, { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/" });
  return response.json({ message: "Signed out." });
});

app.use("/api", (request, response) => {
  response.status(404).json({ message: "API endpoint not found." });
});

app.use((request, response, next) => {
  if (isProduction && request.method === "GET") {
    return response.sendFile(join(buildDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  }

  return next();
});

app.use((error, request, response, next) => {
  console.error(error);
  if (response.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  const message = error.type === "entity.parse.failed"
    ? "Request body must be valid JSON."
    : error.type === "entity.too.large"
      ? "Request body is too large."
      : "Something went wrong. Please try again.";
  return response.status(status).json({ message });
});

async function startServer() {
  await mkdir(dirname(usersFile), { recursive: true });

  try {
    users = JSON.parse(await readFile(usersFile, "utf8"));
    if (!Array.isArray(users)) {
      throw new Error("The auth data file must contain a JSON array.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (isProduction) {
    await readFile(join(buildDirectory, "index.html"));
  }

  app.listen(port, host, () => {
    const displayHost = host === "0.0.0.0" ? "localhost" : host;
    console.log(`TaskFlow server listening on http://${displayHost}:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Could not start the auth API:", error);
  process.exitCode = 1;
});