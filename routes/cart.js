const express = require("express");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const {
  User,
  UserAddress,
  Basket,
  BasketItem,
  Product,
  ProductAddon,
  Category,
  RestaurantProfile,
  Order,
  OrderItem,
  Coupon,
  CouponUsage,
} = require("../models");
const { normalizePhone } = require("../services/otpService");
const { emitOrderChanged } = require("../services/orderSocket");
const { notifyOrderEvent } = require("../services/orderNotifications");

const router = express.Router();
const PAYMENT_METHODS = ["cash", "card", "apple_pay"];

function publishOrderCreated(order) {
  emitOrderChanged(order);
  notifyOrderEvent(order, "created").catch((error) => {
    console.error("Order notification dispatch error:", error.message);
  });
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(origin, destination) {
  if (!origin || !destination) return null;
  const lat1 = toNumber(origin.latitude);
  const lon1 = toNumber(origin.longitude);
  const lat2 = toNumber(destination.latitude);
  const lon2 = toNumber(destination.longitude);
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;

  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(2));
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

function basketInclude() {
  return [
    {
      model: BasketItem,
      as: "items",
      include: [
        {
          model: Product,
          as: "product",
          include: [
            { model: Category, as: "category" },
            {
              model: User,
              as: "seller",
              attributes: { exclude: ["password"] },
              include: [{ model: RestaurantProfile, as: "restaurantProfile" }],
            },
          ],
        },
      ],
    },
  ];
}

function orderInclude() {
  return [
    {
      model: OrderItem,
      as: "items",
      include: [{ model: Product, as: "product" }],
    },
    { model: User, as: "restaurant", attributes: { exclude: ["password"] }, include: [{ model: RestaurantProfile, as: "restaurantProfile" }] },
    { model: UserAddress, as: "userAddress" },
  ];
}

async function getOrCreateBasket(userId, transaction = null) {
  const [basket] = await Basket.findOrCreate({
    where: { userId },
    defaults: { userId },
    transaction,
  });

  return basket;
}

async function getBasket(userId, transaction = null) {
  const basket = await getOrCreateBasket(userId, transaction);
  return Basket.findByPk(basket.id, {
    include: basketInclude(),
    transaction,
  });
}

async function mergeDuplicateBasketItems(basket, transaction = null) {
  const items = basket?.items || [];
  const itemByKey = new Map();
  let changed = false;

  for (const item of items) {
    const key = [
      item.productId,
      item.selectedSize || "",
      item.selectedColor || "",
    ].join(":");
    const existing = itemByKey.get(key);
    if (!existing) {
      itemByKey.set(key, item);
      continue;
    }

    existing.quantity += item.quantity;
    const addonsById = new Map();
    for (const addon of parseJson(existing.selectedAddons, []) || []) {
      addonsById.set(toNumber(addon.id), addon);
    }
    for (const addon of parseJson(item.selectedAddons, []) || []) {
      addonsById.set(toNumber(addon.id), addon);
    }
    existing.selectedAddons = [...addonsById.values()].filter((addon) => addon?.id);
    await existing.save({ transaction });
    await item.destroy({ transaction });
    changed = true;
  }

  if (!changed) return basket;
  return getBasket(basket.userId, transaction);
}

function getSelectedAddonsTotal(item) {
  const selectedAddons = parseJson(item.selectedAddons, []);
  if (!Array.isArray(selectedAddons)) return 0;
  return selectedAddons.reduce((sum, addon) => sum + toNumber(addon.price, 0), 0);
}

async function normalizeSelectedAddons(productId, value, transaction = null) {
  const selectedAddons = parseJson(value, []);
  if (!Array.isArray(selectedAddons) || selectedAddons.length === 0) return [];

  const product = await Product.findByPk(productId, { transaction });
  if (!product) throw new Error("Product not found or unavailable");

  const addonIds = selectedAddons.map((addon) => toNumber(addon.id)).filter(Boolean);
  if (addonIds.length === 0) return selectedAddons;

  const addons = await ProductAddon.findAll({
    where: {
      id: { [Op.in]: addonIds },
      isAvailable: true,
      [Op.or]: [
        { productId },
        { productId: null, restaurantId: product.userId },
      ],
    },
    transaction,
  });

  if (addons.length !== addonIds.length) {
    throw new Error("One or more addons are not available");
  }

  return addons.map((addon) => ({
    id: addon.id,
    name: addon.name,
    price: addon.price,
    image: addon.image,
  }));
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
  if (sizes.length === 0) {
    return { selectedSize: selectedSize || null, unitPrice: fallbackPrice };
  }

  const requestedSize = String(selectedSize || "").trim();
  if (!requestedSize && sizes.length === 1) {
    const size = sizes[0];
    return {
      selectedSize: getSizeName(size) || null,
      unitPrice: getSizePrice(size, fallbackPrice),
    };
  }

  const matchedSize = sizes.find((size) => getSizeName(size) === requestedSize);
  if (!matchedSize) {
    throw new Error("Selected size is not available for this product");
  }

  return {
    selectedSize: getSizeName(matchedSize),
    unitPrice: getSizePrice(matchedSize, fallbackPrice),
  };
}

function calculateDeliveryPolicy(profile, deliveryLocation = null) {
  const restaurantLocation = {
    latitude: profile?.latitude,
    longitude: profile?.longitude,
  };
  const distanceKm = getDistanceKm(deliveryLocation, restaurantLocation);
  const freeDeliveryDistanceKm = Math.max(toNumber(profile?.freeDeliveryDistanceKm, 0), 0);
  const deliveryPricePerKm = Math.max(toNumber(profile?.deliveryPricePerKm, 0), 0);
  const appDeliveryFee = Math.max(toNumber(profile?.appDeliveryFee, toNumber(profile?.deliveryFee, 0)), 0);
  const extraKm = distanceKm === null ? 0 : Math.max(distanceKm - freeDeliveryDistanceKm, 0);
  const restaurantDeliveryFee = Math.ceil(extraKm) * deliveryPricePerKm;
  const deliveryFee = appDeliveryFee + restaurantDeliveryFee;

  return {
    deliveryFee,
    deliveryFeeBeforeDiscount: deliveryFee,
    restaurantDeliveryFee,
    appDeliveryFee,
    deliveryDistanceKm: distanceKm,
    freeDeliveryDistanceKm,
    deliveryPricePerKm,
    withinFreeDeliveryDistance: distanceKm !== null && distanceKm <= freeDeliveryDistanceKm,
  };
}

function calculateBasketSummary(basket, coupon = null, deliveryLocation = null) {
  const items = basket?.items || [];
  let subtotal = 0;
  let itemsCount = 0;

  for (const item of items) {
    const { unitPrice } = normalizeSelectedSize(item.product, item.selectedSize);
    const addonsTotal = getSelectedAddonsTotal(item);
    subtotal += (unitPrice + addonsTotal) * item.quantity;
    itemsCount += item.quantity;
  }

  const restaurant = items[0]?.product?.seller || null;
  const restaurantProfile = restaurant?.restaurantProfile || null;
  const minimumOrder = toNumber(restaurantProfile?.minimumOrder, 0);
  const deliveryPolicy = calculateDeliveryPolicy(restaurantProfile, deliveryLocation);
  const deliveryFeeBeforeDiscount = deliveryPolicy.deliveryFeeBeforeDiscount;
  let deliveryFee = deliveryPolicy.deliveryFee;
  let discountAmount = 0;

  if (coupon) {
    discountAmount = calculateCouponDiscount(coupon, subtotal, deliveryFee);
    if (coupon.type === "free_delivery") deliveryFee = 0;
  }

  const total = Math.max(subtotal + deliveryFee - discountAmount, 0);

  return {
    itemsCount,
    subtotal,
    deliveryFee,
    deliveryFeeBeforeDiscount,
    discountAmount,
    total,
    restaurant,
    minimumOrder,
    freeDelivery: deliveryFee === 0,
    deliveryPolicy,
    remainingToMinimumOrder: Math.max(minimumOrder - subtotal, 0),
    canCheckout: items.length > 0,
  };
}

function calculateCouponDiscount(coupon, subtotal, deliveryFee) {
  if (!coupon) return 0;
  if (coupon.type === "free_delivery") return Math.max(deliveryFee, 0);
  if (coupon.type === "fixed") return Math.min(coupon.value, subtotal);

  const discount = subtotal * (coupon.value / 100);
  return coupon.maxDiscount ? Math.min(discount, coupon.maxDiscount) : discount;
}

async function validateCoupon({ code, userId, restaurantId, subtotal, deliveryFee }) {
  if (!code) return { coupon: null, discountAmount: 0 };

  const coupon = await Coupon.findOne({
    where: { code: String(code).trim().toUpperCase() },
  });

  if (!coupon) return { error: "Coupon not found" };

  const now = new Date();
  if (!coupon.isActive || (coupon.startsAt && coupon.startsAt > now) || (coupon.expiresAt && coupon.expiresAt < now)) {
    return { error: "Coupon is not available" };
  }
  if (coupon.totalUsageLimit !== null && coupon.totalUsageLimit !== undefined && coupon.usedCount >= coupon.totalUsageLimit) {
    return { error: "Coupon usage limit reached" };
  }
  if (subtotal < coupon.minimumOrder) return { error: "Order subtotal is less than coupon minimum" };
  if (coupon.target === "user" && Number(coupon.targetUserId) !== Number(userId)) {
    return { error: "Coupon is not available for this user" };
  }
  if (coupon.target === "restaurant" && Number(coupon.restaurantId) !== Number(restaurantId)) {
    return { error: "Coupon is not available for this restaurant" };
  }

  const userUsageCount = await CouponUsage.count({ where: { couponId: coupon.id, userId } });
  if (userUsageCount >= coupon.perUserLimit) return { error: "Coupon usage limit reached" };

  return {
    coupon,
    discountAmount: calculateCouponDiscount(coupon, subtotal, deliveryFee),
  };
}

async function generateOrderNumber() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = String(Math.floor(Math.random() * 90000) + 10000);
    const exists = await Order.findOne({ where: { orderNumber } });
    if (!exists) return orderNumber;
  }
  return String(Date.now()).slice(-8);
}

