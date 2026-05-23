const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Op } = require("sequelize");
const uploadImage = require("../middlewares/uploads");
const { User, UserDevice, Favorite, Order, RestaurantProfile, DeliveryProfile } = require("../models");
const { createOtp, deleteOtpByCode, normalizePhone, verifyOtp } = require("../services/otpService");
const { ensureWhatsAppReady, sendWhatsAppText } = require("../services/waSender");

const saltRounds = 10;
const router = express.Router();
const upload = multer();

const OTP_PURPOSES = {
  activation: "activation",
  passwordReset: "password_reset",
};

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "700d" }
  );

function parseOtpPurpose(purpose) {
  return purpose === OTP_PURPOSES.passwordReset
    ? OTP_PURPOSES.passwordReset
    : OTP_PURPOSES.activation;
}

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === "1" || value === 1;
}

function publicUser(user) {
  if (!user) return null;
  const json = user.toJSON ? user.toJSON() : user;
  delete json.password;
  return json;
}

function getUploadedFile(req, fieldName, fallbackIndex = 0) {
  if (Array.isArray(req.files)) return req.files[fallbackIndex]?.filename || null;
  return req.files?.[fieldName]?.[0]?.filename || req.files?.images?.[fallbackIndex]?.filename || null;
}

async function sendOtpForPurpose(phone, purpose) {
  await ensureWhatsAppReady();
  const otp = await createOtp(phone, purpose);

  const purposeLabel =
    purpose === OTP_PURPOSES.passwordReset
      ? "إعادة تعيين كلمة المرور"
      : "تفعيل الحساب";

  const message = [
    `رمز ${purposeLabel} الخاص بك هو: ${otp.code}`,
    `صالح لمدة ${Math.floor(otp.expiresInSeconds / 60)} دقائق.`,
    "لا تشارك هذا الرمز مع أي شخص.",
  ].join("\n");

  try {
    await sendWhatsAppText(otp.phone, message);
    return otp;
  } catch (error) {
    await deleteOtpByCode(otp.phone, otp.code, purpose);
    throw error;
  }
}

router.post("/send-otp", upload.none(), async (req, res) => {
  try {
    const purpose = parseOtpPurpose(req.body.purpose);
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (purpose === OTP_PURPOSES.activation && user.isVerified) {
      return res.status(400).json({ error: "Account is already verified" });
    }

    const otp = await sendOtpForPurpose(phone, purpose);

    return res.status(200).json({
      success: true,
      phone: otp.phone,
      purpose,
      expiresInSeconds: otp.expiresInSeconds,
      retryAfterSeconds: otp.retryAfterSeconds,
      message: "OTP sent successfully",
    });
  } catch (error) {
    if (error.response?.data) {
      console.error("Error sending OTP:", error.response.data);
    } else {
      console.error("Error sending OTP:", error.message);
    }
    return res.status(400).json({ error: error.message || "Failed to send OTP" });
  }
});

router.post("/verify-otp", upload.none(), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.code || "").trim();
    const purpose = parseOtpPurpose(req.body.purpose);

    if (!phone || !code) {
      return res.status(400).json({ error: "phone and code are required" });
    }

    await verifyOtp(phone, code, purpose);

    if (purpose === OTP_PURPOSES.activation) {
      const user = await User.findOne({ where: { phone } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      user.isVerified = true;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      purpose,
      message:
        purpose === OTP_PURPOSES.activation
          ? "Account verified successfully"
          : "OTP verified successfully",
    });
  } catch (error) {
    console.error("Error verifying OTP:", error.message || error);
    return res.status(400).json({ error: error.message || "Failed to verify OTP" });
  }
});

router.post("/forgot-password/request", upload.none(), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: "Phone number is not registered" });
    }

    const otp = await sendOtpForPurpose(phone, OTP_PURPOSES.passwordReset);

    return res.status(200).json({
      success: true,
      phone: otp.phone,
      expiresInSeconds: otp.expiresInSeconds,
      retryAfterSeconds: otp.retryAfterSeconds,
      message: "Password reset OTP sent successfully",
    });
  } catch (error) {
    console.error("Forgot password request error:", error.message || error);
    return res.status(400).json({ error: error.message || "Failed to send reset OTP" });
  }
});

router.post("/forgot-password/reset", upload.none(), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.code || "").trim();
    const password = String(req.body.password || "").trim();

    if (!phone || !code || !password) {
      return res.status(400).json({ error: "phone, code and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    await verifyOtp(phone, code, OTP_PURPOSES.passwordReset);

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.password = await bcrypt.hash(password, saltRounds);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Forgot password reset error:", error.message || error);
    return res.status(400).json({ error: error.message || "Failed to reset password" });
  }
});

