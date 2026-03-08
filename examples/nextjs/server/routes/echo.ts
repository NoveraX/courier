import { Router } from "express";

const router = Router();

router.all("/", (req, res) => {
  res.json({
    method: req.method,
    url: req.originalUrl,
    contentType: req.headers["content-type"] || null,
    body: req.body ?? null,
    query: req.query,
    rawQuery: req.originalUrl.includes("?") ? req.originalUrl.split("?")[1] : null,
  });
});

export default router;
