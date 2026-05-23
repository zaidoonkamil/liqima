const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const {
  getQrCode,
  getStatus,
  initWhatsAppClient,
  logoutWhatsApp,
  sendWhatsAppText,
} = require("../services/waSender");

const router = express.Router();
const upload = multer();

function getRawToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader) return null;
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return authHeader;
}

function authenticateAdmin(req, res, next) {
  const token = getRawToken(req);

  if (!token) {
    return res.status(401).json({ error: "Token not provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Only admin can use WhatsApp service" });
    }
    req.user = user;
    next();
  });
}

router.post("/whatsapp/init", authenticateAdmin, async (req, res) => {
  try {
    const status = await initWhatsAppClient();
    return res.status(200).json({ success: true, ...status });
  } catch (error) {
    console.error("WhatsApp init error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/whatsapp/status", authenticateAdmin, async (req, res) => {
  return res.status(200).json({ success: true, ...getStatus() });
});

router.get("/whatsapp/qr", authenticateAdmin, async (req, res) => {
  try {
    const qr = await getQrCode();
    return res.status(200).json({ success: true, ...qr });
  } catch (error) {
    console.error("WhatsApp QR error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

router.post("/whatsapp/logout", authenticateAdmin, async (req, res) => {
  try {
    const result = await logoutWhatsApp();
    return res.status(200).json(result);
  } catch (error) {
    console.error("WhatsApp logout error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

router.post("/whatsapp/send", authenticateAdmin, upload.none(), async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: "phone and message are required" });
    }

    const result = await sendWhatsAppText(phone, message);

    return res.status(200).json({
      success: true,
      phone: result.to,
      messageId: result.messageId,
      timestamp: result.timestamp,
      status: result.status,
    });
  } catch (error) {
    console.error("WhatsApp send error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
