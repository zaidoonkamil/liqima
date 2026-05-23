const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CouponUsage = sequelize.define("CouponUsage", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
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
}, {
  timestamps: true,
});

module.exports = CouponUsage;
