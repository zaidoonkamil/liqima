const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductAddon = sequelize.define("ProductAddon", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  timestamps: true,
});

module.exports = ProductAddon;
