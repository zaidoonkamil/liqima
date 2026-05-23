const express = require("express");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const uploadImage = require("../middlewares/uploads");
const {
  Ads,
  User,
  Category,
  Product,
  ProductAddon,
  Order,
  OrderItem,
  RestaurantProfile,
  DeliveryProfile,
} = require("../models");
const sequelize = require("../config/db");
const { normalizePhone } = require("../services/otpService");

const router = express.Router();
const saltRounds = 10;

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value)) value = value[0];
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function toNumber(value, fallback = null) {
  if (Array.isArray(value)) value = value[0];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value, fallback = false) {
  if (Array.isArray(value)) value = value[0];
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === "1" || value === 1;
}

function toText(value, fallback = null) {
  if (Array.isArray(value)) value = value[0];
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return fallback;
  return String(value).trim();
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

function restaurantInclude() {
  return [
    { model: RestaurantProfile, as: "restaurantProfile" },
    {
      model: Product,
      as: "products",
      include: [
        { model: Category, as: "category" },
        { model: ProductAddon, as: "addons" },
      ],
    },
  ];
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

function ensureProductOwner(product, restaurantId) {
  if (!restaurantId) return true;
  return Number(product.userId) === Number(restaurantId);
}

function getBaseProductPrice(product) {
  return toNumber(product?.discountPrice, null) ?? toNumber(product?.price, 0);
}

function getSizeOptions(product) {
  const sizes = parseJson(product?.sizes, []);
  return Array.isArray(sizes) ? sizes : [];
}

function getSizeName(size) {
  return typeof size === "string" ? size : String(size?.name || size?.label || size?.title || "").trim();
}

function getSizePrice(size, fallbackPrice) {
  if (typeof size === "string") return fallbackPrice;
  return toNumber(size?.price, fallbackPrice);
}

function normalizeSelectedSize(product, selectedSize) {
  const fallbackPrice = getBaseProductPrice(product);
  const sizes = getSizeOptions(product);
  if (sizes.length === 0) return { selectedSize: selectedSize || null, unitPrice: fallbackPrice };

  const requestedSize = String(selectedSize || "").trim();
  if (!requestedSize && sizes.length === 1) {
    const size = sizes[0];
    return { selectedSize: getSizeName(size) || null, unitPrice: getSizePrice(size, fallbackPrice) };
  }

  const matchedSize = sizes.find((size) => getSizeName(size) === requestedSize);
  if (!matchedSize) throw new Error("Selected size is not available for this product");

  return { selectedSize: getSizeName(matchedSize), unitPrice: getSizePrice(matchedSize, fallbackPrice) };
}

function orderInclude() {
  return [
    {
      model: OrderItem,
      as: "items",
      include: [{ model: Product, as: "product", include: [{ model: Category, as: "category" }] }],
    },
    {
      model: User,
      as: "restaurant",
      attributes: { exclude: ["password"] },
      include: [{ model: RestaurantProfile, as: "restaurantProfile" }],
    },
    {
      model: User,
      as: "delivery",
      attributes: { exclude: ["password"] },
      include: [{ model: DeliveryProfile, as: "deliveryProfile" }],
    },
    { model: User, as: "user", attributes: { exclude: ["password"] } },
  ];
}

function getStatusMeta(status) {
  const meta = {
    pending: { label: "قيد التحضير", step: "preparing" },
    accepted: { label: "قيد التحضير", step: "preparing" },
    preparing: { label: "قيد التحضير", step: "preparing" },
    on_way: { label: "في الطريق", step: "on_way" },
    ready_for_pickup: { label: "ready_for_pickup", step: "ready_for_pickup" },
    delivered: { label: "تم التوصيل", step: "delivered" },
    cancelled: { label: "ملغي", step: "cancelled" },
  };

  return meta[status] || meta.pending;
}

function formatOrder(order) {
  const json = order.toJSON ? order.toJSON() : order;
  const statusMeta = getStatusMeta(json.status);

  return {
    ...json,
    statusLabel: statusMeta.label,
    statusStep: statusMeta.step,
    itemSummary: (json.items || [])
      .map((item) => `${item.quantity}x ${item.product?.name || "Item"}`)
      .join(" · "),
  };
}

async function generateOrderNumber() {
  const min = 10000;
  const max = 99999;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = String(Math.floor(Math.random() * (max - min + 1)) + min);
    const exists = await Order.findOne({ where: { orderNumber } });
    if (!exists) return orderNumber;
  }
  return String(Date.now()).slice(-8);
}

router.get("/home", async (req, res) => {
  try {
    const [ads, categories, popularProducts, restaurants] = await Promise.all([
      Ads.findAll({ order: [["createdAt", "DESC"]], limit: 5 }),
      Category.findAll({
        where: { isActive: true, parentId: null },
        order: [["sortOrder", "ASC"], ["createdAt", "DESC"]],
        limit: 12,
      }),
      Product.findAll({
        where: { isAvailable: true, isPopular: true },
        include: [
          { model: Category, as: "category" },
          { model: User, as: "seller", attributes: { exclude: ["password"] }, include: [{ model: RestaurantProfile, as: "restaurantProfile" }] },
        ],
        order: [["rating", "DESC"], ["createdAt", "DESC"]],
        limit: 10,
      }),
      User.findAll({
        where: { role: "restaurant", isVerified: true },
        attributes: { exclude: ["password"] },
        include: [{ model: RestaurantProfile, as: "restaurantProfile", where: { status: "active" } }],
        order: [["createdAt", "DESC"]],
        limit: 10,
      }),
    ]);

    return res.json({ ads, categories, popularProducts, restaurants });
  } catch (error) {
    console.error("Home error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const where = q
      ? {
          [Op.or]: [
            { name: { [Op.like]: `%${q}%` } },
            { description: { [Op.like]: `%${q}%` } },
          ],
        }
      : {};

    const [products, restaurants] = await Promise.all([
      Product.findAll({
        where: { ...where, isAvailable: true },
        include: [
          { model: Category, as: "category" },
          { model: User, as: "seller", attributes: { exclude: ["password"] }, include: [{ model: RestaurantProfile, as: "restaurantProfile" }] },
        ],
        order: [["createdAt", "DESC"]],
        limit: 20,
      }),
      User.findAll({
        where: q
          ? { role: "restaurant", isVerified: true, name: { [Op.like]: `%${q}%` } }
          : { role: "restaurant", isVerified: true },
        attributes: { exclude: ["password"] },
        include: [{ model: RestaurantProfile, as: "restaurantProfile" }],
        order: [["createdAt", "DESC"]],
        limit: 20,
      }),
    ]);

    return res.json({ products, restaurants });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/categories", uploadImage.array("images", 1), async (req, res) => {
  try {
    const { name, type = "food" } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const category = await Category.create({
      name,
      type,
      parentId: toNumber(req.body.parentId),
      sortOrder: toNumber(req.body.sortOrder, 0),
      isActive: req.body.isActive === undefined ? true : toBool(req.body.isActive, true),
      image: req.files?.[0]?.filename || req.body.image || null,
    });

    return res.status(201).json(category);
  } catch (error) {
    console.error("Create category error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: { isActive: true },
      include: [{ model: Category, as: "subcategories" }],
      order: [["sortOrder", "ASC"], ["createdAt", "DESC"]],
    });
    return res.json(categories);
  } catch (error) {
    console.error("Categories error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post(
  "/restaurants",
  uploadImage.fields([
    { name: "images", maxCount: 2 },
    { name: "logo", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { name, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: "name, phone and password are required" });
    }

    const logo = getUploadedFile(req, "logo", 0) || req.body.logo || null;
    if (!logo) {
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
      role: "restaurant",
      isVerified: true,
      image: logo,
    });

    const profile = await RestaurantProfile.create({
      userId: user.id,
      logo,
      coverImage: getUploadedFile(req, "coverImage", 1) || toText(req.body.coverImage),
      description: toText(req.body.description),
      address: toText(req.body.address),
      area: toText(req.body.area),
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
      openingTime: toText(req.body.openingTime),
      closingTime: toText(req.body.closingTime),
      isFeatured: toBool(req.body.isFeatured, false),
      freeDelivery: toBool(req.body.freeDelivery, false),
      status: toText(req.body.status, "pending"),
    });

    return res.status(201).json({ user: publicUser(user), profile });
  } catch (error) {
    console.error("Create restaurant error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/restaurants", async (req, res) => {
  try {
    const restaurants = await User.findAll({
      where: { role: "restaurant" },
      attributes: { exclude: ["password"] },
      include: restaurantInclude(),
      order: [["createdAt", "DESC"]],
    });
    return res.json(restaurants);
  } catch (error) {
    console.error("Restaurants error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/restaurants/:id", async (req, res) => {
  try {
    const restaurant = await User.findOne({
      where: { id: req.params.id, role: "restaurant" },
      attributes: { exclude: ["password"] },
      include: restaurantInclude(),
    });

    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    return res.json(restaurant);
  } catch (error) {
    console.error("Restaurant details error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post(
  "/deliveries",
  uploadImage.fields([
    { name: "images", maxCount: 2 },
    { name: "image", maxCount: 1 },
    { name: "licenseImage", maxCount: 1 },
  ]),
  async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { name, password } = req.body;
    const restaurantId = toNumber(req.body.restaurantId);

    if (!name || !phone || !password || !restaurantId) {
      return res.status(400).json({ error: "name, phone, password and restaurantId are required" });
    }

    const [existingPhone, restaurant] = await Promise.all([
      User.findOne({ where: { phone } }),
      User.findOne({ where: { id: restaurantId, role: "restaurant" } }),
    ]);

    if (existingPhone) {
      return res.status(400).json({ error: "Phone number is already in use" });
    }
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const user = await User.create({
      name,
      phone,
      password: await bcrypt.hash(password, saltRounds),
      role: "delivery",
      isVerified: false,
      image: getUploadedFile(req, "image", 0),
    });

    const profile = await DeliveryProfile.create({
      userId: user.id,
      vehicleType: req.body.vehicleType || null,
      vehicleNumber: req.body.vehicleNumber || null,
      nationalId: req.body.nationalId || null,
      licenseImage: getUploadedFile(req, "licenseImage", 1) || req.body.licenseImage || null,
      currentLatitude: toNumber(req.body.currentLatitude),
      currentLongitude: toNumber(req.body.currentLongitude),
      restaurantId,
      isAvailable: toBool(req.body.isAvailable, false),
      status: req.body.status || "pending",
    });

    return res.status(201).json({ user: publicUser(user), profile });
  } catch (error) {
    console.error("Create delivery error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/deliveries", async (req, res) => {
  try {
    const profileWhere = {};
    if (req.query.restaurantId) profileWhere.restaurantId = req.query.restaurantId;

    const deliveries = await User.findAll({
      where: { role: "delivery" },
      attributes: { exclude: ["password"] },
      include: [{ model: DeliveryProfile, as: "deliveryProfile", where: profileWhere }],
      order: [["createdAt", "DESC"]],
    });
    return res.json(deliveries);
  } catch (error) {
    console.error("Deliveries error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/restaurants/:id/deliveries", async (req, res) => {
  try {
    const deliveries = await User.findAll({
      where: { role: "delivery" },
      attributes: { exclude: ["password"] },
      include: [{ model: DeliveryProfile, as: "deliveryProfile", where: { restaurantId: req.params.id } }],
      order: [["createdAt", "DESC"]],
    });

    return res.json(deliveries);
  } catch (error) {
    console.error("Restaurant deliveries error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/deliveries/:id/restaurant", async (req, res) => {
  try {
    const restaurantId = toNumber(req.body.restaurantId);
    if (!restaurantId) return res.status(400).json({ error: "restaurantId is required" });

    const [delivery, restaurant] = await Promise.all([
      User.findOne({
        where: { id: req.params.id, role: "delivery" },
        include: [{ model: DeliveryProfile, as: "deliveryProfile" }],
      }),
      User.findOne({ where: { id: restaurantId, role: "restaurant" } }),
    ]);

    if (!delivery?.deliveryProfile) return res.status(404).json({ error: "Delivery not found" });
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

    delivery.deliveryProfile.restaurantId = restaurantId;
    if (req.body.status) delivery.deliveryProfile.status = req.body.status;
    if (req.body.isAvailable !== undefined) {
      delivery.deliveryProfile.isAvailable = toBool(req.body.isAvailable, false);
    }
    await delivery.deliveryProfile.save();

    return res.json(delivery);
  } catch (error) {
    console.error("Attach delivery to restaurant error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/products", uploadImage.array("images", 5), async (req, res) => {
  try {
    const { name, userId } = req.body;
    const price = toNumber(req.body.price);

    if (!name || !userId || price === null) {
      return res.status(400).json({ error: "name, userId and price are required" });
    }

    const restaurant = await User.findOne({ where: { id: userId, role: "restaurant" } });
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

    const product = await Product.create({
      userId,
      categoryId: toNumber(req.body.categoryId),
      name,
      description: req.body.description || null,
      images: req.files?.map((file) => file.filename) || parseJson(req.body.images, []),
      price,
      discountPrice: toNumber(req.body.discountPrice),
      calories: toNumber(req.body.calories),
      prepTimeMin: toNumber(req.body.prepTimeMin),
      prepTimeMax: toNumber(req.body.prepTimeMax),
      rating: toNumber(req.body.rating, 0),
      ratingsCount: toNumber(req.body.ratingsCount, 0),
      isPopular: toBool(req.body.isPopular, false),
      isAvailable: toBool(req.body.isAvailable, true),
      sizes: parseJson(req.body.sizes, null),
    });

    return res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/products", async (req, res) => {
  try {
    const where = { isAvailable: true };
    if (req.query.restaurantId) where.userId = req.query.restaurantId;
    if (req.query.categoryId) where.categoryId = req.query.categoryId;
    if (req.query.popular !== undefined) where.isPopular = toBool(req.query.popular, true);

    const products = await Product.findAll({
      where,
      include: productInclude(),
      order: [["createdAt", "DESC"]],
    });

    return res.json(products);
  } catch (error) {
    console.error("Products error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: productInclude(),
    });

    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json(product);
  } catch (error) {
    console.error("Product details error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/products/:id", uploadImage.array("images", 5), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const restaurantId = toNumber(req.body.restaurantId || req.body.userId);
    if (!ensureProductOwner(product, restaurantId)) {
      return res.status(403).json({ error: "Product does not belong to this restaurant" });
    }

    if (req.body.categoryId !== undefined) product.categoryId = toNumber(req.body.categoryId);
    if (req.body.name !== undefined) product.name = req.body.name;
    if (req.body.description !== undefined) product.description = req.body.description || null;
    if (req.body.price !== undefined) product.price = toNumber(req.body.price, product.price);
    if (req.body.discountPrice !== undefined) product.discountPrice = toNumber(req.body.discountPrice);
    if (req.body.calories !== undefined) product.calories = toNumber(req.body.calories);
    if (req.body.prepTimeMin !== undefined) product.prepTimeMin = toNumber(req.body.prepTimeMin);
    if (req.body.prepTimeMax !== undefined) product.prepTimeMax = toNumber(req.body.prepTimeMax);
    if (req.body.rating !== undefined) product.rating = toNumber(req.body.rating, 0);
    if (req.body.ratingsCount !== undefined) product.ratingsCount = toNumber(req.body.ratingsCount, 0);
    if (req.body.isPopular !== undefined) product.isPopular = toBool(req.body.isPopular, false);
    if (req.body.isAvailable !== undefined) product.isAvailable = toBool(req.body.isAvailable, true);
    if (req.body.sizes !== undefined) product.sizes = parseJson(req.body.sizes, null);
    if (req.files?.length) product.images = req.files.map((file) => file.filename);
    if (req.body.images !== undefined && !req.files?.length) product.images = parseJson(req.body.images, []);

    await product.save();

    const updatedProduct = await Product.findByPk(product.id, { include: productInclude() });
    return res.json(updatedProduct);
  } catch (error) {
    console.error("Update product error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const restaurantId = toNumber(req.body.restaurantId || req.query.restaurantId || req.body.userId || req.query.userId);
    if (!ensureProductOwner(product, restaurantId)) {
      return res.status(403).json({ error: "Product does not belong to this restaurant" });
    }

    await product.destroy();
    return res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/products/:id/addons", uploadImage.array("images", 1), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (!req.body.name) return res.status(400).json({ error: "name is required" });

    const addon = await ProductAddon.create({
      productId: product.id,
      name: req.body.name,
      price: toNumber(req.body.price, 0),
      image: req.files?.[0]?.filename || req.body.image || null,
      isAvailable: toBool(req.body.isAvailable, true),
    });

    return res.status(201).json(addon);
  } catch (error) {
    console.error("Create addon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/products/:productId/addons/:addonId", uploadImage.array("images", 1), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const restaurantId = toNumber(req.body.restaurantId || req.body.userId);
    if (!ensureProductOwner(product, restaurantId)) {
      return res.status(403).json({ error: "Product does not belong to this restaurant" });
    }

    const addon = await ProductAddon.findOne({
      where: { id: req.params.addonId, productId: product.id },
    });
    if (!addon) return res.status(404).json({ error: "Addon not found" });

    if (req.body.name !== undefined) addon.name = req.body.name;
    if (req.body.price !== undefined) addon.price = toNumber(req.body.price, 0);
    if (req.body.isAvailable !== undefined) addon.isAvailable = toBool(req.body.isAvailable, true);
    if (req.files?.[0]) addon.image = req.files[0].filename;
    if (req.body.image !== undefined && !req.files?.[0]) addon.image = req.body.image || null;

    await addon.save();
    return res.json(addon);
  } catch (error) {
    console.error("Update addon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/products/:productId/addons/:addonId", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const restaurantId = toNumber(req.body.restaurantId || req.query.restaurantId || req.body.userId || req.query.userId);
    if (!ensureProductOwner(product, restaurantId)) {
      return res.status(403).json({ error: "Product does not belong to this restaurant" });
    }

    const deleted = await ProductAddon.destroy({
      where: { id: req.params.addonId, productId: product.id },
    });
    if (!deleted) return res.status(404).json({ error: "Addon not found" });

    return res.json({ message: "Addon deleted successfully" });
  } catch (error) {
    console.error("Delete addon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/orders", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = toNumber(req.body.userId);
    const items = parseJson(req.body.items, []);

    if (!userId || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: "userId and items are required" });
    }

    const user = await User.findOne({ where: { id: userId, role: "user" }, transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: "User not found" });
    }

    const productIds = [...new Set(items.map((item) => toNumber(item.productId)).filter(Boolean))];
    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds }, isAvailable: true },
      include: [{ model: User, as: "seller", include: [{ model: RestaurantProfile, as: "restaurantProfile" }] }],
      transaction,
    });

    if (products.length !== productIds.length) {
      await transaction.rollback();
      return res.status(400).json({ error: "One or more products are not available" });
    }

    const productsById = new Map(products.map((product) => [product.id, product]));
    const restaurantIds = [...new Set(products.map((product) => product.userId))];
    if (restaurantIds.length !== 1) {
      await transaction.rollback();
      return res.status(400).json({ error: "All order items must be from one restaurant" });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const productId = toNumber(item.productId);
      const product = productsById.get(productId);
      const quantity = Math.max(toNumber(item.quantity, 1), 1);
      const selectedAddons = parseJson(item.selectedAddons, []);
      const addonsTotal = Array.isArray(selectedAddons)
        ? selectedAddons.reduce((sum, addon) => sum + toNumber(addon.price, 0), 0)
        : 0;
      const sizeSelection = normalizeSelectedSize(product, item.selectedSize);
      const unitPrice = sizeSelection.unitPrice;

      subtotal += (unitPrice + addonsTotal) * quantity;
      orderItems.push({
        productId,
        quantity,
        price: unitPrice,
        selectedColor: item.selectedColor || null,
        selectedSize: sizeSelection.selectedSize,
        selectedAddons,
      });
    }

    const restaurant = products[0].seller;
    const restaurantProfile = restaurant?.restaurantProfile;
    const deliveryFee = toNumber(req.body.deliveryFee, restaurantProfile?.deliveryFee || 0);
    const discountAmount = toNumber(req.body.discountAmount, 0);
    const rewardDiscountAmount = toNumber(req.body.rewardDiscountAmount, 0);
    const total = Math.max(subtotal + deliveryFee - discountAmount - rewardDiscountAmount, 0);

    const order = await Order.create({
      userId,
      restaurantId: restaurantIds[0],
      orderNumber: await generateOrderNumber(),
      status: req.body.status || "pending",
      subtotal,
      deliveryFee,
      total,
      discountAmount,
      rewardDiscountAmount,
      couponCode: req.body.couponCode || null,
      phone: normalizePhone(req.body.phone || user.phone),
      secondaryPhone: normalizePhone(req.body.secondaryPhone || ""),
      address: req.body.address || null,
      latitude: toNumber(req.body.latitude),
      longitude: toNumber(req.body.longitude),
      notes: req.body.notes || null,
    }, { transaction });

    await OrderItem.bulkCreate(
      orderItems.map((item) => ({ ...item, orderId: order.id })),
      { transaction }
    );

    await transaction.commit();

    const createdOrder = await Order.findByPk(order.id, { include: orderInclude() });
    return res.status(201).json(formatOrder(createdOrder));
  } catch (error) {
    await transaction.rollback();
    console.error("Create order error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/orders/recent", async (req, res) => {
  try {
    const where = {};
    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.restaurantId) where.restaurantId = req.query.restaurantId;
    if (req.query.deliveryUserId) where.deliveryUserId = req.query.deliveryUserId;

    const orders = await Order.findAll({
      where,
      include: orderInclude(),
      order: [["createdAt", "DESC"]],
      limit: toNumber(req.query.limit, 10),
    });

    return res.json(orders.map(formatOrder));
  } catch (error) {
    console.error("Recent orders error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const where = {};
    const status = String(req.query.status || "all");
    const page = Math.max(toNumber(req.query.page, 1), 1);
    const limit = Math.max(toNumber(req.query.limit, 20), 1);

    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.restaurantId) where.restaurantId = req.query.restaurantId;
    if (req.query.deliveryUserId) where.deliveryUserId = req.query.deliveryUserId;

    const baseWhere = { ...where };
    if (status === "preparing") {
      where.status = { [Op.in]: ["pending", "accepted", "preparing"] };
    } else if (status === "delivery_pending") {
      where.status = "ready_for_pickup";
    } else if (status !== "all") {
      where.status = status;
    }

    const [statusRows, { count, rows }] = await Promise.all([
      Order.findAll({
        where: baseWhere,
        attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
        group: ["status"],
        raw: true,
      }),
      Order.findAndCountAll({
      where,
      include: orderInclude(),
      order: [["createdAt", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
      }),
    ]);

    const rawCounts = statusRows.reduce((result, item) => {
      result[item.status] = Number(item.count);
      return result;
    }, {});
    const statusCounts = {
      all: Object.values(rawCounts).reduce((sum, value) => sum + value, 0),
      preparing: (rawCounts.pending || 0) + (rawCounts.accepted || 0) + (rawCounts.preparing || 0),
      ready_for_pickup: rawCounts.ready_for_pickup || 0,
      delivery_pending: rawCounts.ready_for_pickup || 0,
      on_way: rawCounts.on_way || 0,
      delivered: rawCounts.delivered || 0,
      cancelled: rawCounts.cancelled || 0,
    };

    return res.json({
      orders: rows.map(formatOrder),
      statusCounts,
      pagination: {
        totalOrders: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Orders error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, { include: orderInclude() });
    if (!order) return res.status(404).json({ error: "Order not found" });

    return res.json(formatOrder(order));
  } catch (error) {
    console.error("Order details error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/orders/:id/status", async (req, res) => {
  try {
    const allowedStatuses = ["pending", "accepted", "preparing", "ready_for_pickup", "on_way", "delivered", "cancelled"];
    const status = String(req.body.status || "").trim();

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid order status" });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.status = status;
    if (req.body.deliveryUserId !== undefined) order.deliveryUserId = toNumber(req.body.deliveryUserId);
    if (status === "accepted") order.acceptedAt = new Date();
    if (status === "preparing") order.preparingAt = new Date();
    if (status === "ready_for_pickup") order.readyForPickupAt = new Date();
    if (status === "on_way") order.onWayAt = new Date();
    if (status === "delivered") order.deliveredAt = new Date();
    if (status === "cancelled") {
      order.cancelledAt = new Date();
      order.cancellationReason = req.body.cancellationReason || null;
    }

    await order.save();

    const updatedOrder = await Order.findByPk(order.id, { include: orderInclude() });
    return res.json(formatOrder(updatedOrder));
  } catch (error) {
    console.error("Update order status error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/restaurants/:restaurantId/orders", async (req, res) => {
  try {
    const status = String(req.query.status || "all");
    const where = { restaurantId: req.params.restaurantId };

    if (status === "incoming") {
      where.status = "pending";
    } else if (status === "preparing") {
      where.status = { [Op.in]: ["accepted", "preparing"] };
    } else if (status === "delivery_pending") {
      where.status = "ready_for_pickup";
    } else if (status !== "all") {
      where.status = status;
    }

    const orders = await Order.findAll({
      where,
      include: orderInclude(),
      order: [["createdAt", "DESC"]],
      limit: Math.max(toNumber(req.query.limit, 50), 1),
    });

    return res.json(orders.map(formatOrder));
  } catch (error) {
    console.error("Restaurant orders error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/deliveries/:deliveryUserId/orders", async (req, res) => {
  try {
    const status = String(req.query.status || "all");
    const where = { deliveryUserId: req.params.deliveryUserId };

    if (status === "pending") {
      where.status = "ready_for_pickup";
    } else if (status !== "all") {
      where.status = status;
    }

    const orders = await Order.findAll({
      where,
      include: orderInclude(),
      order: [["createdAt", "DESC"]],
      limit: Math.max(toNumber(req.query.limit, 50), 1),
    });

    return res.json(orders.map(formatOrder));
  } catch (error) {
    console.error("Delivery orders error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/orders/:id/restaurant-status", async (req, res) => {
  try {
    const restaurantId = toNumber(req.body.restaurantId);
    const status = String(req.body.status || "").trim();
    const allowedStatuses = ["accepted", "preparing", "ready_for_pickup"];

    if (!restaurantId || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "restaurantId and valid status are required", allowedStatuses });
    }

    const order = await Order.findOne({ where: { id: req.params.id, restaurantId } });
    if (!order) return res.status(404).json({ error: "Order not found for this restaurant" });
    if (["on_way", "delivered", "cancelled"].includes(order.status)) {
      return res.status(400).json({ error: "Order already moved to delivery stage" });
    }

    order.status = status;
    if (status === "accepted") order.acceptedAt = new Date();
    if (status === "preparing") order.preparingAt = new Date();
    if (status === "ready_for_pickup") order.readyForPickupAt = new Date();
    await order.save();

    const updatedOrder = await Order.findByPk(order.id, { include: orderInclude() });
    return res.json(formatOrder(updatedOrder));
  } catch (error) {
    console.error("Restaurant status error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/orders/:id/assign-delivery", async (req, res) => {
  try {
    const restaurantId = toNumber(req.body.restaurantId);
    const deliveryUserId = toNumber(req.body.deliveryUserId);

    if (!restaurantId || !deliveryUserId) {
      return res.status(400).json({ error: "restaurantId and deliveryUserId are required" });
    }

    const order = await Order.findOne({ where: { id: req.params.id, restaurantId } });
    if (!order) return res.status(404).json({ error: "Order not found for this restaurant" });
    if (["on_way", "delivered", "cancelled"].includes(order.status)) {
      return res.status(400).json({ error: "Order already moved to delivery stage" });
    }

    const delivery = await User.findOne({
      where: { id: deliveryUserId, role: "delivery" },
      include: [
        {
          model: DeliveryProfile,
          as: "deliveryProfile",
          where: { restaurantId, status: { [Op.ne]: "blocked" } },
        },
      ],
    });
    if (!delivery) return res.status(404).json({ error: "Delivery employee not found for this restaurant" });

    order.deliveryUserId = deliveryUserId;
    order.deliveryAssignedAt = new Date();
    order.status = "ready_for_pickup";
    order.readyForPickupAt = new Date();
    await order.save();

    const updatedOrder = await Order.findByPk(order.id, { include: orderInclude() });
    return res.json(formatOrder(updatedOrder));
  } catch (error) {
    console.error("Assign delivery error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/orders/:id/delivery-status", async (req, res) => {
  try {
    const deliveryUserId = toNumber(req.body.deliveryUserId);
    const status = String(req.body.status || "").trim();
    const allowedStatuses = ["on_way", "delivered", "cancelled"];

    if (!deliveryUserId || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "deliveryUserId and valid status are required", allowedStatuses });
    }

    const order = await Order.findOne({ where: { id: req.params.id, deliveryUserId } });
    if (!order) return res.status(404).json({ error: "Order not assigned to this delivery employee" });
    if (!["ready_for_pickup", "on_way"].includes(order.status)) {
      return res.status(400).json({ error: "Order is not ready for delivery update" });
    }

    order.status = status;
    if (status === "on_way") order.onWayAt = new Date();
    if (status === "delivered") order.deliveredAt = new Date();
    if (status === "cancelled") {
      order.cancelledAt = new Date();
      order.cancellationReason = req.body.cancellationReason || null;
    }
    await order.save();

    const updatedOrder = await Order.findByPk(order.id, { include: orderInclude() });
    return res.json(formatOrder(updatedOrder));
  } catch (error) {
    console.error("Delivery status error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
