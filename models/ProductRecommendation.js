const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductRecommendation = sequelize.define("ProductRecommendation", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  recommendedProductId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [{ unique: true, fields: ["productId", "recommendedProductId"] }],
});

module.exports = ProductRecommendation;
