// --- Fallback Seed Data (used when data-seed/ doesn't exist) ---
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR, readData, writeData, readConfig, writeConfig } = require('./db');
const path = require('path');

function seedDefaults() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (readData('categories.json').length === 0) {
    writeData('categories.json', [
      { id: uuidv4(), name: 'Top Sellers', color: '#e74c3c' },
      { id: uuidv4(), name: 'Local Stews', color: '#f39c12' },
      { id: uuidv4(), name: 'Breakfast', color: '#9b59b6' },
      { id: uuidv4(), name: 'Drinks', color: '#3498db' },
      { id: uuidv4(), name: 'Curries', color: '#2ecc71' }
    ]);
  }

  if (readData('menu.json').length === 0) {
    const cats = readData('categories.json');
    const catMap = {};
    cats.forEach(c => catMap[c.name] = c.id);
    writeData('menu.json', [
      { id: uuidv4(), name: 'Chips Chicken + Mango Juice', category: catMap['Top Sellers'], price: 23000, cost: 10000, active: true, menuType: 'walkin', description: 'Chips with chicken, served with mango juice' },
      { id: uuidv4(), name: 'Chips Liver + Mango Juice', category: catMap['Top Sellers'], price: 30000, cost: 14000, active: true, menuType: 'walkin', description: 'Chips with liver, served with mango juice' },
      { id: uuidv4(), name: 'Chips Goat + Mango Juice', category: catMap['Top Sellers'], price: 25000, cost: 12000, active: true, menuType: 'walkin', description: 'Chips with goat meat, served with mango juice' },
      { id: uuidv4(), name: 'Chips Beef + Mango Juice', category: catMap['Top Sellers'], price: 20000, cost: 9000, active: true, menuType: 'walkin', description: 'Chips with beef, served with mango juice' },
      { id: uuidv4(), name: 'Chips Whole Fish', category: catMap['Top Sellers'], price: 40000, cost: 20000, active: true, menuType: 'walkin', description: 'Chips with whole fried fish' },
      { id: uuidv4(), name: 'Beef Stew', category: catMap['Local Stews'], price: 12000, cost: 5000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Chicken Stew', category: catMap['Local Stews'], price: 15000, cost: 7000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Fish Stew', category: catMap['Local Stews'], price: 15000, cost: 7000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'G.Nuts Stew', category: catMap['Local Stews'], price: 7000, cost: 3000, active: true, menuType: 'walkin', description: 'Groundnut stew, served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Goat Stew', category: catMap['Local Stews'], price: 18000, cost: 9000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Offals Stew', category: catMap['Local Stews'], price: 13000, cost: 6000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Peas Stew', category: catMap['Local Stews'], price: 8000, cost: 3500, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Katogo', category: catMap['Breakfast'], price: 12000, cost: 5000, active: true, menuType: 'walkin', description: 'Traditional breakfast' },
      { id: uuidv4(), name: 'Plain Chips', category: catMap['Breakfast'], price: 10000, cost: 4000, active: true, menuType: 'walkin', description: 'French fries' },
      { id: uuidv4(), name: 'Sausages', category: catMap['Breakfast'], price: 7000, cost: 3000, active: true, menuType: 'walkin', description: 'Fried sausages' },
      { id: uuidv4(), name: 'Omelette', category: catMap['Breakfast'], price: 6000, cost: 2500, active: true, menuType: 'walkin', description: 'Egg omelette' },
      { id: uuidv4(), name: 'Chapati', category: catMap['Breakfast'], price: 4000, cost: 1500, active: true, menuType: 'walkin', description: 'Flatbread' },
      { id: uuidv4(), name: 'Juice (No Sugar)', category: catMap['Drinks'], price: 13000, cost: 5000, active: true, menuType: 'walkin', description: 'Natural juice, no added sugar' },
      { id: uuidv4(), name: 'Cocktail Juice', category: catMap['Drinks'], price: 13000, cost: 5000, active: true, menuType: 'walkin', description: 'Mixed fruit cocktail' },
      { id: uuidv4(), name: 'Mango Juice', category: catMap['Drinks'], price: 6500, cost: 2500, active: true, menuType: 'walkin', description: 'Fresh mango juice' },
      { id: uuidv4(), name: 'Beans Curry', category: catMap['Curries'], price: 5000, cost: 2000, active: true, menuType: 'community', description: 'Beans curry' },
      { id: uuidv4(), name: 'Beef Curry', category: catMap['Curries'], price: 5000, cost: 2500, active: true, menuType: 'community', description: 'Beef curry' },
      { id: uuidv4(), name: 'Peas Curry', category: catMap['Curries'], price: 6000, cost: 2500, active: true, menuType: 'community', description: 'Peas curry' },
      { id: uuidv4(), name: 'Chicken Curry', category: catMap['Curries'], price: 12000, cost: 5500, active: true, menuType: 'community', description: 'Chicken curry' },
      { id: uuidv4(), name: 'Fish Curry', category: catMap['Curries'], price: 7000, cost: 3500, active: true, menuType: 'community', description: 'Fish curry' },
      { id: uuidv4(), name: 'G.Nuts Curry', category: catMap['Curries'], price: 5000, cost: 2000, active: true, menuType: 'community', description: 'Groundnuts curry' },
      { id: uuidv4(), name: 'Pasted Beef', category: catMap['Curries'], price: 6000, cost: 3000, active: true, menuType: 'community', description: 'Pasted beef curry' },
      { id: uuidv4(), name: 'Pasted Fish', category: catMap['Curries'], price: 8000, cost: 4000, active: true, menuType: 'community', description: 'Pasted fish curry' }
    ]);
  }

  if (readData('inventory.json').length === 0) {
    writeData('inventory.json', [
      { id: uuidv4(), name: 'Chicken - Curry', unit: 'pc', quantity: 20, reorderLevel: 5, costPerUnit: 25000, standardPortions: 6, costPerPortion: 4167, category: 'Proteins' },
      { id: uuidv4(), name: 'Chicken - Fast Food', unit: 'pc', quantity: 15, reorderLevel: 5, costPerUnit: 14000, standardPortions: 4, costPerPortion: 3500, category: 'Proteins' },
      { id: uuidv4(), name: 'Beef', unit: 'kg', quantity: 20, reorderLevel: 5, costPerUnit: 18000, standardPortions: 10, costPerPortion: 1800, category: 'Proteins' },
      { id: uuidv4(), name: 'Fish', unit: 'pc', quantity: 15, reorderLevel: 5, costPerUnit: 15000, standardPortions: 4, costPerPortion: 3750, category: 'Proteins' },
      { id: uuidv4(), name: 'Groundnuts (kg)', unit: 'kg', quantity: 10, reorderLevel: 3, costPerUnit: 8000, category: 'Dry Goods' },
      { id: uuidv4(), name: 'Matooke (bunch)', unit: 'bunch', quantity: 8, reorderLevel: 3, costPerUnit: 10000, category: 'Fresh Produce' },
      { id: uuidv4(), name: 'Rice (kg)', unit: 'kg', quantity: 25, reorderLevel: 10, costPerUnit: 4000, category: 'Dry Goods' },
      { id: uuidv4(), name: 'Maize Flour (kg)', unit: 'kg', quantity: 20, reorderLevel: 5, costPerUnit: 3000, category: 'Dry Goods' },
      { id: uuidv4(), name: 'Cooking Oil (L)', unit: 'liters', quantity: 15, reorderLevel: 5, costPerUnit: 7000, category: 'Cooking Essentials' },
      { id: uuidv4(), name: 'Onions (kg)', unit: 'kg', quantity: 10, reorderLevel: 3, costPerUnit: 4000, category: 'Fresh Produce' },
      { id: uuidv4(), name: 'Tomatoes (kg)', unit: 'kg', quantity: 8, reorderLevel: 3, costPerUnit: 5000, category: 'Fresh Produce' },
      { id: uuidv4(), name: 'Eggs (tray)', unit: 'tray', quantity: 5, reorderLevel: 2, costPerUnit: 12000, category: 'Proteins' },
      { id: uuidv4(), name: 'Passion Fruits (kg)', unit: 'kg', quantity: 5, reorderLevel: 2, costPerUnit: 6000, category: 'Fresh Produce' },
      { id: uuidv4(), name: 'Sugar (kg)', unit: 'kg', quantity: 10, reorderLevel: 3, costPerUnit: 4000, category: 'Dry Goods' },
      { id: uuidv4(), name: 'Milk (L)', unit: 'liters', quantity: 10, reorderLevel: 3, costPerUnit: 3000, category: 'Dairy' },
      { id: uuidv4(), name: 'Wheat Flour (kg)', unit: 'kg', quantity: 15, reorderLevel: 5, costPerUnit: 4000, category: 'Dry Goods' }
    ]);
  }

  if (readData('portion-map.json').length === 0) {
    writeData('portion-map.json', [
      { menuItemName: 'Chicken Curry', stockItemName: 'Chicken - Curry', portionsUsed: 1 },
      { menuItemName: 'Beef Curry', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Fish Curry', stockItemName: 'Fish', portionsUsed: 1 },
      { menuItemName: 'Pasted Beef', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Pasted Fish', stockItemName: 'Fish', portionsUsed: 1 },
      { menuItemName: 'Chips Chicken + Mango Juice', stockItemName: 'Chicken - Fast Food', portionsUsed: 1 },
      { menuItemName: 'Chicken Stew', stockItemName: 'Chicken - Curry', portionsUsed: 1 },
      { menuItemName: 'Beef Stew', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Fish Stew', stockItemName: 'Fish', portionsUsed: 1 },
      { menuItemName: 'Goat Stew', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Chips Beef + Mango Juice', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Chips Whole Fish', stockItemName: 'Fish', portionsUsed: 1 },
      { menuItemName: 'Chips Goat + Mango Juice', stockItemName: 'Beef', portionsUsed: 1 }
    ]);
  }

  if (readData('vendors.json').length === 0) {
    writeData('vendors.json', [
      { id: uuidv4(), name: 'Entebbe Fish Market', phone: '+256700000001', items: ['Tilapia', 'Nile Perch'], rating: 4, notes: 'Best fresh fish, delivers by 7am' },
      { id: uuidv4(), name: 'Kitooro Market Vendor', phone: '+256700000002', items: ['Vegetables', 'Fruits', 'Matooke'], rating: 4, notes: 'Daily fresh produce' },
      { id: uuidv4(), name: 'Mama Grace Poultry', phone: '+256700000003', items: ['Chicken', 'Eggs'], rating: 5, notes: 'Reliable, consistent quality' }
    ]);
  }

  if (readData('staff.json').length === 0) {
    writeData('staff.json', [
      { id: uuidv4(), name: 'Admin', role: 'manager', pin: '1234', active: true },
      { id: uuidv4(), name: 'Waiter 1', role: 'waiter', pin: '1111', active: true },
      { id: uuidv4(), name: 'Chef', role: 'kitchen', pin: '2222', active: true },
      { id: uuidv4(), name: 'Cashier', role: 'cashier', pin: '3333', active: true }
    ]);
  }

  if (!fs.existsSync(path.join(DATA_DIR, 'settings.json'))) {
    writeConfig('settings.json', {
      restaurantName: "AD's Kitchen",
      location: 'Kitooro, Entebbe',
      phone: '+256 784 313399',
      email: 'adskitchen323@gmail.com',
      currency: 'UGX',
      taxRate: 0,
      tables: 10,
      receiptFooter: 'Thank you for dining at AD\'s Kitchen!\nKitooro, Entebbe | +256 784 313399'
    });
  }
}

module.exports = seedDefaults;
