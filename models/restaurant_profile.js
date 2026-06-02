const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const RestaurantProfile = sequelize.define("RestaurantProfile", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  logo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  coverImage: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  area: {
    type: DataTypes.STRING,
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
  cuisineTypes: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  deliveryTimeMin: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  deliveryTimeMax: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  deliveryFee: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  freeDeliveryDistanceKm: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  deliveryPricePerKm: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  appDeliveryFee: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  minimumOrder: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  discountPercent: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  discountMinOrder: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
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
  isOpen: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  openingTime: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  closingTime: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  notificationsEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  freeDelivery: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM("pending", "active", "blocked"),
    allowNull: false,
    defaultValue: "pending",
  },
}, {
  timestamps: true,
});

module.exports = RestaurantProfile;
