const { DataTypes } = require("sequelize");

async function tableExists(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch (error) {
    return false;
  }
}

async function ensureColumn(queryInterface, tableName, columnName, definition) {
  const exists = await tableExists(queryInterface, tableName);
  if (!exists) return;

  const table = await queryInterface.describeTable(tableName);
  if (!table[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
    console.log(`Added missing column ${tableName}.${columnName}`);
  }
}

async function changeColumnIfTableExists(queryInterface, tableName, columnName, definition) {
  const exists = await tableExists(queryInterface, tableName);
  if (!exists) return;

  await queryInterface.changeColumn(tableName, columnName, definition);
}

async function ensureNullableIntegerColumn(queryInterface, tableName, columnName) {
  const exists = await tableExists(queryInterface, tableName);
  if (!exists) return;

  const table = await queryInterface.describeTable(tableName);
  if (!table[columnName]) return;
  if (table[columnName].allowNull === true) return;

  await queryInterface.sequelize.query(
    `ALTER TABLE \`${tableName}\` MODIFY \`${columnName}\` INTEGER NULL;`
  );
  console.log(`Changed ${tableName}.${columnName} to nullable`);
}

async function ensureAppSettingsTable(queryInterface) {
  if (await tableExists(queryInterface, "AppSettings")) return;

  await queryInterface.createTable("AppSettings", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  console.log("Created missing AppSettings table");
}

async function ensureCouponsTable(queryInterface) {
  if (await tableExists(queryInterface, "Coupons")) return;

  await queryInterface.createTable("Coupons", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    couponCategoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Coupon",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM("percentage", "fixed", "free_delivery"),
      allowNull: false,
      defaultValue: "percentage",
    },
    value: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    minimumOrder: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    maxDiscount: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    totalUsageLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    perUserLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    usedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    startsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    target: {
      type: DataTypes.ENUM("all", "user", "restaurant"),
      allowNull: false,
      defaultValue: "all",
    },
    targetUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    restaurantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  console.log("Created missing Coupons table");
}

async function ensureCouponCategoriesTable(queryInterface) {
  if (await tableExists(queryInterface, "CouponCategories")) return;

  await queryInterface.createTable("CouponCategories", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    key: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    color: { type: DataTypes.STRING, allowNull: true },
    icon: { type: DataTypes.STRING, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  console.log("Created missing CouponCategories table");
}

async function ensureCouponUsagesTable(queryInterface) {
  if (await tableExists(queryInterface, "CouponUsages")) return;

  await queryInterface.createTable("CouponUsages", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    couponId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    discountAmount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  console.log("Created missing CouponUsages table");
}

async function ensureFaqsTable(queryInterface) {
  if (await tableExists(queryInterface, "Faqs")) return;

  await queryInterface.createTable("Faqs", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    question: { type: DataTypes.TEXT, allowNull: false },
    answer: { type: DataTypes.TEXT, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  console.log("Created missing Faqs table");
}

async function ensureCustomRequestsTable(queryInterface) {
  if (await tableExists(queryInterface, "CustomRequests")) return;

  await queryInterface.createTable("CustomRequests", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "reviewed", "completed", "cancelled"),
      allowNull: false,
      defaultValue: "pending",
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  console.log("Created missing CustomRequests table");
}

async function ensureProductRecommendationsTable(queryInterface) {
  if (await tableExists(queryInterface, "ProductRecommendations")) return;

  await queryInterface.createTable("ProductRecommendations", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    recommendedProductId: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex("ProductRecommendations", ["productId", "recommendedProductId"], {
    unique: true,
    name: "product_recommendations_unique_pair",
  });
  console.log("Created missing ProductRecommendations table");
}

async function ensureUserAddressesTable(queryInterface) {
  if (await tableExists(queryInterface, "UserAddresses")) return;

  await queryInterface.createTable("UserAddresses", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    type: {
      type: DataTypes.ENUM("home", "work", "other"),
      allowNull: false,
      defaultValue: "home",
    },
    title: { type: DataTypes.STRING, allowNull: true },
    addressText: { type: DataTypes.TEXT, allowNull: false },
    details: { type: DataTypes.TEXT, allowNull: true },
    latitude: { type: DataTypes.FLOAT, allowNull: true },
    longitude: { type: DataTypes.FLOAT, allowNull: true },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  console.log("Created missing UserAddresses table");
}

async function ensureUserRatingsTable(queryInterface) {
  if (await tableExists(queryInterface, "UserRatings")) return;

  await queryInterface.createTable("UserRatings", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    ratedByUserId: { type: DataTypes.INTEGER, allowNull: false },
    rating: { type: DataTypes.FLOAT, allowNull: false },
    comment: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex("UserRatings", ["userId", "ratedByUserId"], {
    unique: true,
    name: "user_ratings_unique_pair",
  });
  console.log("Created missing UserRatings table");
}

async function ensureSearchHistoriesTable(queryInterface) {
  if (await tableExists(queryInterface, "SearchHistories")) return;

  await queryInterface.createTable("SearchHistories", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    query: { type: DataTypes.STRING, allowNull: false },
    type: {
      type: DataTypes.ENUM("all", "products", "restaurants"),
      allowNull: false,
      defaultValue: "all",
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  console.log("Created missing SearchHistories table");
}

async function ensureRestaurantFavoritesTable(queryInterface) {
  if (await tableExists(queryInterface, "RestaurantFavorites")) return;

  await queryInterface.createTable("RestaurantFavorites", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    restaurantId: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex("RestaurantFavorites", ["userId", "restaurantId"], {
    unique: true,
    name: "restaurant_favorites_unique_pair",
  });
  console.log("Created missing RestaurantFavorites table");
}

async function ensureSchema(sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  await ensureAppSettingsTable(queryInterface);
  await ensureCouponCategoriesTable(queryInterface);
  await ensureCouponsTable(queryInterface);
  await ensureCouponUsagesTable(queryInterface);
  await ensureFaqsTable(queryInterface);
  await ensureCustomRequestsTable(queryInterface);
  await ensureProductRecommendationsTable(queryInterface);
  await ensureUserAddressesTable(queryInterface);
  await ensureUserRatingsTable(queryInterface);
  await ensureSearchHistoriesTable(queryInterface);
  await ensureRestaurantFavoritesTable(queryInterface);

  await ensureColumn(queryInterface, "Users", "rating", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "Users", "ratingsCount", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "Users", "points", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "Users", "walletBalance", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });

  await ensureColumn(queryInterface, "UserAddresses", "latitude", {
    type: DataTypes.FLOAT,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "UserAddresses", "longitude", {
    type: DataTypes.FLOAT,
    allowNull: true,
  });

  await ensureColumn(queryInterface, "Coupons", "couponCategoryId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Coupons", "title", {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Coupon",
  });
  await ensureColumn(queryInterface, "Coupons", "description", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Coupons", "minimumOrder", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "Coupons", "maxDiscount", {
    type: DataTypes.FLOAT,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Coupons", "totalUsageLimit", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Coupons", "perUserLimit", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  });
  await ensureColumn(queryInterface, "Coupons", "usedCount", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "Coupons", "startsAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Coupons", "expiresAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Coupons", "target", {
    type: DataTypes.ENUM("all", "user", "restaurant"),
    allowNull: false,
    defaultValue: "all",
  });
  await ensureColumn(queryInterface, "Coupons", "targetUserId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Coupons", "restaurantId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "DeliveryProfiles", "restaurantId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "RestaurantProfiles", "openingTime", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "RestaurantProfiles", "closingTime", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "RestaurantProfiles", "freeDeliveryDistanceKm", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "RestaurantProfiles", "deliveryPricePerKm", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "RestaurantProfiles", "appDeliveryFee", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "CouponUsages", "discountAmount", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });

  await ensureColumn(queryInterface, "Products", "colors", {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Products", "sizes", {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Products", "lowStockAlert", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
  });

  await ensureColumn(queryInterface, "ProductAddons", "restaurantId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await changeColumnIfTableExists(queryInterface, "ProductAddons", "productId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await ensureNullableIntegerColumn(queryInterface, "ProductAddons", "productId");

  await ensureColumn(queryInterface, "BasketItems", "selectedColor", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "BasketItems", "selectedSize", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "BasketItems", "selectedAddons", {
    type: DataTypes.JSON,
    allowNull: true,
  });

  await ensureColumn(queryInterface, "OrderItems", "selectedColor", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "OrderItems", "selectedSize", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "OrderItems", "selectedAddons", {
    type: DataTypes.JSON,
    allowNull: true,
  });

  await ensureColumn(queryInterface, "Orders", "addressId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await changeColumnIfTableExists(queryInterface, "Orders", "status", {
    type: DataTypes.ENUM("pending", "accepted", "preparing", "ready_for_pickup", "on_way", "delivered", "cancelled"),
    allowNull: false,
    defaultValue: "pending",
  });
  await ensureColumn(queryInterface, "Orders", "orderNumber", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "discountAmount", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "Orders", "rewardDiscountAmount", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "Orders", "couponCode", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "paymentMethod", {
    type: DataTypes.ENUM("cash", "card", "apple_pay"),
    allowNull: false,
    defaultValue: "cash",
  });
  await ensureColumn(queryInterface, "Orders", "paymentStatus", {
    type: DataTypes.ENUM("pending", "paid", "failed", "refunded"),
    allowNull: false,
    defaultValue: "pending",
  });
  await ensureColumn(queryInterface, "Orders", "secondaryPhone", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "addressDetails", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "acceptedAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "preparingAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "readyForPickupAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "deliveryAssignedAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "onWayAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "deliveredAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "cancelledAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Orders", "cancellationReason", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
}

module.exports = ensureSchema;
