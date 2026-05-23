const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Basket = sequelize.define("Basket", {
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
}, {
  timestamps: true,
});

module.exports = Basket;
