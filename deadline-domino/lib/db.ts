// Server-only MongoDB connection. Reuses one client across hot reloads and requests.
import { MongoClient, type Db } from "mongodb";
import type { Availability, Scenario, Task } from "./types";

export interface PlanDoc {
  _id: string; // planId (random, stored in the browser)
  tasks: Task[];
  availability: Availability[];
  scenarios: Scenario[]; // saved what-ifs: name, changes, explanation
  courses?: string[];
  weekTemplate?: number[]; // free hours per weekday, Sun..Sat
  updatedAt: Date;
}

const globalForMongo = globalThis as unknown as { _mongoClient?: Promise<MongoClient> };

export function hasDb() {
  return Boolean(process.env.MONGODB_URI);
}

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!globalForMongo._mongoClient) {
    globalForMongo._mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 }).connect();
    // Don't cache a failed connection forever.
    globalForMongo._mongoClient.catch(() => {
      globalForMongo._mongoClient = undefined;
    });
  }
  const client = await globalForMongo._mongoClient;
  return client.db(process.env.MONGODB_DB ?? "deadline-domino");
}

export async function plans() {
  return (await getDb()).collection<PlanDoc>("plans");
}
