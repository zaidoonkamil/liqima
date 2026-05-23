const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SearchHistory = sequelize.define("SearchHistory", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  query: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM("all", "products", "restaurants"),
    allowNull: false,
    defaultValue: "all",
  },
}, {
  timestamps: true,
});

module.exports = SearchHistory;
