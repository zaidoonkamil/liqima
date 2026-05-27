const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Op } = require("sequelize");
const sequelize = require("./config/db");
const { Product, Category } = require("./models");
const ensureSchema = require("./migrations/ensureSchema");

const usersRouter = require("./routes/user");
const adsRouter = require("./routes/ads");
const notifications = require("./routes/notifications.js");
const foodRouter = require("./routes/food");
const searchRouter = require("./routes/search");
const userProfileRouter = require("./routes/user_profile");
const couponsRouter = require("./routes/coupons");
const favoritesRouter = require("./routes/favorites");
const cartRouter = require("./routes/cart");
const chat = require("./services/chat");
const ordersSocket = require("./services/orderSocket");

let whatsappRouter = null;
let startWhatsAppAutoInit = null;

try {
  whatsappRouter = require("./routes/whatsapp");
  ({ startWhatsAppAutoInit } = require("./services/waSender"));
  console.log("WhatsApp integration loaded successfully");
} catch (error) {
  console.error("WhatsApp integration disabled:", error.message);
}

async function cleanupProductsWithoutSubcategory() {
  const categories = await Category.findAll({
    attributes: ["id"],
  });

  const validCategoryIds = categories.map((item) => item.id);
  const deletedCount = await Product.destroy({
    where: {
      [Op.or]: validCategoryIds.length
          ? [
              {
                categoryId: {
                  [Op.not]: null,
                  [Op.notIn]: validCategoryIds,
                },
              },
            ]
          : [{ categoryId: { [Op.not]: null } }],
    },
  });

  if (deletedCount > 0) {
    console.log(`Deleted ${deletedCount} products linked to missing categories`);
  }
}

sequelize
  .sync({ alter: true })
  .then(async () => {
    console.log("Database & tables synced!");
    await ensureSchema(sequelize);
    await cleanupProductsWithoutSubcategory();
  })
  .catch(async (err) => {
    console.error("Error syncing database:", err);
    try {
      await ensureSchema(sequelize);
      console.log("Fallback schema check completed.");
    } catch (schemaError) {
      console.error("Error ensuring schema:", schemaError);
    }
  });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
app.use(express.json());
app.use("/uploads", express.static("./uploads"));

app.use("/", usersRouter);
app.use("/", adsRouter);
app.use("/", notifications);
app.use("/", searchRouter);
app.use("/", foodRouter);
app.use("/", userProfileRouter);
app.use("/", couponsRouter);
app.use("/", favoritesRouter);
app.use("/", cartRouter);


if (whatsappRouter) {
  app.use("/", whatsappRouter);
} else {
  app.use("/whatsapp", (req, res) => {
    res.status(503).json({
      error: "WhatsApp service is not available on this server yet",
    });
  });
}

chat.initChatSocket(io);
ordersSocket.initOrderSocket(io);

if (startWhatsAppAutoInit) {
  startWhatsAppAutoInit();
}

server.listen(1011, () => {
  console.log("Server running on http://localhost:1011");
});
