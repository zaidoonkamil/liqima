const express = require("express");
const {
  User,
  Product,
  Category,
  Favorite,
  RestaurantFavorite,
  RestaurantProfile,
  ProductAddon,
} = require("../models");

const router = express.Router();

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function productInclude() {
  return [
    {
      model: Product,
      as: "product",
      include: [
        { model: Category, as: "category" },
        { model: ProductAddon, as: "addons" },
        {
          model: User,
          as: "seller",
          attributes: { exclude: ["password"] },
          include: [{ model: RestaurantProfile, as: "restaurantProfile" }],
        },
      ],
    },
  ];
}

function restaurantInclude() {
  return [
    {
      model: User,
      as: "restaurant",
      attributes: { exclude: ["password"] },
      include: [
        { model: RestaurantProfile, as: "restaurantProfile" },
        {
          model: Product,
          as: "products",
          include: [{ model: Category, as: "category" }],
        },
      ],
    },
  ];
}

async function ensureUser(userId) {
  return User.findByPk(userId);
}

router.get("/users/:userId/favorites", async (req, res) => {
  try {
    const userId = toNumber(req.params.userId);
    const type = req.query.type || "all";

    const user = await ensureUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [productFavoritesCount, restaurantFavoritesCount, productFavorites, restaurantFavorites] = await Promise.all([
      Favorite.count({ where: { userId } }),
      RestaurantFavorite.count({ where: { userId } }),
      type === "restaurants"
        ? Promise.resolve([])
        : Favorite.findAll({
            where: { userId },
            include: productInclude(),
            order: [["createdAt", "DESC"]],
          }),
      type === "products"
        ? Promise.resolve([])
        : RestaurantFavorite.findAll({
            where: { userId },
            include: restaurantInclude(),
            order: [["createdAt", "DESC"]],
          }),
    ]);

    return res.json({
      counts: {
        products: productFavoritesCount,
        restaurants: restaurantFavoritesCount,
        total: productFavoritesCount + restaurantFavoritesCount,
      },
      products: productFavorites,
      restaurants: restaurantFavorites,
    });
  } catch (error) {
    console.error("Favorites error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users/:userId/favorites/products/:productId", async (req, res) => {
  try {
    const userId = toNumber(req.params.userId);
    const productId = toNumber(req.params.productId);

    const [user, product] = await Promise.all([
      ensureUser(userId),
      Product.findByPk(productId),
    ]);

    if (!user) return res.status(404).json({ error: "User not found" });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const [favorite, created] = await Favorite.findOrCreate({
      where: { userId, productId },
      defaults: { userId, productId },
    });

    const favoriteWithProduct = await Favorite.findByPk(favorite.id, { include: productInclude() });
    return res.status(created ? 201 : 200).json({
      isFavorite: true,
      favorite: favoriteWithProduct,
    });
  } catch (error) {
    console.error("Add product favorite error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:userId/favorites/products/:productId", async (req, res) => {
  try {
    const deleted = await Favorite.destroy({
      where: {
        userId: req.params.userId,
        productId: req.params.productId,
      },
    });

    return res.json({
      isFavorite: false,
      deleted: Boolean(deleted),
    });
  } catch (error) {
    console.error("Remove product favorite error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users/:userId/favorites/restaurants/:restaurantId", async (req, res) => {
  try {
    const userId = toNumber(req.params.userId);
    const restaurantId = toNumber(req.params.restaurantId);

    const [user, restaurant] = await Promise.all([
      ensureUser(userId),
      User.findOne({ where: { id: restaurantId, role: "restaurant" } }),
    ]);

    if (!user) return res.status(404).json({ error: "User not found" });
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

    const [favorite, created] = await RestaurantFavorite.findOrCreate({
      where: { userId, restaurantId },
      defaults: { userId, restaurantId },
    });

    const favoriteWithRestaurant = await RestaurantFavorite.findByPk(favorite.id, {
      include: restaurantInclude(),
    });

    return res.status(created ? 201 : 200).json({
      isFavorite: true,
      favorite: favoriteWithRestaurant,
    });
  } catch (error) {
    console.error("Add restaurant favorite error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:userId/favorites/restaurants/:restaurantId", async (req, res) => {
  try {
    const deleted = await RestaurantFavorite.destroy({
      where: {
        userId: req.params.userId,
        restaurantId: req.params.restaurantId,
      },
    });

    return res.json({
      isFavorite: false,
      deleted: Boolean(deleted),
    });
  } catch (error) {
    console.error("Remove restaurant favorite error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/favorites/toggle", async (req, res) => {
  try {
    const userId = toNumber(req.body.userId);
    const type = req.body.type;

    if (!userId || !["product", "restaurant"].includes(type)) {
      return res.status(400).json({ error: "userId and valid type are required" });
    }

    if (type === "product") {
      const productId = toNumber(req.body.productId);
      if (!productId) return res.status(400).json({ error: "productId is required" });

      const existing = await Favorite.findOne({ where: { userId, productId } });
      if (existing) {
        await existing.destroy();
        return res.json({ type, isFavorite: false });
      }

      const favorite = await Favorite.create({ userId, productId });
      return res.status(201).json({ type, isFavorite: true, favorite });
    }

    const restaurantId = toNumber(req.body.restaurantId);
    if (!restaurantId) return res.status(400).json({ error: "restaurantId is required" });

    const existing = await RestaurantFavorite.findOne({ where: { userId, restaurantId } });
    if (existing) {
      await existing.destroy();
      return res.json({ type, isFavorite: false });
    }

    const favorite = await RestaurantFavorite.create({ userId, restaurantId });
    return res.status(201).json({ type, isFavorite: true, favorite });
  } catch (error) {
    console.error("Toggle favorite error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
