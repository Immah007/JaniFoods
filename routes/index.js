const express = require('express');
const router = express.Router();

/*/ Import all route files
const authRoutes = require('./auth.routes');
const menuRoutes = require('./menu.routes');
const ordersRoutes = require('./orders.routes');
const adminRoutes = require('./admin.routes');*/

//Auth Routes
const { authenticate, authenticateAdmin, authenticateDelivery, authenticateForLogin } = require('../middleware/auth');

const { 
  login, 
  logout, 
  signup,
  emailConfirm,
  forgotPassword,
  passwordResetOTP,
  passwordReset,
  authStatus, 
  adminLogin, 
  deliveryLogin } = require('../controllers/auth_controller');

const { 
  getCustomers, 
  getFoods, 
  addFood, 
  updateFood, 
  getStats 
} = require('../controllers/admin_controller');

const { createOrder, handleIPNCallback, updateOrderStatus, getCustomerOrders, getAdminOrders } = require('../controllers/orders_controller');

const { getMenu } = require('../controllers/menu_controller');

router.post('/login', login);
router.post('/signup', signup);
router.post('/forgot-password', forgotPassword);
router.post('user-otp', passwordResetOTP);
router.post('/reset-password', passwordReset);
router.post('/email-confirm', emailConfirm);
router.post('/admin-login', adminLogin);
router.post('/delivery-login', deliveryLogin);
router.post('/logout', logout);
router.get('/auth/status', authenticate(), authStatus);

//Admin Routes

router.get('/admin/customers', getCustomers);
router.get('/admin/foods', getFoods);
router.post('/admin/foods', addFood);
router.put('/admin/foods/:id', updateFood);
router.get('/admin/stats', getStats);

//Order routes
//const { authenticate } = require('../middleware/auth');

router.post('/orders', authenticateForLogin(), createOrder);
router.get('/handle-ipn-callback', handleIPNCallback)
router.get('/customer/orders', authenticate(),  getCustomerOrders)
router.put('/orders-update/:id/status', updateOrderStatus);
router.get('/admin/orders', getAdminOrders);

//Menu routes


router.get('/menu', getMenu);

/*/ Use routes with appropriate prefixes
router.use('/auth', authRoutes);
router.use('/menu', menuRoutes);
router.use('/orders', ordersRoutes);
router.use('/admin', adminRoutes);*/

module.exports = router;