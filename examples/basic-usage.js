const LwM2MController = require('../src/lwm2m-controller');

async function basicExample() {
    const controller = new LwM2MController({
        // Adjust path if needed
        clientPath: '/home/pi/wakaama/my-client-project/udp/build/my-lwm2m-client',
        clientArgs: ['-h', 'lwm2m.os.1nce.com', '-p', '5683', '-4']
    });
    
    // Wait for ready state
    await new Promise((resolve) => {
        controller.on('ready', resolve);
        controller.start();
    });
    
    console.log('🎯 Running basic LwM2M operations...');
    
    // List all objects
    controller.listObjects();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update sensor value
    controller.updateSensorValue(0, 23.5);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Display all objects
    controller.displayObjects();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Stop gracefully
    controller.stop();
}

// Run if called directly
if (require.main === module) {
    basicExample().catch(console.error);
}