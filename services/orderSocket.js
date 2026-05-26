let ioInstance = null;

function initOrderSocket(io) {
  ioInstance = io;

  io.on("connection", (socket) => {
    socket.on("join_orders", (payload = {}) => {
      const role = String(payload.role || "").trim();
      const userId = Number(payload.userId || 0);
      if (!role || !userId) return;

      if (role === "user") socket.join(`orders:user:${userId}`);
      if (role === "restaurant") socket.join(`orders:restaurant:${userId}`);
      if (role === "delivery") socket.join(`orders:delivery:${userId}`);
    });

    socket.on("leave_orders", (payload = {}) => {
      const role = String(payload.role || "").trim();
      const userId = Number(payload.userId || 0);
      if (!role || !userId) return;

      socket.leave(`orders:user:${userId}`);
      socket.leave(`orders:restaurant:${userId}`);
      socket.leave(`orders:delivery:${userId}`);
    });
  });
}

function emitOrderChanged(order) {
  if (!ioInstance || !order) return;

  const payload = {
    orderId: order.id,
    status: order.status,
    order,
  };

  if (order.userId) {
    ioInstance.to(`orders:user:${order.userId}`).emit("orders_changed", payload);
  }
  if (order.restaurantId) {
    ioInstance
      .to(`orders:restaurant:${order.restaurantId}`)
      .emit("orders_changed", payload);
  }
  if (order.deliveryUserId) {
    ioInstance
      .to(`orders:delivery:${order.deliveryUserId}`)
      .emit("orders_changed", payload);
  }
}

module.exports = { initOrderSocket, emitOrderChanged };
