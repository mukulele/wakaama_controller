import axios from 'axios';

const API_BASE = 'http://localhost:3000';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting API usage example...\n');

  try {
    // Wait for server to be ready
    await delay(2000);

    console.log('📋 Listing objects...');
    const objectsResponse = await axios.get(`${API_BASE}/objects`);
    console.log('Response:', objectsResponse.data);
    await delay(1000);

    console.log('\n🌡️ Updating temperature sensor (instance 0)...');
    const sensorResponse = await axios.post(`${API_BASE}/sensor/0/value`, { 
      value: 23.5 
    });
    console.log('Response:', sensorResponse.data);
    await delay(1000);

    console.log('\n📊 Sending display command...');
    const displayResponse = await axios.post(`${API_BASE}/command`, { 
      command: 'disp' 
    });
    console.log('Response:', displayResponse.data);
    await delay(1000);

    console.log('\n📈 Updating sensor to different value...');
    const updateResponse = await axios.post(`${API_BASE}/sensor/0/value`, { 
      value: 26.8 
    });
    console.log('Response:', updateResponse.data);
    await delay(1000);

    console.log('\n🔍 Dumping sensor object...');
    const dumpResponse = await axios.post(`${API_BASE}/command`, { 
      command: 'dump /3300/0' 
    });
    console.log('Response:', dumpResponse.data);
    await delay(2000);

    console.log('\n🛑 Stopping the client...');
    const quitResponse = await axios.post(`${API_BASE}/quit`);
    console.log('Response:', quitResponse.data);

    console.log('\n✅ Example completed successfully!');

  } catch (error: any) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    if (axios.isAxiosError(error)) {
      console.error('Response:', error.response?.data);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
