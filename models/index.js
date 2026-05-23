const User = require("./user");
const UserDevice = require("./user_device");
const UserAddress = require("./user_address");
const UserRating = require("./user_rating");
const SearchHistory = require("./search_history");
const Ads = require("./ads");
const Category = require("./category");
const Product = require("./product");
const Favorite = require("./favorites");
const RestaurantFavorite = require("./restaurant_favorite");
const Basket = require("./Basket");
const BasketItem = require("./BasketItem");
const Order = require("./Order");
const OrderItem = require("./OrderItem");
const ChatMessage = require("./ChatMessage");
const AppSetting = require("./AppSetting");
const CouponCategory = require("./coupon_category");
const Coupon = require("./Coupon");
const CouponUsage = require("./CouponUsage");
const Faq = require("./Faq");
const CustomRequest = require("./CustomRequest");
const ProductRecommendation = require("./ProductRecommendation");
const RestaurantProfile = require("./restaurant_profile");
const DeliveryProfile = require("./delivery_profile");
const ProductAddon = require("./product_addon");

User.hasMany(Order, { foreignKey: "userId", as: "orders", onDelete: "CASCADE" });
Order.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });
User.hasMany(Order, { foreignKey: "restaurantId", as: "restaurantOrders", onDelete: "SET NULL" });
Order.belongsTo(User, { foreignKey: "restaurantId", as: "restaurant", onDelete: "SET NULL" });
User.hasMany(Order, { foreignKey: "deliveryUserId", as: "deliveryOrders", onDelete: "SET NULL" });
Order.belongsTo(User, { foreignKey: "deliveryUserId", as: "delivery", onDelete: "SET NULL" });
Order.belongsTo(UserAddress, { foreignKey: "addressId", as: "userAddress", onDelete: "SET NULL" });
UserAddress.hasMany(Order, { foreignKey: "addressId", as: "orders", onDelete: "SET NULL" });

Order.hasMany(OrderItem, { foreignKey: "orderId", as: "items", onDelete: "CASCADE" });
OrderItem.belongsTo(Order, { foreignKey: "orderId", as: "order" });

Product.hasMany(OrderItem, { foreignKey: "productId", as: "orderItems", onDelete: "CASCADE" });
OrderItem.belongsTo(Product, { foreignKey: "productId", as: "product" });

User.hasOne(Basket, { foreignKey: "userId", as: "basket", onDelete: "CASCADE" });
Basket.belongsTo(User, { foreignKey: "userId", as: "user" });

Basket.hasMany(BasketItem, { foreignKey: "basketId", as: "items", onDelete: "CASCADE" });
BasketItem.belongsTo(Basket, { foreignKey: "basketId", as: "basket" });

Product.hasMany(BasketItem, { foreignKey: "productId", as: "basketItems", onDelete: "CASCADE" });
BasketItem.belongsTo(Product, { foreignKey: "productId", as: "product" });

User.hasMany(UserDevice, { foreignKey: 'user_id', as: 'devices', onDelete: 'CASCADE' });
UserDevice.belongsTo(User, { foreignKey: 'user_id', as: 'user', onDelete: 'CASCADE' });

User.hasMany(UserAddress, { foreignKey: "userId", as: "addresses", onDelete: "CASCADE" });
UserAddress.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });

User.hasMany(UserRating, { foreignKey: "userId", as: "ratings", onDelete: "CASCADE" });
UserRating.belongsTo(User, { foreignKey: "userId", as: "ratedUser", onDelete: "CASCADE" });
User.hasMany(UserRating, { foreignKey: "ratedByUserId", as: "givenRatings", onDelete: "CASCADE" });
UserRating.belongsTo(User, { foreignKey: "ratedByUserId", as: "ratedBy", onDelete: "CASCADE" });

User.hasMany(SearchHistory, { foreignKey: "userId", as: "searchHistory", onDelete: "CASCADE" });
SearchHistory.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });

Product.belongsTo(User, { foreignKey: "userId", as: "seller", onDelete: 'CASCADE' });
User.hasMany(Product, { foreignKey: "userId", as: "products" , onDelete: 'CASCADE'});

User.hasOne(RestaurantProfile, { foreignKey: "userId", as: "restaurantProfile", onDelete: "CASCADE" });
RestaurantProfile.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });

User.hasOne(DeliveryProfile, { foreignKey: "userId", as: "deliveryProfile", onDelete: "CASCADE" });
DeliveryProfile.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });
User.hasMany(DeliveryProfile, { foreignKey: "restaurantId", as: "deliveryEmployees", onDelete: "SET NULL" });
DeliveryProfile.belongsTo(User, { foreignKey: "restaurantId", as: "restaurant", onDelete: "SET NULL" });

