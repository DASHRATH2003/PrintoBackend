const axios = require('axios');
const FormData = require('form-data');

// Test creating a product with color variants
async function testColorVariants() {
  try {
    // First login as admin to get token
    console.log('🔄 Logging in as admin...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@printco.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Admin login successful');
    
    // Create form data
    const formData = new FormData();
    formData.append('name', 'Test Product with Colors');
    formData.append('description', 'This is a test product with color variants');
    formData.append('price', '99.99');
    formData.append('category', 'emart');
    formData.append('subcategory', 'test');
    formData.append('colorVariants', JSON.stringify({
      layer1: 'Red',
      layer2: 'Blue',
      layer3: 'Green'
    }));
    
    console.log('🎨 Creating product with color variants...');
    const createResponse = await axios.post('http://localhost:5000/api/products', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Product created successfully!');
    console.log('📦 Product data:', JSON.stringify(createResponse.data, null, 2));
    
    // Check if color variants are saved
    if (createResponse.data.data.colorVariants) {
      console.log('🎨 Color variants saved:', createResponse.data.data.colorVariants);
    } else {
      console.log('❌ Color variants not saved!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testColorVariants();