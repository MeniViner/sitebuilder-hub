import { Router } from "express";
import { bootstrapStatus, loginByPersonalNumber, whoAmI } from "../controllers/auth.controller";

const router = Router();

router.get("/bootstrap-status", bootstrapStatus);
router.post("/login-personal-number", loginByPersonalNumber);
router.get("/me", whoAmI);

export default router;
