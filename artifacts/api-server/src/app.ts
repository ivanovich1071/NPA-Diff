import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/errorHandler";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Base64 encoding inflates raw bytes by ~37%; the JSON body limit must cover
// the 50MB max document size (see MAX_RESPONSE_BYTES in documents.ts) plus
// envelope overhead, so both upload and URL-fetch ingestion paths share one
// consistent effective document size cap.
app.use(express.json({ limit: "70mb" }));
app.use(express.urlencoded({ extended: true, limit: "70mb" }));

app.use("/api", router);
app.use(errorHandler);

export default app;
