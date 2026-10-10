import bcrypt from "bcryptjs";
import express from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const app = express();
const port = Number(process.env.PORT) || 3001;
const usersFile = process.env.AUTH_DATA_FILE || join(dirname(fileURLToPath(import.meta.url)), "data", "users.json");
const jwtSecret = process.env.JWT_SECRET || "taskflow-local-development-secret-change-before-deploy";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production.");
}

app.use(express.json({ limit: "10kb" }));

let users = [];

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function createSession(user, response, status = 200) {
  const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: "7d" });
  response.status(status).json({ token, user: publicUser(user) });
}

app.post("/api/auth/signup", async (request, response, next) => {
  try {
    const name = String(request.body?.name || "").trim();
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");

    if (name.length < 1 || name.length > 80) {
      return response.status(400).json({ message: "Enter a name up to 80 characters." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response.status(400).json({ message: "Enter a valid email address." });
    }
    if (password.length < 8 || password.length > 128) {
      return response.status(400).json({ message: "Password must be 8 to 128 characters." });
    }
    if (users.some((user) => user.email === email)) {
      return response.status(409).json({ message: "An account with this email already exists." });
    }

    const user = {
      id: randomUUID(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    };
    users.push(user);
    await writeFile(usersFile, JSON.stringify(users, null, 2));
    return createSession(user, response, 201);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");
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
  const authorization = request.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = users.find((item) => item.id === payload.sub);

    if (!user) {
      return response.status(401).json({ message: "Session is no longer valid." });
    }

    return response.json({ user: publicUser(user) });
  } catch {
    return response.status(401).json({ message: "Session is invalid or expired." });
  }
});

app.use((error, request, response, next) => {
  console.error(error);
  if (response.headersSent) return next(error);
  return response.status(500).json({ message: "Something went wrong. Please try again." });
});

async function startServer() {
  await mkdir(dirname(usersFile), { recursive: true });

  try {
    users = JSON.parse(await readFile(usersFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  app.listen(port, "127.0.0.1", () => {
    console.log(`TaskFlow auth API listening on http://127.0.0.1:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Could not start the auth API:", error);
  process.exitCode = 1;
});