const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const OtpCode = sequelize.define("OtpCode", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  purpose: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "activation",
  },
  isUsed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  expiryDate: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  timestamps: true,
});

module.exports = OtpCode;
