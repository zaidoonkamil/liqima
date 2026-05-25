const express = require("express");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const {
  CouponCategory,
  Coupon,
  CouponUsage,
  User,
  Order,
} = require("../models");

const router = express.Router();
const COUPON_TYPES = ["percentage", "fixed", "free_delivery"];
const COUPON_TARGETS = ["all", "user", "restaurant"];

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === "1" || value === 1;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function couponInclude() {
  return [
    { model: CouponCategory, as: "category" },
    { model: User, as: "targetUser", attributes: { exclude: ["password"] } },
    { model: User, as: "restaurant", attributes: { exclude: ["password"] } },
  ];
}

function isExpired(coupon, now = new Date()) {
  if (!coupon.isActive) return true;
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return true;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return true;
  if (coupon.totalUsageLimit !== null && coupon.totalUsageLimit !== undefined && coupon.usedCount >= coupon.totalUsageLimit) {
    return true;
  }
  return false;
}

function calculateDiscount(coupon, orderTotal, deliveryFee = 0) {
  if (coupon.type === "free_delivery") return Math.max(deliveryFee, 0);

  if (coupon.type === "fixed") {
    return Math.min(coupon.value, orderTotal);
  }

  const discount = orderTotal * (coupon.value / 100);
  return coupon.maxDiscount ? Math.min(discount, coupon.maxDiscount) : discount;
}

async function getCouponValidation({ code, userId, orderTotal, deliveryFee, restaurantId }) {
  const coupon = await Coupon.findOne({
    where: { code: String(code || "").trim().toUpperCase() },
    include: couponInclude(),
  });

  if (!coupon) return { valid: false, error: "Coupon not found" };
  if (isExpired(coupon)) return { valid: false, error: "Coupon is not available", coupon };
  if (orderTotal < coupon.minimumOrder) return { valid: false, error: "Order total is less than coupon minimum", coupon };
  if (coupon.target === "user" && Number(coupon.targetUserId) !== Number(userId)) {
    return { valid: false, error: "Coupon is not available for this user", coupon };
  }
  if (coupon.target === "restaurant" && Number(coupon.restaurantId) !== Number(restaurantId)) {
    return { valid: false, error: "Coupon is not available for this restaurant", coupon };
  }

  if (userId) {
    const userUsageCount = await CouponUsage.count({ where: { couponId: coupon.id, userId } });
    if (userUsageCount >= coupon.perUserLimit) {
      return { valid: false, error: "Coupon usage limit reached", coupon };
    }
  }

  const discountAmount = calculateDiscount(coupon, orderTotal, deliveryFee);
  return { valid: true, coupon, discountAmount };
}

function formatCoupon(coupon, usageCount = 0) {
  const json = coupon.toJSON ? coupon.toJSON() : coupon;
  const expired = isExpired(json);

  return {
    ...json,
    isExpired: expired,
    userUsageCount: usageCount,
    remainingForUser: Math.max((json.perUserLimit || 1) - usageCount, 0),
  };
}

