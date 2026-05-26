const express = require("express");
const { Op } = require("sequelize");
const {
  User,
  Category,
  Product,
  ProductAddon,
  RestaurantProfile,
  SearchHistory,
} = require("../models");

const router = express.Router();

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === "1" || value === 1;
}

function getProductPrice(product) {
  return toNumber(product.discountPrice, null) ?? toNumber(product.price, 0);
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((value) => value === null || value === undefined)) return null;
  const toRad = (value) => (value * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function productInclude() {
  return [
    { model: Category, as: "category" },
    { model: ProductAddon, as: "addons" },
    {
      model: User,
      as: "seller",
      attributes: { exclude: ["password"] },
      include: [{ model: RestaurantProfile, as: "restaurantProfile" }],
    },
  ];
}

function restaurantInclude(profileWhere = {}) {
  return [{ model: RestaurantProfile, as: "restaurantProfile", where: profileWhere }];
}

async function rememberSearch(userId, query, type) {
  const cleanQuery = String(query || "").trim();
  if (!userId || !cleanQuery) return;

  const [record, created] = await SearchHistory.findOrCreate({
    where: { userId, query: cleanQuery },
    defaults: { userId, query: cleanQuery, type },
  });

  if (!created) {
    record.type = type;
    record.changed("updatedAt", true);
    await record.save();
  }
}

function sortProducts(products, sort) {
  const sorted = [...products];
  if (sort === "price_asc") sorted.sort((a, b) => getProductPrice(a) - getProductPrice(b));
  if (sort === "price_desc") sorted.sort((a, b) => getProductPrice(b) - getProductPrice(a));
  if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating);
  if (sort === "newest") sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sorted;
}

function sortRestaurants(restaurants, sort, lat, lng) {
  const sorted = restaurants.map((restaurant) => {
    const profile = restaurant.restaurantProfile;
    const distanceKm = getDistanceKm(
      toNumber(lat),
      toNumber(lng),
      toNumber(profile?.latitude),
      toNumber(profile?.longitude)
    );
    const json = restaurant.toJSON ? restaurant.toJSON() : restaurant;
    return { ...json, distanceKm };
  });

  if (sort === "rating") sorted.sort((a, b) => b.restaurantProfile.rating - a.restaurantProfile.rating);
  if (sort === "delivery_time") {
    sorted.sort((a, b) => (a.restaurantProfile.deliveryTimeMin || 9999) - (b.restaurantProfile.deliveryTimeMin || 9999));
  }
  if (sort === "nearest") {
    sorted.sort((a, b) => (a.distanceKm ?? 999999) - (b.distanceKm ?? 999999));
  }
  if (sort === "minimum_order") {
    sorted.sort((a, b) => (a.restaurantProfile.minimumOrder || 0) - (b.restaurantProfile.minimumOrder || 0));
  }
  if (sort === "newest") sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sorted;
}

