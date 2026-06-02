const { RestaurantProfile } = require("../models");
const { sendNotificationToRole, sendNotificationToUser } = require("./notifications");

const STATUS_TEXT = {
  pending: "قيد الانتظار",
  accepted: "تم قبول الطلب",
  preparing: "قيد التحضير",
  ready_for_pickup: "جاهز للاستلام",
  on_way: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

function orderNumber(order) {
  return order?.orderNumber ? `#${order.orderNumber}` : `#${order?.id || ""}`;
}

function notificationText(status, order) {
  const number = orderNumber(order);
  const statusText = STATUS_TEXT[status] || status;
  return {
    title: `تحديث الطلب ${number}`,
    message: `حالة الطلب ${number}: ${statusText}`,
  };
}

async function restaurantNotificationsEnabled(restaurantId) {
  if (!restaurantId) return false;
  const profile = await RestaurantProfile.findOne({
    where: { userId: restaurantId },
    attributes: ["notificationsEnabled"],
  });
  return profile?.notificationsEnabled !== false;
}

async function sendSafely(userId, message, title) {
  if (!userId) return null;
  try {
    return await sendNotificationToUser(userId, message, title);
  } catch (error) {
    console.error(`Order notification error for user ${userId}:`, error.message);
    return null;
  }
}

async function sendAdminCopy(message, title) {
  try {
    return await sendNotificationToRole("admin", message, title);
  } catch (error) {
    console.error("Order admin notification error:", error.message);
    return null;
  }
}

function uniqueUsers(users) {
  return [...new Set(users.filter((userId) => Number(userId) > 0))];
}

async function orderNotificationRecipients({ order, event, status }) {
  const recipients = [];

  if (event === "created") {
    if (await restaurantNotificationsEnabled(order.restaurantId)) {
      recipients.push(order.restaurantId);
    }
    return uniqueUsers(recipients);
  }

  if (event === "assigned_delivery") {
    recipients.push(order.userId, order.deliveryUserId);
    return uniqueUsers(recipients);
  }

  if (status === "accepted" || status === "preparing") {
    recipients.push(order.userId);
  } else if (status === "ready_for_pickup") {
    recipients.push(order.userId, order.deliveryUserId);
  } else if (status === "on_way" || status === "delivered" || status === "cancelled") {
    recipients.push(order.userId, order.restaurantId, order.deliveryUserId);
  }

  const restaurantAllowed = await restaurantNotificationsEnabled(order.restaurantId);
  return uniqueUsers(
    recipients.filter((userId) => restaurantAllowed || userId !== order.restaurantId)
  );
}

async function notifyOrderEvent(order, event = "status_changed") {
  if (!order) return;

  const plainOrder = order.toJSON ? order.toJSON() : order;
  const status = plainOrder.status || "pending";
  const { title, message } = notificationText(status, plainOrder);

  const recipients = await orderNotificationRecipients({
    order: plainOrder,
    event,
    status,
  });

  await Promise.all([
    ...recipients.map((userId) => sendSafely(userId, message, title)),
    sendAdminCopy(message, title),
  ]);
}

module.exports = {
  notifyOrderEvent,
};
