// HTTP tests against a real (in-memory) MongoDB. requireAuth is replaced by an
// x-test-user header so tests can act as different writers.
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import worksRouter from '../../src/routes/works.js';
import threadsRouter from '../../src/routes/threads.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

export async function startDb() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  return async () => {
    await mongoose.disconnect();
    await mongod.stop();
  };
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: req.get('x-test-user') || 'user_a' };
    next();
  });
  app.use('/api/works', worksRouter);
  app.use('/api/works/:workId/threads', threadsRouter);
  app.use(errorHandler);
  return app;
}
