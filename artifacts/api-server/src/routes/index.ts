import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import comparisonsRouter from "./comparisons";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(comparisonsRouter);
router.use(chatRouter);

export default router;
