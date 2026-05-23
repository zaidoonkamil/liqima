const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const DeliveryProfile = sequelize.define("DeliveryProfile", {
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
  restaurantId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  vehicleType: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  vehicleNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  nationalId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  licenseImage: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  currentLatitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  currentLongitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  rating: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM("pending", "active", "blocked"),
    allowNull: false,
    defaultValue: "pending",
  },
}, {
  timestamps: true,
});

module.exports = DeliveryProfile;