function formatCart(basket, coupon = null, deliveryLocation = null) {
  const summary = calculateBasketSummary(basket, coupon, deliveryLocation);
  return {
    basket,
    summary: {
      itemsCount: summary.itemsCount,
      subtotal: summary.subtotal,
      deliveryFee: summary.deliveryFee,
      deliveryFeeBeforeDiscount: summary.deliveryFeeBeforeDiscount,
      discountAmount: summary.discountAmount,
      total: summary.total,
      minimumOrder: summary.minimumOrder,
      remainingToMinimumOrder: summary.remainingToMinimumOrder,
      freeDelivery: summary.freeDelivery,
      restaurantDeliveryFee: summary.deliveryPolicy.restaurantDeliveryFee,
      appDeliveryFee: summary.deliveryPolicy.appDeliveryFee,
      deliveryDistanceKm: summary.deliveryPolicy.deliveryDistanceKm,
      freeDeliveryDistanceKm: summary.deliveryPolicy.freeDeliveryDistanceKm,
      deliveryPricePerKm: summary.deliveryPolicy.deliveryPricePerKm,
      withinFreeDeliveryDistance: summary.deliveryPolicy.withinFreeDeliveryDistance,
      canCheckout: summary.canCheckout,
      couponCode: coupon?.code || null,
    },
    restaurant: summary.restaurant,
  };
}

