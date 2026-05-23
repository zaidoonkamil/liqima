const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Faq = sequelize.define("Faq", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  answer: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  timestamps: true,
});

module.exports = Faq;
