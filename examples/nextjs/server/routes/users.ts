import { Router } from "express";
import { getNextUserId, users } from "../data.js";

const router = Router();

router.get("/", (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const search = (req.query.search as string) || "";

  let items = [...users.values()];

  if (search) {
    const lower = search.toLowerCase();
    items = items.filter(
      (u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower),
    );
  }

  const total = items.length;
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);

  res.json({ data, total, page, limit });
});

router.get("/:id", (req, res) => {
  const user = users.get(Number(req.params.id));
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  res.json(user);
});

router.post("/", (req, res) => {
  const { name, email, role = "user" } = req.body;
  if (!name || !email) {
    res.status(400).json({ success: false, message: "name and email are required" });
    return;
  }

  const id = getNextUserId();
  const user = { id, name, email, role, createdAt: new Date().toISOString() };
  users.set(id, user);
  res.status(201).json(user);
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = users.get(id);
  if (!existing) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }

  const { name, email, role } = req.body;
  const updated = { ...existing, name, email, role };
  users.set(id, updated);
  res.json(updated);
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = users.get(id);
  if (!existing) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }

  const updated = { ...existing, ...req.body };
  users.set(id, updated);
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!users.has(id)) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  users.delete(id);
  res.status(204).send();
});

export default router;
