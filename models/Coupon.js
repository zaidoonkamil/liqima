const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Coupon = sequelize.define("Coupon", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
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
}, {
  timestamps: true,
});

module.exports = Coupon;