router.post("/users", uploadImage.array("images", 5), async (req, res) => {
  const { name, password } = req.body;
  let { phone } = req.body;

  try {
    phone = normalizePhone(phone);

    if (!name || !phone || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) {
      return res.status(400).json({ error: "Phone number is already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const images =
      req.files && Array.isArray(req.files)
        ? req.files.map((file) => file.filename)
        : [];

    const user = await User.create({
      name,
      phone,
      password: hashedPassword,
      role: "user",
      isVerified: false,
      image: images.length > 0 ? images[0] : null,
    });

    return res.status(201).json({
      id: user.id,
      image: user.image,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    console.error("Error creating user:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/admins", uploadImage.array("images", 5), async (req, res) => {
  const { name, password } = req.body;
  let { phone } = req.body;

  try {
    phone = normalizePhone(phone);

    if (!name || !phone || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) {
      return res.status(400).json({ error: "Phone number is already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const images =
      req.files && Array.isArray(req.files)
        ? req.files.map((file) => file.filename)
        : [];

    const admin = await User.create({
      name,
      phone,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      image: images.length > 0 ? images[0] : null,
    });

    return res.status(201).json({
      id: admin.id,
      image: admin.image,
      name: admin.name,
      phone: admin.phone,
      role: admin.role,
      isVerified: admin.isVerified,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
  } catch (err) {
    console.error("Error creating admin:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post(
  "/admin/users",
  uploadImage.fields([
    { name: "images", maxCount: 2 },
    { name: "logo", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "licenseImage", maxCount: 1 },
  ]),
  async (req, res) => {
  const { name, password, role = "user" } = req.body;
  let { phone } = req.body;

  try {
    phone = normalizePhone(phone);

    if (!["user", "admin", "restaurant", "delivery"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    if (!name || !phone || !password) {
      return res.status(400).json({ error: "name, phone and password are required" });
    }

    const logo = getUploadedFile(req, "logo", 0) || req.body.logo || null;
    if (role === "restaurant" && !logo) {
      return res.status(400).json({ error: "Restaurant logo image is required" });
    }

    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) {
      return res.status(400).json({ error: "Phone number is already in use" });
    }

    const user = await User.create({
      name,
      phone,
      password: await bcrypt.hash(password, saltRounds),
      role,
      isVerified: true,
      image: role === "restaurant" ? logo : getUploadedFile(req, "image", 0),
    });

    let profile = null;

    if (role === "restaurant") {
      profile = await RestaurantProfile.create({
        userId: user.id,
        logo,
        coverImage: getUploadedFile(req, "coverImage", 1) || req.body.coverImage || null,
        description: req.body.description || null,
        address: req.body.address || null,
        area: req.body.area || null,
        latitude: toNumber(req.body.latitude),
        longitude: toNumber(req.body.longitude),
        cuisineTypes: parseJson(req.body.cuisineTypes, []),
        deliveryTimeMin: toNumber(req.body.deliveryTimeMin),
        deliveryTimeMax: toNumber(req.body.deliveryTimeMax),
        deliveryFee: toNumber(req.body.deliveryFee, 0),
        minimumOrder: toNumber(req.body.minimumOrder, 0),
        discountPercent: toNumber(req.body.discountPercent, 0),
        discountMinOrder: toNumber(req.body.discountMinOrder, 0),
        isOpen: toBool(req.body.isOpen, true),
        openingTime: req.body.openingTime || null,
        closingTime: req.body.closingTime || null,
        isFeatured: toBool(req.body.isFeatured, false),
        freeDelivery: toBool(req.body.freeDelivery, false),
        status: req.body.status || "active",
      });
    }

    if (role === "delivery") {
      profile = await DeliveryProfile.create({
        userId: user.id,
        restaurantId: toNumber(req.body.restaurantId),
        vehicleType: req.body.vehicleType || null,
        vehicleNumber: req.body.vehicleNumber || null,
        nationalId: req.body.nationalId || null,
        licenseImage: getUploadedFile(req, "licenseImage", 1) || req.body.licenseImage || null,
        currentLatitude: toNumber(req.body.currentLatitude),
        currentLongitude: toNumber(req.body.currentLongitude),
        isAvailable: toBool(req.body.isAvailable, false),
        status: req.body.status || "active",
      });
    }

    return res.status(201).json({
      user: publicUser(user),
      profile,
    });
  } catch (err) {
    console.error("Admin create user error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/login", upload.none(), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password are required" });
    }

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        error: "Your account is not verified yet",
        code: "ACCOUNT_NOT_VERIFIED",
        phone: user.phone,
        isVerified: false,
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        isVerified: user.isVerified,
        role: user.role,
        location: user.location,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByPk(id, {
      include: { model: UserDevice, as: "devices" },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await user.destroy();

    return res.status(200).json({ message: "User and devices deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err);
    return res.status(500).json({ error: "Delete failed" });
  }
});

router.get("/verify-token", (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.json({ valid: false, message: "Token is missing" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.json({ valid: false, message: "Invalid token" });
    }
    return res.json({ valid: true, data: decoded });
  });
});

router.get("/usersOnly", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      where: { role: "user" },
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      users,
      pagination: {
        totalUsers: count,
        currentPage: page,
        totalPages,
        limit,
      },
    });
  } catch (err) {
    console.error("Error fetching users with pagination:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/user/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.status(200).json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/profile", async (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: "Token is missing" });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid token" });
    }

    try {
      const user = await User.findByPk(decoded.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const [ordersCount, favoritesCount] = await Promise.all([
        Order.count({ where: { userId: decoded.id } }),
        Favorite.count({ where: { userId: decoded.id } }),
      ]);

      return res.status(200).json({
        ...user.toJSON(),
        ordersCount,
        favoritesCount,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

module.exports = router;
