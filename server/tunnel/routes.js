import { Router } from "express";
import { getStatus, startTunnel, stopTunnel } from "./service.js";

export const tunnelRouter = Router();

tunnelRouter.get("/status", (req, res) => {
  res.json(getStatus());
});

tunnelRouter.post("/start", (req, res) => {
  res.json(startTunnel());
});

tunnelRouter.post("/stop", (req, res) => {
  res.json(stopTunnel());
});
