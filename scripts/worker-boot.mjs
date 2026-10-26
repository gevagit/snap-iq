// Worker threads do not inherit tsx's module hooks; register them, then load the TypeScript worker.
import { register } from 'tsx/esm/api';
import { workerData } from 'node:worker_threads';

register();
await import(workerData.entry);
