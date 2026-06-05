import { MongoClient, type Db } from "mongodb";
import { env } from "../config/env.js";

const DISTINCT_USERS_LOG =
  "[mongo] source user and analytics user are distinct; source DB is read-only and analytics DB is write target";
const LOCAL_UNAUTHENTICATED_LOG =
  "[mongo] local unauthenticated Mongo allowed; source and analytics databases are distinct";

let client: MongoClient | null = null;
let db: Db | null = null;
let distinctUsersLogged = false;

function usernameFromMongoUri(uri: string, label: string): string | null {
  if (!uri.trim()) {
    throw new Error(`${label} Mongo URI is required when ANALYTICS_STORE=mongo.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`${label} Mongo URI is not a valid URI.`);
  }

  return decodeURIComponent(parsed.username.trim()) || null;
}

function allowUnauthenticatedMongo(): boolean {
  return env.NODE_ENV !== "production" && env.ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO;
}

export function assertDistinctMongoUsers(): void {
  if (env.ANALYTICS_STORE !== "mongo") {
    return;
  }

  const sourceUser = usernameFromMongoUri(env.LUMEX_MONGO_URI, "LUMEX_MONGO_URI");
  const analyticsUser = usernameFromMongoUri(env.ANALYTICS_MONGO_URI, "ANALYTICS_MONGO_URI");

  if (!sourceUser || !analyticsUser) {
    if (!allowUnauthenticatedMongo()) {
      throw new Error(
        "Mongo URIs must include usernames when ANALYTICS_STORE=mongo. For local no-auth Mongo only, set ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO=true outside production."
      );
    }
    if (sourceUser || analyticsUser) {
      throw new Error(
        "Local unauthenticated Mongo mode expects both source and analytics URIs to omit usernames."
      );
    }
    if (env.LUMEX_MONGO_DATABASE === env.ANALYTICS_MONGO_DATABASE) {
      throw new Error("Source and analytics Mongo database names must be different.");
    }
    if (!distinctUsersLogged) {
      console.log(LOCAL_UNAUTHENTICATED_LOG);
      distinctUsersLogged = true;
    }
    return;
  }

  if (sourceUser === analyticsUser) {
    throw new Error(
      "Source and analytics Mongo URIs resolve to the same username. Use separate read-only source and read-write analytics users."
    );
  }

  if (!distinctUsersLogged) {
    console.log(DISTINCT_USERS_LOG);
    distinctUsersLogged = true;
  }
}

export function hasAnalyticsMongoDatabase(): boolean {
  return env.ANALYTICS_MONGO_URI.trim().length > 0;
}

export async function getMongoDb(): Promise<Db> {
  if (!hasAnalyticsMongoDatabase()) {
    throw new Error("ANALYTICS_MONGO_URI is not configured.");
  }

  assertDistinctMongoUsers();

  if (!client) {
    client = new MongoClient(env.ANALYTICS_MONGO_URI);
    await client.connect();
    db = client.db(env.ANALYTICS_MONGO_DATABASE);
  }

  if (!db) {
    throw new Error("Analytics Mongo database was not initialized.");
  }

  return db;
}

export async function closeMongoClient(): Promise<void> {
  if (!client) {
    return;
  }

  const currentClient = client;
  client = null;
  db = null;
  await currentClient.close();
}