router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const type = ["products", "restaurants"].includes(req.query.type) ? req.query.type : "all";
    const sort = req.query.sort || "newest";
    const limit = Math.max(toNumber(req.query.limit, 20), 1);
    const userId = toNumber(req.query.userId);

    if (req.query.remember !== "false") {
      await rememberSearch(userId, q, type);
    }

    const productWhere = { isAvailable: true };
    if (q) {
      productWhere[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } },
      ];
    }
    if (req.query.categoryId) productWhere.categoryId = req.query.categoryId;
    if (req.query.restaurantId) productWhere.userId = req.query.restaurantId;
    if (req.query.popular !== undefined) productWhere.isPopular = toBool(req.query.popular, true);

    const minPrice = toNumber(req.query.minPrice);
    const maxPrice = toNumber(req.query.maxPrice);
    const minRating = toNumber(req.query.minRating);

    const restaurantWhere = { role: "restaurant", isVerified: true };
    if (q) restaurantWhere.name = { [Op.like]: `%${q}%` };

    const profileWhere = {};
    if (req.query.freeDelivery !== undefined) profileWhere.freeDelivery = toBool(req.query.freeDelivery, true);
    if (req.query.isOpen !== undefined) profileWhere.isOpen = toBool(req.query.isOpen, true);
    if (minRating !== null) profileWhere.rating = { [Op.gte]: minRating };

    const [rawProducts, rawRestaurants] = await Promise.all([
      type === "restaurants"
        ? Promise.resolve([])
        : Product.findAll({ where: productWhere, include: productInclude(), order: [["createdAt", "DESC"]] }),
      type === "products"
        ? Promise.resolve([])
        : User.findAll({
            where: restaurantWhere,
            attributes: { exclude: ["password"] },
            include: restaurantInclude(profileWhere),
            order: [["createdAt", "DESC"]],
          }),
    ]);

    let products = rawProducts.filter((product) => {
      const price = getProductPrice(product);
      if (minPrice !== null && price < minPrice) return false;
      if (maxPrice !== null && price > maxPrice) return false;
      if (minRating !== null && product.rating < minRating) return false;
      if (req.query.freeDelivery !== undefined) {
        const freeDelivery = Boolean(product.seller?.restaurantProfile?.freeDelivery);
        if (freeDelivery !== toBool(req.query.freeDelivery, true)) return false;
      }
      if (req.query.isOpen !== undefined) {
        const isOpen = Boolean(product.seller?.restaurantProfile?.isOpen);
        if (isOpen !== toBool(req.query.isOpen, true)) return false;
      }
      return true;
    });

    products = sortProducts(products, sort).slice(0, limit);
    const restaurants = sortRestaurants(rawRestaurants, sort, req.query.latitude, req.query.longitude).slice(0, limit);

    return res.json({
      query: q,
      filters: {
        type,
        categoryId: req.query.categoryId || null,
        restaurantId: req.query.restaurantId || null,
        minPrice,
        maxPrice,
        minRating,
        freeDelivery: req.query.freeDelivery ?? null,
        isOpen: req.query.isOpen ?? null,
        sort,
      },
      products,
      restaurants,
      counts: {
        products: products.length,
        restaurants: restaurants.length,
        total: products.length + restaurants.length,
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/search/suggestions", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const where = q ? { name: { [Op.like]: `%${q}%` } } : {};

    const categoryWhere = {
      ...where,
      isActive: true,
      showInSearchSuggestions: true,
      restaurantId: null,
    };

    const [products, restaurants, categories] = await Promise.all([
      Product.findAll({ where: { ...where, isAvailable: true }, attributes: ["id", "name"], limit: 8 }),
      User.findAll({ where: { ...where, role: "restaurant" }, attributes: ["id", "name"], limit: 8 }),
      Category.findAll({
        where: categoryWhere,
        attributes: ["id", "name", "type", "image"],
        order: [["sortOrder", "ASC"], ["createdAt", "DESC"]],
        limit: 12,
      }),
    ]);

    return res.json({ products, restaurants, categories });
  } catch (error) {
    console.error("Search suggestions error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users/:userId/search-history", async (req, res) => {
  try {
    const history = await SearchHistory.findAll({
      where: { userId: req.params.userId },
      order: [["updatedAt", "DESC"]],
      limit: Math.max(toNumber(req.query.limit, 10), 1),
    });

    return res.json(history);
  } catch (error) {
    console.error("Search history error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users/:userId/search-history", async (req, res) => {
  try {
    await rememberSearch(req.params.userId, req.body.query, req.body.type || "all");
    const history = await SearchHistory.findAll({
      where: { userId: req.params.userId },
      order: [["updatedAt", "DESC"]],
      limit: 10,
    });

    return res.status(201).json(history);
  } catch (error) {
    console.error("Save search history error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:userId/search-history", async (req, res) => {
  try {
    const where = { userId: req.params.userId };
    if (req.query.id) where.id = req.query.id;
    if (req.query.query) where.query = req.query.query;

    await SearchHistory.destroy({ where });
    return res.json({ message: "Search history cleared successfully" });
  } catch (error) {
    console.error("Clear search history error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
