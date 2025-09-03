import fetch from 'node-fetch';

async function testOrderCreation() {
  const orderData = {
    orderId: 'order_' + Date.now() + '_real',
    paymentId: 'pay_' + Date.now() + '_real',
    total: 500,
    items: [
      {
        name: 'Business Cards Premium',
        quantity: 100,
        price: 500
      }
    ],
    customerName: 'Dashrath Yadav Kumar',
    customerEmail: 'dashrath@example.com',
    customerPhone: '9876543210',
    customerAddress: '123 Main Street, Sector 15',
    customerCity: 'Noida',
    customerPincode: '201301'
  };

  try {
    console.log('Creating real order with address data...');
    console.log('Order data:', JSON.stringify(orderData, null, 2));
    
    const response = await fetch('http://localhost:5000/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();
    console.log('\nResponse status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('\n✅ Order created successfully!');
      console.log('Address saved:', {
        customerAddress: result.order?.customerAddress,
        customerCity: result.order?.customerCity,
        customerPincode: result.order?.customerPincode
      });
    } else {
      console.log('\n❌ Order creation failed');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testOrderCreation();