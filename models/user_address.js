const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const UserAddress = sequelize.define("UserAddress", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM("home", "work", "other"),
    allowNull: false,
    defaultValue: "home",
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  addressText: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  details: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  timestamps: true,
});

module.exports = UserAddress;