router.post("/coupon-categories", async (req, res) => {
  try {
    const { name, key } = req.body;
    if (!name || !key) return res.status(400).json({ error: "name and key are required" });

    const category = await CouponCategory.create({
      name,
      key: String(key).trim().toLowerCase(),
      description: req.body.description || null,
      color: req.body.color || null,
      icon: req.body.icon || null,
      sortOrder: toNumber(req.body.sortOrder, 0),
      isActive: req.body.isActive === undefined ? true : toBool(req.body.isActive, true),
    });

    return res.status(201).json(category);
  } catch (error) {
    console.error("Create coupon category error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/coupon-categories", async (req, res) => {
  try {
    const categories = await CouponCategory.findAll({
      where: req.query.all === "true" ? {} : { isActive: true },
      include: [{ model: Coupon, as: "coupons" }],
      order: [["sortOrder", "ASC"], ["createdAt", "DESC"]],
    });

    return res.json(categories);
  } catch (error) {
    console.error("Coupon categories error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/coupon-categories/:id", async (req, res) => {
  try {
    const category = await CouponCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: "Coupon category not found" });

    ["name", "description", "color", "icon"].forEach((field) => {
      if (req.body[field] !== undefined) category[field] = req.body[field] || null;
    });
    if (req.body.key !== undefined) category.key = String(req.body.key).trim().toLowerCase();
    if (req.body.sortOrder !== undefined) category.sortOrder = toNumber(req.body.sortOrder, 0);
    if (req.body.isActive !== undefined) category.isActive = toBool(req.body.isActive, true);

    await category.save();
    return res.json(category);
  } catch (error) {
    console.error("Update coupon category error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/coupon-categories/:id", async (req, res) => {
  try {
    const deleted = await CouponCategory.destroy({ where: { id: req.params.id } });
    if (!deleted) return res.status(404).json({ error: "Coupon category not found" });
    return res.json({ message: "Coupon category deleted successfully" });
  } catch (error) {
    console.error("Delete coupon category error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/coupons", async (req, res) => {
  try {
    const code = String(req.body.code || "").trim().toUpperCase();
    const type = req.body.type || "percentage";
    const target = req.body.target || "all";

    if (!code || !req.body.title || !COUPON_TYPES.includes(type) || !COUPON_TARGETS.includes(target)) {
      return res.status(400).json({
        error: "code, title, valid type and valid target are required",
        allowedTypes: COUPON_TYPES,
        allowedTargets: COUPON_TARGETS,
      });
    }

    const coupon = await Coupon.create({
      code,
      couponCategoryId: toNumber(req.body.couponCategoryId),
      title: req.body.title,
      description: req.body.description || null,
      type,
      value: type === "free_delivery" ? 0 : toNumber(req.body.value, 0),
      isActive: req.body.isActive === undefined ? true : toBool(req.body.isActive, true),
      minimumOrder: toNumber(req.body.minimumOrder, 0),
      maxDiscount: toNumber(req.body.maxDiscount),
      totalUsageLimit: toNumber(req.body.totalUsageLimit),
      perUserLimit: toNumber(req.body.perUserLimit, 1),
      startsAt: toDate(req.body.startsAt),
      expiresAt: toDate(req.body.expiresAt),
      target,
      targetUserId: toNumber(req.body.targetUserId),
      restaurantId: toNumber(req.body.restaurantId),
    });

    const createdCoupon = await Coupon.findByPk(coupon.id, { include: couponInclude() });
    return res.status(201).json(createdCoupon);
  } catch (error) {
    console.error("Create coupon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/coupons", async (req, res) => {
  try {
    const where = {};
    if (req.query.categoryId) where.couponCategoryId = req.query.categoryId;
    if (req.query.type) where.type = req.query.type;
    if (req.query.active !== undefined && req.query.active !== "all") {
      where.isActive = toBool(req.query.active, true);
    }

    const coupons = await Coupon.findAll({
      where,
      include: couponInclude(),
      order: [["createdAt", "DESC"]],
    });

    return res.json(coupons.map((coupon) => formatCoupon(coupon)));
  } catch (error) {
    console.error("Coupons error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users/:userId/coupons", async (req, res) => {
  try {
    const userId = toNumber(req.params.userId);
    const now = new Date();

    const coupons = await Coupon.findAll({
      where: {
        [Op.or]: [
          { target: "all" },
          { target: "user", targetUserId: userId },
          { target: "restaurant" },
        ],
      },
      include: couponInclude(),
      order: [["createdAt", "DESC"]],
    });

    const usageRows = await CouponUsage.findAll({
      where: { userId },
      attributes: ["couponId", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
      group: ["couponId"],
      raw: true,
    });

    const usageMap = usageRows.reduce((result, row) => {
      result[row.couponId] = Number(row.count);
      return result;
    }, {});

    const formatted = coupons.map((coupon) => {
      const json = coupon.toJSON();
      const usageCount = usageMap[json.id] || 0;
      const expired = isExpired(json, now) || usageCount >= json.perUserLimit;
      return {
        ...formatCoupon(json, usageCount),
        isExpired: expired,
      };
    });

    const available = formatted.filter((coupon) => !coupon.isExpired);
    const expired = formatted.filter((coupon) => coupon.isExpired);
    const totalSavings = available.reduce((sum, coupon) => {
      if (coupon.type === "fixed") return sum + coupon.value;
      if (coupon.type === "percentage") return sum + (coupon.maxDiscount || 0);
      return sum;
    }, 0);

    return res.json({
      summary: {
        total: formatted.length,
        available: available.length,
        expired: expired.length,
        totalSavings,
      },
      available,
      expired,
    });
  } catch (error) {
    console.error("User coupons error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/coupons/:id", async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id, { include: couponInclude() });
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });
    return res.json(formatCoupon(coupon));
  } catch (error) {
    console.error("Coupon details error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/coupons/:id", async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    if (req.body.type !== undefined && !COUPON_TYPES.includes(req.body.type)) {
      return res.status(400).json({ error: "Invalid coupon type", allowedTypes: COUPON_TYPES });
    }
    if (req.body.target !== undefined && !COUPON_TARGETS.includes(req.body.target)) {
      return res.status(400).json({ error: "Invalid coupon target", allowedTargets: COUPON_TARGETS });
    }

    ["title", "description"].forEach((field) => {
      if (req.body[field] !== undefined) coupon[field] = req.body[field] || null;
    });

    if (req.body.code !== undefined) coupon.code = String(req.body.code).trim().toUpperCase();
    if (req.body.couponCategoryId !== undefined) coupon.couponCategoryId = toNumber(req.body.couponCategoryId);
    if (req.body.type !== undefined) coupon.type = req.body.type;
    if (req.body.value !== undefined) coupon.value = coupon.type === "free_delivery" ? 0 : toNumber(req.body.value, 0);
    if (req.body.isActive !== undefined) coupon.isActive = toBool(req.body.isActive, true);
    if (req.body.minimumOrder !== undefined) coupon.minimumOrder = toNumber(req.body.minimumOrder, 0);
    if (req.body.maxDiscount !== undefined) coupon.maxDiscount = toNumber(req.body.maxDiscount);
    if (req.body.totalUsageLimit !== undefined) coupon.totalUsageLimit = toNumber(req.body.totalUsageLimit);
    if (req.body.perUserLimit !== undefined) coupon.perUserLimit = toNumber(req.body.perUserLimit, 1);
    if (req.body.startsAt !== undefined) coupon.startsAt = toDate(req.body.startsAt);
    if (req.body.expiresAt !== undefined) coupon.expiresAt = toDate(req.body.expiresAt);
    if (req.body.target !== undefined) coupon.target = req.body.target;
    if (req.body.targetUserId !== undefined) coupon.targetUserId = toNumber(req.body.targetUserId);
    if (req.body.restaurantId !== undefined) coupon.restaurantId = toNumber(req.body.restaurantId);

    await coupon.save();

    const updatedCoupon = await Coupon.findByPk(coupon.id, { include: couponInclude() });
    return res.json(updatedCoupon);
  } catch (error) {
    console.error("Update coupon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/coupons/:id", async (req, res) => {
  try {
    const deleted = await Coupon.destroy({ where: { id: req.params.id } });
    if (!deleted) return res.status(404).json({ error: "Coupon not found" });
    return res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Delete coupon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/coupons/validate", async (req, res) => {
  try {
    const validation = await getCouponValidation({
      code: req.body.code,
      userId: toNumber(req.body.userId),
      orderTotal: toNumber(req.body.orderTotal, 0),
      deliveryFee: toNumber(req.body.deliveryFee, 0),
      restaurantId: toNumber(req.body.restaurantId),
    });

    if (!validation.valid) {
      return res.status(400).json(validation);
    }

    return res.json(validation);
  } catch (error) {
    console.error("Validate coupon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/coupons/use", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const validation = await getCouponValidation({
      code: req.body.code,
      userId: toNumber(req.body.userId),
      orderTotal: toNumber(req.body.orderTotal, 0),
      deliveryFee: toNumber(req.body.deliveryFee, 0),
      restaurantId: toNumber(req.body.restaurantId),
    });

    if (!validation.valid) {
      await transaction.rollback();
      return res.status(400).json(validation);
    }

    const orderId = toNumber(req.body.orderId);
    if (orderId) {
      const order = await Order.findByPk(orderId, { transaction });
      if (!order) {
        await transaction.rollback();
        return res.status(404).json({ error: "Order not found" });
      }
    }

    const usage = await CouponUsage.create({
      userId: toNumber(req.body.userId),
      couponId: validation.coupon.id,
      orderId,
      discountAmount: validation.discountAmount,
    }, { transaction });

    await validation.coupon.increment("usedCount", { by: 1, transaction });
    await transaction.commit();

    return res.status(201).json({
      usage,
      coupon: validation.coupon,
      discountAmount: validation.discountAmount,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Use coupon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
