const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const RestaurantFavorite = sequelize.define("RestaurantFavorite", {
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
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [{ unique: true, fields: ["userId", "restaurantId"] }],
});

module.exports = RestaurantFavorite;
