const express = require("express");
const sequelize = require("../config/db");
const {
  User,
  UserAddress,
  UserRating,
  Order,
  Favorite,
  RestaurantFavorite,
  CouponUsage,
} = require("../models");

const router = express.Router();
const ADDRESS_TYPES = ["home", "work", "other"];

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseAddressType(type) {
  return ADDRESS_TYPES.includes(type) ? type : null;
}

function publicUser(user) {
  const json = user.toJSON ? user.toJSON() : user;
  delete json.password;
  return json;
}

async function refreshUserRating(userId, transaction = null) {
  const stats = await UserRating.findOne({
    where: { userId },
    attributes: [
      [sequelize.fn("AVG", sequelize.col("rating")), "averageRating"],
      [sequelize.fn("COUNT", sequelize.col("id")), "ratingsCount"],
    ],
    raw: true,
    transaction,
  });

  const rating = Number(stats?.averageRating || 0);
  const ratingsCount = Number(stats?.ratingsCount || 0);

  await User.update(
    {
      rating: Number(rating.toFixed(1)),
      ratingsCount,
    },
    { where: { id: userId }, transaction }
  );

  return { rating: Number(rating.toFixed(1)), ratingsCount };
}

router.get("/users/:id/info", async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ["password"] },
      include: [{ model: UserAddress, as: "addresses" }],
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const [ordersCount, productFavoritesCount, restaurantFavoritesCount, couponsCount] = await Promise.all([
      Order.count({ where: { userId: user.id } }),
      Favorite.count({ where: { userId: user.id } }),
      RestaurantFavorite.count({ where: { userId: user.id } }),
      CouponUsage.count({ where: { userId: user.id } }),
    ]);

    return res.json({
      user: publicUser(user),
      stats: {
        rating: user.rating,
        ratingsCount: user.ratingsCount,
        ordersCount,
        favoritesCount: productFavoritesCount + restaurantFavoritesCount,
        productFavoritesCount,
        restaurantFavoritesCount,
        couponsCount,
        points: user.points,
        walletBalance: user.walletBalance,
      },
      addresses: user.addresses || [],
    });
  } catch (error) {
    console.error("User info error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users/:id/rating", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = toNumber(req.params.id);
    const ratedByUserId = toNumber(req.body.ratedByUserId);
    const rating = toNumber(req.body.rating);

    if (!userId || !ratedByUserId || rating === null) {
      await transaction.rollback();
      return res.status(400).json({ error: "ratedByUserId and rating are required" });
    }

    if (rating < 1 || rating > 5) {
      await transaction.rollback();
      return res.status(400).json({ error: "rating must be between 1 and 5" });
    }

    if (userId === ratedByUserId) {
      await transaction.rollback();
      return res.status(400).json({ error: "User cannot rate himself" });
    }

    const [user, ratedBy] = await Promise.all([
      User.findByPk(userId, { transaction }),
      User.findByPk(ratedByUserId, { transaction }),
    ]);

    if (!user || !ratedBy) {
      await transaction.rollback();
      return res.status(404).json({ error: "User not found" });
    }

    const [userRating, created] = await UserRating.findOrCreate({
      where: { userId, ratedByUserId },
      defaults: {
        rating,
        comment: req.body.comment || null,
      },
      transaction,
    });

    if (!created) {
      userRating.rating = rating;
      userRating.comment = req.body.comment || null;
      await userRating.save({ transaction });
    }

    const ratingStats = await refreshUserRating(userId, transaction);
    await transaction.commit();

    return res.status(created ? 201 : 200).json({
      rating: userRating,
      userRating: ratingStats,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Rate user error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users/:userId/addresses", async (req, res) => {
  try {
    const addresses = await UserAddress.findAll({
      where: { userId: req.params.userId },
      order: [["isDefault", "DESC"], ["createdAt", "DESC"]],
    });

    return res.json({ types: ADDRESS_TYPES, addresses });
  } catch (error) {
    console.error("User addresses error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users/:userId/addresses", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = toNumber(req.params.userId);
    const type = parseAddressType(req.body.type);
    const addressText = String(req.body.addressText || "").trim();

    if (!userId || !type || !addressText) {
      await transaction.rollback();
      return res.status(400).json({
        error: "userId, type and addressText are required",
        allowedTypes: ADDRESS_TYPES,
      });
    }

    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: "User not found" });
    }

    const existingCount = await UserAddress.count({ where: { userId }, transaction });
    const isDefault = req.body.isDefault === true || req.body.isDefault === "true" || existingCount === 0;

    if (isDefault) {
      await UserAddress.update({ isDefault: false }, { where: { userId }, transaction });
    }

    const address = await UserAddress.create({
      userId,
      type,
      title: req.body.title || null,
      addressText,
      details: req.body.details || null,
      latitude: toNumber(req.body.latitude),
      longitude: toNumber(req.body.longitude),
      isDefault,
    }, { transaction });

    await transaction.commit();
    return res.status(201).json(address);
  } catch (error) {
    await transaction.rollback();
    console.error("Create address error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/users/:userId/addresses/:id", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = toNumber(req.params.userId);
    const address = await UserAddress.findOne({
      where: { id: req.params.id, userId },
      transaction,
    });

    if (!address) {
      await transaction.rollback();
      return res.status(404).json({ error: "Address not found" });
    }

    if (req.body.type !== undefined) {
      const type = parseAddressType(req.body.type);
      if (!type) {
        await transaction.rollback();
        return res.status(400).json({ error: "Invalid address type", allowedTypes: ADDRESS_TYPES });
      }
      address.type = type;
    }

    if (req.body.title !== undefined) address.title = req.body.title || null;
    if (req.body.addressText !== undefined) address.addressText = String(req.body.addressText || "").trim();
    if (req.body.details !== undefined) address.details = req.body.details || null;
    if (req.body.latitude !== undefined) address.latitude = toNumber(req.body.latitude);
    if (req.body.longitude !== undefined) address.longitude = toNumber(req.body.longitude);

    const shouldBeDefault = req.body.isDefault === true || req.body.isDefault === "true";
    if (shouldBeDefault) {
      await UserAddress.update({ isDefault: false }, { where: { userId }, transaction });
      address.isDefault = true;
    }

    if (!address.addressText) {
      await transaction.rollback();
      return res.status(400).json({ error: "addressText is required" });
    }

    await address.save({ transaction });
    await transaction.commit();

    return res.json(address);
  } catch (error) {
    await transaction.rollback();
    console.error("Update address error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:userId/addresses/:id", async (req, res) => {
  try {
    const deleted = await UserAddress.destroy({
      where: { id: req.params.id, userId: req.params.userId },
    });

    if (!deleted) return res.status(404).json({ error: "Address not found" });
    return res.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Delete address error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
