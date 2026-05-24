const express = require("express");
const jwt = require("jsonwebtoken");
const Ads = require("../models/ads");
const upload = require("../middlewares/uploads");

const router = express.Router();

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!token) return res.status(401).json({ error: "Admin token is required" });

  jwt.verify(token, process.env.JWT_SECRET, (error, user) => {
    if (error) return res.status(403).json({ error: "Invalid admin token" });
    if (user.role !== "admin") return res.status(403).json({ error: "Admin only" });
    req.user = user;
    return next();
  });
}

router.post("/ads", authenticateAdmin, upload.array("images", 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Image is required" });
    }

    const images = req.files.map((file) => file.filename);
    const ads = await Ads.create({ images });

    return res.status(201).json({ message: "Ad created successfully", ads });
  } catch (err) {
    console.error("Error creating ad:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/ads", async (req, res) => {
  try {
    const ads = await Ads.findAll({ order: [["createdAt", "DESC"]] });
    return res.json(ads);
  } catch (err) {
    console.error("Error fetching ads:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/ads/:id", authenticateAdmin, async (req, res) => {
  try {
    const ad = await Ads.findByPk(req.params.id);
    if (!ad) return res.status(404).json({ error: "Ad not found" });

    await ad.destroy();
    return res.status(200).json({ message: "Ad deleted successfully" });
  } catch (err) {
    console.error("Error deleting ad:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
