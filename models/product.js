const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Product = sequelize.define("Product", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  images: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  discountPrice: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  calories: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  prepTimeMin: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  prepTimeMax: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  rating: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  ratingsCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  isPopular: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  colors: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  sizes: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  lowStockAlert: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
  },
}, {
  timestamps: true,
});

module.exports = Product;
