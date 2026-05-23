function initChatSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join", (userId) => {
      if (userId) socket.join(`user:${userId}`);
    });

    socket.on("send_message", (payload) => {
      if (payload?.receiverId) {
        io.to(`user:${payload.receiverId}`).emit("receive_message", payload);
      }
    });
  });
}

module.exports = { initChatSocket };
