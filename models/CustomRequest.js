const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CustomRequest = sequelize.define("CustomRequest", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("pending", "reviewed", "completed", "cancelled"),
    allowNull: false,
    defaultValue: "pending",
  },
}, {
  timestamps: true,
});

module.exports = CustomRequest;
