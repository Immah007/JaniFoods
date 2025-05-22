const pool = require('../services/db');
const path = require('path');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { Socket } = require('socket.io');

//Setup Email sending route, configured with Zoho...
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',  // Zoho SMTP server
  port: 465,              // SSL port
  secure: true,           // Use SSL/TLS
  auth: {
    user: 'no-reply@shopjani.com',  // Your Zoho email address
    pass: 'yqY7xb#007',  // Your Zoho email password or App Password (if using 2FA)
  },
});

//Setup PesaPal payment credentials and links...
const consumerKey = 'ma4e6oJ36F51bLHBxAsD+M8Z0Tte+Jca'; // Replace with your actual production consumer key
const consumerSecret = 'xH/hnMKWVUVxIK7oQ9ea44Dl8T4=';
const pesapalAuthUrl = 'https://pay.pesapal.com/v3/api/Auth/RequestToken';
const pesapalSubmitOrderUrl = 'https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest';
const pesapalTransactionStatusUrl = 'https://pay.pesapal.com/v3/api/Transactions/GetTransactionStatus';
// Function to retrieve Pesapal access token
const getPesapalAccessToken = async () => {
  try {
    const response = await axios.post(
      pesapalAuthUrl,
      { consumer_key: consumerKey, consumer_secret: consumerSecret },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('Access Token Response:', response.data);
    return response.data.token; // Returns access token
  } catch (error) {
    console.error('Error fetching access token:', error.response?.data || error.message);
    throw new Error('Failed to retrieve access token');
  }
};


const createOrder = async (req, res) => {
  const orderData = req.body;
  const io = req.app.get('io');


  try {
    // Process cart items into the required format
    const cartItems = orderData.cart.map(cartItem => ({
      selection: cartItem.selection.map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price, // Convert to cents
        discount: item.discount, // Convert to cents
        quantity: item.quantity
      })),
      quantity: cartItem.quantity
    }));

    // Calculate totals
    const subtotal = cartItems.reduce((sum, cartItem) => {
      return sum + cartItem.selection.reduce((itemSum, item) => {
        return itemSum + ((item.price - item.discount) * item.quantity * cartItem.quantity);
      }, 0);
    }, 0);

    const deliveryFee = 150; // 150 KSh in cents
    const total = subtotal;
    const total_paid = subtotal + deliveryFee;

    // Get Pesapal access token
    const accessToken = await getPesapalAccessToken();

    const order = {
      id: `JKN-${Date.now().toString().slice(-4)}`,
      amount: total_paid,
      user_id: req.user?.id || 'guest',
      firstname: req.user.firstname,
      lastname: req.user.lastname,
      phone: orderData.phone || '-',
      email: req.user?.email || 'not found',
      total,
      payment_completed: false,
      is_birthday: orderData.isBirthday || false,
      items: cartItems,
      address: orderData.deliveryAddress || '-',
      instructions: orderData.deliveryInstructions || '',
      payment_method: orderData.paymentMethod,
      transaction_code: 'MPE' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      status: 'pending',
      delivery_fee: deliveryFee,
      time: new Date().toTimeString().split(' ')[0],
      date: new Date().getDate(),
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      totalPaid: total_paid
    };


    //Pesapal Request Object
    const paymentData = {
      id: `JKN-${Date.now().toString().slice(-4)}`,
      currency: 'KES',
      amount: 1, //total_paid,
      description: 'Payment for purchase...',
      callback_url: 'https://janifoods.onrender.com/api/handle-ipn-callback',
      notification_id: 'a692d54c-e565-4857-8aea-dbca68fc4bf0',
      branch: 'Store Name - HQ',
      billing_address: {
        email_address: req.user?.email,
        phone_number: req.user?.phone,
        country_code: 'KE',
        first_name: req.user?.firstname,
        middle_name: '',
        last_name: req.user?.lastname,
        delivery_method: 'delivery_method',
        delivery_location: 'delivery_location',
        line_1: 'Pesapal Limited',
        line_2: '',
        city: '',
        state: '',
        postal_code: '',
        zip_code: ''
      }
    };

    // Submit payment request to Pesapal
    const response = await axios.post(
      pesapalSubmitOrderUrl,
      paymentData,
      {
        withCredentials: true, // This ensures cookies (including session) are sent with the request 
        headers: {
          Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json'
        }
      }
    );

    console.log('PESAPA: ' + Object.keys(response.data))
    if (response.data.status === '200') {


      console.log(`MERCHANT REF: ${response.data.merchant_reference}`);
      console.log(`TRACKING ID: ${response.data.order_tracking_id}`);
      const orderTrackingId = response.data.order_tracking_id;

      await pool.query(
        `INSERT INTO orders (
        id, user_id, firstname, lastname, phone, email, total, payment_completed,
        is_birthday, items, address, instructions, status, delivery_fee, time, date, month, year, order_tracking_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          order.id, order.user_id, order.firstname, order.lastname, order.phone, order.email,
          order.total, order.payment_completed, order.is_birthday, JSON.stringify(order.items),
          order.address, order.instructions, order.status, order.delivery_fee, order.time, order.date, order.month, order.year, orderTrackingId
        ]
      );
    };

    //io.emit('new-order', order);

    // Notify the specific user about their order
    if (orderData.userId) {
      io.to(`user-${orderData.userId}`).emit('order-confirmation', {
        orderId: order.id,
        status: 'pending',
        total: order.total
      });
    }

    res.json({
      success: true,
      redirectUrl: response.data.redirect_url,
      orderId: order.id,
      message: 'Please complete the payment to finalise your order',
      order: {
        ...order,
        total: order.total / 100,
        delivery_fee: order.delivery_fee / 100,
        items: order.items.map(item => ({
          ...item,
          price: item.price / 100,
          discount: item.discount / 100
        }))
      }
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


// IPN Callback Endpoint (handles the IPN notification from Pesapal)
const handleIPNCallback = async (req, res) => {
  const io = req.app.get('io');
  try {
    const notification = req.query; // Get the query parameters sent by Pesapal
    console.log('Received IPN notification:', Object.keys(notification));

    const { OrderTrackingId, OrderMerchantReference } = notification; // Extract tracking and merchant reference IDs


    // Step 1: Get the Pesapal access token
    const accessToken = await getPesapalAccessToken();

    // Step 2: Make a GET request to check the transaction status
    const statusResponse = await axios.get(
      `${pesapalTransactionStatusUrl}?orderTrackingId=${OrderTrackingId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Transaction Status Response:', statusResponse.data);

    // Step 3: Check if the transaction was successful
    if (statusResponse.data.status === '200') {

      const transactionDetails = statusResponse.data;
      const orderTrackRef = transactionDetails.order_tracking_id;
      /*const followUpDataQuery = 'SELECT * FROM orders_unified WHERE order_track_reference = $1';
      const followUpDataResult = await pool.query(followUpDataQuery, [orderTrackRef]); 
      const confirmatoryData = followUpDataResult.rows;
     // const idCheckQuery = 'SELECT * FROM orders_unified WHERE order_db_id = $1';*/


      function generateRandomString(length) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        const charactersLength = characters.length;

        for (let i = 0; i < length; i++) {
          result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }

        return result;
      }


      let deliveryCode = generateRandomString(7);


      const paymentCompleted = true;
      const paymentMethod = transactionDetails.payment_method || 'Unknown';
      const transactionCode = transactionDetails.confirmation_code;
      const merchantReference = transactionDetails.merchant_reference;
      const orderTrackingId = transactionDetails.order_tracking_id;
      const now = new Date().toTimeString().split(' ')[0];
      const today = new Date().getDate();
      const thisMonth = new Date().getMonth();
      const thisYear = new Date().getFullYear();
      const amountPaid = transactionDetails.amount || 0;





      await pool.query(
        `UPDATE orders SET payment_completed = $1, payment_method =$2, transaction_code = $3, time = $4, date = $5, month = $6, year = $7, total_paid = $8, delivery_code = $9 WHERE order_tracking_id = $10`,
        [paymentCompleted, paymentMethod, transactionCode, now, today, thisMonth, thisYear, amountPaid, orderTrackingId, deliveryCode]
      );

      const completeOrderData = await pool.query(
        `SELECT * FROM orders WHERE order_tracking_id = $1`, [orderTrackingId]
      );

      const completeOrder = completeOrderData.rows[0];


      const order = {
        id: completeOrder.id,
        amount: completeOrder.total_paid,
        user_id: completeOrder.user_id,
        firstname: completeOrder.first_name || 'unclassified',
        lastname: completeOrder.last_name || 'unclassified',
        phone: completeOrder.phone,//orderData.phone || '-',
        email: completeOrder.email,//req.user?.email || 'not found',
        total: completeOrder.total,
        payment_completed: completeOrder.payment_completed,
        is_birthday: completeOrder.is_birthday,//orderData.isBirthday || false,
        items: completeOrder.items,
        address: completeOrder.address,
        instructions: completeOrder.delivery_instructions || '',
        payment_method: completeOrder.paymentMethod,
        transaction_code: completeOrder.transaction_code,//'MPE' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        status: completeOrder.status,//'pending',
        delivery_fee: completeOrder.delivery_fee, ///deliveryFee,
        time: completeOrder.time, // new Date().toTimeString().split(' ')[0],
        date: completeOrder.date, //new Date().getDate(),
        month: completeOrder.month, //new Date().getMonth() + 1,
        year: completeOrder.year,//new Date().getFullYear(),
        totalPaid: completeOrder.total_paid
      };

      io.emit('new-order', order);




      //await db.query('UPDATE orders SET status = $1 WHERE order_id = $2', ['Paid', orderId]);



      //Send Notification email....
      const trackingUrl = 'https://shopjani.com/shop';
      const supportEmail = 'support@shopease.com';
      const mailOptions = {
        from: '"JaniFoods" <no-reply@shopjani.com>',
        to: 'naiunicode@gmail.com', //email,
        subject: 'Your Order is Confirmed Successfully!',
        html: `Thank you ${completeOrder.first_name}...`
      };

      // Send the Confirmation email
      await transporter.sendMail(mailOptions);


      console.log(`Transaction inserted successfully for Order ID: ${OrderTrackingId}`);

      io.emit('payment-successful');
      //res.send(`the tanks popup pof successful payment`);
      res.redirect('/');

      //Now Notify Vendor via email that there is a new order down here so they can start preparing delivery.......


    } else {
      console.log('Payment failed or pending');
      res.send('Payment failed or pending');
      io.emit('payment-unsuccessful');
    }
  } catch (error) {
    console.error('Error handling IPN callback:', error.message || error);
    res.status(500).send('Error processing IPN callback ' + `Error:${error}`);
  }
};





