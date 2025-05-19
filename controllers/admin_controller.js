const pool = require('../services/db');

const getCustomers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        COUNT(o.id) as order_count,
        SUM(o.total) as total_spent,
        MAX(o.created_at) as last_order_date
      FROM customers c
      LEFT JOIN orders o ON c.id = o.user_id
      GROUP BY c.id
      ORDER BY c.name
    `);
    
    res.json(result.rows.map(customer => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      birthday: customer.birthday,
      isVIP: customer.is_vip,
      totalOrders: parseInt(customer.order_count),
      totalSpent: customer.total_spent ? customer.total_spent / 100 : 0,
      lastOrder: customer.last_order_date
    })));
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getFoods = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        f.*,
        CASE 
          WHEN f.category = 'main' THEN 'Main Dish'
          WHEN f.category = 'side' THEN 'Side Dish'
          WHEN f.category = 'vegetable' THEN 'Vegetable'
          WHEN f.category = 'condiment' THEN 'Condiment'
          WHEN f.category = 'drink' THEN 'Drink'
        END as category_label
      FROM foods f
      ORDER BY f.category, f.name
    `);
    
    res.json(result.rows.map(food => ({
      id: food.id,
      name: food.name,
      category: food.category_label,
      price: food.price,
      discount: food.discount,
      status: food.available ? 'available' : 'unavailable',
      description: food.description
    }))); 
  } catch (err) {
    console.error('Error fetching foods:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const addFood = async (req, res) => {
  try {
    const { name, category, price, discount, status, description } = req.body;
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    await pool.query(
      `INSERT INTO foods (id, name, category, price, available, description, discount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, category, price, status === 'available', description, discount]
    );
    
    const foodsResult = await pool.query('SELECT * FROM foods ORDER BY category, name');
    /*res.json(food:{foodsResult.rows.map(food => ({
      id: food.id,
      name: food.name,
      category: food.category,
      price: food.price,
      discount: food.discount,
      status: food.available ? 'available' : 'unavailable',
      description: food.description
    }))}); */
    res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('Error adding food:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateFood = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, price } = req.body;
    const io = req.app.get('io');
    
    if (status !== undefined) {
      await pool.query('UPDATE foods SET available = $1 WHERE id = $2', [status === 'available', id]);
    }
    
    if (price !== undefined) {
      await pool.query('UPDATE foods SET price = $1 WHERE id = $2', [Math.round(price * 100), id]);
    }
    
    const foodResult = await pool.query('SELECT * FROM foods WHERE id = $1', [id]);
    if (foodResult.rows.length === 0) {
      return res.status(404).json({ error: 'Food item not found' });
    }
    
    const updatedFood = foodResult.rows[0];
    
    io.emit('food-updated', {
      id: updatedFood.id,
      name: updatedFood.name,
      price: updatedFood.price,
      available: updatedFood.available,
      status: updatedFood.available ? 'available' : 'unavailable'
    });
    
    res.json({ 
      success: true, 
      food: {
        id: updatedFood.id,
        name: updatedFood.name,
        price: updatedFood.price,
        available: updatedFood.available,
        status: updatedFood.available ? 'available' : 'unavailable'
      }
    });
  } catch (err) {
    console.error('Error updating food:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getStats = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const [statsResult, todayOrdersResult, birthdaysResult] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN payment_completed = TRUE AND status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN payment_completed = TRUE AND status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
          SUM(CASE WHEN payment_completed = TRUE AND status = 'delivering' THEN 1 ELSE 0 END) as delivering_orders,
          SUM(CASE WHEN payment_completed = TRUE AND created_at >= $1 AND status = 'completed' THEN total ELSE 0 END) as today_revenue,
          COUNT(DISTINCT user_id) as active_users
        FROM orders
        WHERE created_at >= $2 AND payment_completed = true
      `, [today, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)]),
      pool.query('SELECT COUNT(*) as count FROM orders WHERE created_at >= $1 AND payment_completed = true', [today]),
      pool.query(
        'SELECT COUNT(*) as count FROM customers WHERE EXTRACT(month FROM birthday) = $1 AND EXTRACT(day FROM birthday) = $2',
        [now.getMonth() + 1, now.getDate()]
      )
    ]);
    
    res.json({
      totalOrders: parseInt(statsResult.rows[0].total_orders),
      completedOrders: parseInt(statsResult.rows[0].completed_orders),
      pendingOrders: parseInt(statsResult.rows[0].pending_orders),
      deliveringOrders: parseInt(statsResult.rows[0].delivering_orders),
      todayOrders: parseInt(todayOrdersResult.rows[0].count),
      todayRevenue: statsResult.rows[0].today_revenue ? statsResult.rows[0].today_revenue: 0,
      activeUsers: parseInt(statsResult.rows[0].active_users),
      birthdaysToday: parseInt(birthdaysResult.rows[0].count)
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getCustomers,
  getFoods,
  addFood,
  updateFood,
  getStats
};