Product.hasMany(ProductAddon, { foreignKey: "productId", as: "addons", onDelete: "CASCADE" });
ProductAddon.belongsTo(Product, { foreignKey: "productId", as: "product", onDelete: "CASCADE" });

User.belongsToMany(Product, { through: Favorite, foreignKey: "userId", as: "favoriteProducts" , onDelete: 'CASCADE' });
Product.belongsToMany(User, { through: Favorite, foreignKey: "productId", as: "favoritedByUsers", onDelete: 'CASCADE' });
User.hasMany(Favorite, { foreignKey: "userId", as: "productFavorites", onDelete: "CASCADE" });
Favorite.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });
User.hasMany(RestaurantFavorite, { foreignKey: "userId", as: "restaurantFavorites", onDelete: "CASCADE" });
RestaurantFavorite.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });
User.hasMany(RestaurantFavorite, { foreignKey: "restaurantId", as: "favoritedRestaurantLinks", onDelete: "CASCADE" });
RestaurantFavorite.belongsTo(User, { foreignKey: "restaurantId", as: "restaurant", onDelete: "CASCADE" });

ChatMessage.belongsTo(User, { as: "sender", foreignKey: "senderId" , onDelete: 'CASCADE'});
ChatMessage.belongsTo(User, { as: "receiver", foreignKey: "receiverId" , onDelete: 'CASCADE' });

User.hasMany(ChatMessage, { as: "sentMessages", foreignKey: "senderId" , onDelete: 'CASCADE' });
User.hasMany(ChatMessage, { as: "receivedMessages", foreignKey: "receiverId" , onDelete: 'CASCADE'});

Category.hasMany(Product, { foreignKey: "categoryId", as: "products", onDelete: "CASCADE" });
Product.belongsTo(Category, { foreignKey: "categoryId", as: "category", onDelete: "CASCADE" });

User.hasMany(Category, { foreignKey: "restaurantId", as: "restaurantCategories", onDelete: "CASCADE" });
Category.belongsTo(User, { foreignKey: "restaurantId", as: "restaurant", onDelete: "CASCADE" });

Category.hasMany(Category, { foreignKey: "parentId", as: "subcategories", onDelete: "CASCADE" });
Category.belongsTo(Category, { foreignKey: "parentId", as: "parent", onDelete: "CASCADE" });

Favorite.belongsTo(Product, { foreignKey: "productId", as: "product", onDelete: "CASCADE" });
Product.hasMany(Favorite, { foreignKey: "productId", as: "favorites", onDelete: "CASCADE" });

CouponCategory.hasMany(Coupon, { foreignKey: "couponCategoryId", as: "coupons", onDelete: "SET NULL" });
Coupon.belongsTo(CouponCategory, { foreignKey: "couponCategoryId", as: "category", onDelete: "SET NULL" });
Coupon.belongsTo(User, { foreignKey: "targetUserId", as: "targetUser", onDelete: "SET NULL" });
Coupon.belongsTo(User, { foreignKey: "restaurantId", as: "restaurant", onDelete: "SET NULL" });
Coupon.hasMany(CouponUsage, { foreignKey: "couponId", as: "usages", onDelete: "CASCADE" });
CouponUsage.belongsTo(Coupon, { foreignKey: "couponId", as: "coupon", onDelete: "CASCADE" });
User.hasMany(CouponUsage, { foreignKey: "userId", as: "couponUsages", onDelete: "CASCADE" });
CouponUsage.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });
Order.hasOne(CouponUsage, { foreignKey: "orderId", as: "couponUsage", onDelete: "SET NULL" });
CouponUsage.belongsTo(Order, { foreignKey: "orderId", as: "order", onDelete: "SET NULL" });

User.hasMany(CustomRequest, { foreignKey: "userId", as: "customRequests", onDelete: "CASCADE" });
CustomRequest.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });

Product.hasMany(ProductRecommendation, { foreignKey: "productId", as: "recommendationLinks", onDelete: "CASCADE" });
ProductRecommendation.belongsTo(Product, { foreignKey: "productId", as: "sourceProduct", onDelete: "CASCADE" });
Product.hasMany(ProductRecommendation, { foreignKey: "recommendedProductId", as: "recommendedInLinks", onDelete: "CASCADE" });
ProductRecommendation.belongsTo(Product, { foreignKey: "recommendedProductId", as: "recommendedProduct", onDelete: "CASCADE" });

module.exports = {
  User,
  UserDevice,
  UserAddress,
  UserRating,
  SearchHistory,
  Ads,
  Category,
  Product,
  Favorite,
  RestaurantFavorite,
  Basket,
  BasketItem,
  Order,
  OrderItem,
  ChatMessage,
  AppSetting,
  CouponCategory,
  Coupon,
  CouponUsage,
  Faq,
  CustomRequest,
  ProductRecommendation,
  RestaurantProfile,
  DeliveryProfile,
  ProductAddon,
};
