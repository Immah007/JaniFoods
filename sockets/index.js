const socketio = require('socket.io');
const pool = require('../services/db');
const jwt = require('jsonwebtoken');
const { COOKIE_NAME, JWT_SECRET } = require('../middleware/auth');

const initializeSocket = (server) => {
  const io = socketio(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true // Important for cookies
    }
  });

   // Add middleware to verify the JWT token
  io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie;
    if (!cookie) return next(new Error('No cookie found'));

    const tokenCookie = cookie.split(';').find(c => c.trim().startsWith(`${COOKIE_NAME}=`));
    if (!tokenCookie) return next(new Error('No auth token found'));

    const token = tokenCookie.split('=')[1];
    if (!token) return next(new Error('No token value found'));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded; // Attach user data to the socket
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });


  io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

     // Automatically join user to their room if they're authenticated
    if (socket.user) {
      const userId = socket.user.id;
      socket.join(`user-${userId}`);
      console.log(`User ${userId} connected and joined room user-${userId}`);
    }

    // Admin connection
    socket.on('admin-connect', async () => {
      console.log('Admin connected');
      

      try {
        const [ordersResult, customersResult, foodsResult, statsResult] = await Promise.all([
          pool.query('SELECT * FROM orders ORDER BY created_at DESC'),
          pool.query('SELECT * FROM customers'),
          pool.query('SELECT * FROM foods'),
          pool.query('SELECT COUNT(*) as total_orders FROM orders')
        ]);
        
        socket.emit('admin-init', {
          orders: ordersResult.rows,
          customers: customersResult.rows,
          menuItems: {
            categories: [
              { id: 'main', label: 'Main Dish', items: [] },
              { id: 'side', label: 'Side Dish', items: [] },
              { id: 'vegetable', label: 'Vegetable', items: [] },
              { id: 'condiment', label: 'Condiment', items: [] },
              { id: 'drink', label: 'Drink', items: [] }
            ]
          },
          stats: {
            totalOrders: parseInt(statsResult.rows[0].total_orders),
            completedOrders: 0,
            pendingOrders: 0,
            activeUsers: 0
          }
        });
      } catch (err) {
        console.error('Error sending admin init data:', err);
      }
    });

    // User connection
    socket.on('user-connect', (userId) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} connected`);
    });

    // Chat messages
    socket.on('send-message', async ({ roomId, message, sender }) => {
      const timestamp = new Date();
      const chatMessage = { text: message, sender, timestamp };
      
      try {
        const chatResult = await pool.query('SELECT * FROM chats WHERE room_id = $1', [roomId]);
        
        if (chatResult.rows.length === 0) {
          await pool.query(
            'INSERT INTO chats (room_id, messages) VALUES ($1, $2)',
            [roomId, JSON.stringify([chatMessage])]
          );
        } else {
          const messages = chatResult.rows[0].messages || [];
          messages.push(chatMessage);
          await pool.query(
            'UPDATE chats SET messages = $1, updated_at = $2 WHERE room_id = $3',
            [JSON.stringify(messages), timestamp, roomId]
          );
        }
        
        io.to(roomId).emit('new-message', { roomId, message: chatMessage });
        if (sender !== 'admin') io.emit('chat-notification', { roomId });
      } catch (err) {
        console.error('Error handling chat message:', err);
      }
    });

    //Process order
    socket.on('order-processed', async ({ orderId }) => {
      try {
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        let customerId = orderResult.rows[0].user_id;         
        
        io.to(`user-${customerId}`).emit('order-processed', { orderId, customerId, status: 'delivering', message: 'Your order has been processed'});
        //io.emit('order-processed', { orderId, customerId, status: 'delivering', message: 'SERVER: Your order has been processed'});
      } catch (err) {
        console.error('Error processing food', err);
      }
    });

    //Notify Customer their order has been delivered
    socket.on('order-delivered', async ({ orderId }) => {
      try {
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        let customerId = orderResult.rows[0].user_id;         
        
        io.to(`user-${customerId}`).emit('order-delivered', { orderId, customerId, status: 'delivered', message: 'Your order has been delivered'});
        //io.emit('order-completed', { orderId, customerId, status: 'completed', message: 'SERVER: Your order has been completed'});
      } catch (err) {
        console.error('Error completing order', err);
      }
    });
    
    //Complete Order
    socket.on('order-completed', async ({ orderId }) => {
      try {
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        let customerId = orderResult.rows[0].user_id;         
        
        io.to(`user-${customerId}`).emit('order-completed', { orderId, customerId, status: 'completed', message: 'Your order has been processed'});
        //io.emit('order-completed', { orderId, customerId, status: 'completed', message: 'SERVER: Your order has been completed'});
      } catch (err) {
        console.error('Error completing order', err);
      }
    });

    // Toggle availability
    socket.on('toggle-availability', async ({ foodId }) => {
      try {
        await pool.query(
          'UPDATE foods SET available = NOT available WHERE id = $1 RETURNING *',
          [foodId]
        );
        io.emit('refresh-menu');
      } catch (err) {
        console.error('Error toggling food availability:', err);
      }
    });

    //Delete Food Item
    socket.on('delete-food', async ({ foodId }) => {
      try {
        await pool.query(
          'DELETE FROM foods WHERE id = $1',
          [foodId]
        );
        io.emit('refresh-menu');
      } catch (err) {
        console.error('Error deleting food item', err);
      }
    });

    // Disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

module.exports = {
  initializeSocket
};