router.get("/users/:userId/cart", async (req, res) => {
  try {
    const userId = toNumber(req.params.userId);
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let basket = await getBasket(userId);
    basket = await mergeDuplicateBasketItems(basket);
    return res.json(formatCart(basket, null, user));
  } catch (error) {
    console.error("Cart error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users/:userId/cart/items", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = toNumber(req.params.userId);
    const productId = toNumber(req.body.productId);
    const quantity = Math.max(toNumber(req.body.quantity, 1), 1);

    if (!userId || !productId) {
      await transaction.rollback();
      return res.status(400).json({ error: "userId and productId are required" });
    }

    const [user, product] = await Promise.all([
      User.findByPk(userId, { transaction }),
      Product.findOne({
        where: { id: productId, isAvailable: true },
        include: [{ model: User, as: "seller" }],
        transaction,
      }),
    ]);

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: "User not found" });
    }
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ error: "Product not found or unavailable" });
    }

    const basket = await getOrCreateBasket(userId, transaction);
    const currentItems = await BasketItem.findAll({
      where: { basketId: basket.id },
      include: [{ model: Product, as: "product" }],
      transaction,
    });
    const currentRestaurantId = currentItems[0]?.product?.userId;
    if (currentRestaurantId && currentRestaurantId !== product.userId) {
      await transaction.rollback();
      return res.status(400).json({ error: "Cart can contain items from one restaurant only" });
    }

    const selectedAddons = await normalizeSelectedAddons(productId, req.body.selectedAddons, transaction);
    const selectedSize = normalizeSelectedSize(product, req.body.selectedSize).selectedSize;
    const similarItems = await BasketItem.findAll({
      where: {
        basketId: basket.id,
        productId,
        selectedSize,
        selectedColor: req.body.selectedColor || null,
      },
      transaction,
    });
    const existing = similarItems[0] || null;

    if (existing) {
      existing.quantity += quantity;
      const currentAddons = parseJson(existing.selectedAddons, []);
      const addonsById = new Map();
      for (const addon of Array.isArray(currentAddons) ? currentAddons : []) {
        addonsById.set(toNumber(addon.id), addon);
      }
      for (const addon of selectedAddons) {
        addonsById.set(toNumber(addon.id), addon);
      }
      existing.selectedAddons = [...addonsById.values()].filter((addon) => addon?.id);
      await existing.save({ transaction });
    } else {
      await BasketItem.create({
        basketId: basket.id,
        productId,
        quantity,
        selectedSize,
        selectedColor: req.body.selectedColor || null,
        selectedAddons,
      }, { transaction });
    }

    await transaction.commit();

    const updatedBasket = await getBasket(userId);
    return res.status(201).json(formatCart(updatedBasket, null, user));
  } catch (error) {
    await transaction.rollback();
    console.error("Add cart item error:", error);
    if (
      error.message === "One or more addons are not available" ||
      error.message === "Selected size is not available for this product"
    ) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/users/:userId/cart/items/:itemId", async (req, res) => {
  try {
    const userId = toNumber(req.params.userId);
    const basket = await getOrCreateBasket(userId);
    const item = await BasketItem.findOne({
      where: { id: req.params.itemId, basketId: basket.id },
      include: [{ model: Product, as: "product" }],
    });

    if (!item) return res.status(404).json({ error: "Cart item not found" });

    if (req.body.quantity !== undefined) item.quantity = Math.max(toNumber(req.body.quantity, 1), 1);
    if (req.body.selectedAddons !== undefined) {
      item.selectedAddons = await normalizeSelectedAddons(item.productId, req.body.selectedAddons);
    }
    if (req.body.selectedSize !== undefined) {
      item.selectedSize = normalizeSelectedSize(item.product, req.body.selectedSize).selectedSize;
    }
    if (req.body.selectedColor !== undefined) item.selectedColor = req.body.selectedColor || null;

    await item.save();
    const [updatedBasket, user] = await Promise.all([
      getBasket(userId),
      User.findByPk(userId),
    ]);
    return res.json(formatCart(updatedBasket, null, user));
  } catch (error) {
    console.error("Update cart item error:", error);
    if (
      error.message === "One or more addons are not available" ||
      error.message === "Selected size is not available for this product"
    ) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:userId/cart/items/:itemId", async (req, res) => {
  try {
    const userId = toNumber(req.params.userId);
    const basket = await getOrCreateBasket(userId);
    await BasketItem.destroy({ where: { id: req.params.itemId, basketId: basket.id } });

    const [updatedBasket, user] = await Promise.all([
      getBasket(userId),
      User.findByPk(userId),
    ]);
    return res.json(formatCart(updatedBasket, null, user));
  } catch (error) {
    console.error("Delete cart item error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:userId/cart", async (req, res) => {
  try {
    const basket = await getOrCreateBasket(req.params.userId);
    await BasketItem.destroy({ where: { basketId: basket.id } });
    const [updatedBasket, user] = await Promise.all([
      getBasket(req.params.userId),
      User.findByPk(req.params.userId),
    ]);
    return res.json(formatCart(updatedBasket, null, user));
  } catch (error) {
    console.error("Clear cart error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users/:userId/cart/apply-coupon", async (req, res) => {
  try {
    const userId = toNumber(req.params.userId);
    const [basket, user] = await Promise.all([
      getBasket(userId),
      User.findByPk(userId),
    ]);
    const summary = calculateBasketSummary(basket, null, user);

    if (!summary.restaurant) return res.status(400).json({ error: "Cart is empty" });

    const validation = await validateCoupon({
      code: req.body.code,
      userId,
      restaurantId: summary.restaurant.id,
      subtotal: summary.subtotal,
      deliveryFee: summary.deliveryFee,
    });

    if (validation.error) return res.status(400).json({ error: validation.error });
    return res.json(formatCart(basket, validation.coupon, user));
  } catch (error) {
    console.error("Apply cart coupon error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users/:userId/checkout", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = toNumber(req.params.userId);
    const addressId = toNumber(req.body.addressId);
    const paymentMethod = req.body.paymentMethod || "cash";

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      await transaction.rollback();
      return res.status(400).json({ error: "Invalid payment method", allowedMethods: PAYMENT_METHODS });
    }

    const [user, address] = await Promise.all([
      User.findByPk(userId, { transaction }),
      addressId ? UserAddress.findOne({ where: { id: addressId, userId }, transaction }) : null,
    ]);

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: "User not found" });
    }
    if (!address) {
      await transaction.rollback();
      return res.status(400).json({ error: "Valid addressId is required" });
    }

    const basket = await getBasket(userId, transaction);
    const deliveryLocation = address || user;
    const summary = calculateBasketSummary(basket, null, deliveryLocation);
    if (!summary.restaurant) {
      await transaction.rollback();
      return res.status(400).json({ error: "Cart is empty" });
    }
    if (!summary.canCheckout) {
      await transaction.rollback();
      return res.status(400).json({ error: "Cart is empty" });
    }

    let coupon = null;
    let discountAmount = 0;
    let deliveryFee = summary.deliveryFee;

    if (req.body.couponCode) {
      const validation = await validateCoupon({
        code: req.body.couponCode,
        userId,
        restaurantId: summary.restaurant.id,
        subtotal: summary.subtotal,
        deliveryFee,
      });

      if (validation.error) {
        await transaction.rollback();
        return res.status(400).json({ error: validation.error });
      }

      coupon = validation.coupon;
      discountAmount = validation.discountAmount;
      if (coupon.type === "free_delivery") deliveryFee = 0;
    }

    const total = Math.max(summary.subtotal + deliveryFee - discountAmount, 0);
    const order = await Order.create({
      userId,
      restaurantId: summary.restaurant.id,
      addressId: address.id,
      orderNumber: await generateOrderNumber(),
      status: "pending",
      subtotal: summary.subtotal,
      deliveryFee,
      total,
      discountAmount,
      couponCode: coupon?.code || null,
      paymentMethod,
      paymentStatus: paymentMethod === "cash" ? "pending" : "paid",
      phone: normalizePhone(req.body.phone || user.phone),
      secondaryPhone: normalizePhone(req.body.secondaryPhone || ""),
      address: address.addressText,
      addressDetails: address.details,
      notes: req.body.notes || null,
      latitude: toNumber(address.latitude),
      longitude: toNumber(address.longitude),
    }, { transaction });

    const orderItems = basket.items.map((item) => {
      const { unitPrice } = normalizeSelectedSize(item.product, item.selectedSize);
      return {
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: unitPrice,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        selectedAddons: item.selectedAddons,
      };
    });

    await OrderItem.bulkCreate(orderItems, { transaction });

    if (coupon) {
      await CouponUsage.create({
        userId,
        couponId: coupon.id,
        orderId: order.id,
        discountAmount,
      }, { transaction });
      await coupon.increment("usedCount", { by: 1, transaction });
    }

    await BasketItem.destroy({ where: { basketId: basket.id }, transaction });
    await transaction.commit();

    const createdOrder = await Order.findByPk(order.id, { include: orderInclude() });
    publishOrderCreated(createdOrder);
    return res.status(201).json({
      message: "Order created successfully",
      order: createdOrder,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Checkout error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
