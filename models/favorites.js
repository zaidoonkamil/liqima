const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Favorite = sequelize.define("Favorite", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [{ unique: true, fields: ["userId", "productId"] }],
});

module.exports = Favorite;
