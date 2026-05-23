const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const BasketItem = sequelize.define("BasketItem", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  basketId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  selectedColor: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  selectedSize: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  selectedAddons: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  timestamps: true,
});

module.exports = BasketItem;
