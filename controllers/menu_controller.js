const pool = require('../services/db');

const getMenu = async (req, res) => {
  try {
    const [foodResult, combosResult] = await Promise.all([
      pool.query(`
        SELECT 
          f.id, f.name, f.price, f.available, f.description, f.discount, f.image_url,
          f.category as category_id,
          CASE 
            WHEN f.category = 'main' THEN 'Main Dish'
            WHEN f.category = 'side' THEN 'Side Dish'
            WHEN f.category = 'vegetable' THEN 'Vegetable'
            WHEN f.category = 'condiment' THEN 'Condiment'
            WHEN f.category = 'drink' THEN 'Drink'
          END as category_label
        FROM foods f
        ORDER BY f.category, f.name
      `),
      pool.query('SELECT * FROM popular_combinations')
    ]);

    const categories = [
      { id: 'main', label: 'Main Dish', items: [] },
      { id: 'side', label: 'Side Dish', items: [] },
      { id: 'vegetable', label: 'Vegetable', items: [] },
      { id: 'condiment', label: 'Condiment', items: [] },
      { id: 'drink', label: 'Drink', items: [] }
    ];

    foodResult.rows.forEach(item => {
      const category = categories.find(c => c.id === item.category_id);
      if (category) {
        category.items.push({
          id: item.id,
          name: item.name,
          price: item.price,
          available: item.available,
          discount: item.discount,
          description: item.description,
          image: item.image_url
        });
      }
    });

    res.json({
      categories,
      popularCombinations: combosResult.rows.map(combo => ({
        name: combo.name,
        price: combo.price,
        items: combo.items,
        image: combo.image_url
      }))
    });
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getMenu };