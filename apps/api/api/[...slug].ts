import { handle } from "hono/vercel";
import { createApp } from "../src/app";

// Catch-all for every /api/* request (Vercel zero-config TS function).
export default handle(createApp());