const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const io = req.app.get('io');

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const currentStatus = orderResult.rows[0].status;
  
    if(currentStatus !== 'completed') {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    }
    const updatedOrder = (await pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];

    // Convert prices back to decimal for frontend
    const orderWithDecimalPrices = {
      ...updatedOrder,
      total: updatedOrder.total / 100,
      delivery_fee: updatedOrder.delivery_fee / 100,
      items: updatedOrder.items.map(item => ({
        ...item,
        price: item.price / 100,
        discount: item.discount / 100
      }))
    };

    // Notify the user who placed this order
    if (updatedOrder.user_id) {
      io.to(`user-${updatedOrder.user_id}`).emit('order-status-update', {
        orderId: id,
        status,
        order: orderWithDecimalPrices
      });
    }

    // Notify admin dashboard
    io.emit('order-updated', orderWithDecimalPrices);

    res.json({
      success: true,
      order: orderWithDecimalPrices
    });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getCustomerOrders = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const ordersResult = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 AND payment_completed = true ORDER BY created_at DESC',
      [customerId]
    );

    const orders = ordersResult.rows.map(order => ({
      ...order,
      total: order.total,
      delivery_fee: order.delivery_fee,
      items: order.items.map(item => ({
        ...item,
        price: item.price,
        discount: item.discount
      }))
    }));

    res.json({
      success: true,
      orders
    });
  } catch (err) {
    console.error('Error fetching customer orders:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getAdminOrders = async (req, res) => {
  try {
    const [ordersResult, statsResult] = await Promise.all([
      pool.query('SELECT * FROM orders WHERE payment_completed = true ORDER BY created_at DESC'),
      pool.query(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN payment_completed = TRUE AND  status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN payment_completed = TRUE AND status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
          SUM(CASE WHEN payment_completed = TRUE AND status = 'delivering' THEN 1 ELSE 0 END) as delivering_orders,
          SUM(CASE WHEN payment_completed = TRUE THEN 1 ELSE 0 END) as paid_orders
        FROM orders 
        WHERE payment_completed = true
      `)
    ]);

    const orders = ordersResult.rows.map(order => ({
      ...order,
      total: order.total,
      delivery_fee: order.delivery_fee,
      items: order.items.map(item => ({
        ...item,
        price: item.price,
        discount: item.discount
      }))
    }));

    res.json({
      success: true,
      orders,
      stats: {
        totalOrders: parseInt(statsResult.rows[0].total_orders),
        completedOrders: parseInt(statsResult.rows[0].completed_orders),
        pendingOrders: parseInt(statsResult.rows[0].pending_orders),
        deliveringOrders: parseInt(statsResult.rows[0].delivering_orders),
        paidOrders: parseInt(statsResult.rows[0].paid_orders)
      }
    });
  } catch (err) {
    console.error('Error fetching admin orders:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createOrder,
  handleIPNCallback,
  updateOrderStatus,
  getCustomerOrders,
  getAdminOrders
};
