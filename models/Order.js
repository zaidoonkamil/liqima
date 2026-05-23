const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Order = sequelize.define("Order", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  restaurantId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  deliveryUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  addressId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  orderNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  status: {
    type: DataTypes.ENUM("pending", "accepted", "preparing", "ready_for_pickup", "on_way", "delivered", "cancelled"),
    allowNull: false,
    defaultValue: "pending",
  },
  subtotal: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  deliveryFee: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  total: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  discountAmount: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  rewardDiscountAmount: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  couponCode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  paymentMethod: {
    type: DataTypes.ENUM("cash", "card", "apple_pay"),
    allowNull: false,
    defaultValue: "cash",
  },
  paymentStatus: {
    type: DataTypes.ENUM("pending", "paid", "failed", "refunded"),
    allowNull: false,
    defaultValue: "pending",
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  secondaryPhone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  addressDetails: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  longitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  acceptedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  preparingAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  readyForPickupAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  deliveryAssignedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  onWayAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancellationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  timestamps: true,
});

module.exports = Order;
