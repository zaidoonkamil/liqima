const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const AppSetting = sequelize.define("AppSetting", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  value: {
    type: DataTypes.JSON,
    allowNull: false,
  },
}, {
  timestamps: true,
});

module.exports = AppSetting;
