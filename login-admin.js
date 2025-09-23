// Login admin user to get token
import axios from 'axios';

const loginAdmin = async () => {
  try {
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@printo.com',
      password: 'admin123'
    });
    
    console.log('Login successful!');
    console.log('Token:', response.data.token);
    console.log('User:', response.data.user);
    
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
  }
};

loginAdmin();